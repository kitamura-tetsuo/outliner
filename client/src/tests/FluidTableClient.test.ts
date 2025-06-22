import { describe, it, expect } from 'vitest';
import { FluidTableClient } from '../services/FluidTableClient';

describe('FluidTableClient', () => {
    it('synchronizes data between instances', () => {
        const a = new FluidTableClient();
        const b = new FluidTableClient();
        a.set('test', [{ id: '1' }]);
        b.set('test', a.get('test'));
        expect(b.get('test')[0].id).toBe('1');
    });
});
