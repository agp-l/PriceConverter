# PriceConverter

Samostatná mobilně pojatá webová aplikace pro okamžitý převod mezi BTC, satoshi a fiat měnami. Čisté HTML, CSS a JavaScript bez Node.js, frameworků, build kroku a serverové databáze. Rozhraní a stav řídí třída `ConverterApp` v ES modulu `app.js`; výpočty kurzů, měny a překlady mají samostatné moduly.

## Použití

Otevřete `index.html` přes HTTPS nebo na lokálním serveru. Zadejte částku do libovolného pole: ostatní řádky se hned přepočítají. Přepínač BTC / SATS převádí bitcoinovou částku, měny můžete přidávat a odebírat. Katalog obsahuje přes 160 měnových kódů včetně PYG; chybějící kurz se v seznamu jasně označí a jeho pole nelze upravovat. Rozložení a poslední úspěšně načtené kurzy se ukládají v prohlížeči.

Rozhraní je česky a anglicky. Výchozí volba **Auto** vybere první podporovaný jazyk zařízení; pokud žádný neodpovídá, použije angličtinu. Přepínač v záhlaví umožní volit **Auto**, **Čeština** a **English**, ruční volba se pamatuje. Čísla i názvy měn odpovídají zvolenému jazyku. Název aplikace zůstává **PriceConverter** (anglicky „converter“ znamená převodník).

Pro lokální spuštění například:

```sh
python3 -m http.server 8000
```

Potom otevřete `http://localhost:8000`. Zveřejněná aplikace běží na `https://convertor.dobrodruzi.cz/`. V aplikaci je tlačítko **Nainstalovat aplikaci**: v prohlížeči s dostupnou instalační výzvou ji otevře, jinde zobrazí postup pro konkrétní zařízení. Na iPhonu se instalace sama nenabízí: v Safari zvolte **Sdílet → Přidat na plochu**. Na Androidu lze také použít nabídku prohlížeče **Instalovat aplikaci** / **Přidat na plochu**. Otevření souboru na GitHubu či pomocí `file://` instalaci PWA nenabízí; je nutná adresa skutečně zveřejněné aplikace. Manifest, service worker a ikony umožňují samostatné spuštění bez lišty prohlížeče. Po první návštěvě funguje prostředí offline; převody fungují s naposledy uloženými kurzy. Při první návštěvě bez připojení nejsou k dispozici žádné směnné kurzy.

Při nasazení nahrajte také `manifest.json`, `sw.js` a soubory `icon.svg`, `icon-192.png` a `icon-512.png` do kořene webu. Pouhé nahrání HTML a JS nestačí: chybějící ikony znemožní instalaci a přeruší přednačtení pro offline režim. Při této aktualizaci nahrajte zejména změněné `app.js`, `rates.js`, `currencies.js` a `sw.js`; `README.md` ani složku `tests/` na web nahrávat nemusíte.

## Zdroje kurzů

- CoinGecko: `https://api.coingecko.com/api/v3/exchange_rates`
- BitPay: `https://bitpay.com/rates/BTC`
- Blockchain.info: `https://blockchain.info/ticker`

Stejně jako [původní Android projekt](https://github.com/minimalist-freedom-apps/price-converter) aplikace bere z dostupných zdrojů průměr hodnoty jedné fiat jednotky v BTC. Neplatný kurz a nedostupný zdroj přeskočí. Požadavky jdou přímo z prohlížeče, proto veřejné API musí povolit CORS; limity nebo změny těchto služeb mohou počet zdrojů snížit. Datum posledního úspěšného načtení a informace o starším či offline kurzu jsou viditelné nad převodníkem. Kurzy jsou orientační, nejde o nabídku směny.

## Ověření

Spusťte stejný lokální server jako výše a v prohlížeči otevřete `http://localhost:8000/tests/`. Testy převodů, jazyka, obnovy uložených dat a skutečného rozhraní běží přímo v prohlížeči, bez instalace balíčků. Aplikace i service worker používají relativní cesty, takže fungují také v podadresáři.

Nový jazyk přidejte do slovníku v `i18n.js` a do `SUPPORTED_LANGUAGES`. Názvy měn poskytuje pro zvolený jazyk `Intl.DisplayNames` v `currencies.js` (při nepodporovaném jazyku zůstává kód měny). Přepínač v `index.html` doplňte o další volbu. Překlady, formát částek a názvy měn jsou oddělené od načítání kurzů.
