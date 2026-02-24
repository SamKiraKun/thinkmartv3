/**
 * Shared currency formatting utility for ThinkMart.
 *
 * Uses the Intl.NumberFormat API with the 'en-IN' locale so that
 * the rupee symbol and digit grouping are handled correctly by the
 * browser's ICU engine — avoiding garbled/mojibake symbols and
 * inconsistent "Rs" vs "₹" usage across pages.
 *
 * Usage:
 *   import { formatINR, formatINRCompact } from '@/lib/utils/currency';
 *   formatINR(1500)        // "₹1,500"
 *   formatINR(1500.5)      // "₹1,500.50"
 *   formatINRCompact(15000) // "₹15K"
 */

const inrFormatter = new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
});

const inrFormatterWithDecimals = new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
});

const inrCompactFormatter = new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    notation: 'compact',
    maximumFractionDigits: 1,
});

/**
 * Format a number as Indian Rupees (whole number).
 * e.g. 15000 → "₹15,000"
 */
export function formatINR(amount: number | undefined | null): string {
    const safe = Number(amount) || 0;
    return inrFormatter.format(safe);
}

/**
 * Format a number as Indian Rupees with 2 decimal places.
 * e.g. 15000.5 → "₹15,000.50"
 */
export function formatINRDecimal(amount: number | undefined | null): string {
    const safe = Number(amount) || 0;
    return inrFormatterWithDecimals.format(safe);
}

/**
 * Format a number as compact Indian Rupees.
 * e.g. 15000 → "₹15K", 1500000 → "₹15L"
 */
export function formatINRCompact(amount: number | undefined | null): string {
    const safe = Number(amount) || 0;
    return inrCompactFormatter.format(safe);
}

/**
 * Format a plain number in Indian locale grouping (no currency symbol).
 * e.g. 15000 → "15,000"
 */
export function formatNumberIN(num: number | undefined | null): string {
    const safe = Number(num) || 0;
    return new Intl.NumberFormat('en-IN').format(safe);
}
