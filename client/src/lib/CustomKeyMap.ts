export class CustomKeyMap<T, V> {
    // Internal map using string keys
    protected map = new Map<string, V>();
    // Array to hold original keys
    protected keys: T[] = [];
    // Mapping between serialized keys and original keys
    protected keyMap = new Map<string, T>();
    // Custom key function
    protected keyFn: (key: T) => string;

    constructor(keyFn: (key: T) => string = (k) => JSON.stringify(k)) {
        this.keyFn = keyFn;
    }

    // Helper function to convert key to string
    protected serialize(key: T): string {
        return this.keyFn(key);
    }

    // Method to set a value
    set(key: T, value: V): this {
        const serializedKey = this.serialize(key);
        this.map.set(serializedKey, value);

        // Save original key
        if (!this.keyMap.has(serializedKey)) {
            this.keys.push(key);
            this.keyMap.set(serializedKey, key);
        }

        return this;
    }

    // Method to get value corresponding to a key
    get(key: T): V | undefined {
        return this.map.get(this.serialize(key));
    }

    // Method to check if a specified key exists
    has(key: T): boolean {
        return this.map.has(this.serialize(key));
    }

    // Method to delete a specified key
    delete(key: T): boolean {
        const serializedKey = this.serialize(key);
        const result = this.map.delete(serializedKey);

        // Delete original key as well
        if (result) {
            const index = this.keys.findIndex(k => this.serialize(k) === serializedKey);
            if (index !== -1) {
                this.keys.splice(index, 1);
            }
            this.keyMap.delete(serializedKey);
        }

        return result;
    }

    // Method to clear all elements
    clear(): void {
        this.map.clear();
        this.keys = [];
        this.keyMap.clear();
    }

    // Getter to return the size of the internal Map
    get size(): number {
        return this.map.size;
    }

    // Method to get a key by index
    getKeyAtIndex(index: number): T | undefined {
        return this.keys[index];
    }

    // Method to get all keys as an array
    getAllKeys(): T[] {
        return [...this.keys];
    }

    // Method to get all values as an array
    getAllValues(): V[] {
        return Array.from(this.map.values());
    }

    // Method to get key-value pairs as an array
    getEntries(): [T, V][] {
        return this.keys.map(key => [key, this.get(key)!] as [T, V]);
    }
}

/**
 * A reactive version of CustomKeyMap for use in Svelte components.
 * Note: Real implementation would use Svelte 5 $state, but for now we provide a stub for tests.
 */
export class CustomKeySvelteMap<T, V> extends CustomKeyMap<T, V> {
    constructor(keyFn: (key: T) => string = (k) => JSON.stringify(k)) {
        super(keyFn);
    }
}
