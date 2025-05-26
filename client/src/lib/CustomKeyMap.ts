export class CustomKeyMap<T, V> {
    // 内部では文字列をキーとする Map を保持
    private map = new Map<string, V>();
    // オリジナルのキーを保持する配列
    private keys: T[] = [];
    // シリアライズされたキーとオリジナルキーのマッピング
    private keyMap = new Map<string, T>();

    // キーを JSON.stringify して文字列に変換するヘルパー関数
    private serialize(key: T): string {
        return JSON.stringify(key);
    }

    // 値を設定するメソッド
    set(key: T, value: V): this {
        const serializedKey = this.serialize(key);
        this.map.set(serializedKey, value);

        // オリジナルのキーを保存
        if (!this.keyMap.has(serializedKey)) {
            this.keys.push(key);
            this.keyMap.set(serializedKey, key);
        }

        return this;
    }

    // キーに対応する値を取得するメソッド
    get(key: T): V | undefined {
        return this.map.get(this.serialize(key));
    }

    // 指定したキーが存在するかチェックするメソッド
    has(key: T): boolean {
        return this.map.has(this.serialize(key));
    }

    // 指定したキーを削除するメソッド
    delete(key: T): boolean {
        const serializedKey = this.serialize(key);
        const result = this.map.delete(serializedKey);

        // オリジナルのキーも削除
        if (result) {
            const index = this.keys.findIndex(k => this.serialize(k) === serializedKey);
            if (index !== -1) {
                this.keys.splice(index, 1);
            }
            this.keyMap.delete(serializedKey);
        }

        return result;
    }

    // 全ての要素をクリアするメソッド
    clear(): void {
        this.map.clear();
        this.keys = [];
        this.keyMap.clear();
    }

    // 内部の Map のサイズを返すゲッター
    get size(): number {
        return this.map.size;
    }

    // インデックスでキーを取得するメソッド
    getKeyAtIndex(index: number): T | undefined {
        return this.keys[index];
    }

    // 全てのキーを配列として取得するメソッド
    getAllKeys(): T[] {
        return [...this.keys];
    }

    // 全ての値を配列として取得するメソッド
    getAllValues(): V[] {
        return Array.from(this.map.values());
    }

    // キーと値のペアを配列として取得するメソッド
    getEntries(): [T, V][] {
        return this.keys.map(key => [key, this.get(key)!] as [T, V]);
    }
}
