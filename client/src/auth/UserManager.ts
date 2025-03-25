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
  tenantId?: string; // サーバーから受け取ったテナントIDを格納できるように追加
  containerId?: string; // 対象コンテナID
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

  private currentFluidToken: IFluidToken | null = null;
  private listeners: AuthEventListener[] = [];
  private unsubscribeAuth: (() => void) | null = null;
  private isRefreshingToken = false; // トークン更新中フラグ
  private tokenRefreshPromise: Promise<IFluidToken | null> | null = null;
  private readonly TOKEN_REFRESH_TIMEOUT = 10000; // 10秒のタイムアウト

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

  // 認証状態をチェックする新しいヘルパーメソッド
  public isAuthenticated(): boolean {
    return !!this.auth.currentUser;
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
      this.currentFluidToken = fluidToken;

      // リスナーに通知 - Firebase認証状態から直接ユーザー情報を構築
      this.notifyListeners({
        user: this.getCurrentUser()!,
        fluidToken: this.currentFluidToken
      });
    } catch (error) {
      console.error('[UserManager] Error handling signed in user:', error);
      this.currentFluidToken = null;
      this.notifyListeners(null);
    }
  }

  // ユーザーサインアウト処理
  private handleUserSignedOut(): void {
    console.debug('[UserManager] User signed out');
    this.currentFluidToken = null;
    localStorage.removeItem('fluidUser'); // 不要になる可能性あり
    this.notifyListeners(null);
  }

  // ユーザー情報を取得する関数
  public getCurrentUser(): IUser | null {
    const firebaseUser = this.auth.currentUser;
    if (!firebaseUser) return null;

    return {
      id: firebaseUser.uid,
      name: firebaseUser.displayName || 'Anonymous User',
      email: firebaseUser.email || undefined,
      photoURL: firebaseUser.photoURL || undefined
    };
  }

  // Fluid Relayトークンを取得
  private async getFluidToken(idToken: string, containerId?: string): Promise<IFluidToken> {
    try {
      console.log(`[UserManager] Requesting Fluid token from: ${this.apiBaseUrl}/api/fluid-token`);

      // リクエストボディの作成
      const requestBody: any = { idToken };

      // コンテナIDが指定されている場合は追加
      if (containerId) {
        requestBody.containerId = containerId;
        console.log(`[UserManager] Requesting token for container: ${containerId}`);
      }

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
        body: JSON.stringify(requestBody)
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
          return JSON.parse(savedUser);
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
    if (this.auth.currentUser && this.currentFluidToken) {
      listener({
        user: this.getCurrentUser()!,
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

  // 現在のFluid Relayトークンを取得（なければ取得を試みる）
  public async getCurrentFluidToken(forceRefresh = false): Promise<IFluidToken | null> {
    // 既存のトークン更新が進行中の場合はそのプロミスを返す
    if (this.tokenRefreshPromise) {
      console.log('[UserManager] Token refresh already in progress, waiting...');
      return this.tokenRefreshPromise;
    }

    // トークンが存在しないか強制更新が要求された場合
    if ((forceRefresh || !this.currentFluidToken) && this.isAuthenticated() && !this.isRefreshingToken) {
      try {
        // 更新中フラグをセット（無限ループ防止）
        this.isRefreshingToken = true;

        console.log('[UserManager] No token available, attempting to refresh');

        // 更新処理をプロミスとして保存（他の呼び出しが同じプロミスを共有できるように）
        this.tokenRefreshPromise = new Promise<IFluidToken | null>(async (resolve) => {
          // タイムアウト処理
          const timeoutId = setTimeout(() => {
            console.warn('[UserManager] Token refresh timed out after', this.TOKEN_REFRESH_TIMEOUT, 'ms');
            this.isRefreshingToken = false;
            this.tokenRefreshPromise = null;
            resolve(this.currentFluidToken); // タイムアウト時は現在の状態を返す
          }, this.TOKEN_REFRESH_TIMEOUT);

          try {
            await this.refreshToken();
            clearTimeout(timeoutId);
            resolve(this.currentFluidToken);
          } catch (error) {
            console.error('[UserManager] Failed to get fluid token:', error);
            clearTimeout(timeoutId);
            resolve(this.currentFluidToken); // エラー時は現在の状態を返す
          } finally {
            this.isRefreshingToken = false;
            this.tokenRefreshPromise = null;
          }
        });

        return await this.tokenRefreshPromise;
      } catch (error) {
        console.error('[UserManager] Error in getCurrentFluidToken:', error);
        this.isRefreshingToken = false;
        this.tokenRefreshPromise = null;
        return this.currentFluidToken;
      }
    }

    return this.currentFluidToken;
  }

  // 同期バージョンも保持（互換性のため）
  public getFluidTokenSync(): IFluidToken | null {
    if (this.isRefreshingToken) {
      console.warn('[UserManager] Warning: Token is being refreshed, returning current value synchronously');
    }
    return this.currentFluidToken;
  }

  // Fluid Relayに接続する際に必要なユーザー情報
  public getFluidUserInfo(): { id: string; name: string } | null {
    const currentUser = this.getCurrentUser();
    if (!currentUser) return null;
    return {
      id: currentUser.id,
      name: currentUser.name
    };
  }

  // Firebase認証の完了を待機するためのヘルパーメソッド
  private waitForFirebaseAuth(timeoutMs = 10000): Promise<boolean> {
    return new Promise((resolve) => {
      // すでに認証済みなら即座に完了
      if (this.auth.currentUser) {
        return resolve(true);
      }

      // タイムアウト用のタイマー
      const timeoutId = setTimeout(() => {
        unsubscribe();
        console.warn('[UserManager] Firebase auth state timeout after', timeoutMs, 'ms');
        resolve(false);
      }, timeoutMs);

      // 認証状態変更のリスナー
      const unsubscribe = this.auth.onAuthStateChanged((user) => {
        if (user) {
          clearTimeout(timeoutId);
          unsubscribe();
          resolve(true);
        }
      });
    });
  }

  // トークンをリフレッシュする
  public async refreshToken(containerId?: string): Promise<string | null> {
    try {
      // Firebase認証の完了を待機
      console.log('[UserManager] Waiting for Firebase auth to complete...');
      const authCompleted = await this.waitForFirebaseAuth();

      if (!authCompleted || !this.isAuthenticated()) {
        console.warn('[UserManager] Firebase auth did not complete or user is not authenticated');
        return null;
      }

      console.log('[UserManager] Firebase auth completed, getting ID token...');
      // Firebase IDトークンを強制的にリフレッシュ
      const idToken = await this.auth.currentUser!.getIdToken(true);

      // Fluid Relayトークンを再取得
      console.log('[UserManager] Got Firebase ID token, requesting Fluid token...');
      this.currentFluidToken = await this.getFluidToken(idToken, containerId);

      // リスナーに通知
      if (this.auth.currentUser && this.currentFluidToken) {
        this.notifyListeners({
          user: this.getCurrentUser()!,
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
