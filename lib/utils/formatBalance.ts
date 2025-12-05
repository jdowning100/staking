// Helper: format a value to up to 3 decimals, safely handling undefined/invalid
export function formatBalance(value: unknown, decimals: number = 3): string {
  if (value === null || value === undefined) return '0';

  let num: number;
  if (typeof value === 'number') {
    num = value;
  } else if (typeof value === 'bigint') {
    num = Number(value);
  } else if (typeof value === 'string') {
    if (value.trim() === '') return '0';
    const parsed = parseFloat(value);
    if (!Number.isFinite(parsed)) return '0';
    num = parsed;
  } else {
    return '0';
  }

  if (!Number.isFinite(num)) return '0';
  return parseFloat(num.toFixed(decimals)).toString();
}
