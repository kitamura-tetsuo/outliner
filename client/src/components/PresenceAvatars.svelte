<script lang="ts">
import { onMount } from "svelte";
// Ensure presence store side-effects (window.presenceStore) are initialized
import "../stores/PresenceStore.svelte";

type PresenceUser = { userId: string; userName: string; color: string };

// Type declaration for global presence store
declare global {
  interface Window {
    presenceStore?: {
      users?: Record<string, PresenceUser>;
    };
  }
}

let users = $state<PresenceUser[]>([]);

function readUsers(): PresenceUser[] {
  try {
    const store = globalThis.presenceStore;
    return store ? Object.values(store.users || {}) : [];
  } catch { return []; }
}

function sync() { users = readUsers(); }

onMount(() => {
  sync();
  const handler = () => sync();
  window.addEventListener("presence-users-changed", handler);
  return () => window.removeEventListener("presence-users-changed", handler);
});
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
