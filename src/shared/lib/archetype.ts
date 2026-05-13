// Constitutional UX (v2) -- pure derivation layer.
//
// Everything in this file is computed on the frontend from the cached
// `full_analysis` rows already returned by /.netlify/functions/discover.
// No backend changes, no AI rescan required. Adding a new archetype or
// tweaking the conviction-label table here ships in seconds.
//
// The five public functions:
//   classifyArchetype(row)       -> Archetype  (one of nine + 'unclassified')
//   computeSentiment(row)        -> Sentiment  (FEAR..GREED with score 0..100)
//   compoundConvictionLabel(row) -> string i18n key under conviction.*
//   situationTitle(row, lang)    -> question-form headline (constitution §6)
//   deriveConfirmationSignals(findings) -> string[]  (max 3, for the
//                                          "WHAT CONFIRMS" panel)

import type {
  Archetype,
  Confidence,
  Decision,
  FragilityBand,
  FragilityFinding,
  Sentiment,
  SentimentLabel,
} from './types'
import type { SituationRow } from '../../features/discovery/hooks/useDiscovery'

// ---------- Sector taxonomy (mirrors backend/sectorTaxonomy.js) ----------
//
// Sectors that are inherently cyclical and benefit from being read through
// a "trough vs structural" lens. Used by the cyclical_panic and temporary_damage
// archetype rules, and for the cyclicalPatience conviction label.
const CYCLICAL_SECTORS = new Set<string>([
  'Energy',
  'Basic Materials',
  'Industrials',
  'Consumer Cyclical',
  'Real Estate',
  'Financial Services',
])

// Sectors riding a hot narrative (AI / cloud / semis). Anti-hype value
// archetype keys off these.
const HOT_NARRATIVE_SECTORS = new Set<string>([
  'Technology',
  'Communication Services',
])

function isCyclical(sector: string | null | undefined): boolean {
  return !!sector && CYCLICAL_SECTORS.has(sector)
}

function isHotNarrative(sector: string | null | undefined): boolean {
  return !!sector && HOT_NARRATIVE_SECTORS.has(sector)
}

// ---------- Helpers ----------

// Returns 0..1 for where currentPrice sits in the 52-week band (0 = at low,
// 1 = at high). Returns null if data is missing or invalid.
function priceBand52w(row: SituationRow): number | null {
  const cur = row.current_price
  const lo = row.low52
  const hi = row.high52
  if (
    typeof cur !== 'number' ||
    typeof lo !== 'number' ||
    typeof hi !== 'number'
  ) {
    return null
  }
  if (!Number.isFinite(cur) || !Number.isFinite(lo) || !Number.isFinite(hi)) {
    return null
  }
  if (hi <= lo) return null
  const raw = (cur - lo) / (hi - lo)
  if (raw < 0) return 0
  if (raw > 1) return 1
  return raw
}

function fragilityBandOf(row: SituationRow): FragilityBand | null {
  return (row.full_analysis?.dualEngine?.graham?.fragilityBand as FragilityBand | undefined) ?? null
}

function findingsOf(row: SituationRow): FragilityFinding[] {
  return row.full_analysis?.dualEngine?.graham?.findings ?? []
}

function hasTailwind(findings: FragilityFinding[]): boolean {
  return findings.some(
    (f) => f.severity === 'tailwind' || f.severity === 'strong_tailwind',
  )
}

function hasSevereHeadwind(findings: FragilityFinding[]): boolean {
  return findings.some((f) => f.severity === 'severe')
}

function indicatorValue(row: SituationRow, key: string): number | null {
  const ind = row.full_analysis?.indicators?.[key]
  if (!ind) return null
  // IndicatorScalar exposes .value; IndicatorSeries exposes .latestValue.
  // We only key off scalar indicators here.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const raw = (ind as any).value ?? (ind as any).latestValue
  return typeof raw === 'number' && Number.isFinite(raw) ? raw : null
}

// ---------- Archetype classifier ----------
//
// Priority-ordered. The first rule that matches wins. Order matters:
// `consensus_fear` and `overpriced_perfection` need to be checked early so
// they pre-empt softer matches like `forgotten_quality`.
export function classifyArchetype(row: SituationRow): Archetype {
  const grahamD = row.graham_decision
  const marketD = row.market_decision
  const sector = row.sector
  const fragility = fragilityBandOf(row)
  const findings = findingsOf(row)
  const band = priceBand52w(row)
  const peTrailing = indicatorValue(row, 'D1_pe')
  const peForward = indicatorValue(row, 'D2_forwardPE')
  const roic = indicatorValue(row, 'B4_roic')
  const dividendStreak = indicatorValue(row, 'D10_dividendStreak')

  // 1. Consensus fear: both engines AVOID, or fragility unstable.
  // The market and Graham both see risk -- we surface this as a warning,
  // not an opportunity.
  if (
    (grahamD === 'AVOID' && marketD === 'AVOID') ||
    fragility === 'unstable'
  ) {
    return 'consensus_fear'
  }

  // 2. Overpriced perfection: market loves it, Graham doesn't, price near high.
  // Classic reflexive top -- the market is paying for a future Graham can't justify.
  if (
    marketD === 'BUY' &&
    grahamD !== 'BUY' &&
    band !== null &&
    band >= 0.75
  ) {
    return 'overpriced_perfection'
  }

  // 3. Expectation mismatch: forward PE materially higher than trailing PE
  // means consensus EPS is being revised down, and Graham is waiting.
  if (
    grahamD === 'WAIT' &&
    peTrailing !== null &&
    peForward !== null &&
    peForward > peTrailing * 1.15
  ) {
    return 'expectation_mismatch'
  }

  // 4. Cyclical panic: cyclical sector, Graham BUY, price near 52w low,
  // market not yet on board. The single most common "Buffett value" setup.
  if (
    isCyclical(sector) &&
    grahamD === 'BUY' &&
    band !== null &&
    band <= 0.4 &&
    marketD !== 'BUY'
  ) {
    return 'cyclical_panic'
  }

  // 5. Narrative collapse: price near low + market AVOID + no severe
  // headwinds (otherwise it's consensus_fear). Story has soured but the
  // numbers haven't caught up to the price drop.
  if (
    band !== null &&
    band <= 0.3 &&
    marketD === 'AVOID' &&
    !hasSevereHeadwind(findings)
  ) {
    return 'narrative_collapse'
  }

  // 6. Anti-hype value: hot narrative sector + Graham BUY + market WAIT.
  // Capital has rotated toward AI plays, leaving compounders orphaned.
  if (
    isHotNarrative(sector) &&
    grahamD === 'BUY' &&
    marketD === 'WAIT'
  ) {
    return 'anti_hype_value'
  }

  // 7. Silent compounder: high ROIC + multi-year dividend streak + Graham BUY,
  // not in a hot sector. The "boring" quality the market overlooks.
  if (
    grahamD === 'BUY' &&
    !isHotNarrative(sector) &&
    roic !== null && roic >= 12 &&
    dividendStreak !== null && dividendStreak >= 5 &&
    fragility !== 'fragile'
  ) {
    return 'silent_compounder'
  }

  // 8. Forgotten quality: high ROIC + cheap PE + Graham BUY + price not at top.
  // Less specific than silent_compounder (no dividend streak required).
  if (
    grahamD === 'BUY' &&
    roic !== null && roic >= 10 &&
    peTrailing !== null && peTrailing <= 18 &&
    band !== null && band <= 0.7
  ) {
    return 'forgotten_quality'
  }

  // 9. Temporary damage: Graham BUY, fragility moderate, recent setback
  // (price down meaningfully). Different from cyclical_panic in that it
  // isn't sector-driven.
  if (
    grahamD === 'BUY' &&
    fragility === 'moderate' &&
    band !== null && band <= 0.5
  ) {
    return 'temporary_damage'
  }

  return 'unclassified'
}

// ---------- Analysis -> SituationRow shim ----------
//
// The classifier was originally built for the Discovery feed where rows
// arrive in SituationRow shape. The stock-detail page operates on the
// fuller Analysis object, so we adapt it to a SituationRow-shaped view
// here. We only fill the fields the classifier reads; everything else is
// left as nulls/empty strings.
import type { Analysis } from './types'

export function analysisToSituationRow(analysis: Analysis): SituationRow {
  const dual = analysis.dualEngine
  return {
    id: analysis.ticker,
    ticker: analysis.ticker,
    company_name: analysis.companyName ?? null,
    sector: analysis.sector ?? null,
    country: analysis.country ?? null,
    current_price: analysis.currentPrice ?? null,
    daily_change_pct: analysis.dailyChangePct ?? null,
    low52: analysis.low52 ?? null,
    high52: analysis.high52 ?? null,
    setup_type: dual?.setupType ?? 'neutral',
    graham_decision: dual?.graham?.decision ?? 'WAIT',
    market_decision: dual?.market?.decision ?? 'WAIT',
    graham_confidence: dual?.graham?.confidence ?? 'Medium',
    market_confidence: dual?.market?.confidence ?? 'Medium',
    graham_thesis: dual?.graham?.thesis ?? '',
    market_thesis: dual?.market?.thesis ?? '',
    insight: dual?.insight ?? '',
    score: 0,
    situation_type: 'general',
    scanned_at: analysis.cachedAt ?? analysis.generatedAt ?? new Date().toISOString(),
    is_featured: false,
    full_analysis: analysis,
  }
}

export function classifyArchetypeFromAnalysis(analysis: Analysis): Archetype {
  return classifyArchetype(analysisToSituationRow(analysis))
}

export function computeSentimentFromAnalysis(analysis: Analysis): Sentiment {
  return computeSentiment(analysisToSituationRow(analysis))
}

export function compoundConvictionLabelFromAnalysis(
  analysis: Analysis,
): string {
  return compoundConvictionLabel(analysisToSituationRow(analysis))
}

// ---------- Sentiment spectrum (FEAR ↔ GREED) ----------

const MARKET_DECISION_WEIGHT: Record<Decision, number> = {
  AVOID: -25,
  WAIT: 0,
  BUY: +25,
}

const CONFIDENCE_WEIGHT: Record<Confidence, number> = {
  Low: 0.5,
  Medium: 1,
  High: 1.4,
}

// Composite 0..100 score where the dot lives on the spectrum bar.
//   - Center (50) = neutral.
//   - +/- 25 from market_decision * confidence
//   - +/- 25 from where price sits in 52w band
//   - +/- 5 from today's daily change momentum
// Total swings clamp to [0, 100].
export function computeSentiment(row: SituationRow): Sentiment {
  let score = 50

  const decisionDelta =
    MARKET_DECISION_WEIGHT[row.market_decision] *
    (CONFIDENCE_WEIGHT[row.market_confidence] ?? 1)
  score += decisionDelta

  const band = priceBand52w(row)
  if (band !== null) {
    // Below mid-band leans fear; above leans greed. ±25 max.
    score += (band - 0.5) * 50
  }

  const change = row.daily_change_pct
  if (typeof change === 'number' && Number.isFinite(change)) {
    // Cap daily-change influence so news-day spikes don't dominate.
    const capped = Math.max(-5, Math.min(5, change))
    score += capped
  }

  if (score < 0) score = 0
  if (score > 100) score = 100

  let label: SentimentLabel
  if (score < 25) label = 'fear'
  else if (score < 45) label = 'mild_fear'
  else if (score < 55) label = 'neutral'
  else if (score < 75) label = 'mild_greed'
  else label = 'greed'

  return { score: Math.round(score), label }
}

// ---------- Compound conviction labels (Constitution §15) ----------
//
// Returns the i18n key under "conviction.*" -- the caller wraps with t().
// Constitution §15 forbids "Strong Buy / Buy / Sell" labels. Every label
// here is a compound phrase that captures decision + valuation + fragility
// + catalyst-presence in one breath.
export function compoundConvictionLabel(row: SituationRow): string {
  const grahamD = row.graham_decision
  const conf = row.graham_confidence
  const fragility = fragilityBandOf(row)
  const findings = findingsOf(row)
  const archetype = classifyArchetype(row)

  // Fragility-led labels first -- these dominate everything else.
  if (fragility === 'unstable' || fragility === 'fragile') {
    return 'highFragilityDiscipline'
  }

  // Archetype-driven shortcuts where the label is canonical.
  if (archetype === 'silent_compounder') return 'patientCompounder'
  if (archetype === 'cyclical_panic') return 'cyclicalPatience'
  if (archetype === 'narrative_collapse') return 'narrativeRisk'
  if (archetype === 'overpriced_perfection') return 'qualityExpectationsRich'
  if (archetype === 'forgotten_quality') return 'excellentNoCatalyst'
  if (archetype === 'consensus_fear') return 'underPressureReassess'

  // Decision + confidence + finding-balance combinations.
  if (grahamD === 'BUY' && conf === 'High') {
    if (hasTailwind(findings)) return 'excellentNoCatalyst'
    return 'strongValueWeakCatalyst'
  }

  if (grahamD === 'BUY' && conf === 'Medium') {
    return hasTailwind(findings) ? 'deepValueWatchful' : 'earlyEntryRisk'
  }

  if (grahamD === 'WAIT') {
    return hasTailwind(findings) ? 'balancedSetup' : 'qualityExpectationsRich'
  }

  return 'default'
}

// ---------- Question-form situation title (Constitution §6) ----------
//
// The line at the top of every card. Per-archetype templates ensure the
// constitutional question framing -- e.g. "Temporary damage, or permanent
// deterioration?". Falls back to the Storyteller's headline (already plain
// English) when archetype is `unclassified` and no template fits.
export function situationTitleKey(archetype: Archetype): string {
  return `archetype.title.${archetype}`
}

export function situationTitleFallback(row: SituationRow): string | null {
  return row.full_analysis?.dualEngine?.graham?.plainSummary?.headline ?? null
}

// ---------- Confirmation signals (Constitution §10 + §14) ----------
//
// The "WHAT CONFIRMS THIS THESIS" panel. We pull the analytical findings
// already produced by the Reality Check layer, take the tailwind ones, and
// rewrite their evidence as confirmation conditions. Hide the panel when
// nothing qualifies (handled by the caller).
export function deriveConfirmationSignals(
  findings: FragilityFinding[] | undefined,
): string[] {
  if (!findings || findings.length === 0) return []
  return findings
    .filter((f) => f.severity === 'tailwind' || f.severity === 'strong_tailwind')
    .map((f) => f.evidence?.trim())
    .filter((s): s is string => !!s && s.length > 0)
    .slice(0, 3)
}

// ---------- Visual palette per archetype ----------
//
// Used by ArchetypeBadge for tinted pill backgrounds. Colors are deliberately
// muted (Constitution §19 -- avoid trading-app aesthetics).
export interface ArchetypeAccent {
  bg: string
  fg: string
}

export const ARCHETYPE_ACCENT: Record<Archetype, ArchetypeAccent> = {
  cyclical_panic:        { bg: '#F5E6D3', fg: '#8C5A1A' }, // sand
  narrative_collapse:    { bg: '#F0D6D6', fg: '#8E2A2A' }, // dusty red
  silent_compounder:     { bg: '#DEEFE2', fg: '#27500A' }, // soft moss
  temporary_damage:      { bg: '#F4E4C4', fg: '#7D5400' }, // warm wheat
  consensus_fear:        { bg: '#EAD6D6', fg: '#7A1F1F' }, // pale clay
  forgotten_quality:     { bg: '#F0E6D2', fg: '#5F4A1A' }, // dusty gold
  anti_hype_value:       { bg: '#E1EEF0', fg: '#225B6B' }, // sea foam
  expectation_mismatch:  { bg: '#EDE6F0', fg: '#5A3F70' }, // muted lavender
  overpriced_perfection: { bg: '#F0DCC9', fg: '#7A3D0F' }, // burnt sand
  unclassified:          { bg: '#EEEEEC', fg: '#5F5E5A' }, // neutral
}

// Sentiment-driven accent for the FEAR/GREED bar's dot.
export function sentimentDotColor(label: SentimentLabel): string {
  switch (label) {
    case 'fear':       return '#A32D2D'
    case 'mild_fear':  return '#C68910'
    case 'neutral':    return '#7B7B79'
    case 'mild_greed': return '#3B6D11'
    case 'greed':      return '#1F8A4D'
  }
}
