export class CustomKeyMap<T, V> {
    // 内部では文字列をキーとする Map を保持
    private map = new Map<string, V>();

    // キーを JSON.stringify して文字列に変換するヘルパー関数
    private serialize(key: T): string {
        return JSON.stringify(key);
    }

    // 値を設定するメソッド
    set(key: T, value: V): this {
        this.map.set(this.serialize(key), value);
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
        return this.map.delete(this.serialize(key));
    }

    // 全ての要素をクリアするメソッド
    clear(): void {
        this.map.clear();
    }

    // 内部の Map のサイズを返すゲッター
    get size(): number {
        return this.map.size;
    }
}
