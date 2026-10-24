#!/usr/bin/env python3
# Text to speech for the video engine's --voice: say-kokoro.py <out.wav> <voice> <text>.
# Uses Kokoro (Apache 2.0, runs offline): pip install kokoro-onnx soundfile, and put kokoro-v1.0.int8.onnx and
# voices-v1.0.bin from https://github.com/thewh1teagle/kokoro-onnx/releases (model-files-v1.0) in $KOKORO_DIR.
# British voices: bf_emma, bf_isabella, bm_george, bm_lewis. Indian English: the Hindi voices (hf_alpha, hf_beta,
# hm_omega, hm_psi) reading English sounds. KOKORO_SPEED sets the pace (default 1.05).
import os, sys
import soundfile as sf
from kokoro_onnx import Kokoro

out, voice, text = sys.argv[1], sys.argv[2] or "bf_emma", sys.argv[3]
d = os.environ.get("KOKORO_DIR", ".")
k = Kokoro(os.path.join(d, "kokoro-v1.0.int8.onnx"), os.path.join(d, "voices-v1.0.bin"))
samples, rate = k.create(text, voice=voice, speed=float(os.environ.get("KOKORO_SPEED", "1.05")), lang="en-us" if voice[:1] == "a" else "en-gb")
sf.write(out, samples, rate)
