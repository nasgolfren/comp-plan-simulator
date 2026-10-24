# Comp Plan Simulator

An unofficial web app that shows how the inCruises compensation plan calculates income
from numbers the user enters. It is a planning and learning tool, not an income estimate.

- **Dashboard** – rank route, this month's net income, progress to the next rank, conditions, 12-month outlook
- **Calculator** – one month of activity and teams, with an explanation behind every bonus; exact one-week Weekly Matching check
- **Simulation** – month-by-month model (6–36 months) with your own growth, churn and team assumptions
- **Goals** – what a target rank requires, and how much activity the simulation would need to reach a rank or income by a deadline
- **Scenarios** – save, compare and share (link) setups
- **Profile & settings** – Member/Partner status, plan prices, renewal date, EN/ES, light/dark theme, export/import/reset

All data stays in the browser (`localStorage`). There is no backend and no analytics.

> **Disclaimer.** Results are hypothetical model calculations from the user's own assumptions,
> not estimates or guarantees of income. Not affiliated with or endorsed by inCruises or
> inGroup International. The company's rules prohibit Partners from using hypothetical earnings
> projections or examples when presenting the business — check with the company's compliance
> team before sharing this tool with others.

## Plan rules

All rates, thresholds and tables are in [`src/config/plan.ts`](src/config/plan.ts), transcribed from
the *Income and Incentive Guide* (REF: JAN 7, 2026-214EN-KP). When the plan changes, edit that file.

Interpretations where the guide is not explicit:

- Your own (personal) production counts in full toward Qualified Production; the per-team cap applies to each direct Partner team.
- Qualified Production = activation production + monthly membership payments.
- Weekly Matching in the monthly view is estimated from an even weekly pace (or a share of weeks you set); the one-week checker uses the exact rule.
- Ranks sharing one QP level (Ambassador/Premier, Global/Royal) are told apart by Total Activation Volume.
- Prices the guide doesn't list (Starter activation, Classic monthly) are set by each user in Settings.

## Development

Requires Node 22.18+.

```bash
npm install
npm run dev        # local dev server
npm test           # engine tests, incl. every worked example from the guide
npm run build      # type-check + production build into dist/
```

## Deployment (GitHub Pages)

Every push to `main` runs the tests, builds the app and deploys it with GitHub Actions
(`.github/workflows/deploy.yml`). One-time setup: **Settings → Pages → Source: GitHub Actions**.
The site is served at `https://<user>.github.io/comp-plan-simulator/` (the `base` in `vite.config.ts`
must match the repository name).

## Structure

```
src/
  config/plan.ts      plan rules and tables
  engine/             pure calculation functions + tests (no DOM)
  state/store.ts      app state, localStorage, export/import, share links
  i18n/               en.ts, es.ts
  ui/                 layout, views, charts, disclaimer, form fields
```

Chart colors are a categorical palette checked for color-vision-deficiency separation in light and
dark mode; every chart also has a legend and a table or list of the same numbers.
