import { SvelteMap } from "svelte/reactivity";

export class CustomKeySvelteMap<T, V> {
    // Internally holds a Map with string keys
    private map = new SvelteMap<string, V>();
    // Array to hold original keys
    private keys: T[] = [];
    // Mapping between serialized keys and original keys
    // eslint-disable-next-line svelte/prefer-svelte-reactivity -- Internal bookkeeping map, not reactive state
    private keyMap = new Map<string, T>();

    // Helper function to convert key to string using JSON.stringify
    private serialize(key: T): string {
        return JSON.stringify(key);
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

    // Method to get a value by key
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
