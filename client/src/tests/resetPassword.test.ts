/** @feature FTR-0012
 *  Title   : User can reset forgotten password
 *  Source  : docs/client-features.yaml
 */
import { describe, it, beforeEach, afterEach, expect, vi } from 'vitest';
import { sendResetLink, resetPassword, validateResetToken } from '../lib/email/resetPassword';

const baseUrl = 'http://localhost:57000';

declare global {
    // eslint-disable-next-line no-var
    var fetch: typeof fetch;
}

describe('resetPassword email helpers', () => {
    beforeEach(() => {
        process.env.VITE_FIREBASE_FUNCTIONS_URL = baseUrl;
    });

    afterEach(() => {
        delete process.env.VITE_FIREBASE_FUNCTIONS_URL;
        vi.restoreAllMocks();
    });

    it('sendResetLink posts email', async () => {
        const mock = vi.fn().mockResolvedValue({ ok: true, text: async () => '' });
        global.fetch = mock;
        await sendResetLink('test@example.com');
        expect(mock).toHaveBeenCalledWith(
            `${baseUrl}/api/send-reset-password`,
            expect.objectContaining({ method: 'POST' })
        );
    });

    it('resetPassword posts token and password', async () => {
        const mock = vi.fn().mockResolvedValue({ ok: true, text: async () => '' });
        global.fetch = mock;
        await resetPassword('token', 'pass');
        expect(mock).toHaveBeenCalledWith(
            `${baseUrl}/api/confirm-reset-password`,
            expect.objectContaining({ method: 'POST' })
        );
    });

    it('validateResetToken throws when invalid', async () => {
        const mock = vi.fn().mockResolvedValue({ ok: false, text: async () => 'bad' });
        global.fetch = mock;
        await expect(validateResetToken('token')).rejects.toThrow('Invalid token: bad');
    });
});
