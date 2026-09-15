// A minimal stand-in for a real structured logger (pino/winston in
// production). The point of this file isn't the logging library - it's
// the DISCIPLINE of what's allowed to reach it: this function's signature
// makes it impossible to accidentally pass a password or token through,
// because there is no parameter for either.
export function logAuthEvent(event: string, username: string): void {
  console.log(`[auth] ${event} username=${username}`);
}
