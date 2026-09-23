import test from 'node:test';
import assert from 'node:assert/strict';
import {CURRENCIES, averageRates, parseAmount, btcFrom, fromBtc, fetchRates} from '../rates.js';

test('The currency catalog includes PYG and other ISO currencies', () => {
  assert.ok(CURRENCIES.length >= 150);
  assert.deepEqual(CURRENCIES.find(currency => currency.code === 'PYG')?.flag, '🇵🇾');
  assert.ok(CURRENCIES.some(currency => currency.code === 'CLP'));
});

test('BTC and sats keep the same value when the unit changes', () => {
  const rates = {CZK:2_000_000};
  assert.equal(fromBtc(0.00000001,'BTC',rates,'SATS'),1);
  assert.equal(btcFrom(1,'BTC',rates,'SATS'),0.00000001);
  assert.equal(fromBtc(btcFrom(500,'CZK',rates),'CZK',rates),500);
});

test('Czech decimal input and invalid numbers', () => {
  assert.equal(parseAmount('1 234,50'),1234.5);
  assert.equal(parseAmount('0.00000001'),0.00000001);
  assert.equal(parseAmount(''),null);
  assert.equal(parseAmount('-1'),null);
  assert.equal(parseAmount('1,2,3'),null);
  assert.equal(parseAmount('Infinity'),null);
});

test('English grouping and decimals remain editable after a language switch', () => {
  assert.equal(parseAmount('1,234.5','en'),1234.5);
  assert.equal(parseAmount('1,234','en'),1234);
  assert.equal(parseAmount('1.234,5','cs'),1234.5);
  assert.equal(parseAmount('1,234.5','cs'),null);
});

test('Rates average the BTC cost of one fiat unit and ignore unsupported data', () => {
  const result = averageRates([{CZK:100,EUR:50,BTC:1},{CZK:200,EUR:-1,USD:Infinity}]);
  assert.ok(Math.abs(result.CZK - (1 / ((1/100 + 1/200) / 2))) < 1e-10);
  assert.equal(result.EUR,50);
  assert.equal(result.BTC,undefined);
  assert.equal(result.USD,undefined);
});

test('One failed provider does not prevent conversion from valid providers', async () => {
  const fakeFetch = async url => {
    if (url.includes('coingecko')) throw new Error('offline');
    if (url.includes('bitpay')) return {ok:true,json:async () => ({data:[{code:'CZK',rate:2_000_000},{code:'EUR',rate:75_000}]})};
    return {ok:true,json:async () => ({CZK:{last:1_800_000},EUR:{last:72_000}})};
  };
  const result = await fetchRates(fakeFetch);
  assert.deepEqual(result.sources,['BitPay','Blockchain.info']);
  assert.ok(result.rates.CZK > 1_800_000 && result.rates.CZK < 2_000_000);
});

test('PYG from BitPay can be converted to BTC and sats', async () => {
  const fakeFetch = async url => {
    if (!url.includes('bitpay')) throw new Error('offline');
    return {ok:true,json:async () => ({data:[{code:'PYG',rate:510_000_000}]})};
  };
  const {rates} = await fetchRates(fakeFetch);
  assert.equal(rates.PYG,510_000_000);
  assert.ok(Math.abs(fromBtc(btcFrom(5_100,'PYG',rates),'BTC',rates,'SATS') - 1000) < 1e-8);
});

test('All failed providers do not produce a made-up rate', async () => {
  await assert.rejects(fetchRates(async () => { throw new Error('offline'); }),/Kurzy nelze načíst/);
});
