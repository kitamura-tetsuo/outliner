import { expect } from "chai";
import express from "express";
import request from "supertest";
import { createProjectDirectoryRouter } from "../src/project-directory-api.js";

describe("project directory API mount scope", () => {
    it("does not require project-directory authentication for later API routers", async () => {
        const app = express();
        app.use(express.json());
        app.use(
            "/api",
            createProjectDirectoryRouter({
                verifyToken: async () => ({ uid: "owner" }) as never,
            }),
        );
        app.post("/api/seed-demo", (_req, res) => res.status(204).end());

        const response = await request(app).post("/api/seed-demo").send({ project: "demo" });

        expect(response.status).to.equal(204);
    });

    it("still protects the canonical project endpoints", async () => {
        const app = express();
        app.use("/api", createProjectDirectoryRouter());

        const response = await request(app).get("/api/projects");

        expect(response.status).to.equal(401);
    });
});
