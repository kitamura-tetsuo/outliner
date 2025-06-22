import { render, screen, cleanup } from '@testing-library/svelte';
import ChartPanel from './ChartPanel.svelte';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as echarts from 'echarts/core'; // Import to access the mocked functions

vi.mock('echarts/core', async (importOriginal) => {
  const original = await importOriginal<typeof import('echarts/core')>();
  return {
    ...original,
    init: vi.fn(() => ({
      setOption: vi.fn(),
      dispose: vi.fn(),
      resize: vi.fn(),
      isDisposed: vi.fn(() => false),
    })),
    use: vi.fn(),
  };
});

vi.mock('echarts/charts', () => ({ BarChart: {}, LineChart: {} }));
vi.mock('echarts/components', () => ({ TitleComponent: {}, TooltipComponent: {}, GridComponent: {}, LegendComponent: {} }));
vi.mock('echarts/renderers', () => ({ CanvasRenderer: {} }));

describe('ChartPanel.svelte', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    vi.spyOn(window, 'addEventListener').mockImplementation(() => {});
    vi.spyOn(window, 'removeEventListener').mockImplementation(() => {});
  });

  const getMockChartInstance = () => {
    const results = (echarts.init as vi.Mock).mock.results;
    if (results && results.length > 0 && results[results.length -1].type === 'return') {
        return results[results.length -1].value;
    }
    // Fallback to a default mock structure if no instance was properly returned or init wasn't called
    // This helps prevent errors in tests if the component rendering failed before init.
    return {
        setOption: vi.fn(),
        dispose: vi.fn(),
        resize: vi.fn(),
        isDisposed: vi.fn(() => true),
    };
  };

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('initializes ECharts on mount with given options and data', () => {
    const testOptions = { xAxis: { type: 'category' }, yAxis: { type: 'value' } };
    const testData = { series: [{ type: 'bar', data: [10, 20, 30] }] };
    render(ChartPanel, { options: testOptions, data: testData });
    expect(echarts.init).toHaveBeenCalledTimes(1);
    const expectedOptions = { ...testOptions, series: testData.series };
    const mockInstance = getMockChartInstance();
    expect(mockInstance.setOption).toHaveBeenCalledTimes(1);
    expect(mockInstance.setOption).toHaveBeenCalledWith(expectedOptions, { notMerge: true }); // Added { notMerge: true }
  });

  it('updates chart when options prop changes', async () => {
    const initialOptions = { title: { text: 'Initial Title' } };
    const { rerender } = render(ChartPanel, { options: initialOptions, data: {} });
    let mockInstance = getMockChartInstance();
    // Initial call during onMount
    expect(mockInstance.setOption).toHaveBeenCalledWith(initialOptions, { notMerge: true });
    (mockInstance.setOption as vi.Mock).mockClear();

    const updatedOptions = { title: { text: 'Updated Title' } };
    await rerender({ options: updatedOptions, data: {} });
    mockInstance = getMockChartInstance();
    expect(mockInstance.setOption).toHaveBeenCalledTimes(1);
    expect(mockInstance.setOption).toHaveBeenCalledWith(updatedOptions, { notMerge: false });
  });

  it('updates chart when data prop changes', async () => {
    const initialData = { series: [{ type: 'line', data: [1, 2, 3] }] };
    const { rerender } = render(ChartPanel, { options: {}, data: initialData });
    let mockInstance = getMockChartInstance();
    // Initial call during onMount
    expect(mockInstance.setOption).toHaveBeenCalledWith({ series: initialData.series }, { notMerge: true });
    (mockInstance.setOption as vi.Mock).mockClear();

    const updatedData = { series: [{ type: 'line', data: [4, 5, 6] }] };
    await rerender({ options: {}, data: updatedData });
    mockInstance = getMockChartInstance();
    expect(mockInstance.setOption).toHaveBeenCalledTimes(1);
    expect(mockInstance.setOption).toHaveBeenCalledWith({ series: updatedData.series }, { notMerge: false });
  });

  it('re-initializes chart when theme prop changes', async () => {
    const { rerender } = render(ChartPanel, { options: {}, data: {}, theme: 'light' });
    expect(echarts.init).toHaveBeenCalledTimes(1);
    const firstInstance = getMockChartInstance();
    (firstInstance.isDisposed as vi.Mock).mockReturnValueOnce(true);

    await rerender({ options: {}, data: {}, theme: 'dark' });

    expect(firstInstance.dispose).toHaveBeenCalledTimes(1);
    expect(echarts.init).toHaveBeenCalledTimes(2);

    // Get the second instance by looking at the last call result to echarts.init
    const secondInstance = (echarts.init as vi.Mock).mock.results.find(r => r.type === 'return' && r.value !== firstInstance)?.value || getMockChartInstance(); // Fallback
    expect(secondInstance.setOption).toHaveBeenCalledTimes(1); // Called once on the new instance
  });

  it('cleans up on destroy (disposes chart, removes event listener)', () => {
    const { unmount } = render(ChartPanel, { options: {}, data: {} });
    expect(window.addEventListener).toHaveBeenCalledWith('resize', expect.any(Function));
    const mockInstance = getMockChartInstance();
    unmount();
    expect(mockInstance.dispose).toHaveBeenCalledTimes(1);
    expect(window.removeEventListener).toHaveBeenCalledWith('resize', expect.any(Function));
  });

  it('calls resize on chartInstance when window resizes', () => {
    render(ChartPanel, { options: {}, data: {} });
    expect(window.addEventListener).toHaveBeenCalledWith('resize', expect.any(Function));

    // Get the handler passed to addEventListener
    const resizeHandler = (window.addEventListener as vi.Mock).mock.calls.find(call => call[0] === 'resize')?.[1];
    if (!resizeHandler) throw new Error('Resize handler not found');

    const mockInstance = getMockChartInstance();
    resizeHandler(); // Manually call the resize handler
    expect(mockInstance.resize).toHaveBeenCalledTimes(1);
  });
});
