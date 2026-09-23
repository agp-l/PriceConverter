// Add a language here, then add its code to SUPPORTED_LANGUAGES.
export const SUPPORTED_LANGUAGES = ['cs', 'en'];

const messages = {
  cs: {
    pageTitle:'PriceConverter · Bitcoin v kapse',
    pageDescription:'Jednoduchý převodník bitcoinu, satoshi a světových měn. Funguje i offline s posledním uloženým kurzem.',
    tagline:'JEDNODUŠE PŘEPOČÍTAT', languageLabel:'Jazyk aplikace', automatic:'Auto',
    refresh:'Aktualizovat kurzy', loading:'Načítám kurzy…', bitcoinInput:'Částka v bitcoinu nebo satoshi',
    bitcoinCaption:'Digitální peníze, bez hranic.', satsCaption:'Malé jednotky. Velké možnosti.',
    bitcoinUnit:'Jednotka bitcoinu', overview:'RYCHLÝ PŘEHLED', myCurrencies:'Moje měny',
    addCurrency:'Přidat měnu', indicative:'Kurzy jsou orientační', settings:'NASTAVENÍ',
    close:'Zavřít', searchLabel:'Hledat podle názvu nebo kódu', searchPlaceholder:'Třeba PLN nebo zlotý',
    emptyState:'Zatím tu nejsou žádné měny. Přidejte si první.', noMatches:'Žádná další měna neodpovídá hledání.',
    noRate:'Bez kurzu', noRateShort:'bez kurzu', missingRate:'Kurz pro {code} momentálně není dostupný',
    amountIn:'Částka v měně {name}', remove:'Odebrat {name}',
    ratesUnavailable:'Kurzy nedostupné · zkuste obnovit', ratesWaiting:'Čekám na kurzy…',
    offline:'Offline · uložený kurz', saved:'Uložený kurz', old:'Starší kurz',
    fresh:'{sources} · aktualizováno', sourceTitle:'Zdroje: {sources} · {date}',
    justNow:'právě teď', minutesAgo:'před {count} min', hoursAgo:'před {count} h', daysAgo:'před {count} d',
    sourceOne:'zdroj', sourceFew:'zdroje', sourceMany:'zdrojů'
  },
  en: {
    pageTitle:'PriceConverter · Bitcoin in your pocket',
    pageDescription:'A simple Bitcoin, sats and currency converter. Works offline with the last saved rates.',
    tagline:'CONVERT IN AN INSTANT', languageLabel:'App language', automatic:'Auto',
    refresh:'Refresh rates', loading:'Loading rates…', bitcoinInput:'Amount in bitcoin or satoshis',
    bitcoinCaption:'Digital money, without borders.', satsCaption:'Small units. Big possibilities.',
    bitcoinUnit:'Bitcoin unit', overview:'AT A GLANCE', myCurrencies:'My currencies',
    addCurrency:'Add currency', indicative:'Rates are indicative', settings:'SETTINGS',
    close:'Close', searchLabel:'Search by name or code', searchPlaceholder:'For example, PLN or zloty',
    emptyState:'No currencies yet. Add your first one.', noMatches:'No more currencies match your search.',
    noRate:'No rate', noRateShort:'no rate', missingRate:'No rate is currently available for {code}',
    amountIn:'Amount in {name}', remove:'Remove {name}',
    ratesUnavailable:'Rates unavailable · try refreshing', ratesWaiting:'Waiting for rates…',
    offline:'Offline · saved rates', saved:'Saved rates', old:'Older rates',
    fresh:'{sources} · updated', sourceTitle:'Sources: {sources} · {date}',
    justNow:'just now', minutesAgo:'{count} min ago', hoursAgo:'{count} h ago', daysAgo:'{count} d ago',
    sourceOne:'source', sourceFew:'sources', sourceMany:'sources'
  }
};

export function detectLanguage(languages = []) {
  for (const locale of languages) {
    const code = String(locale).toLowerCase().split('-')[0];
    if (SUPPORTED_LANGUAGES.includes(code)) return code;
  }
  return 'en';
}

export function resolveLanguage(mode, languages = []) {
  return SUPPORTED_LANGUAGES.includes(mode) ? mode : detectLanguage(languages);
}

export function t(language, key, parameters = {}) {
  const template = messages[language]?.[key] ?? messages.en[key] ?? key;
  return template.replace(/\{(\w+)\}/g, (_, name) => String(parameters[name] ?? ''));
}

export function ageText(language, minutes) {
  if (minutes < 1) return t(language,'justNow');
  const key = minutes < 60 ? 'minutesAgo' : minutes < 1440 ? 'hoursAgo' : 'daysAgo';
  const count = minutes < 60 ? minutes : minutes < 1440 ? Math.floor(minutes/60) : Math.floor(minutes/1440);
  return t(language,key,{count});
}

export function sourceCount(language, count) {
  const key = language === 'cs' ? count === 1 ? 'sourceOne' : count >= 2 && count <= 4 ? 'sourceFew' : 'sourceMany' : count === 1 ? 'sourceOne' : 'sourceMany';
  return `${count} ${t(language,key)}`;
}
