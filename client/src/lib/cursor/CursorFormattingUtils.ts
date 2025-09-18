// @ts-nocheck
import { ScrapboxFormatter } from "../../utils/ScrapboxFormatter";

/**
 * Apply bold formatting
 */
export function formatBold(text: string): string {
    return ScrapboxFormatter.bold(text);
}

/**
 * Apply italic formatting
 */
export function formatItalic(text: string): string {
    return ScrapboxFormatter.italic(text);
}

/**
 * Apply strikethrough formatting
 */
export function formatStrikethrough(text: string): string {
    return ScrapboxFormatter.strikethrough(text);
}

/**
 * Apply underline formatting
 */
export function formatUnderline(text: string): string {
    return ScrapboxFormatter.underline(text);
}

/**
 * Apply code formatting
 */
export function formatCode(text: string): string {
    return ScrapboxFormatter.code(text);
}

/**
 * Apply generic formatting with prefix and suffix
 */
export function applyFormatting(text: string, prefix: string, suffix: string): string {
    return `${prefix}${text}${suffix}`;
}
