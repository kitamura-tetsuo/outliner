import Database from "better-sqlite3";
import { expect } from "chai";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { ProductionOnPrem, waitFor } from "./onprem-production-fixture.js";

describe("on-premises production WebSocket authorization", () => {
    let dataDir: string;
    let server: ProductionOnPrem;

    beforeEach(async function() {
        this.timeout(15000);
        dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "outliner-onprem-ws-"));
        server = new ProductionOnPrem(dataDir);
        await server.start();
    });

    afterEach(async () => {
        await server.stop();
        fs.rmSync(dataDir, { recursive: true, force: true });
    });

    it("admits registered project and Table rooms but denies an unregistered project", async function() {
        this.timeout(15000);
        const cookie = await server.login();
        await server.createProject(cookie);
        for (const room of ["projects/project_one", "projects/project_one/tables/table_one"]) {
            const { provider } = server.connect(room, cookie);
            await waitFor(provider, "synced").catch(error => {
                throw new Error(`${error.message}\n${server.diagnostics}`);
            });
        }
        const missing = server.connect("projects/missing_project", cookie);
        await waitFor(missing.provider, "authenticationFailed");
        for (
            const malformedRoom of [
                "projects//project_one",
                "projects/project_one/",
                "projects/project_one//tables/table_one",
                "projects/project_one/tables//table_one",
                "projects/project_one/tables/table_one/",
            ]
        ) {
            const malformed = server.connect(malformedRoom, cookie);
            await new Promise<void>((resolve, reject) => {
                const timer = setTimeout(
                    () => reject(new Error(`Malformed room was not rejected: ${malformedRoom}`)),
                    8000,
                );
                const rejected = () => {
                    clearTimeout(timer);
                    resolve();
                };
                malformed.provider.on("authenticationFailed", rejected);
                malformed.provider.on("disconnect", rejected);
            });
        }
        const stored = new Database(path.join(dataDir, "database.sqlite"), { readonly: true });
        try {
            const row = stored.prepare("SELECT name FROM documents WHERE name = ?").get("projects/missing_project");
            expect(row).to.equal(undefined);
            const aliases = stored.prepare("SELECT name FROM documents WHERE name LIKE '%//%' OR name LIKE '%/'")
                .all();
            expect(aliases).to.deep.equal([]);
        } finally {
            stored.close();
        }
    });

    it("rejects an update on an existing socket after logout", async function() {
        this.timeout(30000);
        const cookie = await server.login();
        await server.createProject(cookie);
        const writer = server.connect("projects/project_one", cookie);
        const observer = server.connect("projects/project_one", cookie);
        await Promise.all([waitFor(writer.provider, "synced"), waitFor(observer.provider, "synced")]);
        const observedFirst = new Promise<void>(resolve => observer.doc.getMap("proof").observe(() => resolve()));
        writer.doc.getMap("proof").set("accepted", "update-1");
        await observedFirst;
        const logout = await fetch(server.url("/api/local-auth/logout"), {
            method: "POST",
            headers: { cookie },
        });
        expect(logout.status).to.equal(204);
        writer.doc.getMap("proof").set("rejected", "update-2");
        await new Promise(resolve => setTimeout(resolve, 500));

        const freshCookie = await server.login();
        const fresh = server.connect("projects/project_one", freshCookie);
        await waitFor(fresh.provider, "synced");
        expect(fresh.doc.getMap("proof").toJSON()).to.deep.equal({ accepted: "update-1" });

        expect(await server.stop("SIGTERM", false), server.diagnostics).to.equal(0);
        server.destroyProviders();
        server = new ProductionOnPrem(dataDir);
        await server.start();
        const restartCookie = await server.login();
        const persisted = server.connect("projects/project_one", restartCookie);
        await waitFor(persisted.provider, "synced");
        expect(persisted.doc.getMap("proof").toJSON()).to.deep.equal({ accepted: "update-1" });
    });
});
