// @vitest-environment node
/**
 * core.app_settings against a real Postgres: a save returns its time and the entry read carries it.
 * Runs only when TEST_DATABASE_URL points at a migrated database.
 */
import { randomUUID } from "node:crypto";

import { afterAll, describe, expect, it } from "vitest";

const url = process.env.TEST_DATABASE_URL;

// `lib/db/client` reads DATABASE_URL when it is first imported.
if (url) process.env.DATABASE_URL = url;

const key = `test_setting_${randomUUID().slice(0, 8)}`;

describe.skipIf(!url)("app settings repository (test DB)", async () => {
  const repo = await import("./app-settings-repository");

  afterAll(async () => {
    await repo.setAppSetting(key, null);
  });

  it("returns the save time on insert and update, and reads it back", async () => {
    expect(await repo.getAppSettingEntry(key)).toBeNull();

    const first = await repo.setAppSetting(key, '{"a":1}');
    expect(first).toBeInstanceOf(Date);
    expect(await repo.getAppSettingEntry(key)).toEqual({ value: '{"a":1}', updatedAt: first });

    const second = await repo.setAppSetting(key, '{"a":2}');
    expect(second!.getTime()).toBeGreaterThanOrEqual(first!.getTime());
    expect(await repo.getAppSettingEntry(key)).toEqual({ value: '{"a":2}', updatedAt: second });
  });

  it("removes the setting with null", async () => {
    await repo.setAppSetting(key, "x");
    expect(await repo.setAppSetting(key, null)).toBeNull();
    expect(await repo.getAppSetting(key)).toBeNull();
  });
});
