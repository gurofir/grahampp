'use strict';

const YahooFinance = require('yahoo-finance2').default;

const yahooFinance = new YahooFinance({
  suppressNotices: ['yahooSurvey', 'ripHistorical'],
});

function num(v) {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (v && typeof v === 'object' && 'raw' in v && typeof v.raw === 'number') return v.raw;
  return null;
}

function pctFromGrowth(g) {
  return typeof g === 'number' && Number.isFinite(g) ? g * 100 : null;
}

const QUOTE_SUMMARY_MODULES = [
  'price',
  'summaryDetail',
  'defaultKeyStatistics',
  'financialData',
  'calendarEvents',
  'assetProfile',
  'insiderTransactions',
  'earningsHistory',
];

// Normalize Yahoo's `earningsHistory.history` into an array of quarterly
// reports newest-first. surprisePercent comes back as a fraction
// (0.045 = 4.5%); convert to a percent. We keep the past 4 quarters at most
// -- enough to show a "last earnings + recent track record" mini-table on
// the stock-detail page without bloating the cached row.
function extractEarningsHistory(earningsHistoryModule) {
  const history = earningsHistoryModule?.history;
  if (!Array.isArray(history) || history.length === 0) return null;
  const rows = history
    .map((h) => {
      const period = h?.quarter;
      const date =
        period instanceof Date
          ? period.toISOString()
          : period
            ? new Date(period).toISOString()
            : null;
      const epsActual = num(h?.epsActual);
      const epsEstimate = num(h?.epsEstimate);
      const surprisePctRaw = num(h?.surprisePercent);
      // Yahoo's surprisePercent is occasionally already in percent form for
      // some symbols. Detect the unusual case (|val| > 5) and pass through;
      // otherwise multiply by 100. We *want* big surprises (e.g. 80%) to
      // still render correctly, so we keep the cap loose.
      const surprisePct =
        surprisePctRaw == null
          ? null
          : Math.abs(surprisePctRaw) > 5
            ? surprisePctRaw
            : surprisePctRaw * 100;
      const periodLabel = typeof h?.period === 'string' ? h.period : null;
      return {
        date,
        period: periodLabel,
        epsActual,
        epsEstimate,
        surprisePct,
      };
    })
    .filter((r) => r.date && (r.epsActual != null || r.epsEstimate != null))
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    .slice(0, 4);
  return rows.length > 0 ? rows : null;
}

// Bucket dividend payments by calendar year and return [{ year, total }] sorted
// ascending. Yahoo's `historical` with events='dividends' returns one row per
// payment date with `amount` (cash dividend per share). Special / one-time
// dividends are included; for value/income screening that is the right
// behaviour (a cut-then-special is still a streak break).
function bucketAnnualDividends(events) {
  if (!Array.isArray(events) || events.length === 0) return [];
  const byYear = new Map();
  for (const e of events) {
    const amt = num(e?.amount ?? e?.dividends);
    if (amt == null || amt <= 0) continue;
    const d = e?.date instanceof Date ? e.date : new Date(e?.date);
    if (Number.isNaN(d.getTime())) continue;
    const y = d.getUTCFullYear();
    byYear.set(y, (byYear.get(y) || 0) + amt);
  }
  return Array.from(byYear.entries())
    .sort(([a], [b]) => a - b)
    .map(([year, total]) => ({ year, total }));
}

// Walk backwards from the most recent COMPLETED year (we ignore the current
// year because the company may not have paid all four quarters yet) and
// count years where the annual dividend total did not decrease vs the prior
// year. A cut anywhere in the chain ends the streak.
function dividendStreakYears(annual) {
  if (!Array.isArray(annual) || annual.length === 0) return null;
  const thisYear = new Date().getUTCFullYear();
  // Drop the current (in-progress) year from the streak calculation.
  const completed = annual.filter((a) => a.year < thisYear);
  if (completed.length === 0) return 0;
  let streak = 1;
  for (let i = completed.length - 1; i > 0; i--) {
    if (completed[i].total >= completed[i - 1].total) streak += 1;
    else break;
  }
  return streak;
}

// Aggregate insider transactions over the last 6 months. Yahoo classifies
// each transaction with a textual transactionText (e.g. "Purchase",
// "Sale - Tax", "Conversion of Exercise of Derivative Security"). We only
// count true open-market BUY/SELL transactions. A "cluster" is >=3 distinct
// insiders buying within the window -- empirically the most predictive
// pattern (single-insider buys are noisier).
function summarizeInsiderTransactions(transactions, marketCap) {
  if (!Array.isArray(transactions) || transactions.length === 0) {
    return { netUsd: 0, buyers: 0, sellers: 0, score: null };
  }
  const cutoff = Date.now() - 6 * 30 * 86_400_000; // ~6 months
  let buyUsd = 0;
  let sellUsd = 0;
  const buyers = new Set();
  const sellers = new Set();
  for (const t of transactions) {
    const ts = t?.startDate instanceof Date ? t.startDate.getTime() : new Date(t?.startDate).getTime();
    if (!Number.isFinite(ts) || ts < cutoff) continue;
    const text = String(t?.transactionText || '').toLowerCase();
    const value = num(t?.value) ?? 0;
    if (value <= 0) continue;
    const name = t?.filerName || t?.filerRelation || '';
    if (text.includes('purchase') || text.includes('buy')) {
      buyUsd += value;
      if (name) buyers.add(name);
    } else if (text.startsWith('sale') || text === 'sale') {
      sellUsd += value;
      if (name) sellers.add(name);
    }
    // Skip option exercises, gifts, tax withholding -- non-informative.
  }
  const netUsd = buyUsd - sellUsd;
  // Score = net buying as a % of market cap, *100 to make it human-scale.
  // Positive = net buying, negative = net selling. NULL when market cap is
  // unknown so the indicator falls back to "no signal".
  const score =
    marketCap && marketCap > 0 ? (netUsd / marketCap) * 100 : null;
  return { netUsd, buyers: buyers.size, sellers: sellers.size, score };
}

async function fetchFundamentals(ticker) {
  const periodStart = new Date();
  periodStart.setFullYear(periodStart.getFullYear() - 5);
  const period1 = periodStart.toISOString().split('T')[0];

  // Pull dividend history alongside the existing batch so wall-clock cost
  // doesn't grow. 10 years is enough to compute a meaningful streak; aristocrat
  // companies (25+ year streaks) just cap out at the lookback window.
  const divLookbackStart = new Date();
  divLookbackStart.setFullYear(divLookbackStart.getFullYear() - 10);
  const [quote, summary, fts, divChart] = await Promise.all([
    yahooFinance.quote(ticker),
    yahooFinance.quoteSummary(ticker, { modules: QUOTE_SUMMARY_MODULES }),
    yahooFinance
      .fundamentalsTimeSeries(ticker, { period1, module: 'all', type: 'annual' })
      .catch(() => []),
    yahooFinance
      .chart(ticker, {
        period1: divLookbackStart,
        period2: new Date(),
        interval: '1mo',
        events: 'div',
      })
      .catch(() => null),
  ]);
  // chart() returns { events: { dividends: { '<ts>': { amount, date } } } }.
  // Flatten to the same shape historical() used so downstream code is
  // unchanged.
  const divHistory = (() => {
    const divs = divChart?.events?.dividends;
    if (!divs || typeof divs !== 'object') return [];
    return Object.values(divs).map((d) => ({
      date: d?.date instanceof Date ? d.date : new Date(d?.date),
      amount: typeof d?.amount === 'number' ? d.amount : null,
    }));
  })();

  const price = summary.price || {};
  const summaryDetail = summary.summaryDetail || {};
  const keyStats = summary.defaultKeyStatistics || {};
  const financial = summary.financialData || {};
  const calendar = summary.calendarEvents || {};
  const profile = summary.assetProfile || {};

  const rows = (Array.isArray(fts) ? fts : [])
    .filter((r) => num(r?.totalRevenue) != null)
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  const revenues = rows.map((r) => num(r.totalRevenue) ?? 0);
  const operatingIncomes = rows.map((r) => num(r.operatingIncome) ?? 0);
  const netIncomes = rows.map((r) => num(r.netIncome) ?? 0);
  const ebits = rows.map((r) => num(r.EBIT) ?? num(r.operatingIncome) ?? 0);
  const interestExpenses = rows.map((r) => num(r.interestExpense) ?? 0);
  const operatingCashFlows = rows.map((r) => num(r.operatingCashFlow) ?? 0);
  const capexArr = rows.map((r) => num(r.capitalExpenditure) ?? 0);
  const grossProfits = rows.map((r) => {
    const direct = num(r.grossProfit);
    if (direct != null) return direct;
    const cogs = num(r.costOfRevenue);
    const rev = num(r.totalRevenue);
    if (rev != null && cogs != null) return rev - cogs;
    return 0;
  });
  const depreciationAmortization = rows.map(
    (r) =>
      num(r.reconciledDepreciation) ??
      num(r.depreciationAndAmortization) ??
      num(r.depreciation) ??
      0,
  );

  const latestRow = rows[rows.length - 1] || {};
  const totalDebt = num(financial.totalDebt) ?? num(latestRow.totalDebt) ?? 0;
  const totalEquity =
    num(financial.totalStockholderEquity) ??
    num(latestRow.stockholdersEquity) ??
    num(latestRow.totalEquityGrossMinorityInterest) ??
    0;
  const cash =
    num(financial.totalCash) ??
    num(latestRow.cashCashEquivalentsAndShortTermInvestments) ??
    num(latestRow.cashAndCashEquivalents) ??
    0;
  const currentAssets =
    num(latestRow.currentAssets) ?? num(financial.totalCurrentAssets) ?? 0;
  const currentLiabilities =
    num(latestRow.currentLiabilities) ?? num(financial.totalCurrentLiabilities) ?? 0;
  const ebitda = num(financial.ebitda) ?? num(keyStats.ebitda) ?? null;

  const earningsDateRaw =
    calendar.earnings?.earningsDate?.[0] || calendar.earningsDate?.[0] || null;
  const earningsDate = earningsDateRaw
    ? earningsDateRaw instanceof Date
      ? earningsDateRaw.toISOString()
      : new Date(earningsDateRaw).toISOString()
    : null;

  const earningsHistory = extractEarningsHistory(summary.earningsHistory);

  const longTermGrowthRate =
    pctFromGrowth(financial.earningsGrowth) ??
    pctFromGrowth(financial.revenueGrowth) ??
    null;

  // --- Dividends ----------------------------------------------------------
  // dividendYield from Yahoo is a fraction (0.025 = 2.5%); convert to percent.
  // payoutRatio is also a fraction; convert to percent. Both can be null for
  // non-payers and we propagate that as null (no yield => no signal).
  const dividendYield = (() => {
    const y =
      num(summaryDetail.dividendYield) ??
      num(summaryDetail.trailingAnnualDividendYield) ??
      null;
    return y == null ? null : y * 100;
  })();
  const payoutRatio = (() => {
    const p = num(summaryDetail.payoutRatio);
    return p == null ? null : p * 100;
  })();
  const annualDividends = bucketAnnualDividends(divHistory);
  const dividendStreak = dividendYield && dividendYield > 0
    ? dividendStreakYears(annualDividends)
    : 0;

  // --- Insider transactions ----------------------------------------------
  const insiderTx = summary.insiderTransactions?.transactions || [];
  const marketCapRaw =
    num(summaryDetail.marketCap) ??
    num(price.marketCap) ??
    num(keyStats.marketCap) ??
    null;
  const insider = summarizeInsiderTransactions(insiderTx, marketCapRaw);

  // Compute daily change directly from price + previousClose. Yahoo's
  // regularMarketChangePercent has inconsistent encoding (sometimes percent,
  // sometimes fraction); deriving it ourselves removes the ambiguity.
  const lastPrice =
    num(quote.regularMarketPrice) ?? num(price.regularMarketPrice) ?? null;
  const prevClose =
    num(quote.regularMarketPreviousClose) ??
    num(price.regularMarketPreviousClose) ??
    num(summaryDetail.previousClose) ??
    null;
  const dailyChangePct =
    lastPrice != null && prevClose != null && prevClose !== 0
      ? ((lastPrice - prevClose) / prevClose) * 100
      : null;

  return {
    ticker: ticker.toUpperCase(),
    companyName: price.longName || price.shortName || ticker.toUpperCase(),
    currency: quote.currency || price.currency || 'USD',
    currentPrice:
      num(quote.regularMarketPrice) ?? num(price.regularMarketPrice) ?? 0,
    dailyChangePct,
    low52:
      num(summaryDetail.fiftyTwoWeekLow) ?? num(quote.fiftyTwoWeekLow) ?? null,
    high52:
      num(summaryDetail.fiftyTwoWeekHigh) ?? num(quote.fiftyTwoWeekHigh) ?? null,
    sector: profile.sector || null,
    country: profile.country || null,
    businessSummary: profile.longBusinessSummary || null,
    marketCap:
      num(summaryDetail.marketCap) ??
      num(price.marketCap) ??
      num(keyStats.marketCap) ??
      null,
    sharesOutstanding: num(keyStats.sharesOutstanding) ?? null,
    peRatio: num(summaryDetail.trailingPE),
    forwardPE: num(summaryDetail.forwardPE) ?? num(keyStats.forwardPE),
    pegRatio: num(keyStats.pegRatio),
    priceSales: num(summaryDetail.priceToSalesTrailing12Months),
    forwardEPS: num(keyStats.forwardEps),
    longTermGrowthRate,
    revenues,
    operatingIncomes,
    netIncomes,
    ebits,
    interestExpenses,
    operatingCashFlows,
    capexArr,
    grossProfits,
    depreciationAmortization,
    totalDebt,
    totalEquity,
    cash,
    currentAssets,
    currentLiabilities,
    ebitda,
    earningsDate,
    earningsHistory,
    dividendYield,
    payoutRatio,
    dividendStreak,
    insider,
  };
}

module.exports = {
  fetchFundamentals,
  num,
  pctFromGrowth,
};
