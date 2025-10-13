console.log("Debugging ScrapboxFormatter");

// Simple test to see what the regex matches
const text = "This is a link to [target-page-123456]";

// Our fixed regex pattern
const internalLinkRegex = /\[([^\[\]]+?)\]/g;

console.log("Testing regex:", internalLinkRegex);
let match;
while ((match = internalLinkRegex.exec(text)) !== null) {
    console.log("Match found:");
    console.log("  Full match:", match[0]);
    console.log("  Content:", match[1]);
    console.log("  Index:", match.index);
}
