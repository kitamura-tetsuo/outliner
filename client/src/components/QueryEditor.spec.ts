import { render, screen, fireEvent } from '@testing-library/svelte';
import QueryEditor from './QueryEditor.svelte';
import { describe, it, expect, vi } from 'vitest';

describe('QueryEditor.svelte', () => {
  it('renders the textarea and execute button', () => {
    render(QueryEditor);

    expect(screen.getByPlaceholderText('Enter your SQL query here...')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Execute Query' })).toBeInTheDocument();
  });

  it('updates the query value on textarea input', async () => {
    render(QueryEditor);
    const textarea = screen.getByPlaceholderText('Enter your SQL query here...') as HTMLTextAreaElement;
    const testQuery = 'SELECT * FROM test_table;';

    await fireEvent.input(textarea, { target: { value: testQuery } });
    expect(textarea.value).toBe(testQuery);
  });

  // According to user instruction and AGENTS.md, event-related tests for Svelte components
  // should be handled by E2E tests. Marking these as todo for unit tests.
  describe('Event E_mission (to be covered in E2E tests)', () => {
    it.todo('dispatches "queryChange" event with the current query on input');

    it.todo('dispatches "execute" event with the query string when execute button is clicked');
  });

  describe('Button Behavior', () => {
    it('calls console.log when execute button is clicked (placeholder for actual execution)', async () => {
      const consoleSpy = vi.spyOn(console, 'log');
      render(QueryEditor);
      const button = screen.getByRole('button', { name: 'Execute Query' });
      const textarea = screen.getByPlaceholderText('Enter your SQL query here...') as HTMLTextAreaElement;
      const testQuery = 'SELECT 1;';

      await fireEvent.input(textarea, { target: { value: testQuery } });
      await fireEvent.click(button);

      expect(consoleSpy).toHaveBeenCalledWith('Executing query:', testQuery);
      consoleSpy.mockRestore();
    });

    // TODO: Add test for button disabled state if/when query is running (via props or store)
  });

  // TODO: Add tests for SQL query syntax error handling display (if QueryEditor is responsible for it)
});
