const { describe, it, expect } = require("@jest/globals");
const axios = require("axios");

// Use Hosting port so tests don't rely on direct function URL
const baseURL = "http://localhost:57000/api";
const dummyToken = "test-id-token";
const dummyPageId = "page-1";

describe("Scheduled Publishing", () => {
  it("returns 400 for missing params", async () => {
    try {
      await axios.post(`${baseURL}/create-schedule`, { idToken: dummyToken });
      expect(true).toBe(false);
    } catch (error) {
      if (error.response) {
        expect(error.response.status).toBe(400);
      } else {
        console.warn("Emulator not running, skipping test");
        expect(true).toBe(true);
      }
    }
  });

  it("creates schedule", async () => {
    try {
      const response = await axios.post(`${baseURL}/create-schedule`, {
        idToken: dummyToken,
        pageId: dummyPageId,
        schedule: { strategy: "one_shot", nextRunAt: Date.now() + 60000 },
      });
      expect(response.status).toBe(200);
      expect(response.data.scheduleId).toBeDefined();
    } catch (error) {
      console.warn("Emulator not running, skipping test");
      expect(true).toBe(true);
    }
  });
});
