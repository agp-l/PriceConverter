import {detectLanguage, resolveLanguage, t} from '../i18n.js';
import {getCurrencies} from '../currencies.js';
import {averageRates, parseAmount, btcFrom, fromBtc, fetchRates} from '../rates.js';
import {restoreSettings, ConverterApp} from '../app.js';
import {parsePercent, tradeQuote, travelQuote, compareTravelOffer} from '../quotes.js';

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
  const settings = restoreSettings(JSON.stringify({marginPercent:3, mode:'trade', tradeCurrency:'PYG'}));
  assert(settings.marginPercent === 3 && settings.mode === 'trade' && settings.tradeCurrency === 'PYG', 'Nastavení směny');
  assert(restoreSettings('{}').marginPercent === 2, 'Výchozí výhoda');
  assert(restoreSettings(JSON.stringify({buyPercent:-3, sellPercent:4})).marginPercent === 3, 'Převod staré nákupní ceny');
  assert(restoreSettings(JSON.stringify({buyPercent:-3, sellPercent:4, dealerSide:'sell'})).marginPercent === 4, 'Převod staré prodejní ceny');
  assert(restoreSettings(JSON.stringify({marginPercent:-2, buyPercent:-3})).marginPercent === -2, 'Nové nastavení má přednost');
  const travelSettings = restoreSettings(JSON.stringify({mode:'travel', selected:['PYG','EUR','CZK']}));
  assert(travelSettings.mode === 'travel' && travelSettings.selected.join(',') === 'PYG,EUR,CZK', 'Cestovní režim a pořadí měn');
});

await check('Výpadek zdroje neodstaví dostupný kurz', async () => {
  const fakeFetch = async url => {
    if (!url.includes('bitpay')) throw new Error('offline');
    return {ok:true, json:async () => ({data:[{code:'PYG', rate:510_000_000}]})};
  };
  const result = await fetchRates(fakeFetch);
  assert(result.sources.join(',') === 'BitPay' && result.rates.PYG === 510_000_000, 'Chybí platný zdroj');
});

await check('Jedno procento zvýhodní nákup i prodej BTC', () => {
  const buy = tradeQuote({marketRate:2_000_000, marginPercent:2, side:'buy', amount:0.005, amountKind:'bitcoin'});
  const sell = tradeQuote({marketRate:2_000_000, marginPercent:2, side:'sell', amount:0.005, amountKind:'bitcoin'});
  assert(buy.fiat === 9_800 && buy.offeredRate === 1_960_000, 'Výkupní cena');
  assert(sell.fiat === 10_200 && sell.offeredRate === 2_040_000, 'Prodejní cena');
  assert(buy.difference === 200 && sell.difference === 200, 'Rozdíl proti trhu');
  assert(parsePercent('−2,5', 'cs') === -2.5 && parsePercent('+2.5', 'en') === 2.5, 'Procenta');
  for (const side of ['buy', 'sell']) {
    const disadvantage = tradeQuote({marketRate:2_000_000, marginPercent:-2, side, amount:0.005, amountKind:'bitcoin'});
    assert(disadvantage.difference === -200, 'Záporná výhoda');
    assert(tradeQuote({marketRate:2_000_000, marginPercent:0, side, amount:0.005, amountKind:'bitcoin'}).offeredRate === 2_000_000, 'Nulová výhoda');
  }
  assert(parsePercent('100') === null && parsePercent('-100') === null, 'Hranice procent');
});

await check('Pevná fiat částka a zaokrouhlení na celé satoshi', () => {
  const buy = tradeQuote({marketRate:2_000_000, marginPercent:2, side:'buy', amount:10_000});
  const sell = tradeQuote({marketRate:2_000_000, marginPercent:2, side:'sell', amount:10_000});
  assert(buy.sats === 510205 && sell.sats === 490196, 'Zaokrouhlení podle směru');
  assert(tradeQuote({marketRate:2_000_000, marginPercent:100, side:'buy', amount:100}) === null, 'Neplatná cena');
  assert(tradeQuote({marketRate:2_000_000, marginPercent:0, side:'sell', amount:1.5, amountKind:'bitcoin', unit:'SATS'}) === null, 'Zlomek satoshi');
});

await check('Cestovní přepočet mezi fiat měnami', () => {
  const quote = travelQuote(100, 'CZK', 'EUR', {CZK:2_000_000, EUR:80_000});
  assert(quote.rate === 0.04 && quote.result === 4, 'Křížový kurz');
  assert(travelQuote(100, 'CZK', 'PYG', {CZK:2_000_000}) === null, 'Chybějící kurz');
});

await check('Srovnání kurzu směnárny v obou zápisech a s poplatkem', () => {
  const rates = {CZK:2_000_000, EUR:80_000}; // Reference: 1 CZK = 0.04 EUR.
  const normal = compareTravelOffer(1000,'CZK','EUR',rates,0.038,'from');
  assert(normal.reference.result === 40 && normal.received === 38, 'Částka u směnárny');
  assert(normal.difference === -2 && normal.sourceDifference === -50 && normal.percent === -5, 'Kolik cestovatel ztrácí');
  const inverse = compareTravelOffer(1000,'CZK','EUR',rates,1/0.038,'to');
  assert(Math.abs(inverse.received - 38) < 1e-9, 'Opačný zápis kurzu');
  const fee = compareTravelOffer(1000,'CZK','EUR',rates,0.04,'from',50);
  assert(fee.received === 38 && fee.difference === -2, 'Pevný poplatek');
  const better = compareTravelOffer(1000,'CZK','EUR',rates,0.042,'from');
  assert(better.difference > 0 && better.sourceDifference > 0, 'Lepší nabídka');
  assert(compareTravelOffer(1000,'CZK','EUR',rates,0,'from') === null, 'Nulový kurz');
  assert(compareTravelOffer(1000,'CZK','EUR',rates,0.04,'from',1001) === null, 'Poplatek vyšší než částka');
  assert(compareTravelOffer(1000,'CZK','PYG',rates,1,'from') === null, 'Bez referenčního kurzu se nesrovnává');
});

await check('Roční graf BTC načítá správný symbol a interval', () => {
  let captured;
  const app = {miniChartLoaded:false, state:{language:'cs'}, elements:{miniChart:{},miniChartFallback:{}},
    embedChart:(container,fallback,filename,config) => { captured = {filename,config}; return true; }};
  ConverterApp.prototype.loadMiniChart.call(app);
  assert(app.miniChartLoaded && captured.filename === 'embed-widget-mini-symbol-overview.js', 'Roční widget');
  assert(captured.config.symbol === 'BITSTAMP:BTCUSD' && captured.config.dateRange === '12M'
    && captured.config.chartOnly === true, 'Symbol a rozsah grafu');
});

await check('Kopírování darovacích údajů a ruční záloha', async () => {
  let copied = '';
  const input = {value:'  bc1ptest  ', focus() { this.focused = true; }, select() { this.selected = true; }};
  const app = {win:{navigator:{clipboard:{writeText:async value => { copied = value; }}}},
    elements:{copyStatus:{textContent:''}}, tr:key => t('en', key)};
  await ConverterApp.prototype.copyDonation.call(app, input);
  assert(copied === 'bc1ptest' && app.elements.copyStatus.textContent === 'Copied.', 'Kopírování');
  app.win.navigator.clipboard = undefined;
  await ConverterApp.prototype.copyDonation.call(app, input);
  assert(input.focused && input.selected && app.elements.copyStatus.textContent.includes('manually'), 'Ruční kopírování');
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
    doc.querySelector('#sort-currencies').click();
    assert(doc.querySelector('#sort-currencies').getAttribute('aria-pressed') === 'true', 'Režim řazení');
    doc.querySelector('[data-code="PYG"] .sort-up').click();
    doc.querySelector('[data-code="PYG"] .sort-up').click();
    doc.querySelector('[data-code="PYG"] .sort-up').click();
    assert(doc.querySelector('.currency-row').dataset.code === 'PYG', 'Přesun měny nahoru');
    assert(JSON.parse(localStorage.getItem(key)).selected[0] === 'PYG', 'Pořadí se ukládá');
    doc.querySelector('#sort-currencies').click();
    doc.querySelector('#menu-toggle').click();
    assert(doc.querySelector('#app-menu').open && doc.querySelector('#menu-toggle').getAttribute('aria-expanded') === 'true', 'Otevření nabídky');
    assert(doc.querySelector('#app-menu #install-button') && !doc.querySelector('.app-footer'), 'Instalace v menu');
    assert(doc.querySelector('#app-menu a[href="https://github.com/agp-l/PriceConverter"]'), 'Otevřený zdrojový kód');
    doc.querySelector('#donate-button').click();
    assert(doc.querySelector('#donate-dialog').open && !doc.querySelector('#app-menu').open, 'Darovací dialog');
    assert(doc.querySelector('#donate-btc').value === 'bc1p8p5quw4s8t2ugspr2lf4mz5hqypw52az4hexp9a4nt80kyjxuayqqde2d7', 'Bitcoin adresa');
    assert(doc.querySelector('#donate-lightning').value.startsWith('lno1') && doc.querySelector('#donate-lightning').value.length > 250, 'Lightning nabídka');
    doc.querySelector('#close-donate').click();
    doc.querySelector('#menu-toggle').click();
    doc.querySelector('#tab-travel').click();
    assert(!doc.querySelector('#travel-pane').hidden && doc.querySelector('#convert-pane').hidden && !doc.querySelector('#app-menu').open, 'Samostatný cestovní převod');
    assert(doc.querySelector('#screen-title').textContent === 'Currency to currency', 'Titulek v horní liště');
    const offerRate = doc.querySelector('#travel-offer-rate');
    const offerBasis = doc.querySelector('#travel-offer-basis');
    assert(offerBasis.options[0].textContent.includes('CZK') && doc.querySelector('#travel-fee'), 'Kurz směnárny a poplatek');
    offerBasis.value = 'to'; offerBasis.dispatchEvent(new Event('change', {bubbles:true}));
    assert(doc.querySelector('#travel-offer-rate-label').textContent.includes('CZK'), 'Jednotka opačného zápisu kurzu');
    offerRate.value = '25'; offerRate.dispatchEvent(new Event('input', {bubbles:true}));
    assert(!doc.querySelector('#travel-comparison').hidden || !doc.querySelector('#travel-offer-error').hidden, 'Nabídka směnárny se vyhodnocuje');
    const from = doc.querySelector('#travel-from'); const to = doc.querySelector('#travel-to');
    const originalFrom = from.value; doc.querySelector('#travel-swap').click();
    assert(to.value === originalFrom && offerRate.value === '', 'Prohození měn odstraní starý kurz');
    assert(JSON.parse(localStorage.getItem(key)).mode === 'travel', 'Obnovení cestovní obrazovky');
    doc.querySelector('#menu-toggle').click();
    doc.querySelector('#tab-trade').click();
    assert(!doc.querySelector('#trade-pane').hidden && doc.querySelector('#convert-pane').hidden, 'Režim směny');
    const margin = doc.querySelector('#margin-percent');
    assert(margin?.value === '2' && !doc.querySelector('#buy-percent') && !doc.querySelector('#sell-percent'), 'Jediné pole s výhodou');
    assert(doc.querySelector('#margin-preview').textContent.includes('below'), 'Vysvětlení nákupní ceny');
    assert(doc.querySelector('#offer-fiat-label').textContent.includes('pay'), 'Směr nákupu BTC');
    const source = doc.querySelector('#market-source');
    source.value = 'manual'; source.dispatchEvent(new Event('change', {bubbles:true}));
    const reference = doc.querySelector('#manual-market');
    reference.value = '2000000'; reference.dispatchEvent(new Event('input', {bubbles:true}));
    assert(doc.querySelector('#offer-price').textContent.includes('1,960,000'), 'Ruční kurz a nákupní odchylka');
    assert(doc.querySelector('#offer-btc').textContent.includes('0.00510205'), 'Nabídka v celých satoshi');
    assert(!Object.hasOwn(JSON.parse(localStorage.getItem(key)), 'manualMarket'), 'Ruční kurz se neukládá');
    doc.querySelector('#dealer-sell').click();
    assert(doc.querySelector('#offer-fiat-label').textContent.includes('receive'), 'Směr prodeje BTC');
    assert(doc.querySelector('#offer-price').textContent.includes('2,040,000'), 'Stejné procento pro opačný směr');
    assert(doc.querySelector('#margin-preview').textContent.includes('above'), 'Vysvětlení prodejní ceny');
    margin.value = '-2'; margin.dispatchEvent(new Event('input', {bubbles:true}));
    assert(doc.querySelector('#offer-price').textContent.includes('1,960,000') && doc.querySelector('#margin-preview').classList.contains('unfavorable'), 'Záporná výhoda');
    assert(JSON.parse(localStorage.getItem(key)).marginPercent === -2, 'Uložení jediného procenta');
    margin.value = '2'; margin.dispatchEvent(new Event('input', {bubbles:true}));
    doc.querySelector('#language-switch').value = 'cs';
    doc.querySelector('#language-switch').dispatchEvent(new Event('change', {bubbles:true}));
    assert(doc.querySelector('#margin-preview').textContent.includes('dráž'), 'Český překlad vysvětlení');
    doc.querySelector('#language-switch').value = 'en';
    doc.querySelector('#language-switch').dispatchEvent(new Event('change', {bubbles:true}));
    const kind = doc.querySelector('#dealer-amount-kind');
    kind.value = 'bitcoin'; kind.dispatchEvent(new Event('change', {bubbles:true}));
    const unit = doc.querySelector('#dealer-unit');
    unit.value = 'SATS'; unit.dispatchEvent(new Event('change', {bubbles:true}));
    assert(parseAmount(doc.querySelector('#dealer-amount').value, 'en') === 1_000_000, 'Přepnutí částky na SATS');
    doc.querySelector('#menu-toggle').click();
    doc.querySelector('#tab-convert').click();
    assert(!doc.querySelector('#convert-pane').hidden && doc.querySelector('#travel-pane').hidden, 'Návrat do převodníku');
    assert(doc.querySelector('.chart-preview') && doc.querySelector('.chart-preview').textContent.includes('1 year'), 'Roční náhled grafu');
    doc.querySelector('#open-chart').click();
    assert(doc.querySelector('#chart-dialog').open, 'Otevření velkého grafu');
    doc.querySelector('#close-chart').click();
    assert(!doc.querySelector('#chart-dialog').open, 'Zavření velkého grafu');
  } finally {
    iframe.remove();
    if (previous === null) localStorage.removeItem(key);
    else localStorage.setItem(key, previous);
  }
});

document.querySelector('#summary').textContent = `${passed} úspěšných, ${failed} chyb.`;
if (failed) document.querySelector('#summary').className = 'fail';
