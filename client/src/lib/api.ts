import { getEnv } from './env';

const API_BASE_URL = getEnv('VITE_API_BASE_URL', 'http://localhost:3000');

// セッション情報
let currentSessionId: string | null = null;

/**
 * Firebase IDトークンを検証し、アプリケーションセッションを取得する
 */
export async function verifyFirebaseToken(idToken: string): Promise<{
  sessionId: string;
  user: {
    uid: string;
    displayName?: string;
    email?: string;
    photoURL?: string;
  };
}> {
  try {
    const response = await fetch(`${API_BASE_URL}/api/verify-token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ idToken })
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || 'トークン検証に失敗しました');
    }

    const data = await response.json();

    // セッションIDを保存
    currentSessionId = data.sessionId;

    // ローカルストレージにセッションIDを保存
    localStorage.setItem('currentSessionId', currentSessionId);

    return data;
  } catch (error) {
    console.error('API error verifying token:', error);
    throw error;
  }
}

/**
 * Fluid用のトークンを取得する
 */
export async function getFluidToken(): Promise<{
  token: string;
  user: {
    id: string;
    name: string;
  };
}> {
  try {
    // ストレージからセッションIDを取得（ページリロード対策）
    if (!currentSessionId) {
      currentSessionId = localStorage.getItem('currentSessionId');
    }

    if (!currentSessionId) {
      throw new Error('有効なセッションがありません。再度ログインしてください。');
    }

    const response = await fetch(`${API_BASE_URL}/api/fluid-token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ sessionId: currentSessionId })
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || 'Fluidトークン取得に失敗しました');
    }

    return await response.json();
  } catch (error) {
    console.error('API error getting Fluid token:', error);
    throw error;
  }
}

/**
 * ユーザーのデフォルトコンテナIDを取得する
 * @param idToken Firebase認証トークン
 */
export async function getUserContainerId(idToken: string): Promise<string | null> {
  try {
    const apiBaseUrl = getEnv('VITE_API_BASE_URL', 'http://localhost:3000');

    const response = await fetch(`${apiBaseUrl}/api/user-container`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ idToken })
    });

    if (!response.ok) {
      throw new Error(`Failed to get user container ID: ${response.statusText}`);
    }

    const data = await response.json();
    return data.containerId || null;
  } catch (error) {
    console.error('API error getting user container ID:', error);
    return null;
  }
}

/**
 * ユーザーのデフォルトコンテナIDを保存する
 * @param idToken Firebase認証トークン
 * @param containerId 保存するコンテナID
 */
export async function saveUserContainerId(idToken: string, containerId: string): Promise<boolean> {
  try {
    const apiBaseUrl = getEnv('VITE_API_BASE_URL', 'http://localhost:3000');

    const response = await fetch(`${apiBaseUrl}/api/save-container`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ idToken, containerId })
    });

    if (!response.ok) {
      throw new Error(`Failed to save user container ID: ${response.statusText}`);
    }

    return true;
  } catch (error) {
    console.error('API error saving user container ID:', error);
    return false;
  }
}

/**
 * セッションをクリアする（ログアウト時）
 */
export function clearSession(): void {
  currentSessionId = null;
  localStorage.removeItem('currentSessionId');
}
