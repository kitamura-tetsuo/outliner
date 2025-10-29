/**
 * Comprehensive type definitions for Yjs-based data structures
 * This file provides proper types to replace 'any' throughout the codebase
 */

import type * as Y from "yjs";
import type { YTree } from "yjs-orderedtree";

/**
 * Type for the value stored in a Y.Map representing an Item node
 * Y.Map stores values as a union type, not as an interface
 */
export type ItemValueType =
    | string
    | number
    | Y.Text
    | Y.Array<string>
    | Y.Array<Y.Map<CommentValueType>>
    | undefined;

/**
 * Type for the value stored in a Y.Map representing a Comment
 * Y.Map stores values as a union type, not as an interface
 */
export type CommentValueType = string | number;

/**
 * Type for Y.Doc options
 */
export interface YDocOptions {
    guid?: string;
    parent?: Y.Doc;
}

/**
 * Type for tree node operations
 */
export interface TreeNode {
    tree: YTree;
    key: string;
}

/**
 * Type for item-like objects that have tree and key properties
 */
export interface ItemLike extends TreeNode {
    ydoc: Y.Doc;
    id: string;
    text: string;
}

/**
 * Type for plain item data (used in tests and initialization)
 */
export interface PlainItemData {
    id?: string;
    author?: string;
    text?: string;
    created?: number;
    lastChanged?: number;
    votes?: string[];
    componentType?: string;
    chartQuery?: string;
    aliasTargetId?: string;
}

/**
 * Type guard to check if an object is an ItemLike
 */
export function isItemLike(obj: unknown): obj is ItemLike {
    return (
        typeof obj === "object"
        && obj !== null
        && "ydoc" in obj
        && "tree" in obj
        && "key" in obj
        && "id" in obj
    );
}

/**
 * Type guard to check if an object is a Y.Map
 */
export function isYMap(obj: unknown): obj is Y.Map<unknown> {
    return obj instanceof Y.Map;
}

/**
 * Type guard to check if an object is a Y.Text
 */
export function isYText(obj: unknown): obj is Y.Text {
    return obj instanceof Y.Text;
}

/**
 * Type guard to check if an object is a Y.Array
 */
export function isYArray(obj: unknown): obj is Y.Array<unknown> {
    return obj instanceof Y.Array;
}

/**
 * Helper to safely get a value from a Y.Map with type checking
 */
export function getYMapValue<T>(
    map: Y.Map<unknown>,
    key: string,
    defaultValue: T,
): T {
    const value = map.get(key);
    return value !== undefined ? (value as T) : defaultValue;
}

/**
 * Helper to safely get a string from a Y.Map
 */
export function getYMapString(
    map: Y.Map<unknown>,
    key: string,
    defaultValue = "",
): string {
    const value = map.get(key);
    if (typeof value === "string") return value;
    if (value && typeof value === "object" && "toString" in value) {
        return String(value);
    }
    return defaultValue;
}

/**
 * Helper to safely get a number from a Y.Map
 */
export function getYMapNumber(
    map: Y.Map<unknown>,
    key: string,
    defaultValue = 0,
): number {
    const value = map.get(key);
    return typeof value === "number" ? value : defaultValue;
}

/**
 * Helper to safely get Y.Text from a Y.Map
 */
export function getYMapText(map: Y.Map<unknown>, key: string): Y.Text | undefined {
    const value = map.get(key);
    return isYText(value) ? value : undefined;
}

/**
 * Helper to safely get Y.Array from a Y.Map
 */
export function getYMapArray<T>(map: Y.Map<unknown>, key: string): Y.Array<T> | undefined {
    const value = map.get(key);
    return isYArray(value) ? (value as Y.Array<T>) : undefined;
}
