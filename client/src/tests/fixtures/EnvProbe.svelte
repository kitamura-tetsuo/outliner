<script lang="ts">
const value = (globalThis as typeof globalThis & { VITE_IS_TEST?: boolean }).VITE_IS_TEST;
</script>
<div data-testid="env">{value}</div>
