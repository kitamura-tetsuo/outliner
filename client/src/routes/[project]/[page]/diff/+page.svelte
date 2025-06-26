<script lang="ts">
  import SnapshotDiffModal from "../../../../components/SnapshotDiffModal.svelte";
  import { page } from "$app/stores";
  import { onMount } from "svelte";
  import { getCurrentContent } from "../../../../services";

  let project: string;
  let pageTitle: string;
  let content = "";
  let user = "user";

  onMount(() => {
    const params = $page.params as { project: string; page: string };
    project = params.project;
    pageTitle = params.page;
    content = getCurrentContent(project, pageTitle);
  });
</script>

<SnapshotDiffModal
  {project}
  page={pageTitle}
  bind:currentContent={content}
  author={user}
/>
