import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  HttpCode,
  HttpStatus,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { TemplatesService } from './templates.service';
import { CreateTemplateDto } from '../common/dto/create-template.dto';
import { UpdateTemplateDto } from '../common/dto/update-template.dto';
import { GenerateTemplateDto } from '../common/dto/generate-template.dto';
import { ListTemplatesQueryDto } from '../common/dto/list-templates-query.dto';
import { QuestionTemplate } from '../common/interfaces';

@Controller('questions')
@UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
export class TemplatesController {
  constructor(private readonly templatesService: TemplatesService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(@Body() dto: CreateTemplateDto): Promise<QuestionTemplate> {
    return this.templatesService.create(dto);
  }

  @Post('generate')
  @HttpCode(HttpStatus.CREATED)
  async generate(@Body() dto: GenerateTemplateDto): Promise<QuestionTemplate> {
    return this.templatesService.generateAndCreate(dto);
  }

  @Get()
  async list(
    @Query() query: ListTemplatesQueryDto,
  ): Promise<{ items: QuestionTemplate[]; nextPageToken: string | null }> {
    return this.templatesService.list(query);
  }

  @Get(':id')
  async getById(@Param('id') id: string): Promise<QuestionTemplate> {
    return this.templatesService.getById(id);
  }

  @Put(':id')
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateTemplateDto,
  ): Promise<QuestionTemplate> {
    return this.templatesService.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async delete(@Param('id') id: string): Promise<void> {
    return this.templatesService.delete(id);
  }

  @Post(':id/field-test')
  @HttpCode(HttpStatus.ACCEPTED)
  async triggerFieldTest(@Param('id') id: string): Promise<{ messageId: string }> {
    return this.templatesService.triggerFieldTest(id);
  }
}
