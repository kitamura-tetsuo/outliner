import { describe, it, expect, beforeEach } from "vitest";
import { AsyncLock, AsyncLockManager } from "./lock";

describe("AsyncLock", () => {
    let lock: AsyncLock;

    beforeEach(() => {
        lock = new AsyncLock();
    });

    it("should acquire lock when free", async () => {
        const release = await lock.acquire();
        expect(typeof release).toBe("function");
        expect(lock.isLocked()).toBe(true);
        release();
        expect(lock.isLocked()).toBe(false);
    });

    it("should wait for lock to be released", async () => {
        const order: number[] = [];

        const release1 = await lock.acquire();
        order.push(1);

        const p2 = lock.acquire().then((release: () => void) => {
            order.push(2);
            release();
        });

        expect(order).toEqual([1]);
        expect(lock.isLocked()).toBe(true);

        release1();
        await p2;

        expect(order).toEqual([1, 2]);
        expect(lock.isLocked()).toBe(false);
    });

    it("should handle multiple waiting requests in order", async () => {
        const order: number[] = [];

        const release1 = await lock.acquire();

        const p2 = lock.acquire().then((release: () => void) => { order.push(2); release(); });
        const p3 = lock.acquire().then((release: () => void) => { order.push(3); release(); });

        release1();
        await Promise.all([p2, p3]);

        expect(order).toEqual([2, 3]);
    });
});

describe("AsyncLockManager", () => {
    let manager: AsyncLockManager;

    beforeEach(() => {
        manager = new AsyncLockManager();
    });

    it("should provide same lock for same key", async () => {
        const release1 = await manager.acquire("key1");

        let acquired2 = false;
        const p2 = manager.acquire("key1").then((release: () => void) => {
            acquired2 = true;
            release();
        });

        expect(acquired2).toBe(false);
        release1();
        await p2;
        expect(acquired2).toBe(true);
    });

    it("should provide different locks for different keys", async () => {
        const release1 = await manager.acquire("key1");
        const release2 = await manager.acquire("key2");

        expect(release1).toBeDefined();
        expect(release2).toBeDefined();

        release1();
        release2();
    });

    it("should run exclusive using manager", async () => {
        let val = 0;
        await manager.runExclusive("key1", async () => {
            val = 1;
        });
        expect(val).toBe(1);
    });

    it("should get lock instance", () => {
        const lock1 = manager.getLock("key1");
        expect(lock1).toBeInstanceOf(AsyncLock);
        const lock2 = manager.getLock("key1");
        expect(lock1).toBe(lock2);
    });
});
