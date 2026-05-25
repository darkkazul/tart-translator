# Tart Translator

Tart Translator turns rough transcripts or local audio recordings into clear how-to notes. It runs locally, can use Ollama for better rewriting, and can use whisper.cpp for local audio transcription.

## What It Does

- Paste a transcript and generate ordered process notes.
- Upload verified audio formats: WAV, MP3, or FLAC.
- Transcribe audio locally with whisper.cpp when configured.
- Rewrite messy speech into concise full sentences.
- Show live progress while transcript or audio processing runs.
- Show whether Ollama and Whisper are ready on page load.

## Quick Start On macOS

Install dependencies:

```bash
npm install
```

Copy the example environment file:

```bash
cp .env.example .env
```

Start the app:

```bash
npm run build
npm run start
```

Open:

```text
http://127.0.0.1:8787
```

## Optional Ollama Setup

Install Ollama, then pull the recommended 16 GB Mac model:

```bash
ollama pull llama3.2:3b
```

Make sure `.env` includes:

```bash
OLLAMA_TAGS_URL=http://127.0.0.1:11434/api/tags
OLLAMA_GENERATE_URL=http://127.0.0.1:11434/api/generate
OLLAMA_MODEL=llama3.2:3b
```

The app still works without Ollama by using the offline parser.

## Optional Whisper Setup

Build whisper.cpp and download a model, then set these values in `.env`:

```bash
WHISPER_CPP_BIN=/path/to/whisper.cpp/build/bin/whisper-cli
WHISPER_MODEL_PATH=/path/to/whisper.cpp/models/ggml-small.en.bin
WHISPER_LANGUAGE=en
WHISPER_NO_GPU=true
```

This local Whisper build was verified with WAV, MP3, and FLAC. M4A is not accepted because the local `whisper-cli` rejected it during testing.

## Docker / Unraid

Copy the Docker env example:

```bash
cp .env.docker.example .env
```

Start with Docker Compose:

```bash
docker compose up --build
```

For Docker and Unraid, bind the API to all interfaces:

```bash
TART_API_HOST=0.0.0.0
```

## Development

Run the API and Vite dev server separately:

```bash
npm run dev:api
npm run dev
```

Run checks:

```bash
npm run lint
npm test
npm run build
npm run test:e2e
```

More setup detail is in [docs/local-setup.md](docs/local-setup.md).
