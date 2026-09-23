# VexlCalc

A pocket-sized Bitcoin trade calculator and travel currency converter. [Open the app](https://convertor.dobrodruzi.cz/).

VexlCalc is a standalone progressive web app built with HTML, CSS, and vanilla JavaScript. It runs in the browser with no account, Node.js, framework, build step, or backend. You can add it to your phone's home screen. The compact mobile layout and side menu work on phones and desktop screens. Use the menu to open **Converter**, **Currency to currency**, **Personal trades**, **BTC chart**, or **Settings**; you can also install the app and change the language there.

> VexlCalc is an independent project and is not affiliated with Vexl. It calculates estimates; it does not publish offers, arrange trades, or move money.

## What you can do

### Convert Bitcoin and currencies

- Enter an amount in BTC, sats, or any selected fiat currency to update the other amounts.
- Switch the Bitcoin display between **BTC** and **SATS**.
- Add or remove currencies from a catalog of more than 160 codes, including **PYG**. Tap **Reorder**, use the up/down buttons, and tap **Done**; the order is saved on this device.

The converter shows your selected currencies together and updates them when you edit any amount. The separate **Currency to currency** screen is for a quick pair conversion: choose two fiat currencies, enter an amount, and swap the direction with one tap. Its estimate is derived from the available BTC prices: **target fiat per BTC ÷ source fiat per BTC**. It is not a bank or currency exchange quote. A currency can be listed without having a rate from the current providers; the app shows that a rate is missing instead of inventing one.

On that screen, enter the **exchange counter's quoted rate** in whichever direction its price board uses: how much target currency you get for one source unit, or how much source currency you pay for one target unit. Optionally enter a fixed fee in the **source** currency. The app compares what you receive at the counter (after that fee) with what the same total source amount would yield at the online reference rate. It shows the gain or loss in the currency received, the percentage of the reference result, and the equivalent amount in the currency paid. Switching either currency or swapping the direction clears the old quoted rate and fee to prevent applying them to a different pair. Without a valid reference rate it cannot calculate a comparison; the exchange counter's rate by itself is insufficient.

By default, the converter shows a compact **12-month BTC/USD** chart from TradingView (Bitstamp market). Use **BTC chart** in the menu or tap **Full chart** in the converter to open the full interactive chart, which fills the available height of the app. In **Settings**, turn the small converter chart on or off and choose 1 month, 3 months, 1 year, 5 years, or MAX (all available history). Both choices are saved on this device. Turning the small chart off unloads its embed, while the separate chart screen remains available. Its initial period follows the setting, and you can change the timeframe with the full chart's own controls. Charts require the internet and use separate market data from the three-source reference rates used by calculations; the displayed price need not match the converter. The full chart loads when you visit its screen. TradingView's embedded controls appear in English; the app's own labels remain available in Czech and English.

### Calculate a personal Bitcoin trade

The **Personal trades** screen uses *your* perspective throughout:

| Action | You give | You receive | With a 2% rate advantage |
| --- | --- | --- | --- |
| **I buy BTC** | Fiat | BTC | Pay 2% less per BTC |
| **I sell BTC** | BTC | Fiat | Receive 2% more per BTC |

Enter **one percentage** for both directions (2% by default). VexlCalc applies it in your favor: **buy price = reference price × (1 − percentage / 100)**; **sell price = reference price × (1 + percentage / 100)**. For example, at a reference price of 2,000,000 CZK/BTC, 2% means buying at 1,960,000 CZK/BTC or selling at 2,040,000 CZK/BTC. The line below the field explains the current direction. A negative percentage reverses the advantage; 0% uses the reference price. Valid entries are strictly between −100% and 100%.

Choose a fiat currency, enter either a fixed fiat amount or a BTC/SATS amount, and see the amounts exchanged, your price per BTC, and the difference from the reference price. You can use the last downloaded rate or enter your own reference price, including for a currency such as PYG when no automatic rate is available. The manual price lasts only for the current app session and is reset when you change the trade currency.

Use **Share offer** to send the current quote through your device's share menu, or **Copy** to paste it into a conversation. The message states whether you buy or sell BTC, the exact satoshi amount, fiat amount, your offered price per BTC, and the time it was calculated. When using a downloaded reference rate, it also includes when that rate was fetched. It does not disclose your percentage margin or the difference from the reference rate. Share is shown when supported by the browser; Copy works where clipboard access is available and otherwise opens a selectable text box. An invalid quote cannot be shared.

Trades use whole satoshis. For a fixed fiat amount, BTC is rounded **up when you buy** and **down when you sell**. The displayed difference is an arithmetic comparison with the reference price, **not guaranteed earnings or net profit**; network fees, taxes, and other costs are not included.

## Rates, storage, and offline use

The browser requests BTC-to-fiat rates from [CoinGecko](https://api.coingecko.com/api/v3/exchange_rates), [BitPay](https://bitpay.com/rates/BTC), and [Blockchain.info](https://blockchain.info/ticker). Each provider reports fiat units per BTC. VexlCalc averages the *inverse* (BTC per fiat unit) from the providers that return a valid rate for a given currency, then converts that average back to fiat per BTC. Unavailable providers and invalid rates are skipped. Browser access to a provider depends on its availability and CORS policy.

The app shows the age of its last downloaded rates and lets you refresh them. Its service worker caches the app files for offline opening after a successful visit; the last downloaded rates are kept in browser storage. Offline results can be stale. On a first visit without a connection or a saved rate, conversions that need a rate are unavailable. TradingView embeds are fetched from TradingView and are not part of the offline app cache.

Settings and cached rates live in your browser's `localStorage` under `priceconverter:v1` (the existing key is retained for compatibility). Saved settings include selected currencies **and their order**, display unit, language, current screen, chart visibility and period, one trade percentage, and conversion choices. An existing pair of buy/sell percentages is migrated using the direction last selected. Entered trade amounts, exchange counter quotes and fees, individual trades, and a manually entered reference price are not saved. The app has no account or server-side trade history; fetching rates sends requests to the named third-party providers. When visible and online, TradingView charts connect to TradingView.

The interface supports **English and Czech**. **Auto** follows the device language; a manual choice is remembered.

## Run locally

Serve this directory over HTTP, for example:

```sh
python3 -m http.server 8000
```

Open [http://localhost:8000/](http://localhost:8000/). Opening `index.html` directly from `file://` is not supported because the app uses JavaScript modules. No package installation is needed.

For the dependency-free browser test suite, keep the server running and open [http://localhost:8000/tests/](http://localhost:8000/tests/). It covers calculations, settings restoration, and key UI interactions.

## Deploy and install

The public deployment at [convertor.dobrodruzi.cz](https://convertor.dobrodruzi.cz/) is updated manually via FTP. Upload the following files together to the site's web root:

```text
index.html       style.css        app.js           rates.js
quotes.js        currencies.js    i18n.js          sw.js
manifest.json    icon.svg         icon-192.png     icon-512.png
```

Preserve their relative paths. `README.md` and `tests/` are development files and are not needed on the server. Use HTTPS for the hosted PWA; `localhost` works for local development. After uploading, reload the page. An installed copy may pick up updated cached files on a subsequent launch.

On Android, use **Install app** in the app's side menu or the browser's install/add-to-home-screen menu. On iPhone, open the site in Safari and use **Share → Add to Home Screen**. The menu action provides device-specific instructions when the browser does not offer an install prompt.

## Source and support

The side menu links to this [open-source repository](https://github.com/agp-l/PriceConverter). Its **Support the project** action provides a Bitcoin address and a Lightning **BOLT12 offer** to copy; the Bitcoin button can also open a compatible wallet. The Lightning string begins with `lno1`, which identifies a BOLT12 offer rather than an LNURL (`lnurl1`). Use a wallet that supports BOLT12 offers.

## Project files

| File | Purpose |
| --- | --- |
| `index.html`, `style.css` | App structure and mobile-first styling |
| `app.js` | `ConverterApp` UI, state, persistence, and install flow |
| `rates.js`, `quotes.js` | Rate fetching and conversion, exchange comparison, and trade calculations |
| `currencies.js`, `i18n.js` | Currency catalog and interface translations |
| `manifest.json`, `sw.js`, `icon*` | PWA metadata, offline app shell, and icons |
| `tests/` | Browser-run tests; no Node.js required |

To add another interface language, add its translations and code to `i18n.js`, then add the language option to `index.html`.
