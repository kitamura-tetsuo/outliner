// Yjs Awareness を使ったプレゼンス管理
import { Awareness } from "y-protocols/awareness";
import type { Doc as YDoc } from "yjs";
import { colorForUser, presenceStore } from "../stores/PresenceStore.svelte";

export interface CursorPosition {
    itemId: string;
    offset: number;
}

export interface SelectionRange {
    startItemId: string;
    startOffset: number;
    endItemId: string;
    endOffset: number;
}

export interface UserPresence {
    userId: string;
    userName: string;
    color: string;
    cursor?: CursorPosition;
    selection?: SelectionRange;
    lastSeen: number;
}

/**
 * Yjs Awareness を使ったプレゼンス管理クラス
 */
export class YjsPresenceManager {
    private awareness: Awareness;
    private currentUserId: string;
    private currentUserName: string;
    private currentUserColor: string;
    private changeListeners: Set<(states: Map<number, UserPresence>) => void> = new Set();

    constructor(doc: YDoc, userId: string, userName: string) {
        this.awareness = new Awareness(doc);
        this.currentUserId = userId;
        this.currentUserName = userName;
        this.currentUserColor = colorForUser(userId);

        // 自分のユーザー情報を設定
        this.awareness.setLocalStateField("user", {
            userId: this.currentUserId,
            userName: this.currentUserName,
            color: this.currentUserColor,
            lastSeen: Date.now(),
        });

        // Awareness の変更を監視
        this.awareness.on("change", this.handleAwarenessChange.bind(this));
    }

    /**
     * カーソル位置を更新
     */
    updateCursor(itemId: string, offset: number) {
        this.awareness.setLocalStateField("cursor", {
            itemId,
            offset,
        });
        this.awareness.setLocalStateField("lastSeen", Date.now());
    }

    /**
     * 選択範囲を更新
     */
    updateSelection(startItemId: string, startOffset: number, endItemId: string, endOffset: number) {
        this.awareness.setLocalStateField("selection", {
            startItemId,
            startOffset,
            endItemId,
            endOffset,
        });
        this.awareness.setLocalStateField("lastSeen", Date.now());
    }

    /**
     * カーソル情報をクリア
     */
    clearCursor() {
        this.awareness.setLocalStateField("cursor", null);
        this.awareness.setLocalStateField("lastSeen", Date.now());
    }

    /**
     * 選択範囲をクリア
     */
    clearSelection() {
        this.awareness.setLocalStateField("selection", null);
        this.awareness.setLocalStateField("lastSeen", Date.now());
    }

    /**
     * 全ユーザーのプレゼンス状態を取得
     */
    getAllPresence(): Map<number, UserPresence> {
        const states = new Map<number, UserPresence>();

        this.awareness.getStates().forEach((state, clientId) => {
            if (state.user) {
                states.set(clientId, {
                    userId: state.user.userId,
                    userName: state.user.userName,
                    color: state.user.color,
                    cursor: state.cursor,
                    selection: state.selection,
                    lastSeen: state.lastSeen || Date.now(),
                });
            }
        });

        return states;
    }

    /**
     * 特定ユーザーのプレゼンス状態を取得
     */
    getUserPresence(userId: string): UserPresence | null {
        const states = this.getAllPresence();
        for (const [, presence] of states) {
            if (presence.userId === userId) {
                return presence;
            }
        }
        return null;
    }

    /**
     * プレゼンス変更リスナーを追加
     */
    onPresenceChange(listener: (states: Map<number, UserPresence>) => void) {
        this.changeListeners.add(listener);

        // 現在の状態を即座に通知
        listener(this.getAllPresence());

        return () => {
            this.changeListeners.delete(listener);
        };
    }

    /**
     * Awareness変更ハンドラー
     */
    private handleAwarenessChange() {
        const states = this.getAllPresence();

        // PresenceStoreを更新
        presenceStore.updateYjsPresence(states);

        this.changeListeners.forEach(listener => {
            try {
                listener(states);
            } catch (error) {
                console.error("Error in presence change listener:", error);
            }
        });
    }

    /**
     * リソースをクリーンアップ
     */
    destroy() {
        this.awareness.off("change", this.handleAwarenessChange);
        this.changeListeners.clear();
        this.awareness.destroy();
    }

    /**
     * Awareness インスタンスを取得（外部連携用）
     */
    getAwareness(): Awareness {
        return this.awareness;
    }
}
