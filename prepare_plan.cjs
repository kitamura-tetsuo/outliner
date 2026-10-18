const fs = require('fs');

const extractLine = (file, lineStr) => {
    const lines = fs.readFileSync(file, 'utf8').split('\n');
    return lines.find(l => l.includes(lineStr));
}

console.log("ENG Dep:");
console.log(extractLine('docs/user-manual/index.md', '- **Dependency-aware duplication:**'));
console.log("ENG ObjMgr1:");
console.log(extractLine('docs/user-manual/index.md', '- **Object Manager:** Manage Grids, Tables, and Schedules centrally.'));
console.log("ENG ObjMgr2:");
console.log(extractLine('docs/user-manual/index.md', '- **Object Manager:** open it from the sidebar to browse'));

console.log("JA Dep:");
console.log(extractLine('docs/ja/user-manual/index.md', '- **依存関係を考慮した複製 (Dependency-aware duplication):**'));
console.log("JA ObjMgr1:");
console.log(extractLine('docs/ja/user-manual/index.md', '- **Object Manager:** グリッド、テーブル、スケジュールを一元管理します。'));
console.log("JA ObjMgr2:");
console.log(extractLine('docs/ja/user-manual/index.md', '- **オブジェクトマネージャー (Object Manager):** サイドバーから開いて、このプロジェクト内のすべて'));
