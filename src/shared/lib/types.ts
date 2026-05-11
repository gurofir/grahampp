export type IndicatorTier =
  | 'exceptional'
  | 'strong'
  | 'acceptable'
  | 'weak'
  | 'danger'
  | 'deep_value'
  | 'undervalued'
  | 'fair'
  | 'premium'
  | 'speculative'
  | 'attractive'
  | 'expensive'
  | 'moderate'
  | 'minimal'
  | 'none'

export type IndicatorCategory = 'A' | 'B' | 'C' | 'D' | 'E' | 'F'

export interface IndicatorScalar {
  key: string
  category: IndicatorCategory
  value: number | null
  tier: IndicatorTier | null
  position: number | null
  formatted?: string
}

export interface IndicatorSeries {
  key: string
  category: IndicatorCategory
  values: (number | null)[]
  latestValue: number | null
  latestTier: IndicatorTier | null
  latestPosition: number | null
  formatted?: string
}

export type IndicatorEntry = IndicatorScalar | IndicatorSeries

export function isSeries(indicator: IndicatorEntry): indicator is IndicatorSeries {
  return Array.isArray((indicator as IndicatorSeries).values)
}

export type MoatType =
  | 'SwitchingCosts'
  | 'NetworkEffects'
  | 'CostAdvantage'
  | 'Intangibles'
  | 'Scale'
  | 'None'

export type MoatRating = 'Wide' | 'Narrow' | 'None'

export type ProblemClassification = 'Temporary' | 'Structural' | 'Mixed' | 'None'

export type Verdict = 'interesting' | 'waiting' | 'pass'

export type Decision = 'BUY' | 'WAIT' | 'AVOID'
export type Confidence = 'Low' | 'Medium' | 'High'

export type Alignment = 'aligned_bullish' | 'aligned_bearish' | 'aligned_neutral' | 'conflict'

export type SetupType =
  | 'rare_value'
  | 'consensus_buy'
  | 'market_leading'
  | 'consensus_avoid'
  | 'neutral'

export interface EngineResult {
  decision: Decision
  confidence: Confidence
  thesis: string
  why: string[]
  risks: string[]
  trigger: string
  entryZone?: string | null
  // Graham-only synthesis fields. Optional so old saved analyses still parse
  // and so Market (which never produces these) is naturally typed.
  fragilityBand?: FragilityBand
  fragilityScore?: number
  counter?: CounterThesis | null
  findings?: FragilityFinding[]
  blocked?: boolean
  plainSummary?: PlainSummary | null
}

export interface SuggestedAction {
  text: string
  sub: string
}

export type FragilityBand = 'robust' | 'moderate' | 'fragile' | 'unstable'

export type RiskDimension =
  // Headwind dimensions (downside risk)
  | 'cyclicality'
  | 'commodity_exposure'
  | 'regulatory'
  | 'narrative_dependence'
  | 'peak_earnings'
  | 'one_factor_thesis'
  | 'accounting_quality'
  | 'liquidity_or_solvency'
  | 'macro_sensitivity'
  | 'data_freshness'
  | 'growth_sustainability'
  | 'margin_durability'
  | 'yield_trap'
  // Tailwind dimensions (positive context the static numbers may hide)
  | 'cyclical_bottom'
  | 'de_leveraging'
  | 'margin_inflection'
  | 'capex_investment_phase'
  | 'payout_discipline'
  | 'insider_cluster_buying'
  | 'capital_return_quality'

export type FindingSeverity =
  | 'info'
  | 'warn'
  | 'severe'
  | 'tailwind'
  | 'strong_tailwind'

export interface FragilityFinding {
  dimension: RiskDimension
  severity: FindingSeverity
  evidence: string
  scoreDelta?: number
  source?: 'rule' | 'llm'
}

export function isTailwindSeverity(s: FindingSeverity): boolean {
  return s === 'tailwind' || s === 'strong_tailwind'
}

export interface CounterThesis {
  summary: string
  ifThen: string
  killSwitches: string[]
}

// Plain-language version of Graham's recommendation, written by the
// Storyteller LLM in everyday Hebrew/English (no financial jargon). Designed
// to "hit the brain and instinct" — surfaced on the hero card so the user
// gets the verdict before any analyst-speak.
export interface PlainSummary {
  verdict: string       // ≤8 words, e.g. "כדאי לקנות בקטן" / "תחכו"
  headline: string      // ≤14 words, single sentence, the gist
  story: string         // 2-3 sentences, ≤60 words, conversational
  feel: string          // ≤6 words, emotional read, e.g. "מרגיש סולידי"
  redFlags: string[]    // 0-3 plain-language warnings, ≤14 words each
}

export interface DualEngine {
  graham: EngineResult
  market: EngineResult
  alignment: Alignment
  setupType: SetupType
  insight: string
  suggestedAction: SuggestedAction
  ctaLabel: string
  ctaSub: string
}

export interface AISummary {
  businessDescription: string
  grahamNarrative: string
  positiveSignals: string[]
  challengingSignals: string[]
  questions: string[]
  moatType: MoatType
  moatRating: MoatRating
  problemClassification: ProblemClassification
  problemExplanation: string
  catalystPresent: boolean
  catalystDescription: string | null
  catalystTimeline: string | null
  verdict: Verdict
  verdictReasoning: string
  missingFactors: string[] | null
  indicatorInsights?: Record<string, string>
}

export interface IntrinsicValueEstimate {
  graham: number | null
  dcf: number | null
  average: number | null
}

export interface Analysis {
  ticker: string
  companyName: string
  currency: string
  currentPrice: number
  dailyChangePct: number | null
  low52: number | null
  high52: number | null
  sector: string | null
  country: string | null
  businessSummary: string | null
  revenue: number | null
  marketCap: number | null
  sharesOutstanding: number | null
  peRatio: number | null
  fcfYield: number | null
  earningsDate: string | null
  intrinsicValue: IntrinsicValueEstimate
  indicators: Record<string, IndicatorEntry>
  ai: AISummary | null
  dualEngine: DualEngine | null
  generatedAt: string
  // Set when the analysis was served from the Discovery Engine cache (Supabase).
  // The frontend uses these to skip the /interpret call and to surface a
  // "scanned X hours ago — refresh" affordance.
  fromCache?: boolean
  cachedAt?: string | null
}
