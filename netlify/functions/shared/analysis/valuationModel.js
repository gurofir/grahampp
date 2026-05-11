'use strict';

// Two-stage DCF + bond-yield-adjusted Graham formula.
//
// Why this exists:
//   The previous intrinsic value used (a) latest single-year FCF as the base
//   (peak/trough sensitive for cyclicals), (b) Yahoo's noisy 1y forward
//   earningsGrowth as the perpetual growth rate, (c) a flat 10% discount
//   rate for every sector, and (d) a fixed exit-multiple terminal value.
//   That combination produced wildly inaccurate fair values for cyclicals
//   and rate-sensitive names, which is why D7_marginOfSafety was the
//   weakest indicator in the system.
//
// What we do now:
//   * Normalize the cash flow base over multiple years (median for cyclicals,
//     recent average for stable businesses) so peak/trough years don't
//     drive the call.
//   * Use a sector-aware discount rate: 10y risk-free + sector-beta * 5% ERP
//     (+1pp leverage premium for D/E > 1.5). Range clamped to [7%, 15%].
//   * Use a sector-aware perpetual growth rate (range 2.0% - 3.0%, always
//     below the discount rate so the Gordon model converges).
//   * Apply mean-reversion to the explicit-period growth rate over 5 years
//     (year 1 = capped LTG, fading to 0.5x by year 5).
//   * Compute equity value: PV(explicit FCFs) + PV(terminal) + cash - debt,
//     then divide by diluted shares.
//   * Bond-yield-adjust the Graham formula so it tracks the rate environment
//     instead of pretending it is always 1962.
//
// Trade-offs we explicitly accept:
//   * 10y risk-free and bond-yield refs are hard-coded constants, not
//     fetched live. Refreshing them is a once-a-year manual update; the
//     alternative is another data source dependency on every scan, which
//     is not worth the complexity at this stage.
//   * Sector betas are coarse industry medians, not regression betas.
//   * We do not attempt to model balance-sheet stress (negative equity,
//     restated cash flows, etc.) — those are caught in the Reality Check
//     layer separately.

const RISK_FREE = 0.045;            // 10y US Treasury, late 2025
const EQUITY_RISK_PREMIUM = 0.05;
const AAA_BOND_YIELD = 0.05;        // for Graham formula bond-yield adjustment
const GRAHAM_NORMALIZE_Y = 4.4;     // Graham's reference bond yield (1962)
const EXPLICIT_YEARS = 5;
const LTG_HARD_CAP = 0.25;          // 25%/yr cap (no company sustains higher)

// Sector beta proxies (NYU Stern industry medians, rounded). Used to derive
// the discount rate. Defaults to 1.0 for unknown sectors.
const SECTOR_BETAS = {
  Technology: 1.20,
  'Communication Services': 1.10,
  Healthcare: 0.85,
  'Consumer Defensive': 0.65,
  'Consumer Cyclical': 1.20,
  Industrials: 1.05,
  'Financial Services': 1.10,
  Utilities: 0.55,
  'Real Estate': 0.85,
  Energy: 1.30,
  'Basic Materials': 1.20,
};

// Long-run perpetual growth (Gordon-model g_infinity). Bounded below the
// 10y risk-free so the terminal value converges and stays defensible.
const SECTOR_TERMINAL_GROWTH = {
  Technology: 0.030,
  'Communication Services': 0.025,
  Healthcare: 0.030,
  'Consumer Defensive': 0.025,
  'Consumer Cyclical': 0.025,
  Industrials: 0.025,
  'Financial Services': 0.025,
  Utilities: 0.020,
  'Real Estate': 0.025,
  Energy: 0.020,
  'Basic Materials': 0.020,
};

const CYCLICAL_SECTORS = new Set([
  'Energy',
  'Basic Materials',
  'Industrials',
  'Consumer Cyclical',
  'Financial Services',
  'Real Estate',
]);

// FCF-based DCF doesn't fit financials and REITs because their "operating
// cash flow" includes deposits, loans, and rental escrow movements that
// dwarf real economic earnings. For these we rely on the bond-yield-
// adjusted Graham formula only -- still imperfect, but at least it uses
// earnings instead of a meaningless cash-flow construct.
const SKIP_DCF_SECTORS = new Set([
  'Financial Services',
  'Real Estate',
]);

// Coarse trailing P/E band (p90 cap) by sector. We use this to clamp the
// Graham implied multiple so a company with reported LTG of (say) 25% in
// a low-multiple sector doesn't get a nonsense $888 fair value.
const SECTOR_PE_CAP = {
  Technology: 35,
  'Communication Services': 25,
  Healthcare: 30,
  'Consumer Defensive': 25,
  'Consumer Cyclical': 22,
  Industrials: 25,
  'Financial Services': 18,
  Utilities: 22,
  'Real Estate': 30,
  Energy: 18,
  'Basic Materials': 18,
};
const DEFAULT_PE_CAP = 25;

function clamp(x, lo, hi) {
  if (!Number.isFinite(x)) return lo;
  return Math.min(hi, Math.max(lo, x));
}

function discountRateFor(sector, debtEquity) {
  const beta = SECTOR_BETAS[sector] ?? 1.0;
  let r = RISK_FREE + beta * EQUITY_RISK_PREMIUM;
  // Leverage premium: highly leveraged equity is riskier than its sector
  // beta implies. D/E > 1.5 adds 1pp, > 3.0 adds another 1pp.
  if (Number.isFinite(debtEquity)) {
    if (debtEquity > 3.0) r += 0.02;
    else if (debtEquity > 1.5) r += 0.01;
  }
  return clamp(r, 0.07, 0.15);
}

function terminalGrowthFor(sector) {
  return SECTOR_TERMINAL_GROWTH[sector] ?? 0.025;
}

function median(arr) {
  const sorted = arr.filter(Number.isFinite).slice().sort((a, b) => a - b);
  if (sorted.length === 0) return null;
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

// Normalize the cash-flow base. Cyclicals get a 5-year median (smooths
// peak/trough); stable businesses get a 3-year recency-weighted average
// (responsive to genuine trend changes without overweighting the latest
// noisy print).
//
// We deliberately allow a single negative year for non-cyclicals (working
// capital swing, one-off settlement) but bail out if the entire window is
// non-positive — there is nothing to project.
function normalizedFcf(fcfArr, sector) {
  if (!Array.isArray(fcfArr) || fcfArr.length === 0) return null;
  const finite = fcfArr.filter(Number.isFinite);
  if (finite.length === 0) return null;
  const positiveFraction = finite.filter((x) => x > 0).length / finite.length;
  if (positiveFraction < 0.5) return null; // mostly negative — not a DCF candidate

  if (CYCLICAL_SECTORS.has(sector)) {
    const window = finite.slice(-5);
    return median(window);
  }
  // Recency-weighted average of last 3 (weights 1, 2, 3).
  const last3 = finite.slice(-3);
  if (last3.length === 0) return null;
  const weights = last3.map((_, i) => i + 1);
  const wsum = weights.reduce((a, b) => a + b, 0);
  const weighted = last3.reduce((acc, v, i) => acc + v * weights[i], 0) / wsum;
  return weighted;
}

// Normalized net income for the Graham formula. Same logic as FCF but on
// the earnings line (which Graham's formula expects).
function normalizedNetIncome(niArr, sector) {
  if (!Array.isArray(niArr) || niArr.length === 0) return null;
  const finite = niArr.filter(Number.isFinite);
  if (finite.length === 0) return null;
  const positiveFraction = finite.filter((x) => x > 0).length / finite.length;
  if (positiveFraction < 0.5) return null;

  if (CYCLICAL_SECTORS.has(sector)) {
    return median(finite.slice(-5));
  }
  const last3 = finite.slice(-3);
  const weights = last3.map((_, i) => i + 1);
  const wsum = weights.reduce((a, b) => a + b, 0);
  return last3.reduce((acc, v, i) => acc + v * weights[i], 0) / wsum;
}

// Two-stage DCF on a normalized FCF base. Returns an *equity* value per
// share, accounting for net debt. Returns null if any required input is
// missing or non-finite.
function twoStageDcf({
  baseFcf,
  ltgPct,
  sector,
  totalDebt,
  cash,
  sharesOutstanding,
  debtEquity,
}) {
  // Banks and REITs need a different model entirely (Excess Returns or
  // Dividend Discount). Returning null here lets the consumer fall back
  // to Graham, and keeps a misleading number out of the UI / dry screen.
  if (SKIP_DCF_SECTORS.has(sector)) return null;
  if (!Number.isFinite(baseFcf) || baseFcf <= 0) return null;
  if (!Number.isFinite(sharesOutstanding) || sharesOutstanding <= 0) return null;

  const r = discountRateFor(sector, debtEquity);
  const gTerm = terminalGrowthFor(sector);
  // Year-1 growth: capped LTG (Yahoo's earningsGrowth is one-year forward
  // expectation). Default to terminal growth if LTG is missing or absurd.
  const ltgRaw = Number.isFinite(ltgPct) ? ltgPct / 100 : null;
  const g1 = ltgRaw == null ? gTerm : clamp(ltgRaw, -0.10, LTG_HARD_CAP);

  // Linear fade from g1 in year 1 down to terminal growth in the final
  // explicit year. This is the simplest defensible mean-reversion model.
  const explicitFcfs = [];
  let prev = baseFcf;
  for (let y = 1; y <= EXPLICIT_YEARS; y += 1) {
    const t = (y - 1) / (EXPLICIT_YEARS - 1); // 0 -> 1
    const gy = g1 + (gTerm - g1) * t;
    prev = prev * (1 + gy);
    explicitFcfs.push(prev);
  }

  // PV of explicit period.
  let pvExplicit = 0;
  for (let y = 1; y <= EXPLICIT_YEARS; y += 1) {
    pvExplicit += explicitFcfs[y - 1] / Math.pow(1 + r, y);
  }

  // Gordon-growth terminal value at end of year EXPLICIT_YEARS, then
  // discounted back. r > gTerm is enforced by the clamp on r.
  const fcfTerminalNext = explicitFcfs[EXPLICIT_YEARS - 1] * (1 + gTerm);
  const terminalValue = fcfTerminalNext / (r - gTerm);
  const pvTerminal = terminalValue / Math.pow(1 + r, EXPLICIT_YEARS);

  // Enterprise -> equity bridge. Net debt = totalDebt - cash. If we don't
  // know net debt we just use enterprise value (slightly overstates equity
  // for indebted companies, slightly understates for cash-rich -- noted).
  const enterpriseValue = pvExplicit + pvTerminal;
  const netDebt = (Number.isFinite(totalDebt) ? totalDebt : 0)
    - (Number.isFinite(cash) ? cash : 0);
  const equityValue = enterpriseValue - netDebt;
  if (equityValue <= 0) return null;
  return equityValue / sharesOutstanding;
}

// Bond-yield-adjusted Graham intrinsic value. Graham's original formula
// (8.5 + 2g) was published in 1962 when AAA corporate yields were ~4.4%.
// The widely-used adjustment scales by Y_aaa_now / Y_aaa_1962 so the
// formula tracks the rate environment.
//
// We use forward EPS when available (better proxy for steady-state earnings
// power than trailing). LTG capped at 25% for the reasons in the DCF.
//
// We additionally:
//   * Reject the result when the implied multiplier is non-positive (which
//     happens when reported LTG is very negative). A negative "intrinsic
//     value" is nonsense; surface it as missing instead.
//   * Cap the implied multiplier at the sector p90 P/E so high-growth
//     companies in low-multiple sectors don't blow up to $800 fair values.
function adjustedGraham({ eps, ltgPct, sector }) {
  if (!Number.isFinite(eps) || eps <= 0) return null;
  const g = Number.isFinite(ltgPct)
    ? clamp(ltgPct, -10, LTG_HARD_CAP * 100)
    : 0;
  const rateScaler = GRAHAM_NORMALIZE_Y / (AAA_BOND_YIELD * 100);
  const rawMultiplier = (8.5 + 2 * g) * rateScaler;
  if (rawMultiplier <= 0) return null;
  const cap = SECTOR_PE_CAP[sector] ?? DEFAULT_PE_CAP;
  const multiplier = Math.min(rawMultiplier, cap);
  return eps * multiplier;
}

// One-shot wrapper that produces a complete intrinsic value object. The
// caller (indicators.js) just hands in the raw indicator inputs and gets
// back { graham, dcf, average, method } — no math left in the consumer.
function computeIntrinsicValue({
  fcfArr,
  netIncomes,
  forwardEPS,
  ltgPct,
  sector,
  totalDebt,
  cash,
  sharesOutstanding,
  debtEquity,
}) {
  // Normalize the cash-flow base once, then pass it to the DCF.
  const baseFcf = normalizedFcf(fcfArr, sector);
  const dcf = twoStageDcf({
    baseFcf,
    ltgPct,
    sector,
    totalDebt,
    cash,
    sharesOutstanding,
    debtEquity,
  });

  // Graham formula prefers forward EPS; fall back to normalized trailing
  // EPS so cyclicals at the bottom of a cycle still get a fair value
  // anchored to mid-cycle earnings rather than the trough print.
  let grahamEps = Number.isFinite(forwardEPS) && forwardEPS > 0 ? forwardEPS : null;
  if (grahamEps == null && Number.isFinite(sharesOutstanding) && sharesOutstanding > 0) {
    const ni = normalizedNetIncome(netIncomes, sector);
    if (Number.isFinite(ni) && ni > 0) grahamEps = ni / sharesOutstanding;
  }
  const graham = adjustedGraham({ eps: grahamEps, ltgPct, sector });

  // When both methods fire, weight the DCF more heavily (60/40). The DCF
  // uses real cash flow + sector-aware discount rate; the Graham formula
  // uses earnings + a heuristic multiplier and is more sensitive to the
  // (noisy) reported LTG. Defaulting to a simple average let Graham's
  // optimism dominate too often.
  let average;
  if (Number.isFinite(graham) && graham > 0 && Number.isFinite(dcf) && dcf > 0) {
    average = dcf * 0.6 + graham * 0.4;
  } else if (Number.isFinite(dcf) && dcf > 0) {
    average = dcf;
  } else if (Number.isFinite(graham) && graham > 0) {
    average = graham;
  } else {
    average = null;
  }

  // method tag tells consumers what produced the number, for transparency
  // in the AI prompt and for debugging when fair values look wrong.
  let method;
  if (graham != null && dcf != null) method = 'normalized_dcf+graham';
  else if (dcf != null) method = 'normalized_dcf';
  else if (graham != null) method = 'graham_only';
  else method = 'none';

  return {
    graham: graham != null ? +graham.toFixed(2) : null,
    dcf: dcf != null ? +dcf.toFixed(2) : null,
    average: average != null ? +average.toFixed(2) : null,
    method,
    inputs: {
      baseFcf: baseFcf != null ? +baseFcf.toFixed(0) : null,
      discountRate: +discountRateFor(sector, debtEquity).toFixed(4),
      terminalGrowth: terminalGrowthFor(sector),
      grahamEps: grahamEps != null ? +grahamEps.toFixed(4) : null,
    },
  };
}

module.exports = {
  computeIntrinsicValue,
  normalizedFcf,
  normalizedNetIncome,
  twoStageDcf,
  adjustedGraham,
  discountRateFor,
  terminalGrowthFor,
  // Exported for unit testing / debugging.
  RISK_FREE,
  EQUITY_RISK_PREMIUM,
  AAA_BOND_YIELD,
  EXPLICIT_YEARS,
};
