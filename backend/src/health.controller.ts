import { Controller, Get } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Controller('health')
export class HealthController {
  constructor(private readonly config: ConfigService) {}

  @Get()
  check() {
    return {
      status: 'ok',
      emailMode: this.config.get<string>('app.emailMode'),
      time: new Date().toISOString(),
    };
  }
}
