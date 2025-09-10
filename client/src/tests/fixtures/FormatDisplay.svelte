<script lang="ts">
import { ScrapboxFormatter } from "../../utils/ScrapboxFormatter";
let { text } = $props<{ text: string }>();
</script>
<div data-testid="html">{@html ScrapboxFormatter.formatToHtml(text)}</div>
