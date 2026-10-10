// Group `mkt2`: extended commodities, popular ETFs and sector performance. One snapshot.
import { fetchRows } from '../yahoo.js';
import { fetchSectors } from './sectors.js';

const CM = [
  ['Energy', [['CL=F', 'WTI Crude'], ['BZ=F', 'Brent'], ['NG=F', 'Natural Gas'], ['HO=F', 'Heating Oil'], ['RB=F', 'RBOB Gasoline']]],
  ['Metals', [['GC=F', 'Gold'], ['SI=F', 'Silver'], ['HG=F', 'Copper'], ['PL=F', 'Platinum'], ['PA=F', 'Palladium']]],
  ['Agri', [['ZC=F', 'Corn'], ['ZW=F', 'Wheat'], ['ZS=F', 'Soybeans'], ['KC=F', 'Coffee'], ['SB=F', 'Sugar'], ['CT=F', 'Cotton']]],
];
const ETF = [['SPY', 'S&P 500'], ['QQQ', 'Nasdaq 100'], ['IWM', 'Russell 2000'], ['DIA', 'Dow Jones'], ['EFA', 'EAFE Developed'], ['EEM', 'Emerging Mkts'], ['VWO', 'Vanguard EM'],
  ['TLT', 'UST 20Y+'], ['IEF', 'UST 7-10Y'], ['AGG', 'US Agg Bond'], ['HYG', 'High Yield'], ['LQD', 'IG Corp'], ['GLD', 'Gold'], ['SLV', 'Silver'], ['USO', 'US Oil'],
  ['UNG', 'US Nat Gas'], ['VNQ', 'REITs'], ['ARKK', 'ARK Innovation'], ['SMH', 'Semiconductors'], ['IBIT', 'Bitcoin Trust'], ['XLK', 'Tech'], ['XLF', 'Financials'], ['XLE', 'Energy'], ['XLV', 'Health Care'], ['KRE', 'Regional Banks']];

export default {
  key: 'mkt2', when: 'weekday', everyMin: 30,
  async fetch() {
    const [cm, etf, sec] = await Promise.all([
      Promise.all(CM.map(async ([k, l]) => (await fetchRows(l)).map((r) => ({ g: 'cm', k, ...r })))),
      fetchRows(ETF), fetchSectors(),
    ]);
    return [...cm.flat(), ...etf.map((r) => ({ g: 'etf', ...r })), ...sec];
  },
};
