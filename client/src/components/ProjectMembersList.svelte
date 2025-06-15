<script lang="ts">
	import { manageProjectMember, getProjectMembers, type ProjectMember } from '../stores/firestoreStore.svelte';
	import { userManager }from '../auth/UserManager';
	import { firestoreStore } from '../stores/firestoreStore.svelte'; // To get current user's role
	import { getLogger } from '../lib/logger';

	const logger = getLogger();

	let { projectId, isOpen = false }: { projectId: string; isOpen: boolean } = $props();

	// Local state for the component
	let members = $state<ProjectMember[]>([]);
	let isLoadingMembers = $state(false); // Renamed for clarity
	let loadingError = $state<string | null>(null); // Specific for loading members
	let actionFeedbackMessage = $state(''); // For feedback on actions like role change/remove
	let actionFeedbackType = $state<'success' | 'error' | ''>('');
    let editingMemberId = $state<string | null>(null);
    let newRoleForEdit = $state<'editor' | 'viewer'>('viewer');

    // Determine if the current user is an owner of this project
    let isCurrentUserOwner = $derived((): boolean => {
        const userContainer = firestoreStore.userContainer;
        if (!userContainer || !userContainer.accessibleContainers) return false;
        const projectAccess = userContainer.accessibleContainers.find(p => p.id === projectId);
        return projectAccess?.role === 'owner';
    });

	// Removed mockMembers array

	async function loadMembers() {
		isLoadingMembers = true;
		loadingError = null;
        actionFeedbackMessage = ''; // Clear action feedback when reloading
        actionFeedbackType = '';
		try {
			members = await getProjectMembers(projectId);
            if (members.length === 0) {
                // This message is more of a status than an error if API call was successful
                logger.info(`No members found for project ${projectId} or user is the only member.`);
            }
		} catch (error) {
			logger.error(`Error loading project members for ${projectId}:`, error);
			loadingError = 'Failed to load project members.';
			members = [];
		} finally {
			isLoadingMembers = false;
		}
	}

	async function handleChangeRole(memberId: string, newRole: 'editor' | 'viewer') {
		isLoadingMembers = true; // Use general loading indicator for actions too, or a separate one
		actionFeedbackMessage = '';
		try {
			const success = await manageProjectMember(projectId, memberId, 'updateRole', newRole);
			if (success) {
				actionFeedbackMessage = `Role for member updated successfully.`;
				actionFeedbackType = 'success';
                await loadMembers(); // Refresh list
                editingMemberId = null; // Close edit dropdown
			} else {
				actionFeedbackMessage = 'Failed to update role.';
				actionFeedbackType = 'error';
			}
		} catch (error) {
			logger.error('Error calling manageProjectMember (updateRole):', error);
			actionFeedbackMessage = 'An unexpected error occurred while updating role.';
			actionFeedbackType = 'error';
		} finally {
			isLoadingMembers = false; // Stop general loading indicator
		}
	}

	async function handleRemoveMember(memberId: string) {
        if (!confirm(`Are you sure you want to remove member ${memberId} from this project?`)) {
            return;
        }
		isLoadingMembers = true; // Use general loading indicator
		actionFeedbackMessage = '';
		try {
			const success = await manageProjectMember(projectId, memberId, 'removeMember');
			if (success) {
				actionFeedbackMessage = `Member removed successfully.`;
				actionFeedbackType = 'success';
                await loadMembers(); // Refresh list
			} else {
				actionFeedbackMessage = 'Failed to remove member.';
				actionFeedbackType = 'error';
			}
		} catch (error) {
			logger.error('Error calling manageProjectMember (removeMember):', error);
			actionFeedbackMessage = 'An unexpected error occurred while removing member.';
			actionFeedbackType = 'error';
		} finally {
			isLoadingMembers = false; // Stop general loading indicator
		}
	}

    function startEditRole(memberId: string, currentRole: 'editor' | 'viewer') {
        editingMemberId = memberId;
        newRoleForEdit = currentRole;
    }

	function closeModal() {
		isOpen = false;
        actionFeedbackMessage = ''; // Clear action feedback
        actionFeedbackType = '';
        loadingError = null; // Clear loading errors
	}

    $effect(() => {
        if (isOpen && projectId) {
            loadMembers();
        } else {
            members = []; // Clear members when modal is closed or projectId changes
            loadingError = null;
            actionFeedbackMessage = '';
        }
    });

</script>

{#if isOpen}
	<div
		class="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 transition-opacity duration-300 ease-in-out"
		onclick={(event) => {
			if (event.target === event.currentTarget) closeModal();
		}}
	>
		<div
			class="relative w-full max-w-lg transform rounded-lg bg-white p-6 shadow-xl transition-all duration-300 ease-in-out"
		>
			<button
				onclick={closeModal}
				class="absolute right-4 top-4 text-gray-400 hover:text-gray-600"
				aria-label="Close modal"
			>
				&times;
			</button>
			<h2 class="mb-6 text-xl font-semibold text-gray-800">Project Members</h2>

            {#if isLoadingMembers && members.length === 0}
                <p class="text-center text-gray-500">Loading members...</p>
            {:else if loadingError}
                 <div class="rounded-md bg-red-100 p-3 text-sm text-red-700">
                    {loadingError}
                </div>
            {:else if members.length === 0}
                <p class="text-center text-gray-500">
                    No other members found for this project.
                </p>
            {/if}

            {#if actionFeedbackMessage}
                <div
                    class={`my-3 rounded-md p-3 text-sm ${
                        actionFeedbackType === 'success'
                            ? 'bg-green-100 text-green-700'
                            : 'bg-red-100 text-red-700'
                    }`}
                >
                    {actionFeedbackMessage}
                </div>
            {/if}

			<div class="max-h-96 space-y-3 overflow-y-auto">
				{#each members as member (member.id)}
					<div class="flex items-center justify-between rounded-md border border-gray-200 p-3 shadow-sm">
						<div>
							<p class="font-medium text-gray-900">{member.displayName || member.email || member.id}</p>
							<p class="text-sm capitalize text-gray-600">{member.role}</p>
						</div>

                        {#if isCurrentUserOwner && member.role !== 'owner'}
						<div class="flex items-center space-x-2">
                            {#if editingMemberId === member.id}
                                <select
                                    bind:value={newRoleForEdit}
                                    class="rounded-md border-gray-300 text-sm shadow-sm focus:border-indigo-300 focus:ring focus:ring-indigo-200 focus:ring-opacity-50"
                                    onchange={() => handleChangeRole(member.id, newRoleForEdit)}
                                    disabled={isLoadingMembers}
                                >
                                    <option value="viewer">Viewer</option>
                                    <option value="editor">Editor</option>
                                </select>
                                <button
                                    onclick={() => editingMemberId = null}
                                    class="text-xs text-gray-500 hover:text-gray-700"
                                    disabled={isLoadingMembers}
                                >Cancel</button>
                            {:else}
                                <button
                                    onclick={() => startEditRole(member.id, member.role as 'editor' | 'viewer')}
                                    class="rounded-md bg-gray-100 px-2.5 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-200"
                                    disabled={isLoadingMembers}
                                >
                                    Change Role
                                </button>
                                <button
                                    onclick={() => handleRemoveMember(member.id)}
                                    class="rounded-md bg-red-100 px-2.5 py-1.5 text-xs font-medium text-red-600 hover:bg-red-200"
                                    disabled={isLoadingMembers}
                                >
                                    Remove
                                </button>
                            {/if}
						</div>
                        {:else if member.role === 'owner'}
                            <span class="text-xs text-gray-500">Owner</span>
                        {/if}
					</div>
				{/each}
			</div>

            <div class="mt-6 flex justify-end">
                <button
                    type="button"
                    onclick={closeModal}
                    class="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
                >
                    Close
                </button>
            </div>
		</div>
	</div>
{/if}

<style>
	/* Component-specific styles if needed */
</style>
