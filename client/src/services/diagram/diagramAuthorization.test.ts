import { describe, expect, it } from "vitest";
import { canMutateDiagrams, canReadDiagrams, type DiagramAuthorization } from "./diagramAuthorization";

function auth(overrides: Partial<DiagramAuthorization["capabilities"]> & { surfaceWritable?: boolean; } = {}) {
    return {
        capabilities: { canRead: true, canWrite: true, ...overrides },
        surfaceWritable: overrides.surfaceWritable ?? true,
    };
}

describe("diagramAuthorization (#5310, REQ-008)", () => {
    it("permits reads with read capability alone, independent of write", () => {
        expect(canReadDiagrams(auth({ canRead: true, canWrite: false }))).toBe(true);
        expect(canReadDiagrams(auth({ canRead: true, canWrite: false, surfaceWritable: false }))).toBe(true);
    });

    it("denies reads without read capability, even when write is granted", () => {
        expect(canReadDiagrams(auth({ canRead: false, canWrite: true }))).toBe(false);
    });

    it("requires read, write and a writable surface together for mutation", () => {
        expect(canMutateDiagrams(auth({ canRead: true, canWrite: true, surfaceWritable: true }))).toBe(true);
    });

    it("denies mutation when read is withheld, even if write is granted", () => {
        expect(canMutateDiagrams(auth({ canRead: false, canWrite: true }))).toBe(false);
    });

    it("denies mutation when write is withheld, even though read is granted (read-granted/write-withheld)", () => {
        expect(canMutateDiagrams(auth({ canRead: true, canWrite: false }))).toBe(false);
    });

    it("denies mutation on a read-only presentation, even with full project capability", () => {
        expect(canMutateDiagrams(auth({ canRead: true, canWrite: true, surfaceWritable: false }))).toBe(false);
    });
});
