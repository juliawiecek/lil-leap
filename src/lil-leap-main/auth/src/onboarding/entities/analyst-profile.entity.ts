import { Column, CreateDateColumn, Entity, JoinColumn, OneToOne, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { User } from '../../user/entities/user.entity';

/**
 * Internal analyst profile -- the ANALYST-role counterpart to CustomerProfile,
 * scoped to what an internal analyst actually needs.
 */
@Entity({ name: 'analyst_profiles' })
export class AnalystProfile {
  @PrimaryGeneratedColumn('uuid', { name: 'analyst_profile_id' })
  analystProfileId: string;

  @OneToOne(() => User, { nullable: false })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ name: 'employee_id', length: 30 })
  employeeId: string;

  @Column({ name: 'department', type: 'varchar', length: 100, nullable: true })
  department: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
