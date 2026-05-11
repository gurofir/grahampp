'use strict';

const {
  isCyclicalSector,
  isCommoditySector,
  isRegulatedSector,
  netMarginBand,
  peBand,
  containsNarrativeToken,
} = require('../analysis/sectorTaxonomy');

// ----- Indicator helpers ---------------------------------------------------

function num(v) {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

function latest(indicator) {
  if (!indicator) return null;
  if (Array.isArray(indicator.values)) return num(indicator.latestValue);
  return num(indicator.value);
}

function series(indicator) {
  if (!indicator || !Array.isArray(indicator.values)) return [];
  return indicator.values.map((v) => num(v));
}

function lastFiniteN(arr, n) {
  const out = [];
  for (let i = arr.length - 1; i >= 0 && out.length < n; i -= 1) {
    if (arr[i] != null) out.push(arr[i]);
  }
  return out.reverse();
}

function pct(v, digits = 1) {
  return v == null ? '?' : `${v.toFixed(digits)}%`;
}

function num1(v, digits = 1) {
  return v == null ? '?' : v.toFixed(digits);
}

// ----- Heuristics ----------------------------------------------------------

const peakEarningsCheck = {
  id: 'peak_earnings',
  dimension: 'peak_earnings',
  appliesTo: (input) => engineSaid(input, 'graham', 'BUY') || engineSaid(input, 'market', 'BUY'),
  evaluate: (input) => {
    const sector = input.context?.sector || null;
    const band = netMarginBand(sector);
    const peRef = peBand(sector);
    const netMargin = latest(input.indicators?.B3_netMargin);
    const pe = latest(input.indicators?.D1_pe);
    if (!band || !peRef || netMargin == null || pe == null) return [];
    if (netMargin > band.p90 && pe < peRef.median) {
      return [{
        dimension: 'peak_earnings',
        severity: 'severe',
        evidence:
          `Net margin ${pct(netMargin)} sits above sector p90 (${pct(band.p90)}) ` +
          `while P/E ${num1(pe)}× is below sector median (${num1(peRef.median)}×) — ` +
          `valuation may reflect peak earnings rather than mispricing.`,
        scoreDelta: 1,
        source: 'rule',
      }];
    }
    return [];
  },
};

const cyclicalValuationTrapCheck = {
  id: 'cyclical_valuation_trap',
  dimension: 'cyclicality',
  appliesTo: (input) => isCyclicalSector(input.context?.sector || null),
  evaluate: (input) => {
    const pe = latest(input.indicators?.D1_pe);
    const peRef = peBand(input.context?.sector || null);
    const epsSeries = series(input.indicators?.A2_epsGrowth);
    if (pe == null || !peRef) return [];
    const recent = lastFiniteN(epsSeries, 3);
    const expanding = recent.length >= 2 && recent[recent.length - 1] > 15;
    if (pe < peRef.p10 && expanding) {
      return [{
        dimension: 'cyclicality',
        severity: 'warn',
        evidence:
          `Cyclical sector with trailing P/E ${num1(pe)}× (below sector p10 ${num1(peRef.p10)}×) ` +
          `while EPS still expanding — classic late-cycle pattern.`,
        scoreDelta: 1,
        source: 'rule',
      }];
    }
    return [];
  },
};

const commodityExposureCheck = {
  id: 'commodity_exposure',
  dimension: 'commodity_exposure',
  appliesTo: (input) => isCommoditySector(input.context?.sector || null),
  evaluate: (input) => {
    const revenueGrowth = lastFiniteN(series(input.indicators?.A1_revenueGrowth), 5);
    if (revenueGrowth.length < 3) {
      return [{
        dimension: 'commodity_exposure',
        severity: 'warn',
        evidence:
          `Commodity-linked sector (${input.context?.sector}) — earnings track underlying ` +
          `commodity prices, which the model does not observe.`,
        scoreDelta: 0.7,
        source: 'rule',
      }];
    }
    const swing = Math.max(...revenueGrowth) - Math.min(...revenueGrowth);
    if (swing > 30) {
      return [{
        dimension: 'commodity_exposure',
        severity: 'severe',
        evidence:
          `Commodity-linked sector with revenue swing of ${num1(swing, 0)} pp across 5 years — ` +
          `multi-year earnings depend on cycle, not fundamentals.`,
        scoreDelta: 1,
        source: 'rule',
      }];
    }
    return [{
      dimension: 'commodity_exposure',
      severity: 'info',
      evidence:
        `Commodity-linked sector (${input.context?.sector}) — verify thesis is robust to ` +
        `commodity-price reversion.`,
      scoreDelta: 0.4,
      source: 'rule',
    }];
  },
};

const regulatoryDependencyCheck = {
  id: 'regulatory_dependency',
  dimension: 'regulatory',
  appliesTo: (input) => isRegulatedSector(input.context?.sector || null),
  evaluate: (input) => {
    return [{
      dimension: 'regulatory',
      severity: 'warn',
      evidence:
        `Regulated sector (${input.context?.sector}) — outcomes depend on policy, capital ` +
        `requirements, or pricing reviews not captured by quantitative indicators.`,
      scoreDelta: 0.6,
      source: 'rule',
    }];
  },
};

// HARD BLOCKER: balance-sheet stress overrides BUY no matter what the engine said.
const liquiditySolvencyCheck = {
  id: 'liquidity_solvency',
  dimension: 'liquidity_or_solvency',
  appliesTo: () => true,
  evaluate: (input) => {
    const findings = [];
    const ic = latest(input.indicators?.C3_interestCoverage);
    const nde = latest(input.indicators?.C4_netDebtEbitda);
    const cr = latest(input.indicators?.C2_currentRatio);

    if (ic != null && ic < 1.5) {
      findings.push({
        dimension: 'liquidity_or_solvency',
        severity: 'severe',
        evidence: `Interest coverage ${num1(ic, 2)}× is below the 1.5× threshold — debt service is at risk.`,
        scoreDelta: 1.2,
        source: 'rule',
      });
    } else if (ic != null && ic < 3) {
      findings.push({
        dimension: 'liquidity_or_solvency',
        severity: 'warn',
        evidence: `Interest coverage ${num1(ic, 2)}× is thin (< 3×) — limited cushion if EBIT softens.`,
        scoreDelta: 0.6,
        source: 'rule',
      });
    }

    if (nde != null && nde > 5) {
      findings.push({
        dimension: 'liquidity_or_solvency',
        severity: 'severe',
        evidence: `Net debt / EBITDA ${num1(nde, 1)}× exceeds 5× — leverage is elevated.`,
        scoreDelta: 1.2,
        source: 'rule',
      });
    } else if (nde != null && nde > 4) {
      findings.push({
        dimension: 'liquidity_or_solvency',
        severity: 'warn',
        evidence: `Net debt / EBITDA ${num1(nde, 1)}× is approaching 5× — leverage warrants attention.`,
        scoreDelta: 0.5,
        source: 'rule',
      });
    }

    if (cr != null && cr < 1) {
      findings.push({
        dimension: 'liquidity_or_solvency',
        severity: 'warn',
        evidence: `Current ratio ${num1(cr, 2)} below 1.0 — short-term liabilities exceed current assets.`,
        scoreDelta: 0.5,
        source: 'rule',
      });
    }

    return findings;
  },
};

const oneFactorThesisCheck = {
  id: 'one_factor_thesis',
  dimension: 'one_factor_thesis',
  appliesTo: () => true,
  evaluate: (input) => {
    const findings = [];
    for (const which of ['graham', 'market']) {
      const engine = input.engines?.[which];
      if (!engine || engine.decision === 'WAIT') continue;
      const why = Array.isArray(engine.why) ? engine.why : [];
      if (why.length < 2) continue;
      const families = why.map(classifyMetric).filter(Boolean);
      if (families.length === 0) continue;
      const allSame = families.every((f) => f === families[0]);
      if (allSame) {
        findings.push({
          dimension: 'one_factor_thesis',
          severity: 'warn',
          evidence:
            `${capitalize(which)} engine thesis rests entirely on one metric family ` +
            `(${families[0]}) — a single shock to that factor invalidates the call.`,
          scoreDelta: 0.7,
          source: 'rule',
        });
      }
    }
    return findings;
  },
};

const growthSustainabilityCheck = {
  id: 'growth_sustainability',
  dimension: 'growth_sustainability',
  appliesTo: (input) => engineSaid(input, 'market', 'BUY') || engineSaid(input, 'graham', 'BUY'),
  evaluate: (input) => {
    const rev = series(input.indicators?.A1_revenueGrowth);
    const recentArr = lastFiniteN(rev, 5);
    if (recentArr.length < 3) return [];
    const latest1y = recentArr[recentArr.length - 1];
    const trailing = recentArr.slice(0, -1);
    const trailAvg = trailing.reduce((a, b) => a + b, 0) / trailing.length;
    if (latest1y > 0 && trailAvg > 0 && latest1y > trailAvg * 3 && latest1y > 15) {
      return [{
        dimension: 'growth_sustainability',
        severity: 'warn',
        evidence:
          `Latest revenue growth ${pct(latest1y)} is more than 3× the prior ${trailing.length}-yr ` +
          `average (${pct(trailAvg)}) — likely a one-off, not a new run-rate.`,
        scoreDelta: 0.7,
        source: 'rule',
      }];
    }
    return [];
  },
};

const marginDurabilityCheck = {
  id: 'margin_durability',
  dimension: 'margin_durability',
  appliesTo: () => true,
  evaluate: (input) => {
    const gm = lastFiniteN(series(input.indicators?.B1_grossMargin), 5);
    if (gm.length < 3) return [];
    const latest1y = gm[gm.length - 1];
    const baseline = gm[0];
    const expansion = latest1y - baseline;
    if (expansion > 5) {
      return [{
        dimension: 'margin_durability',
        severity: 'warn',
        evidence:
          `Gross margin expanded ${num1(expansion)} pp over the window (from ${pct(baseline)} ` +
          `to ${pct(latest1y)}) — verify whether the moat justifies the new level.`,
        scoreDelta: 0.5,
        source: 'rule',
      }];
    }
    return [];
  },
};

const dataFreshnessCheck = {
  id: 'data_freshness',
  dimension: 'data_freshness',
  appliesTo: () => true,
  evaluate: (input) => {
    const findings = [];
    const days = input.context?.daysSinceFundamentals;
    if (typeof days === 'number' && days > 100) {
      findings.push({
        dimension: 'data_freshness',
        severity: 'warn',
        evidence: `Fundamentals are ${Math.round(days)} days old — recent operating reality may have shifted.`,
        scoreDelta: 0.4,
        source: 'rule',
      });
    }
    const earnings = input.context?.earningsDate;
    if (earnings) {
      const ms = new Date(earnings).getTime() - Date.now();
      const daysToEarnings = ms / (1000 * 60 * 60 * 24);
      if (daysToEarnings >= 0 && daysToEarnings <= 7) {
        findings.push({
          dimension: 'data_freshness',
          severity: 'warn',
          evidence:
            `Earnings within ${Math.max(0, Math.round(daysToEarnings))} days — current ` +
            `numbers may be revised in days.`,
          scoreDelta: 0.5,
          source: 'rule',
        });
      }
    }
    return findings;
  },
};

const narrativeDependenceCheck = {
  id: 'narrative_dependence',
  dimension: 'narrative_dependence',
  appliesTo: (input) => engineSaid(input, 'market', 'BUY'),
  evaluate: (input) => {
    const market = input.engines?.market;
    if (!market) return [];
    const text = `${market.thesis || ''} ${(market.why || []).join(' ')}`;
    const hasNarrative = containsNarrativeToken(text);
    const grahamDisagrees = input.engines?.graham?.decision === 'AVOID';
    if (hasNarrative && grahamDisagrees) {
      return [{
        dimension: 'narrative_dependence',
        severity: 'severe',
        evidence:
          `Market thesis leans on a popular narrative while Graham flags AVOID — ` +
          `the bull case rests on the narrative holding up.`,
        scoreDelta: 1,
        source: 'rule',
      }];
    }
    if (hasNarrative) {
      return [{
        dimension: 'narrative_dependence',
        severity: 'warn',
        evidence:
          `Market thesis relies on a popular narrative — sentiment can reverse faster ` +
          `than fundamentals.`,
        scoreDelta: 0.5,
        source: 'rule',
      }];
    }
    return [];
  },
};

const macroSensitivityCheck = {
  id: 'macro_sensitivity',
  dimension: 'macro_sensitivity',
  appliesTo: (input) => !!input.context?.rateRegime,
  evaluate: (input) => {
    const regime = input.context?.rateRegime;
    const nde = latest(input.indicators?.C4_netDebtEbitda);
    if (regime === 'tightening' && nde != null && nde > 3) {
      return [{
        dimension: 'macro_sensitivity',
        severity: 'warn',
        evidence:
          `Tightening rate regime with net debt / EBITDA ${num1(nde, 1)}× — refinancing ` +
          `cost pressures real and forward earnings.`,
        scoreDelta: 0.6,
        source: 'rule',
      }];
    }
    return [];
  },
};

// ----- Tailwind heuristics -------------------------------------------------
// These detect *positive* context the static numbers may hide. They lower
// fragility but can NEVER override a severe headwind in a protected dimension
// (liquidity_or_solvency, accounting_quality). The Graham synthesis prompt
// receives these in a separate block and is instructed to use them only to
// upgrade WAIT → BUY when the underlying numbers are at least acceptable.

const cyclicalBottomCheck = {
  id: 'cyclical_bottom',
  dimension: 'cyclical_bottom',
  appliesTo: (input) => isCyclicalSector(input.context?.sector || null),
  evaluate: (input) => {
    const epsArr = lastFiniteN(series(input.indicators?.A2_epsGrowth), 4);
    const grossArr = lastFiniteN(series(input.indicators?.B1_grossMargin), 5);
    if (epsArr.length < 3 || grossArr.length < 3) return [];

    // Trough signal: EPS growth deeply negative this year, but the prior years
    // were better — i.e., we're IN the contraction, not before it.
    const latestEps = epsArr[epsArr.length - 1];
    const priorEps = epsArr.slice(0, -1);
    const priorAvg = priorEps.reduce((a, b) => a + b, 0) / priorEps.length;
    const inContraction = latestEps < -10 && priorAvg > latestEps + 15;

    // Gross margin holding up = damage is at the top line, not structural.
    const latestGross = grossArr[grossArr.length - 1];
    const baselineGross = grossArr[0];
    const grossHolding = latestGross >= baselineGross - 3; // within 3pp of baseline

    if (inContraction && grossHolding) {
      return [{
        dimension: 'cyclical_bottom',
        severity: 'tailwind',
        evidence:
          `Cyclical sector with EPS growth ${pct(latestEps)} (down sharply from ${pct(priorAvg)} avg) ` +
          `while gross margin ${pct(latestGross)} held vs baseline ${pct(baselineGross)} — possible cycle trough.`,
        scoreDelta: 1,
        source: 'rule',
      }];
    }
    return [];
  },
};

const deLeveragingCheck = {
  id: 'de_leveraging',
  dimension: 'de_leveraging',
  appliesTo: () => true,
  evaluate: (input) => {
    const ndeSeries = lastFiniteN(series(input.indicators?.C4_netDebtEbitda), 5);
    if (ndeSeries.length < 3) return [];
    const earliest = ndeSeries[0];
    const current = ndeSeries[ndeSeries.length - 1];
    if (!Number.isFinite(earliest) || !Number.isFinite(current)) return [];
    if (earliest <= 0) return []; // no leverage to reduce
    const reduction = (earliest - current) / earliest;
    const movedFromStress = earliest >= 4 && current < 3;

    if (movedFromStress) {
      return [{
        dimension: 'de_leveraging',
        severity: 'strong_tailwind',
        evidence:
          `Net debt / EBITDA fell from ${num1(earliest, 1)}× to ${num1(current, 1)}× — balance sheet ` +
          `moved out of stress zone into safe territory.`,
        scoreDelta: 1,
        source: 'rule',
      }];
    }
    if (reduction >= 0.30 && earliest >= 2) {
      return [{
        dimension: 'de_leveraging',
        severity: 'tailwind',
        evidence:
          `Net debt / EBITDA reduced ${num1(reduction * 100, 0)}% (from ${num1(earliest, 1)}× to ${num1(current, 1)}×) ` +
          `— de-leveraging trend shifts the risk profile.`,
        scoreDelta: 1,
        source: 'rule',
      }];
    }
    return [];
  },
};

const marginInflectionCheck = {
  id: 'margin_inflection',
  dimension: 'margin_inflection',
  appliesTo: () => true,
  evaluate: (input) => {
    const opSeries = lastFiniteN(series(input.indicators?.B2_operatingMargin), 5);
    if (opSeries.length < 4) return [];
    // Three years of decline followed by clear recovery in the latest year.
    const latest1y = opSeries[opSeries.length - 1];
    const prior1y = opSeries[opSeries.length - 2];
    const prior2y = opSeries[opSeries.length - 3];
    const prior3y = opSeries[opSeries.length - 4];

    const wasDeclining = prior3y > prior2y && prior2y > prior1y;
    const recovered = latest1y - prior1y >= 2; // +2pp inflection
    const meaningfulRecovery = latest1y >= prior2y;

    if (wasDeclining && recovered && meaningfulRecovery) {
      return [{
        dimension: 'margin_inflection',
        severity: 'tailwind',
        evidence:
          `Operating margin inflected: declined ${pct(prior3y)} → ${pct(prior2y)} → ${pct(prior1y)}, ` +
          `recovered to ${pct(latest1y)} — pressure may be lifting.`,
        scoreDelta: 1,
        source: 'rule',
      }];
    }
    return [];
  },
};

// Insider cluster buying. Multiple distinct insiders (>=3) buying with their
// own money in the same window is one of the most predictive equity signals.
// Single-insider buys are noisier; we require a cluster to fire.
const insiderClusterBuyingCheck = {
  id: 'insider_cluster_buying',
  dimension: 'insider_cluster_buying',
  appliesTo: (input) => !!input.context?.insider,
  evaluate: (input) => {
    const ins = input.context.insider;
    if (!ins || !ins.buyers) return [];
    const netUsd = ins.netUsd ?? 0;
    const score = ins.score; // net buy as % of market cap
    if (ins.buyers >= 3 && netUsd > 0) {
      const heavy = score != null && score > 0.05; // > 0.05% of market cap
      return [{
        dimension: 'insider_cluster_buying',
        severity: heavy ? 'strong_tailwind' : 'tailwind',
        evidence:
          `${ins.buyers} insiders bought $${num1(netUsd / 1_000_000, 1)}M net over the last ` +
          `6 months${score != null ? ` (${num1(score, 2)}% of market cap)` : ''} — cluster buy with own capital.`,
        scoreDelta: heavy ? 1.2 : 0.8,
        source: 'rule',
      }];
    }
    return [];
  },
};

// Yield trap. A very high dividend yield combined with a payout ratio that
// already exceeds earnings is a classic dividend-cut warning. Cuts often
// trigger 30-50% drawdowns even before fundamentals deteriorate.
const yieldTrapCheck = {
  id: 'yield_trap',
  dimension: 'yield_trap',
  appliesTo: () => true,
  evaluate: (input) => {
    const yld = latest(input.indicators?.D8_dividendYield);
    const payout = latest(input.indicators?.D9_payoutRatio);
    if (yld == null || payout == null) return [];
    if (yld > 6 && payout > 80) {
      return [{
        dimension: 'yield_trap',
        severity: payout > 100 ? 'severe' : 'warn',
        evidence:
          `Dividend yield ${pct(yld)} with payout ratio ${pct(payout)} — dividend looks ` +
          `unsustainable; a cut would compress both yield and price.`,
        scoreDelta: payout > 100 ? 1 : 0.7,
        source: 'rule',
      }];
    }
    return [];
  },
};

// Dividend aristocrat / capital-return quality. A long unbroken streak of
// non-decreasing dividends combined with a sustainable payout ratio is a
// durability signal that doesn't show up in any single-year ratio.
const capitalReturnQualityCheck = {
  id: 'capital_return_quality',
  dimension: 'capital_return_quality',
  appliesTo: () => true,
  evaluate: (input) => {
    const streak = latest(input.indicators?.D10_dividendStreak);
    const payout = latest(input.indicators?.D9_payoutRatio);
    if (streak == null || streak < 10) return [];
    const sustainable = payout == null || payout < 75;
    if (!sustainable) return [];
    const aristocrat = streak >= 25;
    return [{
      dimension: 'capital_return_quality',
      severity: aristocrat ? 'strong_tailwind' : 'tailwind',
      evidence:
        `${Math.round(streak)} years of consecutive non-decreasing dividends` +
        `${payout != null ? ` with payout ${pct(payout)}` : ''} — sustained capital-return ` +
        `discipline through multiple cycles.`,
      scoreDelta: aristocrat ? 1 : 0.6,
      source: 'rule',
    }];
  },
};

// ----- Helpers -------------------------------------------------------------

function engineSaid(input, which, decision) {
  return input.engines?.[which]?.decision === decision;
}

function capitalize(s) {
  return typeof s === 'string' && s.length ? s[0].toUpperCase() + s.slice(1) : s;
}

// Heuristic classifier — bins a `why` bullet into a metric family.
function classifyMetric(text) {
  if (typeof text !== 'string') return null;
  const t = text.toLowerCase();
  if (/\bp\/?e\b|peg|מכפיל|valuation|fcf yield|תשואת תזרים|מרווח ביטחון|margin of safety|intrinsic|ערך פנימי/.test(t)) return 'valuation';
  if (/growth|revenue|sales|eps|earnings|צמיחה|הכנסות|רווחים|רווח למניה/.test(t)) return 'growth';
  if (/margin|roic|roe|profitab|מרווח|תשואה על|רווחיות/.test(t)) return 'profitability';
  if (/debt|coverage|leverage|liquid|חוב|מינוף|כיסוי|נזילות/.test(t)) return 'balance';
  if (/moat|brand|switching|network|יתרון תחרותי/.test(t)) return 'moat';
  if (/sentiment|momentum|narrative|story|theme|סנטימנט|מומנטום|נרטיב/.test(t)) return 'sentiment';
  return null;
}

const REGISTRY = [
  liquiditySolvencyCheck,    // hard blockers first
  peakEarningsCheck,
  cyclicalValuationTrapCheck,
  commodityExposureCheck,
  regulatoryDependencyCheck,
  oneFactorThesisCheck,
  growthSustainabilityCheck,
  marginDurabilityCheck,
  dataFreshnessCheck,
  narrativeDependenceCheck,
  macroSensitivityCheck,
  yieldTrapCheck,
  // tailwinds
  cyclicalBottomCheck,
  deLeveragingCheck,
  marginInflectionCheck,
  insiderClusterBuyingCheck,
  capitalReturnQualityCheck,
];

const HARD_BLOCKER_DIMENSIONS = new Set([
  'liquidity_or_solvency',
  'accounting_quality',
]);

const TAILWIND_SEVERITIES = new Set(['tailwind', 'strong_tailwind']);

function isTailwind(finding) {
  return TAILWIND_SEVERITIES.has(finding.severity);
}

function isHeadwind(finding) {
  return !isTailwind(finding);
}

// Hard blockers are headwinds only — a tailwind can never become a blocker
// (otherwise we'd allow positive context to override caution, which we don't).
function isHardBlocker(finding) {
  return (
    finding.severity === 'severe' &&
    HARD_BLOCKER_DIMENSIONS.has(finding.dimension)
  );
}

function applyRegistry(input) {
  const all = [];
  for (const rule of REGISTRY) {
    try {
      if (!rule.appliesTo(input)) continue;
      const findings = rule.evaluate(input) || [];
      for (const f of findings) {
        if (!f || !f.dimension || !f.evidence) continue;
        all.push({
          dimension: f.dimension,
          severity: f.severity || 'warn',
          evidence: String(f.evidence).trim(),
          scoreDelta: typeof f.scoreDelta === 'number' ? f.scoreDelta : 1,
          source: 'rule',
        });
      }
    } catch (err) {
      // A buggy heuristic must never break the layer.
      console.error(`[realityCheck] heuristic ${rule.id} failed:`, err && err.message);
    }
  }
  return all;
}

module.exports = {
  REGISTRY,
  applyRegistry,
  isHardBlocker,
  isTailwind,
  isHeadwind,
  HARD_BLOCKER_DIMENSIONS,
  TAILWIND_SEVERITIES,
  // Exported for unit-style debugging if needed.
  classifyMetric,
};
