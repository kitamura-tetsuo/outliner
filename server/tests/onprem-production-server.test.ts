import { expect } from "chai";
import { type ChildProcess, spawn } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import request from "supertest";
import { loadConfig } from "../src/config.js";
import { LOCAL_SESSION_COOKIE } from "../src/local-auth.js";
import { startOnPremServer } from "../src/onprem-server.js";

describe("on-premises production composition", () => {
    const previousPassword = process.env.OUTLINER_LOCAL_PASSWORD;
    let dataDir: string;
    let shutdown: (() => Promise<void>) | undefined;
    let child: ChildProcess | undefined;

    beforeEach(() => {
        dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "outliner-onprem-"));
        process.env.OUTLINER_LOCAL_PASSWORD = "production-password";
    });

    afterEach(async () => {
        await shutdown?.();
        if (child && child.exitCode === null) {
            child.kill("SIGTERM");
            await new Promise(resolve => child!.once("exit", resolve));
        }
        child = undefined;
        shutdown = undefined;
        if (previousPassword === undefined) delete process.env.OUTLINER_LOCAL_PASSWORD;
        else process.env.OUTLINER_LOCAL_PASSWORD = previousPassword;
        fs.rmSync(dataDir, { recursive: true, force: true });
    });

    it("boots the actual production entry point without Firebase configuration", async function() {
        this.timeout(15000);
        const port = await new Promise<number>((resolve, reject) => {
            const probe = net.createServer();
            probe.once("error", reject);
            probe.listen(0, "127.0.0.1", () => {
                const address = probe.address();
                if (!address || typeof address === "string") return reject(new Error("No test port"));
                probe.close(error => error ? reject(error) : resolve(address.port));
            });
        });
        child = spawn(process.execPath, [
            "--loader",
            "ts-node/esm",
            "--loader",
            "./tests/loaders/pin-server-deps.mjs",
            "--no-warnings",
            "src/index.ts",
        ], {
            cwd: path.resolve(import.meta.dirname, ".."),
            env: {
                PATH: process.env.PATH,
                NODE_ENV: "production",
                PORT: String(port),
                OUTLINER_DEPLOYMENT_MODE: "onprem",
                OUTLINER_DATA_DIR: dataDir,
                OUTLINER_LOCAL_PASSWORD: "production-password",
                // A cloud telemetry setting must remain inactive in onprem.
                SENTRY_DSN: "https://invalid@example.invalid/1",
            },
            stdio: ["ignore", "pipe", "pipe"],
        });
        let diagnostics = "";
        child.stdout?.on("data", chunk => diagnostics += chunk.toString());
        child.stderr?.on("data", chunk => diagnostics += chunk.toString());
        const deadline = Date.now() + 10000;
        let deployment: Response | undefined;
        while (Date.now() < deadline && child.exitCode === null) {
            try {
                deployment = await fetch(`http://127.0.0.1:${port}/api/deployment`);
                if (deployment.ok) break;
            } catch {
                await new Promise(resolve => setTimeout(resolve, 50));
            }
        }
        expect(child.exitCode, diagnostics).to.equal(null);
        expect(deployment?.status, diagnostics).to.equal(200);
        expect(await deployment!.json()).to.deep.equal({
            deploymentMode: "onprem",
            supportedFeatures: ["projects", "outline", "tables", "grids"],
        });
        child.kill("SIGTERM");
        const exitCode = await new Promise<number | null>(resolve => child!.once("exit", resolve));
        expect(exitCode, diagnostics).to.equal(0);
    });

    it("validates explicit deployment selection without implicit local fallback", () => {
        expect(loadConfig({}).OUTLINER_DEPLOYMENT_MODE).to.equal("cloud");
        expect(() => loadConfig({ OUTLINER_DEPLOYMENT_MODE: "invalid" })).to.throw();
        expect(() => loadConfig({ OUTLINER_DEPLOYMENT_MODE: "onprem" })).to.throw("OUTLINER_DATA_DIR");
        expect(() =>
            loadConfig({
                OUTLINER_DEPLOYMENT_MODE: "onprem",
                OUTLINER_DATA_DIR: dataDir,
                DISABLE_PERSISTENCE: "true",
            })
        ).to.throw("requires persistence");
    });

    it("boots with local storage and exposes only authenticated committed projects", async () => {
        const started = await startOnPremServer(loadConfig({
            PORT: "0",
            OUTLINER_DEPLOYMENT_MODE: "onprem",
            OUTLINER_DATA_DIR: dataDir,
        }));
        shutdown = started.shutdown;

        expect((await request(started.server).get("/health")).body).to.deep.include({ status: "ok", ready: true });
        expect((await request(started.server).get("/api/deployment")).body).to.deep.equal({
            deploymentMode: "onprem",
            supportedFeatures: ["projects", "outline", "tables", "grids"],
        });
        expect((await request(started.server).get("/api/projects")).status).to.equal(401);
        expect((await request(started.server).post("/api/local-auth/login").send({ password: "wrong" })).status)
            .to.equal(401);

        const login = await request(started.server).post("/api/local-auth/login").send({
            password: "production-password",
        });
        const cookie = (login.headers["set-cookie"] as unknown as string[])[0]!.split(";")[0]!;
        expect(cookie).to.match(new RegExp(`^${LOCAL_SESSION_COOKIE}=`));
        const create = await request(started.server).post("/api/projects").set("Cookie", cookie).send({
            projectId: "project_one",
            title: "Project One",
        });
        expect(create.status).to.equal(201);
        expect(create.body).to.deep.equal({ projectId: "project_one", title: "Project One" });
        expect(
            (await request(started.server).post("/api/projects").set("Cookie", cookie).send({
                projectId: "not/a/room",
                title: "Invalid",
            })).status,
        ).to.equal(400);
        expect((await request(started.server).get("/api/projects").set("Cookie", cookie)).body).to.deep.equal({
            projects: [{ projectId: "project_one", title: "Project One" }],
        });
        expect((await request(started.server).post("/api/seed-demo").set("Cookie", cookie)).status).to.equal(501);

        await shutdown();
        shutdown = undefined;
        const restarted = await startOnPremServer(loadConfig({
            PORT: "0",
            OUTLINER_DEPLOYMENT_MODE: "onprem",
            OUTLINER_DATA_DIR: dataDir,
        }));
        shutdown = restarted.shutdown;
        const secondLogin = await request(restarted.server).post("/api/local-auth/login").send({
            password: "production-password",
        });
        const secondCookie = (secondLogin.headers["set-cookie"] as unknown as string[])[0]!.split(";")[0]!;
        expect((await request(restarted.server).get("/api/projects").set("Cookie", secondCookie)).body).to.deep.equal({
            projects: [{ projectId: "project_one", title: "Project One" }],
        });
    });
});
