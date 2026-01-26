import { execSync } from "child_process";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { afterEach, beforeEach, describe, expect, test } from "vitest";

/** @feature TST-0006
 *  Title   : feature-map削除スクリプト
 *  Source  : docs/dev-features.yaml
 */

describe("TST-0006: feature-map削除スクリプト", () => {
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);
    const repoRoot = path.resolve(__dirname, "..", "..");
    const docsPath = path.join(repoRoot, "docs", "feature-map.md");
    const scriptPath = path.join(repoRoot, "scripts", "remove_feature_docs.sh");

    beforeEach(() => {
        if (!fs.existsSync(path.dirname(docsPath))) {
            fs.mkdirSync(path.dirname(docsPath), { recursive: true });
        }
        fs.writeFileSync(docsPath, "# dummy\n");
        execSync(`git add -f ${docsPath}`);
    });

    afterEach(() => {
        try {
            execSync(`git restore --staged ${docsPath}`);
        } catch { /* ignore */ }
        try {
            fs.unlinkSync(docsPath);
        } catch { /* ignore */ }
    });

    test("remove_feature_docs.sh deletes tracked feature-map.md", async () => {
        execSync(scriptPath);

        const exists = fs.existsSync(docsPath);
        let tracked = true;
        try {
            execSync(`git ls-files --error-unmatch ${docsPath}`, { stdio: "ignore" });
        } catch {
            tracked = false;
        }

        expect(exists).toBe(false);
        expect(tracked).toBe(false);
    });
});
