import { ChromaClient, IncludeEnum } from 'chromadb';
import { config } from '../src/config';
import { OllamaEmbeddingFunction } from '../src/retrieval/ollama-embedding.function';

(async () => {
  const client = new ChromaClient({ path: config.chroma.url });
  const col = await client.getCollection({
    name: config.chroma.collection,
    embeddingFunction: new OllamaEmbeddingFunction(
      config.ollama.embedUrl,
      config.ollama.embedModel,
      config.ollama.embedQueryPrefix,
    ),
  });
  const q = process.argv[2] ?? 'Toux purulente';
  const r = await col.query({
    queryTexts: [q],
    nResults: 5,
    include: [IncludeEnum.Documents, IncludeEnum.Metadatas, IncludeEnum.Distances],
  });
  r.documents[0].forEach((d, i) => {
    console.log('---', i, 'dist=', r.distances?.[0][i], JSON.stringify(r.metadatas[0][i]));
    console.log((d ?? '').slice(0, 300));
  });
})();
