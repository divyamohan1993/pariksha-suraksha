import { Module, Global } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { FabricService } from './fabric.service';

@Global()
@Module({
  imports: [ConfigModule],
  providers: [FabricService],
  exports: [FabricService],
})
export class FabricModule {}
