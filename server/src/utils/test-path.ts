import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log("__dirname:", __dirname);

let serverRoot = path.resolve(__dirname, "..", "..");
if (path.basename(serverRoot) === "dist") {
    serverRoot = path.resolve(serverRoot, "..");
}

const serverLogDir = path.join(serverRoot, "logs");
const clientLogDir = path.resolve(serverRoot, "..", "client", "logs");

console.log("serverRoot:", serverRoot);
console.log("serverLogDir:", serverLogDir);
console.log("clientLogDir:", clientLogDir);
