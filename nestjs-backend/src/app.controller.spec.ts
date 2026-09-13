import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { HttpException } from '@nestjs/common';

import { AppController } from './app.controller';
import { RAGService } from './services/rag.service';

describe('AppController', () => {
  let controller: AppController;
  let ragService: { suggestCodes: Mock; health: Mock };

  beforeEach(() => {
    ragService = { suggestCodes: vi.fn(), health: vi.fn() };
    controller = new AppController(ragService as unknown as RAGService);
  });

  describe('POST /suggest_code', () => {
    const expectRejectedWith400 = async (body: unknown) => {
      expect.assertions(3);
      try {
        await controller.suggestCode(body as any);
      } catch (err) {
        expect(err).toBeInstanceOf(HttpException);
        expect((err as HttpException).getStatus()).toBe(400);
      }
      expect(ragService.suggestCodes).not.toHaveBeenCalled();
    };

    it('rejects a missing body', () => expectRejectedWith400(undefined));
    it('rejects a missing symptom', () => expectRejectedWith400({}));
    it('rejects an empty symptom', () => expectRejectedWith400({ symptom: '   ' }));
    it('rejects a symptom longer than 100 characters', () =>
      expectRejectedWith400({ symptom: 'x'.repeat(101) }));

    it('trims the symptom and delegates to the service', async () => {
      ragService.suggestCodes.mockResolvedValue({ query: 'Fièvre', suggestions: [] });

      const result = await controller.suggestCode({ symptom: '  Fièvre  ' });

      expect(ragService.suggestCodes).toHaveBeenCalledWith('Fièvre');
      expect(result).toEqual({ query: 'Fièvre', suggestions: [] });
    });
  });

  describe('GET /rag-health', () => {
    it('delegates to the service', async () => {
      const status = { chroma: true, chunks: 10, collection: 'cocoa_cim10_v2' };
      ragService.health.mockResolvedValue(status);

      await expect(controller.health()).resolves.toEqual(status);
    });
  });
});
