import { expect } from "chai";
import { describe, it } from "mocha";

describe("Simple Test", function() {
    it("should pass", function() {
        expect(1 + 1).to.equal(2);
    });
});
