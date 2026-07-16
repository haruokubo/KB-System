# KB System

Internal KB + AI-assisted search for L2/L3 support engineers.

## Setup
1. `npm install`
2. Copy `.env.example` to `.env.local`, fill values from Key Vault (never paste secrets from chat/docs).
3. `npm run db:migrate` (see Task 2)
4. `npm run dev`

## Test
`npm test`

## Known Issues
- **npm audit: 2 moderate findings, `postcss <8.5.10` (XSS via unescaped `</style>`, [GHSA-qx2v-qp2m-jg93](https://github.com/advisories/GHSA-qx2v-qp2m-jg93))** — transitive via `next`'s own bundled copy (`node_modules/next/node_modules/postcss`), not this project's code. `npm audit fix --force` only resolves it by downgrading `next` to `9.3.3`, which is not viable. Tracked as an accepted exception; re-check `npm audit` whenever `next` is upgraded.
