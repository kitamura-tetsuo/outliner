import * as fs from 'fs';

let content = fs.readFileSync('client/src/components/SnapshotDiffModal.svelte', 'utf8');

content = content.replace(
    /tabindex="0"\n\s*\{\.\.\.\{\s*role:\s*"region"\s*\}\}/g,
    '{...{ tabindex: 0, role: "region" }}'
);
fs.writeFileSync('client/src/components/SnapshotDiffModal.svelte', content);
