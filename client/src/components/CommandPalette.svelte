<script lang="ts">
	import { editorOverlayStore } from '../stores/EditorOverlayStore.svelte';
	import { OutlinerViewModel } from '../stores/OutlinerViewModel';
	import { getContext } from 'svelte';
	import type { FluidClient } from '../fluid/fluidClient';
	import { Tree } from 'fluid-framework';
	import { Item } from '../schema/app-schema';

	const client = getContext<FluidClient>('fluidClient');
	const viewModel = getContext<OutlinerViewModel>('viewModel');

	let paletteStyle = $derived(getPaletteStyle());
	let highlightedIndex = $state(0);
	const options = ['table', 'chart'] as const; // Define options for type safety and iteration

	function getPaletteStyle() {
		const state = editorOverlayStore.getCommandPaletteState();
		if (!state.visible || !state.itemId) {
			return 'display: none;';
		}

		// Use position from store if available
		if (state.position) {
			return `display: block; position: fixed; top: ${state.position.top}px; left: ${state.position.left}px; z-index: 1000;`;
		}

		// Fallback calculation if position not yet in store (e.g., initial render before EditorOverlay updates it)
		const itemElement = document.querySelector(`[data-item-id="${state.itemId}"]`);
		if (!itemElement) {
			return 'display: none;';
		}
		const itemRect = itemElement.getBoundingClientRect();
        let cursorLeft = itemRect.left;
        let cursorTop = itemRect.top + itemRect.height; // Default below item

        // Try to find the actual cursor element rendered by EditorOverlay for more precision
        const activeCursorElement = document.querySelector(`.editor-overlay .cursor.active[data-offset="${state.offset}"]`);
        if (activeCursorElement) {
            const cursorRect = activeCursorElement.getBoundingClientRect();
            cursorLeft = cursorRect.left;
            cursorTop = cursorRect.bottom;
        } else {
            // Fallback to estimating based on text offset if specific cursor element isn't found
            const textElement = itemElement.querySelector('.item-text') as HTMLElement;
            if (textElement) {
                const textContent = textElement.textContent || '';
                const span = document.createElement('span');
                const style = window.getComputedStyle(textElement);
                span.style.font = style.font;
                span.style.whiteSpace = 'pre';
                span.style.visibility = 'hidden';
                span.style.position = 'absolute'; // Important for getBoundingClientRect
                document.body.appendChild(span); // Must be in document to measure

                span.textContent = textContent.substring(0, state.offset);
                const textRect = textElement.getBoundingClientRect(); // Get text element's position
                cursorLeft = textRect.left + span.getBoundingClientRect().width;
                cursorTop = textRect.bottom; // Position palette below the line of text

                document.body.removeChild(span);
            }
        }
		return `display: block; position: fixed; top: ${cursorTop}px; left: ${cursorLeft}px; z-index: 1000;`;
	}

	function handleSelect(type: 'table' | 'chart') {
		const state = editorOverlayStore.getCommandPaletteState();
		if (!state.itemId || !viewModel) {
			editorOverlayStore.hideCommandPalette();
			return;
		}

		const currentItemNode = client.findNodeRecursive(viewModel.pageItem, state.itemId);

		if (currentItemNode && currentItemNode.parent && Tree.is(currentItemNode.parent, Item) && currentItemNode.parent.items) {
			const parentItem = currentItemNode.parent;
			const currentIndex = parentItem.items.indexOf(currentItemNode);

			let newItemContent = '';
			if (type === 'table') {
				newItemContent = '[[EditableJoinTable]]'; // Placeholder for table
			} else if (type === 'chart') {
				newItemContent = '[[ChartPanel]]'; // Placeholder for chart
			}

			// Add new item after the current one
            const newItem = parentItem.items.insertNew([newItemContent], currentIndex + 1);

            // Focus the new item
            if (newItem && newItem.id) {
                 setTimeout(() => {
                    const newEditorItem = document.querySelector(`[data-item-id="${newItem.id}"]`) as HTMLElement;
                    if (newEditorItem) {
                        // Attempt to focus using the startEditing method if available on the component instance
                        // This requires OutlinerItem to expose startEditing or a similar focus method
                        // For now, we'll rely on programmatic focus and cursor setting
                        const itemComponent = (newEditorItem as any).__svelte_component__; // This is not standard Svelte API
                        if (itemComponent && typeof itemComponent.startEditing === 'function') {
                            itemComponent.startEditing();
                        } else {
                            // Fallback: directly set cursor via store
                            editorOverlayStore.setCursor({ itemId: newItem.id, offset: 0, isActive: true, userId: 'local' });
                        }
                    }
                }, 0);
            }
		}
		editorOverlayStore.hideCommandPalette();
	}

    function handleKeyDown(event: KeyboardEvent) {
        if (!editorOverlayStore.commandPaletteVisible) return;

        if (event.key === 'Escape') {
            editorOverlayStore.hideCommandPalette();
            event.preventDefault();
            event.stopPropagation();
        } else if (event.key === 'ArrowDown') {
            highlightedIndex = (highlightedIndex + 1) % options.length;
            event.preventDefault();
            event.stopPropagation();
        } else if (event.key === 'ArrowUp') {
            highlightedIndex = (highlightedIndex - 1 + options.length) % options.length;
            event.preventDefault();
            event.stopPropagation();
        } else if (event.key === 'Enter') {
            handleSelect(options[highlightedIndex]);
            event.preventDefault();
            event.stopPropagation();
        }
    }

    // Listen for keydown events when palette is visible
    $effect(() => {
        if (editorOverlayStore.commandPaletteVisible) {
            // Reset highlighted index when palette becomes visible
            highlightedIndex = 0;
            window.addEventListener('keydown', handleKeyDown, true); // Use capture phase
        } else {
            window.removeEventListener('keydown', handleKeyDown, true);
        }
        return () => {
            window.removeEventListener('keydown', handleKeyDown, true);
        };
    });

</script>

{#if editorOverlayStore.commandPaletteVisible}
<div class="command-palette" style={paletteStyle} role="dialog" aria-modal="true">
	<ul>
		{#each options as option, index}
			<li
				class:highlighted={index === highlightedIndex}
				onclick={() => handleSelect(option)}
				onmouseenter={() => highlightedIndex = index}
				role="button"
				tabindex="0"
			>
				{option.charAt(0).toUpperCase() + option.slice(1)} <!-- Capitalize first letter -->
			</li>
		{/each}
	</ul>
</div>
{/if}

<style>
	.command-palette {
		background-color: white;
		border: 1px solid #ccc;
		box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1);
		border-radius: 4px;
		min-width: 150px;
	}

	.command-palette ul {
		list-style: none;
		margin: 0;
		padding: 0;
	}

	.command-palette li {
		padding: 8px 12px;
		cursor: pointer;
	}

	.command-palette li:hover, .command-palette li.highlighted {
		background-color: #f0f0f0;
	}
</style>
