const fs = require('fs');

const engOldDep = `- **Dependency-aware duplication:** Grid, Table, and Schedule copies can include referenced, referencing, or all connected objects recursively—a duplicated Schedule brings along the Tables it reads and writes. The confirmation previews the object count and omitted references; Table copies can include or omit their rows, cross-project Schedule copies start disabled, and cross-project copies clear excluded links.`;

const engNewDep = `- **Dependency-aware duplication:** Grid, Table, Schedule, and Calendar copies can include referenced, referencing, or all connected objects recursively—a duplicated Schedule brings along the Tables it reads and writes, and a duplicated Calendar brings along every Table its query reads. The confirmation previews the object count and omitted references; Table copies can include or omit their rows, cross-project Schedule copies start disabled, and cross-project copies clear excluded links (a Calendar's query included).`;

const engOldObjMgr1 = `- **Object Manager:** Manage Grids, Tables, and Schedules centrally.`;

const engNewObjMgr1 = `- **Object Manager:** Manage Grids, Tables, Schedules, and Calendars centrally.`;

const engOldObjMgr2 = `- **Object Manager:** open it from the sidebar to browse every Grid, Table and Schedule in this project. Each Grid row lists the Pages it is directly placed on — click one to jump straight to that block. Click a name to rename it in place; select several objects and use the compact toolbar's literal find/replace, whose before/after preview opens as a popover so the object list never shifts; delete is undoable with Ctrl/Cmd+Z. "Select related" expands the current selection over the same dependency graph duplication uses — Dependencies, Dependents, or All connected — so selecting one Table and choosing Dependents adds every Grid and Schedule that reads it. "Duplicate selected" then copies exactly that checked set — never a recomputed scope — into this or another project, with the same undo/redo as the rest of the toolbar; an individual Grid/Table/Schedule page's own Duplicate button opens Object Manager with it preselected instead of asking for a scope itself. Use "Place on Page…" or drag a Grid row onto a sidebar Page to add another placement of that existing object without duplicating its definition.`;

const engNewObjMgr2 = `- **Object Manager:** open it from the sidebar to browse every Grid, Calendar, Table and Schedule in this project. Each Grid/Calendar row lists the Pages it is directly placed on — click one to jump straight to that block. Click a name to rename it in place; select several objects and use the compact toolbar's literal find/replace, whose before/after preview opens as a popover so the object list never shifts; delete is undoable with Ctrl/Cmd+Z. "Select related" expands the current selection over the same dependency graph duplication uses — Dependencies, Dependents, or All connected — so selecting one Table and choosing Dependents adds every Grid, Schedule and Calendar that reads it. "Duplicate selected" then copies exactly that checked set — never a recomputed scope — into this or another project, with the same undo/redo as the rest of the toolbar; an individual Grid/Table/Schedule/Calendar page's own Duplicate button opens Object Manager with it preselected instead of asking for a scope itself. Use "Place on Page…" or drag a Grid/Calendar row onto a sidebar Page to add another placement of that existing object without duplicating its definition.`;

// Japan
const jaOldDep = `- **依存関係を考慮した複製 (Dependency-aware duplication):** Grid、Table、およびScheduleのコピーには、参照されている、参照している、またはすべての接続されたオブジェクトを再帰的に含めることができます。複製されたScheduleはそれが読み書きするTableを一緒に持ち込み、確認画面には、オブジェクトの数と省略された参照のプレビューが表示されます。Tableのコピーには行を含めるか省略するかを選択でき、プロジェクト間のScheduleのコピーは無効な状態で開始され、プロジェクト間のコピーでは除外されたリンクがクリアされます。`;

const jaNewDep = `- **依存関係を考慮した複製 (Dependency-aware duplication):** Grid、Table、Schedule、およびCalendarのコピーには、参照されている、参照している、またはすべての接続されたオブジェクトを再帰的に含めることができます。複製されたScheduleはそれが読み書きするTableを一緒に持ち込み、複製されたCalendarはクエリが読み取るすべてのTableを一緒に持ち込みます。確認画面には、オブジェクトの数と省略された参照のプレビューが表示されます。Tableのコピーには行を含めるか省略するかを選択でき、プロジェクト間のScheduleのコピーは無効な状態で開始され、プロジェクト間のコピーでは除外されたリンク（Calendarのクエリを含む）がクリアされます。`;

const jaOldObjMgr1 = `- **Object Manager:** グリッド、テーブル、スケジュールを一元管理します。`;

const jaNewObjMgr1 = `- **Object Manager:** グリッド、カレンダー、テーブル、スケジュールを一元管理します。`;

const jaOldObjMgr2 = `- **オブジェクトマネージャー (Object Manager):** サイドバーから開いて、このプロジェクト内のすべてのGrid、Table、Scheduleを閲覧できます。各Gridの行には、それが直接配置されているPageがリストされており、クリックするとそのブロックに直接ジャンプします。名前をクリックするとその場で名前を変更できます。複数のオブジェクトを選択し、コンパクトツールバーのリテラルな検索/置換を使用すると、変更前/変更後のプレビューがポップオーバーとして開くため、オブジェクトリストが移動することはありません。削除はCtrl/Cmd+Zで元に戻せます。"Select related (関連を選択)" は、複製で使用されるのと同じ依存関係グラフ（Dependencies (依存関係)、Dependents (依存先)、または All connected (接続されているすべて)）で現在の選択を拡張します。そのため、1つのTableを選択してDependentsを選ぶと、それを読み取るすべてのGrid、Scheduleが追加されます。"Duplicate selected (選択したものを複製)" を実行すると、再計算されたスコープではなく、正確にチェックされたセットがこのプロジェクトまたは別のプロジェクトにコピーされます。これはツールバーの他の機能と同じようにUndo/Redoが可能です。個々のGrid/Table/Scheduleページ自身の Duplicate (複製) ボタンは、スコープ自体を尋ねるのではなく、それが事前に選択された状態でオブジェクトマネージャーを開きます。"Place on Page… (ページに配置)" を使用するか、Gridの行をサイドバーのPageにドラッグすると、定義を複製することなくその既存のオブジェクトの配置をもう1つ追加できます。`;

const jaNewObjMgr2 = `- **オブジェクトマネージャー (Object Manager):** サイドバーから開いて、このプロジェクト内のすべてのGrid、Calendar、Table、Scheduleを閲覧できます。各Grid/Calendarの行には、それが直接配置されているPageがリストされており、クリックするとそのブロックに直接ジャンプします。名前をクリックするとその場で名前を変更できます。複数のオブジェクトを選択し、コンパクトツールバーのリテラルな検索/置換を使用すると、変更前/変更後のプレビューがポップオーバーとして開くため、オブジェクトリストが移動することはありません。削除はCtrl/Cmd+Zで元に戻せます。"Select related (関連を選択)" は、複製で使用されるのと同じ依存関係グラフ（Dependencies (依存関係)、Dependents (依存先)、または All connected (接続されているすべて)）で現在の選択を拡張します。そのため、1つのTableを選択してDependentsを選ぶと、それを読み取るすべてのGrid、Schedule、Calendarが追加されます。"Duplicate selected (選択したものを複製)" を実行すると、再計算されたスコープではなく、正確にチェックされたセットがこのプロジェクトまたは別のプロジェクトにコピーされます。これはツールバーの他の機能と同じようにUndo/Redoが可能です。個々のGrid/Table/Schedule/Calendarページ自身の Duplicate (複製) ボタンは、スコープ自体を尋ねるのではなく、それが事前に選択された状態でオブジェクトマネージャーを開きます。"Place on Page… (ページに配置)" を使用するか、Grid/Calendarの行をサイドバーのPageにドラッグすると、定義を複製することなくその既存のオブジェクトの配置をもう1つ追加できます。`;


fs.writeFileSync('plan.txt', `
1. **Update "Object Manager" and "Dependency-aware duplication" descriptions in English User Manual:**
   - Use \`replace_with_git_merge_diff\` on \`docs/user-manual/index.md\` to apply these exact changes:
\`\`\`
<<<<<<< SEARCH
${engOldObjMgr1}
=======
${engNewObjMgr1}
>>>>>>> REPLACE
<<<<<<< SEARCH
${engOldDep}
=======
${engNewDep}
>>>>>>> REPLACE
<<<<<<< SEARCH
${engOldObjMgr2}
=======
${engNewObjMgr2}
>>>>>>> REPLACE
\`\`\`

2. **Update "Object Manager" and "Dependency-aware duplication" descriptions in Japanese User Manual:**
   - Use \`replace_with_git_merge_diff\` on \`docs/ja/user-manual/index.md\` to apply these exact changes:
\`\`\`
<<<<<<< SEARCH
${jaOldObjMgr1}
=======
${jaNewObjMgr1}
>>>>>>> REPLACE
<<<<<<< SEARCH
${jaOldDep}
=======
${jaNewDep}
>>>>>>> REPLACE
<<<<<<< SEARCH
${jaOldObjMgr2}
=======
${jaNewObjMgr2}
>>>>>>> REPLACE
\`\`\`

3. **Verify documentation rendering and testing:**
   - Run Prettier to ensure formatting is correct across modified documentation files: \`npx prettier --write docs/user-manual/index.md docs/ja/user-manual/index.md\`
   - Run tests: \`cd client && npx vitest run\` and \`cd shared && npm run test:unit\` to ensure everything is unaffected.

4. **Run Pre-commit steps:**
   - Complete pre-commit steps to ensure proper testing, verification, review, and reflection are done.

5. **Submit changes:**
   - Push branch and create a PR with the specific changes.
`);
