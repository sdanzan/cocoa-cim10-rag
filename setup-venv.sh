#!/usr/bin/env bash
#
# Creates the Python venv (.venv/) and installs requirements.txt - needed
# for the host indexer path (python-src/chunkize_new.py), the reference
# scripts (test_rag.py, test_rag_backend.py), and eval/run.py.
#
# Not needed for the Docker path (indexing and the backend run in
# containers with their own dependencies).
#
# A script can't activate a venv for your shell, so this only creates it
# and installs deps - source it yourself afterward (see the printed command).
#
# Run:  ./setup-venv.sh
# Env:  VENV_DIR (default .venv), PYTHON (default python3)

set -euo pipefail

VENV_DIR="${VENV_DIR:-.venv}"
PYTHON="${PYTHON:-python3}"

if ! command -v "$PYTHON" >/dev/null 2>&1; then
  echo "error: '$PYTHON' not found. Install Python 3, or set PYTHON=/path/to/python3." >&2
  exit 1
fi

if [ -d "$VENV_DIR" ]; then
  echo "$VENV_DIR already exists - skipping creation."
else
  echo "Creating venv at $VENV_DIR..."
  "$PYTHON" -m venv "$VENV_DIR"
fi

echo "Installing requirements.txt..."
"$VENV_DIR/bin/pip" install --quiet --upgrade pip
"$VENV_DIR/bin/pip" install --quiet -r requirements.txt

echo
echo "Done. Activate it with:"
echo "  source $VENV_DIR/bin/activate"
