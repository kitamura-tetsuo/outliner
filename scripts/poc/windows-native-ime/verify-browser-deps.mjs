import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

// Check the installed, source-patched module before opening Firefox. The previous
// browser loader had no ESM default export and prevented the application mounting.
const wasm = resolve(process.argv[2], "client/node_modules/libpg-query/wasm");
const loader = await import(pathToFileURL(resolve(wasm, "libpg-query.browser.js")).href);
assert.equal(typeof loader.default, "function", "Installed browser loader must expose its ESM factory");
assert.ok(WebAssembly.validate(readFileSync(resolve(wasm, "libpg-query.wasm"))), "Installed WASM must validate");
console.log("Installed browser loader export and WASM validated");
