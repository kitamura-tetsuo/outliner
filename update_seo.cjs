const fs = require("fs");

let layout = fs.readFileSync("client/src/routes/+layout.svelte", "utf8");
layout = layout.replace(
    'import { browser } from "$app/environment";',
    'import { browser } from "$app/environment";\nimport { SvelteSEO } from "svelte-seo";',
);
layout = layout.replace(
    '<div data-testid="app-layout">',
    `<SvelteSEO
    titleTemplate="%s | Cats Blog"
    description="A blog for cat lovers."
    openGraph={{
        description: "A blog for cat lovers.",
        images: [
            {
                url: "/cats.png",
                alt: "Cats"
            }
        ]
    }}
    twitter={{
        description: "A blog for cat lovers.",
        image: "/cats.png"
    }}
/>

<div data-testid="app-layout">`,
);
fs.writeFileSync("client/src/routes/+layout.svelte", layout);

let page = fs.readFileSync("client/src/routes/+page.svelte", "utf8");
page = page.replace('<script lang="ts">', '<script lang="ts">\n    import { SvelteSEO } from "svelte-seo";');
page = page.replace("</script>", '</script>\n\n<SvelteSEO title="Home" />');
fs.writeFileSync("client/src/routes/+page.svelte", page);
