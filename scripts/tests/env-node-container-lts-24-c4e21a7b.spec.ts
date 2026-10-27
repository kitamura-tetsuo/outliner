import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "vitest";

/** @feature ENV-c4e21a7b
 *  Title: Non-Firebase containers use Node.js 24 LTS
 *  Source: docs/dev-features/env-node-container-lts-24-c4e21a7b.yaml
 */

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const read = (file: string) => fs.readFileSync(path.join(root, file), "utf8");

test("production, debug, and every on-prem stage use the compatible Node 24 image", () => {
    for (const file of ["server/Dockerfile", "server/Dockerfile.debug"]) {
        expect(read(file).match(/^FROM\s+node:24-bookworm-slim(?:\s|$)/gm)).toHaveLength(1);
    }

    expect(read("Dockerfile.onprem").match(/^FROM\s+node:24-bookworm-slim(?:\s|$)/gm)).toHaveLength(3);
});

test("Firebase emulator container remains on its supported Node 22 image", () => {
    expect(read("firebase/Dockerfile")).toMatch(/^FROM\s+node:22-slim$/m);
});

test("container smoke checks reject a Node major other than 24", () => {
    const serverWorkflow = read(".github/workflows/ci-docker-build.yml");
    expect(serverWorkflow.match(/process\.versions\.node\.split\('\.'\)\[0\] !== '24'/g)).toHaveLength(3);
    expect(serverWorkflow).toMatch(
        /docker run -d --name yjs-ws-server-smoke[\s\S]*fetch\('http:\/\/127\.0\.0\.1:7093\/health'\)/,
    );
    expect(serverWorkflow).not.toMatch(
        /docker run -d --name yjs-ws-server-smoke[\s\S]{0,500}OUTLINER_DEPLOYMENT_MODE=onprem/,
    );
    expect(serverWorkflow).toMatch(/fetch\('http:\/\/127\.0\.0\.1:7093\/api\/deployment'\)/);
    expect(serverWorkflow).toMatch(/body\.deploymentMode !== 'cloud'/);
    expect(serverWorkflow).toMatch(/Cloud server exited before becoming ready/);

    const onpremDockerfile = read("Dockerfile.onprem");
    expect(onpremDockerfile).toMatch(/HEALTHCHECK[\s\S]*process\.versions\.node\.split\('\.'\)\[0\]!==\'24\'/);

    const onpremSmoke = read("scripts/test-onprem-compose.sh");
    expect(onpremSmoke).toMatch(/exec -T app node -e[\s\\\n]+.*process\.versions\.node\.split\('\.'\)\[0\] !== '24'/);
});
