import { Module } from '@nestjs/common';
import { PipelineModule } from '../pipeline/pipeline.module';
import { HealthController } from './health.controller';

@Module({
  // PipelineModule re-exports the Bull queue registrations the controller
  // introspects for /health/queues.
  imports: [PipelineModule],
  controllers: [HealthController],
})
export class HealthModule {}
