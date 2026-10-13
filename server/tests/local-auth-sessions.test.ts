import { expect } from "chai";
import express from "express";
import request from "supertest";
import { createLocalAuth, LOCAL_SESSION_COOKIE } from "../src/local-auth.js";

const PASSWORD = "s3cret-on-prem";
const LOCAL_USER_BODY = { user: { id: "local-user", name: "Local User" } };

function buildApp(password: string) {
    const auth = createLocalAuth(password);
    const app = express();
    app.use(express.json());
    app.use("/api", auth.router);
    return { app, auth };
}

function issuedCookie(res: request.Response): string {
    const header = res.headers["set-cookie"];
    const entries = Array.isArray(header) ? header : header ? [header] : [];
    const match = entries.find((entry) => entry.startsWith(`${LOCAL_SESSION_COOKIE}=`));
    const value = match?.slice(LOCAL_SESSION_COOKIE.length + 1).split(";")[0].trim();
    expect(value, "expected an issued session cookie").to.be.a("string").and.not.empty;
    return value as string;
}

async function login(app: express.Express, password: string): Promise<string> {
    const res = await request(app).post("/api/local-auth/login").send({ password });
    expect(res.status).to.equal(200);
    return issuedCookie(res);
}

describe("local session lifecycle", () => {
    it("keeps two logins independent and revokes only the logged-out session", async () => {
        const { app, auth } = buildApp(PASSWORD);
        const cookieA = await login(app, PASSWORD);
        const cookieB = await login(app, PASSWORD);
        expect(cookieA).to.not.equal(cookieB);

        for (const cookie of [cookieA, cookieB]) {
            const res = await request(app).get("/api/local-auth/session").set(
                "Cookie",
                `${LOCAL_SESSION_COOKIE}=${cookie}`,
            );
            expect(res.status).to.equal(200);
            expect(res.body).to.deep.equal(LOCAL_USER_BODY);
        }

        const cachedUser = (await request(app).get("/api/local-auth/session").set(
            "Cookie",
            `${LOCAL_SESSION_COOKIE}=${cookieA}`,
        )).body.user;

        const logout = await request(app).post("/api/local-auth/logout").set(
            "Cookie",
            `${LOCAL_SESSION_COOKIE}=${cookieA}`,
        );
        expect(logout.status).to.equal(204);
        const cleared = logout.headers["set-cookie"]?.join(";") ?? "";
        expect(cleared).to.include(`${LOCAL_SESSION_COOKIE}=;`);
        expect(cleared).to.include("Max-Age=0");

        const retry = await request(app).get("/api/local-auth/session").set(
            "Cookie",
            `${LOCAL_SESSION_COOKIE}=${cookieA}`,
        );
        expect(retry.status).to.equal(401);
        expect(auth.resolveSessionUser(cookieA)).to.equal(undefined);
        expect(cachedUser).to.deep.equal({ id: "local-user", name: "Local User" });
        expect(auth.resolveSessionUser(cookieA), "cached user object is not session evidence").to.equal(undefined);

        const repeat = await request(app).post("/api/local-auth/logout").set(
            "Cookie",
            `${LOCAL_SESSION_COOKIE}=${cookieA}`,
        );
        expect(repeat.status).to.equal(204);

        const survivor = await request(app).get("/api/local-auth/session").set(
            "Cookie",
            `${LOCAL_SESSION_COOKIE}=${cookieB}`,
        );
        expect(survivor.status).to.equal(200);
        expect(survivor.body).to.deep.equal(LOCAL_USER_BODY);
    });

    it("logout without a cookie stays idempotent and revokes nothing", async () => {
        const { app } = buildApp(PASSWORD);
        const cookie = await login(app, PASSWORD);

        const res = await request(app).post("/api/local-auth/logout");
        expect(res.status).to.equal(204);

        const survivor = await request(app).get("/api/local-auth/session").set(
            "Cookie",
            `${LOCAL_SESSION_COOKIE}=${cookie}`,
        );
        expect(survivor.status).to.equal(200);
    });

    it("restart invalidates old sessions and a replacement password keeps the same owner", async () => {
        const first = buildApp("first-password");
        const oldCookie = await login(first.app, "first-password");

        const second = buildApp("second-password");
        const stale = await request(second.app).get("/api/local-auth/session").set(
            "Cookie",
            `${LOCAL_SESSION_COOKIE}=${oldCookie}`,
        );
        expect(stale.status).to.equal(401);
        expect(second.auth.resolveSessionUser(oldCookie)).to.equal(undefined);

        const oldPassword = await request(second.app).post("/api/local-auth/login").send({
            password: "first-password",
        });
        expect(oldPassword.status).to.equal(401);
        expect(oldPassword.headers["set-cookie"]).to.equal(undefined);

        const fresh = await request(second.app).post("/api/local-auth/login").send({ password: "second-password" });
        expect(fresh.status).to.equal(200);
        expect(fresh.body).to.deep.equal(LOCAL_USER_BODY);
        expect(JSON.stringify(fresh.body)).to.not.include("second-password");

        for (const body of [fresh.body, LOCAL_USER_BODY]) {
            expect(Object.keys(body)).to.not.include("projects");
            expect(Object.keys(body)).to.not.include("seed");
        }
    });
});
