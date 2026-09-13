import { join } from 'path';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import * as morgan from 'morgan';
import { AppModule } from './app.module';
import { config } from './config';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  app.enableCors();

  // Minimal security headers (no CSP: the test UI uses an inline script).
  app.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    next();
  });

  app.use(morgan('tiny'));

  // Serve the test UI (public/index.html) at "/".
  // __dirname is src/ under ts-node and dist/ after build; ".." lands on the
  // package root in both cases.
  app.useStaticAssets(join(__dirname, '..', 'public'));

  await app.listen(config.http.port);
}

bootstrap();
