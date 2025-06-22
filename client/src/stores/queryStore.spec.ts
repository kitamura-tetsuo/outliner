import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import queryStore from './queryStore.svelte';

describe('queryStore.svelte.ts', () => {
  // Define mocks at the top level of the main describe block
  const mockSuccessFn = vi.fn();
  const mockErrorFn = vi.fn();

  beforeEach(() => {
    queryStore.resetStore();
    // Reset mocks before each test
    mockSuccessFn.mockReset();
    mockErrorFn.mockReset();
  });

  afterEach(() => {
    // vi.restoreAllMocks(); // Can be useful if other types of mocks are used
  });

  it('should have correct initial state', () => {
    expect(queryStore.query).toBe('');
    expect(queryStore.isRunning).toBe(false);
    expect(queryStore.result).toBeNull();
    expect(queryStore.error).toBeNull();
    expect(queryStore.lastExecutedQuery).toBeNull();
  });

  it('setQuery should update the query string', () => {
    const newQuery = 'SELECT * FROM users;';
    queryStore.setQuery(newQuery);
    expect(queryStore.query).toBe(newQuery);
  });

  describe('Store State Management', () => {
    it('should correctly overwrite state on consecutive executeQuery calls (success then failure)', async () => {
      const successQuery = 'SELECT "success";';
      const successResult = [{ result: 'success' }];
      const failureQuery = 'SELECT "failure";';
      const failureError = 'Simulated failure';

      mockSuccessFn.mockResolvedValueOnce(successResult);
      mockErrorFn.mockRejectedValueOnce(new Error(failureError));

      await queryStore.executeQuery(successQuery, mockSuccessFn);
      expect(queryStore.result).toEqual(successResult);
      expect(queryStore.error).toBeNull();
      expect(queryStore.lastExecutedQuery).toBe(successQuery);

      await queryStore.executeQuery(failureQuery, mockErrorFn);
      expect(queryStore.result).toBeNull();
      expect(queryStore.error).toBe(failureError);
      expect(queryStore.lastExecutedQuery).toBe(failureQuery);
    });

    it('should correctly overwrite state on consecutive executeQuery calls (failure then success)', async () => {
      const failureQuery = 'SELECT "failure";';
      const failureError = 'Simulated failure';
      const successQuery = 'SELECT "success";';
      const successResult = [{ result: 'success' }];

      mockErrorFn.mockRejectedValueOnce(new Error(failureError));
      mockSuccessFn.mockResolvedValueOnce(successResult);

      await queryStore.executeQuery(failureQuery, mockErrorFn);
      expect(queryStore.result).toBeNull();
      expect(queryStore.error).toBe(failureError);
      expect(queryStore.lastExecutedQuery).toBe(failureQuery);

      await queryStore.executeQuery(successQuery, mockSuccessFn);
      expect(queryStore.result).toEqual(successResult);
      expect(queryStore.error).toBeNull();
      expect(queryStore.lastExecutedQuery).toBe(successQuery);
    });

    it('setQuery should not affect lastExecutedQuery', async () => {
      const firstQuery = 'SELECT 1;';
      const firstResult = [{ result: 1 }];
      mockSuccessFn.mockResolvedValueOnce(firstResult);

      await queryStore.executeQuery(firstQuery, mockSuccessFn);
      expect(queryStore.lastExecutedQuery).toBe(firstQuery);

      const newTypingQuery = 'SELECT 2;';
      queryStore.setQuery(newTypingQuery);

      expect(queryStore.query).toBe(newTypingQuery);
      expect(queryStore.lastExecutedQuery).toBe(firstQuery);
    });
  });

  describe('executeQuery', () => {
    it('should handle successful query execution', async () => {
      const testQuery = 'SELECT name FROM products;';
      const mockResults = [{ name: 'Laptop' }, { name: 'Mouse' }];
      mockSuccessFn.mockResolvedValue(mockResults);
      await queryStore.executeQuery(testQuery, mockSuccessFn);
      expect(queryStore.isRunning).toBe(false);
      expect(queryStore.result).toEqual(mockResults);
      expect(queryStore.error).toBeNull();
      expect(queryStore.lastExecutedQuery).toBe(testQuery);
      expect(mockSuccessFn).toHaveBeenCalledWith(testQuery);
    });

    it('should handle failed query execution', async () => {
      const testQuery = 'SELECT * FROM non_existent_table;';
      const errorMessage = 'Table not found';
      mockErrorFn.mockRejectedValue(new Error(errorMessage));
      await queryStore.executeQuery(testQuery, mockErrorFn);
      expect(queryStore.isRunning).toBe(false);
      expect(queryStore.result).toBeNull();
      expect(queryStore.error).toBe(errorMessage);
      expect(queryStore.lastExecutedQuery).toBe(testQuery);
      expect(mockErrorFn).toHaveBeenCalledWith(testQuery);
    });

    it('should set error if query is empty', async () => {
      await queryStore.executeQuery('', mockSuccessFn);
      expect(queryStore.error).toBe('Query cannot be empty.');
      expect(queryStore.result).toBeNull();
      expect(queryStore.isRunning).toBe(false);
      expect(mockSuccessFn).not.toHaveBeenCalled();
    });

    it('should pass long and complex SQL strings to executionFn as is', async () => {
      const longQuery = `
        SELECT
          t1.column1, t1.column2, t2.columnA, t2.columnB,
          CASE
            WHEN t1.column3 > 100 THEN 'High'
            WHEN t1.column3 BETWEEN 50 AND 100 THEN 'Medium'
            ELSE 'Low'
          END as category,
          SUM(t2.numeric_value) OVER (PARTITION BY t1.id ORDER BY t2.date) as running_total
        FROM
          table1 t1
        JOIN
          table2 t2 ON t1.id = t2.t1_id
        WHERE
          t1.date_column >= '2023-01-01'
          AND t2.status = 'active'
          AND (t1.description LIKE '%complex%' OR t2.notes IS NULL)
        GROUP BY
          t1.id, t1.column1, t1.column2, t2.columnA, t2.columnB, t1.column3, t2.numeric_value, t2.date
        HAVING
          COUNT(t2.id) > 0
        ORDER BY
          t1.column1, t2.date DESC
        LIMIT 100 OFFSET 10;
      `;
      const specialCharQuery = "SELECT * FROM users WHERE name = 'O''Malley' AND notes LIKE '%!@#$%^&*()_+%';";
      mockSuccessFn.mockResolvedValue([]);
      await queryStore.executeQuery(longQuery, mockSuccessFn);
      expect(mockSuccessFn).toHaveBeenCalledWith(longQuery);
      expect(queryStore.lastExecutedQuery).toBe(longQuery);
      await queryStore.executeQuery(specialCharQuery, mockSuccessFn);
      expect(mockSuccessFn).toHaveBeenCalledWith(specialCharQuery);
      expect(queryStore.lastExecutedQuery).toBe(specialCharQuery);
    });

    it('should correctly extract error message from string-only errors thrown by executionFn', async () => {
      const testQuery = 'SELECT 1/0;';
      const errorMessageString = 'Division by zero';
      mockErrorFn.mockRejectedValue(errorMessageString);
      await queryStore.executeQuery(testQuery, mockErrorFn);
      expect(queryStore.error).toBe(errorMessageString);
    });

    it('should correctly extract error message from custom error objects thrown by executionFn', async () => {
      const testQuery = 'SELECT * FROM restricted_data;';
      const customError = { code: 403, message: 'Access denied to restricted_data' };
      mockErrorFn.mockRejectedValue(customError);
      await queryStore.executeQuery(testQuery, mockErrorFn);
      expect(queryStore.error).toBe(customError.message);
    });

    it('should use a generic error message if the thrown error has no message property', async () => {
      const testQuery = 'SELECT * FROM unknown_error_source;';
      const unknownError = { code: 500, details: 'Something went very wrong' };
      mockErrorFn.mockRejectedValue(unknownError);
      await queryStore.executeQuery(testQuery, mockErrorFn);
      expect(queryStore.error).toBe('An unknown error occurred during query execution.');
    });

    it('isRunning should be true during execution and false after (success or failure)', async () => {
      const testQuery = 'SELECT 1;';
      let resolveExecution: (value: QueryResult) => void = () => {};
      const executionPromise = new Promise<QueryResult>(resolve => { resolveExecution = resolve; });
      mockSuccessFn.mockReturnValue(executionPromise);
      const execution = queryStore.executeQuery(testQuery, mockSuccessFn);
      expect(queryStore.isRunning).toBe(true);
      resolveExecution([]);
      await execution;
      expect(queryStore.isRunning).toBe(false);
      let rejectExecution: (reason?: any) => void = () => {};
      const errorExecutionPromise = new Promise<QueryResult>((resolve, reject) => { rejectExecution = reject; });
      mockErrorFn.mockReturnValue(errorExecutionPromise);
      const errorRun = queryStore.executeQuery(testQuery, mockErrorFn);
      expect(queryStore.isRunning).toBe(true);
      rejectExecution(new Error('Failed again'));
      try { await errorRun; } catch (e) { /* Expected */ }
      expect(queryStore.isRunning).toBe(false);
    });
  });

  it('clearResult should reset result and error', async () => {
    const mockExec = vi.fn().mockResolvedValue([{ id: 1 }]);
    await queryStore.executeQuery('SELECT 1 FOR CLEAR_RESULT_SETUP_SUCCESS', mockExec);
    const mockErrorExec = vi.fn().mockRejectedValue(new Error("clear test error"));
    await queryStore.executeQuery('ERROR QUERY FOR CLEAR_RESULT_SETUP', mockErrorExec);
    expect(queryStore.error).toBe("clear test error");
    await queryStore.executeQuery('SELECT 2 FOR CLEAR_RESULT_SETUP_SUCCESS_AFTER_ERROR', mockExec);
    expect(queryStore.result).not.toBeNull();
    queryStore.clearResult();
    expect(queryStore.result).toBeNull();
    expect(queryStore.error).toBeNull();
  });

  it('resetStore should reset store to initial state, keeping current query', async () => {
    const currentQuery = 'SELECT * FROM test';
    queryStore.setQuery(currentQuery);
    const mockExec = vi.fn().mockResolvedValue([{ id: 1 }]);
    await queryStore.executeQuery('OLD QUERY FOR RESET_STORE_SETUP', mockExec);
    const mockErrorExec = vi.fn().mockRejectedValue(new Error("reset test error"));
    await queryStore.executeQuery('ERROR PRODUCING QUERY FOR RESET_STORE_SETUP', mockErrorExec);
    expect(queryStore.lastExecutedQuery).toBe('ERROR PRODUCING QUERY FOR RESET_STORE_SETUP');
    expect(queryStore.error).toBe('reset test error');
    queryStore.resetStore();
    expect(queryStore.query).toBe(currentQuery);
    expect(queryStore.isRunning).toBe(false);
    expect(queryStore.result).toBeNull();
    expect(queryStore.error).toBeNull();
    expect(queryStore.lastExecutedQuery).toBeNull();
  });
});
