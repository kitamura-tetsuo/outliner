// テスト用環境変数の設定
process.env.NODE_ENV = "test";
process.env.GCLOUD_PROJECT = "test-project-id";
process.env.FIREBASE_PROJECT_ID = "test-project-id";

// Azure Fluid Relay テスト用設定
process.env.AZURE_TENANT_ID = "test-tenant-id";
process.env.AZURE_ENDPOINT = "https://test.fluidrelay.azure.com";
process.env.AZURE_PRIMARY_KEY = "test-primary-key";
process.env.AZURE_SECONDARY_KEY = "test-secondary-key";
process.env.AZURE_ACTIVE_KEY = "primary";

// Firebase エミュレーター設定
process.env.FIRESTORE_EMULATOR_HOST = "localhost:8080";
process.env.FIREBASE_AUTH_EMULATOR_HOST = "localhost:9099";
process.env.ADMIN_DELETE_TOKEN = "test-admin-token";
