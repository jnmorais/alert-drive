import type { SqlDatabase } from '../eventLog/sqlDatabase';

export function serializeTransactions(database: SqlDatabase): SqlDatabase {
  let queue: Promise<void> = Promise.resolve();
  return {
    execAsync: (source) => database.execAsync(source),
    runAsync: (source, params) => database.runAsync(source, params),
    getAllAsync: (source, params) => database.getAllAsync(source, params),
    getFirstAsync: (source, params) => database.getFirstAsync(source, params),
    withTransactionAsync(task) {
      const run = queue.then(() => database.withTransactionAsync(task));
      queue = run.catch(() => undefined);
      return run;
    },
  };
}
