/**
 * Qualidade dos guias (!comando guia): todo comando tem guia, o guia mostra como usar o próprio
 * comando e só cita comandos que existem. Erros assim já aconteceram (guias que mandavam usar
 * "!fch", "!status" e "!veradmins", que não existem).
 */
import { test, before } from "node:test"
import assert from "node:assert/strict"
import { setupBot, currentBot } from "./helpers/harness.js"
import { getCommandGuide } from "../src/utils/commands.util.js"

const CATEGORIES = ["info", "utility", "sticker", "download", "misc", "group", "admin", "game", "engagement"] as const
const commands = new Map<string, { category: string, guide: string }>()

before(async () => {
  await setupBot()
  for (const category of CATEGORIES) {
    const list = (await import(`../src/commands/${category}.list.commands.ts`)).default as Record<string, { guide?: string }>
    for (const [name, def] of Object.entries(list)) commands.set(name, { category, guide: (def.guide ?? "").replaceAll("{$p}", "!") })
  }
})

test("guias: todos os comandos têm guia com exemplo do próprio comando", () => {
  assert.ok(commands.size >= 180, `esperava todos os comandos, achei ${commands.size}`)
  const semGuia = [...commands].filter(([, c]) => c.guide.trim().length < 20).map(([n]) => n)
  assert.deepEqual(semGuia, [], "comandos sem guia (ou com guia vazio)")
  const naoCitaProprio = [...commands].filter(([n, c]) => !c.guide.includes(`!${n}`)).map(([n]) => n)
  assert.deepEqual(naoCitaProprio, [], "o guia precisa mostrar o próprio comando (ex.: *!comando*)")
})

test("guias: só citam comandos que existem", () => {
  const quebrados: string[] = []
  for (const [name, { guide }] of commands) {
    for (const [, ref] of guide.matchAll(/\*!([a-z0-9]+)/g)) if (!commands.has(ref)) quebrados.push(`!${name} → !${ref}`)
  }
  assert.deepEqual(quebrados, [], "guias que mandam usar comandos inexistentes")
})

test("guias: '!comando guia' devolve o texto pelo fluxo do bot", () => {
  const prefix = currentBot().prefix
  for (const name of ["frase", "dcmd", "rmadmin", "yt", "link", "marcar", "discord", "ocrpdf", "rastreio"]) {
    const text = getCommandGuide(prefix, `${prefix}${name}`)
    assert.match(text, new RegExp(`\\${prefix}${name}`), `!${name} guia`)
  }
  assert.doesNotMatch(getCommandGuide(prefix, `${prefix}frase`), /fch/, "o guia do !frase não manda mais usar !fch")
})

test("guias: '!sorteio guia' e '!sorteio ajuda' mostram o mesmo guia, atualizado", async () => {
  const { fakeClient, send, user } = await import("./helpers/harness.js")
  const f = fakeClient()
  await send(f, { from: user(9951), text: "!sorteio guia" })
  const guia = f.output()
  f.reset()
  await send(f, { from: user(9951), text: "!sorteio ajuda" })
  const ajuda = f.output().trim()
  assert.ok(ajuda.length > 500 && guia.includes(ajuda), "o guia e a ajuda são o mesmo texto")
  for (const novo of ["sorteio premio", "sorteio premios", "sorteio apagar", "Sem prêmio guardado"]) assert.ok(guia.includes(novo), `guia cita ${novo}`)
})

test("guias: todo subcomando dos comandos com várias opções aparece no guia", async () => {
  const fs = await import("node:fs")
  const read = (f: string) => fs.readFileSync(new URL(`../src/commands/${f}`, import.meta.url), "utf8")
  // Nome do mapa de ações no código → comando cujo guia precisa citar cada ação
  const maps: [string, string, string][] = [
    ["misc.giveaway.functions.commands.ts", "const ACTIONS", "sorteio"],
    ["utility.document.functions.commands.ts", "const PDF_ACTIONS", "pdf"],
    ["group.extra.functions.commands.ts", "const SANTA_ACTIONS", "amigosecreto"],
  ]
  const faltando: string[] = []
  for (const [file, marker, command] of maps) {
    const src = read(file)
    const start = src.indexOf(marker)
    assert.ok(start >= 0, `${marker} em ${file}`)
    const block = src.slice(start, src.indexOf("\n}\n", start))
    const actions = [...block.matchAll(/^\s{4}([a-z]+):/gm)].map(m => m[1])
    assert.ok(actions.length >= 5, `ações de !${command}`)
    const guide = commands.get(command)!.guide.toLowerCase()
    for (const a of actions) if (!guide.includes(a)) faltando.push(`!${command} ${a}`)
  }
  // Subcomandos tratados com if no código
  const checks: [string, string[]][] = [["backup", ["status", "lista", "drive", "enviar"]], ["free", ["sub", "unsub", "mode", "completo", "resumo"]], ["roll", ["confirmar"]], ["discord", ["add", "rm"]]]
  for (const [command, subs] of checks) for (const s of subs) if (!commands.get(command)!.guide.toLowerCase().includes(s)) faltando.push(`!${command} ${s}`)
  assert.deepEqual(faltando, [], "subcomandos que existem no código mas não estão no guia")
})
