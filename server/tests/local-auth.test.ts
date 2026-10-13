import { expect } from "chai";
import express from "express";
import { readFileSync } from "fs";
import request from "supertest";
import { createLocalAuth, createLocalAuthFromEnv, LOCAL_SESSION_COOKIE } from "../src/local-auth.js";

const PASSWORD = "s3cret-on-prem";

function buildApp(password: string) {
    const auth = createLocalAuth(password);
    const app = express();
    app.use(express.json());
    app.use("/api", auth.router);
    return { app, auth };
}

function issuedCookie(res: request.Response): string | undefined {
    const header = res.headers["set-cookie"];
    const entries = Array.isArray(header) ? header : header ? [header] : [];
    const match = entries.find((entry) => entry.startsWith(`${LOCAL_SESSION_COOKIE}=`));
    if (!match) return undefined;
    const value = match.slice(LOCAL_SESSION_COOKIE.length + 1).split(";")[0].trim();
    return value ? value : undefined;
}

describe("local password authentication", () => {
    it("refuses initialization without a configured password", () => {
        expect(() => createLocalAuth("")).to.throw();
        expect(() => createLocalAuthFromEnv({})).to.throw();
        expect(() => createLocalAuthFromEnv({ OUTLINER_LOCAL_PASSWORD: "" })).to.throw();
    });

    it("compares passwords as exact strings without trimming", async () => {
        const { app } = buildApp(`  ${PASSWORD}  `);

        for (const attempt of [PASSWORD, `  ${PASSWORD}`, `${PASSWORD}  `]) {
            const res = await request(app).post("/api/local-auth/login").send({ password: attempt });
            expect(res.status).to.equal(401);
            expect(issuedCookie(res)).to.equal(undefined);
        }

        const ok = await request(app).post("/api/local-auth/login").send({ password: `  ${PASSWORD}  ` });
        expect(ok.status).to.equal(200);
    });

    it("rejects lone-surrogate passwords that only collide under lossy UTF-8 encoding", async () => {
        const configured = "secret-\uFFFD";
        const auth = createLocalAuthFromEnv({ OUTLINER_LOCAL_PASSWORD: configured });
        const app = express();
        app.use(express.json());
        app.use("/api", auth.router);

        for (const attempt of ["secret-\uD800", "secret-\uDC00"]) {
            expect(attempt).to.not.equal(configured);
            const res = await request(app).post("/api/local-auth/login").send({ password: attempt });
            expect(res.status).to.equal(401);
            expect(issuedCookie(res)).to.equal(undefined);
        }

        const ok = await request(app).post("/api/local-auth/login").send({ password: configured });
        expect(ok.status).to.equal(200);
        const cookie = issuedCookie(ok);
        expect(cookie).to.be.a("string");
        const session = await request(app).get("/api/local-auth/session").set(
            "Cookie",
            `${LOCAL_SESSION_COOKIE}=${cookie}`,
        );
        expect(session.status).to.equal(200);
        expect(session.body).to.deep.equal({ user: { id: "local-user", name: "Local User" } });
    });

    it("logs in with the exact password and issues an HTTP-only session cookie", async () => {
        const { app } = buildApp(PASSWORD);

        const res = await request(app).post("/api/local-auth/login").send({ password: PASSWORD });

        expect(res.status).to.equal(200);
        expect(res.body).to.deep.equal({ user: { id: "local-user", name: "Local User" } });
        const header = res.headers["set-cookie"];
        expect(header).to.have.lengthOf(1);
        expect(header[0]).to.include(`${LOCAL_SESSION_COOKIE}=`);
        expect(header[0]).to.include("Path=/");
        expect(header[0]).to.include("HttpOnly");
        expect(header[0]).to.include("SameSite=Strict");
        expect(header[0]).to.not.include("Domain=");
        expect(header[0]).to.not.include("Secure");
        expect(JSON.stringify(res.body)).to.not.include(issuedCookie(res) ?? "impossible-cookie");
        expect(JSON.stringify(res.body)).to.not.include(PASSWORD);
    });

    it("rejects a wrong password without issuing a session", async () => {
        const { app } = buildApp(PASSWORD);

        const res = await request(app).post("/api/local-auth/login").send({ password: "wrong" });

        expect(res.status).to.equal(401);
        expect(res.headers["set-cookie"]).to.equal(undefined);
        const session = await request(app).get("/api/local-auth/session");
        expect(session.status).to.equal(401);
    });

    it("rejects missing and non-string passwords with 400 and no session", async () => {
        const { app } = buildApp(PASSWORD);

        for (const body of [{}, { password: undefined }, { password: 123 }, { password: null }, { password: ["x"] }]) {
            const res = await request(app).post("/api/local-auth/login").send(body);
            expect(res.status).to.equal(400);
            expect(res.headers["set-cookie"]).to.equal(undefined);
        }
    });

    it("ignores asserted identity fields: they grant nothing and select nobody", async () => {
        const { app } = buildApp(PASSWORD);

        const forged = await request(app).post("/api/local-auth/login").send({
            password: "wrong",
            uid: "admin",
            username: "admin",
            role: "admin",
            projectId: "anything",
        });
        expect(forged.status).to.equal(401);
        expect(forged.headers["set-cookie"]).to.equal(undefined);

        const ok = await request(app).post("/api/local-auth/login").send({
            password: PASSWORD,
            uid: "admin",
            username: "admin",
            role: "admin",
            projectId: "anything",
        });
        expect(ok.status).to.equal(200);
        expect(ok.body).to.deep.equal({ user: { id: "local-user", name: "Local User" } });
    });

    it("rejects fabricated and unknown cookies", async () => {
        const { app } = buildApp(PASSWORD);

        for (
            const cookie of [
                `${LOCAL_SESSION_COOKIE}=fabricated-session-id`,
                `${LOCAL_SESSION_COOKIE}=`,
                "other-cookie=value",
            ]
        ) {
            const res = await request(app).get("/api/local-auth/session").set("Cookie", cookie);
            expect(res.status).to.equal(401);
        }
        const bare = await request(app).get("/api/local-auth/session");
        expect(bare.status).to.equal(401);
    });

    it("never uses Firebase, emulators, test bypasses, or console logging", () => {
        const source = readFileSync(new URL("../src/local-auth.ts", import.meta.url), "utf8");
        expect(source).to.not.match(/firebase|firestore|google|emulator|ALLOW_TEST_ACCESS|NODE_ENV/i);
        expect(source).to.not.include("console.");
        const imports = source.split("\n").filter((line) => line.startsWith("import "));
        expect(imports).to.have.lengthOf(2);
        expect(imports.join("\n")).to.include("crypto");
        expect(imports.join("\n")).to.include("express");
    });
});
