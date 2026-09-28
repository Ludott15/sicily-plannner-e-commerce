import type { Sql } from "postgres";

export function withDb<T>(fn: (sql: Sql) => Promise<T>): Promise<T>;
