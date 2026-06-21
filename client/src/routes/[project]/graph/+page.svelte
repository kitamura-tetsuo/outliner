<script lang="ts">
import { resolvePath } from "../../../utils/pathUtils";


import GraphView from "../../../components/GraphView.svelte";

let { data } = $props<{ data: { project: string; }; }>();
const projectName = $derived(data.project);


</script>

<main class="container mx-auto px-4 py-8">
    <div class="mb-4">
        <!-- Breadcrumb navigation -->
        <nav class="mb-2 flex items-center text-sm text-gray-600">
            <a
                href={resolvePath(`/${projectName}`)}
                class="text-blue-600 hover:text-blue-800 hover:underline"
            >
                ← Return to {projectName}
            </a>
        </nav>

        <!-- Page title -->
        <h1 class="text-2xl font-bold">
            <span class="text-gray-600">{projectName} /</span> Graph View
        </h1>
    </div>

    <!-- Graph View Component -->
    <div class="graph-container">
        <GraphView />
    </div>
</main>

<style>
.graph-container {
    width: 100%;
    height: 600px;
    border: 1px solid #ddd;
    border-radius: 8px;
    overflow: hidden;
}
</style>
