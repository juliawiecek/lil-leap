import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';

/**
 * Encrypts/decrypts SSNs via Postgres pgcrypto (`pgp_sym_encrypt`/`_decrypt`)
 * so plaintext never passes through application memory or logs. The key
 * (`NEXTTRADE_SECURITY_SSN_ENCRYPTION_KEY`) must match NextTrade backend's,
 * since both read and write the same encrypted column.
 */
@Injectable()
export class SsnEncryptionService {
  private readonly encryptionKey: string;

  constructor(private readonly dataSource: DataSource) {
    this.encryptionKey = process.env.NEXTTRADE_SECURITY_SSN_ENCRYPTION_KEY ?? '';
  }

  async encrypt(plainTextSsn: string): Promise<Buffer> {
    if (!plainTextSsn || plainTextSsn.trim().length === 0) {
      throw new Error('SSN cannot be null or empty');
    }

    const result = await this.dataSource.query<Array<{ pgp_sym_encrypt: Buffer }>>(
      "SELECT pgp_sym_encrypt($1, $2, 'cipher-algo=aes256') as pgp_sym_encrypt",
      [plainTextSsn, this.encryptionKey],
    );
    return result[0].pgp_sym_encrypt;
  }

  async decrypt(encryptedSsn: Buffer): Promise<string> {
    if (!encryptedSsn || encryptedSsn.length === 0) {
      throw new Error('Encrypted SSN cannot be null or empty');
    }

    const result = await this.dataSource.query<Array<{ pgp_sym_decrypt: string }>>(
      'SELECT pgp_sym_decrypt($1, $2) as pgp_sym_decrypt',
      [encryptedSsn, this.encryptionKey],
    );
    return result[0].pgp_sym_decrypt;
  }
}
