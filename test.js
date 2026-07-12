import { render } from 'svelte/server';
// Wait, I can't easily test Svelte 5 compilation.
// Svelte 5 rule:
// if (value == null) element.removeAttribute(key)
// if (value === '') element.setAttribute(key, '')
// So `""` SHOULD render the attribute.
