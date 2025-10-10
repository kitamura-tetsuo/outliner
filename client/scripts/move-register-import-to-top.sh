#!/bin/bash

# 全てのe2eテストファイルで registerAfterEachSnapshot のインポートを先頭に移動するスクリプト

set -e

cd "$(dirname "$0")/.."

# e2eディレクトリ内の全ての.spec.tsファイルを検索
find e2e -name "*.spec.ts" | while read -r file; do
    # registerAfterEachSnapshot のインポートが含まれているか確認
    if grep -q "registerAfterEachSnapshot" "$file"; then
        echo "Processing: $file"
        
        # 一時ファイルを作成
        temp_file=$(mktemp)
        
        # registerAfterEachSnapshot のインポート行を抽出
        import_line=$(grep "registerAfterEachSnapshot" "$file" | head -1)
        
        # registerAfterEachSnapshot のインポート行を削除
        grep -v "registerAfterEachSnapshot" "$file" > "$temp_file"
        
        # 新しいファイルを作成: インポート行を先頭に追加
        {
            echo "$import_line"
            cat "$temp_file"
        } > "$file"
        
        rm "$temp_file"
        echo "  ✓ Moved import to top"
    fi
done

echo ""
echo "✓ All files processed"

