import { expect } from "chai";
import { validateScheduleRowIdentities } from "../src/scheduler/row-validation.js";

describe("Schedule result row identity validation", () => {
    it("rejects identities the Yjs scheduler writer cannot persist", () => {
        expect(validateScheduleRowIdentities([{ id: "" }])).to.include({
            code: "invalid_row_id",
            rowIndex: 0,
        });
        expect(validateScheduleRowIdentities([{ id: 0 }])).to.include({
            code: "invalid_row_id",
            rowIndex: 0,
        });
    });

    it("accepts identities that the scheduler persists as record keys", () => {
        expect(validateScheduleRowIdentities([{ id: "task-1" }, { id: 1 }])).to.equal(undefined);
    });
});
