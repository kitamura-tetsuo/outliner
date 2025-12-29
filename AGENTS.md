refactor(e2e): remove legacy app-side seeding and unify test data creation

- Remove testDataHelper auto-injection and implicit seeding from Svelte routes to decouple app logic from test data
- Replace usage of createTestPageViaAPI with TestHelpers.createAndSeedProject across E2E specs
- Delete deprecated createTestPageViaAPI implementation from test helpers
- Update yjsService to reliably detect test environments via localStorage

This change centralizes test data creation through the seeding API rather than mixing app-side and test-side data creation logic.
