import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { shareProject, manageProjectMember } from './firestoreStore.svelte'; // Adjust path if necessary, assuming this test file is in src/stores or src/tests
import { userManager } from '../auth/UserManager'; // Adjust path
// Assuming VITE_FIREBASE_FUNCTIONS_URL is set in test environment or mock it
// import.meta.env.VITE_FIREBASE_FUNCTIONS_URL = 'http://localhost:57070';


// Mock userManager
vi.mock('../auth/UserManager', () => ({
    userManager: {
        auth: {
            currentUser: {
                getIdToken: vi.fn()
            }
        },
        getCurrentUser: vi.fn()
    }
}));

// Mock logger
vi.mock('../lib/logger', () => ({
    getLogger: vi.fn().mockReturnValue({
        info: vi.fn(),
        error: vi.fn(),
        warn: vi.fn(),
        debug: vi.fn()
    })
}));

// Mock global fetch
global.fetch = vi.fn();

describe('firestoreStore.svelte.ts - Sharing and Member Management', () => {
    const mockApiBaseUrl = 'http://localhost:57070'; // Or from import.meta.env.VITE_FIREBASE_FUNCTIONS_URL

    beforeEach(() => {
        // Reset mocks before each test
        vi.resetAllMocks();

        // Default mock for successful authentication
        (userManager.getCurrentUser as ReturnType<typeof vi.fn>).mockReturnValue({ uid: 'test-user' });
        (userManager.auth.currentUser.getIdToken as ReturnType<typeof vi.fn>).mockResolvedValue('mock-id-token');

        // Mock import.meta.env
        vi.stubGlobal('importMetaEnv', { VITE_FIREBASE_FUNCTIONS_URL: mockApiBaseUrl });

    });

    afterEach(() => {
         vi.unstubAllGlobals();
    });

    describe('shareProject', () => {
        it('should successfully share a project', async () => {
            (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
                ok: true,
                json: async () => ({ success: true }),
            });

            const result = await shareProject('project123', 'test@example.com', 'editor');

            expect(fetch).toHaveBeenCalledOnce();
            expect(fetch).toHaveBeenCalledWith(
                `${mockApiBaseUrl}/api/share-project`,
                expect.objectContaining({
                    method: 'POST',
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        idToken: 'mock-id-token',
                        projectIdToShare: 'project123',
                        targetUserEmail: 'test@example.com',
                        roleToAssign: 'editor',
                    }),
                })
            );
            expect(result).toBe(true);
        });

        it('should return false if API returns an error', async () => {
            (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
                ok: false,
                status: 500,
                text: async () => 'Internal Server Error',
            });

            const result = await shareProject('project123', 'test@example.com', 'viewer');
            expect(fetch).toHaveBeenCalledOnce();
            expect(result).toBe(false);
        });

        it('should return false if API response success is false', async () => {
            (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
                ok: true,
                json: async () => ({ success: false, error: "User not found" }),
            });

            const result = await shareProject('project123', 'test@example.com', 'viewer');
            expect(fetch).toHaveBeenCalledOnce();
            expect(result).toBe(false);
        });

        it('should return false if user is not authenticated (no current user)', async () => {
            (userManager.getCurrentUser as ReturnType<typeof vi.fn>).mockReturnValue(null);
            const result = await shareProject('project123', 'test@example.com', 'editor');
            expect(fetch).not.toHaveBeenCalled();
            expect(result).toBe(false);
        });

        it('should return false if user is not authenticated (no idToken)', async () => {
            (userManager.auth.currentUser.getIdToken as ReturnType<typeof vi.fn>).mockResolvedValue(null);
            const result = await shareProject('project123', 'test@example.com', 'editor');
            expect(fetch).not.toHaveBeenCalled();
            expect(result).toBe(false);
        });
    });

    describe('manageProjectMember', () => {
        it('should successfully update a member role', async () => {
            (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
                ok: true,
                json: async () => ({ success: true }),
            });

            const result = await manageProjectMember('project123', 'targetUserUid', 'updateRole', 'editor');
            expect(fetch).toHaveBeenCalledOnce();
            expect(fetch).toHaveBeenCalledWith(
                `${mockApiBaseUrl}/api/manage-project-members`,
                expect.objectContaining({
                    method: 'POST',
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        idToken: 'mock-id-token',
                        projectId: 'project123',
                        targetUserId: 'targetUserUid',
                        action: 'updateRole',
                        newRole: 'editor',
                    }),
                })
            );
            expect(result).toBe(true);
        });

        it('should successfully remove a member', async () => {
            (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
                ok: true,
                json: async () => ({ success: true }),
            });

            const result = await manageProjectMember('project123', 'targetUserUid', 'removeMember');
            expect(fetch).toHaveBeenCalledOnce();
            expect(fetch).toHaveBeenCalledWith(
                `${mockApiBaseUrl}/api/manage-project-members`,
                expect.objectContaining({
                    method: 'POST',
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        idToken: 'mock-id-token',
                        projectId: 'project123',
                        targetUserId: 'targetUserUid',
                        action: 'removeMember',
                    }),
                })
            );
            expect(result).toBe(true);
        });

        it('should return false if API returns an error during member management', async () => {
            (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
                ok: false,
                status: 403,
                text: async () => 'Permission Denied',
            });
            const result = await manageProjectMember('project123', 'targetUserUid', 'removeMember');
            expect(fetch).toHaveBeenCalledOnce();
            expect(result).toBe(false);
        });

        it('should return false if API response success is false during member management', async () => {
            (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
                ok: true,
                json: async () => ({ success: false, error: "Target user not found" }),
            });
            const result = await manageProjectMember('project123', 'targetUserUid', 'removeMember');
            expect(fetch).toHaveBeenCalledOnce();
            expect(result).toBe(false);
        });


        it('should return false for member management if user is not authenticated (no current user)', async () => {
            (userManager.getCurrentUser as ReturnType<typeof vi.fn>).mockReturnValue(null);
            const result = await manageProjectMember('project123', 'targetUserUid', 'removeMember');
            expect(fetch).not.toHaveBeenCalled();
            expect(result).toBe(false);
        });

        it('should return false for member management if user is not authenticated (no idToken)', async () => {
            (userManager.auth.currentUser.getIdToken as ReturnType<typeof vi.fn>).mockResolvedValue(null);
            const result = await manageProjectMember('project123', 'targetUserUid', 'removeMember');
            expect(fetch).not.toHaveBeenCalled();
            expect(result).toBe(false);
        });

        it('should return false if action is updateRole but no newRole is provided', async () => {
            const result = await manageProjectMember('project123', 'targetUserUid', 'updateRole');
            expect(fetch).not.toHaveBeenCalled();
            expect(result).toBe(false);
        });
    });
});
