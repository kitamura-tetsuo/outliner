const fs = require('fs');
let content = fs.readFileSync('client/src/components/OutlinerItem.svelte', 'utf8');

// The active item index should determine the roving tabindex.
// If there is no active item, index 1 (the first child) should have tabindex=0
// However, the issue states "leaving every role="treeitem" at tabindex="-1"".
// Let's implement roving tabindex where if NO item is active, the FIRST visual item has tabindex=0.
// We can use the index property which is passed to OutlinerItem.
content = content.replace(
    'tabindex={isPageTitle ? undefined : (isItemActive ? 0 : -1)}',
    'tabindex={isPageTitle ? undefined : (isItemActive || (!editorOverlayStore.getActiveItem() && index === 1) ? 0 : -1)}'
);

fs.writeFileSync('client/src/components/OutlinerItem.svelte', content, 'utf8');
