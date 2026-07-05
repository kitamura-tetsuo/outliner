# apply changes to app-schema.ts
cat client/src/schema/app-schema.ts | sed -e 's/public readonly tree: YTree;/public readonly tree: YTree;\n    public readonly yDatabase: Y.Map<unknown>;/' > tmp
mv tmp client/src/schema/app-schema.ts

cat client/src/schema/app-schema.ts | sed -e 's/constructor(ydoc: Y.Doc, tree: YTree) {/constructor(ydoc: Y.Doc, tree: YTree, yDatabase?: Y.Map<unknown>) {\n        this.yDatabase = yDatabase || ydoc.getMap("database");/' > tmp
mv tmp client/src/schema/app-schema.ts

cat client/src/schema/app-schema.ts | sed -e 's/const meta = doc.getMap("metadata");/const yDatabase = doc.getMap("database");\n        const meta = doc.getMap("metadata");/' > tmp
mv tmp client/src/schema/app-schema.ts

cat client/src/schema/app-schema.ts | sed -e 's/return new Project(doc, tree);/return new Project(doc, tree, yDatabase);/' > tmp
mv tmp client/src/schema/app-schema.ts

cat client/src/schema/app-schema.ts | sed -e 's/const tree = new YTree(ymap);/const yDatabase = doc.getMap("database");\n        const tree = new YTree(ymap);/' > tmp
mv tmp client/src/schema/app-schema.ts

# ... we'll do the rest via tools.
