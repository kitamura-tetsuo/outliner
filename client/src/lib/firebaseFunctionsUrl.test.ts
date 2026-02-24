import { describe, it, expect } from "vitest";
import { getFirebaseFunctionUrl } from "./firebaseFunctionsUrl";

describe("firebaseFunctionsUrl", () => {
    it("should return a URL", () => {
        const url = getFirebaseFunctionUrl("testFunc");
        expect(url).toContain("testFunc");
    });

    it("should correctly join parts", () => {
        const url = getFirebaseFunctionUrl("myFunc");
        // In test env it returns specific IP and port
        expect(url).toContain("127.0.0.1:57070");
    });
});
