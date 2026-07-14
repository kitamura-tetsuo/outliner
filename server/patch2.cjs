const fs = require('fs');
const path = require('path');

const targetPath = path.resolve(__dirname, 'tests/demo-api.spec.ts');
let content = fs.readFileSync(targetPath, 'utf8');

const replacement = `
        const orderedTree = mockDoc.getMap("orderedTree");
        const { YTree } = await import("yjs-orderedtree");
        const tree = new YTree(orderedTree);
        const { demoPages } = await import("../src/demo-content.js");
        const { Project } = await import("../src/schema/app-schema.js");

        const mockProject = Project.fromDoc(mockDoc);
        for (const page of demoPages) {
            mockProject.addPage(page.title, "test");
        }
`;

content = content.replace(
    /        const orderedTree = mockDoc\.getMap\("orderedTree"\);\n        const \{ YTree \} = await import\("yjs-orderedtree"\);\n        const tree = new YTree\(orderedTree\);\n        tree\.createNode\("root", "item1", new Y\.Map\(\)\);/,
    replacement.trim()
);

fs.writeFileSync(targetPath, content);
