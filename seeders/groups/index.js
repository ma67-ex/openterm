// Extra seeded groups. Each file default-exports { key, when, everyMin | hours, fetch() -> array of rows }.
// Add one import line per group below.
import { shards as universe } from './universe.js';
import crypto2 from './crypto2.js';
import xasset from './fxcross.js';
import mkt2 from './cmdty2.js';
import india from './india.js';
import weco from './weco.js';
import cbrates from './cbrates.js';
import credit from './credit.js';
import funds from './funds.js';
const groups = [...universe, crypto2, xasset, mkt2, india, weco, cbrates, credit, funds];
export default groups;
