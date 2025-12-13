<script lang="ts">
  let { project }: {
    project: {
      id: string;
      title: string;
      lastModified: Date;
      owner: string;
      isPublic: boolean;
    }
  } = $props();

  function renameProject() {
    // Placeholder for rename action
    console.log("Renaming project:", project.id);
  }

  function deleteProject() {
    // Placeholder for delete action
    console.log("Deleting project:", project.id);
  }

  function shareProject() {
    // Placeholder for share action
    console.log("Sharing project:", project.id);
  }
</script>

<div class="project-card border rounded-lg p-4 shadow-sm hover:shadow-md transition-shadow">
  <div class="flex justify-between items-start">
    <div>
      <h3 class="text-lg font-bold">{project.title}</h3>
      <p class="text-sm text-gray-500">
        Last modified: {new Intl.DateTimeFormat().format(project.lastModified)}
      </p>
      <p class="text-sm text-gray-500">Owner: {project.owner}</p>
    </div>
    <div class="flex items-center">
      <span class="badge {project.isPublic ? 'bg-green-200 text-green-800' : 'bg-gray-200 text-gray-800'} text-xs font-semibold mr-2 px-2.5 py-0.5 rounded-full">
        {project.isPublic ? 'Public' : 'Private'}
      </span>
    </div>
  </div>
  <div class="mt-4 flex justify-end space-x-2">
    <button onclick={renameProject} class="btn-secondary">Rename</button>
    <button onclick={shareProject} class="btn-secondary">Share</button>
    <button onclick={deleteProject} class="btn-danger">Delete</button>
  </div>
</div>

<style>
  .btn-secondary {
    background-color: #f0f0f0;
    border: 1px solid #ccc;
    padding: 0.5rem 1rem;
    border-radius: 0.25rem;
    cursor: pointer;
  }
  .btn-danger {
    background-color: #fdd;
    border: 1px solid #fbb;
    color: #c00;
    padding: 0.5rem 1rem;
    border-radius: 0.25rem;
    cursor: pointer;
  }
</style>
