# E2E grep 実行例（features.yaml の id を前方一致）

- キーボード並べ替え関連のみを実行

```
npm run test:e2e -- --grep ^ITM-yjs-keyboard-reorder
```

- D&D 関連のみを実行

```
npm run test:e2e -- --grep ^ITM-yjs-drag-
```

- アウトライナ関連全般（ITM-yjs- プレフィクス）

```
npm run test:e2e -- --grep ^ITM-yjs-
```

- 単一spec（ID完全一致）

```
npm run test:e2e -- --grep ITM-yjs-drag-multicursor-interaction-5e7f9a1c
```
