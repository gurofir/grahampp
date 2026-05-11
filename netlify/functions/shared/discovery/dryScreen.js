'use strict';

// Discovery Engine — deterministic "dry screen" applied AFTER the free
// indicator math but BEFORE any AI call. Mirrors Graham's own BUY criteria
// (see GRAHAM_PROMPT in shared/engines/engines.js):
//
//   ABSOLUTE PREREQUISITES (must hold for any BUY):
//     - C4_netDebtEbitda < 5
//     - C3_interestCoverage > 2
//     - FCF positive in at least 2 of the last 3 years
//
//   And ANY ONE of three pillars must hold:
//     PILLAR 1 — Quality at a fair price:
//       B4_roic > 12% AND (D1_pe < 22 OR D2_forwardPE < 18)
//     PILLAR 2 — Margin of safety:
//       D7_marginOfSafety > 10% AND B4_roic > 6%
//     PILLAR 3 — Value with quality signal:
//       D1_pe in [8, 18] AND (B1_grossMargin > 35% OR B4_roic > 8%)
//       AND F1_roicTrend not strongly negative (>= -3 pp/year)
//
// A ticker that fails any prerequisite OR fails ALL three pillars cannot be
// a Graham BUY -- spending an AI call on it is guaranteed to return WAIT or
// AVOID. We drop those before AI.
//
// Lenient about NULLs: a missing indicator never causes a reject by itself;
// it just can't satisfy the rule it would have helped. This avoids dropping
// good companies whose Yahoo data has gaps.

// Read either a scalar (`.value`) or series (`.latestValue`) indicator.
function v(indicators, key) {
  const ind = indicators[key];
  if (!ind) return null;
  if (Object.prototype.hasOwnProperty.call(ind, 'value')) return ind.value;
  if (Object.prototype.hasOwnProperty.call(ind, 'latestValue')) return ind.latestValue;
  return null;
}

function passesDryScreen(indicators, fcfArr) {
  if (!indicators) return { pass: false, reason: 'no_indicators' };

  // --- Prerequisites (hard rejects) ---------------------------------------
  const netDebtEbitda = v(indicators, 'C4_netDebtEbitda');
  if (netDebtEbitda != null && netDebtEbitda > 5) {
    return { pass: false, reason: 'leverage' };
  }

  const interestCoverage = v(indicators, 'C3_interestCoverage');
  // Only reject if interest expense is non-trivial AND coverage < 2. A null
  // or zero coverage usually means no debt at all (ideal balance sheet).
  if (interestCoverage != null && interestCoverage > 0 && interestCoverage < 2) {
    return { pass: false, reason: 'coverage' };
  }

  // FCF positive in at least 2 of the last 3 years (one bad year allowed).
  if (Array.isArray(fcfArr) && fcfArr.length >= 2) {
    const last3 = fcfArr.slice(-3).filter((x) => Number.isFinite(x));
    if (last3.length >= 2) {
      const positive = last3.filter((x) => x > 0).length;
      if (positive < 2) {
        return { pass: false, reason: 'fcf' };
      }
    }
  }

  // --- Pillars (need at least one to pass) --------------------------------
  const roic = v(indicators, 'B4_roic');
  const pe = v(indicators, 'D1_pe');
  const forwardPE = v(indicators, 'D2_forwardPE');
  const marginOfSafety = v(indicators, 'D7_marginOfSafety');
  const grossMargin = v(indicators, 'B1_grossMargin');
  const roicTrend = v(indicators, 'F1_roicTrend');

  const pillar1 =
    roic != null &&
    roic > 12 &&
    ((pe != null && pe > 0 && pe < 22) ||
      (forwardPE != null && forwardPE > 0 && forwardPE < 18));

  const pillar2 =
    marginOfSafety != null &&
    marginOfSafety > 10 &&
    roic != null &&
    roic > 6;

  const pillar3 =
    pe != null &&
    pe >= 8 &&
    pe <= 18 &&
    ((grossMargin != null && grossMargin > 35) ||
      (roic != null && roic > 8)) &&
    // -3 percentage points per year is the "strongly negative" cutoff.
    (roicTrend == null || roicTrend > -3);

  if (!pillar1 && !pillar2 && !pillar3) {
    return { pass: false, reason: 'no_pillar' };
  }

  return { pass: true };
}

module.exports = { passesDryScreen };
