/**
 * Safely decodes a URI component.
 * If decoding fails (e.g., due to a malformed URI sequence like '%'),
 * it returns the original string.
 */
export function safeDecodeURIComponent(str: string | undefined | null): string {
    if (str == null) return "";
    try {
        return decodeURIComponent(str);
    } catch (_e) {
        return str;
    }
}
