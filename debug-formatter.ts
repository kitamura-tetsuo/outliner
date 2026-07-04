import { ScrapboxFormatter } from "./client/src/utils/ScrapboxFormatter";

// Test the formatter with our failing case
const testText = "This is a link to [target-page-123456]";
console.log("Input:", testText);

const html = ScrapboxFormatter.formatToHtml(testText);
console.log("Output:", html);
