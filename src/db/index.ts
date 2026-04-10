import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "./schema";
import path from "path";
import fs from "fs";

const DB_PATH = path.join(process.cwd(), "data", "crm.db");

// Ensure data directory exists
const dataDir = path.dirname(DB_PATH);
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

function createDatabase(): Database.Database {
  const db = new Database(DB_PATH, { timeout: 15000 });

  try { db.pragma("journal_mode = WAL"); } catch { /* already set */ }
  try { db.pragma("busy_timeout = 15000"); } catch { /* ignore */ }
  try { db.pragma("foreign_keys = ON"); } catch { /* ignore */ }

  return db;
}

function initTables(db: Database.Database): void {
  const tables = [
    `CREATE TABLE IF NOT EXISTS companies (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      industry TEXT,
      website TEXT,
      email TEXT,
      phone TEXT,
      address TEXT,
      notes TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS contacts (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT,
      phone TEXT,
      company TEXT,
      company_id TEXT REFERENCES companies(id),
      source TEXT NOT NULL DEFAULT 'otro',
      temperature TEXT NOT NULL DEFAULT 'cold',
      score INTEGER NOT NULL DEFAULT 0,
      notes TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS pipeline_stages (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      "order" INTEGER NOT NULL,
      color TEXT NOT NULL DEFAULT '#64748b',
      is_won INTEGER NOT NULL DEFAULT 0,
      is_lost INTEGER NOT NULL DEFAULT 0
    )`,
    `CREATE TABLE IF NOT EXISTS deals (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      value INTEGER NOT NULL DEFAULT 0,
      stage_id TEXT NOT NULL REFERENCES pipeline_stages(id),
      contact_id TEXT NOT NULL REFERENCES contacts(id),
      company_id TEXT REFERENCES companies(id),
      expected_close INTEGER,
      probability INTEGER NOT NULL DEFAULT 0,
      notes TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS activities (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL,
      description TEXT NOT NULL,
      contact_id TEXT NOT NULL REFERENCES contacts(id),
      deal_id TEXT REFERENCES deals(id),
      scheduled_at INTEGER,
      completed_at INTEGER,
      created_at INTEGER NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      type TEXT,
      status TEXT NOT NULL DEFAULT 'active',
      description TEXT,
      company_id TEXT REFERENCES companies(id),
      notes TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS subprojects (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active',
      project_id TEXT NOT NULL REFERENCES projects(id),
      start_date INTEGER,
      end_date INTEGER,
      notes TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS tasks (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT,
      status TEXT NOT NULL DEFAULT 'sin_empezar',
      priority TEXT NOT NULL DEFAULT 'medium',
      due_date INTEGER,
      contact_id TEXT REFERENCES contacts(id),
      company_id TEXT REFERENCES companies(id),
      deal_id TEXT REFERENCES deals(id),
      project_id TEXT REFERENCES projects(id),
      subproject_id TEXT REFERENCES subprojects(id),
      completed_at INTEGER,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS task_comments (
      id TEXT PRIMARY KEY,
      task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
      content TEXT NOT NULL,
      author TEXT NOT NULL DEFAULT 'Usuario',
      created_at INTEGER NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS crm_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    )`,
  ];

  for (const sql of tables) {
    try { db.exec(sql); } catch { /* already exists */ }
  }

  // ALTER TABLE migrations — wrapped individually, SQLite has no IF NOT EXISTS for columns
  const columnMigrations = [
    `ALTER TABLE contacts ADD COLUMN company_id TEXT REFERENCES companies(id)`,
    `ALTER TABLE deals ADD COLUMN company_id TEXT REFERENCES companies(id)`,
    `ALTER TABLE tasks ADD COLUMN company_id TEXT REFERENCES companies(id)`,
    `ALTER TABLE tasks ADD COLUMN project_id TEXT REFERENCES projects(id)`,
    `ALTER TABLE tasks ADD COLUMN subproject_id TEXT REFERENCES subprojects(id)`,
  ];

  for (const sql of columnMigrations) {
    try { db.exec(sql); } catch { /* column already exists */ }
  }

  // Migrate legacy task statuses to current statuses
  const statusMigrations = [
    `UPDATE tasks SET status = 'sin_empezar' WHERE status = 'pending'`,
    `UPDATE tasks SET status = 'en_curso'    WHERE status = 'in_progress'`,
    `UPDATE tasks SET status = 'listo'       WHERE status = 'done'`,
    // mc_trabajando was removed — map to en_curso
    `UPDATE tasks SET status = 'en_curso'    WHERE status = 'mc_trabajando'`,
  ];

  for (const sql of statusMigrations) {
    try { db.exec(sql); } catch { /* ignore */ }
  }
}

function seedDefaultStages(db: Database.Database): void {
  try {
    const result = db
      .prepare("SELECT COUNT(*) as count FROM pipeline_stages")
      .get() as { count: number } | undefined;

    if (!result || result.count > 0) return;

    const defaultStages = [
      { name: "Prospecto",      order: 1, color: "#64748b", isWon: 0, isLost: 0 },
      { name: "Contactado",     order: 2, color: "#2563eb", isWon: 0, isLost: 0 },
      { name: "Propuesta",      order: 3, color: "#8b5cf6", isWon: 0, isLost: 0 },
      { name: "Negociacion",    order: 4, color: "#ea580c", isWon: 0, isLost: 0 },
      { name: "Cerrado Ganado", order: 5, color: "#16a34a", isWon: 1, isLost: 0 },
      { name: "Cerrado Perdido",order: 6, color: "#dc2626", isWon: 0, isLost: 1 },
    ];

    const insert = db.prepare(
      `INSERT OR IGNORE INTO pipeline_stages (id, name, "order", color, is_won, is_lost) VALUES (?, ?, ?, ?, ?, ?)`
    );

    const seedAll = db.transaction(() => {
      for (const stage of defaultStages) {
        insert.run(crypto.randomUUID(), stage.name, stage.order, stage.color, stage.isWon, stage.isLost);
      }
    });
    seedAll();
  } catch { /* another worker may have seeded */ }
}

/**
 * Sync companies from contacts.company text field.
 * Creates a company record for each unique company name found in contacts,
 * then links contacts to the company via company_id.
 * This ensures one source of truth: the companies table.
 */
function syncCompaniesFromContacts(db: Database.Database): void {
  try {
    const contactsWithCompany = db
      .prepare(
        `SELECT DISTINCT company FROM contacts
         WHERE company IS NOT NULL AND company != '' AND company_id IS NULL`
      )
      .all() as Array<{ company: string }>;

    if (contactsWithCompany.length === 0) return;

    const now = Math.floor(Date.now() / 1000);

    for (const { company } of contactsWithCompany) {
      // Find or create the company by name
      let existing = db
        .prepare(`SELECT id FROM companies WHERE name = ?`)
        .get(company) as { id: string } | undefined;

      if (!existing) {
        const id = crypto.randomUUID();
        db.prepare(
          `INSERT INTO companies (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)`
        ).run(id, company, now, now);
        existing = { id };
      }

      // Link all contacts with this company name to the company record
      db.prepare(
        `UPDATE contacts SET company_id = ? WHERE company = ? AND company_id IS NULL`
      ).run(existing.id, company);
    }
  } catch {
    // Sync is non-critical — can fail silently
  }
}

const sqlite = createDatabase();
initTables(sqlite);
seedDefaultStages(sqlite);
syncCompaniesFromContacts(sqlite);

export const db = drizzle(sqlite, { schema });
