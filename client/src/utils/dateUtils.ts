export function formatDate(timestamp: number | string | Date | undefined | null): string {
    if (timestamp === undefined || timestamp === null) return "";
    const date = new Date(timestamp);
    if (isNaN(date.getTime())) return "";

    const pad = (n: number) => String(n).padStart(2, "0");
    const yyyy = date.getFullYear();
    const mm = pad(date.getMonth() + 1);
    const dd = pad(date.getDate());
    return `${yyyy}/${mm}/${dd}`;
}

export function formatDateTime(timestamp: number | string | Date | undefined | null): string {
    if (timestamp === undefined || timestamp === null) return "";
    const date = new Date(timestamp);
    if (isNaN(date.getTime())) return "";

    const pad = (n: number) => String(n).padStart(2, "0");
    const yyyy = date.getFullYear();
    const mm = pad(date.getMonth() + 1);
    const dd = pad(date.getDate());
    const HH = pad(date.getHours());
    const MM = pad(date.getMinutes());
    const SS = pad(date.getSeconds());
    return `${yyyy}/${mm}/${dd} ${HH}:${MM}:${SS}`;
}
