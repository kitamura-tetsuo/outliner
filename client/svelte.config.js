import adapter from "@sveltejs/adapter-static";
import { vitePreprocess } from "@sveltejs/vite-plugin-svelte";
import { mdsvex } from "mdsvex";

/** @type {import('@sveltejs/kit').Config} */
const config = {
    // Consult https://svelte.dev/docs/kit/integrations
    // for more information about preprocessors
    preprocess: [
        vitePreprocess(),
        mdsvex(),
    ],

    // compilerOptions: { runes: true },
    // compilerOptions: { runes: true },

    kit: {
        adapter: adapter({
            // Output to Firebase Hosting public directory
            pages: "../build",
            assets: "../build",
            fallback: "index.html",
            precompress: false,
            strict: true,
        }),
        alias: {
            $stores: "src/stores",
            // Single source of truth for the SharedTree/Yjs schema, shared with
            // the server workspace. See ../shared/src.
            $shared: "../shared/src",
        },
        serviceWorker: {
            register: false, // Disabled to register Service Worker manually
        },
    },

    extensions: [".svelte", ".svx"],
};

// Configure in routes/+layout.js to disable SSR
// export const ssr = false;

export default config;
