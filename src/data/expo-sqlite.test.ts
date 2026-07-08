import { describe, expect, test } from "@jest/globals";
import { ExpoSqliteAdapter } from "@/data/expo-sqlite";

describe("ExpoSqliteAdapter (stub)", () => {
  test("implements the StoragePort shape but refuses to run in unit tests", async () => {
    const adapter = new ExpoSqliteAdapter();

    await expect(adapter.insert("widgets", { id: "w1" })).rejects.toThrow(/unit test/);
    await expect(adapter.findById("widgets", "w1")).rejects.toThrow(/unit test/);
    await expect(adapter.find("widgets")).rejects.toThrow(/unit test/);
    await expect(
      adapter.withTransaction(async () => 1),
    ).rejects.toThrow(/unit test/);
  });
});
