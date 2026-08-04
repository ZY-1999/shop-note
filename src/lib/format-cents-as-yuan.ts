/**
 * Format integer 分 as 元 with two decimal places (e.g. 300 → "3.00").
 * Pure — no React. Shared by MoneyText and xlsx export builds.
 */
export function formatCentsAsYuan(cents: number): string {
  return (cents / 100).toFixed(2);
}
