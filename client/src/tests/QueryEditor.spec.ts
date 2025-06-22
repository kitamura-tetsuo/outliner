import { render, fireEvent } from '@testing-library/svelte';
import { describe, it, expect, vi } from 'vitest';
import QueryEditor from '../components/QueryEditor.svelte';
import * as store from '../services/queryStore';

describe('QueryEditor', () => {
    it('runs query on button click', async () => {
        const spy = vi.spyOn(store.queryStore, 'run').mockResolvedValue({ success: true });
        const { getByTestId } = render(QueryEditor);
        const input = getByTestId('sql-input') as HTMLTextAreaElement;
        await fireEvent.input(input, { target: { value: 'SELECT 1' } });
        await fireEvent.click(getByTestId('run-btn'));
        expect(spy).toHaveBeenCalledWith('SELECT 1');
        spy.mockRestore();
    });
});
