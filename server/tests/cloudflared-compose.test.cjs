const fs = require("fs");
const path = require("path");
const assert = require("assert");

describe("docker compose config", () => {
    it("includes cloudflared service", () => {
        const compose = fs.readFileSync(path.resolve(__dirname, "..", "..", "docker-compose.yml"), "utf8");
        assert.match(compose, /cloudflared:/);
        assert.match(compose, /tunnel --no-autoupdate/);
    });
});
