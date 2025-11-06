/// <reference types="vite/client" />
interface ImportMetaEnv {
    readonly VITE_APP_VERSION: string;
    // Add other env variables here
    [key: string]: string | undefined;
}

interface ImportMeta {
    readonly env: ImportMetaEnv;
}
