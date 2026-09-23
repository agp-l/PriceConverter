import {detectLanguage, resolveLanguage, t} from '../i18n.js';
import {getCurrencies} from '../currencies.js';
import {averageRates, parseAmount, btcFrom, fromBtc, fetchRates} from '../rates.js';
import {restoreSettings} from '../app.js';

const results = document.querySelector('#results');
let passed = 0;
let failed = 0;
const assert = (condition, message) => { if (!condition) throw new Error(message); };

async function check(name, test) {
  const item = document.createElement('li');
  try {
    await test(); item.textContent = `✓ ${name}`; item.className = 'pass'; passed++;
  } catch (error) {
    item.textContent = `✗ ${name}: ${error.message}`; item.className = 'fail'; failed++;
    console.error(name, error);
  }
  results.append(item);
}

await check('Automatický jazyk, ruční volba a překlady', () => {
  assert(detectLanguage(['fr-FR', 'cs-CZ']) === 'cs', 'Automatický jazyk');
  assert(resolveLanguage('en', ['cs-CZ']) === 'en', 'Ruční volba');
  assert(t('en', 'amountIn', {name:'Guarani'}) === 'Amount in Guarani', 'Překlad s parametrem');
});

await check('Měny včetně PYG v obou jazycích', () => {
  const cs = getCurrencies('cs'); const en = getCurrencies('en');
  assert(cs.length >= 150, 'Neúplný katalog měn');
  assert(cs.find(currency => currency.code === 'PYG')?.flag === '🇵🇾', 'Chybí PYG');
  assert(cs.find(currency => currency.code === 'PYG').name !== en.find(currency => currency.code === 'PYG').name, 'Chybí lokalizace');
});

await check('Převody BTC, SATS a desetinné zápisy', () => {
  assert(fromBtc(0.00000001, 'BTC', {}, 'SATS') === 1, 'Jeden satoshi');
  assert(btcFrom(1, 'BTC', {}, 'SATS') === 0.00000001, 'Zpět na BTC');
  assert(parseAmount('1 234,50', 'cs') === 1234.5, 'Český zápis');
  assert(parseAmount('1,234.5', 'en') === 1234.5, 'Anglický zápis');
  assert(parseAmount('1,2,3') === null, 'Neplatný zápis');
});

await check('Neplatné kurzy a poškozená uložená data', () => {
  const rates = averageRates([{CZK:100, USD:Infinity}, {CZK:200, BTC:1}]);
  assert(Math.abs(rates.CZK - 133.333333333) < 0.001, 'Průměr kurzů');
  assert(!('USD' in rates) && !('BTC' in rates), 'Neplatné měny');
  const restored = restoreSettings(JSON.stringify({selected:['PYG','PYG','INVALID'], cache:{rates:{PYG:5}}}));
  assert(restored.selected.join(',') === 'PYG' && restored.cache === null, 'Obnova stavu');
  assert(restoreSettings('{rozbité').selected.includes('CZK'), 'Poškozené JSON');
});

await check('Výpadek zdroje neodstaví dostupný kurz', async () => {
  const fakeFetch = async url => {
    if (!url.includes('bitpay')) throw new Error('offline');
    return {ok:true, json:async () => ({data:[{code:'PYG', rate:510_000_000}]})};
  };
  const result = await fetchRates(fakeFetch);
  assert(result.sources.join(',') === 'BitPay' && result.rates.PYG === 510_000_000, 'Chybí platný zdroj');
});

await check('Rozhraní: jazyk, satoshi a přidání PYG', async () => {
  const key = 'priceconverter:v1';
  const previous = localStorage.getItem(key);
  const iframe = document.createElement('iframe');
  try {
    localStorage.removeItem(key);
    iframe.src = '../index.html'; document.body.append(iframe);
    await new Promise((resolve, reject) => {
      iframe.addEventListener('load', resolve, {once:true});
      iframe.addEventListener('error', () => reject(new Error('Aplikace se nenačetla')), {once:true});
    });
    const doc = iframe.contentDocument;
    const btc = doc.querySelector('#btc-input');
    btc.value = '0,00000001'; btc.dispatchEvent(new Event('input', {bubbles:true}));
    doc.querySelector('#unit-sats').click();
    assert(btc.value === '1', 'Přepnutí na SATS');
    doc.querySelector('#unit-btc').click();
    assert(btc.value.includes('00000001'), 'Přepnutí zpět na BTC');
    doc.querySelector('#language-switch').value = 'en';
    doc.querySelector('#language-switch').dispatchEvent(new Event('change', {bubbles:true}));
    assert(doc.documentElement.lang === 'en' && btc.value === '0.00000001', 'Změna jazyka a přesnost');
    doc.querySelector('#add-currency').click();
    const search = doc.querySelector('#currency-search');
    search.value = 'PYG'; search.dispatchEvent(new Event('input', {bubbles:true}));
    const option = [...doc.querySelectorAll('.option-button')].find(button => button.textContent.includes('PYG'));
    assert(option, 'PYG není v nabídce'); option.click();
    assert([...doc.querySelectorAll('.currency-code')].some(code => code.textContent === 'PYG'), 'PYG se nepřidalo');
  } finally {
    iframe.remove();
    if (previous === null) localStorage.removeItem(key);
    else localStorage.setItem(key, previous);
  }
});

document.querySelector('#summary').textContent = `${passed} úspěšných, ${failed} chyb.`;
if (failed) document.querySelector('#summary').className = 'fail';
