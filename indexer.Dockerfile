# Builds rag_database/ from CoCoA.pdf. Not part of the serving path — run
# explicitly with `docker compose --profile indexer run --rm indexer` (see
# docker-compose.yml). Reuses python-src/chunkize_new.py unmodified; it's
# already fully driven by env vars (CHROMA_PATH, CHROMA_COLLECTION, OLLAMA_URL,
# EMBED_DOC_PREFIX, CHROMA_SPACE, ...).
FROM python:3.12-slim
WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY python-src/chunkize_new.py .
COPY CoCoA.pdf .

CMD ["python", "chunkize_new.py"]
