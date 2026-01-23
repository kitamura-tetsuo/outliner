import { SecretManagerServiceClient } from "@google-cloud/secret-manager";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export class SecretManager {
    private client: SecretManagerServiceClient;
    private cache: Map<string, string> = new Map();
    private projectId: string;

    constructor() {
        let keyFilename: string | undefined;

        if (process.env.FIREBASE_ADMIN_SDK_PATH) {
            // Replicate logic from firebase-init.ts to find the SDK file relative to src
            const sdkPath = path.resolve(__dirname, process.env.FIREBASE_ADMIN_SDK_PATH);
            if (fs.existsSync(sdkPath)) {
                keyFilename = sdkPath;
            }
        }

        this.client = new SecretManagerServiceClient({
            keyFilename,
        });

        this.projectId = process.env.FIREBASE_PROJECT_ID || process.env.GCLOUD_PROJECT || "outliner-d57b0";
    }

    async loadSecrets(secretNames: string[]): Promise<void> {
        for (const name of secretNames) {
            if (this.cache.has(name)) continue;
            try {
                const [version] = await this.client.accessSecretVersion({
                    name: `projects/${this.projectId}/secrets/${name}/versions/latest`,
                });

                const payload = version.payload?.data?.toString();
                if (payload) {
                    this.cache.set(name, payload);
                }
            } catch (error: any) {
                // Log but don't crash, allowing fallback to process.env if needed (though requirement says remove dotenvx for secrets)
                console.warn(`[SecretManager] Failed to load secret ${name}: ${error.message}`);
            }
        }
    }

    getSecret(name: string): string | undefined {
        return this.cache.get(name);
    }
}

export const secretManager = new SecretManager();
