// Nifty 50 style list: Yahoo NSE symbols, short names, sectors assigned by hand. Constituents drift; edit freely.
export const INDIA = [
  ['RELIANCE', 'Reliance Industries', 'Energy'], ['ONGC', 'ONGC', 'Energy'], ['COALINDIA', 'Coal India', 'Energy'], ['BPCL', 'BPCL', 'Energy'],
  ['TCS', 'TCS', 'IT'], ['INFY', 'Infosys', 'IT'], ['HCLTECH', 'HCL Tech', 'IT'], ['WIPRO', 'Wipro', 'IT'], ['TECHM', 'Tech Mahindra', 'IT'],
  ['HDFCBANK', 'HDFC Bank', 'Banks'], ['ICICIBANK', 'ICICI Bank', 'Banks'], ['SBIN', 'State Bank of India', 'Banks'], ['KOTAKBANK', 'Kotak Mahindra Bank', 'Banks'],
  ['AXISBANK', 'Axis Bank', 'Banks'], ['INDUSINDBK', 'IndusInd Bank', 'Banks'],
  ['BAJFINANCE', 'Bajaj Finance', 'Financials'], ['BAJAJFINSV', 'Bajaj Finserv', 'Financials'], ['HDFCLIFE', 'HDFC Life', 'Financials'],
  ['SBILIFE', 'SBI Life', 'Financials'], ['SHRIRAMFIN', 'Shriram Finance', 'Financials'], ['JIOFIN', 'Jio Financial', 'Financials'],
  ['HINDUNILVR', 'Hindustan Unilever', 'Consumer'], ['ITC', 'ITC', 'Consumer'], ['NESTLEIND', 'Nestle India', 'Consumer'], ['TATACONSUM', 'Tata Consumer', 'Consumer'],
  ['TITAN', 'Titan', 'Consumer'], ['ASIANPAINT', 'Asian Paints', 'Consumer'], ['TRENT', 'Trent', 'Consumer'], ['ETERNAL', 'Eternal', 'Consumer'],
  ['MARUTI', 'Maruti Suzuki', 'Auto'], ['M&M', 'Mahindra & Mahindra', 'Auto'], ['TMPV', 'Tata Motors PV', 'Auto'], ['BAJAJ-AUTO', 'Bajaj Auto', 'Auto'],
  ['EICHERMOT', 'Eicher Motors', 'Auto'], ['HEROMOTOCO', 'Hero MotoCorp', 'Auto'],
  ['SUNPHARMA', 'Sun Pharma', 'Health'], ['CIPLA', 'Cipla', 'Health'], ['DRREDDY', "Dr Reddy's", 'Health'], ['APOLLOHOSP', 'Apollo Hospitals', 'Health'],
  ['TATASTEEL', 'Tata Steel', 'Metals'], ['JSWSTEEL', 'JSW Steel', 'Metals'], ['HINDALCO', 'Hindalco', 'Metals'],
  ['LT', 'Larsen & Toubro', 'Industrials'], ['ADANIENT', 'Adani Enterprises', 'Industrials'], ['ADANIPORTS', 'Adani Ports', 'Industrials'], ['BEL', 'Bharat Electronics', 'Industrials'],
  ['ULTRACEMCO', 'UltraTech Cement', 'Materials'], ['GRASIM', 'Grasim', 'Materials'],
  ['NTPC', 'NTPC', 'Utilities'], ['POWERGRID', 'Power Grid', 'Utilities'],
  ['BHARTIARTL', 'Bharti Airtel', 'Telecom'], ['INDIGO', 'InterGlobe Aviation', 'Industrials'], ['MAXHEALTH', 'Max Healthcare', 'Health'],
].map(([s, n, sec]) => ({ s: `${s}.NS`, n, sec }));

export const INDIA_INDICES = [['^NSEI', 'NIFTY 50'], ['^NSEBANK', 'BANK NIFTY'], ['^BSESN', 'SENSEX'], ['^CNXIT', 'NIFTY IT'], ['^INDIAVIX', 'INDIA VIX'], ['INR=X', 'USDINR']];
