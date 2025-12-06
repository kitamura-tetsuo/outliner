import { userManager } from "../auth/UserManager";
import { getFirebaseFunctionUrl } from "../lib/firebaseFunctionsUrl";
import { getLogger } from "../lib/logger";

const logger = getLogger();

/**
 * プロジェクト名を変更する
 * @param containerId 変更するプロジェクトのコンテナID
 * @param newTitle 新しいプロジェクト名
 * @returns 成功時はtrue、失敗時はfalse
 */
export async function renameProject(containerId: string, newTitle: string): Promise<boolean> {
    try {
        const currentUser = userManager.getCurrentUser();
        if (!currentUser) {
            logger.warn("Cannot rename project: User not logged in");
            return false;
        }

        // Firebase IDトークンを取得
        const idToken = await userManager.auth.currentUser?.getIdToken();
        if (!idToken) {
            logger.warn("Cannot rename project: Firebase user not available");
            return false;
        }

        // Firebase Functionsを呼び出してプロジェクト名を変更
        const response = await fetch(getFirebaseFunctionUrl("renameProject"), {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                idToken,
                containerId,
                newTitle,
            }),
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`API error: ${response.status} ${errorText}`);
        }

        const result = await response.json();
        logger.info(`Successfully renamed project ${containerId} to "${newTitle}"`);
        return result.success === true;
    } catch (error) {
        logger.error("Error renaming project:", error);
        return false;
    }
}

/**
 * プロジェクトを削除する（ゴミ箱に移動）
 * @param containerId 削除するプロジェクトのコンテナID
 * @returns 成功時はtrue、失敗時はfalse
 */
export async function deleteProject(containerId: string): Promise<boolean> {
    try {
        const currentUser = userManager.getCurrentUser();
        if (!currentUser) {
            logger.warn("Cannot delete project: User not logged in");
            return false;
        }

        // Firebase IDトークンを取得
        const idToken = await userManager.auth.currentUser?.getIdToken();
        if (!idToken) {
            logger.warn("Cannot delete project: Firebase user not available");
            return false;
        }

        // Firebase Functionsを呼び出してプロジェクトを削除
        const response = await fetch(getFirebaseFunctionUrl("deleteProject"), {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                idToken,
                containerId,
            }),
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`API error: ${response.status} ${errorText}`);
        }

        const result = await response.json();
        logger.info(`Successfully deleted project ${containerId}`);
        return result.success === true;
    } catch (error) {
        logger.error("Error deleting project:", error);
        return false;
    }
}

/**
 * 削除されたプロジェクトを復元する
 * @param containerId 復元するプロジェクトのコンテナID
 * @returns 成功時はtrue、失敗時はfalse
 */
export async function restoreProject(containerId: string): Promise<boolean> {
    try {
        const currentUser = userManager.getCurrentUser();
        if (!currentUser) {
            logger.warn("Cannot restore project: User not logged in");
            return false;
        }

        // Firebase IDトークンを取得
        const idToken = await userManager.auth.currentUser?.getIdToken();
        if (!idToken) {
            logger.warn("Cannot restore project: Firebase user not available");
            return false;
        }

        // Firebase Functionsを呼び出してプロジェクトを復元
        const response = await fetch(getFirebaseFunctionUrl("restoreProject"), {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                idToken,
                containerId,
            }),
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`API error: ${response.status} ${errorText}`);
        }

        const result = await response.json();
        logger.info(`Successfully restored project ${containerId}`);
        return result.success === true;
    } catch (error) {
        logger.error("Error restoring project:", error);
        return false;
    }
}

/**
 * プロジェクトを完全に削除する
 * @param containerId 完全削除するプロジェクトのコンテナID
 * @returns 成功時はtrue、失敗時はfalse
 */
export async function permanentlyDeleteProject(containerId: string): Promise<boolean> {
    try {
        const currentUser = userManager.getCurrentUser();
        if (!currentUser) {
            logger.warn("Cannot permanently delete project: User not logged in");
            return false;
        }

        // Firebase IDトークンを取得
        const idToken = await userManager.auth.currentUser?.getIdToken();
        if (!idToken) {
            logger.warn("Cannot permanently delete project: Firebase user not available");
            return false;
        }

        // Firebase Functionsを呼び出してプロジェクトを完全に削除
        const response = await fetch(getFirebaseFunctionUrl("permanentlyDeleteProject"), {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                idToken,
                containerId,
            }),
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`API error: ${response.status} ${errorText}`);
        }

        const result = await response.json();
        logger.info(`Successfully permanently deleted project ${containerId}`);
        return result.success === true;
    } catch (error) {
        logger.error("Error permanently deleting project:", error);
        return false;
    }
}

/**
 * 削除されたプロジェクト一覧を取得する（ゴミ箱用）
 * @returns 削除されたプロジェクトの配列
 */
export async function listDeletedProjects(): Promise<
    Array<{
        containerId: string;
        title: string;
        ownerId: string;
        deletedAt: Date | null;
        deletedBy: string;
        createdAt: Date | null;
        updatedAt: Date | null;
    }>
> {
    try {
        const currentUser = userManager.getCurrentUser();
        if (!currentUser) {
            logger.warn("Cannot list deleted projects: User not logged in");
            return [];
        }

        // Firebase IDトークンを取得
        const idToken = await userManager.auth.currentUser?.getIdToken();
        if (!idToken) {
            logger.warn("Cannot list deleted projects: Firebase user not available");
            return [];
        }

        // Firebase Functionsを呼び出して削除されたプロジェクト一覧を取得
        // idTokenをクエリパラメータとして渡す（GETメソッドのため）
        const url = new URL(getFirebaseFunctionUrl("listDeletedProjects"));
        url.searchParams.set("idToken", idToken);
        const response = await fetch(url.toString(), {
            method: "GET",
            headers: {
                "Content-Type": "application/json",
            },
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`API error: ${response.status} ${errorText}`);
        }

        const result = await response.json();
        logger.info(`Successfully retrieved ${result.projects?.length || 0} deleted projects`);
        return result.projects || [];
    } catch (error) {
        logger.error("Error listing deleted projects:", error);
        return [];
    }
}

/**
 * プロジェクトの公開/非公開を切り替える
 * @param containerId プロジェクトID
 * @param isPublic 公開するかどうか
 * @returns 成功時はtrue、失敗時はfalse。公開時は公共アクセストークンも返す
 */
export async function togglePublic(
    containerId: string,
    isPublic: boolean,
): Promise<{ success: boolean; publicAccessToken?: string; }> {
    try {
        const currentUser = userManager.getCurrentUser();
        if (!currentUser) {
            logger.warn("Cannot toggle public access: User not logged in");
            return { success: false };
        }

        // Firebase IDトークンを取得
        const idToken = await userManager.auth.currentUser?.getIdToken();
        if (!idToken) {
            logger.warn("Cannot toggle public access: Firebase user not available");
            return { success: false };
        }

        // Firebase Functionsを呼び出して公開状態を切り替える
        const response = await fetch(getFirebaseFunctionUrl("togglePublic"), {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                idToken,
                containerId,
                isPublic,
            }),
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`API error: ${response.status} ${errorText}`);
        }

        const result = await response.json();
        logger.info(
            `Successfully ${isPublic ? "made public" : "made private"} project ${containerId}`,
        );
        return result;
    } catch (error) {
        logger.error("Error toggling public access:", error);
        return { success: false };
    }
}

/**
 * プロジェクトの公開URLを生成する
 * @param containerId プロジェクトID
 * @returns 公開URL（失敗時は空文字列）
 */
export function generatePublicUrl(containerId: string): string {
    try {
        // metaDocモジュールからトークンを取得
        // これはクライアント側のローカルストレージから取得
        if (typeof window === "undefined") {
            return "";
        }

        // トークンは metaDoc の containersMap から取得する必要がある
        // ただし、サーバー側で Firestore に保存されたトークンを使用すべき
        // ここではプレビュー用の URL を生成（実際のトークンは Firebase Functions から取得）
        const baseUrl = window.location.origin;
        return `${baseUrl}/projects/${containerId}`;
    } catch (error) {
        logger.error("Error generating public URL:", error);
        return "";
    }
}

/**
 * プロジェクトの公開状態を取得する
 * @param containerId プロジェクトID
 * @returns プロジェクトの公開情報
 */
export async function getProjectPublicStatus(
    containerId: string,
): Promise<{ isPublic: boolean; publicAccessToken?: string; } | null> {
    try {
        const currentUser = userManager.getCurrentUser();
        if (!currentUser) {
            logger.warn("Cannot get public status: User not logged in");
            return null;
        }

        // Firebase IDトークンを取得
        const idToken = await userManager.auth.currentUser?.getIdToken();
        if (!idToken) {
            logger.warn("Cannot get public status: Firebase user not available");
            return null;
        }

        // Firebase Functionsを呼び出して公開状態を取得
        const url = new URL(getFirebaseFunctionUrl("getProjectPublicStatus"));
        url.searchParams.set("idToken", idToken);
        url.searchParams.set("containerId", containerId);
        const response = await fetch(url.toString(), {
            method: "GET",
            headers: {
                "Content-Type": "application/json",
            },
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`API error: ${response.status} ${errorText}`);
        }

        const result = await response.json();
        return result;
    } catch (error) {
        logger.error("Error getting project public status:", error);
        return null;
    }
}
