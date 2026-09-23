import {parseAmount} from './rates.js';

const SATS_PER_BTC = 100_000_000;
const validRate = value => typeof value === 'number' && Number.isFinite(value) && value > 0;

export function parsePercent(raw, language = 'cs') {
  const value = String(raw).trim();
  const negative = /^[-−]/.test(value);
  const unsigned = value.replace(/^[-−+]/, '');
  const parsed = parseAmount(unsigned, language);
  if (parsed === null) return null;
  const result = negative ? -parsed : parsed;
  return result > -100 && result <= 1000 ? result : null;
}

// Side always describes the calculator owner's action, never the customer's.
export function tradeQuote({marketRate, percent, side, amount, amountKind = 'fiat', unit = 'BTC'}) {
  if (!validRate(marketRate) || !Number.isFinite(percent) || percent <= -100 || percent > 1000 ||
      !['buy', 'sell'].includes(side) || !Number.isFinite(amount) || amount < 0 ||
      !['fiat', 'bitcoin'].includes(amountKind) || !['BTC', 'SATS'].includes(unit)) return null;
  const offeredRate = marketRate * (1 + percent / 100);
  if (!validRate(offeredRate)) return null;
  let sats;
  let fiat;
  if (amountKind === 'fiat') {
    fiat = amount;
    const unroundedSats = amount / offeredRate * SATS_PER_BTC;
    if (!Number.isSafeInteger(Math.floor(unroundedSats))) return null;
    // A fixed cash amount never yields a fractional satoshi. For a sale, do
    // not give more BTC than the cash covers; for a purchase, request enough.
    sats = side === 'sell' ? Math.floor(unroundedSats) : Math.ceil(unroundedSats);
  } else {
    const unroundedSats = unit === 'SATS' ? amount : amount * SATS_PER_BTC;
    const wholeSats = Math.round(unroundedSats);
    if (!Number.isSafeInteger(wholeSats) || wholeSats < 0 || Math.abs(unroundedSats - wholeSats) > 1e-6) return null;
    sats = wholeSats;
    fiat = sats / SATS_PER_BTC * offeredRate;
  }
  if (!Number.isFinite(fiat) || !Number.isSafeInteger(sats) || (amount > 0 && sats === 0)) return null;
  const btc = sats / SATS_PER_BTC;
  const difference = (side === 'buy' ? marketRate - offeredRate : offeredRate - marketRate) * btc;
  return {marketRate, offeredRate, percent, side, fiat, sats, btc, difference};
}

// A fiat-to-fiat estimate derived from the same BTC quotes as the converter.
export function travelQuote(amount, from, to, rates) {
  if (!Number.isFinite(amount) || amount < 0) return null;
  if (from === to) return {rate:1, result:amount};
  const source = rates?.[from];
  const target = rates?.[to];
  if (!validRate(source) || !validRate(target)) return null;
  const rate = target / source;
  const result = amount * rate;
  return validRate(rate) && Number.isFinite(result) ? {rate, result} : null;
}
