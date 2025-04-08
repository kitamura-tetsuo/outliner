<script lang="ts">
import { onMount } from "svelte";
import { getEnv } from "../lib/env";

// 必須の環境変数リスト
const requiredVars = [
    { key: "VITE_AZURE_TENANT_ID", name: "Azure Tenant ID" },
    { key: "VITE_AZURE_FLUID_RELAY_ENDPOINT", name: "Azure Fluid Relay Endpoint" },
];

onMount(() => {
});
</script>

<style>
.env-warning {
    background-color: #fff3cd;
    border: 1px solid #ffeeba;
    color: #856404;
    padding: 1rem;
    border-radius: 0.25rem;
    margin: 1rem 0;
}

h3 {
    margin-top: 0;
    color: #856404;
}

code {
    background-color: rgba(0, 0, 0, 0.05);
    padding: 0.2rem 0.4rem;
    border-radius: 0.2rem;
    font-family: monospace;
}

ul, ol {
    margin-bottom: 1rem;
}

li {
    margin-bottom: 0.5rem;
}
</style>
