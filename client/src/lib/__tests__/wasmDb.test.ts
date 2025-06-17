import { describe, it, expect, beforeEach, vi } from 'vitest';
import { saveContainerMeta, getAllContainerMeta, __test__resetWasmDbState } from '../wasmDb';

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] || null,
    setItem: (key: string, value: string) => {
      console.log(`Mock localStorage.setItem: key=${key}, value=${value.substring(0, 100)}...`); // Log setItem calls
      store[key] = value.toString();
    },
    clear: () => {
      store = {};
    },
    removeItem: (key: string) => {
      delete store[key];
    }
  };
})();

vi.stubGlobal('localStorage', localStorageMock);

describe('wasmDb', () => {
  beforeEach(async () => {
    await __test__resetWasmDbState(); // Reset state before each test
    localStorageMock.clear();
    // vi.resetModules(); // Removed as per instructions
  });

  // Test 1: getAllContainerMeta should return an empty array if localStorage is empty
  it('getAllContainerMeta should return an empty array if localStorage is empty', async () => {
    const allMeta = await getAllContainerMeta();
    expect(allMeta).toEqual([]);
  });

  // Test 2: saveContainerMeta should save a new container's metadata, and getAllContainerMeta should retrieve it
  it('saveContainerMeta should save a new container and getAllContainerMeta should retrieve it', async () => {
    const newContainer = { id: '1', title: 'Test Container 1' };
    await saveContainerMeta(newContainer.id, newContainer.title);
    const allMeta = await getAllContainerMeta();
    expect(allMeta).toEqual([newContainer]);
  });

  // Test 3: saveContainerMeta should update an existing container's title
  it('saveContainerMeta should update an existing container title', async () => {
    const container = { id: '1', title: 'Initial Title' };
    await saveContainerMeta(container.id, container.title);
    const updatedTitle = 'Updated Title';
    await saveContainerMeta(container.id, updatedTitle);
    const allMeta = await getAllContainerMeta();
    expect(allMeta.find(c => c.id === container.id)?.title).toBe(updatedTitle);
  });

  // Test 4: saveContainerMeta should correctly save multiple different containers
  it('saveContainerMeta should save multiple containers and getAllContainerMeta should retrieve all', async () => {
    const container1 = { id: '1', title: 'Container 1' };
    const container2 = { id: '2', title: 'Container 2' };
    await saveContainerMeta(container1.id, container1.title);
    await saveContainerMeta(container2.id, container2.title);
    const allMeta = await getAllContainerMeta();
    expect(allMeta).toContainEqual(container1);
    expect(allMeta).toContainEqual(container2);
    expect(allMeta.length).toBe(2);
  });

  // Test 5: Ensure data persistence and parsing
  it('should persist and parse data correctly', async () => {
    const container = { id: 'test-id', title: 'Test Title with spaces and symbols !@#$%^&*()' };

    // Debug: Log localStorage content before saving
    console.log('Before saveContainerMeta in Test 5, localStorage (wasm_db):', localStorageMock.getItem('wasm_db'));

    await saveContainerMeta(container.id, container.title);

    // Debug: Log localStorage content after saving
    console.log('After saveContainerMeta in Test 5, localStorage (wasm_db):', localStorageMock.getItem('wasm_db'));

    const allMeta = await getAllContainerMeta();

    // Debug: Log allMeta content
    console.log('In Test 5, allMeta:', JSON.stringify(allMeta));

    expect(allMeta.length).toBe(1);
    expect(allMeta[0]).toEqual(container);
  });
});
