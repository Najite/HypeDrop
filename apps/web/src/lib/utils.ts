import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

export function truncateAddress(address: string, head: number = 6, tail: number = 4): string {
  if (address.length <= head + tail + 3) {
    return address;
  }
  return `${address.slice(0, head)}…${address.slice(-tail)}`;
}

export function formatBpsAsPercent(bps: number, signed: boolean = false): string {
  const pct = (bps / 100).toFixed(2);
  if (signed && bps > 0) {
    return `+${pct}%`;
  }
  return `${pct}%`;
}

export function formatDecimalWithCommas(
  value: string | number,
  fractionDigits?: number,
): string {
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      return String(value);
    }
    const digits = fractionDigits ?? 2;
    return new Intl.NumberFormat('en-US', {
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    }).format(value);
  }

  const trimmed = value.trim();
  if (fractionDigits !== undefined) {
    const parsed = Number(trimmed);
    if (Number.isFinite(parsed)) {
      return new Intl.NumberFormat('en-US', {
        minimumFractionDigits: fractionDigits,
        maximumFractionDigits: fractionDigits,
      }).format(parsed);
    }
  }

  const negative = trimmed.startsWith('-');
  const unsigned = negative ? trimmed.slice(1) : trimmed;
  const [intPart = '0', fracPart] = unsigned.split('.');
  const formattedInt = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${negative ? '-' : ''}${formattedInt}${fracPart !== undefined ? `.${fracPart}` : ''}`;
}

export function atomicStroopsToUsdcNumber(atomic: string): number {
  const numeric = Number(BigInt(atomic)) / 10_000_000;
  return Number.isFinite(numeric) ? numeric : 0;
}

export function usdcNumberToAtomicStroops(amount: number): string {
  const clamped = Math.max(0, Math.round(amount * 100));
  return (BigInt(clamped) * 100_000n).toString();
}
