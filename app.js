import {parseAmount, btcFrom, fromBtc, fetchRates} from './rates.js';
import {CURRENCIES, getCurrencies} from './currencies.js';
import {resolveLanguage, t, ageText, sourceCount} from './i18n.js';
import {parsePercent, tradeQuote, travelQuote} from './quotes.js';

const STORAGE_KEY = 'priceconverter:v1';
const DEFAULT_CURRENCIES = ['CZK', 'EUR', 'USD'];
const CURRENCY_CODES = new Set(CURRENCIES.map(currency => currency.code));
const isRate = value => typeof value === 'number' && Number.isFinite(value) && value > 0;
const searchable = value => value.toLocaleLowerCase('cs').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
const savedPercent = (value, fallback) => typeof value === 'number' && Number.isFinite(value) && value > -100 && value <= 1000 ? value : fallback;
const savedCurrency = (value, fallback) => CURRENCY_CODES.has(value) ? value : fallback;

// Keep one storage format across releases. Discard malformed fields individually.
export function restoreSettings(json) {
  let saved;
  try { saved = JSON.parse(json || '{}'); } catch { saved = {}; }
  if (!saved || typeof saved !== 'object' || Array.isArray(saved)) saved = {};
  const selected = Array.isArray(saved.selected)
    ? [...new Set(saved.selected.filter(code => typeof code === 'string' && CURRENCY_CODES.has(code)))]
    : DEFAULT_CURRENCIES.slice();
  const storedCache = saved.cache;
  let cache = null;
  if (storedCache && typeof storedCache === 'object' && !Array.isArray(storedCache) &&
      Number.isFinite(storedCache.updatedAt) && storedCache.updatedAt > 0 && storedCache.updatedAt <= Date.now() &&
      storedCache.rates && typeof storedCache.rates === 'object' && !Array.isArray(storedCache.rates) &&
      Array.isArray(storedCache.sources)) {
    const rates = Object.fromEntries(Object.entries(storedCache.rates).filter(([code, value]) => CURRENCY_CODES.has(code) && isRate(value)));
    const sources = storedCache.sources.filter(name => typeof name === 'string' && name.length < 80);
    if (Object.keys(rates).length && sources.length) cache = {rates, sources, updatedAt:storedCache.updatedAt};
  }
  return {selected, unit:saved.unit === 'SATS' ? 'SATS' : 'BTC', cache,
    languageMode:['cs', 'en'].includes(saved.languageMode) ? saved.languageMode : 'auto',
    mode:saved.mode === 'trade' ? 'trade' : 'convert',
    tradeCurrency:savedCurrency(saved.tradeCurrency, 'CZK'),
    buyPercent:savedPercent(saved.buyPercent, -2), sellPercent:savedPercent(saved.sellPercent, 2),
    dealerSide:saved.dealerSide === 'sell' ? 'sell' : 'buy',
    dealerKind:saved.dealerKind === 'bitcoin' ? 'bitcoin' : 'fiat',
    travelFrom:savedCurrency(saved.travelFrom, 'CZK'), travelTo:savedCurrency(saved.travelTo, 'EUR')};
}

export class ConverterApp {
  constructor(doc = document, win = window) {
    this.doc = doc;
    this.win = win;
    this.elements = Object.fromEntries(Object.entries({
      btc:'btc-input', unit:'btc-unit', caption:'bitcoin-caption', btcButton:'unit-btc', satsButton:'unit-sats',
      list:'currency-list', count:'currency-count', status:'status-text', dot:'status-dot', refresh:'refresh',
      language:'language-switch', add:'add-currency', dialog:'currency-dialog', close:'close-dialog',
      search:'currency-search', options:'currency-options', install:'install-button',
      installDialog:'install-dialog', installClose:'close-install', installInstructions:'install-instructions',
      tabConvert:'tab-convert', tabTrade:'tab-trade', paneConvert:'convert-pane', paneTrade:'trade-pane',
      travelAmount:'travel-amount', travelFrom:'travel-from', travelTo:'travel-to', travelSwap:'travel-swap',
      travelValue:'travel-value', travelRate:'travel-rate',
      dealerBuy:'dealer-buy', dealerSell:'dealer-sell', tradeExplanation:'trade-explanation',
      dealerCurrency:'dealer-currency', buyPercent:'buy-percent', sellPercent:'sell-percent',
      buyMarginField:'buy-margin-field', sellMarginField:'sell-margin-field',
      dealerKind:'dealer-amount-kind', dealerUnit:'dealer-unit', dealerAmount:'dealer-amount',
      offerFiatLabel:'offer-fiat-label', offerBtcLabel:'offer-btc-label', offerFiat:'offer-fiat',
      offerBtc:'offer-btc', offerMarket:'offer-market', offerPrice:'offer-price',
      offerDifference:'offer-difference', tradeValidation:'trade-validation'
    }).map(([name, id]) => [name, doc.getElementById(id)]));
    let json;
    try { json = win.localStorage.getItem(STORAGE_KEY); } catch { /* Private browsing. */ }
    const stored = restoreSettings(json);
    this.deviceLanguages = win.navigator.languages?.length ? win.navigator.languages : [win.navigator.language];
    this.state = {...stored, language:resolveLanguage(stored.languageMode, this.deviceLanguages),
      anchor:'BTC', raw:'1', btc:stored.unit === 'SATS' ? 1e-8 : 1, busy:false, error:false};
    this.currencies = new Map();
    this.installPrompt = null;
    this.setFormatters();
    this.tradeFiatRaw = '10000';
    this.tradeBitcoinRaw = stored.unit === 'SATS' ? '1000000' : '0.01';
  }

  tr(key, parameters) { return t(this.state.language, key, parameters); }

  save() {
    const {selected, unit, cache, languageMode, mode, tradeCurrency, buyPercent, sellPercent,
      dealerSide, dealerKind, travelFrom, travelTo} = this.state;
    try { this.win.localStorage.setItem(STORAGE_KEY, JSON.stringify({selected, unit, cache, languageMode,
      mode, tradeCurrency, buyPercent, sellPercent, dealerSide, dealerKind, travelFrom, travelTo})); }
    catch { /* Conversion remains available without local storage. */ }
  }

  setFormatters() {
    const locale = this.state.language === 'cs' ? 'cs-CZ' : 'en-US';
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
    return new Intl.NumberFormat(this.state.language === 'cs' ? 'cs-CZ' : 'en-US',
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
      if (state.anchor !== code) input.value = this.format(fromBtc(state.btc, code, state.cache?.rates || {}), code);
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
    if (!state.selected.length) {
      const empty = this.doc.createElement('p');
      empty.className = 'empty-state'; empty.textContent = this.tr('emptyState');
      elements.list.append(empty);
    }
    for (const code of state.selected) {
      const currency = this.currencies.get(code);
      const row = this.doc.createElement('div'); row.className = 'currency-row';
      const icon = this.doc.createElement('span'); icon.className = 'currency-icon'; icon.setAttribute('aria-hidden', 'true'); icon.textContent = currency.flag;
      const info = this.doc.createElement('div'); info.className = 'currency-info';
      const label = this.doc.createElement('strong'); label.className = 'currency-code'; label.textContent = code;
      const name = this.doc.createElement('span'); name.className = 'currency-name'; name.textContent = currency.name;
      info.append(label, name);
      const value = this.doc.createElement('div'); value.className = 'currency-value';
      const input = this.doc.createElement('input'); input.type = 'text'; input.inputMode = 'decimal'; input.autocomplete = 'off'; input.spellcheck = false;
      input.dataset.code = code; input.setAttribute('aria-label', this.tr('amountIn', {name:currency.name}));
      input.addEventListener('input', () => this.recalculate(code, input.value));
      input.addEventListener('focus', () => input.select());
      value.append(input);
      const remove = this.doc.createElement('button'); remove.type = 'button'; remove.className = 'remove-button'; remove.textContent = '×';
      remove.title = this.tr('remove', {name:currency.name}); remove.setAttribute('aria-label', remove.title);
      remove.addEventListener('click', () => this.removeCurrency(code));
      row.append(icon, info, value, remove); elements.list.append(row);
    }
    this.updateValues();
    if (state.anchor !== 'BTC') {
      const input = [...elements.list.querySelectorAll('input[data-code]')].find(item => item.dataset.code === state.anchor);
      if (input) input.value = state.raw;
    }
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

  setMode(mode) {
    this.state.mode = mode === 'trade' ? 'trade' : 'convert';
    const trade = this.state.mode === 'trade';
    this.elements.paneConvert.hidden = trade;
    this.elements.paneTrade.hidden = !trade;
    this.elements.tabConvert.setAttribute('aria-selected', String(!trade));
    this.elements.tabTrade.setAttribute('aria-selected', String(trade));
    this.save();
  }

  renderTravel() {
    const {state, elements} = this;
    const amount = parseAmount(elements.travelAmount.value, state.language);
    const quote = travelQuote(amount, state.travelFrom, state.travelTo, state.cache?.rates);
    const locale = state.language === 'cs' ? 'cs-CZ' : 'en-US';
    elements.travelValue.textContent = quote
      ? `${new Intl.NumberFormat(locale, {maximumFractionDigits:8}).format(quote.result)} ${state.travelTo}` : '—';
    elements.travelRate.textContent = quote
      ? this.tr('travelRate', {from:state.travelFrom, to:state.travelTo,
        rate:new Intl.NumberFormat(locale, {maximumSignificantDigits:8}).format(quote.rate)})
      : this.tr(amount === null ? 'invalidAmount' : 'noRate');
  }

  renderTrade() {
    const {state, elements} = this;
    const buying = state.dealerSide === 'buy';
    elements.dealerBuy.classList.toggle('selected', buying);
    elements.dealerSell.classList.toggle('selected', !buying);
    elements.dealerBuy.setAttribute('aria-pressed', String(buying));
    elements.dealerSell.setAttribute('aria-pressed', String(!buying));
    elements.buyMarginField.classList.toggle('active', buying);
    elements.sellMarginField.classList.toggle('active', !buying);
    elements.tradeExplanation.textContent = this.tr(buying ? 'buyExplanation' : 'sellExplanation', {currency:state.tradeCurrency});
    elements.offerFiatLabel.textContent = this.tr(buying ? 'fiatPaid' : 'fiatReceived');
    elements.offerBtcLabel.textContent = this.tr(buying ? 'btcReceived' : 'btcDelivered');
    const amount = parseAmount(elements.dealerAmount.value, state.language);
    const percent = parsePercent(buying ? elements.buyPercent.value : elements.sellPercent.value, state.language);
    const marketRate = state.cache?.rates?.[state.tradeCurrency];
    const quote = amount === null || percent === null ? null : tradeQuote({marketRate, percent,
      side:state.dealerSide, amount, amountKind:state.dealerKind, unit:state.unit});
    const fiat = number => `${this.format(number, state.tradeCurrency)} ${state.tradeCurrency}`;
    elements.offerFiat.textContent = quote ? fiat(quote.fiat) : '—';
    elements.offerBtc.textContent = quote ? state.unit === 'SATS'
      ? `${this.format(quote.sats, 'BTC')} sats` : `${this.format(quote.btc, 'BTC')} BTC` : '—';
    elements.offerMarket.textContent = isRate(marketRate) ? fiat(marketRate) : '—';
    elements.offerPrice.textContent = quote ? fiat(quote.offeredRate) : '—';
    elements.offerDifference.textContent = quote ? `${quote.difference > 0 ? '+' : ''}${fiat(quote.difference)}` : '—';
    elements.tradeValidation.textContent = !this.hasRate(state.tradeCurrency) ? this.tr('tradeNoRate', {currency:state.tradeCurrency})
      : amount === null ? this.tr('invalidAmount') : percent === null ? this.tr('invalidPercent')
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
    elements.caption.textContent = this.tr(state.unit === 'SATS' ? 'satsCaption' : 'bitcoinCaption');
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
    const cache = state.cache;
    const online = this.win.navigator.onLine;
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
      date:new Date(cache.updatedAt).toLocaleString(state.language === 'cs' ? 'cs-CZ' : 'en-US')});
  }

  applyLanguage() {
    const {state, elements} = this;
    const amount = parseAmount(state.raw, state.language);
    const travelAmount = parseAmount(elements.travelAmount.value, state.language);
    const tradeFiatAmount = parseAmount(this.tradeFiatRaw, state.language);
    const tradeBitcoinAmount = parseAmount(this.tradeBitcoinRaw, state.language);
    const buyPercent = parsePercent(elements.buyPercent.value, state.language);
    const sellPercent = parsePercent(elements.sellPercent.value, state.language);
    state.language = resolveLanguage(state.languageMode, this.deviceLanguages);
    this.currencies = new Map(getCurrencies(state.language).map(currency => [currency.code, currency]));
    this.setFormatters();
    if (amount !== null) state.raw = this.formatEntry(amount, state.raw, state.anchor);
    if (travelAmount !== null) elements.travelAmount.value = this.formatEntry(travelAmount, elements.travelAmount.value, state.travelFrom);
    if (tradeFiatAmount !== null) this.tradeFiatRaw = this.formatEntry(tradeFiatAmount, this.tradeFiatRaw, state.tradeCurrency);
    if (tradeBitcoinAmount !== null) this.tradeBitcoinRaw = this.formatEntry(tradeBitcoinAmount, this.tradeBitcoinRaw, 'BTC');
    elements.dealerAmount.value = state.dealerKind === 'fiat' ? this.tradeFiatRaw : this.tradeBitcoinRaw;
    const percentFormatter = new Intl.NumberFormat(state.language === 'cs' ? 'cs-CZ' : 'en-US', {maximumFractionDigits:4, useGrouping:false});
    if (buyPercent !== null) elements.buyPercent.value = percentFormatter.format(buyPercent);
    if (sellPercent !== null) elements.sellPercent.value = percentFormatter.format(sellPercent);
    this.doc.documentElement.lang = state.language;
    this.doc.title = this.tr('pageTitle');
    this.doc.querySelector('meta[name="description"]').content = this.tr('pageDescription');
    elements.language.value = state.languageMode;
    for (const element of this.doc.querySelectorAll('[data-i18n]')) element.textContent = this.tr(element.dataset.i18n);
    for (const element of this.doc.querySelectorAll('[data-i18n-aria-label]')) element.setAttribute('aria-label', this.tr(element.dataset.i18nAriaLabel));
    for (const element of this.doc.querySelectorAll('[data-i18n-placeholder]')) element.placeholder = this.tr(element.dataset.i18nPlaceholder);
    elements.refresh.title = this.tr('refresh'); elements.refresh.setAttribute('aria-label', this.tr('refresh'));
    if (elements.installDialog.open) this.updateInstallInstructions();
    this.syncUnit();
    this.renderCurrencySelects();
    elements.dealerUnit.value = state.unit;
    elements.dealerKind.value = state.dealerKind;
    if (state.anchor === 'BTC') elements.btc.value = state.raw;
    this.renderRows(); this.renderOptions(); this.renderTravel(); this.renderTrade(); this.setMode(state.mode); this.showStatus();
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

  async refresh() {
    const {state, elements} = this;
    if (state.busy) return;
    state.busy = true; state.error = false;
    elements.refresh.classList.add('loading'); elements.refresh.disabled = true; this.showStatus();
    try {
      state.cache = await fetchRates();
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
      state.busy = false; elements.refresh.classList.remove('loading'); elements.refresh.disabled = false;
      this.showStatus(); this.renderTravel(); this.renderTrade();
    }
  }

  start() {
    const {elements, win} = this;
    elements.btc.value = this.state.raw;
    const percentFormatter = new Intl.NumberFormat(this.state.language === 'cs' ? 'cs-CZ' : 'en-US', {maximumFractionDigits:4, useGrouping:false});
    elements.buyPercent.value = percentFormatter.format(this.state.buyPercent);
    elements.sellPercent.value = percentFormatter.format(this.state.sellPercent);
    elements.dealerAmount.value = this.state.dealerKind === 'fiat' ? this.tradeFiatRaw : this.tradeBitcoinRaw;
    elements.btc.addEventListener('input', () => this.recalculate('BTC', elements.btc.value));
    elements.btc.addEventListener('focus', () => elements.btc.select());
    elements.btcButton.addEventListener('click', () => this.setUnit('BTC'));
    elements.satsButton.addEventListener('click', () => this.setUnit('SATS'));
    elements.refresh.addEventListener('click', () => this.refresh());
    elements.language.addEventListener('change', () => { this.state.languageMode = elements.language.value; this.applyLanguage(); this.save(); });
    elements.add.addEventListener('click', () => { this.renderOptions(); elements.dialog.showModal(); elements.search.focus(); });
    elements.close.addEventListener('click', () => elements.dialog.close());
    elements.dialog.addEventListener('click', event => { if (event.target === elements.dialog) elements.dialog.close(); });
    elements.search.addEventListener('input', () => this.renderOptions());
    elements.tabConvert.addEventListener('click', () => this.setMode('convert'));
    elements.tabTrade.addEventListener('click', () => this.setMode('trade'));
    for (const tab of [elements.tabConvert, elements.tabTrade]) tab.addEventListener('keydown', event => {
      if (!['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
      event.preventDefault();
      const next = tab === elements.tabConvert ? elements.tabTrade : elements.tabConvert;
      this.setMode(next === elements.tabTrade ? 'trade' : 'convert'); next.focus();
    });
    elements.travelAmount.addEventListener('input', () => this.renderTravel());
    elements.travelFrom.addEventListener('change', () => { this.state.travelFrom = elements.travelFrom.value; this.save(); this.renderTravel(); });
    elements.travelTo.addEventListener('change', () => { this.state.travelTo = elements.travelTo.value; this.save(); this.renderTravel(); });
    elements.travelSwap.addEventListener('click', () => {
      [this.state.travelFrom, this.state.travelTo] = [this.state.travelTo, this.state.travelFrom];
      elements.travelFrom.value = this.state.travelFrom; elements.travelTo.value = this.state.travelTo;
      this.save(); this.renderTravel();
    });
    for (const [button, side] of [[elements.dealerBuy, 'buy'], [elements.dealerSell, 'sell']]) {
      button.addEventListener('click', () => { this.state.dealerSide = side; this.save(); this.renderTrade(); });
    }
    elements.dealerCurrency.addEventListener('change', () => {
      this.state.tradeCurrency = elements.dealerCurrency.value; this.save(); this.renderTrade();
    });
    for (const [input, key] of [[elements.buyPercent, 'buyPercent'], [elements.sellPercent, 'sellPercent']]) {
      input.addEventListener('input', () => {
        const percent = parsePercent(input.value, this.state.language);
        if (percent !== null) { this.state[key] = percent; this.save(); }
        this.renderTrade();
      });
    }
    elements.dealerAmount.addEventListener('input', () => {
      if (this.state.dealerKind === 'fiat') this.tradeFiatRaw = elements.dealerAmount.value;
      else this.tradeBitcoinRaw = elements.dealerAmount.value;
      this.renderTrade();
    });
    elements.dealerKind.addEventListener('change', () => this.changeDealerKind(elements.dealerKind.value));
    elements.dealerUnit.addEventListener('change', () => this.setUnit(elements.dealerUnit.value));
    elements.install.addEventListener('click', () => this.promptInstall());
    elements.installClose.addEventListener('click', () => elements.installDialog.close());
    elements.installDialog.addEventListener('click', event => { if (event.target === elements.installDialog) elements.installDialog.close(); });
    win.addEventListener('beforeinstallprompt', event => { event.preventDefault(); this.installPrompt = event; this.updateInstallButton(); });
    win.addEventListener('appinstalled', () => { this.installPrompt = null; elements.install.hidden = true; });
    win.matchMedia('(display-mode: standalone)').addEventListener?.('change', () => this.updateInstallButton());
    win.addEventListener('online', () => { this.showStatus(); this.refresh(); });
    win.addEventListener('offline', () => this.showStatus());
    win.setInterval(() => this.showStatus(), 60_000);
    this.applyLanguage(); this.updateInstallButton(); this.refresh();
    if ('serviceWorker' in win.navigator && win.isSecureContext) win.navigator.serviceWorker.register('./sw.js').catch(() => {});
  }
}

if (typeof document !== 'undefined' && document.getElementById('app')) new ConverterApp().start();
