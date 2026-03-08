import express from "express";
import { createServer as createViteServer } from "vite";
import Database from "better-sqlite3";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const db = new Database("debacu.db");

// Initialize database
db.exec(`
  CREATE TABLE IF NOT EXISTS debacu_access_requests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    status TEXT DEFAULT 'PENDING_REVIEW',
    first_name TEXT NOT NULL,
    last_name TEXT NOT NULL,
    role TEXT,
    email TEXT NOT NULL,
    phone TEXT NOT NULL,
    website TEXT,
    hotel_name TEXT NOT NULL,
    legal_name TEXT,
    tax_id TEXT NOT NULL,
    accommodation_type TEXT NOT NULL,
    room_count INTEGER NOT NULL,
    employee_count INTEGER,
    address TEXT,
    postal_code TEXT,
    city TEXT NOT NULL,
    province TEXT,
    country TEXT NOT NULL,
    pms TEXT,
    revenue_analysis_status TEXT,
    main_interest TEXT,
    monthly_bookings TEXT,
    comments TEXT,
    privacy_accepted INTEGER DEFAULT 0,
    representation_confirmed INTEGER DEFAULT 0,
    manual_review_accepted INTEGER DEFAULT 0,
    reviewed_by TEXT,
    reviewed_at DATETIME,
    admin_notes TEXT
  )
`);

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // API routes
  app.post("/api/access-requests", (req, res) => {
    try {
      const data = req.body;
      
      const stmt = db.prepare(`
        INSERT INTO debacu_access_requests (
          first_name, last_name, role, email, phone, website,
          hotel_name, legal_name, tax_id, accommodation_type,
          room_count, employee_count, address, postal_code,
          city, province, country, pms, revenue_analysis_status,
          main_interest, monthly_bookings, comments,
          privacy_accepted, representation_confirmed, manual_review_accepted
        ) VALUES (
          ?, ?, ?, ?, ?, ?,
          ?, ?, ?, ?,
          ?, ?, ?, ?,
          ?, ?, ?, ?, ?,
          ?, ?, ?,
          ?, ?, ?
        )
      `);

      stmt.run(
        data.firstName, data.lastName, data.role, data.email, data.phone, data.website,
        data.hotelName, data.legalName, data.taxId, data.accommodationType,
        data.roomCount, data.employeeCount, data.address, data.postalCode,
        data.city, data.province, data.country, data.pms, data.revenueAnalysisStatus,
        data.mainInterest, data.monthlyBookings, data.comments,
        data.privacyAccepted ? 1 : 0, data.representationConfirmed ? 1 : 0, data.manualReviewAccepted ? 1 : 0
      );

      res.status(201).json({ success: true, message: "Solicitud recibida correctamente" });
    } catch (error) {
      console.error("Error saving access request:", error);
      res.status(500).json({ success: false, message: "Error al procesar la solicitud" });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    // Serve static files in production
    app.use(express.static(path.join(__dirname, "dist")));
    app.get("*", (req, res) => {
      res.sendFile(path.join(__dirname, "dist", "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
