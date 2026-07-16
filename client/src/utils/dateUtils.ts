export function formatDate(ts: number | undefined): string {
    if (!ts) return "";
    const date = new Date(ts);
    if (isNaN(date.getTime())) return "";

    // Deterministic date formatting (YYYY-MM-DD)
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

export function formatDateTime(ts: number | undefined): string {
    if (!ts) return "";
    const date = new Date(ts);
    if (isNaN(date.getTime())) return "";

    // Deterministic datetime formatting (YYYY-MM-DD HH:MM:SS)
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const seconds = String(date.getSeconds()).padStart(2, '0');

    return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}
