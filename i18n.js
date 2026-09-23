// Add a language here, then add its code to SUPPORTED_LANGUAGES.
export const SUPPORTED_LANGUAGES = ['cs', 'en'];

const messages = {
  cs: {
    pageTitle:'VexlCalc · BTC nabídky a měny',
    pageDescription:'Nezávislá kalkulačka pro osobní směnu BTC a cestovní převod měn. Funguje i offline s posledním uloženým kurzem.',
    tagline:'BTC & MĚNY PO RUCE', languageLabel:'Jazyk aplikace', automatic:'Auto',
    refresh:'Aktualizovat kurzy', loading:'Načítám kurzy…', bitcoinInput:'Částka v bitcoinu nebo satoshi',
    bitcoinCaption:'Digitální peníze, bez hranic.', satsCaption:'Malé jednotky. Velké možnosti.',
    bitcoinUnit:'Jednotka bitcoinu', overview:'RYCHLÝ PŘEHLED', myCurrencies:'Moje měny',
    modeLabel:'Režim kalkulačky', converterTab:'Převodník', tradeTab:'Osobní směna',
    travelEyebrow:'NA CESTÁCH', travelHeading:'Měna za měnu', travelAmount:'Kolik převést',
    fromCurrency:'Z měny', toCurrency:'Do měny', swapCurrencies:'Prohodit měny',
    travelResult:'ORIENTAČNÍ VÝSLEDEK', travelRate:'1 {from} ≈ {rate} {to}',
    travelNotice:'Orientační křížový kurz je odvozen z cen BTC. Kurz banky či směnárny se může lišit.',
    tradeEyebrow:'NABÍDKA NAŽIVO', tradeHeading:'Kolik si domluvíte?',
    tradeIntro:'Počítejte z pohledu toho, kdo BTC vykupuje nebo prodává. Obě procenta si nastavíte nezávisle.',
    tradeSideLabel:'Směr obchodu', dealerBuy:'Nakupuji BTC', dealerSell:'Prodávám BTC',
    buyExplanation:'Vykupujete BTC: druhé straně vyplácíte {currency} a získáváte BTC.',
    sellExplanation:'Prodáváte BTC: druhé straně předáváte BTC a přijímáte {currency}.',
    tradeCurrency:'Měna obchodu', buyMargin:'Můj nákup BTC', sellMargin:'Můj prodej BTC',
    marginHint:'Záporné procento = pod tržní cenou. Kladné = nad tržní cenou.',
    iEnter:'Zadávám', fiatAmount:'Částku v měně', bitcoinAmount:'Množství bitcoinu', tradeAmount:'Částka pro nabídku',
    offerEyebrow:'VAŠE NABÍDKA', offerHeading:'Výsledek směny',
    fiatPaid:'Vy vyplácíte', fiatReceived:'Vy přijímáte', btcReceived:'Vy získáte BTC', btcDelivered:'Vy vydáte BTC',
    marketPrice:'Tržní cena 1 BTC', yourPrice:'Vaše cena 1 BTC', marketDifference:'Rozdíl proti trhu',
    tradeNoRate:'Pro {currency} nyní není uložený kurz. Zkuste obnovit kurzy nebo vyberte jinou měnu.',
    invalidAmount:'Zadejte platnou nezápornou částku.',
    invalidPercent:'Zadejte procento větší než −100 a nejvýše 1000.',
    invalidTrade:'Částka je příliš malá nebo ji nelze vyjádřit v celých satoshi.',
    tradeNotice:'Výpočet je orientační. BTC se zaokrouhluje na celé satoshi; síťové a další poplatky nejsou zahrnuty.',
    independentNotice:'Nezávislá kalkulačka, není propojena s aplikací Vexl.',
    addCurrency:'Přidat měnu', indicative:'Kurzy jsou orientační', settings:'NASTAVENÍ',
    installButton:'Nainstalovat aplikaci', installEyebrow:'APLIKACE V MOBILU', installTitle:'Přidat na plochu',
    installIntro:'Otevřete si kalkulačku jedním klepnutím přímo z plochy.',
    installIos:'V Safari otevřete Sdílet → Přidat na plochu → Přidat. Pokud vidíte volbu „Otevřít jako webovou aplikaci“, nechte ji zapnutou.',
    installAndroid:'V nabídce prohlížeče (⋮) zvolte „Instalovat aplikaci“ nebo „Přidat na plochu“.',
    installDesktop:'V nabídce prohlížeče zvolte „Instalovat aplikaci“ nebo „Přidat na plochu“.',
    installHttps:'Pro instalaci otevřete zveřejněnou adresu aplikace přes HTTPS v prohlížeči telefonu.',
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
    pageTitle:'VexlCalc · Bitcoin quotes and currencies',
    pageDescription:'An independent calculator for personal Bitcoin trades and travel currency conversion. Works offline with saved rates.',
    tagline:'BITCOIN & CURRENCIES', languageLabel:'App language', automatic:'Auto',
    refresh:'Refresh rates', loading:'Loading rates…', bitcoinInput:'Amount in bitcoin or satoshis',
    bitcoinCaption:'Digital money, without borders.', satsCaption:'Small units. Big possibilities.',
    bitcoinUnit:'Bitcoin unit', overview:'AT A GLANCE', myCurrencies:'My currencies',
    modeLabel:'Calculator mode', converterTab:'Converter', tradeTab:'Personal trades',
    travelEyebrow:'ON THE ROAD', travelHeading:'Currency to currency', travelAmount:'Amount to convert',
    fromCurrency:'From', toCurrency:'To', swapCurrencies:'Swap currencies',
    travelResult:'ESTIMATED RESULT', travelRate:'1 {from} ≈ {rate} {to}',
    travelNotice:'This cross rate is estimated from BTC prices. Your bank or exchange rate may differ.',
    tradeEyebrow:'YOUR LIVE QUOTE', tradeHeading:'Set your own price',
    tradeIntro:'The trade direction is from your perspective. Set separate percentages for buying and selling BTC.',
    tradeSideLabel:'Trade direction', dealerBuy:'I buy BTC', dealerSell:'I sell BTC',
    buyExplanation:'You buy BTC: pay the other party in {currency} and receive BTC.',
    sellExplanation:'You sell BTC: send BTC to the other party and receive {currency}.',
    tradeCurrency:'Trade currency', buyMargin:'My BTC buy price', sellMargin:'My BTC sell price',
    marginHint:'A negative percentage is below market. A positive one is above market.',
    iEnter:'I enter', fiatAmount:'Fiat amount', bitcoinAmount:'Bitcoin amount', tradeAmount:'Quote amount',
    offerEyebrow:'YOUR QUOTE', offerHeading:'Trade result',
    fiatPaid:'You pay', fiatReceived:'You receive', btcReceived:'You receive BTC', btcDelivered:'You send BTC',
    marketPrice:'Market price per BTC', yourPrice:'Your price per BTC', marketDifference:'Difference from market',
    tradeNoRate:'No saved rate for {currency}. Refresh rates or choose another currency.',
    invalidAmount:'Enter a valid non-negative amount.',
    invalidPercent:'Enter a percentage greater than −100 and no more than 1000.',
    invalidTrade:'The amount is too small or cannot be expressed in whole satoshis.',
    tradeNotice:'This is an estimate. BTC is rounded to whole satoshis; network and other fees are not included.',
    independentNotice:'Independent calculator, not affiliated with the Vexl app.',
    addCurrency:'Add currency', indicative:'Rates are indicative', settings:'SETTINGS',
    installButton:'Install app', installEyebrow:'ON YOUR PHONE', installTitle:'Add to Home Screen',
    installIntro:'Open the calculator with one tap from your Home Screen.',
    installIos:'In Safari, tap Share → Add to Home Screen → Add. If you see “Open as Web App”, leave it enabled.',
    installAndroid:'In the browser menu (⋮), choose “Install app” or “Add to Home Screen”.',
    installDesktop:'In the browser menu, choose “Install app” or “Add to Home Screen”.',
    installHttps:'To install, open the published app over HTTPS in your phone browser.',
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
