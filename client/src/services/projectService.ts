import { getAuth, onAuthStateChanged } from "firebase/auth";
import { deleteField, doc, getFirestore, setDoc } from "firebase/firestore";
import { getFunctions, httpsCallable } from "firebase/functions";
import { userManager } from "../auth/UserManager";
import { getFirebaseApp } from "../lib/firebase-app";
import { Project } from "../schema/app-schema";
import { yjsStore } from "../stores/yjsStore.svelte";

class ProjectService {
    private getDb() {
        const app = getFirebaseApp();
        return getFirestore(app);
    }

    private async getAuthenticatedUserId(timeoutMs = 15000): Promise<string> {
        const existing = userManager.getCurrentUser()?.id ?? userManager.auth.currentUser?.uid;
        if (existing) return existing;

        return await new Promise<string>((resolve, reject) => {
            let timeoutId: ReturnType<typeof setTimeout> | undefined;
            let shouldUnsubscribe = false;

            const unsubscribe = onAuthStateChanged(
                userManager.auth,
                (user) => {
                    if (!user) return;
                    shouldUnsubscribe = true;
                    if (timeoutId) {
                        clearTimeout(timeoutId);
                        timeoutId = undefined;
                    }
                    resolve(user.uid);
                },
                (err) => {
                    shouldUnsubscribe = true;
                    if (timeoutId) {
                        clearTimeout(timeoutId);
                        timeoutId = undefined;
                    }
                    reject(err);
                },
            );

            timeoutId = setTimeout(() => {
                shouldUnsubscribe = true;
                timeoutId = undefined;
                unsubscribe();
                reject(new Error("Auth timeout"));
            }, timeoutMs);

            if (shouldUnsubscribe) {
                if (timeoutId) {
                    clearTimeout(timeoutId);
                    timeoutId = undefined;
                }
                unsubscribe();
            }
        });
    }

    async deleteProject(projectId: string, projectTitle: string) {
        const app = getFirebaseApp();
        void getAuth(app); // ensure Auth is initialized for this app instance
        const deletedBy = await this.getAuthenticatedUserId();
        const deletedAt = Date.now();

        // Try to update YDoc if connected (best effort, don't fail if not connected)
        try {
            const ydoc = await yjsStore.getYDoc(projectId);
            const project = Project.fromDoc(ydoc);
            project.deletedAt = deletedAt;
            project.deletedBy = deletedBy;
        } catch {
            // YDoc not available, continue with Firestore-only update
        }

        // Always update Firestore (use setDoc with merge to create if doesn't exist)
        const db = this.getDb();
        const projectRef = doc(db, "projects", projectId);
        try {
            await setDoc(
                projectRef,
                {
                    id: projectId,
                    deletedAt,
                    deletedBy,
                    ownerId: deletedBy,
                    title: projectTitle,
                },
                { merge: true },
            );
        } catch {
            // If the doc doesn't exist yet (common in test env), create it with ownership metadata.
            await setDoc(
                projectRef,
                {
                    id: projectId,
                    title: projectTitle,
                    ownerId: deletedBy,
                    permissions: [],
                    permissionsMap: {},
                    deletedAt,
                    deletedBy,
                },
                { merge: true },
            );
        }
    }

    async restoreProject(projectId: string) {
        // Try to update YDoc if connected (best effort)
        try {
            const ydoc = await yjsStore.getYDoc(projectId);
            const project = Project.fromDoc(ydoc);
            project.deletedAt = null;
            project.deletedBy = null;
        } catch {
            // YDoc not available, continue with Firestore-only update
        }

        // Always update Firestore
        const db = this.getDb();
        const projectRef = doc(db, "projects", projectId);
        await setDoc(projectRef, {
            deletedAt: deleteField(),
            deletedBy: deleteField(),
        }, { merge: true });
    }

    async permanentlyDeleteProject(projectId: string) {
        const app = getFirebaseApp();
        const functions = getFunctions(app);
        const permanentlyDeleteProject = httpsCallable(functions, "permanentlyDeleteProject");
        await permanentlyDeleteProject({ projectId });
    }
}

export const projectService = new ProjectService();
