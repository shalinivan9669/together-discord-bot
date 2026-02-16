export class DomainError extends Error {
  constructor(
    message: string,
    public readonly code: string
  ) {
    super(message);
    this.name = 'DomainError';
  }
}

export function isDomainError(value: unknown): value is DomainError {
  return value instanceof DomainError;
}