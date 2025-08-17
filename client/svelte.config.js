import adapter from "@sveltejs/adapter-static";
import { mdsvex } from "mdsvex";
import path from "path";
import sveltePreprocess from "svelte-preprocess";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/** @type {import('@sveltejs/kit').Config} */
const config = {
    // Consult https://svelte.dev/docs/kit/integrations
    // for more information about preprocessors
    preprocess: [sveltePreprocess(), mdsvex()],

    // compilerOptions: { runes: true },
    compilerOptions: { runes: true },

    kit: {
        adapter: adapter({
            // Firebase Hostingのpublicディレクトリに出力
            pages: "../build",
            assets: "../build",
            fallback: "index.html",
            precompress: false,
            strict: true,
        }),
        serviceWorker: {
            register: false, // 手動でService Workerを登録するため無効化
        },
        alias: {
            "@common": path.resolve(__dirname, "../common"),
            // Ensure imports from files in ../common resolve Fluid packages correctly during SSR build
            "fluid-framework": path.resolve(__dirname, "./node_modules/fluid-framework"),
            "uuid": path.resolve(__dirname, "./node_modules/uuid"),
        },
    },

    extensions: [".svelte", ".svx"],
};

// SSRを無効化するにはroutes/+layout.jsで設定する
// export const ssr = false;

export default config;
