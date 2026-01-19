import assert from "assert";
import fs from "fs";
import { describe, it } from "mocha";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe("cloudflared config", () => {
    it("contains tunnel id and ingress", () => {
        const file = fs.readFileSync(path.resolve(__dirname, "../..", "cloudflared", "config.yml"), "utf8");
        assert.match(file, /tunnel:/);
        assert.match(file, /ingress:/);
    });
});
