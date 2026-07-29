import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: false });
  const config = app.get(ConfigService);
  const logger = new Logger('Bootstrap');

  // All routes are served under /api.
  app.setGlobalPrefix('api');

  // Validate + transform every request DTO; strip unknown properties.
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: false,
    }),
  );

  // CORS. `*` (or unset) reflects any origin — fine for local/demo and for the
  // packaged desktop app (which sends `Origin: null` / a file:// origin). In
  // production set CORS_ORIGIN to a comma-separated allow-list.
  const corsOrigin = config.get<string>('app.corsOrigin') ?? '*';
  app.enableCors({
    origin:
      corsOrigin === '*'
        ? true
        : corsOrigin.split(',').map((o) => o.trim()).filter(Boolean),
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'x-session-id'],
    credentials: false,
  });

  const port = config.get<number>('app.port') ?? 3000;
  await app.listen(port, '0.0.0.0');

  logger.log(`🚀 Backend listening on http://localhost:${port}/api`);
}

bootstrap();
