import test from 'node:test';
import assert from 'node:assert/strict';
import {detectLanguage, resolveLanguage, t, ageText, sourceCount} from '../i18n.js';
import {getCurrencies} from '../currencies.js';

test('Automatic language follows device preferences; manual choice wins', () => {
  assert.equal(detectLanguage(['cs-CZ','en-US']),'cs');
  assert.equal(detectLanguage(['fr-FR','en-GB']),'en');
  assert.equal(resolveLanguage('cs',['en-US']),'cs');
  assert.equal(resolveLanguage('auto',['en-US']),'en');
});

test('Labels and status are translated without changing values', () => {
  assert.equal(t('cs','myCurrencies'),'Moje měny');
  assert.equal(t('en','myCurrencies'),'My currencies');
  assert.equal(t('en','amountIn',{name:'Paraguayan Guarani'}),'Amount in Paraguayan Guarani');
  assert.equal(ageText('en',61),'1 h ago');
  assert.equal(sourceCount('cs',3),'3 zdroje');
});

test('Currency codes and flags stay stable when names change language', () => {
  const cs = getCurrencies('cs').find(currency => currency.code === 'PYG');
  const en = getCurrencies('en').find(currency => currency.code === 'PYG');
  assert.equal(cs.flag,en.flag);
  assert.equal(en.code,'PYG');
  assert.notEqual(cs.name,en.name);
});
