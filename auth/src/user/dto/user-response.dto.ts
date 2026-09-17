import { User } from '../entities/user.entity';

/**
 * Public user payload returned by register, login, and refresh endpoints.
 * Deliberately minimal -- mirrors `UserResponse`.
 */
export class UserResponseDto {
  id: string;
  email: string;
  userRole: string;
  createdAt: Date;
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
