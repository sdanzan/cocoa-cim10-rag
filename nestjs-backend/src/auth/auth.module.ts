import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';

import { config } from '../config';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './jwt-auth.guard';

@Module({
  imports: [
    JwtModule.register({
      global: true, // JwtService is needed wherever JwtAuthGuard is applied
      secret: config.auth.jwtSecret,
      signOptions: { expiresIn: config.auth.tokenTtlSeconds },
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtAuthGuard],
  exports: [JwtAuthGuard],
})
export class AuthModule {}
