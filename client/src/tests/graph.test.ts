import { describe, it, expect } from 'vitest';
import { buildGraphData } from '../lib/graph';

describe('graph builder', () => {
    it('builds nodes and links from pages', () => {
        const pages = [
            { id: '1', text: 'home [page2]' },
            { id: '2', text: 'page2' },
        ];
        const result = buildGraphData(pages);
        expect(result.nodes.length).toBe(2);
        expect(result.links.length).toBe(1);
        expect(result.links[0]).toEqual({ source: '1', target: '2' });
    });
});

