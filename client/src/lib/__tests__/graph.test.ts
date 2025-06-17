// client/src/lib/__tests__/graph.test.ts
import { describe, it, expect } from 'vitest';
import * as graphUtils from '../graph';
import type { GraphNode, GraphLink, GraphData } from '../graph';

describe('buildGraphData', () => {
    it('should return empty nodes and links for empty input', () => {
        const pages: Array<{ id: string; text: string }> = [];
        const expectedGraphData: graphUtils.GraphData = { nodes: [], links: [] };
        expect(graphUtils.buildGraphData(pages)).toEqual(expectedGraphData);
    });

    it('should return nodes but no links if pages have no internal links', () => {
        const pages = [
            { id: '1', text: 'Page One' },
            { id: '2', text: 'Page Two' },
        ];
        const expectedNodes: GraphNode[] = [
            { id: '1', title: 'Page One' },
            { id: '2', title: 'Page Two' },
        ];
        const expectedGraphData: graphUtils.GraphData = { nodes: expectedNodes, links: [] };
        expect(graphUtils.buildGraphData(pages)).toEqual(expectedGraphData);
    });

    it('should create links for valid internal references', () => {
        const pages = [
            { id: '1', text: 'Page One references [Page Two]' },
            { id: '2', text: 'Page Two' },
            { id: '3', text: 'Page Three references [Page One]' },
        ];
        const graphData = graphUtils.buildGraphData(pages);
        expect(graphData.nodes).toHaveLength(3);
        expect(graphData.links).toHaveLength(2);
        expect(graphData.links).toContainEqual({ source: '1', target: '2' });
        expect(graphData.links).toContainEqual({ source: '3', target: '1' });
    });

    it('should not create links for references to non-existent pages', () => {
        const pages = [{ id: '1', text: 'Page One references [Non Existent Page]' }];
        const graphData = graphUtils.buildGraphData(pages);
        expect(graphData.nodes).toHaveLength(1);
        expect(graphData.links).toHaveLength(0);
    });

    it('should handle multiple links from one page and multiple references to the same page', () => {
        const pages = [
            { id: '1', text: 'Page One references [Page Two] and also [Page Three]' },
            { id: '2', text: 'Page Two' },
            { id: '3', text: 'Page Three' },
            { id: '4', text: 'Page Four references [Page Two] too' },
        ];
        const graphData = graphUtils.buildGraphData(pages);
        expect(graphData.nodes).toHaveLength(4);
        expect(graphData.links).toHaveLength(3);
        expect(graphData.links).toContainEqual({ source: '1', target: '2' });
        expect(graphData.links).toContainEqual({ source: '1', target: '3' });
        expect(graphData.links).toContainEqual({ source: '4', target: '2' });
    });

    it('should correctly map node IDs and titles', () => {
        const pages = [{ id: 'custom-id', text: 'My Page Title' }];
        const graphData = graphUtils.buildGraphData(pages);
        expect(graphData.nodes).toEqual([{ id: 'custom-id', title: 'My Page Title' }]);
    });

    it('should handle page titles that are substrings of other page titles correctly', () => {
        const pages = [
            { id: '1', text: 'Page A references [Page B]' },
            { id: '2', text: 'Page B' },
            { id: '3', text: 'Page B Plus references [Page B]' } // Should still link to 'Page B' not 'Page B Plus'
        ];
        const graphData = graphUtils.buildGraphData(pages);
        expect(graphData.links).toContainEqual({ source: '1', target: '2' });
        expect(graphData.links).toContainEqual({ source: '3', target: '2' });
    });

    it('should ignore links with special characters that are not page titles like [[]] or [[Page]] or [Page/Slug]', () => {
        const pages = [
            { id: '1', text: 'Page One [[]] [[Page Two]] [PageTwo/Slug]' },
            { id: '2', text: 'Page Two' } // This should not be linked by [[Page Two]]
        ];
        const graphData = graphUtils.buildGraphData(pages);
        expect(graphData.links).toHaveLength(0);
    });
});
