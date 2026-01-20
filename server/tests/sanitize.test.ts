import { expect } from "chai";
import { describe, it } from "mocha";
import { sanitizeUrl } from "../src/utils/sanitize.js";

describe("sanitizeUrl", () => {
    it("should return empty string for undefined", () => {
        expect(sanitizeUrl(undefined)).to.equal("");
    });

    it("should return unchanged url if no sensitive params", () => {
        expect(sanitizeUrl("/foo/bar?baz=qux")).to.equal("/foo/bar?baz=qux");
    });

    it("should redact auth param", () => {
        const result = sanitizeUrl("/foo?auth=secret");
        expect(result).to.match(/^\/foo\?auth=%5BREDACTED%5D$/);
    });

    it("should redact token param", () => {
        const result = sanitizeUrl("/foo?token=secret");
        expect(result).to.match(/^\/foo\?token=%5BREDACTED%5D$/);
    });

    it("should redact key param", () => {
        const result = sanitizeUrl("/foo?key=secret");
        expect(result).to.match(/^\/foo\?key=%5BREDACTED%5D$/);
    });

    it("should redact multiple sensitive params", () => {
        const result = sanitizeUrl("/foo?auth=1&token=2&key=3&safe=4");
        expect(result).to.contain("auth=%5BREDACTED%5D");
        expect(result).to.contain("token=%5BREDACTED%5D");
        expect(result).to.contain("key=%5BREDACTED%5D");
        expect(result).to.contain("safe=4");
    });

    it("should handle mixed sensitive and safe params", () => {
        const result = sanitizeUrl("/foo?a=1&auth=secret&b=2");
        expect(result).to.contain("auth=%5BREDACTED%5D");
        expect(result).to.contain("a=1");
        expect(result).to.contain("b=2");
    });
});
