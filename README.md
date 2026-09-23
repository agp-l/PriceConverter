# VexlCalc

Nezávislá mobilní kalkulačka pro osobní směnu bitcoinu a běžný převod měn na cestách. Čisté HTML, CSS a JavaScript bez Node.js, frameworků, build kroku a serverové databáze. **VexlCalc není spojený s aplikací Vexl**, nezveřejňuje nabídky ani neprovádí platby.

## Osobní směna

Režim **Osobní směna** počítá výhradně z pohledu uživatele kalkulačky:

- **Nakupuji BTC:** vyplácím fiat a dostávám BTC. Při výchozích −2 % je moje cena za 1 BTC o 2 % pod tržní cenou.
- **Prodávám BTC:** předávám BTC a dostávám fiat. Při výchozích +2 % je moje cena za 1 BTC o 2 % nad tržní cenou.

Obě procenta lze nastavit zvlášť, včetně opačného znaménka. Cena nabídky = tržní cena × (1 + odchylka / 100). Zvolte fiat měnu, zadejte pevnou částku v ní nebo množství BTC/SATS a uvidíte obě strany směny, cenu 1 BTC i rozdíl proti trhu. Když zadáte fiat částku, výsledné BTC se zaokrouhlí na celé satoshi: při prodeji dolů, při nákupu nahoru. Při přímém zadání BTC nelze zadat zlomek satoshi. Síťové poplatky, daně ani jiné náklady kalkulačka nepřičítá; rozdíl proti trhu není čistý zisk.

Kurzy se načítají z veřejných zdrojů popsaných níže. Pokud pro měnu kurz není, nabídka se nevypočte. Poslední použitý kurz, jeho stáří a offline stav jsou viditelné nad kalkulačkou. Nastavení měny, nákupní a prodejní odchylky se ukládá jen v prohlížeči; žádné jednotlivé obchody ani zadané částky se neukládají.

## Převodník a cestování

V záložce **Převodník** přepínáte BTC/SATS a přepočítáváte mezi bitcoinem a vybranými fiat měnami. Měny lze přidávat a odebírat; katalog obsahuje přes 160 kódů včetně PYG. Převádět lze zadáním částky do libovolného pole. **Měna za měnu** ukazuje přímý cestovní přepočet s přepnutím směru. Používá křížový kurz odvozený ze stejných BTC cen (kurz cílové měny / kurz zdrojové měny), nikoli skutečný kurz banky nebo směnárny. Není-li kurz pro některou měnu dostupný, ukáže se upozornění místo smyšleného výsledku.

Aplikace má české a anglické rozhraní. Výchozí **Auto** volí jazyk zařízení; ruční volba se pamatuje. Moduly `rates.js`, `quotes.js`, `currencies.js` a `i18n.js` obsahují výpočty a překlady; rozhraní a stav řídí třída `ConverterApp` v `app.js`. Starý klíč `priceconverter:v1` zůstává kvůli zachování dřívějších nastavení.

## Spuštění a instalace

V kořeni projektu spusťte například:

```sh
python3 -m http.server 8000
```

Otevřete `http://localhost:8000`. Veřejná adresa je `https://convertor.dobrodruzi.cz/`. Tlačítko **Nainstalovat aplikaci** otevře instalační dialog, pokud ho prohlížeč nabízí; jinak ukáže postup pro zařízení. Na iPhonu zvolte v Safari **Sdílet → Přidat na plochu**. Po první návštěvě funguje rozhraní offline a používá poslední uložené kurzy. Při první návštěvě bez připojení kurzy nejsou dostupné.

Web aktualizujte ručně přes FTP: do kořene nahrajte **`index.html`, `style.css`, `app.js`, `rates.js`, `quotes.js`, `currencies.js`, `i18n.js`, `sw.js`, `manifest.json`, `icon.svg`, `icon-192.png` a `icon-512.png`**. Při této aktualizaci jsou důležité zejména nové `quotes.js` a změněné `index.html`, `app.js`, `style.css`, `i18n.js`, `sw.js` a `manifest.json`; ostatní soubory musí na serveru zůstat. `README.md` a `tests/` pro provoz nejsou potřeba. Po nahrání obnovte stránku; již instalovaná PWA může novou verzi načíst při dalším spuštění.

## Zdroje a omezení kurzů

- CoinGecko: `https://api.coingecko.com/api/v3/exchange_rates`
- BitPay: `https://bitpay.com/rates/BTC`
- Blockchain.info: `https://blockchain.info/ticker`

Stejně jako [původní Android projekt](https://github.com/minimalist-freedom-apps/price-converter) se z dostupných zdrojů průměruje BTC cena jedné fiat jednotky. Neplatné kurzy a nefunkční zdroje se přeskočí. Veřejné API musí povolit požadavky z prohlížeče (CORS); výpadek či omezení může počet zdrojů snížit. Výsledek je orientační nabídka pro domluvu, nikoli garantovaný kurz nebo provedení směny.

## Ověření

Při běžícím lokálním serveru otevřete v prohlížeči `http://localhost:8000/tests/`. Bez instalace balíčků se ověří převody, směry obchodu, satoshi, měny, obnovování uložených dat a základní ovládání. Při přidání dalšího jazyka doplňte slovník v `i18n.js`, `SUPPORTED_LANGUAGES` a nabídku v `index.html`.
