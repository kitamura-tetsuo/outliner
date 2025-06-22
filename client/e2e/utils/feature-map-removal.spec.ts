import { test, expect } from "@playwright/test";
import { execSync } from "child_process";
import fs from "fs";
import path from "path";

/** @feature TST-0006
 *  Title   : feature-map削除スクリプト
 *  Source  : docs/dev-features.yaml
 */

test.describe("TST-0006: feature-map削除スクリプト", () => {
    const repoRoot = path.resolve(__dirname, "../../.." );
    const docsPath = path.join(repoRoot, "docs", "feature-map.md");
    const scriptPath = path.join(repoRoot, "scripts", "remove_feature_map.sh");

    test.beforeEach(() => {
        if (!fs.existsSync(path.dirname(docsPath))) {
            fs.mkdirSync(path.dirname(docsPath), { recursive: true });
        }
        fs.writeFileSync(docsPath, "# dummy\n");
        execSync(`git add ${docsPath}`);
    });

    test.afterEach(() => {
        try { execSync(`git restore --staged ${docsPath}`); } catch { /* ignore */ }
        try { fs.unlinkSync(docsPath); } catch { /* ignore */ }
    });

    test("remove_feature_map.sh deletes tracked feature-map.md", async () => {
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
