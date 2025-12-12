import { getAuth } from "firebase/auth";
import { deleteField, doc, getFirestore, setDoc } from "firebase/firestore";
import { getFunctions, httpsCallable } from "firebase/functions";
import { Project } from "../schema/app-schema";
import { yjsStore } from "../stores/yjsStore.svelte";

class ProjectService {
    async deleteProject(projectId: string, projectTitle: string) {
        const auth = getAuth();
        const user = auth.currentUser;

        if (user) {
            const deletedAt = Date.now();
            const deletedBy = user.uid;

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
            const db = getFirestore();
            const projectRef = doc(db, "projects", projectId);
            await setDoc(projectRef, {
                deletedAt,
                deletedBy,
                title: projectTitle,
            }, { merge: true });
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
        const db = getFirestore();
        const projectRef = doc(db, "projects", projectId);
        await setDoc(projectRef, {
            deletedAt: deleteField(),
            deletedBy: deleteField(),
        }, { merge: true });
    }

    async permanentlyDeleteProject(projectId: string) {
        const functions = getFunctions();
        const permanentlyDeleteProject = httpsCallable(functions, "permanentlyDeleteProject");
        await permanentlyDeleteProject({ projectId });
    }
}

export const projectService = new ProjectService();
