import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';

import { JwtAuthGuard } from './jwt-auth.guard';

const contextFor = (authorization?: string) => {
  const req: { headers: Record<string, string>; user?: unknown } = {
    headers: authorization ? { authorization } : {},
  };
  const ctx = {
    switchToHttp: () => ({ getRequest: () => req }),
  } as unknown as ExecutionContext;
  return { ctx, req };
};

describe('JwtAuthGuard', () => {
  let jwt: { verifyAsync: ReturnType<typeof vi.fn> };
  let guard: JwtAuthGuard;

  beforeEach(() => {
    jwt = { verifyAsync: vi.fn() };
    guard = new JwtAuthGuard(jwt as unknown as JwtService);
  });

  it('allows a request with a valid bearer token and attaches the payload', async () => {
    jwt.verifyAsync.mockResolvedValue({ sub: 'demo' });
    const { ctx, req } = contextFor('Bearer good.token');

    await expect(guard.canActivate(ctx)).resolves.toBe(true);
    expect(jwt.verifyAsync).toHaveBeenCalledWith('good.token');
    expect(req.user).toEqual({ sub: 'demo' });
  });

  it('rejects a missing Authorization header', async () => {
    const { ctx } = contextFor();
    await expect(guard.canActivate(ctx)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects a non-Bearer scheme', async () => {
    const { ctx } = contextFor('Basic Zm9vOmJhcg==');
    await expect(guard.canActivate(ctx)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects an invalid or expired token', async () => {
    jwt.verifyAsync.mockRejectedValue(new Error('jwt expired'));
    const { ctx } = contextFor('Bearer stale.token');

    await expect(guard.canActivate(ctx)).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
