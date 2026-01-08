const fs = require("fs");
const path = require("path");
const assert = require("assert");

describe("cloudflared config", () => {
    it("contains tunnel id and ingress", () => {
        const file = fs.readFileSync(path.resolve(__dirname, "../..", "cloudflared", "config.yml"), "utf8");
        assert.match(file, /tunnel:/);
        assert.match(file, /ingress:/);
    });
});
