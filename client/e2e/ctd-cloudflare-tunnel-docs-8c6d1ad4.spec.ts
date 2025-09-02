import { expect, test } from "@playwright/test";
import fs from "fs";
import path from "path";

test("Cloudflare Tunnel docs mention setup steps", async () => {
    const readme = fs.readFileSync(path.resolve("server", "README.md"), "utf8");
    expect(readme).toContain("Cloudflare Tunnel Setup");
    expect(readme).toContain("cloudflared tunnel create");
});
