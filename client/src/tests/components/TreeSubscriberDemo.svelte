<script lang="ts">
  import { Item } from "../../schema/app-schema";
  import { TreeSubscriber } from "../../stores/TreeSubscriber";

  // テスト用の単純なItem（Y.Text保持）
  const item = new Item({ text: "hello", author: "test" });

  // Yjs <-> Svelte5 双方向同期を検証するためのサブスクライバ
  const text = new TreeSubscriber(item, "nodeChanged", () => item.text, (v) => {
    item.text = v;
  });

  let inputValue = $state(text.current);

  function onInput(e: Event) {
    const v = (e.target as HTMLInputElement).value;
    inputValue = v;
    text.current = v; // Svelte -> Yjs
  }

  function appendExclamation() {
    // Yjs -> Svelte（observeでdisplayに反映される）
    const y = item.yText;
    y.insert(y.length, "!");
  }

  function resetText() {
    text.current = "RESET";
    inputValue = "RESET";
  }
</script>

<div data-testid="display">{text.current}</div>
<input id="user-input" value={inputValue} oninput={onInput} />
<button id="append" onclick={appendExclamation}>Append!</button>
<button id="reset" onclick={resetText}>Reset</button>

