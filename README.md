# myTickrs

**A private investment ledger for stocks and options, across the world's stock markets.**

You record your trades and myTickrs works out your holdings, cost basis, profit and loss, and
performance charts. It gives you one view of every brokerage account in every currency, and it
answers the questions a brokerage app usually doesn't: *what did I actually pay, what have I earned,
and how is each position doing?*

This is the source-available **desktop edition**:

- **Free for noncommercial use.** The source is published under the PolyForm Noncommercial 1.0.0
  license, with no subscription, no ads and no usage limits for personal and other noncommercial
  use. The built-in Yahoo Finance provider needs no API key, so it works without
  signing up anywhere.
- **Your data stays on your computer.** Everything is kept in one SQLite file on your own machine.
  There is no account, no sign-in, no telemetry and no server of ours in between.

> myTickrs is a record-keeping tool. It does not place trades, connect to brokers for execution,
> or give investment advice.

---

## Features

### 📸 AI import: start an account from a screenshot

Setting up a new account can be as simple as taking a screenshot of your current holdings.

- **Take a screenshot** of the positions page in your broker's app or website, and drop it on the
  **Import** page. AI reads each holding from it: ticker, quantity, average price, and unrealized
  and realized P/L. Stocks, ETFs and options are all read.
- **Review before saving.** Every holding is listed with a checkbox, so you can correct or leave out
  any row. Rows the AI is unsure about start unticked. If the screenshot shows market value and
  unrealized P/L but no average price, the average price is worked out for you. The totals printed
  on the screenshot are shown next to the sum of the rows, so you can see that nothing is missing.
- **Save to a new account.** Each holding becomes one opening trade, and its realized P/L is
  carried in, so your gains so far are counted from day one. After that, add transactions as they
  happen.
- **CSV, JSON and XML files** (including OFX and QFX) work too. Their columns are matched for you
  and remembered for the next file laid out the same way. If a file can't be matched, you can let
  the AI read it instead.

Screenshots are read through a [myTickrs cloud](https://mytickrs.app) account, so you sign in
before you upload, and each account has a monthly number of AI files. Files are passed to the AI
model only to read the holdings and are not saved. CSV, JSON and XML files whose columns are matched
are read on your computer.

### 🌍 Global stock markets

- **42 markets built in**, one per country: North and South America, Europe, the Middle East,
  Africa and Asia-Pacific. Among them are the US (NYSE, Nasdaq), Canada (TSX, TSXV), the UK,
  Germany, France, Switzerland, Japan, Hong Kong, mainland China, Taiwan, Korea, India, Singapore
  and Australia.
- Each market knows its time zone, currency, trading hours (including lunch breaks), weekend days
  and public holidays. Prices are treated as live only while that market is open.
- Listings use Yahoo-style suffixes, so `SHOP.TO`, `7203.T`, `0700.HK` and `SAP.DE` all resolve
  to the right exchange. Symbol search with autocomplete shows the company name and exchange.
- You can add, edit or turn off markets in **Settings → Markets**.

### 📈 Stocks and ETFs

- Buy and sell, cash dividends, reinvested dividends (DRIP) and stock splits.
- Holdings show quantity, average price, market value, day change, and unrealized and realized gain.
- FIFO cost basis, and an average price over all history or the current holding.
- A stock detail page charts the price with your buy and sell points marked on it.
- **Selling short**: sell short and buy to cover, with FIFO realized P&L. Payments in lieu of
  dividends and stock-loan (borrow) fees are recorded too. Borrow fees go to realized P&L or to
  their own short-costs line, whichever you choose.

### 🧾 Options

- **Buy-to-open, sell-to-open, buy-to-close and sell-to-close** on calls and puts.
- The full lifecycle: **expiration, assignment and exercise**. Assignment and exercise create the
  matching stock trade at the strike automatically.
- Option premium either **rolls into the cost basis** of assigned stock or is tracked separately.
  You choose.
- **Rolls** in one step, with the old and new contracts linked so you can see their combined P&L.
- Multi-leg strategies (verticals, iron condors, straddles, strangles, calendars) and strategy tags
  such as covered call, cash-secured put and the wheel.
- Open positions show days to expiry, premium, current mark and unrealized P&L. Expired contracts
  are flagged for action. Option P&L and premium income can be viewed by period.
- Contract terms can be adjusted by hand after corporate actions.
- Options on stocks, ETFs and indexes in the **United States, Canada, the United Kingdom,
  Germany, France, the Netherlands, Belgium, Switzerland, Hong Kong, Japan, Australia, Singapore
  and India**, in each market's currency and contract size. Index options (S&P 500, S&P/TSX 60,
  FTSE 100, EURO STOXX 50, DAX, SMI, Hang Seng, Nikkei 225, Nifty 50 and more) settle in cash.
- UK options are entered in pounds, like UK shares: a premium your broker shows as 12.5p is
  0.125. Indian options ask for the lot size, which the exchange sets per stock and revises.

### 🏦 Multiple accounts, multiple currencies

Track every brokerage account you have, in every currency, in one place.

- **Unlimited brokerage accounts**, such as an RRSP, a TFSA, a margin account or an account at a
  second broker. Each trade belongs to one account.
- **Each account has its own currency.** US stocks go in a USD account, Canadian stocks in a CAD
  account, Japanese stocks in a JPY account, and so on.
- **One account per currency in a single step.** When you add an account, tick the currencies you
  hold there. myTickrs creates a matching account for each one, for example *"TFSA - USD"* and
  *"TFSA - CAD"*.
- **See one account or all of them together.** Filter by account, or pick *All accounts* for the
  whole portfolio. Holdings can be grouped **by symbol**, which combines the same stock across
  accounts, or **by account**.
- **Totals in your base currency.** Each position keeps its own currency, while portfolio totals,
  the dashboard and charts are converted into your base currency at the current exchange rate.
- **Fee schedules** per account (commission plus regulatory fees). Fees are calculated as you enter
  a trade, and you can override them.

### 💱 Global currencies

- Keep your own list of currencies in **Settings → Currencies**. Any ISO 4217 code works:
  USD, CAD, EUR, GBP, JPY, HKD, CNY, AUD and so on.
- Each account has a currency, so you can track holdings in different currencies side by side.
- Every amount is kept in its own currency. Totals, the dashboard and charts are shown in your
  **base currency**, using the current exchange rate. Exchange-rate history is synced once a day.

### 📊 Dashboard

- The dashboard shows portfolio value over time, total return (all time or this year), and a
  comparison with a benchmark such as SPY, QQQ or VTI.

### 🌐 Multiple languages

The interface is available in **9 languages**:

| | | |
| --- | --- | --- |
| English | Français (French) | Deutsch (German) |
| Italiano (Italian) | Español (Spanish) | 日本語 (Japanese) |
| 한국어 (Korean) | 简体中文 (Simplified Chinese) | 繁體中文 (Traditional Chinese) |

Numbers, dates and currencies are formatted for the language you choose. The app also has
**light and dark themes**.

### 🔌 Pluggable market data

- Prices come from **data-provider plugins**. The desktop edition ships with:

  | Plugin | Key needed | What it provides |
  | --- | --- | --- |
  | **Yahoo Finance** | No | Quotes, history and dividends for most markets. Always installed, so the app works out of the box |
  | **Finnhub** | Free key | Live quotes and ticker search |
  | **Twelve Data** | Free key | Price history, splits and dividends |
  | **iTick** | Key | Quotes and daily history for 30+ markets, including Hong Kong, China and Japan |

- **For more timely and accurate prices, add Finnhub and Twelve Data.** Yahoo Finance is an
  unofficial source: its quotes can lag, and it can be slow or unavailable at times. Finnhub and
  Twelve Data are official market-data APIs. Both have a **free plan**, so signing up costs nothing.
  - **[Finnhub](https://finnhub.io/register):** fast, live quotes and ticker search. The free plan
    allows 60 requests a minute.
  - **[Twelve Data](https://twelvedata.com/register):** clean daily price history, plus splits and
    dividends, so your charts and cost basis stay correct. The free plan allows 8 requests a minute
    and 800 a day.

  Create a free account, then add the provider to your markets with your API key in
  **Settings → Data providers**. Each market asks its own providers first, and uses Yahoo Finance
  only as a fallback.

- For each market you choose which providers to use and in what order. If one fails or reaches its
  rate limit, the next one is asked.
- **Your API keys are yours.** They are encrypted at rest, never shown again after you save them,
  and tested when you enter them.
- New providers can be added without changing myTickrs.

### 📂 Your data, your machine

- Your transactions, holdings and settings live in **one SQLite file on your computer**. Back it up
  by copying it, or move it to another machine.
- **What leaves your computer:** only requests for market data. The tickers you hold are sent to
  the price providers you enable, such as Yahoo Finance or Finnhub, to get quotes, price history
  and exchange rates. Your trades, quantities and balances are never sent, except when you choose
  to import a screenshot (see [AI import](#-ai-import-start-an-account-from-a-screenshot)).
- Optional **sync with a myTickrs cloud account** at [mytickrs.app](https://mytickrs.app)
  (Settings → Sync). It is off unless you turn it on, and only then does your portfolio leave your
  machine. You can also use it as a **backup and restore**:
  - **Back up:** send the data on this computer to your cloud account. This replaces what is in the
    cloud.
  - **Restore:** bring your cloud data back to this computer, for example after reinstalling or on a
    new machine. This replaces what is on this computer.

  Both directions ask you to confirm first, because they overwrite the other side.

---

## Getting started

### Requirements

- Windows, macOS or Linux
- **Node.js 24** or newer. The installer checks for it and, if it is missing or too old, asks
  before installing it for you.

### Install

Open a terminal and run the line for your system.

**Windows** (PowerShell):

```powershell
irm https://files.mytickrs.app/install.ps1 | iex
```

**macOS** (Terminal):

```bash
curl -fsSL https://files.mytickrs.app/install-macos.sh | bash
```

**Linux**:

```bash
curl -fsSL https://files.mytickrs.app/install-linux.sh | bash
```

The installer:

1. Checks for Node.js 24 or newer. If it is not there, it asks for permission and then installs it:
   with winget or the official installer on Windows, the official installer on macOS, and
   NodeSource (apt, dnf or yum) or the official build in `~/.local/node` on Linux. Installing
   Node.js may ask for your administrator password.
2. Downloads the latest myTickrs and unzips it into a `mytickrs` folder in your home folder
   (`%USERPROFILE%\mytickrs` on Windows, `~/mytickrs` on macOS and Linux). Set `MYTICKRS_DIR`
   before running it to use another folder.
3. Installs the dependencies and adds a **myTickrs** shortcut: on the Desktop and in the Start menu
   on Windows, in Applications with a link on the Desktop on macOS, and in the applications menu and
   on the Desktop on Linux.
4. Starts the app and opens it in your browser.

If the browser does not open, go to <http://localhost:5050>. The database is created at
`data/tickrs.db` inside the install folder on first start.

**Start it again later:** double-click the **myTickrs** shortcut. It starts the app in a terminal
window and opens your browser; if the app is already running, it just opens the browser. Close that
window (or press **Ctrl+C** in it) to stop the app.

**Update:** stop the app, then run the install line again. The new version replaces the old one,
and your database (`data/`), your settings (`.env`) and any plugins you added are kept.

**Uninstall:** stop the app, delete the install folder and the **myTickrs** shortcuts. This also
deletes your database, so back up `data/` first if you want to keep it.

### Run from source

To run the app from the source code instead (needs Node.js 24 or newer):

1. Clone the repository, or download the source code and unzip it:

   ```bash
   git clone https://github.com/myTickrs/myTickrs.git mytickrs
   cd mytickrs
   ```

2. Install the dependencies:

   ```bash
   npm i   # Windows without Visual Studio C++ tools: npm i --ignore-scripts
   ```

3. Build and start the app:

   ```bash
   npm start
   ```

It opens <http://localhost:5051> in your browser. One process serves the app and the API, and the
database is created at `data/tickrs.db` in the source folder. Press **Ctrl+C** to stop it.

---

## Configuration

Settings are read from `.env` in the install folder (or the repository root when you run from
source). Restart the app after changing it. See [.env.example](.env.example) for the full list.

| Variable | Default | Purpose |
| --- | --- | --- |
| `HOST` | `127.0.0.1` | Address the server listens on. Use `0.0.0.0` to reach it from your network |
| `PORT` | `5051` | API port (the Docker image uses `5050`) |
| `WEB_PORT` | `5050` | Web dev server port (`npm run dev` only) |
| `SQLITE_PATH` | `./data/tickrs.db` | Location of the database file |
| `LOG_LEVEL` | `info` | `fatal`, `error`, `warn`, `info`, `debug`, `trace` or `silent` |
| `ERROR_LOG_DIR` | `./logs` | Every logged error is also written here, one file per day (`errors-YYYY-MM-DD.log`). Set it empty for no file |
| `ERROR_LOG_DAYS` | `30` | Days of error files kept; older ones are deleted |
| `KEY_ENCRYPTION_KEY` | generated | Base64 of 32 bytes; encrypts stored provider keys. If unset, one is generated and saved to `data/.master-key` |
| `MARKET_DATA_BASE_PROVIDER` | `yahoo` | Keyless fallback provider for every market. Set it empty for none |
| `CLOUD_URL` | `https://mytickrs.app` | The myTickrs cloud to sync with. Enables Settings → Sync |
| `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET`, `MICROSOFT_OAUTH_CLIENT_ID` | *(unset)* | Desktop OAuth clients used to sign in to the cloud when you sync (Google or Microsoft) |

> **Security note:** the desktop edition has no sign-in. Anyone who can reach `HOST:PORT` can use
> the app. Keep the default `127.0.0.1` unless you trust your network.

---

## Project structure

This is a TypeScript monorepo using npm workspaces: a React web app on top of an Express API.

```text
apps/
  api/                    Express server for the desktop edition (SQLite)
  web/                    React app (Vite, Material UI)
  plugins/dataproviders/  installed data-provider plugins
packages/
  core/                   calculation engine: lots, cost basis, P&L, returns
  shared/                 types, enums, validation schemas, market catalog
  market-data/            provider registry, routing, rate limits, market hours and holidays
  server/                 routes and services shared by every edition
  store-sql/              SQLite storage (Kysely)
  ui/                     shared UI components, app shell, i18n
  conformance/            tests every storage implementation must pass
```

---

## Development

To work on the code, clone the repository and run it with hot reload:

```bash
git clone https://github.com/myTickrs/myTickrs.git mytickrs
cd mytickrs
npm i        # Windows without Visual Studio C++ tools: npm ci --ignore-scripts
npm run dev
```

Open <http://localhost:5050>. The API runs on port 5051, and the web dev server forwards requests
to it.

### Contributing translations

UI text lives in JSON message files under `apps/web/src/locales/<lang>/` and
`packages/ui/src/locales/<lang>/`. To add or improve a language, edit those files. [apps/web/src/locales/GLOSSARY.md](apps/web/src/locales/GLOSSARY.md) lists
the preferred financial terms for each language.

---

## Roadmap

These are not supported yet:

- futures, bonds and crypto
- margin
- tax forms

## License

[PolyForm Noncommercial License 1.0.0](LICENSE). You may use, modify and share myTickrs for any
noncommercial purpose, including personal investing. Commercial use needs a separate license.
