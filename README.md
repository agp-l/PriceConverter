# PriceConverter

Samostatná mobilně pojatá webová aplikace pro okamžitý převod mezi BTC, satoshi a fiat měnami. Čisté HTML, CSS a JavaScript bez frameworků, build kroku a serverové databáze.

## Použití

Otevřete `index.html` přes HTTPS nebo na lokálním serveru. Zadejte částku do libovolného pole: ostatní řádky se hned přepočítají. Přepínač BTC / SATS převádí bitcoinovou částku, měny můžete přidávat a odebírat. Katalog obsahuje přes 160 měnových kódů včetně PYG; chybějící kurz se v seznamu jasně označí a jeho pole nelze upravovat. Rozložení a poslední úspěšně načtené kurzy se ukládají v prohlížeči.

Rozhraní je česky a anglicky. Výchozí volba **Auto** vybere první podporovaný jazyk zařízení; pokud žádný neodpovídá, použije angličtinu. Přepínač v záhlaví umožní volit **Auto**, **Čeština** a **English**, ruční volba se pamatuje. Čísla i názvy měn odpovídají zvolenému jazyku. Název aplikace zůstává **PriceConverter** (anglicky „converter“ znamená převodník).

Pro lokální spuštění například:

```sh
python3 -m http.server 8000
```

Potom otevřete `http://localhost:8000`. Na telefonu aplikaci hostujte přes HTTPS (např. GitHub Pages z kořene větve `main`) a v nabídce prohlížeče zvolte **Instalovat aplikaci** / **Přidat na plochu**. Manifest, service worker a ikony umožňují samostatné spuštění bez lišty prohlížeče. Po první návštěvě funguje prostředí offline; převody fungují s naposledy uloženými kurzy. Při první návštěvě bez připojení nejsou k dispozici žádné směnné kurzy.

## Zdroje kurzů

- CoinGecko: `https://api.coingecko.com/api/v3/exchange_rates`
- BitPay: `https://bitpay.com/rates/BTC`
- Blockchain.info: `https://blockchain.info/ticker`

Stejně jako [původní Android projekt](https://github.com/minimalist-freedom-apps/price-converter) aplikace bere z dostupných zdrojů průměr hodnoty jedné fiat jednotky v BTC. Neplatný kurz a nedostupný zdroj přeskočí. Požadavky jdou přímo z prohlížeče, proto veřejné API musí povolit CORS; limity nebo změny těchto služeb mohou počet zdrojů snížit. Datum posledního úspěšného načtení a informace o starším či offline kurzu jsou viditelné nad převodníkem. Kurzy jsou orientační, nejde o nabídku směny.

## Ověření

```sh
node --test tests/*.test.mjs
```

Provozní soubory nepotřebují Node.js. Aplikace i service worker používají relativní cesty, takže fungují také v podadresáři GitHub Pages.

Nový jazyk přidejte do slovníku v `i18n.js` a do `SUPPORTED_LANGUAGES`. Názvy měn poskytuje pro zvolený jazyk `Intl.DisplayNames` v `currencies.js` (při nepodporovaném jazyku zůstává kód měny). Přepínač v `index.html` doplňte o další volbu. Překlady, formát částek a názvy měn jsou oddělené od načítání kurzů.
