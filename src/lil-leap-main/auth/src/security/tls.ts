/**
 * Path from TLS_KEYSTORE ("file:" prefix optional, matching docker-compose's secret mount),
 * or undefined when the service runs plaintext behind nginx, which terminates TLS.
 */
export function tlsKeystorePath(): string | undefined {
  const raw = process.env.TLS_KEYSTORE;
  return raw ? raw.replace(/^file:/, '') : undefined;
}
