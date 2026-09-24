// Each provider reports fiat units for one BTC. After rejecting outliers we
// average the inverse, so each available provider has equal weight.
import {CURRENCIES} from './currencies.js';
export {CURRENCIES} from './currencies.js';

const allowed = new Set(CURRENCIES.map(currency => currency.code));
const validRate = value => typeof value === 'number' && Number.isFinite(value) && value > 0;
const MAX_RATE_DEVIATION = 0.05;

export function parseAmount(input, language = 'cs') {
  let cleaned = String(input).trim().replace(/[\s\u00a0\u202f]/g, '');
  if (language === 'en' && /^(\d{1,3},)+\d{3}(?:\.\d*)?$/.test(cleaned)) cleaned = cleaned.replace(/,/g, '');
  else if (language === 'cs' && /^(\d{1,3}\.)+\d{3},\d*$/.test(cleaned)) cleaned = cleaned.replace(/\./g, '').replace(',', '.');
  else if (cleaned.includes(',') && cleaned.includes('.')) return null;
  else cleaned = cleaned.replace(',', '.');
  if (!/^(?:\d+(?:\.\d*)?|\.\d+)$/.test(cleaned)) return null;
  const result = Number(cleaned);
  return Number.isFinite(result) && result >= 0 ? result : null;
}

export function btcFrom(amount, code, rates, unit = 'BTC') {
  if (!Number.isFinite(amount)) return null;
  if (code === 'BTC') return unit === 'SATS' ? amount / 1e8 : amount;
  const fiatPerBtc = rates[code];
  return validRate(fiatPerBtc) ? amount / fiatPerBtc : null;
}

export function fromBtc(amountBtc, code, rates, unit = 'BTC') {
  if (!Number.isFinite(amountBtc)) return null;
  if (code === 'BTC') return unit === 'SATS' ? amountBtc * 1e8 : amountBtc;
  const fiatPerBtc = rates[code];
  return validRate(fiatPerBtc) ? amountBtc * fiatPerBtc : null;
}

export function averageRates(results) {
  const inverse = {};
  for (const source of results) {
    for (const [rawCode, value] of Object.entries(source)) {
      const code = rawCode.toUpperCase();
      if (!allowed.has(code) || !validRate(value)) continue;
      const costInBtc = 1 / value;
      if (validRate(costInBtc)) (inverse[code] ||= []).push(costInBtc);
    }
  }
  return Object.fromEntries(Object.entries(inverse).map(([code, values]) =>
    [code, 1 / (values.reduce((sum, value) => sum + value, 0) / values.length)]
  ).filter(([, rate]) => validRate(rate)));
}

// Compare each currency separately. With two disagreeing sources there is no
// majority, so do not publish a new rate for that currency. Never alter the
// user's provider selection: every source gets another chance on next refresh.
export function checkedRates(results) {
  const byCurrency = new Map();
  for (const {name, rates} of results) {
    for (const [rawCode, value] of Object.entries(rates)) {
      const code = rawCode.toUpperCase();
      if (!allowed.has(code) || !validRate(value) || !validRate(1 / value)) continue;
      if (!byCurrency.has(code)) byCurrency.set(code, []);
      byCurrency.get(code).push({name, value});
    }
  }
  const accepted = new Map(results.map(({name}) => [name, {}]));
  const excluded = [];
  const conflicts = [];
  for (const [code, quotes] of byCurrency) {
    if (quotes.length === 2) {
      const [first, second] = quotes;
      const middle = first.value + (second.value - first.value) / 2;
      if (Math.abs(first.value - second.value) / middle > MAX_RATE_DEVIATION) {
        conflicts.push(code);
        continue;
      }
    }
    const sorted = quotes.map(quote => quote.value).sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)];
    const remaining = quotes.length >= 3
      ? quotes.filter(quote => Math.abs(quote.value - median) / median <= MAX_RATE_DEVIATION) : quotes;
    if (quotes.length >= 3 && remaining.length < 2) {
      conflicts.push(code);
      continue;
    }
    for (const quote of quotes) {
      if (remaining.includes(quote)) accepted.get(quote.name)[code] = quote.value;
      else excluded.push({source:quote.name, code});
    }
  }
  const contributors = results.filter(({name}) => Object.keys(accepted.get(name)).length);
  return {rates:averageRates(contributors.map(({name}) => accepted.get(name))),
    sources:contributors.map(({name}) => name), excluded, conflicts};
}

export const SOURCES = [
  {name:'CoinGecko',url:'https://api.coingecko.com/api/v3/exchange_rates',parse:data => Object.fromEntries(Object.entries(data.rates || {}).map(([code, item]) => [code, item.value]))},
  {name:'BitPay',url:'https://bitpay.com/rates/BTC',parse:data => Object.fromEntries((data.data || []).map(item => [item.code, item.rate]))},
  {name:'Blockchain.info',url:'https://blockchain.info/ticker',parse:data => Object.fromEntries(Object.entries(data).map(([code, item]) => [code, item.last]))}
];

export async function fetchRates(fetchImpl = fetch, selectedSources = SOURCES.map(source => source.name)) {
  const selection = Array.isArray(selectedSources) ? SOURCES.filter(source => selectedSources.includes(source.name)) : [];
  if (!selection.length) throw new Error('Vyberte alespoň jeden zdroj kurzů');
  const settled = await Promise.allSettled(selection.map(async source => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 12000);
    try {
      const response = await fetchImpl(source.url, {signal:controller.signal, cache:'no-store'});
      if (!response.ok) throw new Error(`${source.name}: HTTP ${response.status}`);
      const data = source.parse(await response.json());
      if (!Object.values(data).some(validRate)) throw new Error(`${source.name}: neplatná data`);
      return {name:source.name, rates:data};
    } finally { clearTimeout(timer); }
  }));
  const successful = settled.filter(result => result.status === 'fulfilled').map(result => result.value);
  const {rates, sources, excluded, conflicts} = checkedRates(successful);
  if (!Object.keys(rates).length) throw new Error('Kurzy nelze načíst');
  return {rates, sources, excluded, conflicts,
    selectedSources:selection.map(source => source.name), updatedAt:Date.now()};
}
