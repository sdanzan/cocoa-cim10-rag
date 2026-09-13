import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';

import { config } from '../config';

/**
 * Demo authentication: one hard-coded account (`config.auth`). On success it
 * mints a short-lived JWT signed with `JWT_SECRET`.
 */
@Injectable()
export class AuthService {
  constructor(private readonly jwt: JwtService) {}

  async login(username: string, password: string): Promise<{ access_token: string }> {
    if (
      username !== config.auth.username ||
      password !== config.auth.password
    ) {
      throw new UnauthorizedException('Invalid credentials');
    }
    return { access_token: await this.jwt.signAsync({ sub: username }) };
  }
}
