import { Module } from '@nestjs/common';
import { TemplatesController } from './templates.controller';
import { TemplatesService } from './templates.service';
import { GeminiModule } from '../gemini/gemini.module';
import { ValidationModule } from '../validation/validation.module';

@Module({
  imports: [GeminiModule, ValidationModule],
  controllers: [TemplatesController],
  providers: [TemplatesService],
  exports: [TemplatesService],
})
export class TemplatesModule {}
