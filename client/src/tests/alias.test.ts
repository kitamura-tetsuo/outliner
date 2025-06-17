/** @feature ALS-0001
 *  Title   : Alias items link by ID
 *  Source  : docs/client-features.yaml
 */
import { describe, it, expect } from 'vitest';
import { Project } from '../schema/app-schema';
import { findItemById, getItemPath } from '../utils/treeUtils';

describe('Alias item', () => {
    it('tracks target item by id even after move', () => {
        const project = Project.createInstance('Test');
        const page1 = project.addPage('Page1', 'user');
        const itemA = page1.items.addNode('user');
        itemA.updateText('original');
        const page2 = project.addPage('Page2', 'user');
        const alias = page2.items.addAliasNode(itemA, 'user');
        expect(alias.aliasId).toBe(itemA.id);

        // move itemA to page2
        const index = page1.items.indexOf(itemA);
        page1.items.removeAt(index);
        page2.items.insertAtEnd(itemA);

        const found = findItemById(project.items as any, alias.aliasId);
        expect(found?.id).toBe(itemA.id);
        expect(found?.text).toBe('original');
    });

    it('allows editing through alias subtree', () => {
        const project = Project.createInstance('Test');
        const page1 = project.addPage('Page1', 'user');
        const itemA = page1.items.addNode('user');
        itemA.updateText('A');
        const child = itemA.items.addNode('user');
        child.updateText('child');
        const page2 = project.addPage('Page2', 'user');
        const alias = page2.items.addAliasNode(itemA, 'user');
        const aliasChild = findItemById((alias.items as any), child.id);
        expect(aliasChild).toBeUndefined();

        const targetChild = findItemById(project.items as any, child.id)!;
        targetChild.updateText('updated');
        expect(child.text).toBe('updated');
    });

    it('provides path to alias target', () => {
        const project = Project.createInstance('Test');
        const page1 = project.addPage('Page1', 'user');
        const itemA = page1.items.addNode('user');
        itemA.updateText('A');
        const page2 = project.addPage('Page2', 'user');
        const alias = page2.items.addAliasNode(itemA, 'user');
        const info = getItemPath(project, itemA.id);
        expect(info?.pageName).toBe('Page1');
        expect(info?.path[0]).toBe('Page1');
        expect(alias.aliasId).toBe(itemA.id);
    });
});
