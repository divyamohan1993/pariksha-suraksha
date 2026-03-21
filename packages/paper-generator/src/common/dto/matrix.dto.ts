import { IsNotEmpty, IsString, IsOptional } from 'class-validator';

export class TriggerMatrixDto {
  @IsString()
  @IsNotEmpty()
  examId!: string;
}

export class GetMatrixStatusDto {
  @IsString()
  @IsNotEmpty()
  examId!: string;
}

export class GetAssignmentDto {
  @IsString()
  @IsNotEmpty()
  examId!: string;

  @IsString()
  @IsNotEmpty()
  centerId!: string;

  @IsString()
  @IsNotEmpty()
  seatNum!: string;
}

export class PreloadMatrixDto {
  @IsString()
  @IsNotEmpty()
  examId!: string;
}

export class PreWarmCacheDto {
  @IsString()
  @IsNotEmpty()
  examId!: string;

  @IsOptional()
  @IsString()
  durationMinutes?: string;
}
