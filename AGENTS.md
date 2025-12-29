refactor(e2e): remove legacy app-side seeding and unify test data creation

- Remove `testDataHelper` auto-injection and implicit seeding from Svelte routes (`+layout`, `+page`) to decouple app logic from test data
- Replace usage of `createTestPageViaAPI` with `TestHelpers.createAndSeedProject` across E2E specs
- Delete deprecated `createTestPageViaAPI` implementation from `testHelpers.ts`
- Update `yjsService` to reliably detect test environments via localStorage
