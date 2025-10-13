// Helper function to format numbers with up to 3 decimals but remove trailing zeros
export function formatBalance(value: string | number): string {
  const num = typeof value === 'string' ? parseFloat(value) : value;
  return parseFloat(num.toFixed(3)).toString();
}