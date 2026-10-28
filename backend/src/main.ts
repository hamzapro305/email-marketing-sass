import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module';
import { getConnectionToken } from '@nestjs/mongoose';
import { Connection } from 'mongoose';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: false });
  const config = app.get(ConfigService);
  const db = app.get<Connection>(getConnectionToken()).db!;
  // Existing browser-local workspaces now belong to the one administrator.
  const settings = db.collection('ai_settings');
  const settingsRows = await settings.find({}).sort({ updatedAt: -1 }).toArray();
  if (settingsRows.length) {
    const keep = settingsRows.find((row) => row.sessionId === 'admin') ?? settingsRows[0];
    await settings.deleteMany({ _id: { $ne: keep._id } });
    await settings.updateOne({ _id: keep._id }, { $set: { sessionId: 'admin' } });
  }
  const suppressions = db.collection('suppressions');
  const rows = await suppressions.find({}).sort({ createdAt: -1 }).toArray();
  const seen = new Set<string>();
  const keepIds = rows.filter((row) => {
    if (seen.has(row.email)) return false;
    seen.add(row.email);
    return true;
  }).map((row) => row._id);
  await suppressions.deleteMany({ _id: { $nin: keepIds } });
  await suppressions.updateMany({}, { $set: { sessionId: 'admin' } });
  for (const name of ['campaigns', 'leads', 'campaign_files', 'smtp_accounts', 'llm_accounts']) {
    await db.collection(name).updateMany({}, { $set: { sessionId: 'admin' } });
  }
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
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: false,
  });

  const port = config.get<number>('app.port') ?? 3000;
  await app.listen(port, '0.0.0.0');

  const role = config.get<string>('app.role') ?? 'all';
  logger.log(`🚀 Backend (${role}) listening on http://localhost:${port}/api`);
}

bootstrap();
