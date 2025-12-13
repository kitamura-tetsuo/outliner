<script lang="ts">
	import ProjectCard from '$lib/components/ProjectCard.svelte';
	import { firestoreStore } from '../../stores/firestoreStore.svelte';
	import { getFirebaseApp } from '$lib/firebase-app';
	import { getFirestore, doc, getDoc } from 'firebase/firestore';
	import { userManager } from '../../auth/UserManager';
	import { goto } from '$app/navigation';

	let projects = $state([]);
	let isLoading = $state(true);
	let error = $state(null);
	let searchTerm = $state('');
	let sortBy = $state('lastModified');
	let filterBy = $state('all');

	async function fetchProjectDetails(projectId) {
		const app = getFirebaseApp();
		const db = getFirestore(app);
		const projectRef = doc(db, 'projects', projectId);
		const docSnap = await getDoc(projectRef);

		if (docSnap.exists()) {
			const data = docSnap.data();
			return {
				id: projectId,
				title: data.title || 'Untitled Project',
				owner: data.ownerId || 'Unknown',
				lastModified: data.updatedAt?.toDate() || new Date(),
				isPublic: data.isPublic || false
			};
		} else {
			return {
				id: projectId,
				title: 'Untitled Project (metadata not found)',
				owner: 'Unknown',
				lastModified: new Date(),
				isPublic: false
			};
		}
	}

	$effect(() => {
		const containerIds = firestoreStore.userContainer?.accessibleContainerIds;
		if (containerIds && containerIds.length > 0) {
			isLoading = true;
			Promise.all(containerIds.map(fetchProjectDetails))
				.then((projectDetails) => {
					projects = projectDetails;
					isLoading = false;
				})
				.catch((err) => {
					error = err;
					isLoading = false;
				});
		} else {
			projects = [];
			isLoading = false;
		}
	});

	const filteredAndSortedProjects = $derived(() => {
		let result = projects;

		// Filter
		if (filterBy !== 'all') {
			const userId = userManager.getCurrentUser()?.id;
			if (filterBy === 'my') {
				result = result.filter((p) => p.owner === userId);
			} else if (filterBy === 'shared') {
				result = result.filter((p) => p.owner !== userId);
			}
		}

		// Search
		if (searchTerm) {
			result = result.filter((p) => p.title.toLowerCase().includes(searchTerm.toLowerCase()));
		}

		// Sort
		result.sort((a, b) => {
			if (sortBy === 'title') {
				return a.title.localeCompare(b.title);
			} else if (sortBy === 'owner') {
				return a.owner.localeCompare(b.owner);
			}
			// Default to lastModified
			return b.lastModified - a.lastModified;
		});

		return result;
	});
</script>

<main class="container mx-auto px-4 py-8">
	<div class="flex justify-between items-center mb-6">
		<h1 class="text-3xl font-bold">Projects</h1>
		<button onclick={() => goto('/projects/new')} class="btn-primary">New Project</button>
	</div>

	<!-- Search, Sort, Filter UI -->
	<div class="mb-6 flex flex-wrap gap-4">
		<input
			type="text"
			bind:value={searchTerm}
			placeholder="Search projects..."
			class="flex-grow rounded-md border border-gray-300 px-3 py-2"
		/>
		<select bind:value={sortBy} class="rounded-md border border-gray-300 px-3 py-2">
			<option value="lastModified">Sort by Date</option>
			<option value="title">Sort by Name</option>
			<option value="owner">Sort by Owner</option>
		</select>
		<select bind:value={filterBy} class="rounded-md border border-gray-300 px-3 py-2">
			<option value="all">All Projects</option>
			<option value="my">My Projects</option>
			<option value="shared">Shared with me</option>
		</select>
	</div>

	{#if isLoading}
		<p>Loading projects...</p>
	{:else if error}
		<p class="text-red-500">Error loading projects: {error.message}</p>
	{:else if filteredAndSortedProjects.length === 0}
		<p>No projects found.</p>
	{:else}
		<div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
			{#each filteredAndSortedProjects as project (project.id)}
				<a href="/projects/{project.id}/settings">
					<ProjectCard {project} />
				</a>
			{/each}
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
</style>
