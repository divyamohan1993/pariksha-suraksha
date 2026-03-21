import { IsNotEmpty, IsString, IsInt, Min } from 'class-validator';

export class StartExamSessionDto {
  @IsString()
  @IsNotEmpty()
  candidateId!: string;

  @IsString()
  @IsNotEmpty()
  examId!: string;

  @IsString()
  @IsNotEmpty()
  centerId!: string;

  @IsInt()
  @Min(1)
  seatNum!: number;
}
