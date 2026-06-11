# Multi-Cursor Editing

This document summarizes the existing multi-cursor editing implementation. The design goals are recorded in `implementation-plan.md` section **Multi-Cursor Editing**.

## Overview

- Multiple cursors can be created with **Alt+Click** on any item.
- Cursors are managed by `EditorOverlayStore` and represented by the `Cursor` class.
- Editing actions such as text insertion, deletion and paste operate on all active cursors.
- Cursor data is synchronized through the store so other users can see each other's positions.

## Key Files

- `client/src/lib/Cursor.ts`
- `client/src/stores/EditorOverlayStore.svelte.ts`
- `client/src/components/OutlinerItem.svelte`
- `client/src/lib/KeyEventHandler.ts`

## Tests

- Unit tests: `client/src/stores/EditorOverlayStore.test.ts`
- E2E: `client/e2e/disabled/multi-cursor.spec.ts` (historical reference)

Multi-cursor editing is considered **implemented**. Future work should reference this document rather than proposing the feature again.
