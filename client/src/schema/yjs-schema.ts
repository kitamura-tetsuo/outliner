// The Yjs schema wrappers live in the shared workspace and are re-exported by
// app-schema. Keep this thin re-export so yjsService / YjsClient / tests that
// import from `./yjs-schema` continue to work against the single source of truth.
export * from "./app-schema.js";
