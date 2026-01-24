import adapter from "@sveltejs/adapter-static";
import { mdsvex } from "mdsvex";
import sveltePreprocess from "svelte-preprocess";

/** @type {import('@sveltejs/kit').Config} */
const config = {
    // Consult https://svelte.dev/docs/kit/integrations
    // for more information about preprocessors
    preprocess: [
        sveltePreprocess({
            typescript: {
                // Skip TypeScript diagnostics during preprocessing so Vite's HMR overlay
                // doesn't block the UI in test environments that tolerate runtime casts.
                transpileOnly: true,
            },
        }),
        mdsvex(),
    ],

    // compilerOptions: { runes: true },
    compilerOptions: { runes: true },

    kit: {
        adapter: adapter({
            // Output to the public directory of Firebase Hosting
            pages: "../build",
            assets: "../build",
            fallback: "index.html",
            precompress: false,
            strict: true,
        }),
        serviceWorker: {
            register: false, // Disabled to register Service Worker manually
        },
    },

    extensions: [".svelte", ".svx"],
};

// To disable SSR, configure it in routes/+layout.js
// export const ssr = false;

export default config;
