import { describe, it, expect, vi } from 'vitest';
import * as fluidService from '../lib/fluidService.svelte';
import * as service from './fluidClient';

describe('fluidClient service wrapper', () => {
  it('delegates createNewContainer to fluidService', async () => {
    const spy = vi.spyOn(fluidService, 'createNewContainer').mockResolvedValue('ok' as any);
    const result = await service.createNewContainer('test');
    expect(result).toBe('ok');
    expect(spy).toHaveBeenCalledWith('test');
    spy.mockRestore();
  });

  it('delegates getFluidClientByProjectTitle to fluidService', async () => {
    const spy = vi.spyOn(fluidService, 'getFluidClientByProjectTitle').mockResolvedValue('client' as any);
    const result = await service.getFluidClientByProjectTitle('title');
    expect(result).toBe('client');
    expect(spy).toHaveBeenCalledWith('title');
    spy.mockRestore();
  });
});
