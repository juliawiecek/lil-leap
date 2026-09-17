import { Column, CreateDateColumn, Entity, JoinColumn, OneToOne, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { User } from '../../user/entities/user.entity';
import { CitizenshipStatus } from '../enums/citizenship-status.enum';

/** Identity and contact profile, separated from authentication data. */
@Entity({ name: 'customer_profiles' })
export class CustomerProfile {
  @PrimaryGeneratedColumn('uuid', { name: 'profile_id' })
  profileId: string;

  @OneToOne(() => User, { nullable: false })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ name: 'first_name', length: 100 })
  firstName: string;

  @Column({ name: 'last_name', length: 100 })
  lastName: string;

  @Column({ name: 'phone', length: 20 })
  phone: string;

  @Column({ name: 'address' })
  address: string;

  @Column({ name: 'country', length: 100, nullable: true })
  country: string | null;

  @Column({ name: 'date_of_birth', type: 'date' })
  dateOfBirth: string;

  @Column({ name: 'ssn_encrypted', type: 'bytea' })
  ssnEncrypted: Buffer;

  @Column({ name: 'citizenship_status', length: 50, nullable: true })
  citizenshipStatus: CitizenshipStatus | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
