import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsNotEmpty, IsOptional, IsString, Matches, MaxLength } from 'class-validator';

/** Same shape the sign-up form accepts: an optional leading +, then digits and ( ) . - or spaces. */
export const PHONE_PATTERN = /^\+?[0-9() .-]{7,20}$/;
export const PHONE_MIN_DIGITS = 7;
export const ADDRESS_MAX_LENGTH = 255;

const trimmed = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

/** Body of PATCH /auth/me/profile. Send only the fields that change; at least one is required. */
export class UpdateProfileRequestDto {
  @ApiPropertyOptional({ maxLength: ADDRESS_MAX_LENGTH, example: '123 Main Street, Apt 4, Chicago, IL, 60601' })
  @IsOptional()
  @Transform(trimmed)
  @IsString()
  @IsNotEmpty()
  @MaxLength(ADDRESS_MAX_LENGTH)
  address?: string;

  @ApiPropertyOptional({ maxLength: 20, example: '312-555-0123', description: 'At least 7 digits; may start with + and a country code.' })
  @IsOptional()
  @Transform(trimmed)
  @IsString()
  @Matches(PHONE_PATTERN)
  phone?: string;
}
