<script lang="ts">
  import { page } from '$app/stores';
  import { getFirebaseApp } from '$lib/firebase-app';
  import { getFirestore, doc, getDoc } from 'firebase/firestore';

  let project = $state(null);
  let isLoading = $state(true);
  let error = $state(null);
  let newTitle = $state('');

  const projectId = $page.params.id;

  async function fetchProject() {
    isLoading = true;
    try {
      const app = getFirebaseApp();
      const db = getFirestore(app);
      const projectRef = doc(db, 'projects', projectId);
      const docSnap = await getDoc(projectRef);

      if (docSnap.exists()) {
        const data = docSnap.data();
        project = {
          id: projectId,
          title: data.title || 'Untitled Project',
          description: data.description || '',
          isPublic: data.isPublic || false,
        };
        newTitle = project.title;
      } else {
        throw new Error('Project not found');
      }
    } catch (err) {
      error = err;
    } finally {
      isLoading = false;
    }
  }

  async function renameProject() {
    // Placeholder for rename logic from sub-issue #2
    alert(`Renaming project to: ${newTitle}`);
  }

  async function deleteProject() {
    if (confirm('Are you sure you want to delete this project? This action cannot be undone.')) {
      // Placeholder for trash UI from sub-issue #3
      alert('Deleting project...');
    }
  }

  $effect(() => {
    fetchProject();
  });
</script>

<main class="container mx-auto px-4 py-8">
  {#if isLoading}
    <p>Loading project settings...</p>
  {:else if error}
    <p class="text-red-500">Error: {error.message}</p>
  {:else if project}
    <h1 class="text-3xl font-bold mb-6">Settings for {project.title}</h1>

    <div class="space-y-8">
      <!-- General Settings -->
      <section class="border rounded-lg p-6">
        <h2 class="text-xl font-semibold mb-4">General</h2>
        <div class="space-y-4">
          <div>
            <label for="project-title" class="block text-sm font-medium text-gray-700">Project Title</label>
            <input type="text" id="project-title" bind:value={newTitle} class="mt-1 block w-full rounded-md border-gray-300 shadow-sm" />
          </div>
          <button onclick={renameProject} class="btn-primary">Save Changes</button>
        </div>
      </section>

      <!-- Sharing Settings -->
      <section class="border rounded-lg p-6">
        <h2 class="text-xl font-semibold mb-4">Sharing</h2>
        <!-- Placeholder for sharing UI from sub-issue #5 -->
        <p>Sharing options will be available here.</p>
      </section>

      <!-- Permissions Settings -->
      <section class="border rounded-lg p-6">
        <h2 class="text-xl font-semibold mb-4">Permissions</h2>
        <!-- Placeholder for permission UI from sub-issue #4 -->
        <p>Collaborator management will be available here.</p>
      </section>

      <!-- Danger Zone -->
      <section class="border border-red-500 rounded-lg p-6">
        <h2 class="text-xl font-semibold mb-4 text-red-600">Danger Zone</h2>
        <div class="flex justify-between items-center">
          <p>Delete this project and all its data.</p>
          <button onclick={deleteProject} class="btn-danger">Delete Project</button>
        </div>
      </section>
    </div>
  {/if}
</main>

<style>
  .btn-primary {
    background-color: #007bff;
    color: white;
    padding: 0.5rem 1rem;
    border-radius: 0.25rem;
    cursor: pointer;
    border: none;
  }
  .btn-danger {
    background-color: #dc3545;
    color: white;
    padding: 0.5rem 1rem;
    border-radius: 0.25rem;
    cursor: pointer;
    border: none;
  }
</style>
