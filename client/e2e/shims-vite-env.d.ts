// Shim import.meta.env for E2E TypeScript project without importing client/src
interface ImportMetaEnv {
    readonly [key: string]: string | undefined;
}
interface ImportMeta {
    readonly env: ImportMetaEnv;
}
