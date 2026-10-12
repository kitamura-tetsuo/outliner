import fs from "fs";
import path from "path";
import { expect, test } from "vitest";

/** @feature ENV-6f6d021a
 *  Title   : Tables E2E tests run in two CI shards
 *  Source  : docs/dev-features/env-e2e-tables-two-shards-6f6d021a.yaml
 */

const workflow = fs.readFileSync(path.resolve(__dirname, "../../.github/workflows/ci-test-e2e.yml"), "utf8");

test("the E2E matrix runs both halves of the tables project", () => {
    expect(workflow).toContain("tables-1, tables-2");
    expect(workflow).toContain('if [[ "$project" =~ ^tables-([12])$ ]]');
    expect(workflow).toContain('--project=tables --shard="${BASH_REMATCH[1]}/2"');
    expect(workflow).not.toMatch(/(?:^|[,[ ]+)tables(?:[,\] ]+)/m);
});
