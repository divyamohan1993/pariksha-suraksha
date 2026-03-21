import {
  IsNotEmpty,
  IsString,
  IsArray,
  ValidateNested,
  IsInt,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import { QuestionResponseDto } from './submit-responses.dto';

export class SaveCheckpointDto {
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

  @IsInt()
  @Min(1)
  currentQuestionPosition!: number;

  @IsInt()
  @Min(0)
  elapsedMs!: number;
}
