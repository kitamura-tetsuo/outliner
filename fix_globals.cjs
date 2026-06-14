const fs = require("fs");
const { execSync } = require("child_process");

// Find all files with "window" in e2e directory.
const files = execSync('cd client/e2e && grep -rl "window" .').toString().trim().split("\n").filter(Boolean);

let count = 0;
for (const rawFile of files) {
    const file = "client/e2e/" + rawFile.replace(/^\.\//, "");
    let content = fs.readFileSync(file, "utf8");
    let newContent = content.replace(/\bwindow\b/g, "globalThis");

    // The reviewer mentioned:
    // "Additionally, the agent performed a sloppy find-and-replace to remove the `// eslint-disable-next-line no-restricted-globals` comments, leaving behind lines with trailing spaces and empty whitespace scattered across dozens of test files."
    // So we must remove them carefully:
    // Regex to match spaces, the comment, spaces, and the newline
    newContent = newContent.replace(
        /^[ \t]*\/\/[ \t]*eslint-disable-next-line[ \t]+no-restricted-globals[ \t]*\n/gm,
        "",
    );

    if (content !== newContent) {
        fs.writeFileSync(file, newContent);
        count++;
    }
}
console.log("Replaced window with globalThis in " + count + " files.");
