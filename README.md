# VexlCalc

A pocket-sized Bitcoin trade calculator and travel currency converter. [Open the app](https://convertor.dobrodruzi.cz/).

VexlCalc is a standalone progressive web app built with HTML, CSS, and vanilla JavaScript. It runs in the browser with no account, Node.js, framework, build step, or backend. You can add it to your phone's home screen.

> VexlCalc is an independent project and is not affiliated with Vexl. It calculates estimates; it does not publish offers, arrange trades, or move money.

## What you can do

### Convert Bitcoin and currencies

- Enter an amount in BTC, sats, or any selected fiat currency to update the other amounts.
- Switch the Bitcoin display between **BTC** and **SATS**.
- Add or remove currencies from a catalog of more than 160 codes, including **PYG**.
- Use the travel converter to estimate a fiat-to-fiat amount and swap its direction.

The fiat-to-fiat estimate is derived from the available BTC prices: **target fiat per BTC ÷ source fiat per BTC**. It is not a bank or currency exchange quote. A currency can be listed without having a rate from the current providers; the app shows that a rate is missing instead of inventing one.

### Calculate a personal Bitcoin trade

The **Personal trade** tab uses *your* perspective throughout:

| Action | You give | You receive | Default adjustment to the reference BTC price |
| --- | --- | --- | --- |
| **I buy BTC** | Fiat | BTC | −2% |
| **I sell BTC** | BTC | Fiat | +2% |

Set separate, signed percentages for buying and selling. For either direction, **your price for 1 BTC = reference price × (1 + adjustment / 100)**. For example, with a reference price of 2,000,000 CZK/BTC, −2% gives 1,960,000 CZK/BTC and +2% gives 2,040,000 CZK/BTC. These defaults are editable, not recommendations.

Choose a fiat currency, enter either a fixed fiat amount or a BTC/SATS amount, and see the amounts exchanged, your price per BTC, and the difference from the reference price. You can use the last downloaded rate or enter your own reference price, including for a currency such as PYG when no automatic rate is available. The manual price lasts only for the current app session and is reset when you change the trade currency.

Trades use whole satoshis. For a fixed fiat amount, BTC is rounded **up when you buy** and **down when you sell**. The displayed difference is an arithmetic comparison with the reference price, **not net profit**; network fees, taxes, and other costs are not included.

## Rates, storage, and offline use

The browser requests BTC-to-fiat rates from [CoinGecko](https://api.coingecko.com/api/v3/exchange_rates), [BitPay](https://bitpay.com/rates/BTC), and [Blockchain.info](https://blockchain.info/ticker). Each provider reports fiat units per BTC. VexlCalc averages the *inverse* (BTC per fiat unit) from the providers that return a valid rate for a given currency, then converts that average back to fiat per BTC. Unavailable providers and invalid rates are skipped. Browser access to a provider depends on its availability and CORS policy.

The app shows the age of its last downloaded rates and lets you refresh them. Its service worker caches the app files for offline opening after a successful visit; the last downloaded rates are kept in browser storage. Offline results can be stale. On a first visit without a connection or a saved rate, conversions that need a rate are unavailable.

Settings and cached rates live in your browser's `localStorage` under `priceconverter:v1` (the existing key is retained for compatibility). Saved settings include currencies, display unit, language, mode, trade adjustments, and conversion choices. Entered trade amounts, individual trades, and a manually entered reference price are not saved. The app has no account or server-side trade history; fetching rates sends requests to the named third-party providers.

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

On Android, use the app's **Install app** button or the browser's install/add-to-home-screen menu. On iPhone, open the site in Safari and use **Share → Add to Home Screen**. The button provides device-specific instructions when the browser does not offer an install prompt.

## Project files

| File | Purpose |
| --- | --- |
| `index.html`, `style.css` | App structure and mobile-first styling |
| `app.js` | `ConverterApp` UI, state, persistence, and install flow |
| `rates.js`, `quotes.js` | Rate fetching and conversion/trade calculations |
| `currencies.js`, `i18n.js` | Currency catalog and interface translations |
| `manifest.json`, `sw.js`, `icon*` | PWA metadata, offline app shell, and icons |
| `tests/` | Browser-run tests; no Node.js required |

To add another interface language, add its translations and code to `i18n.js`, then add the language option to `index.html`.
