'use strict';

// Stocks shown in the screener, scorecard, chart, calculator and paper trading.
// bse = BSE scrip code (for live quotes and fundamentals); sectorIndex = NSE index used for sector P/E.
const SCREENER = [
  { sym: 'TCS', bse: '532540', sectorIndex: 'NIFTY IT', sector: 'IT' },
  { sym: 'INFY', bse: '500209', sectorIndex: 'NIFTY IT', sector: 'IT' },
  { sym: 'HDFCBANK', bse: '500180', sectorIndex: 'NIFTY BANK', sector: 'Bank' },
  { sym: 'ICICIBANK', bse: '532174', sectorIndex: 'NIFTY BANK', sector: 'Bank' },
  { sym: 'RELIANCE', bse: '500325', sectorIndex: 'NIFTY ENERGY', sector: 'Energy' },
  { sym: 'HINDUNILVR', bse: '500696', sectorIndex: 'NIFTY FMCG', sector: 'FMCG' },
  { sym: 'ITC', bse: '500875', sectorIndex: 'NIFTY FMCG', sector: 'FMCG' },
  { sym: 'MARUTI', bse: '532500', sectorIndex: 'NIFTY AUTO', sector: 'Auto' },
  { sym: 'SUNPHARMA', bse: '524715', sectorIndex: 'NIFTY PHARMA', sector: 'Pharma' },
  { sym: 'TATASTEEL', bse: '500470', sectorIndex: 'NIFTY METAL', sector: 'Metal' },
];

// Sector indices used by the regime engine (names as in NSE's daily index file).
const SECTORS = [
  ['Nifty Auto', 'AUTO'], ['Nifty Bank', 'BANK'], ['Nifty PSU Bank', 'PSU BANK'], ['Nifty Financial Services', 'FIN SERV'],
  ['Nifty IT', 'IT'], ['Nifty Pharma', 'PHARMA'], ['Nifty FMCG', 'FMCG'], ['Nifty Metal', 'METAL'],
  ['Nifty Energy', 'ENERGY'], ['Nifty Realty', 'REALTY'], ['Nifty Media', 'MEDIA'], ['Nifty Infrastructure', 'INFRA'],
  ['Nifty Consumer Durables', 'CONS DUR'], ['Nifty Oil & Gas', 'OIL & GAS'], ['Nifty Healthcare Index', 'HEALTH'],
  ['Nifty Chemicals', 'CHEM'], ['Nifty Commodities', 'COMMOD'], ['Nifty Private Bank', 'PVT BANK'],
];

// Candidate 6: layers of a multi-asset network, all from NSE's daily index file.
const LAYERS = [
  ['Nifty 50', 'NIFTY', 'equity'],
  ['Nifty Bank', 'BANK', 'equity'],
  ['Nifty IT', 'IT', 'equity'],
  ['Nifty Auto', 'AUTO', 'equity'],
  ['Nifty Pharma', 'PHARMA', 'equity'],
  ['Nifty Metal', 'METAL', 'equity'],
  ['Nifty Realty', 'REALTY', 'equity'],
  ['Nifty Commodities', 'COMMOD', 'equity'],
  ['Nifty 10 yr Benchmark G-Sec', 'GS 10Y', 'rates'],
  ['Nifty 4-8 yr G-Sec Index', 'GS 4-8Y', 'rates'],
  ['Nifty 15 yr and above G-Sec Index', 'GS 15Y+', 'rates'],
  ['Nifty Composite G-sec Index', 'GS ALL', 'rates'],
  ['Nifty BHARAT Bond Index - April 2031', 'BB 2031', 'credit'],
  ['Nifty BHARAT Bond Index - April 2033', 'BB 2033', 'credit'],
  ['Nifty REITs & InvITs', 'REIT', 'real'],
  ['India VIX', 'VIX', 'vol'],
];

const HISTORY_DAYS = 500;   // trading days kept (two years: indicators, regime timeline, backtests)

module.exports = { SCREENER, SECTORS, LAYERS, HISTORY_DAYS };
