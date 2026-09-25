// Phone numbers from different sources ("+1 (415) 555-0123", "415.555.0123")
// are compared by their digits, ignoring formatting and a leading country
// code. Mirrors phone_key in backend/app/services/contact_import.py.
export function phoneKey(phone: string | null | undefined): string | null {
  const digits = (phone ?? "").replace(/\D/g, "");
  if (digits.length < 7) return null;
  return digits.slice(-10);
}
