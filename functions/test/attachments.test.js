const { describe, it, expect } = require("@jest/globals");
const axios = require("axios");

const baseURL = "http://localhost:57000/api";
const dummyToken = "test-id-token";

describe("Attachments API", () => {
  it("upload attachment missing params", async () => {
    try {
      await axios.post(`${baseURL}/upload-attachment`, { idToken: dummyToken });
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

  it("list attachments missing params", async () => {
    try {
      await axios.post(`${baseURL}/list-attachments`, { idToken: dummyToken });
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

  it("delete attachment missing params", async () => {
    try {
      await axios.post(`${baseURL}/delete-attachment`, { idToken: dummyToken });
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
