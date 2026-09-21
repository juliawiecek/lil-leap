import { PasswordEncoderService } from './password-encoder.service';

describe('PasswordEncoderService', () => {
  const service = new PasswordEncoderService();

  it('encodes with the {bcrypt} id prefix NextTrade backend expects', () => {
    const hash = service.encode('correct horse battery staple');
    expect(hash.startsWith('{bcrypt}')).toBe(true);
  });

  it('matches a password against its own encoded hash', () => {
    const hash = service.encode('correct horse battery staple');
    expect(service.matches('correct horse battery staple', hash)).toBe(true);
    expect(service.matches('wrong password', hash)).toBe(false);
  });

  it('matches a bare bcrypt hash without the {bcrypt} prefix (interop with existing rows)', () => {
    const hash = service.encode('correct horse battery staple').replace('{bcrypt}', '');
    expect(service.matches('correct horse battery staple', hash)).toBe(true);
  });
});
