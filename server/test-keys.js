import * as Y from "yjs";
import { YTree } from "yjs-orderedtree";
const doc = new Y.Doc();
const map = doc.getMap("test");
const tree = new YTree(map);
console.log(map.get("root").constructor.name);
console.log(Array.from(map.get("root").keys()));
