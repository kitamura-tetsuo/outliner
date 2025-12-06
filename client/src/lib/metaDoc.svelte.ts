// Metadata Y.Doc module for persisting container metadata (titles, etc.) locally
import { IndexeddbPersistence } from "y-indexeddb";
import * as Y from "yjs";

// Singleton Y.Doc instance for container metadata
export const metaDoc = new Y.Doc();

// IndexedDB persistence for local-only storage
// Use a separate database name from container Y.Docs to avoid conflicts
const persistence = new IndexeddbPersistence("outliner-meta", metaDoc);

// Y.Map structure for storing container metadata
export const containersMap = metaDoc.getMap("containers");

// Type for container metadata
interface ContainerMetadata {
    title: string;
    lastOpenedAt?: number;
    isPublic?: boolean;
    publicAccessToken?: string;
}

/**
 * Get container title from metadata Y.Doc
 * @param containerId - The container ID to look up
 * @returns The container title or empty string if not found
 */
export function getContainerTitleFromMetaDoc(containerId: string): string {
    const containerData = containersMap.get(containerId) as ContainerMetadata | undefined;
    return containerData?.title || "";
}

/**
 * Set container title in metadata Y.Doc
 * @param containerId - The container ID to update
 * @param title - The title to set
 */
export function setContainerTitleInMetaDoc(containerId: string, title: string): void {
    containersMap.set(containerId, { title } as ContainerMetadata);
}

/**
 * Update the last opened timestamp for a container
 * @param containerId - The container ID to update
 */
export function updateLastOpenedAt(containerId: string): void {
    const containerData = containersMap.get(containerId) as ContainerMetadata | undefined;
    const currentTitle = containerData?.title || "";
    containersMap.set(containerId, {
        title: currentTitle,
        lastOpenedAt: Date.now(),
    } as ContainerMetadata);
}

/**
 * Get last opened timestamp for a container
 * @param containerId - The container ID to look up
 * @returns The timestamp or undefined if not found
 */
export function getLastOpenedAt(containerId: string): number | undefined {
    const containerData = containersMap.get(containerId) as ContainerMetadata | undefined;
    return containerData?.lastOpenedAt;
}

/**
 * Generate a cryptographically secure random token for public access
 * @param length - Token length (default: 32)
 * @returns Random token string
 */
function generatePublicToken(length: number = 32): string {
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    let result = "";
    const randomValues = new Uint8Array(length);
    crypto.getRandomValues(randomValues);
    for (let i = 0; i < length; i++) {
        result += chars[randomValues[i] % chars.length];
    }
    return result;
}

/**
 * Toggle public access for a container
 * @param containerId - The container ID to update
 * @param isPublic - Whether the project should be public
 * @returns The public access token if making public, undefined if making private
 */
export function togglePublicAccess(containerId: string, isPublic: boolean): string | undefined {
    if (isPublic) {
        const token = generatePublicToken(32);
        const containerData = containersMap.get(containerId) as ContainerMetadata | undefined;
        const currentTitle = containerData?.title || "";
        containersMap.set(containerId, {
            ...(containerData || {}),
            title: currentTitle,
            isPublic: true,
            publicAccessToken: token,
        } as ContainerMetadata);
        return token;
    } else {
        const containerData = containersMap.get(containerId) as ContainerMetadata | undefined;
        const currentTitle = containerData?.title || "";
        const currentToken = containerData?.publicAccessToken;
        containersMap.set(containerId, {
            ...(containerData || {}),
            title: currentTitle,
            isPublic: false,
            publicAccessToken: undefined,
            previousToken: currentToken, // Keep previous token for reference
        } as any);
        return undefined;
    }
}

/**
 * Check if a container is public
 * @param containerId - The container ID to check
 * @returns True if public, false otherwise
 */
export function isContainerPublic(containerId: string): boolean {
    const containerData = containersMap.get(containerId) as ContainerMetadata | undefined;
    return containerData?.isPublic === true;
}

/**
 * Get public access token for a container
 * @param containerId - The container ID
 * @returns The public access token or undefined if not public
 */
export function getPublicAccessToken(containerId: string): string | undefined {
    const containerData = containersMap.get(containerId) as ContainerMetadata | undefined;
    return containerData?.publicAccessToken;
}

/**
 * Verify if a token matches the stored public access token
 * @param containerId - The container ID
 * @param token - The token to verify
 * @returns True if token is valid, false otherwise
 */
export function verifyPublicAccessToken(containerId: string, token: string): boolean {
    const storedToken = getPublicAccessToken(containerId);
    return storedToken === token;
}

// Log initialization status
if (typeof window !== "undefined") {
    console.log("[metaDoc] Initialized metadata Y.Doc with IndexedDB persistence");

    // Optional: Log when IndexedDB data is loaded
    persistence.once("synced", () => {
        console.log("[metaDoc] IndexedDB data loaded");
    });
}

// Expose metaDoc functions to window for E2E testing
if (typeof window !== "undefined") {
    const isTestEnv = import.meta.env.MODE === "test"
        || process.env.NODE_ENV === "test"
        || import.meta.env.VITE_IS_TEST === "true"
        || window.location.hostname === "localhost";

    if (isTestEnv) {
        (window as Window & typeof globalThis & {
            __META_DOC_MODULE__?: {
                setContainerTitleInMetaDoc: typeof setContainerTitleInMetaDoc;
                getContainerTitleFromMetaDoc: typeof getContainerTitleFromMetaDoc;
                updateLastOpenedAt: typeof updateLastOpenedAt;
                getLastOpenedAt: typeof getLastOpenedAt;
                togglePublicAccess: typeof togglePublicAccess;
                isContainerPublic: typeof isContainerPublic;
                getPublicAccessToken: typeof getPublicAccessToken;
                verifyPublicAccessToken: typeof verifyPublicAccessToken;
            };
        }).__META_DOC_MODULE__ = {
            setContainerTitleInMetaDoc,
            getContainerTitleFromMetaDoc,
            updateLastOpenedAt,
            getLastOpenedAt,
            togglePublicAccess,
            isContainerPublic,
            getPublicAccessToken,
            verifyPublicAccessToken,
        };
    }
}
