import {
  IsString,
  IsEnum,
  IsArray,
  ValidateNested,
  IsOptional,
  IsNumber,
  Min,
  Max,
  IsNotEmpty,
} from 'class-validator';
import { Type } from 'class-transformer';
import { BloomLevel, DistractorType, ParameterType } from '../interfaces';

export class ParameterDefinitionDto {
  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsEnum(ParameterType)
  type!: ParameterType;

  @IsOptional()
  @IsNumber()
  min?: number;

  @IsOptional()
  @IsNumber()
  max?: number;

  @IsOptional()
  @IsNumber()
  step?: number;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  allowedValues?: string[];

  @IsOptional()
  @IsString()
  unit?: string;

  @IsString()
  @IsNotEmpty()
  description!: string;
}

export class DistractorDefinitionDto {
  @IsString()
  @IsNotEmpty()
  formula!: string;

  @IsEnum(DistractorType)
  type!: DistractorType;

  @IsString()
  @IsNotEmpty()
  label!: string;

  @IsString()
  @IsNotEmpty()
  explanation!: string;
}

export class CreateTemplateDto {
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

  @IsString()
  @IsNotEmpty()
  templateText!: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ParameterDefinitionDto)
  parameters!: ParameterDefinitionDto[];

  @IsString()
  @IsNotEmpty()
  answerFormula!: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => DistractorDefinitionDto)
  distractors!: DistractorDefinitionDto[];

  @IsOptional()
  @IsString()
  createdBy?: string;
}
