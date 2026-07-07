import * as Y from "yjs";
import { buildDemoProject } from "./server/src/demo-content.js";
const project = buildDemoProject();
const doc = project.ydoc;
const orderedTree = doc.getMap("orderedTree");

let rootChildren = [];
for (const key of orderedTree.keys()) {
    const value = orderedTree.get(key) as Y.Map<any>;
    const parentId = value?.get("parentHistory")?.[0];
    // wait, how does yjs-orderedtree store parent relationships?
}
