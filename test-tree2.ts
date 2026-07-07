import * as Y from "yjs";
import { buildDemoProject } from "./server/src/demo-content.js";
import { YTree } from "yjs-orderedtree";
const project = buildDemoProject();
const doc = project.ydoc;
const tree = new YTree(doc.getMap("orderedTree"));

console.log(tree.getNodeChildrenFromKey("root"));
