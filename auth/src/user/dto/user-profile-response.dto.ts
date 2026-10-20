import { ApiProperty } from '@nestjs/swagger';
import { CustomerProfile } from '../../onboarding/entities/customer-profile.entity';

/** Sanitized identity/contact profile. Sensitive onboarding and authentication fields are intentionally omitted. */
export class UserProfileResponseDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty()
  firstName: string;

  @ApiProperty()
  lastName: string;

  @ApiProperty()
  address: string;

  @ApiProperty()
  email: string;

  @ApiProperty()
  phone: string;

  static from(profile: CustomerProfile): UserProfileResponseDto {
    const dto = new UserProfileResponseDto();
    dto.id = profile.user.userId;
    dto.firstName = profile.firstName;
    dto.lastName = profile.lastName;
    dto.address = profile.address;
    dto.email = profile.user.email;
    dto.phone = profile.phone;
    return dto;
  }
}