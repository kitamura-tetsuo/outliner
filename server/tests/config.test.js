const { expect } = require("chai");
require("ts-node/register");
const { loadConfig } = require("../src/config");

describe("config", () => {
    it("parses defaults", () => {
        const cfg = loadConfig({});
        expect(cfg.PORT).to.equal(3000);
        expect(cfg.LOG_LEVEL).to.equal("info");
        expect(cfg.ROOM_PREFIX_ENFORCE).to.be.false;
    });
    it("uses YJS_DATA_DIR for LEVELDB_PATH", () => {
        const cfg = loadConfig({ YJS_DATA_DIR: "/data" });
        expect(cfg.LEVELDB_PATH).to.equal("/data");
    });
});
