// Text manipulation utilities

/**
 * Counts characters considering surrogate pairs
 */
export function countCharacters(text: string): number {
    // Array.from splits correctly by code point (surrogate pairs count as 1 character)
    return Array.from(text).length;
}

/**
 * Truncates text to specified length (considering surrogate pairs)
 */
export function truncateText(text: string, maxLength: number): string {
    const chars = Array.from(text);
    if (chars.length <= maxLength) {
        return text;
    }
    return chars.slice(0, maxLength).join("") + "...";
}

/**
 * Generates a random ID
 */
export function generateId(): string {
    return Math.random().toString(36).substring(2, 10);
}
