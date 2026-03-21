import {
  IsNotEmpty,
  IsString,
  IsArray,
  ValidateNested,
  IsInt,
  IsBoolean,
  IsOptional,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';

export class QuestionResponseDto {
  @IsInt()
  @Min(1)
  questionPosition!: number;

  @IsString()
  @IsNotEmpty()
  templateId!: string;

  @IsString()
  @IsNotEmpty()
  paramInstantiationId!: string;

  @IsString()
  @IsOptional()
  selectedChoice!: string | null;

  @IsBoolean()
  markedForReview!: boolean;

  @IsBoolean()
  visited!: boolean;

  @IsInt()
  @Min(0)
  timeSpentMs!: number;
}

export class SubmitResponsesDto {
  @IsString()
  @IsNotEmpty()
  candidateId!: string;

  @IsString()
  @IsNotEmpty()
  examId!: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => QuestionResponseDto)
  responses!: QuestionResponseDto[];
}
