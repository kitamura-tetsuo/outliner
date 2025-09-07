<script lang="ts">
  let count = $state(0);
  const inc = () => count += 1;
  const dec = () => count -= 1;
</script>

<div>
  <button data-testid="inc" onclick={inc}>+</button>
  <span data-testid="value">{count}</span>
  <button data-testid="dec" onclick={dec}>-</button>
</div>
