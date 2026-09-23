import {CURRENCIES, parseAmount, btcFrom, fromBtc, fetchRates} from './rates.js';
import {getCurrencies} from './currencies.js';
import {resolveLanguage, t, ageText, sourceCount} from './i18n.js';

const $ = selector => document.querySelector(selector);
const elements = {
  btc:$('#btc-input'), unit:$('#btc-unit'), caption:$('#bitcoin-caption'),
  btcButton:$('#unit-btc'), satsButton:$('#unit-sats'), list:$('#currency-list'),
  count:$('#currency-count'), status:$('#status-text'), dot:$('#status-dot'),
  refresh:$('#refresh'), language:$('#language-switch'), add:$('#add-currency'), dialog:$('#currency-dialog'),
  close:$('#close-dialog'), search:$('#currency-search'), options:$('#currency-options')
};
const currencyCodes = new Set(CURRENCIES.map(currency => currency.code));
const key = 'priceconverter:v1';
const hasRate = code => Number.isFinite(state.cache?.rates?.[code]) && state.cache.rates[code] > 0;
const searchable = value => value.toLocaleLowerCase('cs').normalize('NFD').replace(/[\u0300-\u036f]/g,'');

function restore() {
  try {
    const saved = JSON.parse(localStorage.getItem(key) || '{}');
    const selected = Array.isArray(saved.selected) ? [...new Set(saved.selected.filter(code => currencyCodes.has(code)))] : ['CZK','EUR','USD'];
    const cache = saved.cache;
    const rates = cache && Number.isFinite(cache.updatedAt) && cache.updatedAt <= Date.now() && cache.rates && typeof cache.rates === 'object' ? cache : null;
    return {selected, unit:saved.unit === 'SATS' ? 'SATS' : 'BTC', cache:rates,
      languageMode:['cs','en'].includes(saved.languageMode) ? saved.languageMode : 'auto'};
  } catch { return {selected:['CZK','EUR','USD'],unit:'BTC',cache:null,languageMode:'auto'}; }
}

const stored = restore();
const deviceLanguages = navigator.languages?.length ? navigator.languages : [navigator.language];
const state = {selected:stored.selected, unit:stored.unit, cache:stored.cache,
  languageMode:stored.languageMode, language:resolveLanguage(stored.languageMode,deviceLanguages),
  anchor:'BTC', raw:'1', btc:1, busy:false, error:false};
let currencies = getCurrencies(state.language);
const tr = (message, parameters) => t(state.language,message,parameters);

function save() {
  try { localStorage.setItem(key, JSON.stringify({selected:state.selected,unit:state.unit,cache:state.cache,languageMode:state.languageMode})); } catch { /* Private mode or full storage: conversion still works. */ }
}

function format(value, code) {
  if (value === null || !Number.isFinite(value)) return '';
  const digits = code === 'BTC' ? (state.unit === 'SATS' ? 3 : 8) : 3;
  return new Intl.NumberFormat(state.language === 'cs' ? 'cs-CZ' : 'en-US', {maximumFractionDigits:digits, useGrouping:true}).format(value);
}

function updateValues() {
  const btcValue = fromBtc(state.btc, 'BTC', {}, state.unit);
  if (state.anchor !== 'BTC') elements.btc.value = format(btcValue, 'BTC');
  for (const input of elements.list.querySelectorAll('input[data-code]')) {
    const code = input.dataset.code;
    input.disabled = !hasRate(code);
    input.placeholder = input.disabled ? tr('noRate') : '';
    input.title = input.disabled ? tr('missingRate',{code}) : '';
    if (state.anchor !== code) input.value = format(fromBtc(state.btc, code, state.cache?.rates || {}), code);
  }
}

function recalculate(code, raw) {
  state.anchor = code;
  state.raw = raw;
  const amount = parseAmount(raw,state.language);
  state.btc = amount === null ? null : btcFrom(amount, code, state.cache?.rates || {}, state.unit);
  updateValues();
}

function renderRows() {
  elements.list.replaceChildren();
  elements.count.textContent = String(state.selected.length);
  if (!state.selected.length) {
    const empty = document.createElement('p');
    empty.className = 'empty-state'; empty.textContent = tr('emptyState');
    elements.list.append(empty);
  }
  for (const code of state.selected) {
    const currency = currencies.find(item => item.code === code);
    const row = document.createElement('div'); row.className = 'currency-row';
    const icon = document.createElement('span'); icon.className = 'currency-icon'; icon.setAttribute('aria-hidden','true'); icon.textContent = currency.flag;
    const info = document.createElement('div'); info.className = 'currency-info';
    const label = document.createElement('strong'); label.className = 'currency-code'; label.textContent = code;
    const name = document.createElement('span'); name.className = 'currency-name'; name.textContent = currency.name;
    info.append(label,name);
    const value = document.createElement('div'); value.className = 'currency-value';
    const input = document.createElement('input'); input.type = 'text'; input.inputMode = 'decimal'; input.autocomplete = 'off'; input.spellcheck = false;
    input.dataset.code = code; input.setAttribute('aria-label',tr('amountIn',{name:currency.name}));
    input.addEventListener('input', () => recalculate(code,input.value));
    input.addEventListener('focus', () => input.select());
    value.append(input);
    const remove = document.createElement('button'); remove.type = 'button'; remove.className = 'remove-button'; remove.textContent = '×'; remove.title = tr('remove',{name:currency.name}); remove.setAttribute('aria-label',tr('remove',{name:currency.name}));
    remove.addEventListener('click', () => {
      if (state.anchor === code) { state.anchor = 'BTC'; state.raw = format(fromBtc(state.btc,'BTC',{},state.unit),'BTC'); elements.btc.value = state.raw; }
      state.selected = state.selected.filter(item => item !== code); save(); renderRows(); renderOptions();
    });
    row.append(icon,info,value,remove); elements.list.append(row);
  }
  updateValues();
  if (state.anchor !== 'BTC') {
    const input = elements.list.querySelector(`input[data-code="${state.anchor}"]`);
    if (input) input.value = state.raw;
  }
}

function renderOptions() {
  elements.options.replaceChildren();
  const query = searchable(elements.search.value.trim());
  const matches = currencies.filter(item => !state.selected.includes(item.code) && searchable(`${item.code} ${item.name}`).includes(query));
  if (!matches.length) {
    const empty = document.createElement('p'); empty.className = 'option-empty'; empty.textContent = tr('noMatches'); elements.options.append(empty);
  }
  for (const currency of matches) {
    const option = document.createElement('button'); option.type = 'button'; option.className = 'option-button';
    const icon = document.createElement('span'); icon.className = 'currency-icon'; icon.textContent = currency.flag; icon.setAttribute('aria-hidden','true');
    const copy = document.createElement('span'); const code = document.createElement('strong'); code.textContent = currency.code; const name = document.createElement('small'); name.textContent = state.cache && !hasRate(currency.code) ? `${currency.name} · ${tr('noRateShort')}` : currency.name; copy.append(code,name);
    const plus = document.createElement('span'); plus.className = 'option-plus'; plus.textContent = '+'; plus.setAttribute('aria-hidden','true');
    option.append(icon,copy,plus);
    option.addEventListener('click', () => { state.selected.push(currency.code); save(); renderRows(); elements.dialog.close(); elements.search.value = ''; renderOptions(); });
    elements.options.append(option);
  }
}

function setUnit(unit) {
  if (unit === state.unit) return;
  state.unit = unit;
  elements.unit.textContent = unit;
  elements.caption.textContent = tr(unit === 'SATS' ? 'satsCaption' : 'bitcoinCaption');
  for (const [button,active] of [[elements.btcButton,unit === 'BTC'],[elements.satsButton,unit === 'SATS']]) {
    button.classList.toggle('selected',active); button.setAttribute('aria-pressed',String(active));
  }
  if (state.anchor === 'BTC') { state.raw = format(fromBtc(state.btc,'BTC',{},unit),'BTC'); elements.btc.value = state.raw; }
  save(); updateValues();
}

function showStatus() {
  const cache = state.cache;
  const online = navigator.onLine;
  elements.dot.classList.toggle('live', Boolean(cache && online && !state.error && Date.now()-cache.updatedAt < 60*60*1000));
  elements.dot.classList.toggle('stale',Boolean(cache && (state.error || !online || Date.now()-cache.updatedAt >= 60*60*1000)));
  if (state.busy && !cache) { elements.status.textContent = tr('loading'); return; }
  if (!cache) { elements.status.textContent = tr(state.error ? 'ratesUnavailable' : 'ratesWaiting'); return; }
  const minutes = Math.max(0,Math.floor((Date.now()-cache.updatedAt)/60000));
  const age = ageText(state.language,minutes);
  const prefix = !online ? tr('offline') : state.error ? tr('saved') : minutes >= 60 ? tr('old') : tr('fresh',{sources:sourceCount(state.language,cache.sources.length)});
  elements.status.textContent = `${prefix} ${age}`;
  elements.status.title = tr('sourceTitle',{sources:cache.sources.join(', '),date:new Date(cache.updatedAt).toLocaleString(state.language === 'cs' ? 'cs-CZ' : 'en-US')});
}

function applyLanguage() {
  state.language = resolveLanguage(state.languageMode,deviceLanguages);
  currencies = getCurrencies(state.language);
  document.documentElement.lang = state.language;
  document.title = tr('pageTitle');
  document.querySelector('meta[name="description"]').content = tr('pageDescription');
  elements.language.value = state.languageMode;
  for (const element of document.querySelectorAll('[data-i18n]')) element.textContent = tr(element.dataset.i18n);
  for (const element of document.querySelectorAll('[data-i18n-aria-label]')) element.setAttribute('aria-label',tr(element.dataset.i18nAriaLabel));
  for (const element of document.querySelectorAll('[data-i18n-placeholder]')) element.placeholder = tr(element.dataset.i18nPlaceholder);
  elements.refresh.title = tr('refresh');
  elements.refresh.setAttribute('aria-label',tr('refresh'));
  elements.caption.textContent = tr(state.unit === 'SATS' ? 'satsCaption' : 'bitcoinCaption');
  state.raw = format(fromBtc(state.btc,state.anchor,state.cache?.rates || {},state.unit),state.anchor);
  if (state.anchor === 'BTC') elements.btc.value = state.raw;
  renderRows(); renderOptions(); showStatus();
}

async function refresh() {
  if (state.busy) return;
  state.busy = true; state.error = false; elements.refresh.classList.add('loading'); elements.refresh.disabled = true; showStatus();
  try {
    state.cache = await fetchRates();
    save();
    if (state.anchor !== 'BTC' && !hasRate(state.anchor)) {
      state.anchor = 'BTC'; state.raw = format(fromBtc(state.btc,'BTC',{},state.unit),'BTC'); elements.btc.value = state.raw;
    }
    if (state.anchor !== 'BTC') recalculate(state.anchor,state.raw);
    else updateValues();
  } catch {
    state.error = true;
  } finally {
    state.busy = false; elements.refresh.classList.remove('loading'); elements.refresh.disabled = false; showStatus();
  }
}

elements.btc.addEventListener('input', () => recalculate('BTC',elements.btc.value));
elements.btc.addEventListener('focus', () => elements.btc.select());
elements.btcButton.addEventListener('click', () => setUnit('BTC'));
elements.satsButton.addEventListener('click', () => setUnit('SATS'));
elements.refresh.addEventListener('click', refresh);
elements.language.addEventListener('change', () => { state.languageMode = elements.language.value; applyLanguage(); save(); });
elements.add.addEventListener('click', () => { renderOptions(); elements.dialog.showModal(); elements.search.focus(); });
elements.close.addEventListener('click', () => elements.dialog.close());
elements.dialog.addEventListener('click', event => { if (event.target === elements.dialog) elements.dialog.close(); });
elements.search.addEventListener('input', renderOptions);
window.addEventListener('online', () => { showStatus(); refresh(); });
window.addEventListener('offline', showStatus);
setInterval(showStatus, 60_000);

elements.btc.value = '1';
if (state.unit === 'SATS') {
  state.btc = 1/1e8; elements.unit.textContent = 'SATS';
  elements.satsButton.classList.add('selected'); elements.satsButton.setAttribute('aria-pressed','true');
  elements.btcButton.classList.remove('selected'); elements.btcButton.setAttribute('aria-pressed','false');
}
applyLanguage(); refresh();
if ('serviceWorker' in navigator && window.isSecureContext) navigator.serviceWorker.register('./sw.js').catch(() => {});
