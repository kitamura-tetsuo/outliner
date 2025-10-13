console.log("Testing internal link regex");

// Our current regex pattern
const internalLinkRegex = /\[([^\[\]]+?)\]/g;

const testText = "This is a link to [target-page-123456] and another [test-page]";

console.log("Input text:", testText);
console.log("Testing regex:", internalLinkRegex);

let match;
let matchCount = 0;
while ((match = internalLinkRegex.exec(testText)) !== null) {
    matchCount++;
    console.log(`Match ${matchCount}:`);
    console.log("  Full match:", match[0]);
    console.log("  Captured content:", match[1]);
    console.log("  Index:", match.index);
}

console.log(`Total matches found: ${matchCount}`);
