# Gemini CLI Setup for Self-Hosted GitHub Actions Runner（←アーカイブ）

**📌 重要**: このドキュメントはアーカイブされました。Gemini CI ワークフローは無効化されており、現在self-hosted runnerは使用されていません。

**現在の状況**:
- ✅ GitHub-hosted runners に移行済み
- ✅ Gemini CI ワークフロー無効化（`.disabled` ファイルとして保存）
- ✅ 全てのCI/CD機能はGitHub-hosted runnersで継続稼働

---

**以前の情報**: このドキュメントでは、self-hosted GitHub Actions runnerでGemini CLIを永続的に利用可能にする方法を説明していました。

## 概要

Gemini CLIをGitHub Actionsで使用するには認証が必要です。self-hosted runnerでは以下の方法で認証を設定できます：

1. **方法1（推奨）**: ブラウザでのOAuth認証をランナーOSに直接設定
2. **方法2**: API Keyを使用（シンプル）
3. **方法3**: GitHub Secretsを使用してOAuth認証情報を復元

## 方法1: ブラウザでのOAuth認証（推奨）

### 手順

1. **self-hosted runnerマシンでセットアップスクリプトを実行**
   ```bash
   # rootユーザーまたはrunnerユーザーで実行
   cd /path/to/outliner
   ./scripts/setup-gemini-cli.sh
   ```

2. **ブラウザでの認証**
   - スクリプトがGemini CLIを起動します
   - ブラウザが開くので、Googleアカウントでログイン
   - 認証完了後、CLIで `exit` と入力して終了

3. **認証情報の確認**
   - 認証が完了すると `~/.gemini/oauth_creds.json` が作成される
   - ファイル権限は自動的に600に設定される

4. **動作確認**
   ```bash
   gemini --version
   # バージョンが表示されれば成功
   ```

### メリット

- 最も確実で安全な認証方法
- 60 RPM / 1,000 RPD の無料枠を利用可能
- 設定が一度だけで済む
- GitHub Secretsを使用しないためセキュリティリスクが低い
- ワークフロー実行時間が短縮される

## 方法2: API Keyを使用（シンプル）

### 手順

1. **API Keyを生成**
   - [Google AI Studio](https://aistudio.google.com/apikey) にアクセス
   - API Keyを生成

2. **GitHub Secretsに登録**
   - GitHubリポジトリの Settings > Secrets and variables > Actions
   - `GEMINI_API_KEY` という名前でAPI Keyを登録

3. **ワークフローで環境変数として設定**
   - 既存のワークフローファイルで自動的に設定される

### メリット

- 設定が簡単
- リモートから設定可能
- CI環境でも確実に動作

### デメリット

- 無料枠が100 requests/day と制限される
- API Keyの管理が必要

## 方法3: GitHub Secretsを使用してOAuth認証情報を復元

### 手順

1. **ローカルマシンでOAuth認証**
   ```bash
   # ローカルマシンで実行
   npm install -g @google/generative-ai-cli
   gemini auth login
   ```

2. **認証情報をBase64エンコード**
   ```bash
   # macOS/Linux
   base64 -i ~/.gemini/oauth_creds.json

   # Windows (PowerShell)
   [Convert]::ToBase64String([IO.File]::ReadAllBytes("$env:USERPROFILE\.gemini\oauth_creds.json"))
   ```

3. **GitHub Secretsに登録**
   - GitHubリポジトリの Settings > Secrets and variables > Actions
   - `GEMINI_OAUTH_B64` という名前でBase64エンコードした内容を登録

4. **ワークフローで自動復元**
   - 既存のワークフローファイルに設定済み
   - 実行時に自動的に `~/.gemini/oauth_creds.json` が復元される

### メリット

- リモートから設定可能
- 複数のrunnerで同じ認証情報を使用可能

### デメリット

- GitHub Secretsのサイズ制限（64KB）
- ワークフロー実行時に毎回復元処理が必要

## GitHub MCP サーバーの設定

Gemini CLIにGitHub MCP サーバーを追加することで、GitHub操作を自動化できます。

### 必要な設定

1. **GitHub Personal Access Token (PAT) の作成**
   - GitHub > Settings > Developer settings > Personal access tokens > Tokens (classic)
   - 必要な権限: `repo`, `issues`, `pull_requests`

2. **GitHub Secretsに登録**
   - GitHubリポジトリの Settings > Secrets and variables > Actions
   - `GEMINI_GITHUB_PAT` という名前でPATを登録
   - 注意: Secret名は `GITHUB_` で始めることができません

3. **自動設定**
   - `scripts/setup-gemini-cli.sh` を実行すると自動的にGitHub MCP サーバーが設定される
   - `~/.gemini/settings.json` にMCP サーバー設定が追加される

## 現在の設定状況

以下のワークフローファイルにGemini CLI認証設定が追加されています：

- `.github/workflows/test.yml`
- `.github/workflows/deploy.yml`
- `.github/workflows/pr-issue-link.yml` (新規追加)

### PR-Issue自動リンク機能

`.github/workflows/pr-issue-link.yml` は以下の機能を提供します：

- PRが作成されたときに自動実行（dependabotを除く）
- Gemini CLIとGitHub MCP サーバーを使用してPRに関連するissueを検索
- 関連するissueが見つかった場合、PR説明文に適切なキーワードを追加
- GitHubの「Development」セクションに自動的にissueがリンクされる
- キーワード、参照番号、機能の類似性に基づいて関連性を判定

**リンクキーワード:**

- `Fixes #issue_number` - PRがマージされたときにissueを自動クローズ
- `Closes #issue_number` - PRがマージされたときにissueを自動クローズ
- `Related to #issue_number` - 関連付けのみ（issueはクローズされない）

### 認証の優先順位

各ワークフローは以下の順序で認証を試行します：

1. `$HOME/.gemini/oauth_creds.json` の存在確認（方法1）
2. `GEMINI_OAUTH_B64` secretからの復元（方法3）
3. `GEMINI_API_KEY` 環境変数の確認（方法2）
4. 認証情報が見つからない場合は警告を表示して継続

## トラブルシューティング

### 認証エラー (401)

```bash
# 認証情報をリセット（方法1の場合）
rm -f ~/.gemini/oauth_creds.json
./scripts/setup-gemini-cli.sh

# または手動でGemini CLIを実行
gemini
```

### Credentials not found

```bash
# ファイルの存在と権限を確認
ls -la ~/.gemini/oauth_creds.json
chmod 600 ~/.gemini/oauth_creds.json
```

### CLI が毎回ブラウザを開く

- 認証ファイルが正しく復元されていない
- ファイル内容に改行や空白の混入がないか確認

## 使用制限

- OAuth認証での制限: 60 RPM / 1,000 RPD
- 無料枠内でCI環境での使用が可能

## セキュリティ考慮事項

- 認証ファイルの権限は必ず600に設定
- GitHub Secretsを使用する場合は、Base64エンコードした内容のみを保存
- 定期的な認証情報のローテーションを推奨

## 参考リンク

- [Google Generative AI CLI](https://www.npmjs.com/package/@google/generative-ai-cli)
- [GitHub Actions Secrets](https://docs.github.com/en/actions/security-guides/encrypted-secrets)
