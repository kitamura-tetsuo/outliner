<script lang="ts">
import { store as globalStore } from "../../stores/globalStore.svelte";
import { yjsStore } from "../../stores/yjsStore.svelte";
</script>
<div>
    <span data-testid="global">{globalStore.isConnected}</span>
    <span data-testid="yjs">{yjsStore.isConnected}</span>
</div>
