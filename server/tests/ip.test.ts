import { jest } from "@jest/globals";
import { getClientIp } from "../src/utils/ip.js";

describe("getClientIp", () => {
    // Helper to create mock request
    const createReq = (headers: Record<string, string | string[] | undefined>, remoteAddress?: string) => {
        return {
            headers,
            socket: { remoteAddress }
        } as any;
    };

    it("should return Cloudflare IP if cf-connecting-ip is present", () => {
        const req = createReq({
            "cf-connecting-ip": "1.1.1.1",
            "x-forwarded-for": "2.2.2.2"
        });
        expect(getClientIp(req)).toBe("1.1.1.1");
    });

    it("should return Fly.io IP if fly-client-ip is present", () => {
        const req = createReq({
            "fly-client-ip": "3.3.3.3",
            "x-forwarded-for": "2.2.2.2"
        });
        expect(getClientIp(req)).toBe("3.3.3.3");
    });

    it("should return Fastly IP if fastly-client-ip is present", () => {
        const req = createReq({
            "fastly-client-ip": "4.4.4.4",
            "x-forwarded-for": "2.2.2.2"
        });
        expect(getClientIp(req)).toBe("4.4.4.4");
    });

    it("should prioritize Cloudflare over Fly.io", () => {
        const req = createReq({
            "cf-connecting-ip": "1.1.1.1",
            "fly-client-ip": "3.3.3.3"
        });
        expect(getClientIp(req)).toBe("1.1.1.1");
    });

    it("should fallback to X-Forwarded-For (first IP) if no platform headers", () => {
        const req = createReq({
            "x-forwarded-for": "10.0.0.1, 10.0.0.2"
        });
        expect(getClientIp(req)).toBe("10.0.0.1");
    });

    it("should handle X-Forwarded-For as array", () => {
        const req = createReq({
            "x-forwarded-for": ["10.0.0.1", "10.0.0.2"]
        });
        expect(getClientIp(req)).toBe("10.0.0.1");
    });

    it("should fallback to remoteAddress if no headers", () => {
        const req = createReq({}, "127.0.0.1");
        expect(getClientIp(req)).toBe("127.0.0.1");
    });

    it("should return empty string if nothing available", () => {
        const req = createReq({});
        expect(getClientIp(req)).toBe("");
    });
});
