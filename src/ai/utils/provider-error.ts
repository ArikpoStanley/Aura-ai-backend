export class ProviderError extends Error {
  constructor(
    message: string,
    readonly provider: string,
    readonly providerJobId?: string,
    readonly raw?: unknown,
  ) {
    super(message);
    this.name = 'ProviderError';
  }
}
