import assert from "assert";
import fs from "fs";
import { describe, it } from "mocha";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe("docker compose config", () => {
    it("includes cloudflared service", () => {
        const compose = fs.readFileSync(path.resolve(__dirname, "..", "..", "docker-compose.yml"), "utf8");
        assert.match(compose, /cloudflared:/);
        assert.match(compose, /tunnel --no-autoupdate/);
    });
});
