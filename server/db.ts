import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

export type Suggestion = {
  id: number;
  createdAt: string;
  name: string | null;
  topics: string[];
  message: string;
};

type SuggestionRow = {
  id: number;
  created_at: string;
  name: string | null;
  topics: string;
  message: string;
};

export const VISIT_EVENTS = {
  join: 'clicked_join',
  linkedin: 'clicked_linkedin',
  instagram: 'clicked_instagram',
  suggest: 'suggested',
} as const;

export type VisitEvent = keyof typeof VISIT_EVENTS;

export type VisitStats = {
  total: number;
  today: number;
  mobile: number;
  en: number;
  sources: { source: string; count: number }[];
  /** reach[i] = en az i. bölüme (0'dan) ulaşan ziyaret sayısı */
  reach: number[];
  clicks: { join: number; linkedin: number; instagram: number; suggest: number };
};

export const SECTION_COUNT = 6;

// Türkiye sabit UTC+3 (2016'dan beri yaz saati yok); "bugün" bu saate göre hesaplanır.
const TR_OFFSET = "'+3 hours'";

export type Store = ReturnType<typeof openStore>;

export function openStore(path: string) {
  mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA synchronous = NORMAL;
    PRAGMA busy_timeout = 5000;
    CREATE TABLE IF NOT EXISTS suggestions (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      created_at TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
      name       TEXT,
      topics     TEXT    NOT NULL DEFAULT '[]',
      message    TEXT    NOT NULL DEFAULT ''
    );
    CREATE TABLE IF NOT EXISTS settings (
      key   TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS visits (
      id                TEXT    PRIMARY KEY,
      created_at        TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
      source            TEXT    NOT NULL,
      lang              TEXT    NOT NULL,
      device            TEXT    NOT NULL,
      max_section       INTEGER NOT NULL DEFAULT 0,
      clicked_join      INTEGER NOT NULL DEFAULT 0,
      clicked_linkedin  INTEGER NOT NULL DEFAULT 0,
      clicked_instagram INTEGER NOT NULL DEFAULT 0,
      suggested         INTEGER NOT NULL DEFAULT 0
    ) WITHOUT ROWID;
  `);

  const insertSuggestion = db.prepare(
    'INSERT INTO suggestions (name, topics, message) VALUES (?, ?, ?)',
  );
  const listSuggestions = db.prepare(
    'SELECT id, created_at, name, topics, message FROM suggestions ORDER BY id DESC',
  );
  const deleteSuggestion = db.prepare('DELETE FROM suggestions WHERE id = ?');
  const getSetting = db.prepare('SELECT value FROM settings WHERE key = ?');
  const upsertSetting = db.prepare(
    'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
  );

  const insertVisit = db.prepare(
    'INSERT OR IGNORE INTO visits (id, source, lang, device) VALUES (?, ?, ?, ?)',
  );
  const updateSection = db.prepare('UPDATE visits SET max_section = MAX(max_section, ?) WHERE id = ?');
  const markEvent = Object.fromEntries(
    Object.entries(VISIT_EVENTS).map(([event, column]) => [
      event,
      db.prepare(`UPDATE visits SET ${column} = 1 WHERE id = ?`),
    ]),
  ) as Record<VisitEvent, ReturnType<DatabaseSync['prepare']>>;
  const visitTotals = db.prepare(`
    SELECT COUNT(*)                                                          AS total,
           COALESCE(SUM(date(created_at, ${TR_OFFSET}) = date('now', ${TR_OFFSET})), 0) AS today,
           COALESCE(SUM(device = 'mobile'), 0)     AS mobile,
           COALESCE(SUM(lang = 'en'), 0)           AS en,
           COALESCE(SUM(clicked_join), 0)          AS join_clicks,
           COALESCE(SUM(clicked_linkedin), 0)      AS linkedin,
           COALESCE(SUM(clicked_instagram), 0)     AS instagram,
           COALESCE(SUM(suggested), 0)             AS suggested
    FROM visits
  `);
  const visitSources = db.prepare(
    'SELECT source, COUNT(*) AS count FROM visits GROUP BY source ORDER BY count DESC',
  );
  const visitReach = db.prepare('SELECT max_section, COUNT(*) AS count FROM visits GROUP BY max_section');
  const clearVisits = db.prepare('DELETE FROM visits');

  const toSuggestion = (row: SuggestionRow): Suggestion => ({
    id: row.id,
    createdAt: row.created_at,
    name: row.name,
    topics: JSON.parse(row.topics) as string[],
    message: row.message,
  });

  return {
    addSuggestion(name: string | null, topics: string[], message: string) {
      insertSuggestion.run(name, JSON.stringify(topics), message);
    },
    listSuggestions(): Suggestion[] {
      return (listSuggestions.all() as SuggestionRow[]).map(toSuggestion);
    },
    deleteSuggestion(id: number): boolean {
      return deleteSuggestion.run(id).changes > 0;
    },
    getSetting(key: string): string | null {
      const row = getSetting.get(key) as { value: string } | undefined;
      return row?.value ?? null;
    },
    setSetting(key: string, value: string) {
      upsertSetting.run(key, value);
    },

    addVisit(id: string, source: string, lang: string, device: string) {
      insertVisit.run(id, source, lang, device);
    },
    reachSection(id: string, section: number) {
      updateSection.run(section, id);
    },
    markVisitEvent(id: string, event: VisitEvent) {
      markEvent[event].run(id);
    },
    visitStats(): VisitStats {
      const t = visitTotals.get() as Record<string, number>;
      const reachRows = visitReach.all() as { max_section: number; count: number }[];
      // "en az i. bölüme ulaşan" = max_section >= i olanların toplamı
      const reach = Array.from({ length: SECTION_COUNT }, (_, i) =>
        reachRows.filter((r) => r.max_section >= i).reduce((sum, r) => sum + r.count, 0),
      );
      return {
        total: t.total,
        today: t.today,
        mobile: t.mobile,
        en: t.en,
        sources: visitSources.all() as { source: string; count: number }[],
        reach,
        clicks: { join: t.join_clicks, linkedin: t.linkedin, instagram: t.instagram, suggest: t.suggested },
      };
    },
    clearVisits() {
      clearVisits.run();
    },
  };
}
