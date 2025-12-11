import { yjsService } from "../lib/yjsService.svelte";
import { Project } from "../schema/app-schema";
import { getAuth } from "firebase/auth";
import { doc, deleteDoc, updateDoc, getFirestore } from "firebase/firestore";
import { getFunctions, httpsCallable } from "firebase/functions";

class ProjectService {
    async deleteProject(projectId: string, projectTitle: string) {
        const ydoc = await yjsService.getYDoc(projectId);
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
        const ydoc = await yjsService.getYDoc(projectId);
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
