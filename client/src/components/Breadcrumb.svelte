<script lang="ts">
    import { resolvePath } from "../utils/pathUtils";

    interface Props {
        items: {
            label: string;
            href?: string;
        }[];
    }

    let { items }: Props = $props();
</script>

<nav class="mb-2 flex items-center text-sm text-gray-600" aria-label="Breadcrumb">
    <ol class="flex items-center space-x-2">
        {#each items as item, i (item.label)}
            <li>
                {#if item.href && i < items.length - 1}
                    <a
                        href={resolvePath(item.href)}
                        class="text-blue-600 hover:text-blue-800 hover:underline"
                    >
                        {item.label}
                    </a>
                {:else}
                    <span class="text-gray-900" aria-current={i === items.length - 1 ? "page" : undefined}>
                        {item.label}
                    </span>
                {/if}
            </li>
            {#if i < items.length - 1}
                <li class="text-gray-400" aria-hidden="true">/</li>
            {/if}
        {/each}
    </ol>
</nav>
