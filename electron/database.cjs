const Database = require("better-sqlite3");
const path = require("path");
const { app } = require("electron");

let db = null;

function getDbPath() {
  return path.join(app.getPath("userData"), "studyhub.db");
}

function closeDb() {
  if (!db) return;
  try {
    db.close();
  } finally {
    db = null;
  }
}

function getDb() {
  if (db) return db;

  db = new Database(getDbPath());
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");

  initSchema(db);
  runMigrations(db);
  return db;
}

function hasColumn(dbRef, table, column) {
  return dbRef.prepare(`PRAGMA table_info(${table})`).all().some((col) => col.name === column);
}

function addColumn(dbRef, table, column, definition) {
  if (!hasColumn(dbRef, table, column)) {
    dbRef.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}

/**
 * Numbered, forward-only migrations. Each runs once inside a transaction and records
 * its version in schema_version. Never edit a shipped migration; append a new one.
 */
const MIGRATIONS = [
  {
    version: 2,
    up(dbRef) {
      addColumn(dbRef, "courses", "bb_course_id", "TEXT");
      addColumn(dbRef, "courses", "subtitle", "TEXT");
      addColumn(dbRef, "courses", "term", "TEXT");
      addColumn(dbRef, "courses", "course_code", "TEXT");
      addColumn(dbRef, "courses", "instructor", "TEXT");
      addColumn(dbRef, "courses", "meta_json", "TEXT");
      dbRef.exec("CREATE INDEX IF NOT EXISTS idx_courses_bb ON courses(bb_course_id)");

      addColumn(dbRef, "modules", "disabled", "INTEGER NOT NULL DEFAULT 0");

      addColumn(dbRef, "grade_components", "uuid", "TEXT");
      dbRef.exec("UPDATE grade_components SET uuid = 'gc_' || id WHERE uuid IS NULL");
      dbRef.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_grade_components_uuid ON grade_components(uuid)");
      dbRef.exec("CREATE INDEX IF NOT EXISTS idx_grade_components_course ON grade_components(course_id)");

      addColumn(dbRef, "grade_entries", "is_main", "INTEGER NOT NULL DEFAULT 0");
      dbRef.exec(`
        UPDATE grade_entries SET is_main = 1
        WHERE label IS NULL
           OR label = (SELECT name FROM grade_components gc WHERE gc.id = grade_entries.component_id)
      `);
      dbRef.exec("CREATE INDEX IF NOT EXISTS idx_grade_entries_component ON grade_entries(component_id)");
    },
  },
  {
    version: 3,
    up(dbRef) {
      addColumn(dbRef, "assignments", "bb_id", "TEXT");
      addColumn(dbRef, "assignments", "source", "TEXT NOT NULL DEFAULT 'manual'");
      addColumn(dbRef, "assignments", "url", "TEXT");
      addColumn(dbRef, "assignments", "kind", "TEXT NOT NULL DEFAULT 'assignment'");
      addColumn(dbRef, "assignments", "points_possible", "REAL");
      addColumn(dbRef, "assignments", "score", "REAL");
      addColumn(dbRef, "assignments", "updated_at", "TEXT");
      dbRef.exec(
        "CREATE UNIQUE INDEX IF NOT EXISTS idx_assignments_bb ON assignments(course_id, bb_id) WHERE bb_id IS NOT NULL"
      );
      dbRef.exec("CREATE INDEX IF NOT EXISTS idx_assignments_course ON assignments(course_id)");

      dbRef.exec(`
        CREATE TABLE IF NOT EXISTS announcements (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          uuid TEXT NOT NULL UNIQUE,
          course_id INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
          bb_id TEXT,
          title TEXT NOT NULL,
          body TEXT,
          posted_at TEXT,
          read INTEGER NOT NULL DEFAULT 0,
          created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );
        CREATE UNIQUE INDEX IF NOT EXISTS idx_announcements_bb
          ON announcements(course_id, bb_id) WHERE bb_id IS NOT NULL;
        CREATE INDEX IF NOT EXISTS idx_announcements_course ON announcements(course_id, posted_at);

        CREATE TABLE IF NOT EXISTS bb_items (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          course_id INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
          bb_id TEXT NOT NULL,
          parent_bb_id TEXT,
          title TEXT NOT NULL,
          kind TEXT,
          url TEXT,
          imported INTEGER NOT NULL DEFAULT 0,
          position INTEGER NOT NULL DEFAULT 0,
          synced_at TEXT NOT NULL DEFAULT (datetime('now')),
          UNIQUE(course_id, bb_id)
        );

        CREATE TABLE IF NOT EXISTS bb_grade_items (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          course_id INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
          bb_id TEXT NOT NULL,
          name TEXT NOT NULL,
          score REAL,
          points_possible REAL,
          graded_at TEXT,
          synced_at TEXT NOT NULL DEFAULT (datetime('now')),
          UNIQUE(course_id, bb_id)
        );
      `);
    },
  },
  {
    version: 4,
    up(dbRef) {
      dbRef.exec(`
        CREATE TABLE IF NOT EXISTS study_sessions (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          uuid TEXT NOT NULL UNIQUE,
          course_id INTEGER REFERENCES courses(id) ON DELETE CASCADE,
          kind TEXT NOT NULL DEFAULT 'drill',
          started_at TEXT NOT NULL,
          ended_at TEXT,
          cards_reviewed INTEGER NOT NULL DEFAULT 0,
          correct INTEGER NOT NULL DEFAULT 0,
          incorrect INTEGER NOT NULL DEFAULT 0
        );
        CREATE INDEX IF NOT EXISTS idx_sessions_course ON study_sessions(course_id, started_at);

        CREATE TABLE IF NOT EXISTS web_resources (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          uuid TEXT NOT NULL UNIQUE,
          course_id INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
          module_id INTEGER REFERENCES modules(id) ON DELETE SET NULL,
          title TEXT NOT NULL,
          url TEXT NOT NULL,
          summary TEXT,
          source TEXT NOT NULL DEFAULT 'web',
          saved_at TEXT NOT NULL DEFAULT (datetime('now'))
        );
        CREATE INDEX IF NOT EXISTS idx_web_resources_course ON web_resources(course_id);
      `);
      dbRef.exec("DELETE FROM settings WHERE key = 'apiKey'");
    },
  },
  {
    version: 5,
    up(dbRef) {
      // component_uuid: manual override of the auto match ('none' = excluded from the calculator).
      dbRef.exec(`
        ALTER TABLE bb_grade_items ADD COLUMN category TEXT;
        ALTER TABLE bb_grade_items ADD COLUMN component_uuid TEXT;
      `);
    },
  },
];

function runMigrations(dbRef) {
  const current = dbRef.prepare("SELECT COALESCE(MAX(version), 1) AS v FROM schema_version").get().v;
  for (const migration of MIGRATIONS) {
    if (migration.version <= current) continue;
    const apply = dbRef.transaction(() => {
      migration.up(dbRef);
      dbRef.prepare("INSERT INTO schema_version (version) VALUES (?)").run(migration.version);
    });
    apply();
  }
}

function initSchema(dbRef) {
  dbRef.exec(`
    CREATE TABLE IF NOT EXISTS schema_version (
      version INTEGER PRIMARY KEY,
      applied_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS courses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      uuid TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      type TEXT NOT NULL DEFAULT 'user',
      color TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS modules (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      uuid TEXT NOT NULL UNIQUE,
      course_id INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      position INTEGER NOT NULL DEFAULT 0,
      reviewed INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_modules_course ON modules(course_id);

    CREATE TABLE IF NOT EXISTS notes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      module_id INTEGER NOT NULL UNIQUE REFERENCES modules(id) ON DELETE CASCADE,
      html TEXT NOT NULL DEFAULT '',
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS content_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      uuid TEXT NOT NULL UNIQUE,
      module_id INTEGER NOT NULL REFERENCES modules(id) ON DELETE CASCADE,
      section_type TEXT NOT NULL DEFAULT 'definitions',
      section_title TEXT,
      term TEXT,
      definition TEXT,
      body TEXT,
      items_json TEXT,
      is_numbered INTEGER DEFAULT 0,
      confidence TEXT DEFAULT 'high',
      source TEXT DEFAULT 'pptx',
      enhanced_by_ai INTEGER DEFAULT 0,
      position INTEGER DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_content_module ON content_items(module_id);

    CREATE TABLE IF NOT EXISTS flashcards (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      uuid TEXT NOT NULL UNIQUE,
      course_id INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
      module_id INTEGER REFERENCES modules(id) ON DELETE SET NULL,
      content_item_id INTEGER REFERENCES content_items(id) ON DELETE SET NULL,
      front TEXT NOT NULL,
      back TEXT NOT NULL,
      source TEXT DEFAULT 'pptx',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_flashcards_course ON flashcards(course_id);

    CREATE TABLE IF NOT EXISTS mastery (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      flashcard_id INTEGER NOT NULL UNIQUE REFERENCES flashcards(id) ON DELETE CASCADE,
      ease_factor REAL NOT NULL DEFAULT 2.5,
      interval_days INTEGER NOT NULL DEFAULT 0,
      repetitions INTEGER NOT NULL DEFAULT 0,
      next_review TEXT NOT NULL DEFAULT (date('now')),
      last_review TEXT,
      last_grade INTEGER,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_mastery_next_review ON mastery(next_review);

    CREATE TABLE IF NOT EXISTS card_reviews (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      flashcard_id INTEGER NOT NULL REFERENCES flashcards(id) ON DELETE CASCADE,
      grade INTEGER NOT NULL,
      reviewed_at TEXT NOT NULL DEFAULT (datetime('now')),
      session_id TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_reviews_card ON card_reviews(flashcard_id);

    CREATE TABLE IF NOT EXISTS glossary_terms (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      uuid TEXT NOT NULL UNIQUE,
      course_id INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
      module_id INTEGER REFERENCES modules(id) ON DELETE SET NULL,
      content_item_id INTEGER REFERENCES content_items(id) ON DELETE SET NULL,
      term TEXT NOT NULL,
      definition TEXT NOT NULL,
      confidence TEXT DEFAULT 'high',
      source TEXT DEFAULT 'pptx',
      added_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_glossary_course ON glossary_terms(course_id);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_glossary_unique_term
      ON glossary_terms(course_id, lower(trim(term)));

    CREATE TABLE IF NOT EXISTS materials (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      module_id INTEGER NOT NULL REFERENCES modules(id) ON DELETE CASCADE,
      filename TEXT NOT NULL,
      filepath TEXT NOT NULL,
      file_type TEXT,
      imported_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS grade_components (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      course_id INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      weight REAL NOT NULL,
      category TEXT DEFAULT 'other',
      position INTEGER DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS grade_entries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      component_id INTEGER NOT NULL REFERENCES grade_components(id) ON DELETE CASCADE,
      score REAL,
      max_score REAL NOT NULL DEFAULT 100,
      label TEXT,
      graded_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS assignments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      uuid TEXT NOT NULL UNIQUE,
      course_id INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
      component_id INTEGER REFERENCES grade_components(id) ON DELETE SET NULL,
      title TEXT NOT NULL,
      due_date TEXT,
      est_minutes INTEGER,
      completed INTEGER DEFAULT 0,
      notes TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_assignments_due ON assignments(due_date);

    CREATE TABLE IF NOT EXISTS attendance (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      course_id INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
      date TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'absent',
      notes TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS attendance_policy (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      course_id INTEGER NOT NULL UNIQUE REFERENCES courses(id) ON DELETE CASCADE,
      max_absences INTEGER,
      penalty_type TEXT,
      penalty_after INTEGER,
      raw_policy_text TEXT
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    INSERT OR IGNORE INTO settings VALUES
      ('theme', 'dark', datetime('now')),
      ('smDailyLimit', '20', datetime('now'));

    INSERT OR IGNORE INTO schema_version VALUES (1, datetime('now'));
  `);
}

module.exports = { getDb, getDbPath, closeDb };
