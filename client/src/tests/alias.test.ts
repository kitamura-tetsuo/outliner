import { describe, it, expect } from 'vitest';
import { Project } from '../schema/app-schema';
import { OutlinerViewModel } from '../stores/OutlinerViewModel';

describe('Alias items', () => {
  it('reflects target item text', () => {
    const project = Project.createInstance('Test');
    const page = project.addPage('Page1', 'user');
    const items = page.items;
    const item1 = items.addNode('user');
    item1.updateText('Hello');
    const alias = items.addAlias(item1.id, 'user');

    const vm = new OutlinerViewModel();
    vm.updateFromModel(page);

    const aliasVm = vm.getViewModel(alias.id)!;
    expect(aliasVm.text).toBe('Hello');

    item1.updateText('World');
    vm.updateFromModel(page);
    const aliasVm2 = vm.getViewModel(alias.id)!;
    expect(aliasVm2.text).toBe('World');
  });
});
