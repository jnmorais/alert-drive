import { jest } from '@jest/globals';

import type { SqlDatabase, SqlValue } from '../services/eventLog/sqlDatabase';

interface NodeStatement {
  run(...params: SqlValue[]): { lastInsertRowid: number | bigint; changes: number | bigint };
  all(...params: SqlValue[]): unknown[];
  get(...params: SqlValue[]): unknown;
}

interface NodeDatabase {
  exec(source: string): void;
  prepare(source: string): NodeStatement;
  close(): void;
}

interface NodeSqliteModule {
  DatabaseSync: new (path: string) => NodeDatabase;
}

export interface TestDatabase extends SqlDatabase {
  close(): void;
}

function plain<T>(row: unknown): T {
  return { ...(row as object) } as T;
}

export function createNodeSqliteDatabase(): TestDatabase {
  const { DatabaseSync } = jest.requireActual<NodeSqliteModule>('node:sqlite');
  const database = new DatabaseSync(':memory:');
  return {
    async execAsync(source) {
      database.exec(source);
    },
    async runAsync(source, params) {
      const result = database.prepare(source).run(...params);
      return { lastInsertRowId: Number(result.lastInsertRowid), changes: Number(result.changes) };
    },
    async getAllAsync<T>(source: string, params: SqlValue[]) {
      return database.prepare(source).all(...params).map((row) => plain<T>(row));
    },
    async getFirstAsync<T>(source: string, params: SqlValue[]) {
      const row = database.prepare(source).get(...params);
      return row === undefined ? null : plain<T>(row);
    },
    async withTransactionAsync(task) {
      database.exec('BEGIN');
      try {
        await task();
        database.exec('COMMIT');
      } catch (error) {
        database.exec('ROLLBACK');
        throw error;
      }
    },
    close() {
      database.close();
    },
  };
}
