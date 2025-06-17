# Editable JOIN Table

This feature introduces a SQL powered table component that syncs data through the Fluid Framework.

## Development

1. `npm --prefix client install`
2. Run services: `./scripts/codex-setp.sh`
   - Always execute this script before running any tests so that the emulators are available.
3. Run unit tests: `npm --prefix client run test:unit`
4. Run E2E tests:
   ```bash
   cd client
   npx playwright test e2e/core/basic.spec.ts --project=core --reporter=list
   npx playwright test e2e/new/TBL-0001.spec.ts --project=new --reporter=list
   ```

### Test Guidelines

- Select elements via `data-item-id` attributes instead of using `.nth()`.
- Call DOM code through helper utilities (e.g., `TestHelpers`) rather than writing `page.evaluate` inline.

## Extending

- Update `SqlService` to support additional SQLite features.
- Use `FluidTableClient` for data manipulation; never write directly to SQLite.
