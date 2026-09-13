#!/usr/bin/env bash
#
# Sets up a local Ollama server with the suggestion LLM (qwen3-coder) - for
# anyone with no hosted LLM API key. After this script, both defaults work
# with zero further config:
#   - Docker:      LLM_PROVIDER=openai, OPENAI_BASE_URL=http://host.docker.internal:11434/v1
#                  (docker-compose.yml's shipped default)
#   - Non-Docker:  LLM_PROVIDER=ollama (src/config.ts's code default)
#
# Safe to re-run: every step first checks whether it's already done.
#
# Run:  ./setup-ollama.sh
# Env:  LLM_MODEL (default qwen3-coder:latest), OLLAMA_URL (default
#       http://localhost:11434), SKIP_EMBED_MODEL=1 to skip nomic-embed-text
#       (only needed if you'll also run the backend outside Docker - the
#       Docker stack's ollama-embed container bundles its own copy).

set -euo pipefail

MODEL="${LLM_MODEL:-qwen3-coder:latest}"
OLLAMA_URL="${OLLAMA_URL:-http://localhost:11434}"

echo "==> Checking for the Ollama CLI"
if command -v ollama >/dev/null 2>&1; then
  echo "    already installed ($(ollama --version 2>/dev/null || echo 'version unknown'))"
else
  echo "    not found - installing"
  case "$(uname -s)" in
    Darwin)
      if command -v brew >/dev/null 2>&1; then
        brew install ollama
      else
        echo "error: Homebrew not found. Install Ollama manually: https://ollama.com/download" >&2
        exit 1
      fi
      ;;
    Linux)
      curl -fsSL https://ollama.com/install.sh | sh
      ;;
    *)
      echo "error: unsupported OS for auto-install. Get Ollama here: https://ollama.com/download" >&2
      exit 1
      ;;
  esac
fi

echo "==> Checking whether Ollama is serving at $OLLAMA_URL"
if curl -sf "$OLLAMA_URL/api/tags" >/dev/null 2>&1; then
  echo "    already running"
else
  echo "    starting 'ollama serve' in the background (log: /tmp/ollama-serve.log)"
  nohup ollama serve > /tmp/ollama-serve.log 2>&1 &
  for _ in $(seq 1 30); do
    curl -sf "$OLLAMA_URL/api/tags" >/dev/null 2>&1 && break
    sleep 1
  done
  if ! curl -sf "$OLLAMA_URL/api/tags" >/dev/null 2>&1; then
    echo "error: could not reach Ollama at $OLLAMA_URL after starting it - see /tmp/ollama-serve.log" >&2
    exit 1
  fi
  echo "    up"
fi

echo "==> Pulling $MODEL (generation - several GB, can take a while)"
ollama pull "$MODEL"

if [ "${SKIP_EMBED_MODEL:-0}" != "1" ]; then
  echo "==> Pulling nomic-embed-text (embeddings - only needed outside Docker)"
  ollama pull nomic-embed-text
fi

echo "==> Installed models:"
curl -s "$OLLAMA_URL/api/tags" | grep -o '"name":"[^"]*"' | sed 's/^/    /'

echo "==> Smoke test: a generation request through the OpenAI-compatible endpoint"
REPLY=$(curl -sf "$OLLAMA_URL/v1/chat/completions" \
  -H 'content-type: application/json' \
  -d "{\"model\":\"$MODEL\",\"messages\":[{\"role\":\"user\",\"content\":\"Reply with exactly one word: ok\"}]}" \
  2>/dev/null | python3 -c "import sys,json; print(json.load(sys.stdin)['choices'][0]['message']['content'])" 2>/dev/null || echo "")
if [ -n "$REPLY" ]; then
  echo "    model replied: $REPLY"
else
  echo "    (smoke test inconclusive - python3 unavailable or unexpected reply; the pull above still succeeded)"
fi

echo
echo "Done. Ollama is serving '$MODEL' at $OLLAMA_URL"
echo "  - OpenAI-compatible endpoint: $OLLAMA_URL/v1  (what docker-compose.yml's default calls)"
echo "  - Native endpoint:            $OLLAMA_URL/api/generate  (LLM_PROVIDER=ollama)"
