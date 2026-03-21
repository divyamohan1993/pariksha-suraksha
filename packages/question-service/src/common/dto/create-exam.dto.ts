import {
  IsString,
  IsArray,
  IsNumber,
  IsNotEmpty,
  IsDateString,
  Min,
  IsOptional,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class DifficultyDistributionDto {
  @IsNumber()
  @Min(0)
  easy!: number;

  @IsNumber()
  @Min(0)
  medium!: number;

  @IsNumber()
  @Min(0)
  hard!: number;
}

export class TopicCoverageDto {
  @IsString()
  @IsNotEmpty()
  topic!: string;

  @IsArray()
  @IsString({ each: true })
  subtopics!: string[];

  @IsNumber()
  @Min(1)
  questionCount!: number;

  @IsNumber()
  @Min(0)
  weight!: number;
}

export class CreateExamDto {
  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsDateString()
  date!: string;

  @IsArray()
  @IsString({ each: true })
  subjects!: string[];

  @IsNumber()
  @Min(1)
  totalQuestions!: number;

  @IsNumber()
  @Min(1)
  totalCandidates!: number;

  @IsOptional()
  @IsString()
  createdBy?: string;
}

export class DefineExamBlueprintDto {
  @ValidateNested()
  @Type(() => DifficultyDistributionDto)
  difficultyDist!: DifficultyDistributionDto;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TopicCoverageDto)
  topicCoverage!: TopicCoverageDto[];

  @IsNumber()
  @Min(1)
  questionsPerPaper!: number;
}
