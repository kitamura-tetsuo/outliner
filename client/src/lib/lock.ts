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
        }
        else {
            this._locked = false;
        }
    }

    async runExclusive(callback: () => any) {
        await this.acquire();
        try {
            return await callback();
        }
        finally {
            this.release();
        }
    }
}

export class AsyncLockManager {
    locks: Map<any, any>;
    constructor() {
        this.locks = new Map();
    }

    getLock(key: any) {
        if (!this.locks.has(key)) {
            this.locks.set(key, new AsyncLock());
        }
        return this.locks.get(key);
    }

    async runExclusive(key: any, callback: any) {
        const lock = this.getLock(key);
        return lock.runExclusive(callback);
    }
}

// // 使い方の例
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

//     // 任意キーでもロック可能
//     async runWithCustomLock(key: string, fn: { (): Promise<void>; (): Promise<void>; }) {
//         return this.lockManager.runExclusive(key, fn);
//     }
// }

// // 動作テスト
// (async () => {
//     const service = new MyService();

//     // methodA は排他制御される
//     service.methodA();
//     service.methodA();

//     // methodB は別ロックなので同時実行可能
//     service.methodB();

//     // 任意のキーでのロック
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
