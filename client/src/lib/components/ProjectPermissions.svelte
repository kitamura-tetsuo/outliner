<script lang="ts">
  import { onMount } from "svelte";
  import { doc, getDoc, updateDoc, getFirestore } from "firebase/firestore";
  import { getFirebaseApp } from "../firebase-app";
  import type { FirestoreProject } from "../../types/project";
  import { ProjectRole, type ProjectPermission } from "../../types/permissions";
  import { collection, query, where, getDocs } from "firebase/firestore";

  let { projectId }: { projectId: string } = $props();

  const db = getFirestore(getFirebaseApp());
  let project = $state<FirestoreProject | null>(null);
  let collaborators = $state<ProjectPermission[]>([]);
  let userSearch = $state("");
  let searchResults = $state<{ id: string; email: string }[]>([]);
  let errorMessage = $state("");

  onMount(async () => {
    const projectRef = doc(db, "projects", projectId);
    const projectSnap = await getDoc(projectRef);
    if (projectSnap.exists()) {
      project = projectSnap.data() as FirestoreProject;
      collaborators = project.permissions || [];
    }
  });

  const searchUsers = async () => {
    if (userSearch.length < 3) {
      searchResults = [];
      return;
    }
    const usersRef = collection(db, "users");
    const q = query(usersRef, where("email", "==", userSearch));
    const querySnapshot = await getDocs(q);
    searchResults = querySnapshot.docs.map(doc => ({
      id: doc.id,
      email: doc.data().email,
    }));
  };

  const addCollaborator = async (userId: string, role: ProjectRole) => {
    if (!project) return;
    const newPermission: ProjectPermission = {
      userId,
      role,
      grantedAt: Date.now(),
      grantedBy: project.ownerId,
    };
    const updatedPermissions = [...collaborators, newPermission];
    const permissionsMap = Object.fromEntries(updatedPermissions.map(p => [p.userId, p.role]));
    const projectRef = doc(db, "projects", projectId);
    await updateDoc(projectRef, { permissions: updatedPermissions, permissionsMap });
    collaborators = updatedPermissions;
    userSearch = "";
    searchResults = [];
  };

  const removeCollaborator = async (userId: string) => {
    if (!project) return;
    const updatedPermissions = collaborators.filter(p => p.userId !== userId);
    const permissionsMap = Object.fromEntries(updatedPermissions.map(p => [p.userId, p.role]));
    const projectRef = doc(db, "projects", projectId);
    await updateDoc(projectRef, { permissions: updatedPermissions, permissionsMap });
    collaborators = updatedPermissions;
  };

  const updateRole = async (userId: string, role: ProjectRole) => {
    if (!project) return;
    const updatedPermissions = collaborators.map(p =>
      p.userId === userId ? { ...p, role } : p
    );
    const permissionsMap = Object.fromEntries(updatedPermissions.map(p => [p.userId, p.role]));
    const projectRef = doc(db, "projects", projectId);
    await updateDoc(projectRef, { permissions: updatedPermissions, permissionsMap });
    collaborators = updatedPermissions;
  };
</script>

<div class="permissions-container">
  <h2>Project Permissions</h2>
  {#if project}
    <div class="owner">
      <strong>Owner:</strong>
      {project.ownerId}
    </div>
    <div class="collaborators">
      <h3>Collaborators</h3>
      {#each collaborators as collaborator (collaborator.userId)}
        <div class="collaborator">
          <span>{collaborator.userId}</span>
          <select
            value={collaborator.role}
            onchange={e => updateRole(collaborator.userId, parseInt(e.currentTarget.value))}
          >
            <option value={ProjectRole.Viewer}>Viewer</option>
            <option value={ProjectRole.Editor}>Editor</option>
          </select>
          <button onclick={() => removeCollaborator(collaborator.userId)}>
            Remove
          </button>
        </div>
      {/each}
    </div>
    <div class="add-collaborator">
      <h3>Add Collaborator</h3>
      <input
        type="text"
        bind:value={userSearch}
        oninput={searchUsers}
        placeholder="Search by email"
      />
      <div class="search-results">
        {#each searchResults as user (user.id)}
          <div class="search-result">
            <span>{user.email}</span>
            <button onclick={() => addCollaborator(user.id, ProjectRole.Viewer)}>
              Add as Viewer
            </button>
            <button onclick={() => addCollaborator(user.id, ProjectRole.Editor)}>
              Add as Editor
            </button>
          </div>
        {/each}
      </div>
    </div>
  {/if}
  {#if errorMessage}
    <div class="error-message">{errorMessage}</div>
  {/if}
</div>

<style>
  .permissions-container {
    padding: 1rem;
    border: 1px solid #ccc;
    border-radius: 4px;
  }
  .collaborator {
    display: flex;
    gap: 1rem;
    align-items: center;
    margin-bottom: 0.5rem;
  }
  .search-result {
    display: flex;
    gap: 1rem;
    align-items: center;
    margin-bottom: 0.5rem;
  }
  .error-message {
    color: red;
  }
</style>
