import { getEnv } from '../env';

function getFunctionsBaseUrl() {
    const host = getEnv('VITE_FIREBASE_FUNCTIONS_HOST', 'localhost');
    const port = getEnv('VITE_FIREBASE_FUNCTIONS_PORT', '57070');
    return getEnv('VITE_FIREBASE_FUNCTIONS_URL', `http://${host}:${port}`);
}

export async function sendResetLink(email: string): Promise<void> {
    const url = `${getFunctionsBaseUrl()}/api/send-reset-password`;
    const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email })
    });
    if (!res.ok) {
        const msg = await res.text();
        throw new Error(`Failed to send reset email: ${msg}`);
    }
}

export async function resetPassword(oobCode: string, newPassword: string): Promise<void> {
    const url = `${getFunctionsBaseUrl()}/api/confirm-reset-password`;
    const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ oobCode, newPassword })
    });
    if (!res.ok) {
        const msg = await res.text();
        throw new Error(`Failed to reset password: ${msg}`);
    }
}

export async function validateResetToken(oobCode: string): Promise<void> {
    const url = `${getFunctionsBaseUrl()}/api/validate-reset-token`;
    const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ oobCode })
    });
    if (!res.ok) {
        const msg = await res.text();
        throw new Error(`Invalid token: ${msg}`);
    }
}

