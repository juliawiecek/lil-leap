import { tlsKeystorePath } from './tls';

describe('tlsKeystorePath', () => {
  const original = process.env.TLS_KEYSTORE;

  afterEach(() => {
    if (original === undefined) {
      delete process.env.TLS_KEYSTORE;
    } else {
      process.env.TLS_KEYSTORE = original;
    }
  });

  it('is undefined when TLS_KEYSTORE is unset, so the service runs plaintext behind nginx', () => {
    delete process.env.TLS_KEYSTORE;

    expect(tlsKeystorePath()).toBeUndefined();
  });

  it('is undefined when TLS_KEYSTORE is empty', () => {
    process.env.TLS_KEYSTORE = '';

    expect(tlsKeystorePath()).toBeUndefined();
  });

  it('returns a plain path as given', () => {
    process.env.TLS_KEYSTORE = '/run/secrets/auth-keystore.p12';

    expect(tlsKeystorePath()).toBe('/run/secrets/auth-keystore.p12');
  });

  it('strips the docker-compose style "file:" prefix', () => {
    process.env.TLS_KEYSTORE = 'file:/run/secrets/auth-keystore.p12';

    expect(tlsKeystorePath()).toBe('/run/secrets/auth-keystore.p12');
  });

  it('strips "file:" only at the start of the value', () => {
    process.env.TLS_KEYSTORE = '/certs/file:keystore.p12';

    expect(tlsKeystorePath()).toBe('/certs/file:keystore.p12');
  });
});
