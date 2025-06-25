/** @feature LOG-0001
 *  Title   : Development log service
 *  Source  : docs/client-features/log-development-log-service-8f761bd4.yaml
 */
import { expect, test } from "@playwright/test";
import jwt from "jsonwebtoken";

test.describe("LOG-0001: log service health", () => {
  test("/health endpoint returns OK", async ({ request }) => {
    const response = await request.get("http://localhost:7091/health");
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.status).toBe("OK");
    expect(typeof body.timestamp).toBe("string");
  });

  test("POST to /health returns 404", async ({ request }) => {
    const res = await request.post("http://localhost:7091/health");
    expect(res.status()).toBe(404);
  });

  test("/debug/token-info decodes JWT", async ({ request }) => {
    const token = jwt.sign({ uid: "test-user" }, "secret");
    const res = await request.get(
      `http://localhost:7091/debug/token-info?token=${token}`
    );
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.payload.uid).toBe("test-user");
  });
});
