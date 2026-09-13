import { beforeEach, describe, expect, it, vi } from 'vitest';
import { UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';

import { AuthService } from './auth.service';

describe('AuthService', () => {
  let jwt: { signAsync: ReturnType<typeof vi.fn> };
  let service: AuthService;

  beforeEach(() => {
    jwt = { signAsync: vi.fn().mockResolvedValue('signed.jwt.token') };
    service = new AuthService(jwt as unknown as JwtService);
  });

  it('issues a token for the configured demo account', async () => {
    // config defaults: demo / demo
    await expect(service.login('demo', 'demo')).resolves.toEqual({
      access_token: 'signed.jwt.token',
    });
    expect(jwt.signAsync).toHaveBeenCalledWith({ sub: 'demo' });
  });

  it('rejects a wrong password', async () => {
    await expect(service.login('demo', 'nope')).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(jwt.signAsync).not.toHaveBeenCalled();
  });

  it('rejects an unknown user', async () => {
    await expect(service.login('someone', 'demo')).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });
});
