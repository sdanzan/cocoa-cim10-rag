# ChromaDB HTTP server, pinned to the same `chromadb` version used to build
# rag_database/ and to run `npm run chroma` locally. Using the pip package (rather
# than the official chromadb/chroma image) guarantees the exact same server code
# path that the JS client is already known to work with.
FROM python:3.12-slim

RUN pip install --no-cache-dir "chromadb==1.5.9"

EXPOSE 8000

# The persistence directory is provided as a volume by docker-compose.
CMD ["chroma", "run", "--host", "0.0.0.0", "--port", "8000", "--path", "/data"]
