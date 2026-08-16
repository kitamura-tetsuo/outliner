/**
 * The demo project registry is defined once in the shared workspace so the
 * client and the server agree on which slugs exist and which locale each one
 * seeds. Re-exported here so server modules can import `./demo-projects.js`.
 */
export * from "../../shared/src/demoProjects.js";
