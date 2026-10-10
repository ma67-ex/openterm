// Cross-asset group `xasset`: FX majors vs USD (matrix is built in the browser), index/rate futures, volatility. One snapshot.
import { fetchRows } from '../yahoo.js';
import { fetchFutures } from './futures.js';
import { fetchVol } from './vol.js';

const FX = [['EURUSD=X', 'EURUSD'], ['JPY=X', 'USDJPY'], ['GBPUSD=X', 'GBPUSD'], ['CHF=X', 'USDCHF'], ['AUDUSD=X', 'AUDUSD'], ['CAD=X', 'USDCAD'], ['NZDUSD=X', 'NZDUSD'], ['DX-Y.NYB', 'DXY']];

export default {
  key: 'xasset', when: 'weekday', everyMin: 15,
  async fetch() {
    const [fx, fut, vol] = await Promise.all([fetchRows(FX), fetchFutures(), fetchVol()]);
    return [...fx.map((r) => ({ g: 'fx', ...r })), ...fut, ...vol];
  },
};
