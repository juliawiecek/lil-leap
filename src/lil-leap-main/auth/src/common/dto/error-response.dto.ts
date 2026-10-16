import { ApiProperty } from '@nestjs/swagger';

/** Body of every error response -- see GlobalExceptionFilter. */
export class ErrorResponseDto {
  @ApiProperty({ example: 'INVALID_REQUEST', description: 'Stable machine-readable code.' })
  error: string;

  @ApiProperty({ example: 'The request contains invalid or missing fields.', description: 'Generic, user-safe message.' })
  message: string;
}
