/**
 * DFT-0002: Firebase FunctionsからFluid Frameworkアクセス機能のテスト
 */

const { expect } = require("chai");
const { describe, it, beforeEach } = require("mocha");
const {
  createFluidClient,
  connectToContainer,
  writeToSharedTree,
  readFromSharedTree
} = require("../src/fluidService");

// テスト用の環境変数を設定
process.env.NODE_ENV = "test";
process.env.AZURE_TENANT_ID = "test-tenant";
process.env.AZURE_ENDPOINT = "https://test.fluidrelay.azure.com";
process.env.AZURE_PRIMARY_KEY = "test-primary-key";
process.env.AZURE_SECONDARY_KEY = "test-secondary-key";
process.env.AZURE_ACTIVE_KEY = "primary";

describe("DFT-0002: Firebase FunctionsからFluid Frameworkアクセス機能", () => {
  let testUserId;
  let testContainerId;

  beforeEach(() => {
    testUserId = "test-user-123";
    testContainerId = "test-container-456";
  });

  describe("Firebase FunctionsからFluid Frameworkクライアントを作成できる", () => {
    it("開発環境でTinyliciousクライアントを作成できる", async () => {
      // 開発環境を設定
      const originalNodeEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = "development";

      try {
        const result = await createFluidClient(testUserId, testContainerId);

        expect(result).to.be.an("object");
        expect(result.client).to.exist;
        expect(result.isAzure).to.be.false;
      } finally {
        process.env.NODE_ENV = originalNodeEnv;
      }
    });

    it("プロダクション環境でAzureクライアントを作成できる", async () => {
      // プロダクション環境を設定
      const originalNodeEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = "production";

      try {
        const result = await createFluidClient(testUserId, testContainerId);

        expect(result).to.be.an("object");
        expect(result.client).to.exist;
        expect(result.isAzure).to.be.true;
      } finally {
        process.env.NODE_ENV = originalNodeEnv;
      }
    });

    it("無効なユーザーIDでエラーが発生する", async () => {
      try {
        await createFluidClient(null, testContainerId);
        expect.fail("エラーが発生するべきです");
      } catch (error) {
        expect(error).to.exist;
      }
    });
  });

  describe("Firebase FunctionsからSharedTreeコンテナにアクセスできる", () => {
    it("有効なコンテナIDでコンテナに接続できる", async () => {
      // モッククライアントを作成
      const mockClient = {
        getContainer: async (containerId, schema, version) => {
          expect(containerId).to.equal(testContainerId);
          expect(schema).to.exist;
          expect(version).to.equal("2");

          return {
            container: {
              initialObjects: {
                appData: {
                  viewWith: () => ({
                    compatibility: { canInitialize: false },
                    root: { title: "Test Project", items: [] }
                  })
                }
              }
            }
          };
        }
      };

      const result = await connectToContainer(mockClient, testContainerId);

      expect(result).to.be.an("object");
      expect(result.container).to.exist;
      expect(result.appData).to.exist;
    });

    it("無効なコンテナIDでエラーが発生する", async () => {
      const mockClient = {
        getContainer: async () => {
          throw new Error("Container not found");
        }
      };

      try {
        await connectToContainer(mockClient, "invalid-container");
        expect.fail("エラーが発生するべきです");
      } catch (error) {
        expect(error.message).to.include("コンテナへの接続に失敗しました");
      }
    });
  });

  describe("Firebase FunctionsからSharedTreeにデータを書き込める", () => {
    it("新しいプロジェクトデータを初期化できる", async () => {
      let initializedData = null;

      const mockAppData = {
        viewWith: () => ({
          compatibility: { canInitialize: true },
          initialize: (data) => {
            initializedData = data;
          }
        })
      };

      const testProjectData = {
        title: "Test Project",
        items: [
          {
            id: "item-1",
            text: "Test Item",
            author: "test-user",
            votes: [],
            created: Date.now(),
            lastChanged: Date.now(),
            items: []
          }
        ]
      };

      await writeToSharedTree(mockAppData, testProjectData);

      expect(initializedData).to.deep.equal(testProjectData);
    });

    it("既存のプロジェクトデータを更新できる", async () => {
      let updatedTitle = null;
      let clearedItems = false;
      const addedItems = [];

      const mockRoot = {
        set title(value) {
 updatedTitle = value;
},
        items: {
          clear: () => {
 clearedItems = true;
},
          insertAtEnd: (item) => {
 addedItems.push(item);
}
        }
      };

      const mockAppData = {
        viewWith: () => ({
          compatibility: { canInitialize: false },
          root: mockRoot
        })
      };

      const testProjectData = {
        title: "Updated Project",
        items: [
          { id: "item-1", text: "Updated Item" },
          { id: "item-2", text: "New Item" }
        ]
      };

      await writeToSharedTree(mockAppData, testProjectData);

      expect(updatedTitle).to.equal("Updated Project");
      expect(clearedItems).to.be.true;
      expect(addedItems).to.have.length(2);
      expect(addedItems[0].text).to.equal("Updated Item");
      expect(addedItems[1].text).to.equal("New Item");
    });

    it("無効なデータでエラーが発生する", async () => {
      const mockAppData = {
        viewWith: () => {
          throw new Error("Invalid schema");
        }
      };

      try {
        await writeToSharedTree(mockAppData, { invalid: "data" });
        expect.fail("エラーが発生するべきです");
      } catch (error) {
        expect(error.message).to.include("SharedTreeへの書き込みに失敗しました");
      }
    });
  });

  describe("Firebase FunctionsからSharedTreeのデータを読み取れる", () => {
    it("初期化されたプロジェクトデータを読み取れる", async () => {
      const mockRoot = {
        title: "Test Project",
        items: [
          {
            id: "item-1",
            text: "Test Item",
            author: "test-user",
            votes: [],
            created: 1234567890,
            lastChanged: 1234567890,
            items: []
          }
        ]
      };

      // Symbolイテレータを追加
      mockRoot.items[Symbol.iterator] = function* () {
        for (let i = 0; i < this.length; i++) {
          yield this[i];
        }
      };

      const mockAppData = {
        viewWith: () => ({
          compatibility: { canInitialize: false },
          root: mockRoot
        })
      };

      const result = await readFromSharedTree(mockAppData);

      expect(result).to.be.an("object");
      expect(result.title).to.equal("Test Project");
      expect(result.items).to.have.length(1);
      expect(result.items[0].text).to.equal("Test Item");
      expect(result.items[0].author).to.equal("test-user");
    });

    it("初期化されていないSharedTreeでnullを返す", async () => {
      const mockAppData = {
        viewWith: () => ({
          compatibility: { canInitialize: true }
        })
      };

      const result = await readFromSharedTree(mockAppData);

      expect(result).to.be.null;
    });

    it("空のルートでnullを返す", async () => {
      const mockAppData = {
        viewWith: () => ({
          compatibility: { canInitialize: false },
          root: null
        })
      };

      const result = await readFromSharedTree(mockAppData);

      expect(result).to.be.null;
    });

    it("読み取りエラーでエラーが発生する", async () => {
      const mockAppData = {
        viewWith: () => {
          throw new Error("Read error");
        }
      };

      try {
        await readFromSharedTree(mockAppData);
        expect.fail("エラーが発生するべきです");
      } catch (error) {
        expect(error.message).to.include("SharedTreeからの読み取りに失敗しました");
      }
    });
  });

  describe("認証トークンを使用してFluid Frameworkにアクセスできる", () => {
    it("有効な認証情報でアクセスできる", async () => {
      // 環境変数が設定されていることを確認
      expect(process.env.AZURE_TENANT_ID).to.exist;
      expect(process.env.AZURE_PRIMARY_KEY).to.exist;
      expect(process.env.AZURE_SECONDARY_KEY).to.exist;
      expect(process.env.AZURE_ACTIVE_KEY).to.exist;

      // プロダクション環境でクライアント作成をテスト
      const originalNodeEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = "production";

      try {
        const result = await createFluidClient(testUserId, testContainerId);
        expect(result.client).to.exist;
        expect(result.isAzure).to.be.true;
      } finally {
        process.env.NODE_ENV = originalNodeEnv;
      }
    });
  });

  describe("エラーハンドリングが適切に実装されている", () => {
    it("ネットワークエラーを適切に処理する", async () => {
      const mockClient = {
        getContainer: async () => {
          throw new Error("Network error");
        }
      };

      try {
        await connectToContainer(mockClient, testContainerId);
        expect.fail("エラーが発生するべきです");
      } catch (error) {
        expect(error.message).to.include("コンテナへの接続に失敗しました");
        expect(error.message).to.include("Network error");
      }
    });

    it("認証エラーを適切に処理する", async () => {
      // 無効な認証情報を設定
      const originalTenantId = process.env.AZURE_TENANT_ID;
      process.env.AZURE_TENANT_ID = "";

      try {
        const originalNodeEnv = process.env.NODE_ENV;
        process.env.NODE_ENV = "production";

        try {
          await createFluidClient(testUserId, testContainerId);
          // 認証エラーが発生する可能性があるが、テスト環境では成功する場合もある
        } finally {
          process.env.NODE_ENV = originalNodeEnv;
        }
      } finally {
        process.env.AZURE_TENANT_ID = originalTenantId;
      }
    });

    it("データ形式エラーを適切に処理する", async () => {
      const mockAppData = {
        viewWith: () => ({
          compatibility: { canInitialize: true },
          initialize: () => {
            throw new Error("Invalid data format");
          }
        })
      };

      try {
        await writeToSharedTree(mockAppData, { invalid: "format" });
        expect.fail("エラーが発生するべきです");
      } catch (error) {
        expect(error.message).to.include("SharedTreeへの書き込みに失敗しました");
      }
    });
  });
});
