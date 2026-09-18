/** Bootstrap the application while keeping startup errors out of logs. */
export async function startApplication(
  bootstrap: () => Promise<unknown>,
): Promise<void> {
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
