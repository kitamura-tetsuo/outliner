import { initializeApp } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithPopup,
  signOut,
  type User as FirebaseUser
} from 'firebase/auth';
import { getEnv } from '../lib/env';

// ユーザー情報の型定義
export interface IUser {
  id: string;
  name: string;
  email?: string;
  photoURL?: string;
}

// Fluid Relayトークンの型定義
export interface IFluidToken {
  token: string;
  user: {
    id: string;
    name: string;
  };
}

// 認証結果の型定義
export interface IAuthResult {
  user: IUser;
  fluidToken: IFluidToken;
}

// 認証イベントリスナーの型定義
export type AuthEventListener = (result: IAuthResult | null) => void;

export class UserManager {
  private static instance: UserManager;

  // Firebase 設定
  private firebaseConfig = {
    apiKey: "AIzaSyCikgn1YY06j6ZlAJPYab1FIOKSQAuzcH4",
    authDomain: "outliner-d57b0.firebaseapp.com",
    projectId: "outliner-d57b0",
    storageBucket: "outliner-d57b0.firebasestorage.app",
    messagingSenderId: "560407608873",
    appId: "1:560407608873:web:147817f4a93a4678606638",
    measurementId: "G-FKSFRCT7GR"
  };

  private apiBaseUrl = getEnv('VITE_API_BASE_URL', 'http://localhost:3000');
  private app = initializeApp(this.firebaseConfig);
  private auth = getAuth(this.app);

  private currentUser: IUser | null = null;
  private currentFluidToken: IFluidToken | null = null;
  private listeners: AuthEventListener[] = [];
  private unsubscribeAuth: (() => void) | null = null;

  // シングルトンパターン
  public static getInstance(): UserManager {
    if (!UserManager.instance) {
      UserManager.instance = new UserManager();
    }
    return UserManager.instance;
  }

  private constructor() {
    console.debug('[UserManager] Initializing...');
    this.initAuthListener();
    this.loadSavedUser();
  }

  // Firebase認証状態の監視
  private initAuthListener(): void {
    this.unsubscribeAuth = onAuthStateChanged(this.auth, async (firebaseUser) => {
      if (firebaseUser) {
        await this.handleUserSignedIn(firebaseUser);
      } else {
        this.handleUserSignedOut();
      }
    });
  }

  // ユーザーサインイン処理
  private async handleUserSignedIn(firebaseUser: FirebaseUser): Promise<void> {
    try {
      console.debug(`[UserManager] User signed in: ${firebaseUser.uid}`);

      // IDトークンを取得
      const idToken = await firebaseUser.getIdToken();

      // Fluid Relayトークンを取得
      const fluidToken = await this.getFluidToken(idToken);

      // ユーザー情報を更新
      this.currentUser = {
        id: firebaseUser.uid,
        name: firebaseUser.displayName || 'Anonymous User',
        email: firebaseUser.email || undefined,
        photoURL: firebaseUser.photoURL || undefined
      };

      this.currentFluidToken = fluidToken;

      // ユーザー情報をローカルストレージに保存
      this.saveUserToLocalStorage(this.currentUser);

      // リスナーに通知
      this.notifyListeners({
        user: this.currentUser,
        fluidToken: this.currentFluidToken
      });
    } catch (error) {
      console.error('[UserManager] Error handling signed in user:', error);
      this.currentUser = null;
      this.currentFluidToken = null;
      this.notifyListeners(null);
    }
  }

  // ユーザーサインアウト処理
  private handleUserSignedOut(): void {
    console.debug('[UserManager] User signed out');
    this.currentUser = null;
    this.currentFluidToken = null;
    localStorage.removeItem('fluidUser');
    this.notifyListeners(null);
  }

  // ユーザー情報をローカルストレージに保存
  private saveUserToLocalStorage(user: IUser): void {
    if (typeof window !== 'undefined') {
      localStorage.setItem('fluidUser', JSON.stringify(user));
    }
  }

  // Fluid Relayトークンを取得
  private async getFluidToken(idToken: string): Promise<IFluidToken> {
    try {
      console.log(`[UserManager] Requesting Fluid token from: ${this.apiBaseUrl}/api/fluid-token`);

      // フェッチオプションを明示的に設定
      const response = await fetch(`${this.apiBaseUrl}/api/fluid-token`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          // クロスサイトリクエストに必要な設定
          'Accept': 'application/json'
        },
        // クレデンシャルを含めることを明示
        credentials: 'include',
        // CORSモードを明示
        mode: 'cors',
        body: JSON.stringify({ idToken })
      });

      // エラーレスポンスの詳細ログ
      if (!response.ok) {
        const errorText = await response.text();
        console.error(`[UserManager] Fluid token request failed: ${response.status}`, errorText);
        throw new Error(`Fluid token request failed: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      console.log('[UserManager] Fluid token received successfully');
      return data;
    } catch (error) {
      console.error('[UserManager] Error getting fluid token:', error);

      // より具体的なエラーメッセージを提供
      if (error.name === 'TypeError' && error.message === 'Failed to fetch') {
        console.error('[UserManager] Network error: Could not connect to server. Verify server is running and accessible.');
        throw new Error('サーバーに接続できませんでした。サーバーが実行中でアクセス可能か確認してください。');
      }

      throw error;
    }
  }

  // 保存されたユーザー情報を読み込む
  public loadSavedUser(): IUser | null {
    if (typeof window !== 'undefined') {
      const savedUser = localStorage.getItem('fluidUser');
      if (savedUser) {
        try {
          this.currentUser = JSON.parse(savedUser);
          return this.currentUser;
        } catch (e) {
          console.error('[UserManager] Error parsing saved user:', e);
          localStorage.removeItem('fluidUser');
        }
      }
    }
    return null;
  }

  // Googleでログイン
  public async loginWithGoogle(): Promise<void> {
    try {
      const provider = new GoogleAuthProvider();
      await signInWithPopup(this.auth, provider);
      // 認証状態の変更はonAuthStateChangedで検知される
    } catch (error) {
      console.error('[UserManager] Google login error:', error);
      throw error;
    }
  }

  // ログアウト
  public async logout(): Promise<void> {
    try {
      await signOut(this.auth);
      // ログアウト処理はonAuthStateChangedで検知される
    } catch (error) {
      console.error('[UserManager] Logout error:', error);
      throw error;
    }
  }

  // 認証イベントのリスナーを追加
  public addEventListener(listener: AuthEventListener): () => void {
    this.listeners.push(listener);

    // 既に認証済みの場合は即座に通知
    if (this.currentUser && this.currentFluidToken) {
      listener({
        user: this.currentUser,
        fluidToken: this.currentFluidToken
      });
    }

    // リスナー削除用の関数を返す
    return () => {
      const index = this.listeners.indexOf(listener);
      if (index !== -1) {
        this.listeners.splice(index, 1);
      }
    };
  }

  // リスナーに認証状態の変更を通知
  private notifyListeners(authResult: IAuthResult | null): void {
    for (const listener of this.listeners) {
      listener(authResult);
    }
  }

  // 現在のユーザーを取得
  public getCurrentUser(): IUser | null {
    return this.currentUser;
  }

  // 現在のFluid Relayトークンを取得
  public getCurrentFluidToken(): IFluidToken | null {
    return this.currentFluidToken;
  }

  // Fluid Relayに接続する際に必要なユーザー情報
  public getFluidUserInfo(): { id: string; name: string } | null {
    if (!this.currentUser) return null;
    return {
      id: this.currentUser.id,
      name: this.currentUser.name
    };
  }

  // トークンをリフレッシュする
  public async refreshToken(): Promise<string | null> {
    try {
      const firebaseUser = this.auth.currentUser;
      if (!firebaseUser) {
        return null;
      }

      // Firebase IDトークンを強制的にリフレッシュ
      const idToken = await firebaseUser.getIdToken(true);

      // Fluid Relayトークンを再取得
      this.currentFluidToken = await this.getFluidToken(idToken);

      // リスナーに通知
      if (this.currentUser && this.currentFluidToken) {
        this.notifyListeners({
          user: this.currentUser,
          fluidToken: this.currentFluidToken
        });
      }

      return idToken;
    } catch (error) {
      console.error('[UserManager] Error refreshing token:', error);
      return null;
    }
  }

  // クリーンアップ
  public dispose(): void {
    if (this.unsubscribeAuth) {
      this.unsubscribeAuth();
      this.unsubscribeAuth = null;
    }
    this.listeners = [];
  }
}
