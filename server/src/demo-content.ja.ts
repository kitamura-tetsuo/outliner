/**
 * Japanese demo content.
 *
 * A sparse override of the English pack (demo-content.en.ts): anything absent
 * here falls back to English, so a feature added to the demo in English still
 * shows up in `/demo-ja` instead of vanishing from it.
 *
 * One rule the tests enforce: internal `[Page Title]` links must name a page
 * title *of this locale*. Translating a page that others link to therefore
 * means translating those links too — otherwise the fallback leaves a link
 * pointing at a title no page in this project has.
 *
 * See demo-content.en.ts for why this is a function rather than a const.
 */

import { type DemoLocaleContent } from "./demo-content.js";

export function demoContentJa(): DemoLocaleContent {
    return {};
}
