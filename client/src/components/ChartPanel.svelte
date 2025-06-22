<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import * as echarts from 'echarts/core';
  import { BarChart, LineChart } from 'echarts/charts';
  import { TitleComponent, TooltipComponent, GridComponent, LegendComponent } from 'echarts/components';
  import { CanvasRenderer } from 'echarts/renderers';

  // Register necessary ECharts components
  echarts.use([
    TitleComponent,
    TooltipComponent,
    GridComponent,
    LegendComponent,
    BarChart,
    LineChart,
    CanvasRenderer
  ]);

  let { options = {}, data = {}, theme = 'light' }:
    { options?: echarts.EChartsOption, data?: any, theme?: string } = $props();

  import { tick } from 'svelte'; // Import tick if needed for DOM updates before re-init

  let chartContainer: HTMLDivElement;
  let chartInstance: echarts.ECharts | null = $state(null); // Use $state for reactivity

  // Helper function to apply options, consolidating logic
  function applyCurrentOptions(isInitialLoad = false) {
    if (chartInstance && !chartInstance.isDisposed()) {
      const mergedOptions = { ...options };
      if (data) { // Assuming data prop might contain series or dataset
        if (data.series) mergedOptions.series = data.series;
        if (data.dataset) mergedOptions.dataset = data.dataset;
      }
      console.log(`Chart applyOptions (isInitial: ${isInitialLoad}):`, mergedOptions);
      if (isInitialLoad) {
        chartInstance.setOption(mergedOptions, { notMerge: true });
      } else {
        chartInstance.setOption(mergedOptions, { notMerge: false });
      }
    }
  }

  onMount(() => {
    if (chartContainer) {
      console.log('ChartPanel: onMount - initializing chart');
      chartInstance = echarts.init(chartContainer, theme);
      applyCurrentOptions(true); // Initial load

      const resizeHandler = () => chartInstance?.resize();
      window.addEventListener('resize', resizeHandler);

      return () => {
        window.removeEventListener('resize', resizeHandler);
        chartInstance?.dispose();
        chartInstance = null; // Clear instance on unmount
        console.log('Chart disposed on unmount');
      };
    }
  });

  // Track previous values to detect actual changes
  let prevOptions = $state(options);
  let prevData = $state(data);
  let prevTheme = $state(theme);

  $effect(() => {
    if (!chartInstance || chartInstance.isDisposed()) {
      // If chart is not there or disposed (e.g. after theme change),
      // onMount or the theme change effect should handle re-initialization.
      return;
    }

    if (options !== prevOptions || data !== prevData) {
      console.log('ChartPanel: options or data prop changed, applying update.');
      applyCurrentOptions(false); // Update with new options/data
      prevOptions = options;
      prevData = data;
    }
  });

  $effect(() => {
    if (theme !== prevTheme) {
      console.log(`ChartPanel: theme prop changed from '${prevTheme}' to '${theme}'. Re-initializing.`);
      if (chartInstance && !chartInstance.isDisposed()) {
        chartInstance.dispose();
      }
      // Ensure the container is available and re-initialize
      // DOM updates from Svelte might take a tick
      tick().then(() => {
        if (chartContainer) {
          chartInstance = echarts.init(chartContainer, theme);
          applyCurrentOptions(true); // Apply current options with new theme
        }
      });
      prevTheme = theme;
    }
  });

</script>

<div class="chart-panel-container" bind:this={chartContainer} style="width: 100%; height: 400px;">
  <!-- ECharts will render here -->
</div>

<style>
  .chart-panel-container {
    /* Ensure container has dimensions for ECharts to render */
    min-height: 200px; /* Example minimum height */
  }
</style>
