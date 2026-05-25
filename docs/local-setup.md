# Local Setup

Tart Translator is designed to run without paid API calls. Pasted transcripts work immediately; audio upload stays in the workflow and currently reports that local transcription still needs setup.

## macOS Development

Install dependencies:

```bash
npm install
```

Start the API:

```bash
npm run dev:api
```

Start the frontend in another terminal:

```bash
npm run dev
```

Open `http://127.0.0.1:5173`. The Vite dev server proxies `/api` to `http://127.0.0.1:8787`, so the browser does not need a hard-coded API host.

The default API bind address is `127.0.0.1` for safe laptop development. Override it only when you need another machine or container to reach the API:

```bash
TART_API_HOST=0.0.0.0 npm run dev:api
```

## Docker

Build and run the single-container app:

```bash
docker compose up --build
```

Open `http://localhost:8787`. In Docker, `TART_API_HOST=0.0.0.0` lets the container receive traffic from the published port while the app still serves the frontend and API from the same origin.

## Unraid

Use the `Dockerfile` or the `tart-translator:local` image built from this repo.

Recommended container settings:

- Container port: `8787`
- Host port: any free Unraid port, commonly `8787`
- `PORT=8787`
- `TART_API_HOST=0.0.0.0`
- `TART_STATIC_DIR=dist/client`
- Restart policy: unless stopped

No volume is required for the MVP because uploaded audio is kept in memory and remote storage is out of scope.

## Optional Ollama Rewrite

On macOS, install Ollama from the official macOS package, then pull the small rewrite model:

```bash
ollama pull llama3.2:3b
```

Start Ollama if it is not already running:

```bash
ollama serve
```

The app reads these defaults from `.env`:

```bash
OLLAMA_TAGS_URL=http://127.0.0.1:11434/api/tags
OLLAMA_GENERATE_URL=http://127.0.0.1:11434/api/generate
OLLAMA_MODEL=llama3.2:3b
```

In Docker or Unraid, set these variables to whichever host or service name can reach Ollama:

```bash
OLLAMA_TAGS_URL=http://host.docker.internal:11434/api/tags
OLLAMA_GENERATE_URL=http://host.docker.internal:11434/api/generate
OLLAMA_MODEL=llama3.2:3b
```

If Ollama is unavailable, the app falls back to deterministic cleanup.

## Optional whisper.cpp Audio Transcription

For a 16 GB Mac, start with `small.en`. It is a good default for English voice notes while leaving memory for Ollama.

Install build tools:

```bash
xcode-select --install
brew install cmake ffmpeg git
```

Build whisper.cpp with Metal support:

```bash
mkdir -p ~/Developer
git clone https://github.com/ggml-org/whisper.cpp.git ~/Developer/whisper.cpp
cd ~/Developer/whisper.cpp
cmake -B build -DGGML_METAL=ON
cmake --build build --config Release -j
./models/download-ggml-model.sh small.en
```

Add these paths to `.env`:

```bash
WHISPER_CPP_BIN=/path/to/whisper.cpp/build/bin/whisper-cli
WHISPER_MODEL_PATH=/path/to/whisper.cpp/models/ggml-small.en.bin
WHISPER_LANGUAGE=en
WHISPER_NO_GPU=true
```

Restart `npm run dev:api` or `npm run start` after editing `.env`. Uploaded audio will then transcribe locally and feed into the same note pipeline. `WHISPER_NO_GPU=true` is the safest default if Metal crashes while loading the model; remove it or set it to `false` later if GPU mode is stable on your Mac.

This local `whisper-cli` build was verified with WAV, MP3, and FLAC uploads. M4A/AAC/MP4 uploads are not exposed in the app because this binary rejected M4A during local testing. OGG is also hidden for now: the CLI lists OGG support and accepted an OGG/Vorbis test file, but rejected another OGG container variant, so the app keeps the picker to the formats that behaved consistently.
