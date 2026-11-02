import { expect } from "chai";
import { once } from "node:events";
import fs from "node:fs";
import http, { type OutgoingHttpHeaders } from "node:http";
import os from "node:os";
import path from "node:path";
import { ProductionOnPrem } from "./onprem-production-fixture.js";

function observeRequest(server: ProductionOnPrem, headers: OutgoingHttpHeaders) {
    const request = http.request(server.url("/api/projects"), {
        method: "POST",
        headers: { "Content-Length": "1000", Expect: "100-continue", ...headers },
    });
    const state = { finalStatus: undefined as number | undefined, errors: [] as Error[] };
    request.on("response", response => {
        state.finalStatus = response.statusCode;
        response.resume();
    });
    request.on("error", error => state.errors.push(error));
    const assertInFlight = () => {
        expect(state.finalStatus, "the request must still be in flight").to.equal(undefined);
        expect(state.errors).to.deep.equal([]);
    };
    return { request, assertInFlight };
}

describe("on-premises repeated termination with an observed active request", () => {
    let dataDir: string;
    let server: ProductionOnPrem;
    let request: http.ClientRequest | undefined;

    beforeEach(() => {
        dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "outliner-onprem-shutdown-"));
        server = new ProductionOnPrem(dataDir);
    });

    afterEach(async () => {
        request?.destroy();
        await server.stop();
        fs.rmSync(dataDir, { recursive: true, force: true });
        request = undefined;
    });

    it("shares one pending shutdown across repeated termination signals", async function() {
        this.timeout(20000);
        await server.start();
        const observation = observeRequest(server, {
            Cookie: await server.login(),
            "Content-Type": "application/json",
        });
        request = observation.request;
        const continued = once(request, "continue", { signal: AbortSignal.timeout(8000) });
        request.flushHeaders();
        await continued;
        request.write("{");
        server.child!.kill("SIGTERM");
        await new Promise(resolve => setTimeout(resolve, 100));
        server.child!.kill("SIGINT");
        await new Promise(resolve => setTimeout(resolve, 300));
        observation.assertInFlight();
        expect(server.child!.exitCode).to.equal(null);
        request.destroy();
        const exitCode = await new Promise<number | null>(resolve => server.child!.once("exit", resolve));
        expect(exitCode, server.diagnostics).to.equal(0);
    });

    it("rejects a real unauthorized completed request as an in-flight oracle", async function() {
        this.timeout(20000);
        await server.start();
        const observation = observeRequest(server, {});
        request = observation.request;
        const response = once(request, "response", { signal: AbortSignal.timeout(8000) });
        const continued = once(request, "continue", { signal: AbortSignal.timeout(8000) });
        request.flushHeaders();
        await continued;
        request.write("{");
        const [actual] = await response;
        expect((actual as http.IncomingMessage).statusCode).to.equal(401);
        expect(observation.assertInFlight).to.throw("the request must still be in flight");
    });
});
