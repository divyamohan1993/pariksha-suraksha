import {
  IsString,
  IsEnum,
  IsArray,
  ValidateNested,
  IsOptional,
  IsNumber,
} from 'class-validator';
import { Type } from 'class-transformer';
import { BloomLevel } from '../interfaces';
import { ParameterDefinitionDto, DistractorDefinitionDto } from './create-template.dto';

export class UpdateIrtParamsDto {
  @IsNumber()
  aMean!: number;

  @IsNumber()
  aStd!: number;

  @IsNumber()
  bMean!: number;

  @IsNumber()
  bStd!: number;

  @IsNumber()
  cMean!: number;

  @IsNumber()
  cStd!: number;
}

export class UpdateTemplateDto {
  @IsOptional()
  @IsString()
  subject?: string;

  @IsOptional()
  @IsString()
  topic?: string;

  @IsOptional()
  @IsString()
  subtopic?: string;

  @IsOptional()
  @IsEnum(BloomLevel)
  bloomLevel?: BloomLevel;

  @IsOptional()
  @IsString()
  templateText?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ParameterDefinitionDto)
  parameters?: ParameterDefinitionDto[];

  @IsOptional()
  @IsString()
  answerFormula?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => DistractorDefinitionDto)
  distractors?: DistractorDefinitionDto[];

  @IsOptional()
  @ValidateNested()
  @Type(() => UpdateIrtParamsDto)
  irtParams?: UpdateIrtParamsDto;

  @IsOptional()
  @IsString()
  status?: 'draft' | 'review' | 'field_testing' | 'calibrated' | 'production' | 'retired';
}
