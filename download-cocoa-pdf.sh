#!/usr/bin/env bash
#
# Downloads CoCoA.pdf (the CIM-10 coding-rules source document) from this
# repo's private "resources" release. Not committed to the repo tree itself
# - copyrighted third-party content, not authored here (see .gitignore) -
# but kept available to project collaborators as a release asset instead.
#
# Requires the GitHub CLI, authenticated with access to this private repo:
#   gh auth login
#
# Run:  ./download-cocoa-pdf.sh
# Env:  COCOA_PDF_REPO (default sdanzan/cocoa-cim10-rag), COCOA_PDF_TAG
#       (default "resources"), COCOA_PDF for the output path.

set -euo pipefail

REPO="${COCOA_PDF_REPO:-sdanzan/cocoa-cim10-rag}"
TAG="${COCOA_PDF_TAG:-resources}"
OUT="${COCOA_PDF:-CoCoA.pdf}"

if [ -f "$OUT" ]; then
  echo "$OUT already exists ($(du -h "$OUT" | cut -f1)) - skipping download."
  exit 0
fi

if ! command -v gh >/dev/null 2>&1; then
  echo "error: the GitHub CLI ('gh') is required to fetch CoCoA.pdf from the" >&2
  echo "       private release asset. Install it (e.g. 'brew install gh')" >&2
  echo "       and run 'gh auth login', then re-run this script." >&2
  exit 1
fi

if ! gh auth status >/dev/null 2>&1; then
  echo "error: not logged into the GitHub CLI. Run 'gh auth login' (needs" >&2
  echo "       access to $REPO), then re-run this script." >&2
  exit 1
fi

echo "Downloading CoCoA.pdf from $REPO release '$TAG'..."
TMPDIR="$(mktemp -d)"
trap 'rm -rf "$TMPDIR"' EXIT

if ! gh release download "$TAG" --repo "$REPO" --pattern "CoCoA.pdf" --dir "$TMPDIR"; then
  echo "error: download failed. Confirm you have access to $REPO and that" >&2
  echo "       the '$TAG' release still has a CoCoA.pdf asset attached, or" >&2
  echo "       source the PDF another way and place it at the repo root" >&2
  echo "       yourself." >&2
  exit 1
fi

# Sanity check: make sure we actually got a PDF.
if ! head -c 5 "$TMPDIR/CoCoA.pdf" | grep -q "%PDF-"; then
  echo "error: downloaded file is not a PDF." >&2
  exit 1
fi

mv "$TMPDIR/CoCoA.pdf" "$OUT"
echo "Saved $OUT ($(du -h "$OUT" | cut -f1))."
