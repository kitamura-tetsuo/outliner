import { expect } from "chai";
import express from "express";
import fs from "fs";
import { dirname, resolve } from "path";
import sinon from "sinon";
import request from "supertest";
import { fileURLToPath } from "url";
import { createMcpRouter } from "../src/mcp/mcp-api.js";
import { mcpLogger } from "../src/utils/log-manager.js";
import { McpReadError, OutlinerReadService } from "../src/mcp/outliner-read-service.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const testMcpLogPath = resolve(__dirname, "..", "logs", "mcp-diagnostics.log");

describe("MCP Durable Logging", () => {
    let app: express.Express;
    let serviceStub: sinon.SinonStubbedInstance<OutlinerReadService>;

    beforeEach(() => {
        // Clear log file if it exists
        if (fs.existsSync(testMcpLogPath)) {
            fs.truncateSync(testMcpLogPath, 0);
        }

        serviceStub = sinon.createStubInstance(OutlinerReadService);
        const verifyToken = () => ({ uid: "test-user-id", scope: "outliner.read" });
        const mcpRouter = createMcpRouter(
            serviceStub as unknown as OutlinerReadService,
            verifyToken,
            "https://test.issuer",
        );

        app = express();
        app.use(express.json());
        app.use(mcpRouter);
    });

    afterEach(() => {
        sinon.restore();
    });

    it("writes a durable JSONL structured log on mcp_resolution_failed", async () => {
        serviceStub.resolveUrl.rejects(
            new McpReadError("project_not_found", "Project not found", {
                stage: "project_discovery",
                accessibleProjectCount: 0,
            }),
        );

        const mcpRequest = {
            jsonrpc: "2.0",
            id: 1,
            method: "tools/call",
            params: {
                name: "resolve_url",
                arguments: { url: "https://example.com/test/url" },
            },
        };

        const res = await request(app)
            .post("/mcp")
            .set("Authorization", "Bearer valid-token")
            .set("X-Request-Id", "mcp-test-request-1234")
            .set("Accept", "application/json, text/event-stream")
            .send(mcpRequest);

        // res is standard JSON RPC or just wait for it to be logged.

        mcpLogger.flush();
        // wait for Pino stream to flush
        await new Promise(r => setTimeout(r, 2000));

        let found = false;
        // the logger uses Pino stream which might take a bit
        for (let i = 0; i < 50; i++) {
            if (fs.existsSync(testMcpLogPath)) {
                const text = fs.readFileSync(testMcpLogPath, "utf-8");
                if (text.includes("mcp_resolution_failed")) {
                    found = true;
                    break;
                }
            }
            await new Promise(r => setTimeout(r, 100));
        }

        if (fs.existsSync(testMcpLogPath)) console.log(fs.readFileSync(testMcpLogPath, "utf8"));
        expect(found).to.be.true;

        const logs = fs.readFileSync(testMcpLogPath, "utf-8").split("\n").filter(Boolean);
        expect(logs.length).to.be.greaterThan(0);

        const diagnosticLog = JSON.parse(logs[logs.length - 1]);
        expect(diagnosticLog.event).to.equal("mcp_resolution_failed");
        expect(diagnosticLog.requestId).to.equal("mcp-test-request-1234");
        expect(diagnosticLog.code).to.equal("project_not_found");
        expect(diagnosticLog.stage).to.equal("project_discovery");
        expect(diagnosticLog.accessibleProjectCount).to.equal(0);

        // Ensure no raw token/uid is leaked (only uidFingerprint is present)
        expect(diagnosticLog.uidFingerprint).to.be.a("string").with.lengthOf(12);
        expect(diagnosticLog.uid).to.be.undefined;
        expect(diagnosticLog.token).to.be.undefined;
        expect(diagnosticLog.authorization).to.be.undefined;
    });
});
