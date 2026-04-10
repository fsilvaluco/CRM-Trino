// Server-only: reads/writes locale settings from the crmSettings table.
// Do NOT import this file in client components.

import { db } from "@/db";
import { crmSettings } from "@/db/schema";
import { eq } from "drizzle-orm";
import { DEFAULT_LOCALE, type LocaleSettings } from "./locale";

const SETTINGS_KEY = "locale";

export function getLocaleSettings(): LocaleSettings {
  const row = db
    .select()
    .from(crmSettings)
    .where(eq(crmSettings.key, SETTINGS_KEY))
    .get();

  if (!row) return { ...DEFAULT_LOCALE };

  try {
    return { ...DEFAULT_LOCALE, ...(JSON.parse(row.value) as Partial<LocaleSettings>) };
  } catch {
    return { ...DEFAULT_LOCALE };
  }
}

export function saveLocaleSettings(settings: LocaleSettings): void {
  const value = JSON.stringify(settings);
  const existing = db
    .select()
    .from(crmSettings)
    .where(eq(crmSettings.key, SETTINGS_KEY))
    .get();

  if (existing) {
    db.update(crmSettings)
      .set({ value })
      .where(eq(crmSettings.key, SETTINGS_KEY))
      .run();
  } else {
    db.insert(crmSettings).values({ key: SETTINGS_KEY, value }).run();
  }
}
