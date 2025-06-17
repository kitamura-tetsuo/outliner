// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { saveContainerMeta, getAllContainerMeta } from '../lib/wasmDb';

describe('wasmDb', () => {
    beforeEach(() => {
        localStorage.clear();
    });

    it('saves and retrieves container metadata', async () => {
        await saveContainerMeta('c1', 'Test Project');
        const all = await getAllContainerMeta();
        expect(all.length).toBe(1);
        expect(all[0].id).toBe('c1');
        expect(all[0].title).toBe('Test Project');
    });
});

