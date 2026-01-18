import { Server } from "@hocuspocus/server";

const server = new Server();
console.log("Methods on Hocuspocus Server instance:");
console.log(Object.getOwnPropertyNames(Object.getPrototypeOf(server)).filter(m => !m.startsWith("_")));
console.log("Direct methods/properties:");
console.log(Object.keys(server).filter(m => !m.startsWith("_")));
process.exit(0);
