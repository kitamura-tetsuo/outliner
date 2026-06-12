import { describe, expect, it, vi, beforeEach } from "vitest";
import { SyncWorker, type SqlJsDatabase } from "../services/syncWorker";

describe("SyncWorker", () => {
    let mockStmt: { run: ReturnType<typeof vi.fn>; free: ReturnType<typeof vi.fn> };
    let mockDb: { prepare: ReturnType<typeof vi.fn> };

    beforeEach(() => {
        mockStmt = {
            run: vi.fn(),
            free: vi.fn(),
        };
        mockDb = {
            prepare: vi.fn().mockReturnValue(mockStmt),
        };
    });

    it("applies op to sqlite", () => {
        const worker = new SyncWorker(mockDb as unknown as SqlJsDatabase);
        worker.applyOp({ table: "tbl", pk: "a", column: "val", value: 2 });
        expect(mockDb.prepare).toHaveBeenCalledWith("UPDATE tbl SET val=? WHERE id=?");
        expect(mockStmt.run).toHaveBeenCalledWith([2, "a"]);
        expect(mockStmt.free).toHaveBeenCalled();
    });

    it("emits applied event", () => {
        const worker = new SyncWorker(mockDb as unknown as SqlJsDatabase);
        const listener = vi.fn();
        worker.on("applied", listener);
        const op = { table: "tbl", pk: "a", column: "val", value: 2 };
        worker.applyOp(op);
        expect(listener).toHaveBeenCalledWith(op);
    });
});
