<script lang="ts">
const value = (globalThis as unknown).VITE_IS_TEST;
</script>
<div data-testid="env">{value}</div>
