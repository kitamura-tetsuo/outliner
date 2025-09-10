<script lang="ts">
// currentPage の設定は +page.svelte に集約しました。
// このレイアウトでは責務を持たず、子コンテンツのみを描画します。
let { children } = $props();
</script>

{@render children()}
