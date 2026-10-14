import { expect } from "chai";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import request from "supertest";
import { loadConfig } from "../src/config.js";
import { LOCAL_SESSION_COOKIE } from "../src/local-auth.js";
import { startOnPremServer } from "../src/onprem-server.js";
import { ProductionOnPrem } from "./onprem-production-fixture.js";
// Keep the complete production lifecycle oracle reachable from this suite's
// canonical entrypoint. Mocha's ESM cache prevents duplicate registration
// when its file glob later encounters these focused suites directly.
import "./onprem-production-persistence.test.js";
import "./onprem-production-websocket.test.js";

describe("on-premises production composition", () => {
    const previousPassword = process.env.OUTLINER_LOCAL_PASSWORD;
    let dataDir: string;
    let shutdown: (() => Promise<void>) | undefined;

    beforeEach(() => {
        dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "outliner-onprem-"));
        process.env.OUTLINER_LOCAL_PASSWORD = "production-password";
    });

    afterEach(async () => {
        await shutdown?.();
        shutdown = undefined;
        if (previousPassword === undefined) delete process.env.OUTLINER_LOCAL_PASSWORD;
        else process.env.OUTLINER_LOCAL_PASSWORD = previousPassword;
        fs.rmSync(dataDir, { recursive: true, force: true });
    });

    it("boots the actual production entry point without Firebase configuration", async function() {
        this.timeout(15000);
        const production = new ProductionOnPrem(dataDir);
        await production.start();
        expect(await (await fetch(production.url("/api/deployment"))).json()).to.deep.equal({
            deploymentMode: "onprem",
            supportedFeatures: ["projects", "outline", "tables", "grids"],
        });
        expect(await production.stop(), production.diagnostics).to.equal(0);
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
        expect(() =>
            loadConfig({
                OUTLINER_DEPLOYMENT_MODE: "onprem",
                OUTLINER_DATA_DIR: dataDir,
                OUTLINER_STATIC_DIR: "  ",
            })
        ).to.throw("OUTLINER_STATIC_DIR");
    });

    it("serves navigation and assets from the production origin without masking failures", async () => {
        const staticDir = fs.mkdtempSync(path.join(os.tmpdir(), "outliner-static-"));
        fs.writeFileSync(path.join(staticDir, "index.html"), "<!doctype html><title>Outliner local</title>");
        fs.writeFileSync(path.join(staticDir, "app.js"), "globalThis.outliner = true;");
        try {
            const started = await startOnPremServer(loadConfig({
                PORT: "0",
                OUTLINER_DEPLOYMENT_MODE: "onprem",
                OUTLINER_DATA_DIR: dataDir,
                OUTLINER_STATIC_DIR: staticDir,
            }));
            shutdown = started.shutdown;

            expect((await request(started.server).get("/app.js")).text).to.equal("globalThis.outliner = true;");
            expect((await request(started.server).get("/Project/Page").set("Accept", "text/html")).text).to.contain(
                "Outliner local",
            );
            expect(
                (await request(started.server).get("/Project/Release%201.0").set("Accept", "text/html")).text,
            ).to.contain("Outliner local");
            expect((await request(started.server).get("/missing.js").set("Accept", "text/html")).status).to.equal(404);
            const api = await request(started.server).get("/api/not-supported").set("Accept", "text/html");
            expect(api.status).to.equal(501);
            expect(api.type).to.equal("application/json");
        } finally {
            fs.rmSync(staticDir, { recursive: true, force: true });
        }
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
