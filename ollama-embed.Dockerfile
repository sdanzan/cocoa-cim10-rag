# A small, embedding-only Ollama. nomic-embed-text is 274 MB (unlike the
# multi-GB generation models), so it's baked into the image at build time:
# start the server in the background just long enough to pull the model, which
# then gets committed into the image layer.
FROM ollama/ollama:latest

RUN (ollama serve &) && sleep 3 && ollama pull nomic-embed-text && sleep 1

EXPOSE 11434
