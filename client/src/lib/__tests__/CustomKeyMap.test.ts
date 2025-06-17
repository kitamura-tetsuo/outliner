// client/src/lib/__tests__/CustomKeyMap.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import * as CustomKeyMapModule from '../CustomKeyMap';

describe('CustomKeyMap', () => {
    let customMap: CustomKeyMapModule.CustomKeyMap<any, any>;

    beforeEach(() => {
        customMap = new CustomKeyMapModule.CustomKeyMap();
    });

    it('should set and get values with string keys', () => {
        customMap.set('key1', 'value1');
        expect(customMap.get('key1')).toBe('value1');
        expect(customMap.size).toBe(1);
    });

    it('should set and get values with number keys', () => {
        customMap.set(123, 'value123');
        expect(customMap.get(123)).toBe('value123');
    });

    it('should set and get values with object keys', () => {
        const keyObj1 = { id: 1, name: 'test' };
        const keyObj2 = { id: 2, name: 'another' };
        customMap.set(keyObj1, 'objectValue1');
        customMap.set(keyObj2, 'objectValue2');

        expect(customMap.get(keyObj1)).toBe('objectValue1');
        expect(customMap.get({ id: 1, name: 'test' })).toBe('objectValue1'); // Relies on JSON.stringify
        expect(customMap.get(keyObj2)).toBe('objectValue2');
        expect(customMap.size).toBe(2);
    });

    it('should overwrite value if setting with an existing key', () => {
        const keyObj = { id: 1 };
        customMap.set(keyObj, 'initialValue');
        customMap.set(keyObj, 'newValue');
        expect(customMap.get(keyObj)).toBe('newValue');
        expect(customMap.size).toBe(1);
    });

    it('should check for key existence with has()', () => {
        customMap.set('key1', 'value1');
        const objKey = { a: 1 };
        customMap.set(objKey, 'objValue');

        expect(customMap.has('key1')).toBe(true);
        expect(customMap.has('nonExistentKey')).toBe(false);
        expect(customMap.has(objKey)).toBe(true);
        expect(customMap.has({ a: 1 })).toBe(true);
        expect(customMap.has({ b: 2 })).toBe(false);
    });

    it('should delete keys and update size', () => {
        customMap.set('key1', 'value1');
        customMap.set('key2', 'value2');
        const objKey = { id: 'obj' };
        customMap.set(objKey, 'objValue');

        expect(customMap.delete('key1')).toBe(true);
        expect(customMap.has('key1')).toBe(false);
        expect(customMap.size).toBe(2);

        expect(customMap.delete(objKey)).toBe(true);
        expect(customMap.has(objKey)).toBe(false);
        expect(customMap.size).toBe(1);

        expect(customMap.delete('nonExistentKey')).toBe(false);
    });

    it('should clear all entries', () => {
        customMap.set('key1', 'value1');
        customMap.set({ id: 1 }, 'value2');
        customMap.clear();
        expect(customMap.size).toBe(0);
        expect(customMap.has('key1')).toBe(false);
        expect(customMap.has({ id: 1 })).toBe(false);
        expect(customMap.getAllKeys()).toEqual([]);
        expect(customMap.getAllValues()).toEqual([]);
    });

    it('should get key by index', () => {
        const key1 = 'firstKey';
        const key2 = { id: 'secondKey' };
        customMap.set(key1, 'val1');
        customMap.set(key2, 'val2');

        expect(customMap.getKeyAtIndex(0)).toBe(key1);
        expect(customMap.getKeyAtIndex(1)).toEqual(key2); // Use toEqual for objects
        expect(customMap.getKeyAtIndex(2)).toBeUndefined();
    });

    it('should get all keys', () => {
        const key1 = 'keyA';
        const key2 = { complex: true, data: [1, 2] };
        const key3 = 100;
        customMap.set(key1, 'valA');
        customMap.set(key2, 'valB');
        customMap.set(key3, 'valC');

        const allKeys = customMap.getAllKeys();
        expect(allKeys).toHaveLength(3);
        expect(allKeys).toContain(key1);
        expect(allKeys).toContainEqual(key2); // Use toContainEqual for objects in array
        expect(allKeys).toContain(key3);
    });

    it('should maintain original key order for getAllKeys and getKeyAtIndex after deletions', () => {
        const key1 = 'a';
        const key2 = 'b';
        const key3 = 'c';
        customMap.set(key1, 1);
        customMap.set(key2, 2);
        customMap.set(key3, 3);

        customMap.delete(key2); // Delete middle element

        expect(customMap.getAllKeys()).toEqual([key1, key3]);
        expect(customMap.getKeyAtIndex(0)).toBe(key1);
        expect(customMap.getKeyAtIndex(1)).toBe(key3);
    });


    it('should get all values', () => {
        customMap.set('a', 10);
        customMap.set({ b: 1 }, 20);
        customMap.set(3, 30);

        const allValues = customMap.getAllValues();
        expect(allValues).toHaveLength(3);
        expect(allValues).toContain(10);
        expect(allValues).toContain(20);
        expect(allValues).toContain(30);
    });

    it('getAllValues should reflect current values, even after updates', () => {
        customMap.set('a', 1);
        customMap.set('b', 2);
        customMap.set('a', 11); // Update value for 'a'

        expect(customMap.getAllValues().sort((x,y) => x-y)).toEqual([2, 11]);
    });

    it('should get all entries (key-value pairs)', () => {
        const key1 = 'entryKey1';
        const val1 = 'entryVal1';
        const key2 = { type: 'objectKey' };
        const val2 = { type: 'objectValue' };
        customMap.set(key1, val1);
        customMap.set(key2, val2);

        const entries = customMap.getEntries();
        expect(entries).toHaveLength(2);
        // Order of entries depends on insertion order of keys
        expect(entries).toContainEqual([key1, val1]);
        expect(entries).toContainEqual([key2, val2]);
    });
});
