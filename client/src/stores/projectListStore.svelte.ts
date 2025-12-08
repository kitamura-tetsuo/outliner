import { doc, getFirestore, onSnapshot, type Unsubscribe } from "firebase/firestore";
import { getFirebaseApp } from "../lib/firebase-app";
import { getLogger } from "../lib/logger";
import type { ProjectPermission } from "../schema/app-schema";
import { firestoreStore } from "./firestoreStore.svelte";

const logger = getLogger("ProjectListStore");

export interface ProjectMetadata {
    containerId: string;
    title: string;
    ownerId: string;
    permissions?: ProjectPermission[];
    createdAt?: Date;
    updatedAt?: Date;
    deletedAt?: Date;
    deletedBy?: string;
    isPublic?: boolean;
    publicAccessToken?: string;
}

class ProjectListStore {
    // Map of containerId -> ProjectMetadata
    public projects = $state<Record<string, ProjectMetadata>>({});

    private subscriptions: Record<string, Unsubscribe> = {};
    private db = getFirestore(getFirebaseApp());

    constructor() {
        // We use an effect to react to changes in userContainer
        $effect.root(() => {
            $effect(() => {
                // Dependency on firestoreStore.userContainer
                // We also access ucVersion to ensure reactivity even if object ref is same
                const _v = firestoreStore.ucVersion;
                void _v;
                const containerIds = firestoreStore.userContainer?.accessibleContainerIds || [];

                this.updateSubscriptions(containerIds);
            });
        });
    }

    private updateSubscriptions(containerIds: string[]) {
        const newIds = new Set(containerIds);
        const currentIds = new Set(Object.keys(this.subscriptions));

        // Unsubscribe from removed IDs
        for (const id of currentIds) {
            if (!newIds.has(id)) {
                this.unsubscribe(id);
                // Also remove from state
                const newProjects = { ...this.projects };
                delete newProjects[id];
                this.projects = newProjects;
            }
        }

        // Subscribe to new IDs
        for (const id of newIds) {
            if (!currentIds.has(id)) {
                this.subscribe(id);
            }
        }
    }

    private subscribe(containerId: string) {
        if (this.subscriptions[containerId]) return;

        try {
            const projectRef = doc(this.db, "projects", containerId);
            const unsubscribe = onSnapshot(projectRef, (snapshot) => {
                if (snapshot.exists()) {
                    const data = snapshot.data();
                    const metadata: ProjectMetadata = {
                        containerId: data.containerId || containerId,
                        title: data.title || "Untitled Project",
                        ownerId: data.ownerId,
                        permissions: data.permissions || [],
                        createdAt: data.createdAt?.toDate(),
                        updatedAt: data.updatedAt?.toDate(),
                        deletedAt: data.deletedAt?.toDate(),
                        deletedBy: data.deletedBy,
                        isPublic: data.isPublic,
                        publicAccessToken: data.publicAccessToken,
                    };

                    // Update state
                    this.projects[containerId] = metadata;
                } else {
                    // Document doesn't exist (yet? or deleted?)
                    // If it doesn't exist in 'projects' but is in 'accessibleContainerIds',
                    // it might be a new project or an inconsistency.
                    // We can retain a placeholder or remove it.
                    // For now, let's just log it and not add to projects map,
                    // or add a placeholder so the UI knows it exists but is loading/missing.
                    // But if we remove it from map, it might disappear from UI.

                    // Ideally we should have it in the map so we can show "Loading..." or "Unknown".
                    // But if snapshot doesn't exist, we can't get title.
                    // We'll mark it as missing/loading.
                    // For now, doing nothing effectively removes it from the list logic if we iterate over values.
                    // But let's keep a placeholder if needed.
                }
            }, (error) => {
                logger.warn(`Failed to subscribe to project ${containerId}:`, error);
            });

            this.subscriptions[containerId] = unsubscribe;
        } catch (error) {
            logger.error(`Error setting up subscription for ${containerId}:`, error);
        }
    }

    private unsubscribe(containerId: string) {
        if (this.subscriptions[containerId]) {
            this.subscriptions[containerId]();
            delete this.subscriptions[containerId];
        }
    }

    public cleanup() {
        for (const id in this.subscriptions) {
            this.unsubscribe(id);
        }
    }

    // Derived getters can be added if needed, e.g. sorted list
    get sortedProjects() {
        return Object.values(this.projects).sort((a, b) => {
            const dateA = a.updatedAt?.getTime() || 0;
            const dateB = b.updatedAt?.getTime() || 0;
            return dateB - dateA; // Descending
        });
    }
}

export const projectListStore = new ProjectListStore();
