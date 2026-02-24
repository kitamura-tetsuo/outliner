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

// // Example usage
// class MyService {
//     lockManager: AsyncLockManager;
//     constructor() {
//         this.lockManager = new AsyncLockManager();
//     }

//     async methodA() {
//         return this.lockManager.runExclusive('methodA', async () => {
//             console.log('methodA start');
//             await new Promise(r => setTimeout(r, 1000));
//             console.log('methodA end');
//         });
//     }

//     async methodB() {
//         return this.lockManager.runExclusive('methodB', async () => {
//             console.log('methodB start');
//             await new Promise(r => setTimeout(r, 500));
//             console.log('methodB end');
//         });
//     }

//     // Can also lock with arbitrary keys
//     async runWithCustomLock(key: string, fn: { (): Promise<void>; (): Promise<void>; }) {
//         return this.lockManager.runExclusive(key, fn);
//     }
// }

// // Test execution
// (async () => {
//     const service = new MyService();

//     // methodA is exclusively controlled
//     service.methodA();
//     service.methodA();

//     // methodB uses a different lock so it can run concurrently
//     service.methodB();

//     // Locking with an arbitrary key
//     service.runWithCustomLock('custom', async () => {
//         console.log('custom lock start');
//         await new Promise(r => setTimeout(r, 700));
//         console.log('custom lock end');
//     });
//     service.runWithCustomLock('custom', async () => {
//         console.log('custom lock 2 start');
//         await new Promise(r => setTimeout(r, 700));
//         console.log('custom lock 2 end');
//     });
// })();
