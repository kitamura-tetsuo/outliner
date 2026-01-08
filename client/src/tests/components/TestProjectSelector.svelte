<script lang="ts">
    import ProjectSelector from "../../components/ProjectSelector.svelte";
    import { firestoreStore } from "../../stores/firestoreStore.svelte";
    import { projectStore } from "../../stores/projectStore.svelte";
    import {
        createTestUserData,
        performTestLogin,
        logDebugInfo,
    } from "../utils/testDataHelper";

    interface Props {
        onProjectSelected?: (projectId: string, projectName: string) => void;
    }

    let { onProjectSelected = () => {} }: Props = $props();

    // イベントレス: $state/$derived 依存で再計算
    let userProject = $derived.by(() => {
        void (firestoreStore as any).ucVersion; // 依存関係
        return firestoreStore.userProject;
    });

    // projectStore.projects は getter なので、userProject の変更依存で再計算
    let projects = $derived.by(() => {
        void userProject;
        return projectStore.projects;
    });
</script>

<!-- Debug Information Panel (Test Environment Only) -->
<div class="test-debug-panel">
    <h4>Test Debug Information</h4>
    <div class="debug-info">
        <p><strong>Projects length:</strong> {projects.length}</p>
        <p><strong>Projects data:</strong></p>
        <pre>{JSON.stringify(projects, null, 2)}</pre>
        <p><strong>UserProject:</strong></p>
        <pre>{JSON.stringify(userProject, null, 2)}</pre>
    </div>

    <div class="debug-buttons">
        <button onclick={() => logDebugInfo()} class="debug-button">
            Log Debug Info
        </button>

        <button
            onclick={async () => {
                try {
                    await performTestLogin();
                } catch (err) {
                    console.error("Login failed:", err);
                }
            }}
            class="debug-button"
        >
            Manual Login
        </button>

        <button
            onclick={() => {
                try {
                    createTestUserData();
                    console.log("Test data created successfully");
                } catch (err) {
                    console.error("Error creating test data:", err);
                }
            }}
            class="debug-button"
        >
            Create Test Data
        </button>
    </div>
</div>

<!-- Original ProjectSelector Component -->
<ProjectSelector {onProjectSelected} />

<style>
    .test-debug-panel {
        background-color: #fff3cd;
        border: 2px solid #ffeaa7;
        border-radius: 8px;
        padding: 16px;
        margin-bottom: 16px;
        font-family: monospace;
    }

    .test-debug-panel h4 {
        margin: 0 0 12px 0;
        color: #856404;
        font-size: 16px;
    }

    .debug-info {
        background-color: #f8f9fa;
        border: 1px solid #dee2e6;
        border-radius: 4px;
        padding: 12px;
        margin-bottom: 12px;
    }

    .debug-info p {
        margin: 8px 0;
        font-size: 12px;
    }

    .debug-info pre {
        background-color: #e9ecef;
        border-radius: 3px;
        padding: 8px;
        margin: 4px 0;
        font-size: 11px;
        overflow-x: auto;
        max-height: 200px;
        overflow-y: auto;
    }

    .debug-buttons {
        display: flex;
        gap: 8px;
        flex-wrap: wrap;
    }

    .debug-button {
        background-color: #007acc;
        color: white;
        border: none;
        padding: 6px 12px;
        border-radius: 4px;
        font-size: 12px;
        cursor: pointer;
        transition: background-color 0.2s;
    }

    .debug-button:hover {
        background-color: #005a9e;
    }

    .debug-button:active {
        background-color: #004080;
    }
</style>
