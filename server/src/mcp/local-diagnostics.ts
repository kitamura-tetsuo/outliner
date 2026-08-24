export const PRODUCTION_FIREBASE_CONFIRMATION = "I_UNDERSTAND_THIS_READS_PRODUCTION_FIREBASE";

export type LocalMcpFirebaseMode = "emulator" | "production";

export interface LocalMcpDiagnosticsConfig {
    enabled: boolean;
    firebaseMode: LocalMcpFirebaseMode;
}

/**
 * Validates the deliberately narrow local MCP diagnostic surface. This never
 * enables an authentication bypass or an MCP write tool.
 */
export function localMcpDiagnosticsConfig(env: NodeJS.ProcessEnv = process.env): LocalMcpDiagnosticsConfig {
    const enabled = env.MCP_LOCAL_DIAGNOSTICS === "true";
    const firebaseMode = env.MCP_FIREBASE_MODE === "production" ? "production" : "emulator";

    if (env.MCP_FIREBASE_MODE && !["emulator", "production"].includes(env.MCP_FIREBASE_MODE)) {
        throw new Error("MCP_FIREBASE_MODE must be either emulator or production");
    }
    if (enabled && env.NODE_ENV === "production") {
        throw new Error("MCP local diagnostics cannot run with NODE_ENV=production");
    }
    if (
        enabled && firebaseMode === "emulator"
        && (!env.FIRESTORE_EMULATOR_HOST || !env.FIREBASE_AUTH_EMULATOR_HOST)
    ) {
        throw new Error(
            "Emulator MCP diagnostics require FIRESTORE_EMULATOR_HOST and FIREBASE_AUTH_EMULATOR_HOST",
        );
    }
    if (firebaseMode === "production") {
        if (!enabled || env.MCP_PRODUCTION_FIREBASE_CONFIRM !== PRODUCTION_FIREBASE_CONFIRMATION) {
            throw new Error(
                "Production Firebase MCP diagnostics require MCP_LOCAL_DIAGNOSTICS=true and the explicit confirmation",
            );
        }
        const emulatorVariables = [
            "USE_FIREBASE_EMULATOR",
            "FIREBASE_EMULATOR_HOST",
            "FIRESTORE_EMULATOR_HOST",
            "FIREBASE_AUTH_EMULATOR_HOST",
        ];
        if (emulatorVariables.some(name => env[name])) {
            throw new Error("Production Firebase MCP diagnostics cannot be combined with Firebase emulator variables");
        }
    }
    return { enabled, firebaseMode };
}
