
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import ProjectPage from './+page.svelte';

// Mock dependencies
vi.mock('$app/stores', async () => ({
    page: {
        subscribe: vi.fn((fn) => {
            fn({ params: { project: 'demo' } });
            return () => {};
        })
    }
}));

vi.mock('../../lib/logger', () => ({
    getLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() })
}));

vi.mock('../../services', () => ({
    getYjsClientByProjectTitle: vi.fn().mockResolvedValue({
        getProject: () => ({ title: 'demo', ydoc: { guid: '123' } })
    }),
    removeYjsClientByProjectId: vi.fn()
}));

vi.mock('../../lib/demoSeed', () => ({
    DEMO_PROJECT_NAME: 'demo',
    seedDemo: vi.fn().mockResolvedValue(undefined)
}));

vi.mock('../../auth/UserManager', () => ({
    userManager: {
        getCurrentUser: vi.fn().mockReturnValue({ id: 'user1' }),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        logout: vi.fn()
    }
}));

describe('Project Page - Demo Project', () => {
    it('renders Public Demo Project title when projectName is demo', async () => {
        render(ProjectPage);
        expect(await screen.findByText('Public Demo Project')).toBeInTheDocument();
        expect(await screen.findByText(/This is a public, collaborative demo project/)).toBeInTheDocument();
    });
});
