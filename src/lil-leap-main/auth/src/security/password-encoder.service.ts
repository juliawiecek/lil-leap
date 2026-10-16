import { Injectable } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';

const BCRYPT_ID = '{bcrypt}';
const BCRYPT_ROUNDS = 10;

/**
 * Wraps bcrypt with the `{bcrypt}` id prefix NextTrade backend also writes,
 * so a hash from either service verifies on both -- they share the same
 * `users.password_hash` column.
 */
@Injectable()
export class PasswordEncoderService {
  encode(rawPassword: string): string {
    return BCRYPT_ID + bcrypt.hashSync(rawPassword, BCRYPT_ROUNDS);
  }

  matches(rawPassword: string, storedHash: string): boolean {
    const hash = storedHash.startsWith(BCRYPT_ID) ? storedHash.slice(BCRYPT_ID.length) : storedHash;
    return bcrypt.compareSync(rawPassword, hash);
  }
}
