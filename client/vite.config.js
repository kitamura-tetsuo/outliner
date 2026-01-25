import { paraglideVitePlugin } from "@inlang/paraglide-js";
import { sveltekit } from "@sveltejs/kit/vite";
import { defineConfig } from "vite";

export default defineConfig({
    plugins: [
        paraglideVitePlugin({ project: "./project.inlang", outdir: "./src/paraglide./src/lib/paraglide" }),
        sveltekit(),
    ],
    build: {
        // Output to Firebase Hosting's public directory
        outDir: "../build",
        emptyOutDir: true,
        // Run in SPA mode
        ssr: false,
        // Output as a static site
        target: "esnext",
        // Threshold for inlining assets like images
        assetsInlineLimit: 10000,
    },
});
