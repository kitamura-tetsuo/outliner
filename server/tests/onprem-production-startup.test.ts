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

    it("bounds an unresponsive health request and forcibly removes only its suspended child", async function() {
        this.timeout(25000);
        let ownedPid: number | undefined;
        const production = new ProductionOnPrem(dataDir, {
            startupTimeout: 15000,
            cleanupTimeout: 300,
            onListening(child) {
                ownedPid = child.pid;
                if (!ownedPid) throw new Error("Production child has no pid");
                process.kill(ownedPid, "SIGSTOP");
            },
        });
        const startedAt = Date.now();
        let failure: Error | undefined;
        try {
            await production.start();
        } catch (error) {
            failure = error as Error;
        }
        expect(failure?.message).to.include("readiness timed out");
        expect(Date.now() - startedAt).to.be.lessThan(17000);
        expect(production.diagnostics).to.include("sending SIGKILL");
        expect(production.child?.signalCode).to.equal("SIGKILL");
        expect(() => process.kill(ownedPid!, 0)).to.throw();
        await expectFetchToFail(production.url("/health"));
    });

    it("bounds stop and escalates when its production child cannot handle SIGTERM", async function() {
        this.timeout(20000);
        const production = new ProductionOnPrem(dataDir, { cleanupTimeout: 300 });
        await production.start();
        const ownedPid = production.child?.pid;
        if (!ownedPid) throw new Error("Production child has no pid");
        process.kill(ownedPid, "SIGSTOP");
        const stoppedAt = Date.now();
        expect(await production.stop()).to.equal(1);
        expect(Date.now() - stoppedAt).to.be.lessThan(1500);
        expect(production.diagnostics).to.include("sending SIGKILL");
        expect(production.child?.signalCode).to.equal("SIGKILL");
        expect(() => process.kill(ownedPid, 0)).to.throw();
        await expectFetchToFail(production.url("/health"));
    });
});

async function expectFetchToFail(url: string): Promise<void> {
    let failure: unknown;
    try {
        await fetch(url);
    } catch (error) {
        failure = error;
    }
    expect(failure).to.be.instanceOf(Error);
}
