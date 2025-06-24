/** @feature ENV-0004
 *  Title   : Consolidate Firebase emulator host variable
 *  Source  : docs/dev-features.yaml
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { expect, test } from "vitest";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "../..");

const clientEnv = path.join(repoRoot, "client", ".env.example");
const serverEnv = path.join(repoRoot, "server", ".env.example");

test("emulator host variables are consolidated", () => {
    const clientContent = fs.readFileSync(clientEnv, "utf-8");
    expect(clientContent.includes("VITE_FIREBASE_EMULATOR_HOST")).toBe(true);
    expect(clientContent.includes("VITE_AUTH_EMULATOR_HOST")).toBe(false);
    expect(clientContent.includes("VITE_FIRESTORE_EMULATOR_HOST")).toBe(false);

    const serverContent = fs.readFileSync(serverEnv, "utf-8");
    expect(serverContent.includes("FIREBASE_EMULATOR_HOST")).toBe(true);
    expect(serverContent.includes("FIRESTORE_EMULATOR_HOST")).toBe(false);
    expect(serverContent.includes("FIREBASE_AUTH_EMULATOR_HOST")).toBe(false);
});
