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

	function getPaletteStyle() {
		const state = editorOverlayStore.getCommandPaletteState();
		if (!state.visible || !state.itemId) {
			return 'display: none;';
		}

		const itemElement = document.querySelector(`[data-item-id="${state.itemId}"]`);
		if (!itemElement) {
			return 'display: none;';
		}

		const itemRect = itemElement.getBoundingClientRect();
		// Attempt to find the cursor span if available
		const cursorSpans = itemElement.querySelectorAll('.cursor-overlay .cursor');
		let cursorLeft = itemRect.left;
		let cursorTop = itemRect.top + itemRect.height; // Default below item

		if (cursorSpans.length > 0) {
			// Find the local user's cursor if multiple are present
			let localCursorSpan: Element | null = null;
			for (const span of Array.from(cursorSpans)) {
				if (span.classList.contains('local')) { // Assuming local cursors have a 'local' class
					localCursorSpan = span;
					break;
				}
			}
			if (!localCursorSpan && cursorSpans.length > 0) {
				localCursorSpan = cursorSpans[0]; // Fallback to the first cursor
			}

			if (localCursorSpan) {
				const cursorRect = localCursorSpan.getBoundingClientRect();
				cursorLeft = cursorRect.left;
				cursorTop = cursorRect.bottom; // Position below the cursor
			}
		} else {
            // Fallback if no cursor span is found, estimate based on offset
            const textElement = itemElement.querySelector('.item-text') as HTMLElement;
            if (textElement) {
                const textContent = textElement.textContent || '';
                const span = document.createElement('span');
                const style = window.getComputedStyle(textElement);
                span.style.font = style.font;
                span.style.whiteSpace = 'pre'; // Ensure spaces are handled correctly
                span.style.visibility = 'hidden';
                span.style.position = 'absolute';
                document.body.appendChild(span);
                span.textContent = textContent.substring(0, state.offset);
                const textWidth = span.getBoundingClientRect().width;
                document.body.removeChild(span);
                cursorLeft = itemRect.left + textWidth;
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
        if (event.key === 'Escape') {
            editorOverlayStore.hideCommandPalette();
        }
        // TODO: Add navigation with arrow keys and Enter to select
    }

    // Listen for Escape key to close palette
    $effect(() => {
        if (editorOverlayStore.commandPaletteVisible) {
            window.addEventListener('keydown', handleKeyDown);
        } else {
            window.removeEventListener('keydown', handleKeyDown);
        }
        return () => {
            window.removeEventListener('keydown', handleKeyDown);
        };
    });

</script>

{#if editorOverlayStore.commandPaletteVisible}
<div class="command-palette" style={paletteStyle} role="dialog" aria-modal="true">
	<ul>
		<li onmousedown={() => handleSelect('table')} ontouchend={() => handleSelect('table')} role="button" tabindex="0">
			Table
		</li>
		<li onmousedown={() => handleSelect('chart')} ontouchend={() => handleSelect('chart')} role="button" tabindex="0">
			Chart
		</li>
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

	.command-palette li:hover {
		background-color: #f0f0f0;
	}
</style>
