/// <reference types="vite/client" />
interface ImportMetaEnv {
    readonly VITE_APP_VERSION: string;
    // Add other env variables here
    [key: string]: string | undefined;
}

interface ImportMeta {
    readonly env: ImportMetaEnv;
}

// Test environment type declarations
interface FetchMock {
    (input: RequestInfo | URL, init?: RequestInit): Promise<Response>;
    mockResolvedValueOnce: (value: Response) => void;
    mockReturnValueOnce: (value: Response) => void;
    toHaveBeenCalledWith: (...args: unknown[]) => void;
}

interface GlobalThis {
    window?: {
        console: Console;
    };
    fetch?: FetchMock | ((input: RequestInfo | URL, init?: RequestInit) => Promise<Response>);
    presenceStore?: {
        users: Record<string, { userId: string; userName: string; color: string; }>;
        setUser: (user: { userId: string; userName: string; color: string; }) => void;
        removeUser: (userId: string) => void;
    };
}
