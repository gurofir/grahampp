'use strict';

const { computeTierAndPosition } = require('./scalePosition');
const { computeIntrinsicValue } = require('./valuationModel');
const { isCyclicalSector } = require('./sectorTaxonomy');

const TAX_RATE = 0.21;
const MAINT_CAPEX_PORTION = 0.6;

// Median helper, used to normalize cyclical EBIT so a peak/trough year
// doesn't dominate ROIC (the moat lens). Returns null on empty input.
function medianFinite(arr) {
  const sorted = (arr || []).filter(Number.isFinite).slice().sort((a, b) => a - b);
  if (sorted.length === 0) return null;
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

function safeDiv(num, den) {
  if (den == null || !Number.isFinite(den) || den === 0) return null;
  if (num == null || !Number.isFinite(num)) return null;
  return num / den;
}

function fcfFromOcfCapex(ocf, capex) {
  // Yahoo's capitalExpenditure is signed negative — adding produces FCF.
  if (!Number.isFinite(ocf)) return null;
  return ocf + (Number.isFinite(capex) ? capex : 0);
}

function pctSeries(arr, denomArr) {
  return arr.map((v, i) => {
    const d = denomArr[i];
    if (!Number.isFinite(v) || !Number.isFinite(d) || d === 0) return null;
    return (v / d) * 100;
  });
}

function yoySeries(arr) {
  return arr.map((v, i) => {
    if (i === 0) return null;
    const prev = arr[i - 1];
    if (!Number.isFinite(v) || !Number.isFinite(prev) || prev === 0) return null;
    return ((v - prev) / Math.abs(prev)) * 100;
  });
}

function lastFinite(arr) {
  for (let i = arr.length - 1; i >= 0; i -= 1) {
    if (Number.isFinite(arr[i])) return arr[i];
  }
  return null;
}

function stdDev(values) {
  const finite = values.filter((v) => Number.isFinite(v));
  if (finite.length < 2) return null;
  const mean = finite.reduce((a, b) => a + b, 0) / finite.length;
  const variance =
    finite.reduce((acc, v) => acc + (v - mean) * (v - mean), 0) / finite.length;
  return Math.sqrt(variance);
}

function buildSeries(key, category, values, sector) {
  const latestValue = lastFinite(values);
  const { tier, position } =
    latestValue == null
      ? { tier: null, position: null }
      : computeTierAndPosition(key, latestValue, sector);
  return {
    key,
    category,
    values: values.map((v) => (Number.isFinite(v) ? v : null)),
    latestValue,
    latestTier: tier,
    latestPosition: position,
  };
}

function buildScalar(key, category, value, sector) {
  if (value == null || !Number.isFinite(value)) {
    return { key, category, value: null, tier: null, position: null };
  }
  const { tier, position } = computeTierAndPosition(key, value, sector);
  return { key, category, value, tier, position };
}

/**
 * Compute the full Layer 2 indicator object from raw fundamentals.
 * `raw` should match the shape produced by analyze.js fetchFundamentals.
 */
function computeIndicators(raw) {
  const {
    revenues = [],
    operatingIncomes = [],
    netIncomes = [],
    operatingCashFlows = [],
    capexArr = [],
    ebits = [],
    interestExpenses = [],
    grossProfits = [],
    depreciationAmortization = [],
    totalDebt = 0,
    totalEquity = 0,
    cash = 0,
    currentAssets = 0,
    currentLiabilities = 0,
    ebitda = null,
    marketCap = null,
    sharesOutstanding = null,
    currentPrice = null,
    peRatio = null,
    forwardPE = null,
    pegRatio = null,
    priceSales = null,
    forwardEPS = null,
    longTermGrowthRate = null,
    dividendYield = null,
    payoutRatio = null,
    dividendStreak = null,
    insider = null,
    sector = null,
  } = raw;

  // Per-year FCF
  const fcfArr = operatingCashFlows.map((ocf, i) => fcfFromOcfCapex(ocf, capexArr[i]));

  // Per-year FCF conversion (FCF / NetIncome)
  const fcfConversions = fcfArr.map((fcf, i) => {
    const ni = netIncomes[i];
    if (!Number.isFinite(fcf) || !Number.isFinite(ni) || ni === 0) return null;
    return fcf / ni;
  });

  // EPS proxy series: net income / current shares outstanding (shares snapshot).
  const epsArr = sharesOutstanding
    ? netIncomes.map((ni) => (Number.isFinite(ni) ? ni / sharesOutstanding : null))
    : netIncomes.map(() => null);

  // ── A. Growth ──
  const A1 = buildSeries('A1_revenueGrowth', 'A', yoySeries(revenues));
  const A2 = buildSeries('A2_epsGrowth', 'A', yoySeries(epsArr));

  const latestFcf = lastFinite(fcfArr);
  const latestNi = lastFinite(netIncomes);
  const fcfConvLatest = safeDiv(latestFcf, latestNi);
  const A3 = buildScalar('A3_fcfConversion', 'A', fcfConvLatest);

  const latestDA = lastFinite(depreciationAmortization);
  const latestCapex = lastFinite(capexArr);
  // Maintenance CapEx ≈ 60% of total CapEx (capex is negative on Yahoo).
  const maintCapex = Number.isFinite(latestCapex) ? latestCapex * MAINT_CAPEX_PORTION : 0;
  const ownerEarnings = Number.isFinite(latestNi)
    ? latestNi + (Number.isFinite(latestDA) ? latestDA : 0) + maintCapex
    : null;
  const ownerEarningsRatio = safeDiv(ownerEarnings, latestNi);
  const A4 = buildScalar('A4_ownerEarnings', 'A', ownerEarningsRatio);

  // ── B. Profitability ──
  const grossMarginsCalc = (grossProfits.length === revenues.length)
    ? pctSeries(grossProfits, revenues)
    : revenues.map(() => null);
  const operatingMargins = pctSeries(operatingIncomes, revenues);
  const netMargins = pctSeries(netIncomes, revenues);

  const B1 = buildSeries('B1_grossMargin', 'B', grossMarginsCalc);
  const B2 = buildSeries('B2_operatingMargin', 'B', operatingMargins);
  const B3 = buildSeries('B3_netMargin', 'B', netMargins);

  const latestEbit = lastFinite(ebits);
  const investedCapital = (totalEquity || 0) + (totalDebt || 0) - (cash || 0);
  // For cyclical sectors (Energy, Materials, Industrials, Consumer
  // Cyclical, Financials, Real Estate) we use a 5-year median EBIT so the
  // moat lens isn't fooled by peak earnings. For stable businesses the
  // latest year is the right base. Both pass through the same tier table
  // so the consumer doesn't need to know the difference.
  const normalizedEbit = isCyclicalSector(sector)
    ? medianFinite(ebits.slice(-5))
    : latestEbit;
  const roic = (Number.isFinite(normalizedEbit) && investedCapital > 0)
    ? (normalizedEbit * (1 - TAX_RATE) / investedCapital) * 100
    : null;
  // B4 uses the sector-relative tier overlay because banks/utilities/REITs
  // structurally run lower ROIC than tech/healthcare. See scalePosition.js
  // SECTOR_OVERLAYS for the full table.
  const B4 = buildScalar('B4_roic', 'B', roic, sector);

  const roe = (Number.isFinite(latestNi) && totalEquity > 0)
    ? (latestNi / totalEquity) * 100
    : null;
  const B5 = buildScalar('B5_roe', 'B', roe);

  // ── C. Financial Health ──
  const debtEquity = safeDiv(totalDebt, totalEquity);
  // C1 uses the sector-relative tier overlay: utilities/REITs/financials
  // carry structurally higher D/E by design, not as stress signals.
  const C1 = buildScalar('C1_debtEquity', 'C', debtEquity, sector);

  const currentRatio = safeDiv(currentAssets, currentLiabilities);
  const C2 = buildScalar('C2_currentRatio', 'C', currentRatio);

  const latestInterest = lastFinite(interestExpenses);
  const interestCoverage = (Number.isFinite(latestEbit) && Number.isFinite(latestInterest) && latestInterest !== 0)
    ? latestEbit / Math.abs(latestInterest)
    : null;
  const C3 = buildScalar('C3_interestCoverage', 'C', interestCoverage);

  const netDebt = (totalDebt || 0) - (cash || 0);
  const netDebtEbitda = (Number.isFinite(ebitda) && ebitda > 0) ? netDebt / ebitda : null;
  const C4 = buildScalar('C4_netDebtEbitda', 'C', netDebtEbitda);

  // ── D. Valuation ──
  // D1/D2 use sector-relative tier overlays: Energy P/E 11 is fair (sector
  // median); Tech P/E 25 is fair (sector median). The global table treats
  // both as either "speculative" or "deep_value" -- both wrong.
  const D1 = buildScalar('D1_pe', 'D', peRatio, sector);
  const D2 = buildScalar('D2_forwardPE', 'D', forwardPE, sector);
  const D3 = buildScalar('D3_peg', 'D', pegRatio);

  const fcfYield = (Number.isFinite(latestFcf) && Number.isFinite(marketCap) && marketCap > 0)
    ? (latestFcf / marketCap) * 100
    : null;
  const D4 = buildScalar('D4_fcfYield', 'D', fcfYield);

  const ev = (Number.isFinite(marketCap) ? marketCap : 0) + (totalDebt || 0) - (cash || 0);
  const evEbitda = (ev > 0 && Number.isFinite(ebitda) && ebitda > 0) ? ev / ebitda : null;
  const D5 = buildScalar('D5_evEbitda', 'D', evEbitda);

  const D6 = buildScalar('D6_priceSales', 'D', priceSales);

  // Intrinsic value -- delegated to the dedicated valuation model so this
  // file stays focused on indicator wiring. See valuationModel.js for the
  // two-stage DCF, sector-aware discount/terminal rates, normalized FCF
  // base, and bond-yield-adjusted Graham formula.
  const ivResult = computeIntrinsicValue({
    fcfArr,
    netIncomes,
    forwardEPS,
    ltgPct: longTermGrowthRate,
    sector,
    totalDebt,
    cash,
    sharesOutstanding,
    debtEquity,
  });
  const grahamIntrinsic = ivResult.graham;
  const dcfIntrinsic = ivResult.dcf;
  const intrinsicAvg = ivResult.average;

  const marginOfSafety = (Number.isFinite(intrinsicAvg) && intrinsicAvg > 0 && Number.isFinite(currentPrice))
    ? ((intrinsicAvg - currentPrice) / intrinsicAvg) * 100
    : null;
  const D7 = buildScalar('D7_marginOfSafety', 'D', marginOfSafety);

  // D8/D9/D10 — Income & capital-return signals. Critical for value/income
  // investors and for moat detection: a 25-year unbroken dividend streak is
  // a stronger durability signal than any single-year ratio.
  const D8 = buildScalar('D8_dividendYield', 'D', dividendYield);
  const D9 = buildScalar('D9_payoutRatio', 'D', payoutRatio);
  const D10 = buildScalar('D10_dividendStreak', 'D', dividendStreak);

  // ── E. Moat ──
  const E1 = buildScalar(
    'E1_grossMarginStability',
    'E',
    stdDev(grossMarginsCalc),
  );
  // Reuse ROIC for the moat lens.
  const E2 = buildScalar('E2_roicMoat', 'E', roic);

  // ── F. Management ──
  // Approximate ROIC trend: compare latest year vs 3 years prior using
  // operatingIncome*(1-tax) / latest investedCapital (held constant — best proxy
  // available without per-year invested capital). Then divide by years.
  const F1 = (() => {
    if (investedCapital <= 0) return buildScalar('F1_roicTrend', 'F', null);
    const opIncomeFinite = operatingIncomes.filter(Number.isFinite);
    if (opIncomeFinite.length < 2) return buildScalar('F1_roicTrend', 'F', null);
    const latest = opIncomeFinite[opIncomeFinite.length - 1];
    const idx = Math.max(0, opIncomeFinite.length - 4);
    const baseline = opIncomeFinite[idx];
    const yearsSpan = (opIncomeFinite.length - 1 - idx) || 1;
    const latestRoicPp = (latest * (1 - TAX_RATE) / investedCapital) * 100;
    const baseRoicPp = (baseline * (1 - TAX_RATE) / investedCapital) * 100;
    const trendPpPerYear = (latestRoicPp - baseRoicPp) / yearsSpan;
    return buildScalar('F1_roicTrend', 'F', trendPpPerYear);
  })();

  const F2 = (() => {
    const recent = fcfConversions.slice(-3).filter((v) => Number.isFinite(v));
    if (recent.length === 0) return buildScalar('F2_fcfConversionTrend', 'F', null);
    const avg = recent.reduce((a, b) => a + b, 0) / recent.length;
    return buildScalar('F2_fcfConversionTrend', 'F', avg);
  })();

  // F3 — Insider buying/selling signal. Measured as net insider $ over the
  // last 6 months as a percentage of market cap. Cluster buys (multiple
  // distinct insiders) are flagged separately in `insider.buyers` so the
  // Reality Check layer can promote them to a tailwind. Single-insider
  // selling is noisy (tax / personal liquidity) and intentionally not
  // penalised by this scalar.
  const F3 = buildScalar('F3_insiderSignal', 'F', insider?.score ?? null);

  const indicators = {
    A1_revenueGrowth: A1,
    A2_epsGrowth: A2,
    A3_fcfConversion: A3,
    A4_ownerEarnings: A4,
    B1_grossMargin: B1,
    B2_operatingMargin: B2,
    B3_netMargin: B3,
    B4_roic: B4,
    B5_roe: B5,
    C1_debtEquity: C1,
    C2_currentRatio: C2,
    C3_interestCoverage: C3,
    C4_netDebtEbitda: C4,
    D1_pe: D1,
    D2_forwardPE: D2,
    D3_peg: D3,
    D4_fcfYield: D4,
    D5_evEbitda: D5,
    D6_priceSales: D6,
    D7_marginOfSafety: D7,
    D8_dividendYield: D8,
    D9_payoutRatio: D9,
    D10_dividendStreak: D10,
    E1_grossMarginStability: E1,
    E2_roicMoat: E2,
    F1_roicTrend: F1,
    F2_fcfConversionTrend: F2,
    F3_insiderSignal: F3,
  };

  return {
    indicators,
    intrinsicValue: {
      graham: grahamIntrinsic,
      dcf: dcfIntrinsic,
      average: intrinsicAvg,
      method: ivResult.method,
      inputs: ivResult.inputs,
    },
    fcfArr,
    fcfConversions,
    insider: insider ?? null,
  };
}

module.exports = {
  computeIndicators,
};
