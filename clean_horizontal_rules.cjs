const fs = require("fs");

function cleanFile(filePath) {
    let content = fs.readFileSync(filePath, "utf-8");
    content = content.replace(/\n---\n\n---\n/g, "\n---\n");
    fs.writeFileSync(filePath, content);
}

cleanFile("docs/user-manual/index.md");
cleanFile("docs/ja/user-manual/index.md");
