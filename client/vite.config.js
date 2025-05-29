import { sveltekit } from "@sveltejs/kit/vite";
import { defineConfig } from "vite";

export default defineConfig({
    plugins: [sveltekit()],
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
