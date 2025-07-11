import fs from "fs";
import path from "path";
import { expect, test } from "vitest";

test("run-e2e-progress-for-codex.sh exists", () => {
    const script = path.resolve(__dirname, "..", "run-e2e-progress-for-codex.sh");
    expect(fs.existsSync(script)).toBe(true);
});
