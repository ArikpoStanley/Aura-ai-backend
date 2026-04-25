export function normalizePhoneNumber(value: unknown): string {
  if (typeof value !== 'string') {
    return '';
  }
  return value.replace(/\s+/g, '').trim();
}
