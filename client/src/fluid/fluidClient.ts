/**
 * Fluid Framework クライアント（テスト用の簡易モック実装）
 * - audience.members の変更イベントで PresenceStore を更新
 */

import { getLogger } from "../lib/logger";
import { presenceStore } from "../stores/PresenceStore.svelte";

const logger = getLogger("FluidClient");

export interface Project {
    title: string;
    items: any[];
}

export class FluidClient {
    public containerId?: string;
    public isContainerConnected: boolean = false;
    public currentUser?: any;
    private project?: Project;

    constructor(opts?: any) {
        logger.info("FluidClient constructor called");

        // テストで渡される audience を取り扱い、membersChanged を PresenceStore に反映
        const audience = opts?.services?.audience;
        if (audience && typeof audience.on === "function") {
            const handle = () => {
                const members: Map<string, any> = audience.getMembers?.() ?? new Map();
                // Fluid由来のユーザーを全入れ替え（source: "fluid"）
                const updated = { ...presenceStore.users } as Record<string, any>;
                // 既存のfluidユーザーを消す
                Object.keys(updated).forEach(uid => {
                    if (updated[uid].source === "fluid") delete updated[uid];
                });
                // 追加
                for (const [id, m] of members.entries()) {
                    updated[id] = {
                        userId: m.user?.id ?? id,
                        userName: m.name ?? m.user?.name ?? id,
                        color: updated[id]?.color ?? "#888",
                        source: "fluid",
                    };
                }
                presenceStore.users = updated as any;
            };
            audience.on("membersChanged", handle);
        }
    }

    /**
     * Fluidクライアントを初期化
     */
    async initialize(): Promise<void> {
        try {
            logger.info("Initializing Fluid client...");
            this.containerId = `container-${Date.now()}`;
            this.isContainerConnected = true;
            this.currentUser = { id: "test-user", name: "Test User" };
            this.project = { title: "Default Project", items: [] };
            logger.info("Fluid client initialized successfully");
        } catch (error) {
            logger.error(`Failed to initialize Fluid client: ${error}`);
            throw error;
        }
    }

    getProject(): Project | undefined {
        return this.project;
    }

    getConnectionStateString(): string {
        return this.isContainerConnected ? "接続済み" : "未接続";
    }

    getDebugInfo(): any {
        return {
            containerId: this.containerId,
            isConnected: this.isContainerConnected,
            currentUser: this.currentUser,
            projectTitle: this.project?.title,
        };
    }

    cleanup(): void {
        logger.info("Cleaning up Fluid client...");
        this.isContainerConnected = false;
        this.containerId = undefined;
        this.currentUser = undefined;
        this.project = undefined;
    }
}
