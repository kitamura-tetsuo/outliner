<script lang="ts">
    import type { ProjectPermission } from "../../schema/app-schema";
    import {
        canManagePermissions,
        getEditors,
        getViewers,
    } from "../services/permissionService";
    import { userManager } from "../../auth/UserManager";
    import { getFirebaseFunctionUrl } from "../firebaseFunctionsUrl";
    import { getLogger } from "../logger";

    interface Props {
        containerId: string;
        permissions?: ProjectPermission[];
    }

    let { containerId, permissions = [] }: Props = $props();

    const logger = getLogger();
    
    let newUserEmail = $state("");
    let newUserRole: "editor" | "viewer" = $state("viewer");
    let isLoading = $state(false);
    let error = $state("");
    let success = $state("");

    // Current user info
    let currentUser = $derived(userManager.getCurrentUser());
    let currentUserId = $derived(currentUser?.id || "");

    // Check permissions for current user
    let canManage = $derived(canManagePermissions(permissions, currentUserId));

    // Get permission counts
    let editors = $derived(getEditors(permissions));
    let viewers = $derived(getViewers(permissions));
    async function addUser() {
        if (!newUserEmail || !canManage) {
            return;
        }

        isLoading = true;
        error = "";
        success = "";

        try {
            // Search for user by email (simplified - in real app would query Firebase Auth)
            // For now, we'll just add by email directly
            const response = await fetch(getFirebaseFunctionUrl("addProjectPermission"), {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    idToken: await userManager.auth.currentUser?.getIdToken(),
                    containerId,
                    userEmail: newUserEmail,
                    role: newUserRole,
                }),
            });

            if (!response.ok) {
                throw new Error(`API error: ${response.status}`);
            }

            await response.json();
            success = `Successfully added ${newUserEmail} as ${newUserRole}`;
            newUserEmail = "";
            newUserRole = "viewer";

            // Refresh permissions (would need to emit an event or call parent)
            // For now, parent should reload permissions
        } catch (err) {
            logger.error("Error adding user:", err);
            error = "Failed to add user to project";
        } finally {
            isLoading = false;
        }
    }

    async function updateUserRole(userId: string, newRole: "editor" | "viewer") {
        if (!canManage) {
            return;
        }

        isLoading = true;
        error = "";
        success = "";

        try {
            const response = await fetch(getFirebaseFunctionUrl("updateProjectPermission"), {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    idToken: await userManager.auth.currentUser?.getIdToken(),
                    containerId,
                    userId,
                    role: newRole,
                }),
            });

            if (!response.ok) {
                throw new Error(`API error: ${response.status}`);
            }

            success = `Successfully updated user role`;
        } catch (err) {
            logger.error("Error updating user role:", err);
            error = "Failed to update user role";
        } finally {
            isLoading = false;
        }
    }

    async function removeUser(userId: string) {
        if (!canManage || userId === currentUserId) {
            return;
        }

        isLoading = true;
        error = "";
        success = "";

        try {
            const response = await fetch(getFirebaseFunctionUrl("removeProjectPermission"), {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    idToken: await userManager.auth.currentUser?.getIdToken(),
                    containerId,
                    userId,
                }),
            });

            if (!response.ok) {
                throw new Error(`API error: ${response.status}`);
            }

            success = "Successfully removed user from project";
        } catch (err) {
            logger.error("Error removing user:", err);
            error = "Failed to remove user";
        } finally {
            isLoading = false;
        }
    }

    function getRoleBadgeColor(role: string): string {
        switch (role) {
            case "owner":
                return "bg-purple-100 text-purple-800 border-purple-200";
            case "editor":
                return "bg-blue-100 text-blue-800 border-blue-200";
            case "viewer":
                return "bg-gray-100 text-gray-800 border-gray-200";
            default:
                return "bg-gray-100 text-gray-800 border-gray-200";
        }
    }

    function getRoleDisplayName(role: string): string {
        switch (role) {
            case "owner":
                return "Owner";
            case "editor":
                return "Editor";
            case "viewer":
                return "Viewer";
            default:
                return role;
        }
    }
</script>

<div class="project-permissions">
    <div class="mb-6">
        <h3 class="text-lg font-semibold text-gray-900 mb-2">Project Permissions</h3>
        <p class="text-sm text-gray-600">
            Manage who can view and edit this project. Owners can manage permissions and delete the project.
        </p>
    </div>

    {#if error}
        <div class="mb-4 p-3 bg-red-50 border border-red-200 rounded-md text-red-800 text-sm">
            {error}
        </div>
    {/if}

    {#if success}
        <div class="mb-4 p-3 bg-green-50 border border-green-200 rounded-md text-green-800 text-sm">
            {success}
        </div>
    {/if}

    <!-- Add User Form -->
    {#if canManage}
        <div class="mb-6 p-4 bg-gray-50 border border-gray-200 rounded-md">
            <h4 class="text-md font-medium text-gray-900 mb-3">Add Collaborator</h4>
            <div class="flex gap-3 items-end">
                <div class="flex-1">
                    <label for="email" class="block text-sm font-medium text-gray-700 mb-1">
                        Email Address
                    </label>
                    <input
                        id="email"
                        type="email"
                        bind:value={newUserEmail}
                        placeholder="user@example.com"
                        class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                </div>
                <div class="w-32">
                    <label for="role" class="block text-sm font-medium text-gray-700 mb-1">
                        Role
                    </label>
                    <select
                        id="role"
                        bind:value={newUserRole}
                        class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                        <option value="viewer">Viewer</option>
                        <option value="editor">Editor</option>
                    </select>
                </div>
                <button
                    onclick={addUser}
                    disabled={!newUserEmail || isLoading}
                    class="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    {isLoading ? "Adding..." : "Add"}
                </button>
            </div>
        </div>
    {/if}

    <!-- Permissions List -->
    <div class="space-y-4">
        <!-- Owners -->
        {#if permissions.filter(p => p.role === "owner").length > 0}
            <div>
                <h4 class="text-sm font-semibold text-gray-700 mb-2 flex items-center">
                    <span class="inline-block w-2 h-2 bg-purple-500 rounded-full mr-2"></span>
                    Owners ({permissions.filter(p => p.role === "owner").length})
                </h4>
                <div class="space-y-2">
                    {#each permissions.filter(p => p.role === "owner") as permission (permission.userId)}
                        <div class="flex items-center justify-between p-3 bg-white border border-gray-200 rounded-md">
                            <div class="flex items-center gap-3">
                                <div class="w-8 h-8 bg-purple-500 rounded-full flex items-center justify-center text-white text-sm font-medium">
                                    {permission.userId.charAt(0).toUpperCase()}
                                </div>
                                <div>
                                    <div class="text-sm font-medium text-gray-900">
                                        {permission.userId}
                                        {#if permission.userId === currentUserId}
                                            <span class="ml-2 text-xs text-gray-500">(You)</span>
                                        {/if}
                                    </div>
                                    <div class="text-xs text-gray-500">
                                        Full access to project settings and content
                                    </div>
                                </div>
                            </div>
                            <span class={`px-2 py-1 text-xs font-medium rounded-full border ${getRoleBadgeColor(permission.role)}`}>
                                {getRoleDisplayName(permission.role)}
                            </span>
                        </div>
                    {/each}
                </div>
            </div>
        {/if}

        <!-- Editors -->
        {#if editors.length > 0}
            <div>
                <h4 class="text-sm font-semibold text-gray-700 mb-2 flex items-center">
                    <span class="inline-block w-2 h-2 bg-blue-500 rounded-full mr-2"></span>
                    Editors ({editors.length})
                </h4>
                <div class="space-y-2">
                    {#each editors as permission (permission.userId)}
                        <div class="flex items-center justify-between p-3 bg-white border border-gray-200 rounded-md">
                            <div class="flex items-center gap-3">
                                <div class="w-8 h-8 bg-blue-500 rounded-full flex items-center justify-center text-white text-sm font-medium">
                                    {permission.userId.charAt(0).toUpperCase()}
                                </div>
                                <div>
                                    <div class="text-sm font-medium text-gray-900">
                                        {permission.userId}
                                        {#if permission.userId === currentUserId}
                                            <span class="ml-2 text-xs text-gray-500">(You)</span>
                                        {/if}
                                    </div>
                                    <div class="text-xs text-gray-500">
                                        Can edit content but cannot delete or manage permissions
                                    </div>
                                </div>
                            </div>
                            <div class="flex items-center gap-2">
                                {#if canManage}
                                    <select
                                        value={permission.role}
                                        onchange={(e) => updateUserRole(permission.userId, e.currentTarget.value as "editor" | "viewer")}
                                        class="px-2 py-1 text-xs border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                                    >
                                        <option value="editor">Editor</option>
                                        <option value="viewer">Viewer</option>
                                    </select>
                                    <button
                                        onclick={() => removeUser(permission.userId)}
                                        disabled={permission.userId === currentUserId}
                                        class="text-red-600 hover:text-red-800 disabled:opacity-50 disabled:cursor-not-allowed"
                                        title="Remove user"
                                    >
                                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                                        </svg>
                                    </button>
                                {:else}
                                    <span class={`px-2 py-1 text-xs font-medium rounded-full border ${getRoleBadgeColor(permission.role)}`}>
                                        {getRoleDisplayName(permission.role)}
                                    </span>
                                {/if}
                            </div>
                        </div>
                    {/each}
                </div>
            </div>
        {/if}

        <!-- Viewers -->
        {#if viewers.length > 0}
            <div>
                <h4 class="text-sm font-semibold text-gray-700 mb-2 flex items-center">
                    <span class="inline-block w-2 h-2 bg-gray-500 rounded-full mr-2"></span>
                    Viewers ({viewers.length})
                </h4>
                <div class="space-y-2">
                    {#each viewers as permission (permission.userId)}
                        <div class="flex items-center justify-between p-3 bg-white border border-gray-200 rounded-md">
                            <div class="flex items-center gap-3">
                                <div class="w-8 h-8 bg-gray-500 rounded-full flex items-center justify-center text-white text-sm font-medium">
                                    {permission.userId.charAt(0).toUpperCase()}
                                </div>
                                <div>
                                    <div class="text-sm font-medium text-gray-900">
                                        {permission.userId}
                                        {#if permission.userId === currentUserId}
                                            <span class="ml-2 text-xs text-gray-500">(You)</span>
                                        {/if}
                                    </div>
                                    <div class="text-xs text-gray-500">
                                        Read-only access
                                    </div>
                                </div>
                            </div>
                            <div class="flex items-center gap-2">
                                {#if canManage}
                                    <select
                                        value={permission.role}
                                        onchange={(e) => updateUserRole(permission.userId, e.currentTarget.value as "editor" | "viewer")}
                                        class="px-2 py-1 text-xs border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                                    >
                                        <option value="viewer">Viewer</option>
                                        <option value="editor">Editor</option>
                                    </select>
                                    <button
                                        onclick={() => removeUser(permission.userId)}
                                        disabled={permission.userId === currentUserId}
                                        class="text-red-600 hover:text-red-800 disabled:opacity-50 disabled:cursor-not-allowed"
                                        title="Remove user"
                                    >
                                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                                        </svg>
                                    </button>
                                {:else}
                                    <span class={`px-2 py-1 text-xs font-medium rounded-full border ${getRoleBadgeColor(permission.role)}`}>
                                        {getRoleDisplayName(permission.role)}
                                    </span>
                                {/if}
                            </div>
                        </div>
                    {/each}
                </div>
            </div>
        {/if}

        {#if permissions.length === 0}
            <div class="text-center py-8 text-gray-500">
                <p>No collaborators yet. {canManage ? "Add someone to get started." : ""}</p>
            </div>
        {/if}
    </div>

    {#if !canManage}
        <div class="mt-6 p-3 bg-yellow-50 border border-yellow-200 rounded-md text-yellow-800 text-sm">
            <strong>Note:</strong> Only project owners can manage permissions and add or remove collaborators.
        </div>
    {/if}
</div>

<style>
    .project-permissions {
        @apply max-w-4xl mx-auto p-6;
    }
</style>
