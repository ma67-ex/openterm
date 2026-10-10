// World Economies monitor: latest GDP growth, inflation, unemployment, current account and debt per country.
import { fetchWeco } from '../worldbank.js';

export default { key: 'weco', when: 'always', hours: [5], fetch: fetchWeco };
