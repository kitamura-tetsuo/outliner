import * as Y from "yjs";
import { YTree } from "yjs-orderedtree";
import { buildDemoProject } from "./server/src/demo-content.js";
const project = buildDemoProject();
const doc = project.ydoc;
const tree = new YTree(doc.getMap("orderedTree"));

console.log(tree.getNodeChildrenFromKey("root"));
