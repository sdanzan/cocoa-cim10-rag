import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AuthModule } from './auth/auth.module';
import { config } from './config';
import { RAGService } from './services/rag.service';
import { PassageRetriever } from './retrieval/passage-retriever';
import { ChromaPassageRetriever } from './retrieval/chroma-passage-retriever';
import { CodeSuggester } from './generation/code-suggester';
import { OllamaCodeSuggester } from './generation/ollama-code-suggester';
import { OpenAiCodeSuggester } from './generation/openai-code-suggester';

@Module({
  imports: [AuthModule],
  controllers: [AppController],
  providers: [
    RAGService,
    { provide: PassageRetriever, useClass: ChromaPassageRetriever },
    {
      provide: CodeSuggester,
      // Selected at boot by LLM_PROVIDER (default 'ollama'); restart to change.
      useClass:
        config.llm.provider === 'openai'
          ? OpenAiCodeSuggester
          : OllamaCodeSuggester,
    },
  ],
})
export class AppModule {}
