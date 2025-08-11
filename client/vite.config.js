import { paraglideVitePlugin } from "@inlang/paraglide-js";
import { sveltekit } from "@sveltejs/kit/vite";
import { defineConfig } from "vite";
import path from "path";

export default defineConfig({
    plugins: [
        paraglideVitePlugin({ project: "./project.inlang", outdir: "./src/paraglide./src/lib/paraglide" }),
        sveltekit(),
    ],
    resolve: {
        alias: {
            "@common": path.resolve(__dirname, "../common"),
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
