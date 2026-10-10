// Index and rate futures (VX=F is not on Yahoo).
import { fetchRows } from '../yahoo.js';

const L = [['ES=F', 'S&P 500 Fut'], ['NQ=F', 'Nasdaq 100 Fut'], ['YM=F', 'Dow Fut'], ['RTY=F', 'Russell 2000 Fut'],
  ['ZT=F', 'UST 2Y Fut'], ['ZF=F', 'UST 5Y Fut'], ['ZN=F', 'UST 10Y Fut'], ['ZB=F', 'UST 30Y Fut']];

export async function fetchFutures() {
  return (await fetchRows(L)).map((r) => ({ g: 'fut', ...r }));
}
