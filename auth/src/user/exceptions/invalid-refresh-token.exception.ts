export class InvalidRefreshTokenException extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidRefreshTokenException';
  }
}
