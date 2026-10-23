# Changelog

All notable changes to the myTickrs desktop edition are listed here.

## 0.1.38 — 2026-10-23

### Added

- **Total P&L on the dashboard.** The Holdings card has a new **Total P&L** column for each account. It adds up
  realized P&L, unrealized P&L, dividends and borrow fees.
- **Stock and options split on the stock page.** The **Realized** and **Unrealized** tiles now show the stock
  part and the options part on separate lines under the total. Options on the stock count toward its P&L.
- **Options in the day change.** The **Day change** tile now includes the move in your open options on the
  stock, shown as separate stock and options lines. The tile now also appears when you hold only options on
  the stock and no shares.
- **Stock page for options-only positions.** The stock page shows position details when you hold options on a
  symbol but no shares.
- **Cloud edition in the README.** The README now mentions the optional browser-based myTickrs cloud app
  ([mytickrs.com](https://mytickrs.com)), which supports sign-in with Google or Microsoft and can sync with
  the desktop edition.

### Changed

- The stock page no longer has a separate **Dividends** tile. Dividends are now included in the stock part of
  **Realized**.
- Stat tiles can now show several sub-lines, each with its own color.
- Translations for the new labels were updated in all supported languages (de, en, es, fr, it, ja, ko, zh-CN,
  zh-TW).

### Fixed

- **Price on days with more than one mark.** When a day has several marks of the same kind (manual, quote or
  trade), valuation now uses the last one instead of the first.

### Database

Two new migrations run on their own the first time you start the app after updating. No manual steps are
needed.

- `0005_contract_key`: renames the option contract `occ_symbol` column to `contract_key` and refills it in a
  standard `UNDERLYING|EXPIRATION|C/P|STRIKE` format. It also allows `INDEX` as a security type and adds the
  `realized_before` column to transactions.
- `0006_shared_option_quotes`: makes the daily and latest option quotes shared across users instead of stored
  separately for each user. Where duplicates exist, the most complete quote is kept.

### API

- `GET` holdings by account: each account now has a `totalPl` field.
- Stock chart `position`: `realized` and `unrealized` are now `{ total, stock, option }` objects instead of
  plain amounts. `dividends` has been removed, and `dayChange` is now `{ total, stock, option }` or `null`.
  `position` is also returned when the symbol has open options but no shares.
