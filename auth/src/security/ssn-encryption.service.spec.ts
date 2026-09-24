import { DataSource } from 'typeorm';
import { SsnEncryptionService } from './ssn-encryption.service';

describe('SsnEncryptionService', () => {
  let query: jest.Mock;
  let service: SsnEncryptionService;

  beforeEach(() => {
    process.env.NEXTTRADE_SECURITY_SSN_ENCRYPTION_KEY = 'test-key';
    query = jest.fn();
    service = new SsnEncryptionService({ query } as unknown as DataSource);
  });

  it('encrypts inside Postgres, passing the SSN and key as parameters', async () => {
    const cipher = Buffer.from('cipher');
    query.mockResolvedValue([{ pgp_sym_encrypt: cipher }]);

    await expect(service.encrypt('123456789')).resolves.toBe(cipher);
    expect(query).toHaveBeenCalledWith(expect.stringContaining('pgp_sym_encrypt($1, $2'), ['123456789', 'test-key']);
  });

  it('decrypts inside Postgres', async () => {
    query.mockResolvedValue([{ pgp_sym_decrypt: '123456789' }]);

    await expect(service.decrypt(Buffer.from('cipher'))).resolves.toBe('123456789');
    expect(query).toHaveBeenCalledWith(expect.stringContaining('pgp_sym_decrypt($1, $2)'), [Buffer.from('cipher'), 'test-key']);
  });

  it('rejects an empty SSN without querying', async () => {
    await expect(service.encrypt('   ')).rejects.toThrow('SSN cannot be null or empty');
    await expect(service.decrypt(Buffer.alloc(0))).rejects.toThrow('Encrypted SSN cannot be null or empty');
    expect(query).not.toHaveBeenCalled();
  });
});
