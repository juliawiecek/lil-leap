export class InvalidCredentialsException extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidCredentialsException';
  }
}
