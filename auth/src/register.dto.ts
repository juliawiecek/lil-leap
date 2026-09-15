import { IsString, IsNotEmpty, MinLength } from "class-validator";
import { ApiProperty } from "@nestjs/swagger";

export class RegisterDto {
  @ApiProperty({ example: "alice", minLength: 3, description: "Desired username, must not already be registered" })
  @IsString()
  @IsNotEmpty()
  @MinLength(3)
  username!: string;

  @ApiProperty({ example: "mission123", minLength: 8, description: "Plain-text password - hashed with bcrypt before storage" })
  @IsString()
  @MinLength(8)
  password!: string;
}
