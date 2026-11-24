# Vendored browser libraries

These files are served locally so the static calculator does not depend on
third-party CDNs at runtime (no SRI/pinning drift, no third-party script
execution surface).

| File | Source | Version | License |
|---|---|---|---|
| `tailwind.js` | https://cdn.tailwindcss.com (Tailwind Play CDN bundle) | fetched 2026-11-24 | MIT — https://github.com/tailwindlabs/tailwindcss |
| `chart.umd.min.js` | https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js | 4.4.1 | MIT — https://github.com/chartjs/Chart.js |

To update, replace the file from the pinned upstream version and re-test the
calculator (`public/index.html`) with `npm start`.
