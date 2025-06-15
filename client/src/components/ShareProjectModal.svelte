<script lang="ts">
	import { shareProject } from '../stores/firestoreStore.svelte';
	import { getLogger } from '../lib/logger';

	const logger = getLogger();

	let { projectId, isOpen = false }: { projectId: string; isOpen: boolean } = $props();

	let targetUserEmail = $state('');
	let roleToAssign = $state<'editor' | 'viewer'>('viewer');
	let isLoading = $state(false);
	let feedbackMessage = $state('');
	let feedbackType = $state<'success' | 'error' | ''>('');

	async function handleShareProject() {
		if (!targetUserEmail.trim()) {
			feedbackMessage = 'Please enter an email address.';
			feedbackType = 'error';
			return;
		}
		// Basic email validation (can be improved)
		if (!/^\S+@\S+\.\S+$/.test(targetUserEmail)) {
			feedbackMessage = 'Please enter a valid email address.';
			feedbackType = 'error';
			return;
		}

		isLoading = true;
		feedbackMessage = '';
		feedbackType = '';

		try {
			const success = await shareProject(projectId, targetUserEmail, roleToAssign);
			if (success) {
				feedbackMessage = `Project shared successfully with ${targetUserEmail} as ${roleToAssign}.`;
				feedbackType = 'success';
				targetUserEmail = ''; // Reset form
				roleToAssign = 'viewer';
				// Optionally close modal after a delay or let user close it
				// setTimeout(() => { isOpen = false; }, 2000);
			} else {
				feedbackMessage = 'Failed to share project. The user might not exist or you may not have permission.';
				feedbackType = 'error';
			}
		} catch (error) {
			logger.error('Error calling shareProject:', error);
			feedbackMessage = 'An unexpected error occurred.';
			feedbackType = 'error';
		} finally {
			isLoading = false;
		}
	}

	function closeModal() {
		isOpen = false;
		feedbackMessage = '';
		feedbackType = '';
		targetUserEmail = '';
		roleToAssign = 'viewer';
	}
</script>

{#if isOpen}
	<div
		class="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 transition-opacity duration-300 ease-in-out"
		onclick={(event) => {
			if (event.target === event.currentTarget) closeModal();
		}}
	>
		<div
			class="relative w-full max-w-md transform rounded-lg bg-white p-6 shadow-xl transition-all duration-300 ease-in-out"
		>
			<button
				onclick={closeModal}
				class="absolute right-4 top-4 text-gray-400 hover:text-gray-600"
				aria-label="Close modal"
			>
				&times;
			</button>
			<h2 class="mb-4 text-xl font-semibold text-gray-800">Share Project</h2>

			<form
				onsubmit={(e) => {
					e.preventDefault();
					handleShareProject();
				}}
				class="space-y-4"
			>
				<div>
					<label for="targetUserEmail" class="block text-sm font-medium text-gray-700">
						User Email:
					</label>
					<input
						type="email"
						id="targetUserEmail"
						bind:value={targetUserEmail}
						class="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-indigo-500 sm:text-sm"
						placeholder="user@example.com"
						required
					/>
				</div>

				<div>
					<label for="roleToAssign" class="block text-sm font-medium text-gray-700">
						Assign Role:
					</label>
					<select
						id="roleToAssign"
						bind:value={roleToAssign}
						class="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-indigo-500 sm:text-sm"
					>
						<option value="viewer">Viewer</option>
						<option value="editor">Editor</option>
					</select>
				</div>

				{#if feedbackMessage}
					<div
						class={`rounded-md p-3 text-sm ${
							feedbackType === 'success'
								? 'bg-green-100 text-green-700'
								: feedbackType === 'error'
									? 'bg-red-100 text-red-700'
									: ''
						}`}
					>
						{feedbackMessage}
					</div>
				{/if}

				<div class="flex items-center justify-end space-x-3 pt-2">
					<button
						type="button"
						onclick={closeModal}
						class="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
					>
						Cancel
					</button>
					<button
						type="submit"
						disabled={isLoading}
						class="inline-flex justify-center rounded-md border border-transparent bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
					>
						{#if isLoading}
							<svg
								class="-ml-1 mr-3 h-5 w-5 animate-spin text-white"
								xmlns="http://www.w3.org/2000/svg"
								fill="none"
								viewBox="0 0 24 24"
							>
								<circle
									class="opacity-25"
									cx="12"
									cy="12"
									r="10"
									stroke="currentColor"
									stroke-width="4"
								></circle>
								<path
									class="opacity-75"
									fill="currentColor"
									d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
								></path>
							</svg>
							Sharing...
						{:else}
							Share Project
						{/if}
					</button>
				</div>
			</form>
		</div>
	</div>
{/if}

<style>
	/* Additional global styles or component-specific styles can go here if needed */
	/* For simple modals, Tailwind is often sufficient */
</style>
