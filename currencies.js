// Offline fallback for browsers without Intl.supportedValuesOf('currency').
// This list follows the currency codes provided by ICU/CLDR.
const FALLBACK_CODES = `AED AFN ALL AMD ANG AOA ARS AUD AWG AZN BAM BBD BDT BGN BHD BIF BMD BND BOB BRL BSD BTN BWP BYN BZD CAD CDF CHF CLP CNY COP CRC CUC CUP CVE CZK DJF DKK DOP DZD EGP ERN ETB EUR FJD FKP GBP GEL GHS GIP GMD GNF GTQ GYD HKD HNL HRK HTG HUF IDR ILS INR IQD IRR ISK JMD JOD JPY KES KGS KHR KMF KPW KRW KWD KYD KZT LAK LBP LKR LRD LSL LYD MAD MDL MGA MKD MMK MNT MOP MRU MUR MVR MWK MXN MYR MZN NAD NGN NIO NOK NPR NZD OMR PAB PEN PGK PHP PKR PLN PYG QAR RON RSD RUB RWF SAR SBD SCR SDG SEK SGD SHP SLE SLL SOS SRD SSP STN SVC SYP SZL THB TJS TMT TND TOP TRY TTD TWD TZS UAH UGX USD UYU UZS VES VND VUV WST XAF XCD XCG XDR XOF XPF XSU YER ZAR ZMW ZWG ZWL`.split(' ');

const favorites = {
  CZK:['Česká koruna','🇨🇿'], EUR:['Euro','🇪🇺'], USD:['Americký dolar','🇺🇸'],
  GBP:['Britská libra','🇬🇧'], PLN:['Polský zlotý','🇵🇱'], CHF:['Švýcarský frank','🇨🇭'],
  CAD:['Kanadský dolar','🇨🇦'], AUD:['Australský dolar','🇦🇺'], JPY:['Japonský jen','🇯🇵'],
  SEK:['Švédská koruna','🇸🇪'], NOK:['Norská koruna','🇳🇴'], DKK:['Dánská koruna','🇩🇰'],
  HUF:['Maďarský forint','🇭🇺'], RON:['Rumunský leu','🇷🇴'], UAH:['Ukrajinská hřivna','🇺🇦'],
  TRY:['Turecká lira','🇹🇷'], BRL:['Brazilský real','🇧🇷'], INR:['Indická rupie','🇮🇳'],
  KRW:['Jihokorejský won','🇰🇷'], SGD:['Singapurský dolar','🇸🇬'], MXN:['Mexické peso','🇲🇽'],
  ZAR:['Jihoafrický rand','🇿🇦']
};

let codes = FALLBACK_CODES;
try { codes = Intl.supportedValuesOf('currency'); } catch { /* Use the offline catalog. */ }
let regionNames;
try {
  regionNames = new Intl.DisplayNames('en', {type:'region'});
} catch { /* Keep currency codes as labels on older browsers. */ }

function flagFor(code) {
  const region = code.slice(0, 2);
  if (!regionNames || regionNames.of(region) === region) return '¤';
  return [...region].map(letter => String.fromCodePoint(127397 + letter.charCodeAt(0))).join('');
}

// The built-in list must not shrink when a browser supports only part of CLDR.
const catalog = [...new Set([...FALLBACK_CODES, ...Object.keys(favorites), ...codes])].filter(code => /^[A-Z]{3}$/.test(code));

export function getCurrencies(language = 'cs') {
  let names;
  try { names = new Intl.DisplayNames(language, {type:'currency'}); } catch { /* Use codes as fallback. */ }
  return catalog.map(code => {
    const localized = names?.of(code);
    const name = (language === 'cs' && favorites[code]?.[0]) ||
      (localized && localized !== code ? localized[0].toLocaleUpperCase(language) + localized.slice(1) : code);
    return {code, name, flag:favorites[code]?.[1] || flagFor(code)};
  });
}

export const CURRENCIES = getCurrencies('cs');
