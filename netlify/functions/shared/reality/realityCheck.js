'use strict';

// Reality Check is now Graham's INTERNAL stage, not a wrapping layer.
// This module exposes:
//   1. computeFindings(input)        — runs deterministic heuristics BEFORE the
//                                      Graham LLM, so Graham can synthesize them
//                                      into one unified verdict.
//   2. enforceHardBlockers(graham, findings) — final safety net AFTER Graham
//                                      returns. Even if Graham tries to BUY
//                                      despite a severe leverage finding, this
//                                      function pulls it back to WAIT and
//                                      attaches `blocked: true`.
//   3. fragilityFromFindings(findings) — fallback band derivation when Graham
//                                      did not return a band (parse failure,
//                                      old prompt cache, etc.).
//
// The previous adversary LLM call has been removed; Graham now produces the
// counter-thesis itself as part of its synthesis prompt.

const { applyRegistry, isHardBlocker, isTailwind } = require('./realityHeuristics');

// Headwinds raise fragility, tailwinds lower it. Tailwind weights are
// deliberately smaller in absolute terms than the matching headwinds — a
// positive context note never has the same authority as a hard balance-sheet
// stress finding, by design.
const HEADWIND_WEIGHT = { info: 0.05, warn: 0.20, severe: 0.50 };
const TAILWIND_WEIGHT = { tailwind: 0.20, strong_tailwind: 0.40 };

function fragilityScore(findings) {
  let raw = 0;
  for (const f of findings || []) {
    if (isTailwind(f)) {
      raw -= (TAILWIND_WEIGHT[f.severity] || 0) * (f.scoreDelta || 1);
    } else {
      raw += (HEADWIND_WEIGHT[f.severity] || 0) * (f.scoreDelta || 1);
    }
  }
  if (raw <= 0) return 0;
  return 1 - Math.exp(-raw);
}

function bandFor(score) {
  if (score < 0.20) return 'robust';
  if (score < 0.45) return 'moderate';
  if (score < 0.70) return 'fragile';
  return 'unstable';
}

function fragilityFromFindings(findings) {
  return bandFor(fragilityScore(findings));
}

function computeFindings(input) {
  return applyRegistry(input);
}

function enforceHardBlockers(graham, findings) {
  if (!graham) return graham;
  const blockers = (findings || []).filter(isHardBlocker);
  const sortedFindings = sortBySeverity(findings || []);
  const top = sortedFindings.slice(0, Math.min(6, sortedFindings.length));

  // Always attach the deterministic findings + a fallback band so the UI has
  // something to render even when Graham omitted them.
  const result = {
    ...graham,
    findings: top,
    fragilityScore: +fragilityScore(findings || []).toFixed(3),
    fragilityBand: graham.fragilityBand || fragilityFromFindings(findings || []),
  };

  if (!blockers.length) return result;

  // Hard-blocker override: even if the LLM tried to BUY, downgrade to WAIT.
  if (graham.decision === 'BUY') {
    return {
      ...result,
      decision: 'WAIT',
      confidence: 'Low',
      fragilityBand: 'unstable',
      blocked: true,
      // Surface the blocker reasons up top in the risks list so the UI shows
      // them prominently even before the user expands the panel.
      risks: dedupe([
        ...blockers.slice(0, 2).map((f) => f.evidence),
        ...(graham.risks || []),
      ]).slice(0, 4),
    };
  }
  return { ...result, blocked: true };
}

function sortBySeverity(findings) {
  return [...findings].sort((a, b) => severityRank(b.severity) - severityRank(a.severity));
}

// Severity ranking for UI ordering. Tailwinds are ranked between info and
// warn — important enough to be visible, but never above a severe headwind.
function severityRank(s) {
  if (s === 'severe') return 4;
  if (s === 'warn') return 3;
  if (s === 'strong_tailwind') return 2;
  if (s === 'tailwind') return 2;
  return 1; // info
}

function dedupe(arr) {
  const seen = new Set();
  const out = [];
  for (const item of arr) {
    const key = String(item).toLowerCase().trim();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

module.exports = {
  computeFindings,
  enforceHardBlockers,
  fragilityFromFindings,
  fragilityScore,
  bandFor,
};
