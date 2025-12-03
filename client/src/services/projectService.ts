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
        const apiBaseUrl = import.meta.env.VITE_FIREBASE_FUNCTIONS_URL || "http://localhost:57000";
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
