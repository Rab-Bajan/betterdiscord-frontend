# Tests

- `tests/unit/` - vitest suites (`*.test.ts`). Run with `npm test`.
- `tests/legacy/` - standalone node scripts (`*.legacy.mjs`) that assert and print their own pass lines; each exits non-zero on failure. Run all with `npm run test:legacy` (`runAll.mjs` runs each in its own process and prints a summary). Scripts import app code via `../../src/...`.

The legacy scripts are not picked up by vitest (it only includes `tests/unit/**`). The plan is to port them to vitest under `tests/unit/` one by one and delete the legacy copy once ported.
