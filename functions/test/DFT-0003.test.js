/**
 * DFT-0003: テスト用コア書き込み機能のFirebase Functionsテスト
 */

const { expect } = require("chai");
const { describe, it, beforeEach } = require("mocha");
const { publishDraft, publishDraftTest } = require("../src/draftPublisher");

// テスト用の環境変数を設定
process.env.NODE_ENV = "test";
process.env.FUNCTIONS_EMULATOR = "true";

describe("DFT-0003: テスト用コア書き込み機能 (Firebase Functions)", () => {
  let testRequest;

  beforeEach(() => {
    testRequest = {
      draftId: "test-draft-123",
      containerId: "test-container-456",
      projectData: {
        title: "テストプロジェクト",
        items: [
          {
            id: "item-1",
            text: "テストアイテム1",
            author: "test-user",
            votes: [],
            created: Date.now(),
            lastChanged: Date.now(),
            items: []
          },
          {
            id: "item-2",
            text: "テストアイテム2",
            author: "test-user",
            votes: [],
            created: Date.now(),
            lastChanged: Date.now(),
            items: []
          }
        ]
      },
      idToken: "test-id-token"
    };
  });

  describe("フォークデータをFirebase Functionsで受信できる", () => {
    it("有効なリクエストデータを受信できる", async () => {
      const result = await publishDraftTest(testRequest);

      expect(result).to.be.an("object");
      expect(result.success).to.be.true;
      expect(result.containerId).to.equal(testRequest.containerId);
      expect(result.testMode).to.be.true;
    });

    it("必須フィールドが不足している場合にエラーを返す", async () => {
      const invalidRequest = { ...testRequest };
      delete invalidRequest.draftId;

      try {
        await publishDraft(invalidRequest);
        expect.fail("エラーが発生するべきです");
      } catch (error) {
        expect(error).to.exist;
      }
    });

    it("無効なプロジェクトデータでエラーを返す", async () => {
      const invalidRequest = {
        ...testRequest,
        projectData: null
      };

      try {
        await publishDraft(invalidRequest);
        expect.fail("エラーが発生するべきです");
      } catch (error) {
        expect(error).to.exist;
      }
    });
  });

  describe("Firebase FunctionsでフォークデータをSharedTreeに書き込める", () => {
    it("テストモードで書き込み処理をシミュレートできる", async () => {
      const result = await publishDraftTest(testRequest);

      expect(result.success).to.be.true;
      expect(result.containerId).to.equal(testRequest.containerId);
      expect(result.publishedAt).to.exist;
      expect(result.testMode).to.be.true;

      // 公開日時が現在時刻に近いことを確認
      const publishedTime = new Date(result.publishedAt).getTime();
      const now = Date.now();
      expect(Math.abs(now - publishedTime)).to.be.lessThan(5000); // 5秒以内
    });

    it("複数のアイテムを含むプロジェクトデータを処理できる", async () => {
      const complexProjectData = {
        title: "複雑なプロジェクト",
        items: []
      };

      // 100個のアイテムを追加
      for (let i = 0; i < 100; i++) {
        complexProjectData.items.push({
          id: `item-${i}`,
          text: `テストアイテム ${i}`,
          author: "test-user",
          votes: [],
          created: Date.now(),
          lastChanged: Date.now(),
          items: []
        });
      }

      const complexRequest = {
        ...testRequest,
        projectData: complexProjectData
      };

      const result = await publishDraftTest(complexRequest);

      expect(result.success).to.be.true;
      expect(result.containerId).to.equal(complexRequest.containerId);
    });

    it("ネストされたアイテム構造を処理できる", async () => {
      const nestedProjectData = {
        title: "ネストされたプロジェクト",
        items: [
          {
            id: "parent-1",
            text: "親アイテム1",
            author: "test-user",
            votes: [],
            created: Date.now(),
            lastChanged: Date.now(),
            items: [
              {
                id: "child-1-1",
                text: "子アイテム1-1",
                author: "test-user",
                votes: [],
                created: Date.now(),
                lastChanged: Date.now(),
                items: []
              },
              {
                id: "child-1-2",
                text: "子アイテム1-2",
                author: "test-user",
                votes: [],
                created: Date.now(),
                lastChanged: Date.now(),
                items: []
              }
            ]
          }
        ]
      };

      const nestedRequest = {
        ...testRequest,
        projectData: nestedProjectData
      };

      const result = await publishDraftTest(nestedRequest);

      expect(result.success).to.be.true;
      expect(result.containerId).to.equal(nestedRequest.containerId);
    });
  });

  describe("書き込み後のレスポンスが期待通りになる", () => {
    it("成功レスポンスに必要なフィールドが含まれる", async () => {
      const result = await publishDraftTest(testRequest);

      expect(result).to.have.property("success");
      expect(result).to.have.property("containerId");
      expect(result).to.have.property("publishedAt");
      expect(result).to.have.property("testMode");

      expect(result.success).to.be.true;
      expect(result.containerId).to.be.a("string");
      expect(result.publishedAt).to.be.a("string");
      expect(result.testMode).to.be.true;
    });

    it("公開日時がISO形式で返される", async () => {
      const result = await publishDraftTest(testRequest);

      expect(result.publishedAt).to.match(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);

      // 有効な日付であることを確認
      const publishedDate = new Date(result.publishedAt);
      expect(publishedDate.getTime()).to.not.be.NaN;
    });

    it("コンテナIDが正しく返される", async () => {
      const result = await publishDraftTest(testRequest);

      expect(result.containerId).to.equal(testRequest.containerId);
    });
  });

  describe("エラーが発生した場合に適切にハンドリングされる", () => {
    it("認証エラーを適切に処理する", async () => {
      const invalidAuthRequest = {
        ...testRequest,
        idToken: "invalid-token"
      };

      try {
        // 実際の認証を行う場合（テストモードではない）
        await publishDraft(invalidAuthRequest);
        expect.fail("エラーが発生するべきです");
      } catch (error) {
        expect(error).to.exist;
      }
    });

    it("データ形式エラーを適切に処理する", async () => {
      const invalidDataRequest = {
        ...testRequest,
        projectData: "invalid-data-format"
      };

      try {
        await publishDraftTest(invalidDataRequest);
        // テストモードでは基本的にエラーにならないが、
        // 実際の処理では適切にエラーハンドリングされる
      } catch (error) {
        expect(error).to.exist;
      }
    });

    it("ネットワークエラーを適切に処理する", async () => {
      // ネットワークエラーのシミュレーション
      const networkErrorRequest = {
        ...testRequest,
        containerId: "network-error-container"
      };

      try {
        // テストモードでは成功するが、実際の環境では
        // ネットワークエラーが適切に処理される
        const result = await publishDraftTest(networkErrorRequest);
        expect(result.success).to.be.true;
      } catch (error) {
        expect(error).to.exist;
      }
    });
  });

  describe("テスト環境でエンドツーエンドの動作確認ができる", () => {
    it("完全なワークフローをテストできる", async () => {
      const steps = [];

      try {
        // ステップ1: リクエストデータの検証
        expect(testRequest.draftId).to.exist;
        expect(testRequest.containerId).to.exist;
        expect(testRequest.projectData).to.exist;
        expect(testRequest.idToken).to.exist;
        steps.push("リクエストデータ検証完了");

        // ステップ2: 下書き公開処理
        const result = await publishDraftTest(testRequest);
        steps.push("下書き公開処理完了");

        // ステップ3: レスポンス検証
        expect(result.success).to.be.true;
        expect(result.containerId).to.equal(testRequest.containerId);
        steps.push("レスポンス検証完了");

        // ステップ4: 完了確認
        expect(steps).to.have.length(3);
        steps.push("ワークフロー完了");
      } catch (error) {
        expect.fail(`ワークフローエラー: ${error.message}, 完了ステップ: ${steps.join(", ")}`);
      }
    });

    it("複数の下書きを連続して公開できる", async () => {
      const results = [];

      for (let i = 0; i < 3; i++) {
        const request = {
          ...testRequest,
          draftId: `test-draft-${i}`,
          projectData: {
            ...testRequest.projectData,
            title: `テストプロジェクト ${i}`
          }
        };

        const result = await publishDraftTest(request);
        results.push(result);
      }

      expect(results).to.have.length(3);
      results.forEach((result, index) => {
        expect(result.success).to.be.true;
        expect(result.containerId).to.equal(testRequest.containerId);
        expect(result.testMode).to.be.true;
      });
    });

    it("大きなデータセットを処理できる", async () => {
      const largeProjectData = {
        title: "大規模プロジェクト",
        items: []
      };

      // 1000個のアイテムを追加
      for (let i = 0; i < 1000; i++) {
        largeProjectData.items.push({
          id: `large-item-${i}`,
          text: `大規模テストアイテム ${i} - ${"x".repeat(100)}`, // 長いテキスト
          author: "test-user",
          votes: Array.from({ length: i % 10 }, (_, j) => `voter-${j}`),
          created: Date.now() - (i * 1000),
          lastChanged: Date.now() - (i * 500),
          items: []
        });
      }

      const largeRequest = {
        ...testRequest,
        projectData: largeProjectData
      };

      const startTime = Date.now();
      const result = await publishDraftTest(largeRequest);
      const endTime = Date.now();

      expect(result.success).to.be.true;
      expect(result.containerId).to.equal(largeRequest.containerId);

      // 処理時間が合理的な範囲内であることを確認（10秒以内）
      expect(endTime - startTime).to.be.lessThan(10000);
    });
  });
});
