// One snapshot per group. `when`: 'weekday' (Mon-Fri UTC) or 'always'.
const g = (when, rows) => ({ when, rows });
export const GROUPS = {
  watchlist: g('weekday', [['AAPL', 'Apple'], ['MSFT', 'Microsoft'], ['NVDA', 'Nvidia'], ['AMZN', 'Amazon'], ['GOOGL', 'Alphabet'], ['META', 'Meta'], ['TSLA', 'Tesla'], ['JPM', 'JPMorgan']]),
  indices: g('weekday', [['^GSPC', 'SPX'], ['^DJI', 'INDU'], ['^IXIC', 'CCMP'], ['^RUT', 'RTY'], ['^FTSE', 'UKX'], ['^GDAXI', 'DAX'], ['^FCHI', 'CAC'], ['^N225', 'NKY'], ['^HSI', 'HSI'], ['000001.SS', 'SHCOMP'], ['^BSESN', 'SENSEX'], ['^NSEI', 'NIFTY']]),
  fx: g('weekday', [['EURUSD=X', 'EURUSD'], ['JPY=X', 'USDJPY'], ['GBPUSD=X', 'GBPUSD'], ['CHF=X', 'USDCHF'], ['AUDUSD=X', 'AUDUSD'], ['CAD=X', 'USDCAD']]),
  cmdty: g('weekday', [['CL=F', 'CL1 Crude'], ['BZ=F', 'CO1 Brent'], ['NG=F', 'NG1 Natgas'], ['GC=F', 'GC1 Gold'], ['HG=F', 'HG1 Copper']]),
  crypto: g('always', [['BTC-USD', 'BTC'], ['ETH-USD', 'ETH'], ['SOL-USD', 'SOL']]),
};
export const SNAP_TTL = 7 * 86400; // long TTL: data must survive weekends, staleness is shown via asOf
export const DAILY_BUDGET = Number(process.env.DAILY_BUDGET) || 16000;
