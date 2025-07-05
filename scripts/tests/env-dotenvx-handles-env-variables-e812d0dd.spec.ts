import { execSync } from "child_process";
import path from "path";
import { fileURLToPath } from "url";
import { expect, test } from "vitest";

/** @feature ENV-0005
 *  Title   : dotenvx handles env variables without cross-env
 *  Source  : docs/dev-features.yaml
 */

test("dotenvx loads NODE_ENV and TEST_ENV without cross-env", () => {
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);
    const repoRoot = path.resolve(__dirname, "../..");

    const command =
        `(cd client && NODE_ENV=test TEST_ENV=localhost npx dotenvx run --env-file=.env.test -- node -e "console.log(process.env.NODE_ENV + '|' + process.env.TEST_ENV)")`;
    const output = execSync(command, { cwd: repoRoot }).toString().trim();
    const lines = output.split(/\r?\n/);
    expect(lines.at(-1)).toBe("test|localhost");
});
