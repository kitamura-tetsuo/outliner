import { ScrapboxFormatter } from "./client/src/utils/ScrapboxFormatter";

console.log("Testing ScrapboxFormatter...");

// Test internal link formatting when inactive
const testText = "[asd]";
console.log("Input text:", testText);
console.log("formatToHtml result:", ScrapboxFormatter.formatToHtml(testText));
console.log("formatWithControlChars result:", ScrapboxFormatter.formatWithControlChars(testText));
console.log("hasFormatting result:", ScrapboxFormatter.hasFormatting(testText));

// Also test tokenize
console.log("tokens:", JSON.stringify(ScrapboxFormatter.tokenize(testText), null, 2));
