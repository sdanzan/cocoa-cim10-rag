import {
  Controller,
  Post,
  Get,
  Body,
  HttpException,
  HttpStatus,
  UseGuards,
} from '@nestjs/common';
import { RAGService } from './services/rag.service';
import { JwtAuthGuard } from './auth/jwt-auth.guard';
import { RagRequestDto } from './dto/rag-request.dto';
import { RagResponseDto } from './dto/rag-response.dto';

@Controller()
export class AppController {
  constructor(private readonly ragService: RAGService) {}

  /** Reports whether the ChromaDB collection is reachable. Public. */
  @Get('rag-health')
  health() {
    return this.ragService.health();
  }

  /** Requires a bearer token from POST /auth/login. */
  @UseGuards(JwtAuthGuard)
  @Post('suggest_code')
  async suggestCode(
    @Body() ragRequest: RagRequestDto,
  ): Promise<RagResponseDto> {
    const symptom = ragRequest?.symptom?.trim();

    if (!symptom) {
      throw new HttpException('Symptom is required', HttpStatus.BAD_REQUEST);
    }
    if (symptom.length > 100) {
      throw new HttpException(
        'Symptom must be at most 100 characters',
        HttpStatus.BAD_REQUEST,
      );
    }

    // ServiceUnavailableException (ChromaDB / Ollama down) propagates as 503.
    return this.ragService.suggestCodes(symptom);
  }
}
