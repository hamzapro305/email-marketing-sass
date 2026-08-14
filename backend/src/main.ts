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

  // Drain in-flight HTTP requests and BullMQ jobs on SIGTERM (Docker stop /
  // rolling deploys) instead of dropping them mid-stage.
  app.enableShutdownHooks();

  // CORS. `*` (or unset) reflects any origin — fine for local development. In
  // production the SPA is served from the same origin through nginx, so set
  // CORS_ORIGIN to a comma-separated allow-list (or leave it strict).
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

  const role = config.get<string>('app.role') ?? 'all';
  logger.log(`🚀 Backend (${role}) listening on http://localhost:${port}/api`);
}

bootstrap();
