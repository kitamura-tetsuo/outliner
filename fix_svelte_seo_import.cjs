const fs = require('fs');

// Fix +page.svelte
let pageContent = fs.readFileSync('client/src/routes/+page.svelte', 'utf8');
pageContent = pageContent.replace('import { SvelteSEO } from "svelte-seo";\n', 'import SvelteSEO from "svelte-seo";\n');
fs.writeFileSync('client/src/routes/+page.svelte', pageContent);

// Fix +layout.svelte
let layoutContent = fs.readFileSync('client/src/routes/+layout.svelte', 'utf8');
layoutContent = layoutContent.replace('import { SvelteSEO } from "svelte-seo";\n', 'import SvelteSEO from "svelte-seo";\n');
fs.writeFileSync('client/src/routes/+layout.svelte', layoutContent);
