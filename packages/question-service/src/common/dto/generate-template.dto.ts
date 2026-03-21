import { IsString, IsEnum, IsOptional, IsNotEmpty } from 'class-validator';
import { BloomLevel } from '../interfaces';

export class GenerateTemplateDto {
  @IsString()
  @IsNotEmpty()
  subject!: string;

  @IsString()
  @IsNotEmpty()
  topic!: string;

  @IsString()
  @IsNotEmpty()
  subtopic!: string;

  @IsEnum(BloomLevel)
  bloomLevel!: BloomLevel;

  @IsOptional()
  @IsString()
  exampleTemplate?: string;

  @IsOptional()
  @IsString()
  createdBy?: string;
}
