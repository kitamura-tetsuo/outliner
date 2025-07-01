<script lang="ts">
import { presenceStore } from "../stores/PresenceStore.svelte";
let users = $derived(() => presenceStore.getUsers());
</script>
<div class="presence-row" data-testid="presence-row">
  {#each users as u (u.userId)}
    <div class="presence-avatar" title={u.userName} style="background-color:{u.color}">
      {u.userName.slice(0,1).toUpperCase()}
    </div>
  {/each}
</div>
<style>
.presence-row {
  display: flex;
  gap: 4px;
  padding: 4px 0;
}
.presence-avatar {
  width: 20px;
  height: 20px;
  border-radius: 50%;
  color: #fff;
  font-size: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
}
</style>
