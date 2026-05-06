'use strict';

// Static sector classification used by the Reality Check Layer.
// All values are coarse-grained; this is intentional — the layer is meant to
// flag *suspicion*, not to publish a definitive sector model.

const CYCLICAL_SECTORS = new Set([
  'Energy',
  'Basic Materials',
  'Industrials',
  'Consumer Cyclical',
  'Financial Services',
  'Real Estate',
]);

const COMMODITY_SECTORS = new Set([
  'Energy',
  'Basic Materials',
]);

const REGULATED_SECTORS = new Set([
  'Utilities',
  'Financial Services',
  'Healthcare',
  'Communication Services',
]);

// Coarse net-margin reference points (percent).
// p50 / p90 by sector. Numbers are deliberately conservative and stable.
// Source: blended large-cap medians; refresh via a separate process if needed.
const NET_MARGIN_BANDS = {
  'Technology':              { p50: 18, p90: 30 },
  'Communication Services':  { p50: 12, p90: 24 },
  'Healthcare':              { p50: 10, p90: 22 },
  'Consumer Defensive':      { p50: 7,  p90: 14 },
  'Consumer Cyclical':       { p50: 6,  p90: 12 },
  'Industrials':             { p50: 8,  p90: 16 },
  'Financial Services':      { p50: 18, p90: 30 },
  'Utilities':               { p50: 9,  p90: 16 },
  'Real Estate':             { p50: 14, p90: 28 },
  'Energy':                  { p50: 8,  p90: 18 },
  'Basic Materials':         { p50: 8,  p90: 18 },
};

// Coarse trailing P/E reference points by sector.
const PE_BANDS = {
  'Technology':              { median: 26, p10: 16 },
  'Communication Services':  { median: 18, p10: 11 },
  'Healthcare':              { median: 22, p10: 14 },
  'Consumer Defensive':      { median: 20, p10: 14 },
  'Consumer Cyclical':       { median: 17, p10: 10 },
  'Industrials':             { median: 19, p10: 12 },
  'Financial Services':      { median: 12, p10: 8  },
  'Utilities':               { median: 17, p10: 12 },
  'Real Estate':             { median: 25, p10: 15 },
  'Energy':                  { median: 11, p10: 6  },
  'Basic Materials':         { median: 13, p10: 7  },
};

// Narrative tokens (case-insensitive) — when a market-engine thesis
// leans heavily on these, narrative dependence rises.
const NARRATIVE_TOKENS = [
  'AI', 'GenAI', 'LLM', 'GPU', 'cloud', 'platform',
  'EV', 'battery', 'solar', 'wind', 'hydrogen', 'GLP-1',
  'crypto', 'blockchain', 'metaverse', 'quantum',
  'narrative', 'momentum', 'theme', 'story',
  // Hebrew variants
  'בינה מלאכותית', 'נרטיב', 'מומנטום', 'תזה',
];

function isCyclicalSector(sector) {
  return !!sector && CYCLICAL_SECTORS.has(sector);
}

function isCommoditySector(sector) {
  return !!sector && COMMODITY_SECTORS.has(sector);
}

function isRegulatedSector(sector) {
  return !!sector && REGULATED_SECTORS.has(sector);
}

function netMarginBand(sector) {
  if (!sector) return null;
  return NET_MARGIN_BANDS[sector] || null;
}

function peBand(sector) {
  if (!sector) return null;
  return PE_BANDS[sector] || null;
}

function containsNarrativeToken(text) {
  if (typeof text !== 'string' || !text) return false;
  const lower = text.toLowerCase();
  return NARRATIVE_TOKENS.some((tok) => lower.includes(tok.toLowerCase()));
}

module.exports = {
  isCyclicalSector,
  isCommoditySector,
  isRegulatedSector,
  netMarginBand,
  peBand,
  containsNarrativeToken,
};
