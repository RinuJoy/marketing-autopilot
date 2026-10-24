#!/usr/bin/env node
// Text to speech for the video engine's --voice with Google Cloud's Chirp 3 HD voices, which sound close to a real
// person: say-google.mjs <out.wav> <voice> <text>. Needs GOOGLE_TTS_KEY (an API key limited to the Text-to-Speech
// API). The voice is a full Google name such as en-IN-Chirp3-HD-Aoede or en-GB-Chirp3-HD-Charon; the language is
// read from its first two parts.
import { writeFile } from "node:fs/promises";

const [out, voice, text] = process.argv.slice(2);
const key = process.env.GOOGLE_TTS_KEY;
if (!key) { console.error("GOOGLE_TTS_KEY is not set"); process.exit(1); }
const res = await fetch(`https://texttospeech.googleapis.com/v1/text:synthesize?key=${encodeURIComponent(key)}`, {
  method: "POST", headers: { "content-type": "application/json" },
  body: JSON.stringify({ input: { text }, voice: { languageCode: voice.split("-").slice(0, 2).join("-"), name: voice },
    audioConfig: { audioEncoding: "LINEAR16", sampleRateHertz: 24000 } }),
});
if (!res.ok) { console.error(`Google TTS ${res.status}: ${(await res.text()).slice(0, 300)}`); process.exit(1); }
await writeFile(out, Buffer.from((await res.json()).audioContent, "base64"));
