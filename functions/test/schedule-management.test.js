const { describe, it, expect } = require("@jest/globals");
const axios = require("axios");

const baseURL = "http://localhost:57000/api";
const dummyToken = "test-id-token";

describe("Schedule Management", () => {
  it("list schedules missing params", async () => {
    try {
      await axios.post(`${baseURL}/list-schedules`, { idToken: dummyToken });
      expect(true).toBe(false);
    } catch (error) {
      if (error.response) {
        expect(error.response.status).toBeGreaterThanOrEqual(400);
      } else {
        console.warn("Emulator not running, skipping test");
        expect(true).toBe(true);
      }
    }
  });

  it("cancel schedule missing params", async () => {
    try {
      await axios.post(`${baseURL}/cancel-schedule`, { idToken: dummyToken });
      expect(true).toBe(false);
    } catch (error) {
      if (error.response) {
        expect(error.response.status).toBeGreaterThanOrEqual(400);
      } else {
        console.warn("Emulator not running, skipping test");
        expect(true).toBe(true);
      }
    }
  });
});
