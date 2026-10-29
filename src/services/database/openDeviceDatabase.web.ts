import type { SqlDatabase } from '../eventLog/sqlDatabase';

export async function openDeviceDatabase(): Promise<SqlDatabase> {
  throw new Error('A versão web não grava dados no aparelho.');
}
