<script lang="ts">
import { yjsStore } from "../../stores/yjsStore.svelte";
let connected = $derived(!!yjsStore.isConnected);
</script>
<div>
    <span data-testid="yjs">{connected}</span>
</div>
