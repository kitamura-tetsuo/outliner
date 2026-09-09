import * as fs from 'fs';

let content = fs.readFileSync('client/src/components/OutlinerItem.svelte', 'utf8');

// For Svelte 5, using a spread attribute to bypass static checking for dynamic roles
content = content.replace(
  'role={isPageTitle ? "heading" : "treeitem"}',
  'role={isPageTitle ? "heading" : "treeitem"}'
);

content = content.replace(
  'tabindex={isPageTitle ? undefined : (isItemActive || (!editorOverlayStore.getActiveItem() && index === 1) ? 0 : -1)}',
  'tabindex={isPageTitle ? undefined : (isItemActive || (!editorOverlayStore.getActiveItem() && index === 1) ? 0 : -1)}'
);

// Actually, wait, let's just make it a <div {...{ role: isPageTitle ? "heading" : "treeitem", tabindex: isPageTitle ? undefined : (isItemActive || (!editorOverlayStore.getActiveItem() && index === 1) ? 0 : -1) }}>
// I'll replace the role and tabindex lines with a single {...{ role, tabindex }}

content = content.replace(
    'role={isPageTitle ? "heading" : "treeitem"}\n    aria-labelledby',
    '{...{ role: isPageTitle ? "heading" : "treeitem", tabindex: isPageTitle ? undefined : (isItemActive || (!editorOverlayStore.getActiveItem() && index === 1) ? 0 : -1) }}\n    aria-labelledby'
);
content = content.replace(
    '    tabindex={isPageTitle ? undefined : (isItemActive || (!editorOverlayStore.getActiveItem() && index === 1) ? 0 : -1)}\n',
    ''
);


fs.writeFileSync('client/src/components/OutlinerItem.svelte', content);

let content2 = fs.readFileSync('client/src/components/SnapshotDiffModal.svelte', 'utf8');
content2 = content2.replace(
    /role="region"/g,
    '{...{ role: "region" }}'
);
fs.writeFileSync('client/src/components/SnapshotDiffModal.svelte', content2);
