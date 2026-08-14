import { Global, Module } from '@nestjs/common';
import { CryptoService } from './crypto.service';

/** App-wide utilities: secret encryption, shared decorators/filters. */
@Global()
@Module({
  providers: [CryptoService],
  exports: [CryptoService],
})
export class CommonModule {}
