#!/usr/bin/env bash
#
# Starts a ChromaDB HTTP server on top of the embedded database that the Python
# indexing script (../python-src/chunkize_new.py) produced under ../rag_database.
#
# The `chromadb` JS client used by the NestJS backend only talks HTTP, so this
# server is what bridges it to the on-disk vectors.
set -euo pipefail

cd "$(dirname "$0")/.."

DB_PATH="${CHROMA_DB_PATH:-../rag_database}"
PORT="${CHROMA_PORT:-8000}"
HOST="${CHROMA_HOST:-localhost}"

if command -v chroma >/dev/null 2>&1; then
  CHROMA_BIN="chroma"
elif [ -x "../.venv/bin/chroma" ]; then
  CHROMA_BIN="../.venv/bin/chroma"
else
  echo "error: 'chroma' CLI not found. Install it with:  pip install chromadb" >&2
  exit 1
fi

if [ ! -d "$DB_PATH" ]; then
  echo "error: ChromaDB path '$DB_PATH' does not exist. Run the Python indexer first:" >&2
  echo "       (cd .. && source .venv/bin/activate && python python-src/chunkize_new.py)" >&2
  exit 1
fi

echo "Starting ChromaDB server: $CHROMA_BIN run --path $DB_PATH --host $HOST --port $PORT"
exec "$CHROMA_BIN" run --path "$DB_PATH" --host "$HOST" --port "$PORT"
