import { expect } from "chai";
import { localMcpDiagnosticsConfig, PRODUCTION_FIREBASE_CONFIRMATION } from "../src/mcp/local-diagnostics.js";

describe("local MCP diagnostics configuration", () => {
    it("defaults to disabled emulator mode", () => {
        expect(localMcpDiagnosticsConfig({ NODE_ENV: "test" })).to.deep.equal({
            enabled: false,
            firebaseMode: "emulator",
        });
    });

    it("requires both emulator hosts when local diagnostics are enabled", () => {
        expect(() => localMcpDiagnosticsConfig({ NODE_ENV: "development", MCP_LOCAL_DIAGNOSTICS: "true" }))
            .to.throw("require FIRESTORE_EMULATOR_HOST");
        expect(localMcpDiagnosticsConfig({
            NODE_ENV: "development",
            MCP_LOCAL_DIAGNOSTICS: "true",
            FIRESTORE_EMULATOR_HOST: "localhost:58080",
            FIREBASE_AUTH_EMULATOR_HOST: "localhost:59099",
        })).to.deep.equal({ enabled: true, firebaseMode: "emulator" });
    });

    it("requires a deliberate double opt-in for production Firebase", () => {
        expect(() => localMcpDiagnosticsConfig({ NODE_ENV: "development", MCP_FIREBASE_MODE: "production" }))
            .to.throw("explicit confirmation");
        expect(localMcpDiagnosticsConfig({
            NODE_ENV: "development",
            MCP_LOCAL_DIAGNOSTICS: "true",
            MCP_FIREBASE_MODE: "production",
            MCP_PRODUCTION_FIREBASE_CONFIRM: PRODUCTION_FIREBASE_CONFIRMATION,
        })).to.deep.equal({ enabled: true, firebaseMode: "production" });
    });

    it("rejects production runtime and conflicting emulator configuration", () => {
        expect(() => localMcpDiagnosticsConfig({ NODE_ENV: "production", MCP_LOCAL_DIAGNOSTICS: "true" }))
            .to.throw("cannot run");
        expect(() =>
            localMcpDiagnosticsConfig({
                NODE_ENV: "development",
                MCP_LOCAL_DIAGNOSTICS: "true",
                MCP_FIREBASE_MODE: "production",
                MCP_PRODUCTION_FIREBASE_CONFIRM: PRODUCTION_FIREBASE_CONFIRMATION,
                FIRESTORE_EMULATOR_HOST: "localhost:58080",
            })
        ).to.throw("cannot be combined");
    });
});
