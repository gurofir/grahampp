import type { IndicatorTier } from './types'

export type CanonicalTier =
  | 'exceptional'
  | 'strong'
  | 'acceptable'
  | 'weak'
  | 'danger'
  | 'na'

export const TIER_INDEX: Record<Exclude<CanonicalTier, 'na'>, number> = {
  danger: 0,
  weak: 1,
  acceptable: 2,
  strong: 3,
  exceptional: 4,
}

export const TIER_COLORS: Record<Exclude<CanonicalTier, 'na'>, string> = {
  danger: '#A32D2D',
  weak: '#E07B39',
  acceptable: '#BA7517',
  strong: '#185FA5',
  exceptional: '#3B6D11',
}

export const TIER_BADGE: Record<CanonicalTier, { bg: string; fg: string }> = {
  exceptional: { bg: '#EAF3DE', fg: '#3B6D11' },
  strong: { bg: '#E6F1FB', fg: '#185FA5' },
  acceptable: { bg: '#FAEEDA', fg: '#BA7517' },
  weak: { bg: '#FCEBEB', fg: '#E07B39' },
  danger: { bg: '#FCEBEB', fg: '#A32D2D' },
  na: { bg: '#F1EFE8', fg: '#5F5E5A' },
}

const TIER_TO_CANONICAL: Record<IndicatorTier, CanonicalTier> = {
  exceptional: 'exceptional',
  deep_value: 'exceptional',
  strong: 'strong',
  undervalued: 'strong',
  attractive: 'strong',
  acceptable: 'acceptable',
  fair: 'acceptable',
  moderate: 'acceptable',
  weak: 'weak',
  premium: 'weak',
  expensive: 'weak',
  minimal: 'weak',
  danger: 'danger',
  speculative: 'danger',
  none: 'na',
}

export function canonicalTier(tier: IndicatorTier | null | undefined): CanonicalTier {
  if (!tier) return 'na'
  return TIER_TO_CANONICAL[tier] ?? 'na'
}

type FormatKind =
  | 'signedPercent'
  | 'percent'
  | 'ratio'
  | 'multiple'
  | 'plain'
  | 'plainNoSign'

// Per IndicatorRow_prompt.md value formatting rules.
const FORMAT_MAP: Record<string, FormatKind> = {
  A1_revenueGrowth: 'signedPercent',
  A2_epsGrowth: 'signedPercent',
  A3_fcfConversion: 'multiple',
  A4_ownerEarnings: 'multiple',
  B1_grossMargin: 'signedPercent',
  B2_operatingMargin: 'signedPercent',
  B3_netMargin: 'signedPercent',
  B4_roic: 'signedPercent',
  B5_roe: 'signedPercent',
  C1_debtEquity: 'multiple',
  C2_currentRatio: 'plain',
  C3_interestCoverage: 'multiple',
  C4_netDebtEbitda: 'multiple',
  D1_pe: 'multiple',
  D2_forwardPE: 'multiple',
  D3_peg: 'multiple',
  D4_fcfYield: 'signedPercent',
  D5_evEbitda: 'multiple',
  D6_priceSales: 'multiple',
  D7_marginOfSafety: 'signedPercent',
  D8_dividendYield: 'percent',
  D9_payoutRatio: 'percent',
  D10_dividendStreak: 'plainNoSign',
  E1_grossMarginStability: 'signedPercent',
  E2_roicMoat: 'signedPercent',
  F1_roicTrend: 'signedPercent',
  F2_fcfConversionTrend: 'multiple',
  F3_insiderSignal: 'signedPercent',
}

export function formatIndicatorValue(key: string, value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return '—'
  const kind = FORMAT_MAP[key] ?? 'plain'
  switch (kind) {
    case 'signedPercent':
      return `${value >= 0 ? '+' : ''}${value.toFixed(1)}%`
    case 'percent':
      return `${value.toFixed(1)}%`
    case 'ratio':
      return `${value.toFixed(2)}×`
    case 'multiple':
      return `${value.toFixed(2)}×`
    case 'plainNoSign':
      return value.toFixed(2)
    case 'plain':
    default:
      return value.toFixed(2)
  }
}

const CURRENCY_SYMBOL: Record<string, string> = {
  USD: '$',
  EUR: '€',
  GBP: '£',
  ILS: '₪',
  JPY: '¥',
}

export function currencySymbol(currency: string | null | undefined): string {
  if (!currency) return '$'
  return CURRENCY_SYMBOL[currency.toUpperCase()] ?? `${currency} `
}

export function formatLargeNumber(
  value: number | null | undefined,
  currency: string | null | undefined = 'USD',
): string {
  if (value == null || !Number.isFinite(value)) return '—'
  const symbol = currencySymbol(currency)
  const abs = Math.abs(value)
  if (abs >= 1e12) return `${symbol}${(value / 1e12).toFixed(1)}T`
  if (abs >= 1e9) return `${symbol}${(value / 1e9).toFixed(1)}B`
  if (abs >= 1e6) return `${symbol}${(value / 1e6).toFixed(1)}M`
  return `${symbol}${value.toLocaleString('en-US', { maximumFractionDigits: 0 })}`
}

export function formatPrice(value: number | null | undefined, currency = 'USD'): string {
  if (value == null || !Number.isFinite(value)) return '—'
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency,
      maximumFractionDigits: 2,
    }).format(value)
  } catch {
    return `${currency} ${value.toFixed(2)}`
  }
}

export function formatDate(iso: string | null | undefined, locale: string): string | null {
  if (!iso) return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  try {
    return new Intl.DateTimeFormat(locale === 'he' ? 'he-IL' : 'en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    }).format(d)
  } catch {
    return d.toISOString().split('T')[0] ?? null
  }
}

export const SECTION_ORDER: Array<'A' | 'B' | 'C' | 'D' | 'E' | 'F'> = [
  'A',
  'B',
  'C',
  'D',
  'E',
  'F',
]

export const INDICATORS_BY_SECTION: Record<'A' | 'B' | 'C' | 'D' | 'E' | 'F', string[]> = {
  A: ['A1_revenueGrowth', 'A2_epsGrowth', 'A3_fcfConversion', 'A4_ownerEarnings'],
  B: ['B1_grossMargin', 'B2_operatingMargin', 'B3_netMargin', 'B4_roic', 'B5_roe'],
  C: ['C1_debtEquity', 'C2_currentRatio', 'C3_interestCoverage', 'C4_netDebtEbitda'],
  D: [
    'D1_pe',
    'D2_forwardPE',
    'D3_peg',
    'D4_fcfYield',
    'D5_evEbitda',
    'D6_priceSales',
    'D7_marginOfSafety',
    'D8_dividendYield',
    'D9_payoutRatio',
    'D10_dividendStreak',
  ],
  E: ['E1_grossMarginStability', 'E2_roicMoat'],
  F: ['F1_roicTrend', 'F2_fcfConversionTrend', 'F3_insiderSignal'],
}
