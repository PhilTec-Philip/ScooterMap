import mysql from "mysql2/promise";

const config = {
  host: process.env.DB_HOST || "127.0.0.1",
  user: process.env.DB_USER || "root",
  password: process.env.DB_PASSWORD || "root",
  multipleStatements: true
};

const database = process.env.DB_NAME || "scootermap";
const shouldSeed = process.argv.includes("--seed");

const connection = await mysql.createConnection(config);

try {
  await connection.query(`
    CREATE DATABASE IF NOT EXISTS ${database}
      CHARACTER SET utf8mb4
      COLLATE utf8mb4_uca1400_ai_ci
  `);

  await connection.query(`USE ${database}`);

  await connection.query(`
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

  await connection.query(`
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

  if (shouldSeed) {
    await seedReports(connection);
  }

  const [[{ reportCount }]] = await connection.query("SELECT COUNT(*) AS reportCount FROM reports");
  console.log(`ScooterMap DB bereit. Reports: ${reportCount}`);
} finally {
  await connection.end();
}

async function seedReports(connection) {
  const [existingRows] = await connection.query("SELECT COUNT(*) AS count FROM reports");

  if (existingRows[0].count > 0) {
    console.log("Seed übersprungen: reports ist nicht leer.");
    return;
  }

  const seed = [
    {
      id: "seed-uneven-road-001",
      category: "road",
      type: "Unebener Asphalt",
      severity: "medium",
      duration: "30d",
      description: "Demo-Eintrag: welliger Fahrbahnbelag, langsam fahren.",
      geometry: {
        kind: "point",
        lat: 51.04087,
        lng: 7.00231
      }
    },
    {
      id: "seed-crossing-001",
      category: "safety",
      type: "Gefährliche Kreuzung",
      severity: "high",
      duration: "permanent",
      description: "Demo-Eintrag: unübersichtliche Kreuzung mit viel Verkehr.",
      geometry: {
        kind: "circle",
        center: {
          lat: 51.03862,
          lng: 7.0068
        },
        radius: 140
      }
    },
    {
      id: "seed-community-001",
      category: "community",
      type: "Treffpunkt",
      severity: "low",
      duration: "permanent",
      description: "Demo-Eintrag: ruhiger Treffpunkt mit guter Aussicht.",
      geometry: {
        kind: "polygon",
        points: [
          { lat: 51.03595, lng: 7.00066 },
          { lat: 51.03653, lng: 7.0042 },
          { lat: 51.03442, lng: 7.00515 },
          { lat: 51.03377, lng: 7.00161 }
        ]
      }
    }
  ];

  for (const report of seed) {
    await connection.execute(
      `INSERT IGNORE INTO reports
        (id, category, type, severity, duration, description, geometry, created_at, confirmations, disputes)
       VALUES (?, ?, ?, ?, ?, ?, ?, NOW(), 0, 0)`,
      [
        report.id,
        report.category,
        report.type,
        report.severity,
        report.duration,
        report.description,
        JSON.stringify(report.geometry)
      ]
    );
  }
}
