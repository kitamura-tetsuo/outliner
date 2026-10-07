[Issues]
Svelte compiler emitted an accessibility warning in `ConfirmDialog.svelte` because interactive event handlers (`onmousedown`, `onclick`, `onpointerdown`, `onmouseup`) were bound directly to an element with `role="presentation"`. The presentation role explicitly strips elements of their semantic meaning, making the placement of interactive handlers a violation of accessibility guidelines.

[Changes]
In `client/src/components/ConfirmDialog.svelte`:

- Changed the role of the inner dialog wrapper `div` from `role="presentation"` to `role="document"`. This is the correct ARIA practice for content wrappers within a modal, satisfying accessibility requirements without altering visual presentation.
- Preserved the existing `stopPropagation()` event handlers on the inner wrapper to maintain correct backdrop-click-to-close behavior, as requested during code review.

[Verification Results]

- `npx svelte-check --workspace client` passes with 0 errors and 0 warnings.
- `npm run test:unit ConfirmDialog` passes successfully.
- Code review verifies that the functionality is preserved and regressions are avoided.
