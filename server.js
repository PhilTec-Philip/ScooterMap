import express from "express";
import mysql from "mysql2/promise";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();
const port = Number(process.env.PORT || 3000);

const pool = mysql.createPool({
  host: process.env.DB_HOST || "127.0.0.1",
  user: process.env.DB_USER || "root",
  password: process.env.DB_PASSWORD || "root",
  database: process.env.DB_NAME || "scootermap",
  charset: "utf8mb4",
  waitForConnections: true,
  connectionLimit: 10
});

app.use(express.json({ limit: "256kb" }));
app.use(express.static(__dirname));

app.get("/api/health", async (_request, response) => {
  try {
    await pool.query("SELECT 1");
    response.json({ ok: true });
  } catch (error) {
    response.status(500).json({ ok: false, error: error.message });
  }
});

app.get("/api/reports", async (_request, response) => {
  const [rows] = await pool.query(
    `SELECT id, category, type, severity, duration, description, geometry,
            created_at AS createdAt, confirmations, disputes
       FROM reports
      ORDER BY created_at DESC
      LIMIT 1000`
  );

  response.json(rows.map(normalizeReportRow));
});

app.post("/api/reports", async (request, response) => {
  const report = request.body;

  if (!isValidReport(report)) {
    response.status(400).json({ error: "Invalid report payload" });
    return;
  }

  await pool.execute(
    `INSERT IGNORE INTO reports
      (id, category, type, severity, duration, description, geometry, created_at, confirmations, disputes)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, 0)`,
    [
      report.id,
      report.category,
      report.type,
      report.severity,
      report.duration,
      report.description,
      JSON.stringify(report.geometry),
      new Date(report.createdAt)
    ]
  );

  response.status(201).json(report);
});

app.delete("/api/reports", async (_request, response) => {
  await pool.execute("DELETE FROM reports");
  response.json({ ok: true });
});

app.post("/api/reports/:id/vote", async (request, response) => {
  const { id } = request.params;
  const { voterId, field } = request.body;

  if (!voterId || !["confirmations", "disputes"].includes(field)) {
    response.status(400).json({ error: "Invalid vote payload" });
    return;
  }

  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    const [voteResult] = await connection.execute(
      "INSERT IGNORE INTO report_votes (report_id, voter_id, vote_type) VALUES (?, ?, ?)",
      [id, voterId, field]
    );

    if (voteResult.affectedRows === 0) {
      await connection.rollback();
      response.status(409).json({ error: "Already voted" });
      return;
    }

    await connection.execute(`UPDATE reports SET ${field} = ${field} + 1 WHERE id = ?`, [id]);
    await connection.commit();

    const [rows] = await connection.execute(
      `SELECT id, category, type, severity, duration, description, geometry,
              created_at AS createdAt, confirmations, disputes
         FROM reports
        WHERE id = ?`,
      [id]
    );

    response.json(normalizeReportRow(rows[0]));
  } catch (error) {
    await connection.rollback();
    response.status(500).json({ error: error.message });
  } finally {
    connection.release();
  }
});

initDatabase()
  .then(() => {
    app.listen(port, "0.0.0.0", () => {
      console.log(`ScooterMap läuft auf http://localhost:${port}`);
    });
  })
  .catch((error) => {
    console.error("Datenbank konnte nicht vorbereitet werden:", error);
    process.exit(1);
  });

async function initDatabase() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS reports (
      id VARCHAR(36) NOT NULL,
      category VARCHAR(32) NOT NULL,
      type VARCHAR(80) NOT NULL,
      severity VARCHAR(16) NOT NULL,
      duration VARCHAR(16) NOT NULL,
      description TEXT NOT NULL,
      geometry JSON NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      confirmations INT UNSIGNED NOT NULL DEFAULT 0,
      disputes INT UNSIGNED NOT NULL DEFAULT 0,
      PRIMARY KEY (id),
      INDEX idx_reports_category (category),
      INDEX idx_reports_created_at (created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS report_votes (
      report_id VARCHAR(36) NOT NULL,
      voter_id VARCHAR(64) NOT NULL,
      vote_type ENUM('confirmations', 'disputes') NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (report_id, voter_id),
      CONSTRAINT fk_report_votes_report
        FOREIGN KEY (report_id) REFERENCES reports(id)
        ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci
  `);
}

function isValidReport(report) {
  return Boolean(
    report &&
      report.id &&
      report.category &&
      report.type &&
      report.severity &&
      report.duration &&
      report.description &&
      report.geometry?.kind
  );
}

function normalizeReportRow(row) {
  const geometry = typeof row.geometry === "string" ? JSON.parse(row.geometry) : row.geometry;

  return {
    id: row.id,
    category: row.category,
    type: row.type,
    severity: row.severity,
    duration: row.duration,
    description: row.description,
    geometry,
    createdAt: new Date(row.createdAt).toISOString(),
    confirmations: row.confirmations,
    disputes: row.disputes
  };
}
