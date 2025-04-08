import adapter from "@sveltejs/adapter-auto";
import { vitePreprocess } from "@sveltejs/vite-plugin-svelte";
import { mdsvex } from "mdsvex";

/** @type {import('@sveltejs/kit').Config} */
const config = {
    // Consult https://svelte.dev/docs/kit/integrations
    // for more information about preprocessors
    preprocess: [vitePreprocess(), mdsvex()],

    // compilerOptions: { runes: true },
    compilerOptions: { runes: true },

    kit: {
        adapter: adapter(),
        // csrf: {
        // 	checkOrigin: true
        // },
        // csp: {
        // 	mode: 'auto'
        // }
    },

    extensions: [".svelte", ".svx"],
};

// SSRを無効化するにはroutes/+layout.jsで設定する
// export const ssr = false;

export default config;
