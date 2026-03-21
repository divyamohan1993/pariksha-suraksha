import { IsString, IsEnum, IsOptional, IsNumber, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';
import { BloomLevel } from '../interfaces';

export class ListTemplatesQueryDto {
  @IsOptional()
  @IsString()
  subject?: string;

  @IsOptional()
  @IsString()
  topic?: string;

  @IsOptional()
  @IsEnum(BloomLevel)
  bloomLevel?: BloomLevel;

  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(100)
  limit?: number;

  @IsOptional()
  @IsString()
  startAfter?: string;
}
