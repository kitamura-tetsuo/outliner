const request = require("supertest");
const path = require("path");
const jwt = require("jsonwebtoken");

// モックの設定
let mockVerifyIdToken = jest.fn();
let mockContainerDocGet = jest.fn();

jest.mock("firebase-admin", () => {
    return {
        initializeApp: jest.fn(),
        credential: {
            cert: jest.fn(),
        },
        auth: () => ({
            verifyIdToken: (...args) => mockVerifyIdToken(...args),
        }),
        firestore: () => ({
            settings: jest.fn(),
            collection: jest.fn(name => {
                if (name === "containerUsers") {
                    return {
                        doc: jest.fn().mockReturnValue({
                            get: (...args) => mockContainerDocGet(...args),
                            set: jest.fn().mockResolvedValue({}),
                            update: jest.fn().mockResolvedValue({}),
                        }),
                        listCollections: jest.fn().mockResolvedValue([{ id: name }]),
                    };
                }
                // default userContainers behavior
                return {
                    doc: jest.fn().mockReturnValue({
                        get: jest.fn().mockResolvedValue({
                            exists: true,
                            data: () => ({
                                userId: "test-user-123",
                                defaultContainerId: "test-container-456",
                                createdAt: new Date(),
                            }),
                        }),
                        set: jest.fn().mockResolvedValue({}),
                        update: jest.fn().mockResolvedValue({}),
                    }),
                    listCollections: jest.fn().mockResolvedValue([{ id: name }]),
                };
            }),
            listCollections: jest.fn().mockResolvedValue([
                { id: "userContainers" },
                { id: "containerUsers" },
            ]),
        }),
        FieldValue: {
            serverTimestamp: jest.fn().mockReturnValue("server-timestamp"),
        },
    };
});

// Fluid Service Utils モック
jest.mock("@fluidframework/azure-service-utils", () => ({
    generateToken: jest.fn().mockImplementation((tenantId, key, scopes, containerId, user) => {
        return `mock-fluid-token-for-${user.id}-container-${containerId || "default"}`;
    }),
}));

// テスト前に.envファイルを読み込む
require("dotenv").config({ path: path.join(__dirname, "..", ".env.test") });

// テスト対象のサーバーをインポート
// 注意: このimport前にモックを設定する必要がある
const app = require("./auth-service-test-helper");

describe("認証サービスのテスト", () => {
    // テスト前の準備
    beforeAll(() => {
        // 環境変数の設定
        process.env.AZURE_TENANT_ID = "test-tenant-id";
        process.env.AZURE_FLUID_RELAY_ENDPOINT = "https://test-endpoint.fluidrelay.azure.com";
        process.env.AZURE_PRIMARY_KEY = "test-primary-key";
    });

    beforeEach(() => {
        mockVerifyIdToken.mockImplementation(idToken => {
            if (idToken === "valid-token") {
                return Promise.resolve({
                    uid: "test-user-123",
                    name: "Test User",
                    email: "testuser@example.com",
                });
            }
            if (idToken === "admin-token") {
                return Promise.resolve({
                    uid: "admin-user-123",
                    name: "Admin User",
                    email: "admin@example.com",
                    role: "admin",
                });
            }
            return Promise.reject(new Error("Invalid token"));
        });

        mockContainerDocGet.mockResolvedValue({
            exists: true,
            data: () => ({ accessibleUserIds: ["user1", "user2"] }),
        });
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    // テスト後のクリーンアップ
    afterAll(() => {
        jest.resetAllMocks();
    });

    // /api/fluid-token エンドポイントのテスト
    describe("POST /api/fluid-token", () => {
        test("有効なIDトークンでFluidトークンを取得できる", async () => {
            const response = await request(app)
                .post("/api/fluid-token")
                .send({ idToken: "valid-token" })
                .expect("Content-Type", /json/)
                .expect(200);

            expect(response.body).toHaveProperty("token");
            expect(response.body).toHaveProperty("user");
            expect(response.body).toHaveProperty("tenantId", "test-tenant-id");
            expect(response.body.user).toHaveProperty("id", "test-user-123");
        });

        test("無効なIDトークンで401エラーを返す", async () => {
            const response = await request(app)
                .post("/api/fluid-token")
                .send({ idToken: "invalid-token" })
                .expect("Content-Type", /json/)
                .expect(401);

            expect(response.body).toHaveProperty("error", "Authentication failed");
        });

        test("特定のコンテナIDを指定してトークンを取得できる", async () => {
            const response = await request(app)
                .post("/api/fluid-token")
                .send({
                    idToken: "valid-token",
                    containerId: "specific-container-id",
                })
                .expect("Content-Type", /json/)
                .expect(200);

            expect(response.body).toHaveProperty("token");
            expect(response.body).toHaveProperty("containerId", "specific-container-id");
            // モックTokenに対象コンテナIDが含まれていることを検証
            expect(response.body.token).toContain("specific-container-id");
        });
    });

    // /api/save-container エンドポイントのテスト
    describe("POST /api/save-container", () => {
        test("コンテナIDを保存できる", async () => {
            const response = await request(app)
                .post("/api/save-container")
                .send({
                    idToken: "valid-token",
                    containerId: "new-container-id",
                })
                .expect("Content-Type", /json/)
                .expect(200);

            expect(response.body).toHaveProperty("success", true);
            expect(response.body).toHaveProperty("operation");
            expect(response.body).toHaveProperty("containerId", "new-container-id");
        });

        test("コンテナIDなしで400エラーを返す", async () => {
            const response = await request(app)
                .post("/api/save-container")
                .send({ idToken: "valid-token" })
                .expect("Content-Type", /json/)
                .expect(400);

            expect(response.body).toHaveProperty("error", "Container ID is required");
        });

        test("無効なIDトークンで401エラーを返す", async () => {
            const response = await request(app)
                .post("/api/save-container")
                .send({
                    idToken: "invalid-token",
                    containerId: "some-container-id",
                })
                .expect("Content-Type", /json/)
                .expect(401);

            expect(response.body).toHaveProperty("error", "Authentication failed");
        });
    });

    // ヘルスチェックエンドポイントのテスト
    describe("GET /health", () => {
        test("ヘルスチェックエンドポイントが200を返す", async () => {
            const response = await request(app)
                .get("/health")
                .expect("Content-Type", /json/)
                .expect(200);

            expect(response.body).toHaveProperty("status", "OK");
            expect(response.body).toHaveProperty("timestamp");
        });
    });

    // デバッグ用エンドポイントのテスト (非本番環境のみ)
    describe("GET /debug/token-info", () => {
        test("トークン情報を取得できる", async () => {
            // テスト用のJWTトークンを生成
            const testToken = jwt.sign(
                { uid: "test-user", exp: Math.floor(Date.now() / 1000) + 3600 },
                "test-secret",
            );

            const response = await request(app)
                .get(`/debug/token-info?token=${testToken}`)
                .expect("Content-Type", /json/)
                .expect(200);

            expect(response.body).toHaveProperty("header");
            expect(response.body).toHaveProperty("payload");
            expect(response.body).toHaveProperty("expiresIn");
            expect(response.body.payload).toHaveProperty("uid", "test-user");
        });

        test("トークンなしで400エラーを返す", async () => {
            const response = await request(app)
                .get("/debug/token-info")
                .expect("Content-Type", /json/)
                .expect(400);

            expect(response.body).toHaveProperty("error", "トークンが必要です");
        });
    });

    // /api/get-container-users エンドポイントのテスト (管理者限定)
    describe("POST /api/get-container-users", () => {
        test("非管理者は403を受け取る", async () => {
            const res = await request(app)
                .post("/api/get-container-users")
                .send({ idToken: "valid-token", containerId: "cont-1" });

            expect(res.status).toBe(403);
            expect(res.body).toHaveProperty("error", "Admin privileges required");
        });

        test("管理者はユーザー一覧を取得できる", async () => {
            const res = await request(app)
                .post("/api/get-container-users")
                .send({ idToken: "admin-token", containerId: "cont-1" })
                .expect(200);

            expect(res.body).toHaveProperty("users");
            expect(Array.isArray(res.body.users)).toBe(true);
            expect(res.body.users).toEqual(["user1", "user2"]);
        });

        test("存在しないコンテナIDで404を返す", async () => {
            mockContainerDocGet.mockResolvedValueOnce({ exists: false });

            const res = await request(app)
                .post("/api/get-container-users")
                .send({ idToken: "admin-token", containerId: "missing" });

            expect(res.status).toBe(404);
            expect(res.body).toHaveProperty("error", "Container not found");
        });

        test("containerIdが無い場合400を返す", async () => {
            const res = await request(app)
                .post("/api/get-container-users")
                .send({ idToken: "admin-token" });

            expect(res.status).toBe(400);
            expect(res.body).toHaveProperty("error", "Container ID is required");
        });
    });
});
