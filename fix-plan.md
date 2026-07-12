1. **Analyze Review Feedback**:
   - The review points out that changing `{#if index > 0 || isEmbedded}` causes the root alias target item to be duplicated, because the alias path component *already* shows the root target text!
   - By rendering `index 0` as a normal item, the mirrored text is shown once as the "alias path" above the subtree, and then again as the root of the subtree.
   - The requirement is to *not* render the target item itself inside the embedded tree, because the alias line already represents it. We only want to render its *children* (index > 0).

2. **Actions**:
   - In `client/src/components/OutlinerTree.svelte`, revert the loop condition `{#if index > 0 || isEmbedded}` back to `{#if index > 0}`.
   - This ensures that only the children of the alias target are rendered in the subtree, and if there are no children (a leaf target), nothing is rendered below the alias line.

3. **Validation**:
   - Run tests.
