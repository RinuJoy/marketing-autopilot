#!/usr/bin/env node
// Text to speech for the reel and video engines' --voice with ElevenLabs: say-elevenlabs.mjs <out.wav> <voice id> <text>.
// Needs ELEVENLABS_API_KEY (elevenlabs.io → Profile → API keys; a key limited to Text to Speech is enough).
// ELEVENLABS_MODEL picks the model (default eleven_multilingual_v2). The voice is an ElevenLabs voice id; the stock
// British ones: Alice Xb7hH8MSUJpSbSDYk0k2, George JBFqnCBsd6RMkjVDRZzb, Lily pFZP5JQG7iQjIQuC4Bku.
// Also writes <out.wav>.words.json, the time each word starts and ends, so the reel's captions and ticks land exactly.
import { writeFile } from "node:fs/promises";

const [out, voice, text] = process.argv.slice(2);
const key = process.env.ELEVENLABS_API_KEY;
if (!key) { console.error("ELEVENLABS_API_KEY is not set"); process.exit(1); }
const RATE = 24000;
const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voice || "Xb7hH8MSUJpSbSDYk0k2")}/with-timestamps?output_format=pcm_${RATE}`, {
  method: "POST", headers: { "xi-api-key": key, "content-type": "application/json" },
  body: JSON.stringify({ text, model_id: process.env.ELEVENLABS_MODEL || "eleven_multilingual_v2" }),
});
if (!res.ok) { console.error(`ElevenLabs ${res.status}: ${(await res.text()).slice(0, 300)}`); process.exit(1); }
const { audio_base64, alignment } = await res.json();

// Raw 16-bit mono PCM into a WAV file.
const pcm = Buffer.from(audio_base64, "base64"), head = Buffer.alloc(44);
head.write("RIFF", 0); head.writeUInt32LE(36 + pcm.length, 4); head.write("WAVE", 8); head.write("fmt ", 12);
head.writeUInt32LE(16, 16); head.writeUInt16LE(1, 20); head.writeUInt16LE(1, 22); head.writeUInt32LE(RATE, 24);
head.writeUInt32LE(RATE * 2, 28); head.writeUInt16LE(2, 32); head.writeUInt16LE(16, 34); head.write("data", 36); head.writeUInt32LE(pcm.length, 40);
await writeFile(out, Buffer.concat([head, pcm]));

// Characters with times → words with times.
const words = [];
let cur = null;
(alignment?.characters || []).forEach((c, i) => {
  if (/\s/.test(c)) { cur = null; return; }
  if (!cur) words.push(cur = { w: "", s: alignment.character_start_times_seconds[i], e: 0 });
  cur.w += c; cur.e = alignment.character_end_times_seconds[i];
});
await writeFile(out + ".words.json", JSON.stringify(words));
