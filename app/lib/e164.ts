const US_NSN_LENGTH = 10;

export function normalizeToE164(
  phone: string | null | undefined,
  defaultCountry: 'US' = 'US',
): string | null {
  if (typeof phone !== 'string') return null;
  const trimmed = phone.trim();
  if (trimmed.length === 0) return null;

  const hasPlus = trimmed.startsWith('+');
  const digits = trimmed.replace(/\D+/g, '');
  if (digits.length === 0) return null;

  if (hasPlus) {
    if (digits.length === 11 && digits.startsWith('1')) {
      return `+${digits}`;
    }
    if (digits.length === US_NSN_LENGTH && defaultCountry === 'US') {
      return `+1${digits}`;
    }
    return null;
  }

  if (digits.length === US_NSN_LENGTH) {
    return `+1${digits}`;
  }
  if (digits.length === 11 && digits.startsWith('1')) {
    return `+${digits}`;
  }

  return null;
}

export function formatForDisplay(e164: string | null | undefined): string {
  if (typeof e164 !== 'string') return '';
  if (!e164.startsWith('+1')) return e164 ?? '';
  const digits = e164.slice(2);
  if (digits.length !== US_NSN_LENGTH) return e164;
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
}
