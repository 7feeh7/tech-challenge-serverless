export class InvalidNotificationEventError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidNotificationEventError';
  }
}
