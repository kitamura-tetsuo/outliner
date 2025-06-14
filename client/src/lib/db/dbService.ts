import type { FluidClient } from '../fluid/fluidClient';

export interface Page {
    id: string;
    title: string;
    content: string;
}

let worker: Worker | null = null;
let req = 0;
const pending = new Map<number, {resolve: (v:any)=>void, reject:(e:any)=>void}>();

function initWorker() {
    if (!worker) {
        worker = new Worker(new URL('./sqliteWorker.ts', import.meta.url), { type: 'module' });
        worker.onmessage = (ev: MessageEvent) => {
            const { id, result, error } = ev.data;
            const cb = pending.get(id);
            if (cb) {
                pending.delete(id);
                if (error) cb.reject(new Error(error));
                else cb.resolve(result);
            }
        };
    }
}

function call(type: string, payload?: any) {
    initWorker();
    return new Promise<any>((resolve, reject) => {
        const id = ++req;
        pending.set(id, { resolve, reject });
        worker!.postMessage({ id, type, payload });
    });
}

export async function init() {
    await call('init');
}

export function addPage(page: Page) {
    return call('addPage', page);
}

export function getPage(id: string) {
    return call('getPage', { id });
}

export function updatePage(page: Page) {
    return call('updatePage', page);
}

export function deletePage(id: string) {
    return call('deletePage', { id });
}

export function getAllPages(): Promise<Page[]> {
    return call('getAllPages');
}

export async function syncWithFluid(fluidClient: FluidClient) {
    const pages = await getAllPages();
    for (const p of pages) {
        const lines = p.content.split('\n');
        await fluidClient.createPage(p.title, lines);
    }
}
