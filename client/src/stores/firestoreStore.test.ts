import { describe, it, expect } from 'vitest';
import { firestoreStore } from './firestoreStore.svelte';

describe('firestoreStore', () => {
  it('initial userContainer is null', () => {
    expect(firestoreStore.userContainer).toBeNull();
  });
});
