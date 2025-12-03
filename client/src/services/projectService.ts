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
        const response = await fetch(getFirebaseFunctionUrl("listDeletedProjects"), {
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
