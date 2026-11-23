/**
 * Utilitários que dependem de serviços externos (utils/misc.util.ts) com respostas simuladas:
 * conferem o tratamento dos dados e o caminho de erro, sem acessar a internet.
 */
import { test, before, afterEach, mock } from "node:test";
import assert from "node:assert/strict";
import axios from "axios";
import * as misc from "../src/utils/misc.util.js";
import * as image from "../src/utils/image.util.js";
import botTexts from "../src/helpers/bot.texts.helper.js";
import { fakeClient, setupBot, send, user } from "./helpers/harness.js";

const respond = (routes: Record<string, unknown>) => async (url: string) => {
  for (const [part, data] of Object.entries(routes)) if (url.includes(part)) return { data, headers: {} };
  throw new Error(`rota não simulada: ${url}`);
};
afterEach(() => mock.restoreAll());
before(() => setupBot());

test("calcExpression: normaliza operadores e formata o resultado", async () => {
  const post = mock.method(axios, "post", async (_u: string, body: { expr: string }) => ({ data: { result: body.expr === "2*3.5/1" ? "7" : "1.5e+21 m" } }));
  assert.equal(await misc.calcExpression("2x3,5÷1"), "7");
  assert.deepEqual(post.mock.calls[0].arguments[1], { expr: "2*3.5/1" });
  assert.equal(await misc.calcExpression("muito grande"), "1500000000000000000000 m", "notação científica vira número por extenso");
  post.mock.mockImplementation(async () => ({ data: { result: "Infinity" } }));
  assert.equal(await misc.calcExpression("1/0"), null);
  post.mock.mockImplementation(async () => { throw new Error("timeout") });
  await assert.rejects(misc.calcExpression("1+1"), new RegExp(botTexts.library_error.slice(0, 20).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
});

test("convertCurrency: converte e formata cada moeda", async () => {
  mock.method(axios, "get", respond({ "USD-BRL": {
    USDBRL: { codein: "BRL", name: "Dólar/Real", bid: "5.00", create_date: "2026-11-17 10:30:00" },
    USDEUR: { codein: "EUR", name: "Dólar/Euro", bid: "0.90", create_date: "2026-11-17 10:30:00" },
  } }));
  const r = await misc.convertCurrency("dolar", 10);
  assert.equal(r.value, 10);
  assert.deepEqual(r.convertion.map(c => c.value_converted_formatted), ["R$ 50.00", "Є 9.00"]);
  assert.equal(r.convertion[0].updated, "17/11/2026 às 10:30:00");
});

test("infoDDD: encontra estado e região; DDD inexistente devolve null", async () => {
  mock.method(axios, "get", respond({ "ddd.json": { estados: [{ ddd: ["11", "12"], nome: "São Paulo", regiao: "Sudeste" }] } }));
  assert.deepEqual(await misc.infoDDD("11"), { state: "São Paulo", region: "Sudeste" });
  assert.equal(await misc.infoDDD("99"), null);
});

test("wheatherInfo: monta clima atual e previsão em português", async () => {
  const conditions = [{ code: 1000, day_text: "Sol", night_text: "Céu limpo", languages: [{ lang_iso: "pt", day_text: "Ensolarado", night_text: "Limpo" }] }];
  const forecastday = [{ date: "2026-11-17", day: { condition: { code: 1000 }, maxtemp_c: 30, mintemp_c: 20, avgtemp_c: 25, maxwind_kph: 10, daily_will_it_rain: 0, daily_chance_of_rain: 5, daily_will_it_snow: 0, daily_chance_of_snow: 0, uv: 7 } }];
  mock.method(axios, "get", respond({
    "conditions.json": conditions,
    "forecast.json": { location: { name: "Recife", region: "PE", country: "Brasil", localtime_epoch: 1700000000 }, current: { last_updated_epoch: 1700000000, temp_c: 28, feelslike_c: 30, condition: { code: 1000 }, is_day: 1, wind_kph: 12, humidity: 70, cloud: 10 }, forecast: { forecastday } },
  }));
  const w = await misc.wheatherInfo("Recife");
  assert.equal(w.location.name, "Recife");
  assert.equal(w.current.temp, "28 C°");
  assert.equal(w.current.condition, "Ensolarado");
  assert.deepEqual([w.forecast[0].day, w.forecast[0].max, w.forecast[0].rain, w.forecast[0].uv], ["17/11/2026", "30 C°", "Não", 7]);
});

test("webSearch: resultados do Bing com o link real decodificado; sem resultados, usa a Wikipédia", async () => {
  const real = "https://exemplo.com/a";
  const encoded = "a1" + Buffer.from(real).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  const html = `<ol><li class="b_algo"><h2><a href="https://www.bing.com/ck/a?!&&p=x&u=${encoded}&ntb=1">Exemplo A</a></h2><div class="b_caption"><p>Descrição A</p></div></li>
    <li class="b_algo"><h2><a href="https://site.org/b">Site B</a></h2></li></ol>`;
  mock.method(axios, "get", respond({ "bing.com/search": html }));
  assert.deepEqual(await misc.webSearch("teste"), [
    { title: "Exemplo A", url: real, description: "Descrição A" },
    { title: "Site B", url: "https://site.org/b", description: null },
  ]);
  mock.method(axios, "get", respond({ "bing.com/search": "<html></html>", "wikipedia.org": { pages: [{ key: "Bolo_de_cenoura", title: "Bolo de cenoura", description: "bolo" }] } }));
  assert.deepEqual(await misc.webSearch("bolo de cenoura"), [{ title: "Bolo de cenoura", url: "https://pt.wikipedia.org/wiki/Bolo_de_cenoura", description: "bolo" }]);
});

test("translateText (MyMemory): detecção automática, textos longos em partes e erro de cota", async () => {
  const urls: string[] = [];
  mock.method(axios, "get", async (url: string) => { urls.push(url); return { data: { responseStatus: 200, responseData: { translatedText: `parte${urls.length}` } } }; });
  assert.equal(await misc.translateText("Hello", "pt"), "parte1");
  assert.match(decodeURIComponent(urls[0]), /langpair=autodetect\|pt-BR/);
  urls.length = 0;
  const longo = "Frase de teste. ".repeat(80);
  assert.equal(await misc.translateText(longo, "en"), "parte1 parte2 parte3");
  assert.ok(urls.every(u => decodeURIComponent(u.split("q=")[1].split("&")[0]).length <= 450), "cada parte tem até 450 caracteres");
  mock.method(axios, "get", async () => ({ data: { responseStatus: 429, responseDetails: "MYMEMORY WARNING: YOU USED ALL AVAILABLE FREE TRANSLATIONS", responseData: { translatedText: "MYMEMORY WARNING" } } }));
  await assert.rejects(misc.translateText("Hello", "pt"));
});

test("musicLyrics (LRCLIB + capa do iTunes); instrumental ou sem letra devolve null", async () => {
  mock.method(axios, "get", respond({
    "lrclib.net": [{ trackName: "Inst", artistName: "X", instrumental: true, plainLyrics: null }, { trackName: "Canção", artistName: "Banda", instrumental: false, plainLyrics: " Linha 1\nLinha 2 " }],
    "itunes.apple.com": { results: [{ artworkUrl100: "https://is1.test/100x100bb.jpg" }] },
  }));
  assert.deepEqual(await misc.musicLyrics("cancao"), { title: "Canção", artist: "Banda", image: "https://is1.test/600x600bb.jpg", lyrics: "Linha 1\nLinha 2" });
  mock.method(axios, "get", respond({ "lrclib.net": [{ trackName: "Inst", artistName: "X", instrumental: true }] }));
  assert.equal(await misc.musicLyrics("instrumental"), null);
});

test("newsGoogle: manchetes do RSS do Google Notícias sem o nome da fonte no título", async () => {
  const rss = `<?xml version="1.0"?><rss><channel>
    <item><title>Manchete um - G1</title><link>https://news.google.com/a</link><pubDate>Tue, 17 Nov 2026 22:09:02 GMT</pubDate><source url="https://g1.globo.com">G1</source></item>
    <item><title>Manchete dois</title><link>https://news.google.com/b</link><source url="https://x">Fonte X</source></item>
  </channel></rss>`;
  mock.method(axios, "get", respond({ "news.google.com/rss": rss }));
  assert.deepEqual(await misc.newsGoogle(), [
    { title: "Manchete um", published: "17/11/2026 19:09", author: "G1", url: "https://news.google.com/a" },
    { title: "Manchete dois", published: "", author: "Fonte X", url: "https://news.google.com/b" },
  ]);
});

test("imageSearch (Bing Imagens): extrai links e ignora metadados inválidos", async () => {
  const html = `<a class="iusc" m='{"murl":"https://img.test/1.jpg","turl":"https://th.test/1","t":"Gato"}'></a><a class="iusc" m='{quebrado'></a><a class="iusc" m='{"murl":"https://img.test/2.jpg"}'></a>`;
  mock.method(axios, "get", respond({ "bing.com/images": html }));
  assert.deepEqual(await image.imageSearch("gato"), [
    { url: "https://img.test/1.jpg", thumbnail: "https://th.test/1", title: "Gato" },
    { url: "https://img.test/2.jpg", thumbnail: "https://img.test/2.jpg", title: "" },
  ]);
  mock.method(axios, "get", respond({ "bing.com/images": "<html></html>" }));
  await assert.rejects(image.imageSearch("nada"));
});

test("mangaReleases: título preferindo inglês, depois pt-br; resposta inválida gera erro", async () => {
  mock.method(axios, "get", respond({ "mangadex": { result: "ok", data: [
    { id: "c1", attributes: { chapter: "10", title: "Início" }, relationships: [{ type: "manga", attributes: { title: { en: "One" } } }] },
    { id: "c2", attributes: { chapter: null, title: null }, relationships: [{ type: "manga", attributes: { title: { "pt-br": "Dois" } } }] },
    { id: "c3", attributes: { chapter: "1" }, relationships: [] },
  ] } }));
  assert.deepEqual(await misc.mangaReleases(), [
    { name: "One", chapter: "10 - Início", url: "https://mangadex.org/chapter/c1" },
    { name: "Dois", chapter: "0", url: "https://mangadex.org/chapter/c2" },
    { name: "Título Desconhecido", chapter: "1", url: "https://mangadex.org/chapter/c3" },
  ]);
  mock.method(axios, "get", respond({ "mangadex": { result: "error" } }));
  await assert.rejects(misc.mangaReleases());
});

test("moviedbTrendings, shortenUrl e symbolsASCI", async () => {
  mock.method(axios, "get", respond({
    "themoviedb": { results: [{ title: "Filme X", overview: "Resumo" }, { name: "Série Y", overview: "Outro" }] },
    "tinyurl": "https://tinyurl.com/abc",
    "tabela.txt": "★ ☆ ✓",
  }));
  const trend = await misc.moviedbTrendings("movie");
  assert.match(trend, /1°: \*Filme X\.\*/);
  assert.match(trend, /Série Y/);
  assert.equal(await misc.shortenUrl("https://exemplo.com"), "https://tinyurl.com/abc");
  assert.equal(await misc.symbolsASCI(), "★ ☆ ✓");
});

test("simSimi: resposta e mensagem de erro do serviço", async () => {
  // simSimi chama axios(config) diretamente: a simulação é feita no adapter do axios.
  const seen: { timeout?: number }[] = [];
  const offline = axios.defaults.adapter;
  axios.defaults.adapter = (async (config: { timeout?: number }) => { seen.push(config); return { data: { message: "Oi humano" }, status: 200, statusText: "OK", headers: {}, config }; }) as never;
  try {
    assert.equal(await misc.simSimi("oi"), "Oi humano");
    assert.equal(seen[0].timeout, 20_000, "a requisição tem timeout");
  } finally {
    axios.defaults.adapter = offline;
  }
});

test("comandos utilitários pelo fluxo real", async () => {
  mock.method(axios, "post", async () => ({ data: { result: "42" } }));
  mock.method(axios, "get", respond({ "ddd.json": { estados: [{ ddd: ["81"], nome: "Pernambuco", regiao: "Nordeste" }] }, "tinyurl": "https://tinyurl.com/x", "tabela.txt": "☺" }));
  const f = fakeClient();
  const from = user(401);
  for (const [command, expected] of [["!calc 40+2", /42/], ["!ddd 81", /Pernambuco/], ["!encurtar https://exemplo.com", /tinyurl\.com\/x/], ["!tabela", /☺/]] as const) {
    f.reset();
    await send(f, { from, text: command });
    assert.match(f.output(), expected, command);
  }
  f.reset();
  await send(f, { from, text: "!calc" });
  assert.match(f.output(), /calc/i, "sem argumento mostra o uso");
});

test("clima: cidade com acento é encontrada (busca sem acento) e nunca troca por outra cidade", async () => {
  // Simula a WeatherAPI real: com acento a busca não acha "Parnaíba"; sem acento acha.
  const searched: string[] = []
  mock.method(axios, "get", async (url: string) => {
    const q = decodeURIComponent(url.split("q=")[1].split("&")[0])
    if (url.includes("search.json")) {
      searched.push(q)
      if (q === "Parnaiba, Piaui" || q === "Parnaiba") return { data: [{ id: 283644, name: "Parnaiba", region: "Piaui", country: "Brazil" }] }
      if (q.toLowerCase() === "rio de janeiro") return { data: [{ id: 3240078, name: "Rio De Janeiro", region: "Chiapas", country: "Mexico" }, { id: 287907, name: "Rio De Janeiro", region: "Rio de Janeiro", country: "Brazil" }] }
      return { data: [] }
    }
    throw new Error("inesperado " + url)
  })
  assert.equal(await misc.resolveWeatherLocation("Parnaíba"), "id:283644")
  assert.equal(searched[0], "Parnaiba", "busca primeiro sem acento")
  assert.equal(await misc.resolveWeatherLocation("Parnaíba, Piauí"), "id:283644", "não confunde com Piauí (MG)")
  assert.equal(await misc.resolveWeatherLocation("rio de janeiro"), "id:287907", "mesmo nome: prefere o Brasil")
  assert.equal(await misc.resolveWeatherLocation("Cidade Inexistente"), "Cidade Inexistente", "sem resultado: usa o texto sem acento")
  assert.equal(misc.stripAccents("São João da Aliança, Goiás"), "Sao Joao da Alianca, Goias")
})
