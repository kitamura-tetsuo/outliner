import Database from "better-sqlite3";
import { expect } from "chai";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { corrupt, ProductionOnPrem, waitFor } from "./onprem-production-fixture.js";

describe("on-premises production persistence boundaries", () => {
    let dataDir: string;
    let server: ProductionOnPrem;

    beforeEach(() => {
        dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "outliner-onprem-store-"));
        server = new ProductionOnPrem(dataDir);
    });

    afterEach(async () => {
        server.destroyProviders();
        await server.stop();
        fs.rmSync(dataDir, { recursive: true, force: true });
    });

    it("flushes project and Table documents with clients connected and reloads them after restart", async function() {
        this.timeout(40000);
        await server.start();
        const cookie = await server.login();
        await server.createProject(cookie);
        const project = server.connect("projects/project_one", cookie);
        const table = server.connect("projects/project_one/tables/table_one", cookie);
        await Promise.all([waitFor(project.provider, "synced"), waitFor(table.provider, "synced")]);
        project.doc.getMap("proof").set("projectId", "project-value");
        table.doc.getMap("proof").set("tableId", "table-value");
        expect(await server.stop("SIGTERM", false), server.diagnostics).to.equal(0);
        server.destroyProviders();

        server = new ProductionOnPrem(dataDir);
        await server.start();
        const freshCookie = await server.login();
        const projectReloaded = server.connect("projects/project_one", freshCookie);
        const tableReloaded = server.connect("projects/project_one/tables/table_one", freshCookie);
        await Promise.all([
            waitFor(projectReloaded.provider, "synced"),
            waitFor(tableReloaded.provider, "synced"),
        ]);
        expect(projectReloaded.doc.getMap("proof").get("projectId")).to.equal("project-value");
        expect(tableReloaded.doc.getMap("proof").get("tableId")).to.equal("table-value");
    });

    it("reports not-ready while directory storage is write-locked", async function() {
        this.timeout(15000);
        await server.start();
        const lock = new Database(path.join(dataDir, "projects.sqlite"));
        lock.exec("BEGIN IMMEDIATE");
        try {
            const health = await fetch(server.url("/health"));
            expect(health.status).to.equal(503);
            expect(await health.json()).to.deep.equal({ status: "not-ready", ready: false });
        } finally {
            lock.exec("ROLLBACK");
            lock.close();
        }
    });

    it("reports not-ready after an observed document write failure", async function() {
        this.timeout(30000);
        await server.start();
        const cookie = await server.login();
        await server.createProject(cookie);
        const writer = server.connect("projects/project_one", cookie);
        await waitFor(writer.provider, "synced");
        const lock = new Database(path.join(dataDir, "database.sqlite"));
        lock.exec("BEGIN EXCLUSIVE");
        try {
            writer.doc.getMap("proof").set("cannotPersist", "observed-failure");
            await new Promise(resolve => setTimeout(resolve, 500));
            const health = await fetch(server.url("/health"));
            expect(health.status).to.equal(503);
            expect(await health.json()).to.deep.equal({ status: "not-ready", ready: false });
        } finally {
            lock.exec("ROLLBACK");
            lock.close();
        }
    });

    it("shares one pending shutdown across repeated termination signals", async function() {
        this.timeout(20000);
        await server.start();
        const socket = net.connect(server.port, "127.0.0.1");
        await new Promise<void>((resolve, reject) => {
            socket.once("connect", resolve);
            socket.once("error", reject);
        });
        socket.write("POST /api/projects HTTP/1.1\r\nHost: localhost\r\nContent-Length: 1000\r\n\r\n{");
        server.child!.kill("SIGTERM");
        await new Promise(resolve => setTimeout(resolve, 100));
        server.child!.kill("SIGINT");
        await new Promise(resolve => setTimeout(resolve, 300));
        expect(server.child!.exitCode).to.equal(null);
        socket.destroy();
        const exitCode = await new Promise<number | null>(resolve => server.child!.once("exit", resolve));
        expect(exitCode, server.diagnostics).to.equal(0);
    });

    for (const file of ["projects.sqlite", "database.sqlite"]) {
        it(`refuses corrupt ${file} instead of creating an empty installation`, async function() {
            this.timeout(15000);
            corrupt(path.join(dataDir, file));
            let failure: Error | undefined;
            try {
                await server.start();
            } catch (error) {
                failure = error as Error;
            }
            expect(failure?.message).to.include("did not become ready");
            expect(fs.readFileSync(path.join(dataDir, file), "utf8")).to.equal("not a sqlite database");
        });
    }

    it("exits unsuccessfully when the final document flush cannot acquire storage", async function() {
        this.timeout(20000);
        await server.start();
        const cookie = await server.login();
        await server.createProject(cookie);
        const writer = server.connect("projects/project_one", cookie);
        await waitFor(writer.provider, "synced");
        const lock = new Database(path.join(dataDir, "database.sqlite"));
        lock.exec("BEGIN EXCLUSIVE");
        writer.doc.getMap("proof").set("mustFlush", "blocked");
        try {
            expect(await server.stop("SIGTERM", false), server.diagnostics).to.equal(1);
        } finally {
            lock.exec("ROLLBACK");
            lock.close();
        }
    });
});
