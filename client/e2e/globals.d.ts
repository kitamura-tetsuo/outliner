// Ambient global typings for E2E only. Do not put runtime code here.
interface Window {
    mockFluidClient?: boolean;
    alert: (message: string) => void;
    mockUser?: {
        id: string;
        name: string;
        email?: string;
        photoURL?: string;
    };
    mockFluidToken?: {
        token: string;
        user: {
            id: string;
            name: string;
        };
        tenantId?: string;
        containerId?: string;
    };
    _alertMessage?: string | null;
    mockContainerConnected?: boolean;
}

declare namespace jest {
    function fn(): () => void;
}

// テスト環境のグローバル定義（型のみ）
declare namespace NodeJS {
    interface Global {
        isTestEnvironment: boolean;
    }
}
