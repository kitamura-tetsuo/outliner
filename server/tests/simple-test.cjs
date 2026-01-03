const { describe, it } = require("mocha");
const { expect } = require("chai");

describe("Simple Test", function() {
    it("should pass", function() {
        expect(1 + 1).to.equal(2);
    });
});
