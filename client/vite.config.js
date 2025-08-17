import { paraglideVitePlugin } from "@inlang/paraglide-js";
import { sveltekit } from "@sveltejs/kit/vite";
import path from "path";
import { defineConfig } from "vite";

export default defineConfig({
    plugins: [
        paraglideVitePlugin({ project: "./project.inlang", outdir: "./src/paraglide./src/lib/paraglide" }),
        sveltekit(),
    ],
    resolve: {
        alias: {
            "@common": path.resolve(__dirname, "../common"),
            // Ensure modules imported from ../common resolve to this project's node_modules
            "fluid-framework": path.resolve(__dirname, "./node_modules/fluid-framework"),
            "uuid": path.resolve(__dirname, "./node_modules/uuid"),
        },
    },
    build: {
        // Firebase Hostingのpublicディレクトリに出力
        outDir: "../build",
        emptyOutDir: true,
        // SPAモードで動作させる
        ssr: false,
        // 静的サイトとして出力
        target: "esnext",
        // 画像などのアセットをインライン化する閾値
        assetsInlineLimit: 10000,
    },
});
