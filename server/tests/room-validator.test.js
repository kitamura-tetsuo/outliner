const { expect } = require("chai");
require("ts-node/register");
const { parseRoom } = require("../src/room-validator");

describe("room validator", () => {
    it("accepts project room", () => {
        expect(parseRoom("/projects/alpha"))
            .to.deep.equal({ project: "alpha" });
    });

    it("accepts page room", () => {
        expect(parseRoom("/projects/alpha/pages/beta"))
            .to.deep.equal({ project: "alpha", page: "beta" });
    });

    it("rejects invalid path", () => {
        expect(parseRoom("/invalid")).to.be.undefined;
    });

    it("rejects bad chars", () => {
        expect(parseRoom("/projects/invalid!"))
            .to.be.undefined;
    });
});
