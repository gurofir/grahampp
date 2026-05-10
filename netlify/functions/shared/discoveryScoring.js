'use strict';

// Discovery-engine ranking + classification helpers.
// scoreSetup: combines setup type and confidence into a sort key (higher = more interesting).
// detectSituationType: maps the indicator profile to a human-readable situation tag
// (used as a UI badge — does NOT influence Graham/Market decisions).

function scoreSetup(setupType, grahamConfidence, marketConfidence) {
  const BASE = {
    rare_value: 100, // Graham BUY, Market disagrees — most interesting
    consensus_buy: 80, // Both BUY — high conviction
    consensus_avoid: 60, // Both AVOID — useful for shorts/avoidance
    market_leading: 40, // Market BUY, Graham skeptical
    neutral: 20,
  };
  const CONF_BONUS = { High: 20, Medium: 10, Low: 0 };
  const base = BASE[setupType] ?? 20;
  const bonus =
    (CONF_BONUS[grahamConfidence] ?? 0) + (CONF_BONUS[marketConfidence] ?? 0);
  return base + bonus;
}

function _value(ind) {
  if (!ind) return null;
  if (typeof ind.value === 'number' && Number.isFinite(ind.value)) return ind.value;
  if (Array.isArray(ind.values) && ind.values.length) {
    const last = ind.values[ind.values.length - 1];
    return typeof last === 'number' && Number.isFinite(last) ? last : null;
  }
  return null;
}

function _tier(ind) {
  if (!ind) return null;
  return ind.tier ?? ind.latestTier ?? null;
}

function detectSituationType(indicators) {
  if (!indicators || typeof indicators !== 'object') return 'general';

  const marginOfSafety = _value(indicators.D7_marginOfSafety);
  const roic = _value(indicators.B4_roic);
  const roicTrend = _value(indicators.F1_roicTrend);
  const debtEbitda = _value(indicators.C4_netDebtEbitda);
  const revenueGrowthTier = _tier(indicators.A1_revenueGrowth);
  const valuationTier = _tier(indicators.D1_pe);

  if (marginOfSafety != null && marginOfSafety > 15 && roic != null && roic > 8) {
    return 'value_opportunity';
  }
  if (roicTrend != null && roicTrend > 2 && roic != null && roic < 15) {
    return 'early_recovery';
  }
  if (
    roic != null &&
    roic > 15 &&
    (valuationTier === 'undervalued' || valuationTier === 'deep_value')
  ) {
    return 'quality_discounted';
  }
  if (debtEbitda != null && debtEbitda > 2.5 && roicTrend != null && roicTrend > 1) {
    return 'deleveraging';
  }
  if (revenueGrowthTier === 'strong' || revenueGrowthTier === 'exceptional') {
    return 'growth_compressed';
  }
  return 'general';
}

module.exports = { scoreSetup, detectSituationType };
