import { render, screen, cleanup } from '@testing-library/svelte';
import { vi, describe, it, expect, afterEach } from 'vitest';
import Sidebar from './Sidebar.svelte';

// Mock SvelteKit's navigation modules
vi.mock('$app/navigation', () => ({
	goto: vi.fn()
}));

vi.mock('$app/paths', () => ({
	resolve: (path) => path
}));

// Mock the store
let mockStoreContent = {};
vi.mock('../../stores/store.svelte', () => ({
	get store() {
		return mockStoreContent;
	}
}));

describe('Sidebar', () => {
	afterEach(() => {
		cleanup();
		vi.clearAllMocks();
	});

	it('should render the sidebar with default props', () => {
		render(Sidebar);
		expect(screen.getByText('Sidebar')).toBeInTheDocument();
		expect(screen.getByText('This is a placeholder sidebar component.')).toBeInTheDocument();
	});
});
