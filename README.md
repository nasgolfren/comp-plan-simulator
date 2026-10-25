# Comp Plan Simulator

An unofficial web app that shows how the inCruises compensation plan calculates income
from numbers the user enters. It is a planning and learning tool, not an income estimate.

- **Welcome** – first-visit setup: Member and/or Partner, membership, since-dates
- **Dashboard** – rank route, this month's net income, progress to the next rank, conditions, calendar of payments and payouts, 12-month outlook
- **Structure** – your dated activations, paying members and Partner tree (with a pan/zoom structure view); an explanation behind every bonus
- **Simulation** – a typical month repeated over 6–36 months: every income and bonus month by month, optionally starting from your Structure
- **Goals** – pick a rank or monthly income and a deadline; get the monthly plan for a chosen style, a timeline of ranks and a month-by-month table (independent of Simulation)
- **Profile & settings** – Member/Partner status, membership, since-dates, Reward Points estimate, EN/ES, export/import/reset

All data stays in the browser (`localStorage`). There is no backend and no analytics.

> **Disclaimer.** Results are hypothetical model calculations from the user's own assumptions,
> not estimates or guarantees of income. Not affiliated with or endorsed by inCruises or
> inGroup International. The company's rules prohibit Partners from using hypothetical earnings
> projections or examples when presenting the business — check with the company's compliance
> team before sharing this tool with others.

## Plan rules

All rates, thresholds and tables are in [`src/config/plan.ts`](src/config/plan.ts), transcribed from
the *Income and Incentive Guide* (REF: JAN 7, 2026-214EN-KP) with page references, and checked against the
*Income and Incentive Overview* (REF: JAN 4, 2026-109EN-KP). The file also holds the payout calendar and the
Reward Points competition thresholds. When the plan changes, edit that file. The source PDFs go in `docs/`,
which is kept out of git.

Interpretations where the guide is not explicit:

- Your own (personal) production counts in full toward Qualified Production; the per-team cap applies to each direct Partner team.
- Qualified Production = activation production + monthly membership payments.
- Weekly Matching is checked week by week (Monday–Sunday) from your dated activations. Your direct Partners' activations have no dates, so their production is spread evenly over the month (a simulation estimate).
- First-ever share, QBI and the 90/180/365-day Minimum Activations windows are worked out from the dated activations and the "Earlier activity" numbers (months count as 30 days).
- Ranks sharing one QP level (Ambassador/Premier, Global/Royal) are told apart by Total Activation Volume.
- The guide doesn't list the Starter activation ($50) or Classic monthly ($100) prices; those come from inCruises plan materials. Prices are fixed in the config; users can't edit them.
- An SMD+ leader with exactly $600 Total Activation Volume gets 50% TLB (the guide only covers "more than" and "less than" $600).
- Minimum Activations Requirement follows the Guide (all direct Activation Production); the Overview says "New Member" activations only.
- The Overview says Recurring Income is uncapped for Board of Directors leaders; no cap is stated for other ranks, so none is modelled.

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

Chart colors are a categorical palette checked for color-vision-deficiency separation on the dark
background; every chart also has a legend and a table or list of the same numbers.
