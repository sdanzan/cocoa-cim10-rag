#!/usr/bin/env python3
"""
Build the RAG vector store from CoCoA.pdf.

Splits the PDF into one chunk per CIM-10 code (the code line plus the expert
commentary that follows it), embeds each chunk with a local Ollama model and
stores text + vector + metadata in a persistent ChromaDB collection.

Run:  python python-src/chunkize_new.py
Env:  COCOA_PDF, CHROMA_PATH, CHROMA_COLLECTION, OLLAMA_URL, EMBED_MODEL,
      EMBED_DOC_PREFIX, CHROMA_SPACE, CHUNK_START_PAGE, CHUNK_END_PAGE
"""

import os
import re
import sys

import chromadb
import pdfplumber
import requests

PDF_PATH = os.environ.get("COCOA_PDF", "CoCoA.pdf")
CHROMA_PATH = os.environ.get("CHROMA_PATH", "./rag_database")
COLLECTION = os.environ.get("CHROMA_COLLECTION", "cocoa_cim10_v2")
OLLAMA_URL = os.environ.get("OLLAMA_URL", "http://localhost:11434")
EMBED_MODEL = os.environ.get("EMBED_MODEL", "nomic-embed-text:latest")

# nomic-embed-text is trained with task prefixes ("search_document: " on the
# document side, "search_query: " on the query side). Prepended only to the
# embedded text, never to the stored document. On by default (the `cocoa_cim10_v2`
# collection); the prefix-free `cocoa_cim10` is built with:
#   EMBED_DOC_PREFIX="" CHROMA_COLLECTION=cocoa_cim10 CHROMA_SPACE=l2
EMBED_DOC_PREFIX = os.environ.get("EMBED_DOC_PREFIX", "search_document: ")

# HNSW distance function. "cosine" (default, bounded [0, 2], which lets the
# backend apply a fixed RAG_MAX_DISTANCE cutoff) or "l2".
COLLECTION_METADATA = {"hnsw:space": os.environ.get("CHROMA_SPACE", "cosine")}

# A letter, two digits, then optionally a dot and one or two digits (e.g. "J18.1").
CIM10_PATTERN = re.compile(r"^([A-Z]\d{2}(?:\.\d{1,2})?)\s*[-:]?\s*(.*)")

# Every table row is preceded by a "P R A" column marker (three coding-
# eligibility flags). pdfplumber's flattened text sometimes glues it to the
# START of the following code line ("P R A A00 Choléra"), which defeats the
# heading regex above and silently swallows that code's whole entry into
# whatever chunk preceded it. Stripping it unconditionally, before the
# heading check, fixes both that case and the ~8,300 lines where it appears
# on its own (which just become empty and get skipped below).
PRA_PREFIX = re.compile(r"^P\s+R\s+A\s*")

# Other recurring non-content lines: the P/R/A column *value* (a lone 1-2
# digit level indicator), the chapter header repeated on every page, and the
# footer/page-marker repeated on every page. All measured directly against
# the PDF - none of them carry coding information, they just pollute
# whichever chunk happens to be "current" when pdfplumber emits them.
NOISE_LINE = re.compile(
    r"^\d{1,2}$"
    r"|^CHAPITRE\s+[IVXLCDM]+\b"
    r"|^\d{4}\s*[–—-]\s*(\d+-\d+|RG\s*[–—-])"
)

# Pages 0-29 are pure front matter (title, table of contents, the document's
# own legend/methodology, "Règles Générales" presentation) - zero coding
# content. CHAPITRE I starts on page 30; the first real code heading is on
# page 32. Pages 1006+ are a different document shape entirely - the
# "ANNEXE / INDEX ALPHABÉTIQUE DES TUMEURS" (an anatomical-site -> code
# lookup table, not code+commentary). Last real chapter content is page 1004
# (CHAPITRE XXII); 1005 is blank; 1006 starts the annexe. Both ranges
# measured directly against CoCoA.pdf, not guessed.
CHUNK_START_PAGE = int(os.environ.get("CHUNK_START_PAGE", "30"))
CHUNK_END_PAGE = int(os.environ.get("CHUNK_END_PAGE", "1006"))  # exclusive


def extract_and_chunk_cocoa(pdf_path):
    """Yield one chunk per CIM-10 code, streaming so the whole PDF is never held in memory."""
    current_chunk = None

    with pdfplumber.open(pdf_path) as pdf:
        for page in pdf.pages[CHUNK_START_PAGE:CHUNK_END_PAGE]:
            text = page.extract_text()
            if not text:
                continue

            for line in text.split("\n"):
                line = PRA_PREFIX.sub("", line.strip()).strip()
                if not line or NOISE_LINE.match(line):
                    continue

                match = CIM10_PATTERN.match(line)
                if match:
                    # A new code starts here: flush the previous chunk first.
                    if current_chunk:
                        yield current_chunk
                    code, title = match.group(1), match.group(2)
                    current_chunk = {
                        "metadata": {"code_cim10": code, "titre": title},
                        "text": line + "\n",
                    }
                elif current_chunk:
                    # Explanatory text: append it to the current chunk.
                    current_chunk["text"] += line + " "

    if current_chunk:
        yield current_chunk


def get_ollama_embedding(text):
    """Return the embedding vector for `text` (with the document prefix), or None on failure."""
    try:
        response = requests.post(
            f"{OLLAMA_URL}/api/embeddings",
            json={"model": EMBED_MODEL, "prompt": EMBED_DOC_PREFIX + text},
            timeout=30,
        )
        response.raise_for_status()
        return response.json().get("embedding")
    except requests.exceptions.RequestException as e:
        print(f"  embedding request failed: {e}")
        return None


def main():
    if not os.path.exists(PDF_PATH):
        sys.exit(f"PDF not found: {PDF_PATH}")

    client = chromadb.PersistentClient(path=CHROMA_PATH)
    collection = client.get_or_create_collection(
        name=COLLECTION, metadata=COLLECTION_METADATA
    )

    stored, skipped = 0, 0
    for i, chunk in enumerate(extract_and_chunk_cocoa(PDF_PATH)):
        if not chunk["text"].strip():
            skipped += 1
            continue

        vector = get_ollama_embedding(chunk["text"])
        if vector is None:
            print(f"Chunk #{i}: skipped (no embedding)")
            skipped += 1
            continue

        collection.add(
            ids=[f"chunk_{i}"],
            embeddings=[vector],
            metadatas=[chunk["metadata"]],
            documents=[chunk["text"]],
        )
        stored += 1
        if stored % 200 == 0:
            print(f"  {stored} chunks stored...")

    print(f"Done. {stored} chunks stored, {skipped} skipped. Collection '{COLLECTION}' is ready.")


if __name__ == "__main__":
    main()
