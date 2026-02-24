export class AsyncLock {
    private _queue: (() => void)[];
    private _locked: boolean;
    constructor() {
        this._queue = [];
        this._locked = false;
    }

    isLocked(): boolean {
        return this._locked;
    }

    async acquire(): Promise<() => void> {
        if (!this._locked) {
            this._locked = true;
            return () => this.release();
        }
        return new Promise<() => void>(resolve =>
            this._queue.push(() => {
                resolve(() => this.release());
            })
        );
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
        const release = await this.acquire();
        try {
            return await callback();
        } finally {
            release();
        }
    }
}

export class AsyncLockManager {
    locks: Map<unknown, AsyncLock>;
    constructor() {
        this.locks = new Map<unknown, AsyncLock>();
    }

    getLock<T = unknown>(key: T): AsyncLock {
        let lock = this.locks.get(key as unknown);
        if (!lock) {
            lock = new AsyncLock();
            this.locks.set(key as unknown, lock);
        }
        return lock;
    }

    async acquire<T = unknown>(key: T): Promise<() => void> {
        return this.getLock(key).acquire();
    }

    async runExclusive<T, R>(key: T, callback: () => Promise<R> | R) {
        const lock = this.getLock(key);
        return lock.runExclusive(callback);
    }
}
