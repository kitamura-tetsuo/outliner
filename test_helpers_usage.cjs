const fs = require("fs");
const files = fs.readdirSync("client/e2e/new");
for (const file of files) {
    if (file.endsWith(".spec.ts")) {
        const content = fs.readFileSync("client/e2e/new/" + file, "utf8");
        if (content.includes("TestHelpers.seedProjectAndNavigate")) {
            console.log("File:", file);
            const match = content.match(/TestHelpers\.seedProjectAndNavigate\([\s\S]*?\)/);
            if (match) console.log(match[0].slice(0, 300) + "...");
            console.log("---");
        }
    }
}
