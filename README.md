<p align="center"><img src="./icon.svg" alt="VexlCalc icon" width="80"></p>

<h1 align="center">VexlCalc</h1>

<p align="center">
  Bitcoin trades and travel currencies in your pocket.<br>
  <a href="https://vexlcalc.dobrodruzi.cz/"><strong>Open the app</strong></a>
</p>

---

### What it does

- **Convert:** BTC, sats and 160+ currencies.
- **Personal trades:** Set a margin for buying or selling BTC and share a quote.
- **Travel:** Compare an exchange counter's rate and fee with the online estimate.
- **BTC chart:** Explore prices with TradingView.
- **On your phone:** Installable PWA in 13 languages; saved rates work offline.

### Run locally

```sh
python3 -m http.server 8000
```

Open [localhost:8000](http://localhost:8000/). Browser tests: [localhost:8000/tests/](http://localhost:8000/tests/). To deploy, upload the static files to an HTTPS host.

**Stack:** HTML, CSS and vanilla JavaScript. No build step or backend.

### Android APK

The [Android project](./android/README.md) packages this full PWA inside a Kotlin Android app. Download the debug APK from the latest successful [Android APK workflow](https://github.com/agp-l/VexlCalc/actions/workflows/android.yml), or build it in Android Studio. The website and APK share the same calculators and translations.

The current test APK can be [downloaded directly](https://github.com/agp-l/VexlCalc/raw/refs/heads/main/downloads/VexlCalc-android.apk) from the app menu. It uses a CI debug signature; future test builds may require uninstalling an earlier version first.

<sub>Independent project; not affiliated with Vexl.</sub>
