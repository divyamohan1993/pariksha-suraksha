import { IsNotEmpty, IsString } from 'class-validator';

export class RunCollusionDetectionDto {
  @IsString()
  @IsNotEmpty()
  examId!: string;
}
