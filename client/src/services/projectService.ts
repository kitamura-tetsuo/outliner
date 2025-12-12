import { getAuth } from "firebase/auth";
import { doc, getFirestore, updateDoc } from "firebase/firestore";
import { getFunctions, httpsCallable } from "firebase/functions";
import { yjsStore } from "../stores/yjsStore.svelte";
import { Project } from "../schema/app-schema";

class ProjectService {
    async deleteProject(projectId: string, projectTitle: string) {
        const ydoc = await yjsStore.getYDoc(projectId);
        const project = Project.fromDoc(ydoc);
        const auth = getAuth();
        const user = auth.currentUser;

        if (user) {
            project.deletedAt = Date.now();
            project.deletedBy = user.uid;

            // Also update in firestore
            const db = getFirestore();
            const projectRef = doc(db, "projects", projectId);
            await updateDoc(projectRef, {
                deletedAt: project.deletedAt,
                deletedBy: project.deletedBy,
                title: projectTitle,
            });
        }
    }

    async restoreProject(projectId: string) {
        const ydoc = await yjsStore.getYDoc(projectId);
        const project = Project.fromDoc(ydoc);
        project.deletedAt = null;
        project.deletedBy = null;

        // Also update in firestore
        const db = getFirestore();
        const projectRef = doc(db, "projects", projectId);
        await updateDoc(projectRef, {
            deletedAt: null,
            deletedBy: null,
        });
    }

    async permanentlyDeleteProject(projectId: string) {
        const functions = getFunctions();
        const permanentlyDeleteProject = httpsCallable(functions, "permanentlyDeleteProject");
        await permanentlyDeleteProject({ projectId });
    }
}

export const projectService = new ProjectService();
