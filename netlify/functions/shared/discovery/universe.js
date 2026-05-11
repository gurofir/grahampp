'use strict';

// Discovery Engine scan universe.
//
// Three layers, deduplicated at the bottom:
//
//   1. SP500_TICKERS         — current S&P 500 constituents (US large caps).
//   2. FOREIGN_ADRS          — major non-US companies traded as ADRs on NYSE/NASDAQ
//                              (TSM, ASML, ARM, BABA, NVO, etc.). These are NEVER
//                              in the S&P 500 because the index is US-only.
//   3. US_NON_SP500_NOTABLE  — popular US-listed mid/small caps that retail
//                              investors actually watch but aren't (yet) in the
//                              S&P 500 (NET, SNOW, AFRM, MSTR, etc.).
//
// The exported `SCAN_UNIVERSE` is the deduplicated union (~750 tickers).
//
// Update quarterly when the S&P 500 reconstitutes or popular new IPOs surface.
// Source for S&P 500: https://github.com/datasets/s-and-p-500-companies (snapshot 2026-04).

const SP500_TICKERS = [
  'MMM', 'AOS', 'ABT', 'ABBV', 'ACN', 'ADBE', 'AMD', 'AES', 'AFL', 'A',
  'APD', 'ABNB', 'AKAM', 'ALB', 'ARE', 'ALGN', 'ALLE', 'LNT', 'ALL', 'GOOGL',
  'GOOG', 'MO', 'AMZN', 'AMCR', 'AEE', 'AEP', 'AXP', 'AIG', 'AMT', 'AWK',
  'AMP', 'AME', 'AMGN', 'APH', 'ADI', 'AON', 'APA', 'APO', 'AAPL', 'AMAT',
  'APP', 'APTV', 'ACGL', 'ADM', 'ARES', 'ANET', 'AJG', 'AIZ', 'T', 'ATO',
  'ADSK', 'ADP', 'AZO', 'AVB', 'AVY', 'AXON', 'BKR', 'BALL', 'BAC', 'BAX',
  'BDX', 'BRK-B', 'BBY', 'TECH', 'BIIB', 'BLK', 'BX', 'XYZ', 'BK', 'BA',
  'BKNG', 'BSX', 'BMY', 'AVGO', 'BR', 'BRO', 'BF-B', 'BLDR', 'BG', 'BXP',
  'CHRW', 'CDNS', 'CPT', 'CPB', 'COF', 'CAH', 'CCL', 'CARR', 'CVNA', 'CASY',
  'CAT', 'CBOE', 'CBRE', 'CDW', 'COR', 'CNC', 'CNP', 'CF', 'CRL', 'SCHW',
  'CHTR', 'CVX', 'CMG', 'CB', 'CHD', 'CIEN', 'CI', 'CINF', 'CTAS', 'CSCO',
  'C', 'CFG', 'CLX', 'CME', 'CMS', 'KO', 'CTSH', 'COHR', 'COIN', 'CL',
  'CMCSA', 'FIX', 'CAG', 'COP', 'ED', 'STZ', 'CEG', 'COO', 'CPRT', 'GLW',
  'CPAY', 'CTVA', 'CSGP', 'COST', 'CRH', 'CRWD', 'CCI', 'CSX', 'CMI', 'CVS',
  'DHR', 'DRI', 'DDOG', 'DVA', 'DECK', 'DE', 'DELL', 'DAL', 'DVN', 'DXCM',
  'FANG', 'DLR', 'DG', 'DLTR', 'D', 'DPZ', 'DASH', 'DOV', 'DOW', 'DHI',
  'DTE', 'DUK', 'DD', 'ETN', 'EBAY', 'SATS', 'ECL', 'EIX', 'EW', 'EA',
  'ELV', 'EME', 'EMR', 'ETR', 'EOG', 'EPAM', 'EQT', 'EFX', 'EQIX', 'EQR',
  'ERIE', 'ESS', 'EL', 'EG', 'EVRG', 'ES', 'EXC', 'EXE', 'EXPE', 'EXPD',
  'EXR', 'XOM', 'FFIV', 'FDS', 'FICO', 'FAST', 'FRT', 'FDX', 'FIS', 'FITB',
  'FSLR', 'FE', 'FISV', 'F', 'FTNT', 'FTV', 'FOXA', 'FOX', 'BEN', 'FCX',
  'GRMN', 'IT', 'GE', 'GEHC', 'GEV', 'GEN', 'GNRC', 'GD', 'GIS', 'GM',
  'GPC', 'GILD', 'GPN', 'GL', 'GDDY', 'GS', 'HAL', 'HIG', 'HAS', 'HCA',
  'DOC', 'HSIC', 'HSY', 'HPE', 'HLT', 'HD', 'HON', 'HRL', 'HST', 'HWM',
  'HPQ', 'HUBB', 'HUM', 'HBAN', 'HII', 'IBM', 'IEX', 'IDXX', 'ITW', 'INCY',
  'IR', 'PODD', 'INTC', 'IBKR', 'ICE', 'IFF', 'IP', 'INTU', 'ISRG', 'IVZ',
  'INVH', 'IQV', 'IRM', 'JBHT', 'JBL', 'JKHY', 'J', 'JNJ', 'JCI', 'JPM',
  'KVUE', 'KDP', 'KEY', 'KEYS', 'KMB', 'KIM', 'KMI', 'KKR', 'KLAC', 'KHC',
  'KR', 'LHX', 'LH', 'LRCX', 'LVS', 'LDOS', 'LEN', 'LII', 'LLY', 'LIN',
  'LYV', 'LMT', 'L', 'LOW', 'LULU', 'LITE', 'LYB', 'MTB', 'MPC', 'MAR',
  'MRSH', 'MLM', 'MAS', 'MA', 'MKC', 'MCD', 'MCK', 'MDT', 'MRK', 'META',
  'MET', 'MTD', 'MGM', 'MCHP', 'MU', 'MSFT', 'MAA', 'MRNA', 'TAP', 'MDLZ',
  'MPWR', 'MNST', 'MCO', 'MS', 'MOS', 'MSI', 'MSCI', 'NDAQ', 'NTAP', 'NFLX',
  'NEM', 'NWSA', 'NWS', 'NEE', 'NKE', 'NI', 'NDSN', 'NSC', 'NTRS', 'NOC',
  'NCLH', 'NRG', 'NUE', 'NVDA', 'NVR', 'NXPI', 'ORLY', 'OXY', 'ODFL', 'OMC',
  'ON', 'OKE', 'ORCL', 'OTIS', 'PCAR', 'PKG', 'PLTR', 'PANW', 'PSKY', 'PH',
  'PAYX', 'PYPL', 'PNR', 'PEP', 'PFE', 'PCG', 'PM', 'PSX', 'PNW', 'PNC',
  'POOL', 'PPG', 'PPL', 'PFG', 'PG', 'PGR', 'PLD', 'PRU', 'PEG', 'PTC',
  'PSA', 'PHM', 'PWR', 'QCOM', 'DGX', 'Q', 'RL', 'RJF', 'RTX', 'O',
  'REG', 'REGN', 'RF', 'RSG', 'RMD', 'RVTY', 'HOOD', 'ROK', 'ROL', 'ROP',
  'ROST', 'RCL', 'SPGI', 'CRM', 'SNDK', 'SBAC', 'SLB', 'STX', 'SRE', 'NOW',
  'SHW', 'SPG', 'SWKS', 'SJM', 'SW', 'SNA', 'SOLV', 'SO', 'LUV', 'SWK',
  'SBUX', 'STT', 'STLD', 'STE', 'SYK', 'SMCI', 'SYF', 'SNPS', 'SYY', 'TMUS',
  'TROW', 'TTWO', 'TPR', 'TRGP', 'TGT', 'TEL', 'TDY', 'TER', 'TSLA', 'TXN',
  'TPL', 'TXT', 'TMO', 'TJX', 'TKO', 'TTD', 'TSCO', 'TT', 'TDG', 'TRV',
  'TRMB', 'TFC', 'TYL', 'TSN', 'USB', 'UBER', 'UDR', 'ULTA', 'UNP', 'UAL',
  'UPS', 'URI', 'UNH', 'UHS', 'VLO', 'VEEV', 'VTR', 'VLTO', 'VRSN', 'VRSK',
  'VZ', 'VRTX', 'VRT', 'VTRS', 'VICI', 'V', 'VST', 'VMC', 'WRB', 'GWW',
  'WAB', 'WMT', 'DIS', 'WBD', 'WM', 'WAT', 'WEC', 'WFC', 'WELL', 'WST',
  'WDC', 'WY', 'WSM', 'WMB', 'WTW', 'WDAY', 'WYNN', 'XEL', 'XYL', 'YUM',
  'ZBRA', 'ZBH', 'ZTS',
];

// Major foreign companies that trade as ADRs on US exchanges. These are
// NEVER in the S&P 500 because that index is US-headquartered only — yet
// every retail investor watches them.
const FOREIGN_ADRS = [
  // ── Asia / China tech ─────────────────────────────────────────────
  'TSM',    // Taiwan Semiconductor
  'BABA',   // Alibaba
  'JD',     // JD.com
  'PDD',    // Pinduoduo / Temu
  'BIDU',   // Baidu
  'NTES',   // NetEase
  'BILI',   // Bilibili
  'IQ',     // iQiyi
  'TCOM',   // Trip.com
  'TME',    // Tencent Music
  'YMM',    // Full Truck Alliance
  // ── Asia / China EV ───────────────────────────────────────────────
  'NIO',    // NIO
  'LI',     // Li Auto
  'XPEV',   // XPeng
  // ── SE Asia / India internet ──────────────────────────────────────
  'SE',     // Sea Limited (Singapore)
  'GRAB',   // Grab (Singapore)
  'CPNG',   // Coupang (Korea)
  'MELI',   // MercadoLibre (Argentina/LatAm)
  'NU',     // Nubank (Brazil)
  // ── India ──────────────────────────────────────────────────────────
  'INFY',   // Infosys
  'WIT',    // Wipro
  'IBN',    // ICICI Bank
  'HDB',    // HDFC Bank
  'RDY',    // Dr. Reddy's Labs
  'TTM',    // Tata Motors
  // ── Japan ──────────────────────────────────────────────────────────
  'TM',     // Toyota
  'HMC',    // Honda
  'SONY',   // Sony Group
  'NMR',    // Nomura Holdings
  'MUFG',   // Mitsubishi UFJ Financial
  'SMFG',   // Sumitomo Mitsui Financial
  'MFG',    // Mizuho Financial
  'NTT',    // Nippon Telegraph & Telephone
  // ── Korea ──────────────────────────────────────────────────────────
  'KB',     // KB Financial
  'SHG',    // Shinhan Financial
  'KEP',    // Korea Electric Power
  'KT',     // KT Corporation
  // ── Europe / tech & industrial ────────────────────────────────────
  'ASML',   // ASML Holding (Netherlands)
  'ARM',    // Arm Holdings (UK)
  'SAP',    // SAP SE (Germany)
  'STM',    // STMicroelectronics (France/Italy)
  'NOK',    // Nokia (Finland)
  'ERIC',   // Ericsson (Sweden)
  'ABB',    // ABB Ltd (Switzerland)
  'PHG',    // Philips (Netherlands)
  'STLA',   // Stellantis (Netherlands)
  'RACE',   // Ferrari (Italy)
  // ── Europe / pharma & consumer ────────────────────────────────────
  'NVO',    // Novo Nordisk (Denmark)
  'NVS',    // Novartis (Switzerland)
  'AZN',    // AstraZeneca (UK)
  'GSK',    // GSK (UK)
  'TEVA',   // Teva Pharmaceutical (Israel)
  'BAYRY',  // Bayer (Germany)
  'RHHBY',  // Roche Holding (Switzerland)
  'GMAB',   // Genmab (Denmark)
  'BUD',    // AB InBev (Belgium)
  'DEO',    // Diageo (UK)
  'UL',     // Unilever (UK)
  'BTI',    // British American Tobacco (UK)
  // ── Europe / banks ────────────────────────────────────────────────
  'HSBC',   // HSBC Holdings (UK)
  'BCS',    // Barclays (UK)
  'UBS',    // UBS Group (Switzerland)
  'ING',    // ING Groep (Netherlands)
  'SAN',    // Banco Santander (Spain)
  'BBVA',   // BBVA (Spain)
  // ── Energy & materials ────────────────────────────────────────────
  'BP',     // BP (UK)
  'SHEL',   // Shell (UK)
  'TTE',    // TotalEnergies (France)
  'EQNR',   // Equinor (Norway)
  'PBR',    // Petrobras (Brazil)
  'PBR-A',  // Petrobras pref shares
  'RIO',    // Rio Tinto (UK/Australia)
  'BHP',    // BHP Group (Australia)
  'VALE',   // Vale (Brazil)
  'AEM',    // Agnico Eagle Mines (Canada)
  'GOLD',   // Barrick Gold (Canada)
  'KGC',    // Kinross Gold (Canada)
  // ── Canada ─────────────────────────────────────────────────────────
  'SHOP',   // Shopify
  'RY',     // Royal Bank of Canada
  'TD',     // Toronto-Dominion Bank
  'BMO',    // Bank of Montreal
  'BNS',    // Bank of Nova Scotia
  'CM',     // Canadian Imperial Bank
  'CNQ',    // Canadian Natural Resources
  'ENB',    // Enbridge
  'TRP',    // TC Energy
  'BCE',    // BCE Inc
  // ── LatAm / banks & telecom ───────────────────────────────────────
  'ITUB',   // Itau Unibanco (Brazil)
  'BBD',    // Banco Bradesco (Brazil)
  'BSAC',   // Banco Santander Chile
  'BCH',    // Banco de Chile
  'BAP',    // Credicorp (Peru)
  'GGB',    // Gerdau (Brazil)
  // ── Israel / tech ─────────────────────────────────────────────────
  'CHKP',   // Check Point Software
  'NICE',   // Nice Ltd
  'MNDY',   // Monday.com
  'WIX',    // Wix.com
  'CYBR',   // CyberArk
  'FROG',   // JFrog
  'ICL',    // ICL Group
  // ── Telecom (other) ────────────────────────────────────────────────
  'VOD',    // Vodafone (UK)
  'TLK',    // PT Telkom Indonesia
];

// Popular US-listed mid/small caps that aren't (yet) in the S&P 500 but
// retail investors actively trade them. Curated to stay within "Yahoo data
// is reliable" zone — micro-caps with sparse fundamentals are excluded.
const US_NON_SP500_NOTABLE = [
  // ── SaaS / cloud ──────────────────────────────────────────────────
  'NET',    // Cloudflare
  'SNOW',   // Snowflake
  'MDB',    // MongoDB
  'ZS',     // Zscaler
  'ZM',     // Zoom
  'OKTA',   // Okta
  'TEAM',   // Atlassian
  'HUBS',   // HubSpot
  'BILL',   // BILL Holdings
  'ESTC',   // Elastic
  'DOCN',   // DigitalOcean
  'FSLY',   // Fastly
  'TWLO',   // Twilio
  'PATH',   // UiPath
  'S',      // SentinelOne
  'GTLB',   // GitLab
  'DT',     // Dynatrace
  'CFLT',   // Confluent
  'BL',     // BlackLine
  // ── Fintech / consumer fintech ────────────────────────────────────
  'SOFI',   // SoFi Technologies
  'AFRM',   // Affirm
  'UPST',   // Upstart
  'LMND',   // Lemonade
  'MSTR',   // MicroStrategy (BTC proxy)
  // ── Streaming / media / consumer internet ─────────────────────────
  'SPOT',   // Spotify
  'ROKU',   // Roku
  'PINS',   // Pinterest
  'SNAP',   // Snap
  'RDDT',   // Reddit
  'BMBL',   // Bumble
  'MTCH',   // Match Group
  // ── EV / clean energy ─────────────────────────────────────────────
  'RIVN',   // Rivian
  'LCID',   // Lucid Motors
  'QS',     // QuantumScape
  'CHPT',   // ChargePoint
  'BLNK',   // Blink Charging
  'PLUG',   // Plug Power
  'BLDP',   // Ballard Power
  'NOVA',   // Sunnova Energy
  'RUN',    // Sunrun
  'ENPH',   // Enphase Energy
  // ── Crypto miners ─────────────────────────────────────────────────
  'MARA',   // Marathon Digital
  'RIOT',   // Riot Platforms
  'CLSK',   // CleanSpark
  'HUT',    // Hut 8
  'IREN',   // IREN
  // ── AI / data / robotics ──────────────────────────────────────────
  'AI',     // C3.ai
  'BBAI',   // BigBear.ai
  'SOUN',   // SoundHound AI
  'PATH',   // (dup safe — Set dedupes)
  // ── Semiconductors not in S&P ─────────────────────────────────────
  'AMBA',   // Ambarella
  'POWI',   // Power Integrations
  'CRDO',   // Credo Technology
  'INDI',   // indie Semiconductor
  // ── Biotech / healthcare ──────────────────────────────────────────
  'TDOC',   // Teladoc
  'BEAM',   // Beam Therapeutics
  'EDIT',   // Editas Medicine
  'CRSP',   // CRISPR Therapeutics
  'NTLA',   // Intellia Therapeutics
  'ARWR',   // Arrowhead Pharma
  'AXSM',   // Axsome Therapeutics
  'BMRN',   // BioMarin
  'EXEL',   // Exelixis
  'IONS',   // Ionis Pharmaceuticals
  'SRPT',   // Sarepta Therapeutics
  // ── Travel / experiences ──────────────────────────────────────────
  'TRIP',   // TripAdvisor
  // ── Consumer / commerce ───────────────────────────────────────────
  'PTON',   // Peloton
  'WING',   // Wingstop
  'SHAK',   // Shake Shack
  'REVG',   // REV Group
  'RVLV',   // Revolve Group
  // ── Cannabis ──────────────────────────────────────────────────────
  'TLRY',   // Tilray Brands
  'CGC',    // Canopy Growth
  // ── Gaming / digital ──────────────────────────────────────────────
  'DKNG',   // DraftKings
  'PENN',   // Penn Entertainment
  'RBLX',   // Roblox
  'U',      // Unity Software
  // ── Industrials / niche ───────────────────────────────────────────
  'JOBY',   // Joby Aviation
  'ACHR',   // Archer Aviation
];

// Deduplicate at the bottom — handles overlap (e.g. when a non-S&P name
// like ENPH or DKNG migrates into the index, it's already in SP500_TICKERS
// and the Set drops the duplicate).
const SCAN_UNIVERSE = Array.from(
  new Set([...SP500_TICKERS, ...FOREIGN_ADRS, ...US_NON_SP500_NOTABLE]),
);

module.exports = {
  SCAN_UNIVERSE,
  SP500_TICKERS,
  FOREIGN_ADRS,
  US_NON_SP500_NOTABLE,
};
