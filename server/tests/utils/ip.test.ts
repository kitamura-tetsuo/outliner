import { IncomingMessage } from "http";
import { getClientIp } from "../../src/utils/ip.js";

describe("getClientIp", () => {
    const createReq = (headers: Record<string, string | string[]>, remoteAddress?: string) => {
        return {
            headers,
            socket: { remoteAddress: remoteAddress || "1.2.3.4" },
        } as unknown as IncomingMessage;
    };

    describe("when TRUST_PROXY_HEADERS is false", () => {
        it("should always return socket remote address even if headers are present", () => {
            const req = createReq({
                "x-forwarded-for": "9.9.9.9",
                "cf-connecting-ip": "8.8.8.8",
            }, "1.1.1.1");
            const ip = getClientIp(req, { TRUST_PROXY_HEADERS: false, TRUSTED_PROXY_HOPS: 1 });
            expect(ip).toBe("1.1.1.1");
        });
    });

    describe("when TRUST_PROXY_HEADERS is true", () => {
        it("should prioritize platform headers over X-Forwarded-For", () => {
            const req = createReq({
                "x-forwarded-for": "9.9.9.9",
                "cf-connecting-ip": "8.8.8.8",
            });
            const ip = getClientIp(req, { TRUST_PROXY_HEADERS: true, TRUSTED_PROXY_HOPS: 1 });
            expect(ip).toBe("8.8.8.8");
        });

        describe("X-Forwarded-For handling", () => {
            it("should return the rightmost entry for TRUSTED_PROXY_HOPS = 1", () => {
                const req = createReq({ "x-forwarded-for": "10.0.0.1, 192.168.0.1, 8.8.8.8" });
                const ip = getClientIp(req, { TRUST_PROXY_HEADERS: true, TRUSTED_PROXY_HOPS: 1 });
                expect(ip).toBe("8.8.8.8");
            });

            it("should return the correct entry for TRUSTED_PROXY_HOPS > 1", () => {
                const req = createReq({ "x-forwarded-for": "10.0.0.1, 192.168.0.1, 8.8.8.8" });
                const ip = getClientIp(req, { TRUST_PROXY_HEADERS: true, TRUSTED_PROXY_HOPS: 2 });
                expect(ip).toBe("192.168.0.1");
            });

            it("should fallback to leftmost entry if TRUSTED_PROXY_HOPS is larger than parts length", () => {
                const req = createReq({ "x-forwarded-for": "10.0.0.1, 192.168.0.1" });
                const ip = getClientIp(req, { TRUST_PROXY_HEADERS: true, TRUSTED_PROXY_HOPS: 5 });
                expect(ip).toBe("10.0.0.1");
            });
        });
    });
});
