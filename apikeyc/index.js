import express from "express";
import cors from "cors";
import bodyParser from "body-parser";
import path from "path";
import { fileURLToPath } from "url";
import crypto from "crypto";
import mysql from "mysql2"; // ✅ pastikan install: npm install mysql2

const app = express();
const PORT = 3000;

// Untuk path di ES Module
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Middleware
app.use(cors());
app.use(bodyParser.json());

// Folder public (untuk index.html)
app.use(express.static(path.join(__dirname, "public")));

// ✅ Konfigurasi koneksi database
const db = mysql.createConnection({
  host: "localhost",
  user: "root",
  password: "Rifqy2004_", // sesuaikan
  database: "PraktikumToken",
  port: 3309, // sesuaikan
});

// Cek koneksi database
db.connect((err) => {
  if (err) {
    console.error("❌ Gagal konek ke database:", err.message);
  } else {
    console.log("✅ Terhubung ke database PraktikumToken");
  }
});

// ✅ Endpoint untuk generate token
app.get("/generate", (req, res) => {
  const token = crypto.randomBytes(16).toString("hex"); // token acak aman

  // Simpan token ke database
  const sql = "INSERT INTO tokens (token) VALUES (?)";
  db.query(sql, [token], (err) => {
    if (err) {
      console.error("❌ Gagal menyimpan token ke database:", err.message);
      return res
        .status(500)
        .json({ success: false, message: "Gagal generate token." });
    }

    res.json({
      success: true,
      token,
      message: "✅ Token berhasil dibuat dan disimpan ke database.",
    });
  });
});

// ✅ Endpoint untuk verifikasi token
app.post("/verify", (req, res) => {
  const { token } = req.body;

  if (!token) {
    return res
      .status(400)
      .json({ valid: false, message: "⚠️ Token harus dikirim." });
  }

  const sql = "SELECT * FROM tokens WHERE token = ?";
  db.query(sql, [token], (err, results) => {
    if (err) {
      console.error("❌ Error saat verifikasi token:", err.message);
      return res
        .status(500)
        .json({ valid: false, message: "Terjadi kesalahan server." });
    }

    if (results.length > 0) {
      res.json({ valid: true, message: "✅ Token valid!" });
    } else {
      res.json({ valid: false, message: "❌ Token tidak valid!" });
    }
  });
});

// Jalankan server
app.listen(PORT, () => {
  console.log(`🚀 Server berjalan di http://localhost:${PORT}`);
});
