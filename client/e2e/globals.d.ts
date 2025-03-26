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
}

declare namespace jest {
  function fn(): () => void;
}

// テスト環境のグローバル定義
declare namespace NodeJS {
  interface Global {
    isTestEnvironment: boolean;
  }
}
