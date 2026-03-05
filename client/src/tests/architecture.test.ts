import fs from "fs";
import path from "path";
import { expect, test } from "vitest";

test("Tailwind v3 configuration files must not exist", () => {
    const rootDir = process.cwd();
    const v3Files = [
        "tailwind.config.js",
        "tailwind.config.ts",
        "tailwind.config.cjs",
    ];

    for (const file of v3Files) {
        const filePath = path.join(rootDir, file);
        // ファイルが存在したらエラーにする
        expect(fs.existsSync(filePath)).toBe(false);
    }
});
