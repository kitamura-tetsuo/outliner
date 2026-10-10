import adapter from "@sveltejs/adapter-static";
import { mdsvex } from "mdsvex";
import sveltePreprocess from "svelte-preprocess";

/**
 * SvelteKit configuration, passed to the `sveltekit(...)` Vite plugin.
 *
 * SvelteKit 3 no longer reads `svelte.config.js`; configuration lives in the
 * Vite config instead. Both `vite.config.js` (picked up first by the `vite`
 * CLI for dev/E2E/production builds) and `vite.config.ts` (picked up by
 * Vitest) pass this object to `sveltekit(...)`, and `eslint.config.js`
 * hands it to the Svelte ESLint parser, so the three consumers cannot drift.
 *
 * @type {import('@sveltejs/kit').Config}
 */
export const sveltekitOptions = {
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

    extensions: [".svelte", ".svx"],

    adapter: adapter({
        // Output to Firebase Hosting public directory
        pages: "../build",
        assets: "../build",
        fallback: "index.html",
        precompress: false,
        strict: true,
    }),

    alias: {
        "$lib": "src/lib",
        "$stores": "src/stores",
        "$shared": "../shared/src",
    },
    serviceWorker: {
        register: false, // Disabled to register Service Worker manually
    },
};
