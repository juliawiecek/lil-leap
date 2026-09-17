/** Keep the credential UI unavailable when the page itself was loaded over HTTP. */
export async function startSecureApplication(
  protocol: string,
  bootstrap: () => Promise<unknown>,
  showHttpsRequired: () => void,
): Promise<void> {
  if (protocol !== 'https:') {
    showHttpsRequired();
    return;
  }
  try {
    await bootstrap();
  } catch {
    console.error('Application startup failed.');
  }
}

export function reportApplicationError(_error: unknown): void {
  // Deliberately do not inspect error objects: messages, stacks and HTTP data may contain secrets.
  console.error('An application error occurred.');
}
