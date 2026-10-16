import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class UpdateProfileRequestDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(20)
  phone?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(1000)
  address?: string;
}