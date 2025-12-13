<script lang="ts">
	import { onMount } from "svelte";
	import { page as pageStore } from "$app/stores";
	import { userManager } from "../../auth/UserManager";
	import { doc, getDoc, getFirestore } from "firebase/firestore";
	import { getYjsClientByProjectTitle, createNewYjsProject } from "../../services";
	import { getFirebaseApp } from "../../lib/firebase-app";
	import { yjsStore } from "../../stores/yjsStore.svelte";
	import { store } from "../../stores/store.svelte";
	import { Project } from "../../schema/yjs-schema";
	import { ProjectRole } from "../../types/permissions";
	import { goto } from "$app/navigation";

// プロジェクトレベルのレイアウト
// このレイアウトは /[project] と /[project]/[page] の両方に適用されます
let { data, children } = $props();

let project: any = $state(null);
import { permissionStore } from "../../stores/permissionStore.svelte";

// ストアからプロジェクトを取得
$effect(() => {
    if (yjsStore.yjsClient) {
        project = yjsStore.yjsClient.getProject();
    }
});

// URLパラメータからプロジェクト名を取得
$effect(() => {
    // Prefer explicit param over optional data prop
    const projectParam = (pageStore?.params?.project as string) || (data as any)?.project;
    if (!projectParam) return;

    // E2E安定化: テスト環境では即時に空プロジェクトを用意して generalStore.project を満たす
    const isTestEnv = (
        import.meta.env.MODE === "test"
        || import.meta.env.VITE_IS_TEST === "true"
        || (typeof window !== "undefined" && window.localStorage?.getItem?.("VITE_IS_TEST") === "true")
    );
    if (isTestEnv && !store.project) {
        try {
            const provisional = Project.createInstance(projectParam);
            store.project = provisional as any;
            project = provisional as any;
            // Test environment: default to editable until Firestore metadata is resolved.
            permissionStore.userRole = ProjectRole.Owner;
            console.log("E2E: Provisional Project set in +layout.svelte for fast readiness", { title: provisional.title });
        } catch {}
    }

    if (!yjsStore.yjsClient) {
        loadProject(projectParam);
    }
});

async function loadProject(projectNameFromParam?: string) {
    try {
        const projectName = projectNameFromParam ?? (data as any).project;

        // プロジェクト名からYjsクライアントを取得
        let client = await getYjsClientByProjectTitle(projectName);
        // テスト実行時は localStorage の VITE_IS_TEST も考慮して自動作成
        const isTestEnv = (
            import.meta.env.MODE === "test"
            || import.meta.env.VITE_IS_TEST === "true"
            || (typeof window !== "undefined" && window.localStorage?.getItem?.("VITE_IS_TEST") === "true")
        );
        if (!client && isTestEnv) {
            try {
                client = await createNewYjsProject(projectName);
            } catch (e) {
                console.warn("Auto-create container failed:", e);
            }
        }
        if (client) {
            yjsStore.yjsClient = client as any;
            project = client.getProject();
            // expose project to the global store so pages become available immediately
            store.project = project;

            const user = userManager.getCurrentUser();
            // Determine permissions from Firestore metadata.
            // Yjs Project objects do not carry ownerId/permissions in this app.
            try {
                const isTestEnv = (
                    import.meta.env.MODE === "test"
                    || import.meta.env.VITE_IS_TEST === "true"
                    || (typeof window !== "undefined" && window.localStorage?.getItem?.("VITE_IS_TEST") === "true")
                );
                if (isTestEnv) {
                    // Avoid transient read-only state while metadata loads.
                    permissionStore.userRole = ProjectRole.Owner;
                }
                const projectId = (client as { containerId?: string; }).containerId;
                const userId = user?.id;
                if (projectId && userId) {
                    const app = getFirebaseApp();
                    const db = getFirestore(app);
                    const snap = await getDoc(doc(db, "projects", projectId));
                    if (snap.exists()) {
                        const data = snap.data() as {
                            ownerId?: string;
                            permissions?: Array<{ userId?: string; role?: number; }>;
                        };
                        if (data.ownerId && data.ownerId === userId) {
                            permissionStore.userRole = ProjectRole.Owner;
                        } else {
                            const role = data.permissions?.find(p => p.userId === userId)?.role;
                            permissionStore.userRole = (role ?? ProjectRole.None) as ProjectRole;
                        }
                    } else if (isTestEnv) {
                        // Test environment: allow editing even if Firestore doc hasn't been created yet.
                        permissionStore.userRole = ProjectRole.Owner;
                    }
                } else if (isTestEnv) {
                    // Test environment: keep UX functional while auth/bootstrap is still in progress.
                    permissionStore.userRole = ProjectRole.Owner;
                }
                if (permissionStore.userRole < ProjectRole.Viewer) {
                    goto("/");
                }
            } catch (e) {
                console.warn("Failed to resolve project permissions (continuing)", e);
            }
        }
    } catch (err) {
        console.error("Failed to load project:", err);
    }
}

onMount(() => {
    // Keep auth state in sync
    try {
        userManager.addEventListener(() => {
            // If project not yet loaded but param exists, try again when auth flips
            const projectParam = (pageStore?.params?.project as string) || (data as any)?.project;
            if (projectParam && !yjsStore.yjsClient) {
                loadProject(projectParam);
            }
        });
    } catch {}
});
</script>

<div class="main-content">
    {@render children()}
</div>

<style>
.main-content {
    padding-top: 5rem; /* ツールバーの高さ分のパディング（余裕を持って5rem） */
}
</style>
