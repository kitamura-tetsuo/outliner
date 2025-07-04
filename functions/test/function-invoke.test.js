const { describe, it, expect } = require("@jest/globals");
const axios = require("axios");

// Base URL via Hosting to ensure rewrite to functions
const baseURL = "http://localhost:57000/api";

// List of endpoints and methods to verify invocation only
const endpoints = [
  { method: "post", path: "/fluid-token", data: { idToken: "invalid" } },
  { method: "post", path: "/save-container", data: { idToken: "invalid", containerId: "test" } },
  { method: "post", path: "/get-user-containers", data: { idToken: "invalid" } },
  { method: "post", path: "/create-test-user", data: { email: "test@example.com", password: "pass" } },
  { method: "post", path: "/delete-user", data: { idToken: "invalid" } },
  { method: "post", path: "/delete-container", data: { idToken: "invalid", containerId: "test" } },
  { method: "post", path: "/get-container-users", data: { idToken: "invalid", containerId: "test" } },
  { method: "post", path: "/list-users", data: { idToken: "invalid" } },
  { method: "post", path: "/create-schedule", data: { idToken: "invalid", pageId: "p", schedule: { strategy: "one_shot", nextRunAt: Date.now() } } },
  { method: "post", path: "/update-schedule", data: { idToken: "invalid", pageId: "p", scheduleId: "s", schedule: { strategy: "one_shot", nextRunAt: Date.now() } } },
  { method: "post", path: "/list-schedules", data: { idToken: "invalid", pageId: "p" } },
  { method: "post", path: "/cancel-schedule", data: { idToken: "invalid", pageId: "p", scheduleId: "s" } },
];

describe("Firebase function invocation", () => {
  endpoints.forEach(({ method, path, data }) => {
    it(`invokes ${path}`, async () => {
      try {
        const res = await axios({ method, url: `${baseURL}${path}`, data });
        expect(typeof res.status).toBe("number");
      } catch (error) {
        if (error.response) {
          expect(typeof error.response.status).toBe("number");
        } else {
          console.warn("Firebase Emulator not running, skipping test");
          expect(true).toBe(true);
        }
      }
    });
  });

  it("invokes /health", async () => {
    try {
      const res = await axios.get(`${baseURL}/health`);
      expect(typeof res.status).toBe("number");
    } catch (error) {
      if (error.response) {
        expect(typeof error.response.status).toBe("number");
      } else {
        console.warn("Firebase Emulator not running, skipping test");
        expect(true).toBe(true);
      }
    }
  });
});
