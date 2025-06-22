import { render, fireEvent } from '@testing-library/svelte';
import { describe, it, expect } from 'vitest';
import EditableQueryGrid from '../components/EditableQueryGrid.svelte';

describe('EditableQueryGrid', () => {
  it('emits edit event when cell is changed', async () => {
    const columns = ['id', 'name'];
    const rows = [['1', 'a']];
    const { getByDisplayValue, component } = render(EditableQueryGrid, { columns, rows });
    const input = getByDisplayValue('a') as HTMLInputElement;
    let detail: any;
    component.$on('edit', e => detail = e.detail);
    await fireEvent.change(input, { target: { value: 'b' } });
    expect(detail).toEqual({ rowIndex: 0, colIndex: 1, value: 'b' });
  });

  it('shows readonly cells as span', () => {
    const columns = ['id', 'name'];
    const rows = [['1', 'a']];
    const { container } = render(EditableQueryGrid, { columns, rows, readonlyColumns: ['id'] });
    const firstCell = container.querySelector('tbody tr td');
    expect(firstCell?.querySelector('span')?.textContent).toBe('1');
  });
});
