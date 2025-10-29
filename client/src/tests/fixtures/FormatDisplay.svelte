<script lang="ts">
import { ScrapboxFormatter } from "../../utils/ScrapboxFormatter";
let { text } = $props<{ text: string }>();
</script>
<!-- eslint-disable svelte/no-at-html-tags -->
<!-- XSS-safe: ScrapboxFormatter.formatToHtml() escapes HTML before applying formatting -->
<div data-testid="html">{@html ScrapboxFormatter.formatToHtml(text)}</div>
<!-- eslint-enable svelte/no-at-html-tags -->
