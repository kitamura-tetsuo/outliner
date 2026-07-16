1. **Refactor TypeScript Type Definitions:** Address "any" type usage in `server/src/server.ts` to improve code health and type safety, per the instruction to improve stricter type definitions. The `server/src/server.ts` file has several uses of `any` types (e.g., `req: any, res: any`, `data: any`, `error: any`) that can be replaced with proper types from `express`, `ws`, `@hocuspocus/server`, and the standard `Error` interface.
2. **Apply Changes:** Modify `server/src/server.ts` to replace explicit `any` usage.
3. **Run local verification:** Run `cd server && npm run test` to verify changes.
4. **Complete pre-commit steps:** Complete pre-commit steps to ensure proper testing, verification, review, and reflection are done.
5. **Submit:** Submit with a branch like `refactor/server-remove-any`.
