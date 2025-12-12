<script lang="ts">
	const {
		projectTitle = '',
		message = 'This will move the project to the trash. It will be permanently deleted after 30 days.',
		confirmText = 'Delete',
		onDelete,
		onCancel
	} = $props();
	let confirmTitle = $state('');

	function handleDelete() {
		if (confirmTitle === projectTitle) {
			onDelete();
		} else {
			alert('The project title you entered does not match.');
		}
	}

	function handleCancel() {
		onCancel();
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
	<button onclick={handleDelete}>{confirmText}</button>
	<button onclick={handleCancel}>Cancel</button>
</div>
