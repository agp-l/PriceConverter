// Each provider reports fiat units for one BTC. We average the inverse, as the
// Android Price Converter does, so each available provider has equal weight.
export const CURRENCIES = [
  {code:'CZK',name:'Česká koruna',flag:'🇨🇿'},
  {code:'EUR',name:'Euro',flag:'🇪🇺'},
  {code:'USD',name:'Americký dolar',flag:'🇺🇸'},
  {code:'GBP',name:'Britská libra',flag:'🇬🇧'},
  {code:'PLN',name:'Polský zlotý',flag:'🇵🇱'},
  {code:'CHF',name:'Švýcarský frank',flag:'🇨🇭'},
  {code:'CAD',name:'Kanadský dolar',flag:'🇨🇦'},
  {code:'AUD',name:'Australský dolar',flag:'🇦🇺'},
  {code:'JPY',name:'Japonský jen',flag:'🇯🇵'},
  {code:'SEK',name:'Švédská koruna',flag:'🇸🇪'},
  {code:'NOK',name:'Norská koruna',flag:'🇳🇴'},
  {code:'DKK',name:'Dánská koruna',flag:'🇩🇰'},
  {code:'HUF',name:'Maďarský forint',flag:'🇭🇺'},
  {code:'RON',name:'Rumunský leu',flag:'🇷🇴'},
  {code:'UAH',name:'Ukrajinská hřivna',flag:'🇺🇦'},
  {code:'TRY',name:'Turecká lira',flag:'🇹🇷'},
  {code:'BRL',name:'Brazilský real',flag:'🇧🇷'},
  {code:'INR',name:'Indická rupie',flag:'🇮🇳'},
  {code:'KRW',name:'Jihokorejský won',flag:'🇰🇷'},
  {code:'SGD',name:'Singapurský dolar',flag:'🇸🇬'},
  {code:'MXN',name:'Mexické peso',flag:'🇲🇽'},
  {code:'ZAR',name:'Jihoafrický rand',flag:'🇿🇦'}
];

const allowed = new Set(CURRENCIES.map(currency => currency.code));
const validRate = value => typeof value === 'number' && Number.isFinite(value) && value > 0;

export function parseAmount(input) {
  const cleaned = String(input).trim().replace(/[\s\u00a0\u202f]/g, '').replace(',', '.');
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
      (inverse[code] ||= []).push(1 / value);
    }
  }
  return Object.fromEntries(Object.entries(inverse).map(([code, values]) =>
    [code, 1 / (values.reduce((sum, value) => sum + value, 0) / values.length)]
  ));
}

export const SOURCES = [
  {name:'CoinGecko',url:'https://api.coingecko.com/api/v3/exchange_rates',parse:data => Object.fromEntries(Object.entries(data.rates || {}).map(([code, item]) => [code, item.value]))},
  {name:'BitPay',url:'https://bitpay.com/rates/BTC',parse:data => Object.fromEntries((data.data || []).map(item => [item.code, item.rate]))},
  {name:'Blockchain.info',url:'https://blockchain.info/ticker',parse:data => Object.fromEntries(Object.entries(data).map(([code, item]) => [code, item.last]))}
];

export async function fetchRates(fetchImpl = fetch) {
  const settled = await Promise.allSettled(SOURCES.map(async source => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 9000);
    try {
      const response = await fetchImpl(source.url, {signal:controller.signal, cache:'no-store'});
      if (!response.ok) throw new Error(`${source.name}: HTTP ${response.status}`);
      const data = source.parse(await response.json());
      if (!Object.values(data).some(validRate)) throw new Error(`${source.name}: neplatná data`);
      return {name:source.name, rates:data};
    } finally { clearTimeout(timer); }
  }));
  const successful = settled.filter(result => result.status === 'fulfilled').map(result => result.value);
  const rates = averageRates(successful.map(result => result.rates));
  if (!Object.keys(rates).length) throw new Error('Kurzy nelze načíst');
  return {rates, sources:successful.map(result => result.name), updatedAt:Date.now()};
}
