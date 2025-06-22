import { render, screen, fireEvent } from '@testing-library/svelte';
import EditableQueryGrid from './EditableQueryGrid.svelte';
import { describe, it, expect, vi } from 'vitest';

describe('EditableQueryGrid.svelte', () => {
  const mockColumns = ['ID', 'Name', 'Value'];
  const mockData = [
    [1, 'Item A', 100],
    [2, 'Item B', 200],
    [3, 'Item C', 300],
  ];

  it('renders headers and data correctly', () => {
    render(EditableQueryGrid, { columns: mockColumns, data: mockData });

    mockColumns.forEach(column => {
      expect(screen.getByText(column)).toBeInTheDocument();
    });
    mockData.forEach(row => {
      row.forEach(cell => {
        expect(screen.getByText(cell.toString())).toBeInTheDocument();
      });
    });
  });

  it('shows "No data to display." when no columns are provided', () => {
    render(EditableQueryGrid, { columns: [], data: [] });
    expect(screen.getByText('No data to display.')).toBeInTheDocument();
  });

  describe('Cell Editing', () => {
    it('clicking a cell turns it into an input field with the correct value', async () => {
      render(EditableQueryGrid, { columns: mockColumns, data: mockData });
      const cellValue = mockData[0][0].toString();
      const cellElement = screen.getByText(cellValue);
      await fireEvent.click(cellElement);
      const inputElement = screen.getByRole('textbox') as HTMLInputElement;
      expect(inputElement).toBeInTheDocument();
      expect(inputElement.value).toBe(cellValue);
    });

    it('typing in the input field and pressing Enter updates the cell value and exits edit mode', async () => {
      render(EditableQueryGrid, { columns: mockColumns, data: mockData });
      const originalValue = mockData[0][0].toString();
      const cellElement = screen.getByText(originalValue);
      await fireEvent.click(cellElement);
      const inputElement = screen.getByRole('textbox') as HTMLInputElement;
      const newValue = '999';
      await fireEvent.input(inputElement, { target: { value: newValue } });
      expect(inputElement.value).toBe(newValue);
      await fireEvent.keyDown(inputElement, { key: 'Enter' });
      expect(screen.queryByRole('textbox')).toBeNull();
      expect(screen.getByText(newValue)).toBeInTheDocument();
    });

    it('pressing Escape while editing cancels the edit and reverts to the original value', async () => {
      render(EditableQueryGrid, { columns: mockColumns, data: mockData });
      const originalValue = mockData[0][0].toString();
      const cellElement = screen.getByText(originalValue);
      await fireEvent.click(cellElement);
      const inputElement = screen.getByRole('textbox') as HTMLInputElement;
      const tempValue = 'temporary bad value';
      await fireEvent.input(inputElement, { target: { value: tempValue } });
      expect(inputElement.value).toBe(tempValue);
      await fireEvent.keyDown(inputElement, { key: 'Escape' });
      expect(screen.queryByRole('textbox')).toBeNull();
      expect(screen.getByText(originalValue)).toBeInTheDocument();
      expect(screen.queryByText(tempValue)).toBeNull();
    });

    // TODO: Add more tests for cell editing:
    // - Blurring the input saves the change (optional, depends on desired UX)
  });

  describe('Readonly Cells', () => {
    it('clicking a readonly cell does not turn it into an input field', async () => {
      const readonlyData = [
        [true, false],
        [false, true],
      ];
      render(EditableQueryGrid, { columns: mockColumns.slice(0,2), data: mockData.slice(0,2).map(row => row.slice(0,2)), readonlyCells: readonlyData });
      const readonlyCellValue = mockData[0][0].toString();
      const readonlyCellElement = screen.getByText(readonlyCellValue);
      await fireEvent.click(readonlyCellElement);
      expect(screen.queryByRole('textbox')).toBeNull();
      const editableCellValue = mockData[0][1].toString();
      const editableCellElement = screen.getByText(editableCellValue);
      await fireEvent.click(editableCellElement);
      const inputElement = screen.getByRole('textbox') as HTMLInputElement;
      expect(inputElement).toBeInTheDocument();
      expect(inputElement.value).toBe(editableCellValue);
    });
  });

  describe('Data Binding and Display', () => {
    it('Programmatically updating the `data` prop re-renders the grid', async () => {
      const initialGridData = [['A1', 'B1'], ['A2', 'B2']];
      const initialColumns = ['ColA', 'ColB'];
      const { rerender } = render(EditableQueryGrid, { columns: initialColumns, data: initialGridData });
      expect(screen.getByText('A1')).toBeInTheDocument();
      expect(screen.getByText('B2')).toBeInTheDocument();
      const updatedGridData = [['C1', 'D1'], ['C2', 'D2']];
      await rerender({ columns: initialColumns, data: updatedGridData });
      expect(screen.queryByText('A1')).toBeNull();
      expect(screen.queryByText('B2')).toBeNull();
      expect(screen.getByText('C1')).toBeInTheDocument();
      expect(screen.getByText('D2')).toBeInTheDocument();
    });
  });

  describe('Edit Events', () => {
    // Per user instruction, event-driven tests for Svelte components will be handled by E2E tests.
    it.todo('Successful edit fires an `editCompleted` event with correct data (to be tested in E2E)');
    // TODO: Add test for edit cancellation event if needed (to be tested in E2E)
    // TODO: Add test for edit start event if needed (to be tested in E2E)
  });
});
