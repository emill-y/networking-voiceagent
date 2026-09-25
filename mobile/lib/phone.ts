// Phone numbers in E.164 form ("+14155550123"), which Supabase phone sign-in
// expects. Numbers without a country code are assumed to be US/Canada.
export function normalizePhone(input: string): string | null {
  const trimmed = input.trim();
  const digits = trimmed.replace(/\D/g, "");
  if (trimmed.startsWith("+")) {
    return digits.length >= 8 && digits.length <= 15 ? `+${digits}` : null;
  }
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  return null;
}

// Phone numbers from different sources ("+1 (415) 555-0123", "415.555.0123")
// are compared by their digits, ignoring formatting and a leading country
// code. Mirrors phone_key in backend/app/services/contact_import.py.
export function phoneKey(phone: string | null | undefined): string | null {
  const digits = (phone ?? "").replace(/\D/g, "");
  if (digits.length < 7) return null;
  return digits.slice(-10);
}
