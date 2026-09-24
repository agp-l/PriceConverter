import {parseAmount, btcFrom, fromBtc, fetchRates, SOURCES} from './rates.js';
import {CURRENCIES, getCurrencies} from './currencies.js';
import {SUPPORTED_LANGUAGES, resolveLanguage, localeFor, t, ageText, sourceCount} from './i18n.js';
import {parsePercent, tradeQuote, travelQuote, compareTravelOffer} from './quotes.js';

const STORAGE_KEY = 'priceconverter:v1';
const RATE_ATTEMPT_KEY = 'priceconverter:last-rate-attempt';
const AUTO_REFRESH_MS = 60 * 60_000;
const MANUAL_REFRESH_MS = 60_000;
const DEFAULT_CURRENCIES = ['CZK', 'EUR', 'USD'];
const CHART_RANGES = ['1M', '3M', '12M', '60M', 'MAX'];
const FIAT_PRECISIONS = ['auto', '0', '2', '4'];
const RATE_SOURCE_NAMES = SOURCES.map(source => source.name);
const sameSources = (left, right) => left.length === right.length && left.every(name => right.includes(name));
const CURRENCY_CODES = new Set(CURRENCIES.map(currency => currency.code));
const currencyMinorUnits = new Map();
const isRate = value => typeof value === 'number' && Number.isFinite(value) && value > 0;
const searchable = value => value.toLocaleLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .replace(/ł/g, 'l').replace(/ø/g, 'o').replace(/ß/g, 'ss');

// Keep user-entered decimals and exact large integers; group only the whole-number part.
export function groupTypedAmount(raw) {
  const match = /^(\d[\d\s\u00a0\u202f]*)([,.]\d*)?$/.exec(raw);
  if (!match) return raw;
  const integer = match[1].replace(/[\s\u00a0\u202f]/g, '');
  if (integer.length > 1 && integer.startsWith('0')) return raw;
  return integer.replace(/\B(?=(\d{3})+(?!\d))/g, '\u00a0') + (match[2] || '');
}

function groupAmountInput(input) {
  const raw = input.value;
  const grouped = groupTypedAmount(raw);
  if (grouped === raw) return;
  const caret = input.selectionStart;
  const before = caret === null ? null : raw.slice(0, caret).replace(/[\s\u00a0\u202f]/g, '').length;
  input.value = grouped;
  if (before === null) return;
  let position = 0;
  let count = 0;
  while (position < grouped.length && count < before) {
    if (!/[\s\u00a0\u202f]/.test(grouped[position])) count++;
    position++;
  }
  if (caret === raw.length) position = grouped.length;
  input.setSelectionRange(position, position);
}
const savedPercent = (value, fallback) => typeof value === 'number' && Number.isFinite(value) && value > -100 && value < 100 ? value : fallback;
const savedCurrency = (value, fallback) => CURRENCY_CODES.has(value) ? value : fallback;

function minorUnits(code) {
  if (!currencyMinorUnits.has(code)) {
    let digits = 2;
    try { digits = new Intl.NumberFormat('en', {style:'currency', currency:code}).resolvedOptions().maximumFractionDigits; }
    catch { /* Unknown currency: use two decimal places. */ }
    currencyMinorUnits.set(code, digits);
  }
  return currencyMinorUnits.get(code);
}

// Presentation only. Keep calculations and edited source amounts at full precision.
export function formatConvertedFiat(value, code, language = 'cs', precision = 'auto') {
  if (value === null || !Number.isFinite(value)) return '';
  const abs = Math.abs(value);
  const minor = minorUnits(code);
  let digits = precision === 'auto'
    ? code === 'CZK' && abs >= 100 ? 0 : abs >= 1 || abs === 0 ? minor
      : Math.min(12, Math.max(minor, 2 - Math.floor(Math.log10(abs))))
    : FIAT_PRECISIONS.includes(precision) ? Number(precision) : 2;
  // Even in whole-number mode a small, nonzero amount must not look like zero.
  if (abs > 0 && abs < 0.5 * 10 ** -digits)
    digits = Math.max(digits, Math.min(12, 2 - Math.floor(Math.log10(abs))));
  return new Intl.NumberFormat(localeFor(language),
    {maximumFractionDigits:digits}).format(value);
}

export function shouldRefreshRates(cache, lastAttempt, now = Date.now(), manual = false, selectedSources = RATE_SOURCE_NAMES) {
  if (Number.isFinite(lastAttempt) && lastAttempt > 0 && now - lastAttempt < (manual ? MANUAL_REFRESH_MS : AUTO_REFRESH_MS)) return false;
  return manual || !cache || !Number.isFinite(cache.updatedAt) || now - cache.updatedAt >= AUTO_REFRESH_MS ||
    !sameSources(cache.selectedSources || RATE_SOURCE_NAMES, selectedSources);
}

// A quote is written from the owner's perspective, addressed to the other party.
// Do not expose the owner's margin or market comparison in the shared offer.
export function formatTradeOffer(quote, {currency, unit = 'BTC', language = 'cs',
  generatedAt = new Date(), referenceUpdatedAt = null} = {}) {
  const locale = localeFor(language);
  const number = new Intl.NumberFormat(locale, {maximumFractionDigits:8});
  const btc = unit === 'SATS'
    ? `${number.format(quote.sats)} sats (${quote.btc.toFixed(8)} BTC)`
    : `${quote.btc.toFixed(8)} BTC`;
  const fiat = `${number.format(quote.fiat)} ${currency}`;
  const price = `${number.format(quote.offeredRate)} ${currency}`;
  const lines = [t(language, 'shareTradeTitle'),
    t(language, quote.side === 'buy' ? 'shareTradeBuy' : 'shareTradeSell', {btc, fiat}),
    t(language, 'shareTradePrice', {price}),
    t(language, 'shareTradeDate', {date:generatedAt.toLocaleString(locale)})];
  if (referenceUpdatedAt) lines.push(t(language, 'shareTradeRateDate',
    {date:new Date(referenceUpdatedAt).toLocaleString(locale)}));
  return lines.join('\n');
}

// Keep one storage format across releases. Discard malformed fields individually.
export function restoreSettings(json) {
  let saved;
  try { saved = JSON.parse(json || '{}'); } catch { saved = {}; }
  if (!saved || typeof saved !== 'object' || Array.isArray(saved)) saved = {};
  const selected = Array.isArray(saved.selected)
    ? [...new Set(saved.selected.filter(code => typeof code === 'string' && CURRENCY_CODES.has(code)))]
    : DEFAULT_CURRENCIES.slice();
  const rateSources = Array.isArray(saved.rateSources)
    ? RATE_SOURCE_NAMES.filter(name => saved.rateSources.includes(name)) : RATE_SOURCE_NAMES.slice();
  if (!rateSources.length) rateSources.push(...RATE_SOURCE_NAMES);
  const storedCache = saved.cache;
  let cache = null;
  if (storedCache && typeof storedCache === 'object' && !Array.isArray(storedCache) &&
      Number.isFinite(storedCache.updatedAt) && storedCache.updatedAt > 0 && storedCache.updatedAt <= Date.now() &&
      storedCache.rates && typeof storedCache.rates === 'object' && !Array.isArray(storedCache.rates) &&
      Array.isArray(storedCache.sources)) {
    const rates = Object.fromEntries(Object.entries(storedCache.rates).filter(([code, value]) => CURRENCY_CODES.has(code) && isRate(value)));
    const sources = storedCache.sources.filter(name => typeof name === 'string' && name.length < 80);
    if (Object.keys(rates).length && sources.length) {
      const selectedSources = Array.isArray(storedCache.selectedSources)
        ? RATE_SOURCE_NAMES.filter(name => storedCache.selectedSources.includes(name)) : RATE_SOURCE_NAMES.slice();
      const excluded = Array.isArray(storedCache.excluded) ? storedCache.excluded.filter(item =>
        item && RATE_SOURCE_NAMES.includes(item.source) && CURRENCY_CODES.has(item.code)) : [];
      const conflicts = Array.isArray(storedCache.conflicts)
        ? [...new Set(storedCache.conflicts.filter(code => CURRENCY_CODES.has(code)))] : [];
      cache = {rates, sources, selectedSources:selectedSources.length ? selectedSources : RATE_SOURCE_NAMES.slice(),
        excluded:excluded.slice(0, CURRENCIES.length * RATE_SOURCE_NAMES.length),
        conflicts:conflicts.slice(0, CURRENCIES.length), updatedAt:storedCache.updatedAt};
    }
  }
  // Older versions saved signed buy/sell adjustments. Keep the active side's
  // price when migrating: buying below market used a negative adjustment.
  const legacyMargin = saved.dealerSide === 'sell' ? saved.sellPercent : -saved.buyPercent;
  const marginPercent = savedPercent(saved.marginPercent, savedPercent(legacyMargin, 2));
  return {selected, rateSources, unit:saved.unit === 'SATS' ? 'SATS' : 'BTC', cache,
    languageMode:SUPPORTED_LANGUAGES.includes(saved.languageMode) ? saved.languageMode : 'auto',
    mode:['convert', 'travel', 'trade', 'chart', 'settings'].includes(saved.mode) ? saved.mode : 'convert',
    showChartPreview:saved.showChartPreview !== false,
    chartRange:CHART_RANGES.includes(saved.chartRange) ? saved.chartRange : '12M',
    fiatPrecision:FIAT_PRECISIONS.includes(saved.fiatPrecision) ? saved.fiatPrecision : 'auto',
    tradeCurrency:savedCurrency(saved.tradeCurrency, 'CZK'),
    marginPercent,
    // Earlier releases persisted the default buy side without a user choice.
    dealerSide:saved.dealerSide === 'buy' && saved.dealerSideChosen === true ? 'buy' : 'sell',
    dealerSideChosen:saved.dealerSideChosen === true,
    dealerKind:saved.dealerKind === 'bitcoin' ? 'bitcoin' : 'fiat',
    travelFrom:savedCurrency(saved.travelFrom, 'CZK'), travelTo:savedCurrency(saved.travelTo, 'EUR')};
}

export class ConverterApp {
  constructor(doc = document, win = window) {
    this.doc = doc;
    this.win = win;
    this.elements = Object.fromEntries(Object.entries({
      app:'app', btc:'btc-input', unit:'btc-unit', btcButton:'unit-btc', satsButton:'unit-sats',
      list:'currency-list', count:'currency-count', sort:'sort-currencies', sortHint:'sort-hint',
      status:'status-text', dot:'status-dot', refresh:'refresh', ratesStatus:'rates-status',
      language:'language-switch', add:'add-currency', dialog:'currency-dialog', close:'close-dialog',
      search:'currency-search', options:'currency-options', install:'install-button',
      menu:'app-menu', menuToggle:'menu-toggle', menuClose:'menu-close', screenTitle:'screen-title',
      donateOpen:'donate-button', donateDialog:'donate-dialog', donateClose:'close-donate',
      donateBtc:'donate-btc', donateLightning:'donate-lightning', copyBtc:'copy-btc',
      copyLightning:'copy-lightning', copyStatus:'copy-status',
      installDialog:'install-dialog', installClose:'close-install', installInstructions:'install-instructions',
      tabConvert:'tab-convert', tabTravel:'tab-travel', tabTrade:'tab-trade',
      tabChart:'tab-chart', tabSettings:'tab-settings',
      paneConvert:'convert-pane', paneTravel:'travel-pane', paneTrade:'trade-pane',
      paneChart:'chart-pane', paneSettings:'settings-pane',
      travelAmount:'travel-amount', travelFrom:'travel-from', travelTo:'travel-to', travelSwap:'travel-swap',
      travelValue:'travel-value', travelRate:'travel-rate',
      travelOfferBasis:'travel-offer-basis', travelOfferRate:'travel-offer-rate', travelFee:'travel-fee',
      travelOfferRateLabel:'travel-offer-rate-label', travelFeeLabel:'travel-fee-label',
      travelComparison:'travel-comparison', travelOfferValue:'travel-offer-value',
      travelDifference:'travel-difference', travelPercent:'travel-percent',
      travelSourceEquivalent:'travel-source-equivalent', travelOfferError:'travel-offer-error',
      chartPreview:'chart-preview', chartPeriod:'chart-period', chartVisibility:'show-chart-preview',
      chartPreviewState:'chart-preview-state', fiatPrecision:'fiat-precision',
      rateSourceControls:'rate-source-controls', sourceLast:'source-last',
      sourceSelectionStatus:'source-selection-status', rateWarnings:'rate-warnings', settingsRefresh:'settings-refresh',
      chartRange:'chart-range', miniChart:'mini-chart', miniChartFallback:'mini-chart-fallback', openChart:'open-chart',
      largeChart:'large-chart',
      largeChartFallback:'large-chart-fallback',
      dealerBuy:'dealer-buy', dealerSell:'dealer-sell',
      dealerCurrency:'dealer-currency', marginPercent:'margin-percent', marginPreview:'margin-preview',
      tradeShare:'trade-share', tradeCopy:'trade-copy', tradeShareStatus:'trade-share-status',
      tradeCopyDialog:'trade-copy-dialog', tradeCopyText:'trade-copy-text', tradeCopyClose:'trade-copy-close',
      marketSource:'market-source', marketTools:'market-tools', manualMarketWrap:'manual-market-wrap',
      manualMarket:'manual-market', marketSourceHint:'market-source-hint',
      dealerKind:'dealer-amount-kind', dealerUnit:'dealer-unit', dealerAmount:'dealer-amount',
      offerFiatLabel:'offer-fiat-label', offerBtcLabel:'offer-btc-label', offerFiat:'offer-fiat',
      offerBtc:'offer-btc', offerMarket:'offer-market', offerMarketLabel:'offer-market-label', offerPrice:'offer-price',
      offerDifference:'offer-difference', offerDifferenceLabel:'offer-difference-label', tradeValidation:'trade-validation'
    }).map(([name, id]) => [name, doc.getElementById(id)]));
    let json, lastRateAttempt;
    try {
      json = win.localStorage.getItem(STORAGE_KEY);
      lastRateAttempt = Number(win.localStorage.getItem(RATE_ATTEMPT_KEY));
    } catch { /* Private browsing. */ }
    this.lastRateAttempt = Number.isFinite(lastRateAttempt) && lastRateAttempt > 0 && lastRateAttempt <= Date.now()
      ? lastRateAttempt : 0;
    const stored = restoreSettings(json);
    this.deviceLanguages = win.navigator.languages?.length ? win.navigator.languages : [win.navigator.language];
    this.state = {...stored, language:resolveLanguage(stored.languageMode, this.deviceLanguages),
      anchor:'BTC', raw:'1', btc:stored.unit === 'SATS' ? 1e-8 : 1, busy:false,
      error:!stored.cache && this.lastRateAttempt > 0};
    this.currencies = new Map();
    this.installPrompt = null;
    this.sorting = false;
    this.setFormatters();
    this.tradeFiatRaw = '10000';
    this.tradeBitcoinRaw = stored.unit === 'SATS' ? '1000000' : '0.01';
    this.marketSource = 'live';
    this.miniChartLoaded = false;
    this.largeChartLoaded = false;
    this.miniChartRange = null;
    this.largeChartRange = null;
  }

  tr(key, parameters) { return t(this.state.language, key, parameters); }

  save() {
    const {selected, rateSources, unit, cache, languageMode, mode, showChartPreview, chartRange, fiatPrecision, tradeCurrency, marginPercent,
      dealerSide, dealerSideChosen, dealerKind, travelFrom, travelTo} = this.state;
    try { this.win.localStorage.setItem(STORAGE_KEY, JSON.stringify({selected, rateSources, unit, cache, languageMode,
      mode, showChartPreview, chartRange, fiatPrecision, tradeCurrency, marginPercent, dealerSide, dealerSideChosen,
      dealerKind, travelFrom, travelTo})); }
    catch { /* Conversion remains available without local storage. */ }
  }

  setFormatters() {
    const locale = localeFor(this.state.language);
    this.formatters = {
      btc:new Intl.NumberFormat(locale, {maximumFractionDigits:8}),
      sats:new Intl.NumberFormat(locale, {maximumFractionDigits:3}),
      fiat:new Intl.NumberFormat(locale, {maximumFractionDigits:3})
    };
  }

  format(value, code) {
    if (value === null || !Number.isFinite(value)) return '';
    return this.formatters[code === 'BTC' ? this.state.unit === 'SATS' ? 'sats' : 'btc' : 'fiat'].format(value);
  }

  formatEntry(value, raw, code) {
    const fraction = raw.trim().replace(/[\s\u00a0\u202f]/g, '').match(/[,.](\d+)$/)?.[1].length || 0;
    const digits = Math.min(15, Math.max(code === 'BTC' ? 8 : 3, fraction));
    return new Intl.NumberFormat(localeFor(this.state.language),
      {maximumFractionDigits:digits}).format(value);
  }

  hasRate(code) { return isRate(this.state.cache?.rates?.[code]); }

  updateValues() {
    const {state, elements} = this;
    if (state.anchor !== 'BTC') elements.btc.value = this.format(fromBtc(state.btc, 'BTC', {}, state.unit), 'BTC');
    for (const input of elements.list.querySelectorAll('input[data-code]')) {
      const code = input.dataset.code;
      input.disabled = !this.hasRate(code);
      input.placeholder = input.disabled ? this.tr('noRate') : '';
      input.title = input.disabled ? this.tr('missingRate', {code}) : '';
      if (state.anchor !== code) input.value = formatConvertedFiat(
        fromBtc(state.btc, code, state.cache?.rates || {}), code, state.language, state.fiatPrecision);
    }
  }

  recalculate(code, raw) {
    this.state.anchor = code;
    this.state.raw = raw;
    const amount = parseAmount(raw, this.state.language);
    this.state.btc = amount === null ? null : btcFrom(amount, code, this.state.cache?.rates || {}, this.state.unit);
    this.updateValues();
  }

  renderRows() {
    const {state, elements} = this;
    elements.list.replaceChildren();
    elements.count.textContent = String(state.selected.length);
    elements.sort.hidden = state.selected.length < 2 && !this.sorting;
    elements.sort.textContent = this.tr(this.sorting ? 'sortDone' : 'sortCurrencies');
    elements.sort.setAttribute('aria-pressed', String(this.sorting));
    elements.sortHint.hidden = !this.sorting;
    if (!state.selected.length) {
      const empty = this.doc.createElement('p');
      empty.className = 'empty-state'; empty.textContent = this.tr('emptyState');
      elements.list.append(empty);
    }
    for (const code of state.selected) {
      const currency = this.currencies.get(code);
      const row = this.doc.createElement('div'); row.className = 'currency-row';
      row.dataset.code = code;
      row.classList.toggle('sorting', this.sorting);
      const icon = this.doc.createElement('span'); icon.className = 'currency-icon'; icon.setAttribute('aria-hidden', 'true'); icon.textContent = currency.flag;
      const info = this.doc.createElement('div'); info.className = 'currency-info';
      const label = this.doc.createElement('strong'); label.className = 'currency-code'; label.textContent = code;
      const name = this.doc.createElement('span'); name.className = 'currency-name'; name.textContent = currency.name;
      info.append(label, name);
      const value = this.doc.createElement('div'); value.className = 'currency-value';
      const input = this.doc.createElement('input'); input.type = 'text'; input.inputMode = 'decimal'; input.setAttribute('enterkeyhint', 'done'); input.autocomplete = 'off'; input.spellcheck = false;
      input.dataset.code = code; input.setAttribute('aria-label', this.tr('amountIn', {name:currency.name}));
      input.addEventListener('input', event => {
        if (!event.isComposing) groupAmountInput(input);
        this.recalculate(code, input.value);
      });
      input.addEventListener('focus', () => input.select());
      value.append(input);
      const remove = this.doc.createElement('button'); remove.type = 'button'; remove.className = 'remove-button'; remove.textContent = '×';
      remove.title = this.tr('remove', {name:currency.name}); remove.setAttribute('aria-label', remove.title);
      remove.addEventListener('click', () => this.removeCurrency(code));
      const position = state.selected.indexOf(code);
      const controls = this.doc.createElement('div'); controls.className = 'sort-controls';
      for (const [direction, symbol] of [[-1, '↑'], [1, '↓']]) {
        const button = this.doc.createElement('button');
        button.type = 'button'; button.className = direction < 0 ? 'sort-up' : 'sort-down';
        button.textContent = symbol;
        button.setAttribute('aria-label', this.tr(direction < 0 ? 'moveUp' : 'moveDown', {code}));
        button.disabled = direction < 0 ? position === 0 : position === state.selected.length - 1;
        button.addEventListener('click', () => this.moveCurrency(code, direction));
        controls.append(button);
      }
      row.append(icon, info, value, remove, controls); elements.list.append(row);
    }
    this.updateValues();
    if (state.anchor !== 'BTC') {
      const input = [...elements.list.querySelectorAll('input[data-code]')].find(item => item.dataset.code === state.anchor);
      if (input) input.value = state.raw;
    }
  }

  moveCurrency(code, direction) {
    const {selected} = this.state;
    const position = selected.indexOf(code);
    const next = position + direction;
    if (!this.sorting || position < 0 || next < 0 || next >= selected.length) return;
    [selected[position], selected[next]] = [selected[next], selected[position]];
    this.save(); this.renderRows();
    const row = [...this.elements.list.querySelectorAll('.currency-row')].find(item => item.dataset.code === code);
    row?.querySelector(direction < 0 ? '.sort-up:not(:disabled),.sort-down' : '.sort-down:not(:disabled),.sort-up')?.focus();
  }

  removeCurrency(code) {
    const {state, elements} = this;
    if (state.anchor === code) {
      state.anchor = 'BTC';
      state.raw = this.format(fromBtc(state.btc, 'BTC', {}, state.unit), 'BTC');
      elements.btc.value = state.raw;
    }
    state.selected = state.selected.filter(item => item !== code);
    this.save(); this.renderRows(); this.renderOptions();
  }

  renderOptions() {
    const {state, elements} = this;
    elements.options.replaceChildren();
    const query = searchable(elements.search.value.trim());
    const matches = [...this.currencies.values()].filter(item => !state.selected.includes(item.code) && searchable(`${item.code} ${item.name}`).includes(query));
    if (!matches.length) {
      const empty = this.doc.createElement('p'); empty.className = 'option-empty'; empty.textContent = this.tr('noMatches');
      elements.options.append(empty);
    }
    for (const currency of matches) {
      const option = this.doc.createElement('button'); option.type = 'button'; option.className = 'option-button';
      const icon = this.doc.createElement('span'); icon.className = 'currency-icon'; icon.textContent = currency.flag; icon.setAttribute('aria-hidden', 'true');
      const copy = this.doc.createElement('span'); const code = this.doc.createElement('strong'); code.textContent = currency.code;
      const name = this.doc.createElement('small'); name.textContent = state.cache && !this.hasRate(currency.code) ? `${currency.name} · ${this.tr('noRateShort')}` : currency.name;
      copy.append(code, name);
      const plus = this.doc.createElement('span'); plus.className = 'option-plus'; plus.textContent = '+'; plus.setAttribute('aria-hidden', 'true');
      option.append(icon, copy, plus);
      option.addEventListener('click', () => {
        state.selected.push(currency.code);
        this.save(); this.renderRows(); elements.dialog.close(); elements.search.value = ''; this.renderOptions();
      });
      elements.options.append(option);
    }
  }

  renderCurrencySelects() {
    for (const [element, current] of [
      [this.elements.dealerCurrency, this.state.tradeCurrency],
      [this.elements.travelFrom, this.state.travelFrom],
      [this.elements.travelTo, this.state.travelTo]
    ]) {
      element.replaceChildren();
      for (const currency of this.currencies.values()) {
        const option = this.doc.createElement('option');
        option.value = currency.code; option.textContent = `${currency.code} · ${currency.name}`;
        element.append(option);
      }
      element.value = current;
    }
  }

  syncChartSettings() {
    const {state, elements} = this;
    elements.chartVisibility.checked = state.showChartPreview;
    elements.chartPreviewState.textContent = this.tr(state.showChartPreview ? 'switchOn' : 'switchOff');
    elements.chartRange.value = state.chartRange;
    elements.chartPeriod.textContent = this.tr('chartPeriod',
      {period:this.tr({ '1M':'chartMonth', '3M':'chartQuarter', '12M':'chartYear',
        '60M':'chartFiveYears', MAX:'chartMax' }[state.chartRange])});
    elements.chartPreview.hidden = !state.showChartPreview;
    if (!state.showChartPreview && this.miniChartLoaded) {
      this.resetChart(elements.miniChart);
      this.miniChartLoaded = false;
      this.miniChartRange = null;
    }
  }

  syncSourceSettings() {
    const {state, elements} = this;
    for (const input of elements.rateSourceControls.querySelectorAll('input')) {
      input.checked = state.rateSources.includes(input.value);
      input.disabled = input.checked && state.rateSources.length === 1;
    }
    elements.sourceLast.textContent = state.cache
      ? this.tr('sourcesLast', {sources:state.cache.sources.join(', ')}) : this.tr('sourcesNotLoaded');
    elements.sourceSelectionStatus.textContent = state.cache &&
      !sameSources(state.cache.selectedSources || RATE_SOURCE_NAMES, state.rateSources)
      ? this.tr('sourcesPending') : this.tr('sourcesNextRefresh');
    const excluded = state.cache?.excluded || [];
    const conflicts = state.cache?.conflicts || [];
    const details = excluded.slice(0, 4).map(item => `${item.source} (${item.code})`).join(', ');
    const codes = conflicts.slice(0, 6).join(', ');
    elements.rateWarnings.textContent = [
      excluded.length ? this.tr('sourcesExcluded', {details:`${details}${excluded.length > 4 ? ` … +${excluded.length - 4}` : ''}`}) : '',
      conflicts.length ? this.tr('sourcesConflict', {codes:`${codes}${conflicts.length > 6 ? ` … +${conflicts.length - 6}` : ''}`}) : ''
    ].filter(Boolean).join(' ');
    elements.rateWarnings.hidden = !excluded.length && !conflicts.length;
  }

  resetChart(container) {
    const widget = this.doc.createElement('div');
    widget.className = 'tradingview-widget-container__widget';
    container.replaceChildren(widget);
  }

  setMode(mode) {
    this.state.mode = ['convert', 'travel', 'trade', 'chart', 'settings'].includes(mode) ? mode : 'convert';
    this.elements.app.classList.toggle('chart-mode', this.state.mode === 'chart');
    for (const [name, pane, button, title] of [
      ['convert', this.elements.paneConvert, this.elements.tabConvert, 'converterTab'],
      ['travel', this.elements.paneTravel, this.elements.tabTravel, 'travelHeading'],
      ['trade', this.elements.paneTrade, this.elements.tabTrade, 'tradeTab'],
      ['chart', this.elements.paneChart, this.elements.tabChart, 'chartTab'],
      ['settings', this.elements.paneSettings, this.elements.tabSettings, 'settingsTab']
    ]) {
      const selected = this.state.mode === name;
      pane.hidden = !selected;
      if (selected) button.setAttribute('aria-current', 'page');
      else button.removeAttribute('aria-current');
      if (selected) this.elements.screenTitle.textContent = this.tr(title);
    }
    this.elements.ratesStatus.hidden = ['chart', 'settings'].includes(this.state.mode);
    this.elements.refresh.hidden = this.elements.ratesStatus.hidden;
    if (this.state.mode !== 'chart' && this.largeChartLoaded) {
      this.resetChart(this.elements.largeChart);
      this.largeChartLoaded = false;
    }
    if (this.doc.readyState === 'complete') {
      if (this.state.mode === 'convert') this.loadMiniChart();
      if (this.state.mode === 'chart') this.loadLargeChart();
    }
    this.save();
  }

  renderTravel() {
    const {state, elements} = this;
    const amount = parseAmount(elements.travelAmount.value, state.language);
    const quote = travelQuote(amount, state.travelFrom, state.travelTo, state.cache?.rates);
    const locale = localeFor(state.language);
    const number = new Intl.NumberFormat(locale, {maximumFractionDigits:8});
    const codes = {from:state.travelFrom, to:state.travelTo};
    elements.travelOfferBasis.options[0].textContent = this.tr('quoteForFrom', codes);
    elements.travelOfferBasis.options[1].textContent = this.tr('quoteForTo', codes);
    elements.travelOfferRateLabel.textContent = this.tr('exchangeRateValue', {
      code:elements.travelOfferBasis.value === 'from' ? state.travelTo : state.travelFrom});
    elements.travelFeeLabel.textContent = this.tr('exchangeFee', {code:state.travelFrom});
    elements.travelValue.textContent = quote
      ? `${number.format(quote.result)} ${state.travelTo}` : '—';
    elements.travelRate.textContent = quote
      ? this.tr('travelRate', {from:state.travelFrom, to:state.travelTo,
        rate:new Intl.NumberFormat(locale, {maximumSignificantDigits:8}).format(quote.rate)})
      : this.tr(amount === null ? 'invalidAmount' : 'noRate');
    const rateRaw = elements.travelOfferRate.value.trim();
    const feeRaw = elements.travelFee.value.trim();
    const offeredRate = parseAmount(rateRaw, state.language);
    const fee = feeRaw ? parseAmount(feeRaw, state.language) : 0;
    const comparison = rateRaw && quote && offeredRate !== null && fee !== null
      ? compareTravelOffer(amount, state.travelFrom, state.travelTo, state.cache?.rates,
        offeredRate, elements.travelOfferBasis.value, fee) : null;
    elements.travelComparison.hidden = !comparison;
    elements.travelOfferError.hidden = !rateRaw || Boolean(comparison);
    if (rateRaw && !comparison) elements.travelOfferError.textContent = !quote ? this.tr('compareMissingRate')
      : !offeredRate ? this.tr('invalidOfferRate') : fee === null || fee > amount
        ? this.tr('invalidExchangeFee') : this.tr('invalidOfferRate');
    if (!comparison) return;
    const {received, difference, sourceDifference, percent} = comparison;
    const direction = Math.abs(percent) < 1e-9 ? 'even' : difference < 0 ? 'loss' : 'gain';
    elements.travelComparison.dataset.result = direction;
    elements.travelOfferValue.textContent = `${number.format(received)} ${state.travelTo}`;
    elements.travelDifference.textContent = this.tr(direction === 'loss' ? 'exchangeLoss'
      : direction === 'gain' ? 'exchangeGain' : 'exchangeEven',
    {amount:`${number.format(Math.abs(difference))} ${state.travelTo}`});
    elements.travelPercent.textContent = `${difference > 0 ? '+' : difference < 0 ? '−' : ''}${new Intl.NumberFormat(locale,
      {maximumFractionDigits:2}).format(Math.abs(percent))} %`;
    elements.travelSourceEquivalent.textContent = this.tr('exchangeEquivalent',
      {amount:`${number.format(Math.abs(sourceDifference))} ${state.travelFrom}`});
  }

  embedChart(container, fallback, filename, config) {
    if (!this.win.navigator.onLine) {
      container.hidden = true;
      fallback.hidden = false;
      return false;
    }
    container.hidden = false;
    fallback.hidden = true;
    const script = this.doc.createElement('script');
    script.src = `https://s3.tradingview.com/external-embedding/${filename}`;
    script.async = true;
    script.textContent = JSON.stringify(config);
    script.addEventListener('error', () => {
      if (!script.isConnected) return;
      this.resetChart(container);
      container.hidden = true; fallback.hidden = false;
      if (container === this.elements.miniChart) this.miniChartLoaded = false;
      else this.largeChartLoaded = false;
    }, {once:true});
    container.append(script);
    return true;
  }

  loadMiniChart() {
    const {miniChart, miniChartFallback} = this.elements;
    if (!this.state.showChartPreview || this.state.mode !== 'convert') return;
    if (this.miniChartLoaded && this.miniChartRange !== this.state.chartRange) {
      this.resetChart(miniChart);
      this.miniChartLoaded = false;
    }
    if (this.miniChartLoaded) {
      miniChart.hidden = !this.win.navigator.onLine;
      miniChartFallback.hidden = this.win.navigator.onLine;
      return;
    }
    this.miniChartLoaded = this.embedChart(miniChart, miniChartFallback,
      'embed-widget-mini-symbol-overview.js', {
        symbol:'BITSTAMP:BTCUSD', width:'100%', height:'100%', locale:'en',
        dateRange:this.state.chartRange === 'MAX' ? 'ALL' : this.state.chartRange,
        colorTheme:'light', chartOnly:true, noTimeScale:true,
        isTransparent:true, autosize:true, trendLineColor:'rgba(110, 52, 168, 1)',
        underLineColor:'rgba(157, 103, 205, 0.22)', underLineBottomColor:'rgba(157, 103, 205, 0)'
      });
    if (this.miniChartLoaded) this.miniChartRange = this.state.chartRange;
  }

  loadLargeChart() {
    const {largeChart, largeChartFallback} = this.elements;
    if (this.state.mode !== 'chart') return;
    if (this.largeChartLoaded && this.largeChartRange !== this.state.chartRange) {
      this.resetChart(largeChart);
      this.largeChartLoaded = false;
    }
    if (this.largeChartLoaded) {
      largeChart.hidden = !this.win.navigator.onLine;
      largeChartFallback.hidden = this.win.navigator.onLine;
      return;
    }
    this.largeChartLoaded = this.embedChart(largeChart, largeChartFallback,
      'embed-widget-advanced-chart.js', {
        autosize:true, symbol:'BITSTAMP:BTCUSD',
        interval:this.state.chartRange === 'MAX' ? 'M' : ['12M', '60M'].includes(this.state.chartRange) ? 'W' : 'D',
        ...(this.state.chartRange === 'MAX' ? {} : {range:this.state.chartRange}),
        timeframe:this.state.chartRange === 'MAX'
          ? {from:Date.UTC(2009, 0, 3) / 1000, to:Math.floor(Date.now() / 1000)} : this.state.chartRange,
        timezone:'Etc/UTC', theme:'light', style:'1', locale:'en',
        backgroundColor:'#faf8ff', gridColor:'rgba(57, 32, 101, 0.08)',
        hide_side_toolbar:true, allow_symbol_change:false, withdateranges:true,
        save_image:false
      });
    if (this.largeChartLoaded) this.largeChartRange = this.state.chartRange;
  }

  renderTrade() {
    const {state, elements} = this;
    const buying = state.dealerSide === 'buy';
    elements.dealerBuy.classList.toggle('selected', buying);
    elements.dealerSell.classList.toggle('selected', !buying);
    elements.dealerBuy.setAttribute('aria-pressed', String(buying));
    elements.dealerSell.setAttribute('aria-pressed', String(!buying));
    elements.offerFiatLabel.textContent = this.tr(buying ? 'fiatPaid' : 'fiatReceived');
    elements.offerBtcLabel.textContent = this.tr(buying ? 'btcReceived' : 'btcDelivered');
    const manual = this.marketSource === 'manual';
    elements.marketSource.value = this.marketSource;
    elements.manualMarketWrap.hidden = !manual;
    elements.marketTools.classList.toggle('manual-active', manual);
    elements.marketSourceHint.hidden = !manual;
    if (manual) elements.marketSourceHint.textContent = this.tr('manualMarketHint');
    const amount = parseAmount(elements.dealerAmount.value, state.language);
    const marginPercent = parsePercent(elements.marginPercent.value, state.language);
    const percentText = marginPercent === null ? '' : new Intl.NumberFormat(localeFor(state.language),
      {maximumFractionDigits:4, useGrouping:false}).format(Math.abs(marginPercent));
    const previewKey = marginPercent === null ? 'marginInvalid' : marginPercent === 0 ? 'marginZero'
      : marginPercent > 0 ? buying ? 'marginBuyFavorable' : 'marginSellFavorable'
        : buying ? 'marginBuyUnfavorable' : 'marginSellUnfavorable';
    elements.marginPreview.textContent = this.tr(previewKey, {percent:percentText});
    elements.marginPreview.classList.toggle('unfavorable', marginPercent !== null && marginPercent < 0);
    const marketRate = manual ? parseAmount(elements.manualMarket.value, state.language) : state.cache?.rates?.[state.tradeCurrency];
    const quote = amount === null || marginPercent === null ? null : tradeQuote({marketRate, marginPercent,
      side:state.dealerSide, amount, amountKind:state.dealerKind, unit:state.unit});
    this.currentTradeQuote = quote;
    elements.tradeShare.disabled = elements.tradeCopy.disabled = !quote || quote.sats === 0 || quote.fiat === 0;
    elements.tradeShareStatus.textContent = '';
    const fiat = number => `${this.format(number, state.tradeCurrency)} ${state.tradeCurrency}`;
    elements.offerFiat.textContent = quote ? fiat(quote.fiat) : '—';
    elements.offerBtc.textContent = quote ? state.unit === 'SATS'
      ? `${this.format(quote.sats, 'BTC')} sats` : `${this.format(quote.btc, 'BTC')} BTC` : '—';
    elements.offerMarket.textContent = isRate(marketRate) ? fiat(marketRate) : '—';
    elements.offerMarketLabel.textContent = this.tr(manual ? 'referencePrice' : 'marketPrice');
    elements.offerDifferenceLabel.textContent = this.tr(manual ? 'referenceDifference' : 'marketDifference');
    elements.offerPrice.textContent = quote ? fiat(quote.offeredRate) : '—';
    elements.offerDifference.textContent = quote ? `${quote.difference > 0 ? '+' : ''}${fiat(quote.difference)}` : '—';
    elements.tradeValidation.textContent = !isRate(marketRate) ? this.tr(manual ? 'invalidMarketRate' : 'tradeNoRate', {currency:state.tradeCurrency})
      : amount === null ? this.tr('invalidAmount') : marginPercent === null ? this.tr('invalidPercent')
      : !quote ? this.tr('invalidTrade') : '';
  }

  changeDealerKind(kind) {
    if (this.state.dealerKind === kind) return;
    if (this.state.dealerKind === 'fiat') this.tradeFiatRaw = this.elements.dealerAmount.value;
    else this.tradeBitcoinRaw = this.elements.dealerAmount.value;
    this.state.dealerKind = kind;
    this.elements.dealerAmount.value = kind === 'fiat' ? this.tradeFiatRaw : this.tradeBitcoinRaw;
    this.save(); this.renderTrade();
  }

  syncUnit() {
    const {state, elements} = this;
    elements.unit.textContent = state.unit;
    for (const [button, active] of [[elements.btcButton, state.unit === 'BTC'], [elements.satsButton, state.unit === 'SATS']]) {
      button.classList.toggle('selected', active); button.setAttribute('aria-pressed', String(active));
    }
  }

  setUnit(unit) {
    if (unit === this.state.unit) return;
    const oldBitcoinAmount = parseAmount(this.tradeBitcoinRaw, this.state.language);
    const oldUnit = this.state.unit;
    this.state.unit = unit;
    this.syncUnit();
    if (this.state.anchor === 'BTC') {
      this.state.raw = this.format(fromBtc(this.state.btc, 'BTC', {}, unit), 'BTC');
      this.elements.btc.value = this.state.raw;
    }
    if (oldBitcoinAmount !== null) {
      const converted = oldUnit === 'BTC' ? oldBitcoinAmount * 1e8 : oldBitcoinAmount / 1e8;
      this.tradeBitcoinRaw = this.formatEntry(converted, this.tradeBitcoinRaw, 'BTC');
      if (this.state.dealerKind === 'bitcoin') this.elements.dealerAmount.value = this.tradeBitcoinRaw;
    }
    this.elements.dealerUnit.value = unit;
    this.save(); this.updateValues(); this.renderTrade();
  }

  showStatus() {
    const {state, elements} = this;
    const waitMs = Math.max(0, MANUAL_REFRESH_MS - (Date.now() - this.lastRateAttempt));
    const online = this.win.navigator.onLine;
    elements.refresh.disabled = elements.settingsRefresh.disabled = state.busy || waitMs > 0 || !online;
    const refreshTitle = waitMs > 0 ? this.tr('refreshWait', {seconds:Math.ceil(waitMs / 1000)}) : this.tr('refresh');
    elements.refresh.title = elements.settingsRefresh.title = refreshTitle;
    this.syncSourceSettings();
    const cache = state.cache;
    const ageMs = cache ? Date.now() - cache.updatedAt : 0;
    elements.dot.classList.toggle('live', Boolean(cache && online && !state.error && ageMs < 3_600_000));
    elements.dot.classList.toggle('stale', Boolean(cache && (state.error || !online || ageMs >= 3_600_000)));
    elements.status.title = '';
    if (state.busy && !cache) { elements.status.textContent = this.tr('loading'); return; }
    if (!cache) { elements.status.textContent = this.tr(state.error ? 'ratesUnavailable' : 'ratesWaiting'); return; }
    const minutes = Math.max(0, Math.floor(ageMs / 60_000));
    const prefix = !online ? this.tr('offline') : state.error ? this.tr('saved') : minutes >= 60
      ? this.tr('old') : this.tr('fresh', {sources:sourceCount(state.language, cache.sources.length)});
    elements.status.textContent = `${prefix} ${ageText(state.language, minutes)}`;
    elements.status.title = this.tr('sourceTitle', {sources:cache.sources.join(', '),
      date:new Date(cache.updatedAt).toLocaleString(localeFor(state.language))});
  }

  applyLanguage() {
    const {state, elements} = this;
    const amount = parseAmount(state.raw, state.language);
    const travelAmount = parseAmount(elements.travelAmount.value, state.language);
    const travelOfferRate = parseAmount(elements.travelOfferRate.value, state.language);
    const travelFee = parseAmount(elements.travelFee.value, state.language);
    const tradeFiatAmount = parseAmount(this.tradeFiatRaw, state.language);
    const tradeBitcoinAmount = parseAmount(this.tradeBitcoinRaw, state.language);
    const marginPercent = parsePercent(elements.marginPercent.value, state.language);
    const manualRate = parseAmount(elements.manualMarket.value, state.language);
    state.language = resolveLanguage(state.languageMode, this.deviceLanguages);
    this.currencies = new Map(getCurrencies(state.language).map(currency => [currency.code, currency]));
    this.setFormatters();
    if (amount !== null) state.raw = this.formatEntry(amount, state.raw, state.anchor);
    if (travelAmount !== null) elements.travelAmount.value = this.formatEntry(travelAmount, elements.travelAmount.value, state.travelFrom);
    if (travelOfferRate !== null) elements.travelOfferRate.value = this.formatEntry(travelOfferRate,
      elements.travelOfferRate.value, elements.travelOfferBasis.value === 'from' ? state.travelTo : state.travelFrom);
    if (travelFee !== null) elements.travelFee.value = this.formatEntry(travelFee, elements.travelFee.value, state.travelFrom);
    if (tradeFiatAmount !== null) this.tradeFiatRaw = this.formatEntry(tradeFiatAmount, this.tradeFiatRaw, state.tradeCurrency);
    if (tradeBitcoinAmount !== null) this.tradeBitcoinRaw = this.formatEntry(tradeBitcoinAmount, this.tradeBitcoinRaw, 'BTC');
    elements.dealerAmount.value = state.dealerKind === 'fiat' ? this.tradeFiatRaw : this.tradeBitcoinRaw;
    const percentFormatter = new Intl.NumberFormat(localeFor(state.language), {maximumFractionDigits:4, useGrouping:false});
    if (marginPercent !== null) elements.marginPercent.value = percentFormatter.format(marginPercent);
    if (manualRate !== null) elements.manualMarket.value = this.formatEntry(manualRate, elements.manualMarket.value, state.tradeCurrency);
    this.doc.documentElement.lang = state.language;
    this.doc.title = this.tr('pageTitle');
    this.doc.querySelector('meta[name="description"]').content = this.tr('pageDescription');
    elements.language.value = state.languageMode;
    for (const element of this.doc.querySelectorAll('[data-i18n]')) element.textContent = this.tr(element.dataset.i18n);
    for (const element of this.doc.querySelectorAll('[data-i18n-aria-label]')) element.setAttribute('aria-label', this.tr(element.dataset.i18nAriaLabel));
    for (const element of this.doc.querySelectorAll('[data-i18n-placeholder]')) element.placeholder = this.tr(element.dataset.i18nPlaceholder);
    elements.refresh.setAttribute('aria-label', this.tr('refresh'));
    if (elements.installDialog.open) this.updateInstallInstructions();
    this.syncUnit();
    this.renderCurrencySelects();
    elements.dealerUnit.value = state.unit;
    elements.dealerKind.value = state.dealerKind;
    elements.fiatPrecision.value = state.fiatPrecision;
    if (state.anchor === 'BTC') elements.btc.value = state.raw;
    this.renderRows(); this.renderOptions(); this.renderTravel(); this.renderTrade();
    this.syncChartSettings(); this.setMode(state.mode); this.showStatus();
  }

  updateInstallInstructions() {
    const {navigator} = this.win;
    const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    const android = /Android/i.test(navigator.userAgent);
    const key = !this.win.isSecureContext ? 'installHttps' : ios ? 'installIos' : android ? 'installAndroid' : 'installDesktop';
    this.elements.installInstructions.textContent = this.tr(key);
  }

  updateInstallButton() {
    this.elements.install.hidden = this.win.matchMedia('(display-mode: standalone)').matches || this.win.navigator.standalone === true;
  }

  async promptInstall() {
    if (!this.installPrompt) {
      this.updateInstallInstructions(); this.elements.installDialog.showModal(); return;
    }
    const prompt = this.installPrompt;
    this.installPrompt = null;
    try { await prompt.prompt(); await prompt.userChoice; }
    catch { this.updateInstallInstructions(); this.elements.installDialog.showModal(); }
  }

  async copyDonation(input) {
    try {
      if (!this.win.navigator.clipboard?.writeText) throw new Error('Clipboard unavailable');
      await this.win.navigator.clipboard.writeText(input.value.trim());
      this.elements.copyStatus.textContent = this.tr('copied');
    } catch {
      input.focus(); input.select();
      this.elements.copyStatus.textContent = this.tr('copyManually');
    }
  }

  tradeOfferText() {
    if (!this.currentTradeQuote) return '';
    return formatTradeOffer(this.currentTradeQuote, {currency:this.state.tradeCurrency,
      unit:this.state.unit, language:this.state.language,
      referenceUpdatedAt:this.marketSource === 'live' ? this.state.cache?.updatedAt : null});
  }

  async shareTradeOffer() {
    const offer = this.tradeOfferText();
    if (!offer) return;
    try {
      await this.win.navigator.share({title:this.tr('shareTradeTitle'), text:offer});
    } catch (error) {
      if (error?.name !== 'AbortError') this.elements.tradeShareStatus.textContent = this.tr('shareTradeFailed');
    }
  }

  async copyTradeOffer() {
    const offer = this.tradeOfferText();
    if (!offer) return;
    try {
      await this.win.navigator.clipboard.writeText(offer);
      this.elements.tradeShareStatus.textContent = this.tr('copied');
    } catch {
      this.elements.tradeCopyText.value = offer;
      this.elements.tradeCopyDialog.showModal();
      this.elements.tradeCopyText.focus();
      this.elements.tradeCopyText.select();
    }
  }

  async refresh(manual = false) {
    const {state, elements} = this;
    if (state.busy || !this.win.navigator.onLine || (!manual && this.doc.visibilityState === 'hidden')) return;
    try {
      const stored = Number(this.win.localStorage.getItem(RATE_ATTEMPT_KEY));
      if (Number.isFinite(stored) && stored > this.lastRateAttempt && stored <= Date.now()) this.lastRateAttempt = stored;
    } catch { /* Keep the in-memory cooldown. */ }
    if (!shouldRefreshRates(state.cache, this.lastRateAttempt, Date.now(), manual, state.rateSources)) {
      this.showStatus(); return;
    }
    this.lastRateAttempt = Date.now();
    try { this.win.localStorage.setItem(RATE_ATTEMPT_KEY, String(this.lastRateAttempt)); }
    catch { /* In-memory cooldown still applies. */ }
    this.win.setTimeout(() => this.showStatus(), MANUAL_REFRESH_MS + 50);
    state.busy = true; state.error = false;
    elements.refresh.classList.add('loading'); elements.refresh.disabled = true; this.showStatus();
    try {
      state.cache = await fetchRates(fetch, [...state.rateSources]);
      this.save();
      if (state.anchor !== 'BTC' && !this.hasRate(state.anchor)) {
        state.anchor = 'BTC'; state.raw = this.format(fromBtc(state.btc, 'BTC', {}, state.unit), 'BTC');
        elements.btc.value = state.raw;
      }
      if (state.anchor !== 'BTC') this.recalculate(state.anchor, state.raw);
      else this.updateValues();
      this.renderOptions();
    } catch { state.error = true; }
    finally {
      state.busy = false; elements.refresh.classList.remove('loading');
      this.showStatus(); this.renderTravel(); this.renderTrade();
    }
  }

  start() {
    const {elements, win} = this;
    for (const input of this.doc.querySelectorAll('input[inputmode="decimal"]'))
      input.setAttribute('enterkeyhint', 'done');
    for (const source of SOURCES) {
      const label = this.doc.createElement('label'); label.className = 'source-option';
      const description = this.doc.createElement('span'); description.className = 'source-description';
      const name = this.doc.createElement('strong'); name.textContent = source.name;
      const domain = this.doc.createElement('small'); domain.textContent = new URL(source.url).hostname;
      description.append(name, domain);
      const input = this.doc.createElement('input'); input.type = 'checkbox'; input.name = 'rate-source'; input.value = source.name;
      input.addEventListener('change', () => {
        const selected = RATE_SOURCE_NAMES.filter(item =>
          [...elements.rateSourceControls.querySelectorAll('input')].some(control => control.value === item && control.checked));
        if (!selected.length) { this.syncSourceSettings(); return; }
        this.state.rateSources = selected;
        this.save(); this.showStatus();
      });
      label.append(description, input); elements.rateSourceControls.append(label);
    }
    elements.btc.value = this.state.raw;
    const percentFormatter = new Intl.NumberFormat(localeFor(this.state.language), {maximumFractionDigits:4, useGrouping:false});
    elements.marginPercent.value = percentFormatter.format(this.state.marginPercent);
    this.tradeFiatRaw = groupTypedAmount(this.tradeFiatRaw);
    if (this.state.unit === 'SATS') this.tradeBitcoinRaw = groupTypedAmount(this.tradeBitcoinRaw);
    elements.dealerAmount.value = this.state.dealerKind === 'fiat' ? this.tradeFiatRaw : this.tradeBitcoinRaw;
    const finishNumericEntry = event => {
      if (event.isComposing || !(event.target instanceof win.HTMLInputElement) || event.target.inputMode !== 'decimal') return;
      if (event.type === 'keydown' ? event.key !== 'Enter' && event.keyCode !== 13 : event.inputType !== 'insertLineBreak') return;
      event.preventDefault();
      event.target.blur();
    };
    this.doc.addEventListener('keydown', finishNumericEntry);
    this.doc.addEventListener('beforeinput', finishNumericEntry);
    elements.btc.addEventListener('input', () => this.recalculate('BTC', elements.btc.value));
    elements.btc.addEventListener('focus', () => elements.btc.select());
    elements.menuToggle.addEventListener('click', () => {
      elements.menu.showModal();
      elements.menuToggle.setAttribute('aria-expanded', 'true');
      elements.menu.querySelector('[aria-current="page"]')?.focus();
    });
    elements.menuClose.addEventListener('click', () => elements.menu.close());
    elements.menu.addEventListener('close', () => elements.menuToggle.setAttribute('aria-expanded', 'false'));
    elements.menu.addEventListener('click', event => { if (event.target === elements.menu) elements.menu.close(); });
    elements.btcButton.addEventListener('click', () => this.setUnit('BTC'));
    elements.satsButton.addEventListener('click', () => this.setUnit('SATS'));
    elements.refresh.addEventListener('click', () => this.refresh(true));
    elements.settingsRefresh.addEventListener('click', () => this.refresh(true));
    elements.language.addEventListener('change', () => { this.state.languageMode = elements.language.value; this.applyLanguage(); this.save(); });
    elements.add.addEventListener('click', () => { this.renderOptions(); elements.dialog.showModal(); elements.search.focus(); });
    elements.sort.addEventListener('click', () => { this.sorting = !this.sorting; this.renderRows(); elements.sort.focus(); });
    elements.close.addEventListener('click', () => elements.dialog.close());
    elements.dialog.addEventListener('click', event => { if (event.target === elements.dialog) elements.dialog.close(); });
    elements.search.addEventListener('input', () => this.renderOptions());
    for (const [button, mode] of [[elements.tabConvert, 'convert'], [elements.tabTravel, 'travel'],
      [elements.tabTrade, 'trade'], [elements.tabChart, 'chart'], [elements.tabSettings, 'settings']]) {
      button.addEventListener('click', () => {
        this.setMode(mode);
        if (elements.menu.open) elements.menu.close();
        elements.menuToggle.focus();
      });
    }
    elements.travelAmount.addEventListener('input', event => {
      if (!event.isComposing) groupAmountInput(elements.travelAmount);
      this.renderTravel();
    });
    const clearTravelOffer = () => { elements.travelOfferRate.value = ''; elements.travelFee.value = ''; };
    elements.travelFrom.addEventListener('change', () => { this.state.travelFrom = elements.travelFrom.value; clearTravelOffer(); this.save(); this.renderTravel(); });
    elements.travelTo.addEventListener('change', () => { this.state.travelTo = elements.travelTo.value; clearTravelOffer(); this.save(); this.renderTravel(); });
    elements.travelSwap.addEventListener('click', () => {
      [this.state.travelFrom, this.state.travelTo] = [this.state.travelTo, this.state.travelFrom];
      elements.travelFrom.value = this.state.travelFrom; elements.travelTo.value = this.state.travelTo;
      clearTravelOffer();
      this.save(); this.renderTravel();
    });
    elements.travelOfferBasis.addEventListener('change', () => { elements.travelOfferRate.value = ''; this.renderTravel(); });
    elements.travelOfferRate.addEventListener('input', event => {
      if (!event.isComposing) groupAmountInput(elements.travelOfferRate);
      this.renderTravel();
    });
    elements.travelFee.addEventListener('input', event => {
      if (!event.isComposing) groupAmountInput(elements.travelFee);
      this.renderTravel();
    });
    elements.openChart.addEventListener('click', () => {
      this.setMode('chart');
      elements.menuToggle.focus();
    });
    elements.fiatPrecision.addEventListener('change', () => {
      if (!FIAT_PRECISIONS.includes(elements.fiatPrecision.value)) return;
      this.state.fiatPrecision = elements.fiatPrecision.value;
      this.save(); this.updateValues();
    });
    elements.chartVisibility.addEventListener('change', () => {
      this.state.showChartPreview = elements.chartVisibility.checked;
      this.syncChartSettings(); this.save();
    });
    elements.chartRange.addEventListener('change', () => {
      if (!CHART_RANGES.includes(elements.chartRange.value)) return;
      this.state.chartRange = elements.chartRange.value;
      if (this.miniChartLoaded) { this.resetChart(elements.miniChart); this.miniChartLoaded = false; }
      if (this.largeChartLoaded) { this.resetChart(elements.largeChart); this.largeChartLoaded = false; }
      this.syncChartSettings(); this.save();
    });
    for (const [button, side] of [[elements.dealerBuy, 'buy'], [elements.dealerSell, 'sell']]) {
      button.addEventListener('click', () => {
        this.state.dealerSide = side;
        this.state.dealerSideChosen = true;
        this.save(); this.renderTrade();
      });
    }
    elements.dealerCurrency.addEventListener('change', () => {
      this.state.tradeCurrency = elements.dealerCurrency.value;
      elements.manualMarket.value = this.hasRate(this.state.tradeCurrency)
        ? this.format(this.state.cache.rates[this.state.tradeCurrency], this.state.tradeCurrency) : '';
      this.save(); this.renderTrade();
    });
    elements.marketSource.addEventListener('change', () => {
      this.marketSource = elements.marketSource.value;
      if (this.marketSource === 'manual' && !elements.manualMarket.value.trim()) {
        const rate = this.state.cache?.rates?.[this.state.tradeCurrency];
        if (isRate(rate)) elements.manualMarket.value = this.format(rate, this.state.tradeCurrency);
      }
      this.renderTrade();
    });
    elements.manualMarket.addEventListener('input', event => {
      if (!event.isComposing) groupAmountInput(elements.manualMarket);
      this.renderTrade();
    });
    elements.marginPercent.addEventListener('input', () => {
      const percent = parsePercent(elements.marginPercent.value, this.state.language);
      if (percent !== null) { this.state.marginPercent = percent; this.save(); }
      this.renderTrade();
    });
    elements.dealerAmount.addEventListener('input', event => {
      if (!event.isComposing && (this.state.dealerKind === 'fiat' || this.state.unit === 'SATS'))
        groupAmountInput(elements.dealerAmount);
      if (this.state.dealerKind === 'fiat') this.tradeFiatRaw = elements.dealerAmount.value;
      else this.tradeBitcoinRaw = elements.dealerAmount.value;
      this.renderTrade();
    });
    elements.dealerKind.addEventListener('change', () => this.changeDealerKind(elements.dealerKind.value));
    elements.dealerUnit.addEventListener('change', () => this.setUnit(elements.dealerUnit.value));
    elements.tradeShare.hidden = typeof win.navigator.share !== 'function';
    elements.tradeShare.addEventListener('click', () => this.shareTradeOffer());
    elements.tradeCopy.addEventListener('click', () => this.copyTradeOffer());
    elements.tradeCopyClose.addEventListener('click', () => elements.tradeCopyDialog.close());
    elements.tradeCopyDialog.addEventListener('click', event => {
      if (event.target === elements.tradeCopyDialog) elements.tradeCopyDialog.close();
    });
    elements.install.addEventListener('click', () => {
      elements.menu.close();
      this.promptInstall();
    });
    elements.donateOpen.addEventListener('click', () => {
      elements.menu.close();
      elements.copyStatus.textContent = '';
      elements.donateDialog.showModal();
    });
    elements.donateClose.addEventListener('click', () => elements.donateDialog.close());
    elements.donateDialog.addEventListener('click', event => {
      if (event.target === elements.donateDialog) elements.donateDialog.close();
    });
    elements.copyBtc.addEventListener('click', () => this.copyDonation(elements.donateBtc));
    elements.copyLightning.addEventListener('click', () => this.copyDonation(elements.donateLightning));
    elements.installClose.addEventListener('click', () => elements.installDialog.close());
    elements.installDialog.addEventListener('click', event => { if (event.target === elements.installDialog) elements.installDialog.close(); });
    win.addEventListener('beforeinstallprompt', event => { event.preventDefault(); this.installPrompt = event; this.updateInstallButton(); });
    win.addEventListener('appinstalled', () => { this.installPrompt = null; elements.install.hidden = true; });
    win.matchMedia('(display-mode: standalone)').addEventListener?.('change', () => this.updateInstallButton());
    win.addEventListener('online', () => {
      // A chart iframe hidden during an outage may not reconnect on its own.
      if (this.miniChartLoaded && elements.miniChart.hidden) {
        this.resetChart(elements.miniChart); this.miniChartLoaded = false;
      }
      if (this.largeChartLoaded && elements.largeChart.hidden) {
        this.resetChart(elements.largeChart); this.largeChartLoaded = false;
      }
      this.showStatus(); this.refresh(); this.loadMiniChart();
      this.loadLargeChart();
    });
    this.doc.addEventListener('visibilitychange', () => {
      if (this.doc.visibilityState === 'visible') { this.showStatus(); this.refresh(); }
    });
    win.addEventListener('offline', () => { this.showStatus(); this.loadMiniChart(); this.loadLargeChart(); });
    win.setInterval(() => this.showStatus(), 60_000);
    this.applyLanguage(); this.updateInstallButton(); this.refresh();
    const loadVisibleChart = () => { this.loadMiniChart(); this.loadLargeChart(); };
    if (this.doc.readyState === 'complete') win.setTimeout(loadVisibleChart, 0);
    else win.addEventListener('load', loadVisibleChart, {once:true});
    if ('serviceWorker' in win.navigator && win.isSecureContext) win.navigator.serviceWorker.register('./sw.js').catch(() => {});
  }
}

if (typeof document !== 'undefined' && document.getElementById('app')) new ConverterApp().start();
