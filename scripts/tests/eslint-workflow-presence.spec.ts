import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { describe, expect, it } from "vitest";

describe("ESLint promotion workflow presence", () => {
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);
    const workflowPath = path.resolve(__dirname, "../../.github/workflows/promote-eslint-candidates.yml");

    it("workflow file exists", () => {
        expect(fs.existsSync(workflowPath)).toBe(true);
    });

    it("contains detection step and PR creation", () => {
        const content = fs.readFileSync(workflowPath, "utf8");
        expect(content).toContain("Detect and Promote ESLint Rules");
        expect(content).toContain("Detect promotion candidates");
        expect(content).toContain("peter-evans/create-pull-request");
    });
});
