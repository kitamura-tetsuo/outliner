import { expect } from "chai";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { ProductionOnPrem } from "./onprem-production-fixture.js";

describe("on-premises production startup ownership", () => {
    let dataDir: string;

    beforeEach(() => {
        dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "outliner-onprem-startup-"));
    });

    afterEach(() => fs.rmSync(dataDir, { recursive: true, force: true }));

    it("does not mistake a healthy unrelated listener for its failed child", async function() {
        this.timeout(15000);
        const unrelated = http.createServer((_request, response) => response.end('{"status":"ok"}'));
        await new Promise<void>((resolve, reject) => {
            unrelated.once("error", reject);
            unrelated.listen(0, "127.0.0.1", resolve);
        });
        const address = unrelated.address();
        if (!address || typeof address === "string") throw new Error("Unrelated listener has no TCP address");
        const production = new ProductionOnPrem(dataDir, { port: address.port });
        try {
            let failure: Error | undefined;
            try {
                await production.start();
            } catch (error) {
                failure = error as Error;
            }
            expect(failure?.message).to.include("did not become ready");
            expect(production.diagnostics).to.include("EADDRINUSE");
            expect(production.child?.exitCode).to.not.equal(null);
            expect((await fetch(`http://127.0.0.1:${address.port}/health`)).status).to.equal(200);
        } finally {
            await production.stop();
            await new Promise<void>((resolve, reject) => unrelated.close(error => error ? reject(error) : resolve()));
        }
    });

    it("times out and cleans up a live child that never supplies listener ownership evidence", async function() {
        this.timeout(5000);
        const production = new ProductionOnPrem(dataDir, {
            startupTimeout: 200,
            entrypointArgs: ["-e", "setInterval(() => {}, 1000)"],
        });
        let failure: Error | undefined;
        try {
            await production.start();
        } catch (error) {
            failure = error as Error;
        }
        expect(failure?.message).to.include("readiness timed out");
        expect(production.child?.signalCode).to.equal("SIGTERM");
    });
});
