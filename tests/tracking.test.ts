/**
 * !rastreio com a API do Site Rastreio / Wonca Labs: requisição conforme a documentação, leitura do
 * formato dos Correios, cache de 30 min, limite diário por pessoa e erros (chave, cota, rede).
 */
import { test, before, afterEach, mock } from "node:test"
import assert from "node:assert/strict"
import axios from "axios"
import { fakeClient, setupBot, send, user, OWNER } from "./helpers/harness.js"
import * as track from "../src/utils/tracking.util.js"

const P = user(9901), Q = user(9902)
const CODE = "AA123456785BR"

/** Resposta no formato público dos Correios (objetos → eventos, mais recente primeiro). */
const correiosPayload = {
  objetos: [{
    codObjeto: CODE,
    tipoPostal: { categoria: "SEDEX", descricao: "SEDEX" },
    dtPrevista: "2026-11-20T23:59:59",
    eventos: [
      { codigo: "OEC", descricao: "Objeto saiu para entrega ao destinatário", dtHrCriado: "2026-11-19T08:12:00", unidade: { tipo: "Unidade de Distribuição", endereco: { cidade: "PARNAIBA", uf: "PI" } } },
      { codigo: "RO", descricao: "Objeto em transferência - por favor aguarde", dtHrCriado: "2026-11-18T14:03:00", unidade: { tipo: "Unidade de Tratamento", endereco: { cidade: "TERESINA", uf: "PI" } }, unidadeDestino: { tipo: "Unidade de Distribuição", endereco: { cidade: "PARNAIBA", uf: "PI" } } },
      { codigo: "PO", descricao: "Objeto postado", dtHrCriado: "2026-11-17T10:30:00", unidade: { tipo: "Agência dos Correios", endereco: { cidade: "SAO PAULO", uf: "SP" } } },
    ],
  }],
}

before(async () => { await setupBot() })
afterEach(() => { mock.restoreAll(); track.clearTrackingState(); delete process.env.RASTREIO_API_KEY; delete process.env.RASTREIO_LIMITE_DIA })

test("rastreio: lê o formato dos Correios (objeto ou texto JSON) e procura eventos em formato diferente", () => {
  const r = track.parseTrackingPayload(correiosPayload, CODE)
  assert.equal(r.events.length, 3)
  assert.equal(r.category, "SEDEX")
  assert.deepEqual(r.events[0], { date: "2026-11-19T08:12:00", description: "Objeto saiu para entrega ao destinatário", detail: undefined, location: "Unidade de Distribuição - PARNAIBA/PI", destination: undefined })
  assert.equal(r.events[1].destination, "Unidade de Distribuição - PARNAIBA/PI")
  assert.equal(track.parseTrackingPayload(JSON.stringify(correiosPayload), CODE).events.length, 3, "payload como texto JSON")
  const generic = track.parseTrackingPayload({ data: { history: [{ status: "Em trânsito", date: "2026-11-18", location: "Curitiba" }] } }, CODE)
  assert.equal(generic.events[0].description, "Em trânsito")
  assert.equal(generic.events[0].location, "Curitiba")
  const notFound = track.parseTrackingPayload({ objetos: [{ codObjeto: CODE, mensagem: "SRO-020: Objeto não encontrado na base de dados dos Correios." }] }, CODE)
  assert.equal(notFound.events.length, 0)
  assert.match(notFound.message!, /SRO-020/)
})

test("!rastreio com chave: envia como na documentação e mostra situação atual e histórico", async () => {
  process.env.RASTREIO_API_KEY = "CHAVE-TESTE"
  const calls: { url: string, body: unknown, headers: Record<string, string> }[] = []
  mock.method(axios, "post", async (url: string, body: unknown, cfg: { headers: Record<string, string> }) => {
    calls.push({ url, body, headers: cfg.headers })
    return { data: { carrier: "CARRIER_CORREIOS", payload: correiosPayload } }
  })
  const f = fakeClient()
  await send(f, { from: P, text: `!rastreio ${CODE.toLowerCase()}` })
  assert.equal(calls[0].url, "https://api.wonca.com.br/wonca.labs.v1.LabsService/Track")
  assert.deepEqual(calls[0].body, { code: CODE, carrier: "CARRIER_CORREIOS" })
  assert.equal(calls[0].headers.Authorization, "Apikey CHAVE-TESTE")
  assert.equal(calls[0].headers["Content-Type"], "application/json")
  const out = f.output()
  assert.match(out, /Rastreio AA123456785BR[\s\S]*SEDEX[\s\S]*Situação atual:\* Objeto saiu para entrega ao destinatário[\s\S]*PARNAIBA\/PI[\s\S]*19\/11\/2026 08:12/)
  assert.match(out, /Previsão de entrega: 20\/11\/2026/)
  assert.match(out, /Histórico[\s\S]*18\/11\/2026 14:03 — Objeto em transferência[\s\S]*TERESINA\/PI → Unidade de Distribuição - PARNAIBA\/PI[\s\S]*Objeto postado/)

  // Mesmo código de novo (até de outra pessoa): vem do cache, não gasta consulta
  f.reset()
  await send(f, { from: Q, text: `!rastreio ${CODE}` })
  assert.equal(calls.length, 1)
  assert.match(f.output(), /Situação atual/)
})

test("!rastreio: código com dígito errado não gasta consulta; sem chave continua só com o link", async () => {
  const post = mock.method(axios, "post", async () => ({ data: {} }))
  const f = fakeClient()
  await send(f, { from: P, text: `!rastreio ${CODE}` })
  assert.match(f.output(), /Código válido[\s\S]*rastreamento\.correios\.com\.br/)
  process.env.RASTREIO_API_KEY = "K"
  f.reset()
  await send(f, { from: P, text: "!rastreio AA123456784BR" })
  assert.match(f.output(), /dígito verificador não confere/)
  assert.equal(post.mock.callCount(), 0)
})

test("!rastreio: limite diário por pessoa (admins do bot sem limite) e erros da API explicados", async () => {
  process.env.RASTREIO_API_KEY = "K"
  process.env.RASTREIO_LIMITE_DIA = "1"
  let answer: () => unknown = () => ({ data: { payload: { objetos: [{ codObjeto: "x", mensagem: "SRO-020: Objeto não encontrado na base de dados dos Correios." }] } } })
  mock.method(axios, "post", async () => answer())
  const f = fakeClient()
  await send(f, { from: P, text: "!rastreio AA123456785BR" })
  assert.match(f.output(), /SRO-020/)
  f.reset()
  await send(f, { from: P, text: "!rastreio QB123456785BR" })
  assert.match(f.output(), /já fez 1 consultas de rastreio novas hoje/)
  f.reset()
  await send(f, { from: OWNER, text: "!rastreio QB123456785BR" })
  assert.doesNotMatch(f.output(), /já fez/, "admin do bot não tem limite")

  const axiosErr = (status: number, data: unknown) => Object.assign(new Error("x"), { isAxiosError: true, response: { status, data } })
  for (const [status, data, expected] of [
    [401, { code: "unauthenticated" }, /chave da API de rastreio é inválida/],
    [429, { code: "resource_exhausted" }, /Acabaram as consultas de rastreio deste mês/],
    [503, {}, /não respondeu/],
  ] as const) {
    answer = () => { throw axiosErr(status, data) }
    f.reset()
    await send(f, { from: OWNER, text: "!rastreio RR123456785BR" })
    assert.match(f.output(), expected)
    assert.match(f.output(), /rastreamento\.correios\.com\.br/, "sempre oferece o link oficial")
  }
})

// ———————————————— !noticias (feed do g1 mudou de formato) ————————————————
test("!noticias: lê o RSS do g1 sem CDATA, ignora 'ao vivo'/vídeos e usa o Google Notícias se o g1 falhar", async () => {
  const { AutomationService } = await import("../src/services/automation.service.js")
  const g1 = `<?xml version='1.0' encoding='UTF-8'?><rss version="2.0"><channel><title>g1</title><link>https://g1.globo.com/</link>
    <item><title>TV Integração ao vivo: assista aos telejornais</title><link>https://g1.globo.com/mg/ao-vivo/tv.ghtml</link></item>
    <item><title>Assista ao Boa Noite Espírito Santo</title><link>https://g1.globo.com/es/ao-vivo/x.ghtml</link></item>
    <item><title>VÍDEOS: RJ2 de quarta-feira</title><link>https://g1.globo.com/rj/videos/x.ghtml</link></item>
    <item><title>Piauí promove 700 policiais militares</title><link>https://g1.globo.com/pi/piaui/noticia/2026/11/18/pm.ghtml</link></item>
    <item><title><![CDATA[Formato antigo com CDATA]]></title><link>https://g1.globo.com/economia/noticia/2026/11/18/x.ghtml</link></item>
  </channel></rss>`
  mock.method(axios, "get", async (url: string) => {
    assert.equal(url, "https://g1.globo.com/rss/g1/")
    return { data: g1 }
  })
  const msg = await AutomationService.getInstance().fetchNews()
  assert.match(msg, /NOTÍCIAS DO MOMENTO \(G1\)[\s\S]*Piauí promove 700 policiais militares[\s\S]*Formato antigo com CDATA/)
  assert.doesNotMatch(msg, /ao vivo|Boa Noite|VÍDEOS/)

  mock.restoreAll()
  mock.method(axios, "get", async (url: string) => {
    if (url.includes("g1.globo.com")) throw new Error("fora do ar")
    return { data: `<rss><channel><item><title>Manchete - Fonte X</title><link>https://news.google.com/a</link><source>Fonte X</source><pubDate>Wed, 18 Nov 2026 20:00:00 GMT</pubDate></item></channel></rss>` }
  })
  const log = mock.method(console, "log", () => undefined)
  const fallback = await AutomationService.getInstance().fetchNews()
  log.mock.restore()
  assert.match(fallback, /NOTÍCIAS DO MOMENTO \(Google Notícias\)[\s\S]*\*Manchete\* _\(Fonte X\)_[\s\S]*news\.google\.com\/a/)
})
