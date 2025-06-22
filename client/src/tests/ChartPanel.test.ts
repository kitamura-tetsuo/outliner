import { render } from '@testing-library/svelte';
import { describe, it, expect } from 'vitest';
import ChartPanel from '../components/ChartPanel.svelte';
import * as echarts from 'echarts';

describe('ChartPanel', () => {
  it('initializes echarts with option', () => {
    const option = { title: { text: 'A' } };
    const { getByTestId } = render(ChartPanel, { option });
    const div = getByTestId('chart-panel');
    const chart = echarts.getInstanceByDom(div);
    expect(chart).toBeTruthy();
    expect(chart?.getOption().title[0].text).toBe('A');
  });
});
