import type { Query, StoragePort } from "@/data/port";

/**
 * Production storage adapter — `expo-sqlite` backed.
 *
 * STATUS: compiling stub. Every method throws so the unit-test suite (which
 * runs against `InMemoryAdapter` only, per the PRD testing decision) can never
 * accidentally exercise real SQL. The real implementation — schema, migrations,
 * and translating the port to SQL — is a separate non-TDD task that lands once
 * the repository (#02–#07) is stable; it is verified by device smoke against
 * the in-memory adapter's behaviour, not by Jest.
 */
const NOT_IN_UNIT_TEST =
  "expo-sqlite adapter is not exercised in unit tests (PRD testing decision); run on a device.";

export class ExpoSqliteAdapter implements StoragePort {
  async withTransaction<T>(_fn: () => Promise<T>): Promise<T> {
    throw new Error(NOT_IN_UNIT_TEST);
  }

  async insert<T>(_table: string, _row: T): Promise<T> {
    throw new Error(NOT_IN_UNIT_TEST);
  }

  async findById<T>(_table: string, _id: string): Promise<T | null> {
    throw new Error(NOT_IN_UNIT_TEST);
  }

  async update<T>(_table: string, _id: string, _patch: Partial<T>): Promise<T | null> {
    throw new Error(NOT_IN_UNIT_TEST);
  }

  async find<T>(_table: string, _query?: Query<T>): Promise<T[]> {
    throw new Error(NOT_IN_UNIT_TEST);
  }
}
