class AsyncLock {
    private _queue: (() => void)[];
    private _locked: boolean;
    constructor() {
        this._queue = [];
        this._locked = false;
    }

    async acquire(): Promise<void> {
        if (!this._locked) {
            this._locked = true;
            return;
        }
        return new Promise<void>(resolve => this._queue.push(resolve));
    }

    release() {
        if (this._queue.length > 0) {
            // shift() never returns undefined here because length > 0
            const resolve = this._queue.shift()!;
            resolve();
        } else {
            this._locked = false;
        }
    }

    async runExclusive<T>(callback: () => Promise<T> | T) {
        await this.acquire();
        try {
            return await callback();
        } finally {
            this.release();
        }
    }
}

export class AsyncLockManager {
    locks: Map<unknown, AsyncLock>;
    constructor() {
        this.locks = new Map<unknown, AsyncLock>();
    }

    getLock<T = unknown>(key: T) {
        if (!this.locks.has(key as unknown)) {
            this.locks.set(key as unknown, new AsyncLock());
        }
        return this.locks.get(key as unknown);
    }

    async runExclusive<T, R>(key: T, callback: () => Promise<R> | R) {
        const lock = this.getLock(key);
        if (!lock) {
            throw new Error(`Lock not initialized for key: ${String(key)}`);
        }
        return lock.runExclusive(callback);
    }
}
