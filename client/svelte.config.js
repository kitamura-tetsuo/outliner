import adapter from "@sveltejs/adapter-static";
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
        adapter: adapter({
            // Firebase Hostingのpublicディレクトリに出力
            pages: '../build',
            assets: '../build',
            fallback: 'index.html',
            precompress: false,
            strict: true
        })
    },

    extensions: [".svelte", ".svx"],
};

// SSRを無効化するにはroutes/+layout.jsで設定する
// export const ssr = false;

export default config;
