// TypeScriptの型情報を確認するためのファイル
// このファイルは実行するためではなく、型チェックのためだけに使用します

// 型情報のインポートを試みる
import type { ContainerSchema } from "@fluidframework/fluid-static";

// 型が存在するかをチェック
const testSchema: ContainerSchema = {
  initialObjects: {
    testObject: {} as any
  }
};

// パッケージが存在するかを確認
try {
  // 実行時インポート（型だけでなく値もインポート）
  import('@fluidframework/fluid-static')
    .then(module => {
      // TypeScriptはこのファイルをトランスパイルするだけで実行はしないため、
      // このコードは実際には実行されません
      console.log('Module exists:', Object.keys(module));
    });
} catch(e) {
  console.log('Import error:', e);
}
