#!/usr/bin/env node

/**
 * 本番環境API テストスクリプト
 */

const https = require('https');

function makeRequest(url, method = 'GET', data = null) {
    return new Promise((resolve, reject) => {
        const options = {
            method: method,
            headers: {
                'Content-Type': 'application/json',
                'User-Agent': 'Node.js Test Client'
            }
        };

        const req = https.request(url, options, (res) => {
            let body = '';
            res.on('data', (chunk) => {
                body += chunk;
            });
            res.on('end', () => {
                try {
                    const jsonBody = JSON.parse(body);
                    resolve({
                        statusCode: res.statusCode,
                        headers: res.headers,
                        body: jsonBody
                    });
                } catch (e) {
                    resolve({
                        statusCode: res.statusCode,
                        headers: res.headers,
                        body: body
                    });
                }
            });
        });

        req.on('error', (error) => {
            reject(error);
        });

        if (data) {
            req.write(JSON.stringify(data));
        }

        req.end();
    });
}

async function testProductionAPI() {
    console.log('=== 本番環境API テスト ===\n');

    try {
        // 1. ヘルスチェック
        console.log('1. ヘルスチェック...');
        const healthResponse = await makeRequest('https://outliner-d57b0.web.app/health');
        console.log(`✓ ステータス: ${healthResponse.statusCode}`);
        console.log(`✓ レスポンス:`, healthResponse.body);
        console.log('');

        // 2. スケジュール公開テスト（簡易版）
        console.log('2. スケジュール公開テスト...');
        const scheduleData = {
            draftId: 'test-draft-' + Date.now(),
            containerId: 'test-container-' + Date.now(),
            scheduleTime: Date.now() + 60000, // 1分後
            projectData: {
                title: '本番環境テストプロジェクト',
                items: [
                    {
                        id: 'test-item-1',
                        text: '本番環境でのテストアイテム',
                        author: 'test-user',
                        votes: [],
                        created: Date.now(),
                        lastChanged: Date.now(),
                        items: []
                    }
                ],
                created: Date.now(),
                lastModified: Date.now()
            },
            authorId: 'test-user-production'
        };

        const scheduleResponse = await makeRequest(
            'https://outliner-d57b0.web.app/api/publish-draft-scheduled',
            'POST',
            scheduleData
        );

        console.log(`✓ ステータス: ${scheduleResponse.statusCode}`);
        console.log(`✓ レスポンス:`, scheduleResponse.body);
        console.log('');

        // 3. Cloud Tasksキューの状態確認
        console.log('3. Cloud Tasksキューの状態確認...');
        // 注意: この機能は認証が必要なため、ここでは省略

        console.log('=== テスト完了 ===');
        return true;

    } catch (error) {
        console.error('=== テスト失敗 ===');
        console.error('エラー:', error.message);
        return false;
    }
}

// スクリプトが直接実行された場合のみテストを実行
if (require.main === module) {
    testProductionAPI()
        .then(success => {
            process.exit(success ? 0 : 1);
        })
        .catch(error => {
            console.error('予期しないエラー:', error);
            process.exit(1);
        });
}

module.exports = { testProductionAPI };
