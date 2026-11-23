/**
 * Processamento de mídia REAL (ffmpeg, sharp, webpmux) com arquivos gerados localmente:
 * conversões de vídeo/áudio, figurinhas, efeitos de áudio e reconhecimento com API simulada.
 */
import { test, before, afterEach, mock } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import axios from "axios";
import ffmpeg from "fluent-ffmpeg";
import ffmpegInstaller from "@ffmpeg-installer/ffmpeg";
import { fileTypeFromBuffer } from "file-type";
import webp from "node-webpmux";
import * as convert from "../src/utils/convert.util.js";
import * as sticker from "../src/utils/sticker.util.js";
import * as audio from "../src/utils/audio.util.js";
import * as image from "../src/utils/image.util.js";

const ROOT = process.env.SINFOROSO_PROJECT_ROOT ?? process.cwd();
const PNG = fs.readFileSync(path.join(ROOT, "src", "media", "cara.png"));
let MP4: Buffer, MP3: Buffer;

before(() => {
  // Mesmo binário que o app usa (app.ts configura o caminho na inicialização).
  ffmpeg.setFfmpegPath(ffmpegInstaller.path);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "midia-"));
  const mp4 = path.join(dir, "v.mp4"), mp3 = path.join(dir, "a.mp3");
  execFileSync(ffmpegInstaller.path, ["-y", "-f", "lavfi", "-i", "testsrc=size=160x120:rate=10:duration=2", "-f", "lavfi", "-i", "sine=frequency=440:duration=2", "-shortest", "-pix_fmt", "yuv420p", mp4], { stdio: "ignore" });
  execFileSync(ffmpegInstaller.path, ["-y", "-f", "lavfi", "-i", "sine=frequency=330:duration=2", mp3], { stdio: "ignore" });
  MP4 = fs.readFileSync(mp4); MP3 = fs.readFileSync(mp3);
  fs.rmSync(dir, { recursive: true, force: true });
});
afterEach(() => mock.restoreAll());

const mime = async (b: Buffer) => (await fileTypeFromBuffer(b))?.mime;

test("convertMp4ToMp3 e extractAudioFromVideo geram áudio", async () => {
  assert.equal(await mime(await convert.convertMp4ToMp3("buffer", MP4)), "audio/mpeg");
  assert.equal(await mime(await convert.extractAudioFromVideo("buffer", MP4)), "audio/mpeg");
});

test("convertVideoToWhatsApp gera mp4 e convertVideoToThumbnail gera miniatura base64", async () => {
  assert.equal(await mime(await convert.convertVideoToWhatsApp("buffer", MP4)), "video/mp4");
  const thumb = await convert.convertVideoToThumbnail("buffer", MP4);
  const decoded = Buffer.from(thumb, "base64");
  assert.match(String(await mime(decoded)), /^image\//);
});

test("conversões a partir de URL baixam com timeout e repassam ao ffmpeg", async () => {
  const get = mock.method(axios, "get", async () => ({ data: MP4 }));
  assert.equal(await mime(await convert.convertMp4ToMp3("url", "https://midia.test/v.mp4")), "audio/mpeg");
  assert.equal((get.mock.calls[0].arguments[1] as { timeout?: number }).timeout, 60_000);
});

test("figurinha: criar a partir de imagem, renomear (EXIF) e voltar para imagem", async () => {
  const st = await sticker.createSticker(PNG, { pack: "Pacote", author: "Autor" });
  assert.equal(await mime(st), "image/webp");
  const img = new webp.Image(); await img.load(st);
  assert.match(String(img.exif), /Pacote/);

  const renamed = await sticker.renameSticker(st, "Novo Pacote", "Nova Autoria");
  const img2 = new webp.Image(); await img2.load(renamed);
  assert.match(String(img2.exif), /Novo Pacote/);

  assert.equal(await mime(await sticker.stickerToImage(st)), "image/png");
});

test("figurinha animada a partir de vídeo", async () => {
  const st = await sticker.createSticker(MP4, { pack: "P", author: "A" });
  assert.equal(await mime(st), "image/webp");
});

test("efeitos de áudio aplicam filtros do ffmpeg e rejeitam tipo desconhecido", async () => {
  for (const type of ["estourar", "reverso", "grave", "agudo", "x2", "volume"] as const) {
    assert.equal(await mime(await audio.audioModified(MP3, type)), "audio/mpeg", type);
  }
  await assert.rejects(audio.audioModified(MP3, "inexistente" as never));
});

test("textToVoice devolve o áudio da API e trata falha", async () => {
  mock.method(axios, "get", async () => ({ data: MP3 }));
  assert.equal(await mime(await audio.textToVoice("pt", "olá")), "audio/mpeg");
  mock.method(axios, "get", async () => { throw new Error("offline") });
  await assert.rejects(audio.textToVoice("pt", "olá"));
});

test("musicRecognition (Shazam): assinatura local, resultado, não encontrado e erro HTTP", async () => {
  const bodies: { signature?: { uri?: string, samplems?: number } }[] = [];
  const shazam = (body: object, status = 200) => mock.method(globalThis, "fetch", async (_url: string, init?: { body?: string }) => {
    bodies.push(JSON.parse(String(init?.body ?? "{}")));
    return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
  });
  shazam({ matches: [{}], track: { title: "Música", subtitle: "Artista 1", sections: [{ metadata: [{ title: "Album", text: "Álbum" }, { title: "Label", text: "Selo" }, { title: "Released", text: "2020" }] }] } });
  assert.deepEqual(await audio.musicRecognition(MP3), { title: "Música", artists: "Artista 1", album: "Álbum", producer: "Selo", release_date: "2020", duration: "-----" });
  assert.match(String(bodies[0].signature?.uri), /^data:audio\/vnd\.shazam\.sig;base64,/, "envia só a assinatura de áudio, não o áudio");

  mock.restoreAll();
  shazam({ matches: [] });
  assert.equal(await audio.musicRecognition(MP3), null, "sem correspondência devolve null");

  mock.restoreAll();
  shazam({}, 429);
  await assert.rejects(audio.musicRecognition(MP3), "HTTP de erro vira erro do comando");
});

test("emojiMix e verificação de suporte", async () => {
  mock.method(axios, "get", async () => ({ data: PNG }));
  assert.equal(await mime(await image.emojiMix("😀", "😎") as Buffer), "image/png");
  assert.deepEqual(await image.checkEmojiMixSupport("😀", "a"), { emoji1: true, emoji2: false });
});

test("animeRecognition: resultado, 400 devolve null e 429 gera erro", async () => {
  const fail = (status: number) => async () => { throw Object.assign(new Error("http"), { response: { status } }); };
  mock.method(axios, "post", async () => ({ data: { result: [{ from: 61.2, to: 65, episode: 3, similarity: 0.9312, video: "https://v.test/p.mp4", anilist: { title: { english: null, romaji: "Anime Teste" } } }] } }));
  assert.deepEqual(await image.animeRecognition(PNG), { initial_time: "1:01", final_time: "1:05", episode: 3, title: "Anime Teste", similarity: 93, preview_url: "https://v.test/p.mp4" });
  mock.method(axios, "post", fail(400));
  assert.equal(await image.animeRecognition(PNG), null, "imagem inválida (400) não é erro");
  mock.method(axios, "post", fail(429));
  await assert.rejects(image.animeRecognition(PNG), "limite (429) gera erro");
});
