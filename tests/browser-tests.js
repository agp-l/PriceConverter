import {SUPPORTED_LANGUAGES, messages, detectLanguage, resolveLanguage, localeFor, sourceCount, t} from '../i18n.js';
import {getCurrencies} from '../currencies.js';
import {averageRates, checkedRates, parseAmount, btcFrom, fromBtc, fetchRates} from '../rates.js';
import {restoreSettings, ConverterApp, formatConvertedFiat, formatTradeOffer, shouldRefreshRates} from '../app.js';
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
  assert(detectLanguage(['fr-FR', 'cs-CZ']) === 'fr', 'Automatický jazyk');
  assert(resolveLanguage('en', ['cs-CZ']) === 'en', 'Ruční volba');
  assert(t('en', 'amountIn', {name:'Guarani'}) === 'Amount in Guarani', 'Překlad s parametrem');
  assert(detectLanguage(['no-NO']) === 'nb' && detectLanguage(['pt-PT']) === 'pt', 'Automatická norština a portugalština');
  assert(localeFor('es') === 'es-ES' && localeFor('pt') === 'pt-PT', 'Místní formát čísel');
  assert(sourceCount('pl', 2) === '2 źródła' && sourceCount('pl', 5) === '5 źródeł' &&
    sourceCount('fr', 0) === '0 sources', 'Skloňování počtu zdrojů');
});

await check('Všechny jazyky mají kompletní texty a shodné parametry', () => {
  const keys = Object.keys(messages.cs).sort();
  const parameters = text => [...text.matchAll(/\{(\w+)\}/g)].map(match => match[1]).sort().join(',');
  assert(SUPPORTED_LANGUAGES.length === 13, 'Očekávaný počet jazyků');
  for (const language of SUPPORTED_LANGUAGES) {
    assert(JSON.stringify(Object.keys(messages[language]).sort()) === JSON.stringify(keys), `${language}: chybějící nebo nadbytečné texty`);
    for (const key of keys) {
      assert(typeof messages[language][key] === 'string' && messages[language][key].trim(), `${language}: prázdný text ${key}`);
      assert(parameters(messages[language][key]) === parameters(messages.cs[key]), `${language}: parametry textu ${key}`);
    }
  }
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
  assert(parseAmount('1.234,50', 'es') === 1234.5 && parseAmount('1.234', 'de') === 1234, 'Španělské a německé oddělovače');
  assert(parseAmount('1 234,50', 'pl') === 1234.5 && parseAmount('0.00000001', 'es') === 0.00000001, 'Polské částky a BTC s tečkou');
  assert(parseAmount('1,2,3') === null, 'Neplatný zápis');
});

await check('Přehledné měny bez ztráty drobných částek', () => {
  assert(formatConvertedFiat(179.51, 'CZK') === '180', 'Běžná částka bez haléřů');
  assert(formatConvertedFiat(3.5, 'CZK') === '3,5', 'Malá cena se zbytkem koruny');
  assert(formatConvertedFiat(179.51, 'CZK', 'cs', '2') === '179,51', 'Přesnější režim');
  assert(formatConvertedFiat(179.51, 'EUR') === '179,51', 'Ostatní měny neztrácejí významné desetiny');
  assert(formatConvertedFiat(179.5123, 'KWD') === '179,512', 'Velká částka v měně se třemi podjednotkami');
  assert(formatConvertedFiat(0.004, 'CZK', 'cs', '0') === '0,004', 'Nenulová částka nezmizí při zaokrouhlení');
  assert(formatConvertedFiat(25.6, 'JPY') === '26', 'Měna bez menších jednotek');
  assert(formatConvertedFiat(1.2356, 'KWD') === '1,236', 'Měna se třemi desetinnými místy');
  assert(formatConvertedFiat(1234.56, 'CZK', 'en', '2') === '1,234.56', 'Anglické oddělovače');
  const input = {dataset:{code:'CZK'},disabled:false};
  const app = {state:{anchor:'BTC',btc:179.51 / 2_000_000,cache:{rates:{CZK:2_000_000}},language:'cs',fiatPrecision:'auto'},
    elements:{list:{querySelectorAll:() => [input]}},hasRate:() => true,tr:() => ''};
  ConverterApp.prototype.updateValues.call(app);
  assert(input.value === '180' && app.state.btc === 179.51 / 2_000_000, 'Zaokrouhlení nemění výpočet');
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
  assert(restoreSettings('{}').dealerSide === 'sell', 'Výchozí prodej BTC');
  assert(restoreSettings('{"dealerSide":"buy"}').dealerSide === 'sell', 'Starý automatický nákup přejde na prodej');
  assert(restoreSettings('{"dealerSide":"buy","dealerSideChosen":true}').dealerSide === 'buy', 'Nově zvolený nákup zůstane');
  assert(restoreSettings('{"dealerSide":"sell"}').dealerSide === 'sell', 'Uložený prodej BTC');
  assert(restoreSettings(JSON.stringify({buyPercent:-3, sellPercent:4})).marginPercent === 3, 'Převod staré nákupní ceny');
  assert(restoreSettings(JSON.stringify({buyPercent:-3, sellPercent:4, dealerSide:'sell'})).marginPercent === 4, 'Převod staré prodejní ceny');
  assert(restoreSettings(JSON.stringify({marginPercent:-2, buyPercent:-3})).marginPercent === -2, 'Nové nastavení má přednost');
  const travelSettings = restoreSettings(JSON.stringify({mode:'travel', selected:['PYG','EUR','CZK']}));
  assert(travelSettings.mode === 'travel' && travelSettings.selected.join(',') === 'PYG,EUR,CZK', 'Cestovní režim a pořadí měn');
  const chartSettings = restoreSettings(JSON.stringify({mode:'chart',showChartPreview:false,chartRange:'3M'}));
  assert(chartSettings.mode === 'chart' && !chartSettings.showChartPreview && chartSettings.chartRange === '3M', 'Uložený graf');
  assert(restoreSettings('{"chartRange":"60M"}').chartRange === '60M', 'Pětiletý rozsah');
  assert(restoreSettings('{"chartRange":"MAX"}').chartRange === 'MAX', 'Rozsah MAX');
  assert(restoreSettings('{}').fiatPrecision === 'auto' &&
    restoreSettings('{"fiatPrecision":"4"}').fiatPrecision === '4' &&
    restoreSettings('{"fiatPrecision":"bad"}').fiatPrecision === 'auto', 'Přesnost měn a obnova nastavení');
  assert(restoreSettings('{}').rateSources.join(',') === 'CoinGecko,BitPay,Blockchain.info', 'Výchozí tři zdroje');
  assert(restoreSettings('{"rateSources":["BitPay","BitPay","neznámý"]}').rateSources.join(',') === 'BitPay', 'Uložený výběr zdrojů');
  assert(restoreSettings('{"rateSources":[]}').rateSources.length === 3, 'Nelze načíst prázdný výběr');
  const cache = {rates:{CZK:2_000_000}, sources:['BitPay'], selectedSources:['BitPay'], updatedAt:Date.now()};
  assert(restoreSettings(JSON.stringify({rateSources:['BitPay'],cache})).cache.selectedSources.join(',') === 'BitPay', 'Původ posledního kurzu');
  const warnings = restoreSettings(JSON.stringify({cache:{...cache,
    excluded:[{source:'BitPay',code:'CZK'},{source:'Unknown',code:'EUR'}],conflicts:['PYG','INVALID']}})).cache;
  assert(warnings.excluded.length === 1 && warnings.conflicts.join(',') === 'PYG', 'Bezpečná obnova diagnostiky');
  const invalidChart = restoreSettings(JSON.stringify({mode:'other',showChartPreview:'false',chartRange:'0D'}));
  assert(invalidChart.mode === 'convert' && invalidChart.showChartPreview && invalidChart.chartRange === '12M', 'Neplatné nastavení grafu');
});

await check('Výpadek zdroje neodstaví dostupný kurz', async () => {
  const fakeFetch = async url => {
    if (!url.includes('bitpay')) throw new Error('offline');
    return {ok:true, json:async () => ({data:[{code:'PYG', rate:510_000_000}]})};
  };
  const result = await fetchRates(fakeFetch);
  assert(result.sources.join(',') === 'BitPay' && result.rates.PYG === 510_000_000, 'Chybí platný zdroj');
});

await check('Odlehlý kurz se vyřadí jen pro danou měnu', () => {
  const checked = checkedRates([
    {name:'CoinGecko', rates:{CZK:2_000_000, EUR:80_000}},
    {name:'BitPay', rates:{CZK:2_010_000, EUR:80_100}},
    {name:'Blockchain.info', rates:{CZK:20_000_000, PYG:510_000_000}}
  ]);
  assert(checked.rates.CZK > 2_000_000 && checked.rates.CZK < 2_010_000, 'Chybný kurz nesmí ovlivnit CZK');
  assert(checked.rates.PYG === 510_000_000 && checked.sources.length === 3, 'Jiná měna téhož zdroje zůstává');
  assert(checked.excluded.length === 1 && checked.excluded[0].source === 'Blockchain.info' &&
    checked.excluded[0].code === 'CZK', 'Příčina vyřazení je dohledatelná');
  assert(!checked.conflicts.length, 'Shoda dvou zdrojů stačí');
});

await check('Rozpor dvou zdrojů nevytvoří falešně přesný kurz', () => {
  const checked = checkedRates([
    {name:'CoinGecko', rates:{CZK:2_000_000, EUR:80_000}},
    {name:'BitPay', rates:{CZK:3_000_000, EUR:80_100}}
  ]);
  assert(!('CZK' in checked.rates) && checked.conflicts.join(',') === 'CZK', 'Bez většiny se CZK nezobrazuje');
  assert(checked.rates.EUR > 80_000 && checked.rates.EUR < 80_100, 'Ostatní kurzy fungují dál');
  const noMajority = checkedRates([
    {name:'A', rates:{CZK:100}}, {name:'B', rates:{CZK:150}}, {name:'C', rates:{CZK:250}}
  ]);
  assert(!('CZK' in noMajority.rates) && noMajority.conflicts[0] === 'CZK', 'Tři rozporné zdroje nejsou konsenzus');
});

await check('Zdroj s odchylkou dostane při dalším načtení novou šanci', async () => {
  let corrected = false;
  const fakeFetch = async url => ({ok:true, json:async () => url.includes('coingecko')
    ? {rates:{czk:{value:2_000_000}}}
    : url.includes('bitpay') ? {data:[{code:'CZK', rate:2_010_000}]}
      : {CZK:{last:corrected ? 2_005_000 : 20_000_000}}});
  const first = await fetchRates(fakeFetch);
  assert(first.excluded.length === 1 && first.sources.length === 2, 'Odlehlá odpověď je vyřazena');
  corrected = true;
  const next = await fetchRates(fakeFetch);
  assert(next.sources.length === 3 && next.excluded.length === 0 && next.rates.CZK > 2_000_000,
    'Opravený zdroj je znovu použit');
});

await check('Nastavení ukazuje vynechané a rozporné kurzy', () => {
  const controls = ['CoinGecko','BitPay','Blockchain.info'].map(value => ({value}));
  const warnings = {textContent:'', hidden:true};
  const app = {state:{language:'en', rateSources:['CoinGecko','BitPay','Blockchain.info'],
    cache:{sources:['CoinGecko','BitPay'], selectedSources:['CoinGecko','BitPay','Blockchain.info'],
      excluded:[{source:'Blockchain.info',code:'CZK'}], conflicts:['PYG']}},
  elements:{rateSourceControls:{querySelectorAll:() => controls},sourceLast:{textContent:''},
    sourceSelectionStatus:{textContent:''},rateWarnings:warnings},tr:(key,params) => t('en',key,params)};
  ConverterApp.prototype.syncSourceSettings.call(app);
  assert(!warnings.hidden && warnings.textContent.includes('Blockchain.info (CZK)') &&
    warnings.textContent.includes('PYG'), 'Přehled kontroly se ukáže');
  app.state.cache = {...app.state.cache, excluded:[], conflicts:[]};
  ConverterApp.prototype.syncSourceSettings.call(app);
  assert(warnings.hidden, 'Bez odchylek zůstává obrazovka klidná');
});

await check('Vybrané zdroje nepoptávají ostatní poskytovatele', async () => {
  const requested = [];
  const fakeFetch = async url => {
    requested.push(url);
    return {ok:true, json:async () => ({data:[{code:'CZK', rate:2_000_000}]})};
  };
  const result = await fetchRates(fakeFetch, ['BitPay']);
  assert(requested.length === 1 && requested[0].includes('bitpay'), 'Dotaz jen na BitPay');
  assert(result.sources.join(',') === 'BitPay' && result.selectedSources.join(',') === 'BitPay', 'Uložený původ kurzu');
  let rejected = false;
  try { await fetchRates(fakeFetch, []); } catch { rejected = true; }
  assert(rejected && requested.length === 1, 'Prázdný výběr nespouští požadavky');
});

await check('Kurzy se automaticky načítají nejdříve po hodině', () => {
  const now = Date.now();
  const fresh = {updatedAt:now - 30 * 60_000};
  const old = {updatedAt:now - 61 * 60_000};
  assert(!shouldRefreshRates(fresh, now - 61 * 60_000, now), 'Půlhodinová cena stačí');
  assert(!shouldRefreshRates(old, now - 30_000, now), 'Návrat připojení nevyvolá druhý dotaz');
  assert(!shouldRefreshRates(old, now - 59 * 60_000, now), 'Po 59 minutách se automaticky neopakuje');
  assert(shouldRefreshRates(old, now - 60 * 60_000, now), 'Po hodině se starý kurz obnoví');
  assert(!shouldRefreshRates(null, now - 10 * 60_000, now), 'Chyba nedělá rychlé opakování');
  assert(shouldRefreshRates(null, 0, now), 'Bez cache proběhne první dotaz');
  assert(!shouldRefreshRates(old, now - 30_000, now, true), 'Ruční obnovení má odstup');
  assert(shouldRefreshRates(fresh, now - 60_000, now, true), 'Po minutě lze kurz vyžádat ručně');
  const selectedCache = {updatedAt:now, selectedSources:['BitPay']};
  assert(!shouldRefreshRates(selectedCache, now - 60_000, now, false, ['CoinGecko']), 'Změna výběru neobchází hodinový limit');
  assert(shouldRefreshRates(selectedCache, now - 60 * 60_000, now, false, ['CoinGecko']), 'Změna výběru se později sama načte');
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

await check('Sdílená nabídka uvádí směr, přesné satoshi a stáří podkladového kurzu', () => {
  const date = new Date('2026-09-23T12:00:00Z');
  const buy = tradeQuote({marketRate:2_000_000, marginPercent:2, side:'buy', amount:10_000});
  const text = formatTradeOffer(buy, {currency:'CZK', generatedAt:date, referenceUpdatedAt:date.valueOf()});
  assert(/Koupím od vás 0\.00510205 BTC za 10\s?000 CZK\./.test(text) &&
    /1\s?960\s?000 CZK/.test(text), 'Nabídka nákupu');
  assert(text.includes('Podkladový kurz načten:') && !text.includes('2 %'), 'Stáří bez zveřejnění marže');
  const sell = tradeQuote({marketRate:2_000_000, marginPercent:2, side:'sell', amount:0.005, amountKind:'bitcoin'});
  const english = formatTradeOffer(sell, {currency:'CZK', unit:'SATS', language:'en', generatedAt:date});
  assert(english.includes('I will sell you 500,000 sats (0.00500000 BTC) for 10,200 CZK.'), 'Nabídka prodeje v sats');
  assert(!english.includes('Reference rate fetched:'), 'Ruční podklad nepředstírá stažení kurzu');
});

await check('Sdílení, kopírování i ruční zkopírování při nedostupné schránce', async () => {
  let shared; let copied;
  const offer = 'Nabídka\nKoupím BTC.';
  const textarea = {value:'', focus() { this.focused = true; }, select() { this.selected = true; }};
  const dialog = {showModal() { this.open = true; }};
  const app = {win:{navigator:{share:async data => { shared = data; }, clipboard:{writeText:async value => { copied = value; }}}},
    elements:{tradeShareStatus:{textContent:''},tradeCopyText:textarea,tradeCopyDialog:dialog},
    tradeOfferText:() => offer, tr:key => t('en', key)};
  await ConverterApp.prototype.shareTradeOffer.call(app);
  assert(shared.text === offer && shared.title.includes('VexlCalc'), 'Nativní sdílení');
  await ConverterApp.prototype.copyTradeOffer.call(app);
  assert(copied === offer && app.elements.tradeShareStatus.textContent === 'Copied.', 'Schránka');
  app.win.navigator.clipboard = undefined;
  await ConverterApp.prototype.copyTradeOffer.call(app);
  assert(dialog.open && textarea.value === offer && textarea.focused && textarea.selected, 'Ruční záloha');
  app.win.navigator.share = async () => { throw {name:'AbortError'}; };
  app.elements.tradeShareStatus.textContent = '';
  await ConverterApp.prototype.shareTradeOffer.call(app);
  assert(app.elements.tradeShareStatus.textContent === '', 'Zrušení systémového sdílení není chyba');
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
  const app = {miniChartLoaded:false, state:{language:'cs',mode:'convert',showChartPreview:true,chartRange:'12M'},
    elements:{miniChart:{},miniChartFallback:{}},
    embedChart:(container,fallback,filename,config) => { captured = {filename,config}; return true; }};
  ConverterApp.prototype.loadMiniChart.call(app);
  assert(app.miniChartLoaded && captured.filename === 'embed-widget-mini-symbol-overview.js', 'Roční widget');
  assert(captured.config.symbol === 'BITSTAMP:BTCUSD' && captured.config.dateRange === '12M'
    && captured.config.chartOnly === true, 'Symbol a rozsah grafu');
  app.state.showChartPreview = false;
  ConverterApp.prototype.loadMiniChart.call(app);
  assert(captured.config.dateRange === '12M', 'Vypnutý náhled nic nenačítá');
  app.state.showChartPreview = true;
  app.state.chartRange = '3M';
  app.resetChart = () => { app.wasReset = true; };
  ConverterApp.prototype.loadMiniChart.call(app);
  assert(app.wasReset && captured.config.dateRange === '3M', 'Změna období obnoví widget');
  app.state.chartRange = 'MAX';
  ConverterApp.prototype.loadMiniChart.call(app);
  assert(captured.config.dateRange === 'ALL', 'MAX načítá dostupnou historii malého grafu');
  app.state.chartRange = '60M';
  ConverterApp.prototype.loadMiniChart.call(app);
  assert(captured.config.dateRange === '60M', 'Pětiletý náhled');
});

await check('Detailní graf otevře pět let a celou historii', () => {
  let captured;
  const app = {largeChartLoaded:false, state:{mode:'chart',chartRange:'60M'},
    elements:{largeChart:{},largeChartFallback:{}},
    embedChart:(container,fallback,filename,config) => { captured = {filename,config}; return true; },
    resetChart:() => {}};
  ConverterApp.prototype.loadLargeChart.call(app);
  assert(captured.filename === 'embed-widget-advanced-chart.js' && captured.config.interval === 'W' &&
    captured.config.timeframe === '60M', 'Pětiletý detail');
  app.state.chartRange = 'MAX';
  ConverterApp.prototype.loadLargeChart.call(app);
  assert(captured.config.interval === 'M' && captured.config.timeframe.from === Date.UTC(2009,0,3)/1000 &&
    captured.config.timeframe.to > captured.config.timeframe.from, 'MAX obsahuje kompletní dostupnou historii');
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
  const attemptKey = 'priceconverter:last-rate-attempt';
  const previous = localStorage.getItem(key);
  const previousAttempt = localStorage.getItem(attemptKey);
  const iframe = document.createElement('iframe');
  try {
    localStorage.removeItem(key); localStorage.removeItem(attemptKey);
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
    const switcher = doc.querySelector('#language-switch');
    assert(SUPPORTED_LANGUAGES.every(language => [...switcher.options].some(option => option.value === language)), 'Volby jazyků v nabídce');
    for (const language of SUPPORTED_LANGUAGES) {
      switcher.value = language; switcher.dispatchEvent(new Event('change', {bubbles:true}));
      assert(doc.documentElement.lang === language && doc.querySelector('#currencies-heading').textContent === t(language, 'myCurrencies'),
        `${language}: změna jazyka aplikace`);
    }
    switcher.value = 'en'; switcher.dispatchEvent(new Event('change', {bubbles:true}));
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
    const tabs = [...doc.querySelectorAll('.drawer-nav button')].map(button => button.id);
    assert(tabs.indexOf('tab-trade') < tabs.indexOf('tab-travel'), 'Osobní směna je nad cestovním převodem');
    assert(doc.querySelector('#app-menu #install-button') && !doc.querySelector('.app-footer'), 'Instalace v menu');
    assert(doc.querySelector('#app-menu a[href="https://github.com/agp-l/VexlCalc"]'), 'Otevřený zdrojový kód');
    doc.querySelector('#donate-button').click();
    assert(doc.querySelector('#donate-dialog').open && !doc.querySelector('#app-menu').open, 'Darovací dialog');
    const offer = 'lno1pgqppmsrse80qf0aara4slvcjxrvu6j2rp5ftmjy4yntlsmsutpkvkt6878s9djjdxvyqd662tfrqukn702zjpdf3d880gn796tfwxqx4f0ghhr2qgp0u6v74fjryur6yu6a8edrarxhlexn6c2zac6422fuhzl7wzxfn4sqxv4emt4kt78quvcs4sptd9cs3f8vxmqfe4khrd809ngvs87yjgljvxz8fcduqs522rryf5n2qmm2zekjaz2qy58e92uv063uu98kqd9v5996drn7pp49slm5jl5086f2jenlt58aqqeqcykddz9dgp7fxza5z2ywmrf9uyfxkcm90cd46kge4fsxts5udytf2mjj4z2xrvddvl37s59v037dkfrq';
    const uri = `bitcoin:?lno=${offer}`;
    const btcAddress = 'bc1pakxyfgcxujzrss5sgndsevd27h0u9yc2sxchhgdjzrcy5hc0epfsuplfx2';
    assert(doc.querySelector('#donate-btc').value === btcAddress, 'Bitcoinová adresa v Phoenixu');
    assert(doc.querySelector('#open-btc-wallet').getAttribute('href') === `bitcoin:${btcAddress}`, 'Bitcoinový odkaz pro peněženku');
    assert(doc.querySelector('#open-uri-wallet').getAttribute('href') === uri, 'Otevření stejné nabídky v peněžence');
    assert(doc.querySelector('#donate-lightning').value === offer, 'Lightning nabídka');
    assert(doc.querySelector('#copy-btc') && doc.querySelector('#copy-lightning') && !doc.querySelector('#donate-uri'), 'Dvě srozumitelné možnosti kopírování');
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
    assert(doc.querySelector('.trade-side button:first-child').id === 'dealer-sell' &&
      doc.querySelector('#dealer-sell').getAttribute('aria-pressed') === 'true', 'Prodej je první a výchozí');
    assert(doc.querySelector('#margin-preview').textContent.includes('above'), 'Vysvětlení výchozí prodejní ceny');
    assert(doc.querySelector('#offer-fiat-label').textContent.includes('receive'), 'Prodej BTC přijímá fiat');
    doc.querySelector('#dealer-buy').click();
    assert(JSON.parse(localStorage.getItem(key)).dealerSideChosen === true &&
      JSON.parse(localStorage.getItem(key)).dealerSide === 'buy', 'Ručně vybraný nákup se ukládá');
    assert(doc.querySelector('#margin-preview').textContent.includes('below'), 'Vysvětlení nákupní ceny');
    assert(doc.querySelector('#offer-fiat-label').textContent.includes('pay'), 'Směr nákupu BTC');
    const source = doc.querySelector('#market-source');
    source.value = 'manual'; source.dispatchEvent(new Event('change', {bubbles:true}));
    const reference = doc.querySelector('#manual-market');
    reference.value = '2000000'; reference.dispatchEvent(new Event('input', {bubbles:true}));
    assert(doc.querySelector('#offer-price').textContent.includes('1,960,000'), 'Ruční kurz a nákupní odchylka');
    assert(doc.querySelector('#offer-btc').textContent.includes('0.00510205'), 'Nabídka v celých satoshi');
    assert(!doc.querySelector('#trade-copy').disabled, 'Platnou nabídku lze zkopírovat');
    assert(!Object.hasOwn(JSON.parse(localStorage.getItem(key)), 'manualMarket'), 'Ruční kurz se neukládá');
    doc.querySelector('#dealer-sell').click();
    assert(doc.querySelector('#offer-fiat-label').textContent.includes('receive'), 'Směr prodeje BTC');
    assert(doc.querySelector('#offer-price').textContent.includes('2,040,000'), 'Stejné procento pro opačný směr');
    assert(doc.querySelector('#margin-preview').textContent.includes('above'), 'Vysvětlení prodejní ceny');
    margin.value = '-2'; margin.dispatchEvent(new Event('input', {bubbles:true}));
    assert(doc.querySelector('#offer-price').textContent.includes('1,960,000') && doc.querySelector('#margin-preview').classList.contains('unfavorable'), 'Záporná výhoda');
    assert(JSON.parse(localStorage.getItem(key)).marginPercent === -2, 'Uložení jediného procenta');
    margin.value = 'nesmysl'; margin.dispatchEvent(new Event('input', {bubbles:true}));
    assert(doc.querySelector('#trade-copy').disabled, 'Neplatnou nabídku nelze sdílet');
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
    assert(doc.querySelector('#add-currency').compareDocumentPosition(doc.querySelector('#chart-preview')) & Node.DOCUMENT_POSITION_FOLLOWING,
      'Malý graf následuje až za tlačítkem pro přidání měny');
    assert(doc.querySelector('.chart-preview') && doc.querySelector('.chart-preview').textContent.includes('1 year'), 'Roční náhled grafu');
    doc.querySelector('#open-chart').click();
    assert(!doc.querySelector('#chart-pane').hidden && doc.querySelector('#convert-pane').hidden, 'Samostatná obrazovka grafu');
    assert(doc.querySelector('#app').classList.contains('chart-mode'), 'Graf má výšku obrazovky');
    assert(doc.querySelector('#refresh').hidden && doc.querySelector('#rates-status').hidden, 'Graf nemá tlačítko aktualizace kurzů');
    doc.querySelector('#menu-toggle').click();
    doc.querySelector('#tab-settings').click();
    assert(!doc.querySelector('#settings-pane').hidden && doc.querySelector('#screen-title').textContent === 'Settings', 'Obrazovka nastavení');
    const sources = [...doc.querySelectorAll('#rate-source-controls input')];
    assert(sources.length === 3 && sources.every(input => input.checked), 'Tři aktivní zdroje kurzů');
    for (const input of sources.filter(input => input.value !== 'BitPay')) {
      input.checked = false; input.dispatchEvent(new Event('change', {bubbles:true}));
    }
    assert(sources.find(input => input.value === 'BitPay').disabled &&
      JSON.parse(localStorage.getItem(key)).rateSources.join(',') === 'BitPay', 'Poslední zdroj zůstává aktivní');
    assert(doc.querySelector('#source-last') && doc.querySelector('#settings-refresh'), 'Původ kurzu a ruční obnovení');
    for (const input of sources.filter(input => input.value !== 'BitPay')) {
      input.checked = true; input.dispatchEvent(new Event('change', {bubbles:true}));
    }
    const precision = doc.querySelector('#fiat-precision');
    assert(precision.value === 'auto', 'Výchozí automatická přesnost');
    precision.value = '2'; precision.dispatchEvent(new Event('change', {bubbles:true}));
    assert(JSON.parse(localStorage.getItem(key)).fiatPrecision === '2', 'Přesnost se ukládá');
    precision.value = 'auto'; precision.dispatchEvent(new Event('change', {bubbles:true}));
    const visibility = doc.querySelector('#show-chart-preview');
    assert(visibility.getAttribute('role') === 'switch' &&
      visibility.parentElement.querySelector('.switch-track') &&
      doc.querySelector('#chart-preview-state').textContent === 'On', 'Viditelný přepínač grafu');
    visibility.checked = false; visibility.dispatchEvent(new Event('change', {bubbles:true}));
    assert(doc.querySelector('#chart-preview-state').textContent === 'Off', 'Popisek vypnutého přepínače');
    const range = doc.querySelector('#chart-range');
    range.value = '3M'; range.dispatchEvent(new Event('change', {bubbles:true}));
    assert(JSON.parse(localStorage.getItem(key)).showChartPreview === false &&
      JSON.parse(localStorage.getItem(key)).chartRange === '3M', 'Uložení viditelnosti a období');
    range.value = 'MAX'; range.dispatchEvent(new Event('change', {bubbles:true}));
    assert(JSON.parse(localStorage.getItem(key)).chartRange === 'MAX', 'Uložení MAX');
    range.value = '3M'; range.dispatchEvent(new Event('change', {bubbles:true}));
    doc.querySelector('#menu-toggle').click();
    doc.querySelector('#tab-convert').click();
    assert(doc.querySelector('#chart-preview').hidden && doc.querySelector('#rates-status').hidden === false, 'Převodník bez malého grafu');
    doc.querySelector('#menu-toggle').click();
    doc.querySelector('#tab-chart').click();
    assert(!doc.querySelector('#chart-pane').hidden, 'Velký graf funguje i při vypnutém náhledu');
    doc.querySelector('#menu-toggle').click();
    doc.querySelector('#tab-settings').click();
    visibility.checked = true; visibility.dispatchEvent(new Event('change', {bubbles:true}));
    doc.querySelector('#menu-toggle').click();
    doc.querySelector('#tab-convert').click();
    assert(!doc.querySelector('#chart-preview').hidden && doc.querySelector('#chart-period').textContent.includes('3 months'), 'Znovuzapnutí náhledu a období');
  } finally {
    iframe.remove();
    if (previous === null) localStorage.removeItem(key);
    else localStorage.setItem(key, previous);
    if (previousAttempt === null) localStorage.removeItem(attemptKey);
    else localStorage.setItem(attemptKey, previousAttempt);
  }
});

document.querySelector('#summary').textContent = `${passed} úspěšných, ${failed} chyb.`;
if (failed) document.querySelector('#summary').className = 'fail';
