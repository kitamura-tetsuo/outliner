
import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/svelte';
import SearchBox from '../../components/SearchBox.svelte';
import { store } from '../../stores/store.svelte';

// Mock the store
vi.mock('../../stores/store.svelte', () => ({
  store: {
    project: {
      items: [
        { id: '1', text: 'Page One', lastChanged: new Date() },
        { id: '2', text: 'Page Two', lastChanged: new Date() },
      ],
      title: 'Test Project'
    },
    pages: {
      current: [
        { id: '1', text: 'Page One', lastChanged: new Date() },
        { id: '2', text: 'Page Two', lastChanged: new Date() },
      ]
    }
  }
}));

// Mock navigation
vi.mock('$app/navigation', () => ({
  goto: vi.fn(),
}));

describe('SearchBox', () => {
  it('renders input', () => {
    const { getByPlaceholderText } = render(SearchBox);
    expect(getByPlaceholderText('Search pages')).toBeTruthy();
  });

  it('shows no results message when query matches nothing', async () => {
    const { getByPlaceholderText, queryByText, findByText } = render(SearchBox);
    const input = getByPlaceholderText('Search pages');

    await fireEvent.input(input, { target: { value: 'XYZ' } });

    // Expect to see "No results found"
    // Since we haven't implemented it yet, this test is expected to FAIL or not find the element
    // This confirms the need for the feature.
    const noResults = await findByText('No results found').catch(() => null);
    expect(noResults).toBeTruthy();
  });
});
