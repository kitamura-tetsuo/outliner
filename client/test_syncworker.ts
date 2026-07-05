import * as Y from "yjs";

const doc = new Y.Doc();
const db = doc.getMap("database");
const table = new Y.Map();
const row = new Y.Map();
row.set("id", "1");
row.set("name", "Alice");
table.set("1", row);
db.set("users", table);

console.log(db.toJSON());
