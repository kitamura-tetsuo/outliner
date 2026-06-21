<script>
    import { resolvePath } from "../../../utils/pathUtils";
</script>

<div class="flex flex-col items-center justify-center min-h-screen text-center p-4">
    <h1 class="text-4xl font-bold mb-4">Project Unavailable</h1>
    <p class="text-lg mb-8">
        The project you are trying to access does not exist or you do not have permission to view it.
    </p>
    <a href={resolvePath("/")}
        class="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded"

    >
        Go Home
    </a>
</div>
