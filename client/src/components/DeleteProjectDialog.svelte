<script lang="ts">
	import { createEventDispatcher } from 'svelte';

	export let projectTitle = '';
	export let message =
		'This will move the project to the trash. It will be permanently deleted after 30 days.';
	export let confirmText = 'Delete';
	let confirmTitle = '';

	const dispatch = createEventDispatcher();

	function handleDelete() {
		if (confirmTitle === projectTitle) {
			dispatch('delete');
		} else {
			alert('The project title you entered does not match.');
		}
	}

	function handleCancel() {
		dispatch('cancel');
	}
</script>

<div>
	<h2>Delete Project</h2>
	<p>
		{message}
	</p>
	<p>
		Please type the project title to confirm: <strong>{projectTitle}</strong>
	</p>
	<input type="text" bind:value={confirmTitle} />
	<button on:click={handleDelete}>{confirmText}</button>
	<button on:click={handleCancel}>Cancel</button>
</div>
