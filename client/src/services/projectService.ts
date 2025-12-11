import { getAuth } from "firebase/auth";
import { deleteDoc, doc, getFirestore, updateDoc } from "firebase/firestore";
import { yjsService } from "../lib/yjsService.svelte";
import { Project } from "../schema/app-schema";

class ProjectService {
    async deleteProject(projectId: string) {
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
                title: project.title,
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
        // This will delete from Fluid, but we also need to delete from firestore
        await yjsService.destroyYDoc(projectId);

        const db = getFirestore();
        const projectRef = doc(db, "projects", projectId);
        await deleteDoc(projectRef);
    }
}

export const projectService = new ProjectService();
