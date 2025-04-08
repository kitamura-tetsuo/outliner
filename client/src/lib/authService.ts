import {
    derived,
    writable,
} from "svelte/store";
import type { IUser } from "../fluid/fluidClient";
import { clearSession } from "./api";

// ユーザー型定義
export interface User {
    uid: string;
    displayName: string | null;
    email: string | null;
    photoURL: string | null;
}

// 認証状態を管理するストア
export const authStore = writable<{
    isLoading: boolean;
    user: User | null;
    sessionId: string | null;
    error: Error | null;
}>({
    isLoading: false,
    user: null,
    sessionId: null,
    error: null,
});

// 派生ストア: Fluid クライアント用のユーザー情報
export const fluidUser = derived(authStore, $authStore => {
    if (!$authStore.user) return null;

    // ユーザー情報から Fluid 用のユーザー情報を生成
    const user: IUser = {
        id: $authStore.user.uid,
        name: $authStore.user.displayName || "Anonymous User",
        email: $authStore.user.email || undefined,
        photoURL: $authStore.user.photoURL || undefined,
    };

    return user;
});

// 認証状態監視の初期化
export function initAuth() {
    // ページ読み込み時に保存済みのユーザー情報を復元
    const savedUser = localStorage.getItem("authUser");
    const savedSessionId = localStorage.getItem("currentSessionId");

    if (savedUser && savedSessionId) {
        try {
            const userData = JSON.parse(savedUser);
            authStore.update(state => ({
                ...state,
                isLoading: false,
                user: userData as User,
                sessionId: savedSessionId,
            }));
        }
        catch (e) {
            console.error("Failed to parse saved user data:", e);
            localStorage.removeItem("authUser");
            localStorage.removeItem("currentSessionId");
        }
    }
    else {
        authStore.update(state => ({ ...state, isLoading: false }));
    }
}

// セッションを設定する関数
export function setSession(user: User, sessionId: string) {
    // 認証状態を更新
    authStore.update(state => ({
        isLoading: false,
        user,
        sessionId,
        error: null,
    }));

    // ローカルストレージにユーザー状態を保存（ページリロード対策）
    localStorage.setItem("authUser", JSON.stringify(user));
    localStorage.setItem("currentSessionId", sessionId);
}

// サインアウト
export async function signOut() {
    try {
        // バックエンドAPIでセッションをクリア
        await clearSession();

        // ローカルストレージとストアからユーザー情報を削除
        localStorage.removeItem("authUser");
        localStorage.removeItem("currentSessionId");

        authStore.update(state => ({
            isLoading: false,
            user: null,
            sessionId: null,
            error: null,
        }));

        return true;
    }
    catch (error) {
        console.error("Sign-out error:", error);
        return false;
    }
}

// 認証エラーを設定
export function setAuthError(error: Error) {
    authStore.update(state => ({
        ...state,
        isLoading: false,
        error,
    }));
}

// 読み込み状態を設定
export function setLoading(isLoading: boolean) {
    authStore.update(state => ({
        ...state,
        isLoading,
    }));
}
