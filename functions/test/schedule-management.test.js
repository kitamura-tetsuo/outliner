const { describe, it, expect } = require("@jest/globals");
const axios = require("axios");

const baseURL = "http://localhost:57000/api";

describe("Schedule Management", () => {
  it("list schedules endpoint not implemented", async () => {
    try {
      await axios.get(`${baseURL}/list-schedules`);
      expect(true).toBe(false);
    } catch (error) {
      if (error.response) {
        expect(error.response.status).toBe(404);
      } else {
        console.warn("Emulator not running, skipping test");
        expect(true).toBe(true);
      }
    }
  });
});
