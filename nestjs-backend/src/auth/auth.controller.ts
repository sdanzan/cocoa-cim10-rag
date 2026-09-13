import { Body, Controller, Post } from '@nestjs/common';

import { AuthService } from './auth.service';
import { LoginDto } from './login.dto';

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  /** Exchange demo credentials for a bearer token. */
  @Post('login')
  login(@Body() dto: LoginDto) {
    return this.auth.login(dto?.username, dto?.password);
  }
}
