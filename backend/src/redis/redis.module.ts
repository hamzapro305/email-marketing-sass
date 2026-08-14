import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { REDIS_CLIENT } from './redis.constants';
import { RedisCoordinationService } from './redis-coordination.service';

/**
 * One shared ioredis connection for app-level coordination (distributed locks,
 * per-domain scrape pacing, health pings). BullMQ manages its own connections.
 */
@Global()
@Module({
  providers: [
    {
      provide: REDIS_CLIENT,
      inject: [ConfigService],
      useFactory: (config: ConfigService) =>
        new Redis({
          host: config.get<string>('app.redis.host'),
          port: config.get<number>('app.redis.port'),
          maxRetriesPerRequest: 2,
          enableOfflineQueue: true,
        }),
    },
    RedisCoordinationService,
  ],
  exports: [REDIS_CLIENT, RedisCoordinationService],
})
export class RedisModule {}
