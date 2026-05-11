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
];

async function fetchFundamentals(ticker) {
  const periodStart = new Date();
  periodStart.setFullYear(periodStart.getFullYear() - 5);
  const period1 = periodStart.toISOString().split('T')[0];

  const [quote, summary, fts] = await Promise.all([
    yahooFinance.quote(ticker),
    yahooFinance.quoteSummary(ticker, { modules: QUOTE_SUMMARY_MODULES }),
    yahooFinance
      .fundamentalsTimeSeries(ticker, { period1, module: 'all', type: 'annual' })
      .catch(() => []),
  ]);

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

  const longTermGrowthRate =
    pctFromGrowth(financial.earningsGrowth) ??
    pctFromGrowth(financial.revenueGrowth) ??
    null;

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
  };
}

module.exports = {
  fetchFundamentals,
  num,
  pctFromGrowth,
};
