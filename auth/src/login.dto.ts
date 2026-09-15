import { IsString, IsNotEmpty } from "class-validator";
import { ApiProperty } from "@nestjs/swagger";

export class LoginDto {
  @ApiProperty({ example: "alice", description: "Registered username" })
  @IsString()
  @IsNotEmpty()
  username!: string;

  @ApiProperty({ example: "mission123", description: "Plain-text password, checked against the stored bcrypt hash" })
  @IsString()
  @IsNotEmpty()
  password!: string;
}
