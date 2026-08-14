import { Controller, Get } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { ConfigService } from '@nestjs/config';
import { InjectConnection } from '@nestjs/mongoose';
import { Queue } from 'bullmq';
import { Connection } from 'mongoose';
import { RedisCoordinationService } from '../redis/redis-coordination.service';
import { PIPELINE_QUEUE } from '../pipeline/pipeline.constants';
import { SEND_QUEUE } from '../campaigns/queue.constants';

/**
 * Health endpoints used by Docker healthchecks, the load balancer, and humans:
 *
 *   GET /api/health        — liveness + dependency status (Mongo, Redis)
 *   GET /api/health/queues — live depth of both work queues
 */
@Controller('health')
export class HealthController {
  private readonly role: string;
  private readonly instanceId: string;

  constructor(
    @InjectConnection() private readonly mongo: Connection,
    private readonly redis: RedisCoordinationService,
    @InjectQueue(PIPELINE_QUEUE) private readonly pipelineQueue: Queue,
    @InjectQueue(SEND_QUEUE) private readonly sendQueue: Queue,
    config: ConfigService,
  ) {
    this.role = config.get<string>('app.role') ?? 'all';
    this.instanceId = config.get<string>('app.instanceId') ?? 'backend';
  }

  @Get()
  async check() {
    const mongoUp = this.mongo.readyState === 1;
    const redisUp = await this.redis.ping();
    const healthy = mongoUp && redisUp;
    return {
      status: healthy ? 'ok' : 'degraded',
      role: this.role,
      instanceId: this.instanceId,
      mongo: mongoUp ? 'up' : 'down',
      redis: redisUp ? 'up' : 'down',
      time: new Date().toISOString(),
    };
  }

  @Get('queues')
  async queues() {
    const counts = (q: Queue) =>
      q.getJobCounts('waiting', 'active', 'delayed', 'failed', 'completed');
    const [pipeline, send] = await Promise.all([
      counts(this.pipelineQueue),
      counts(this.sendQueue),
    ]);
    return { pipeline, send };
  }
}
