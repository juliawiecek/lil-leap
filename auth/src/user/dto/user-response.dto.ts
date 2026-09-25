import { ApiProperty } from '@nestjs/swagger';
import { User } from '../entities/user.entity';
import { UserRole } from '../user-role.enum';

/**
 * Public user payload returned by register and login.
 * Deliberately minimal -- mirrors `UserResponse`.
 */
export class UserResponseDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ example: 'ada@example.com' })
  email: string;

  @ApiProperty({ enum: UserRole })
  userRole: string;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;

  static from(user: User): UserResponseDto {
    const dto = new UserResponseDto();
    dto.id = user.userId;
    dto.email = user.email;
    dto.userRole = user.userRole;
    dto.createdAt = user.createdAt;
    dto.updatedAt = user.updatedAt;
    return dto;
  }
}
