<script lang="ts">
const value = (globalThis as any).VITE_IS_TEST;
</script>
<div data-testid="env">{value}</div>
