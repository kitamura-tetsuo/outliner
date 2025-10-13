<script lang="ts">
import { yjsStore } from "../../stores/yjsStore.svelte";
let connected = $state(false);
$effect(() => { connected = !!yjsStore.isConnected; });
</script>
<div>
    <span data-testid="yjs">{connected}</span>
</div>
