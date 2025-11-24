import express from "express";
import cors from "cors";
import bodyParser from "body-parser";
import path from "path";
import { fileURLToPath } from "url";
import crypto from "crypto";
import mysql from "mysql2";
import cron from "node-cron";

const app = express();
const PORT = 3000;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

app.use(cors());
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, "public")));

// Simple session storage (in production use Redis or database)
const sessions = new Map();

// Generate session ID
const generateSessionId = () => {
  return crypto.randomBytes(16).toString("hex");
};

// Middleware untuk check authentication
const requireAuth = (req, res, next) => {
  const sessionId = req.headers.authorization?.replace("Bearer ", "");

  if (sessionId && sessions.has(sessionId)) {
    req.admin = sessions.get(sessionId);
    next();
  } else {
    res.status(401).json({
      success: false,
      message: "Unauthorized access. Please login first.",
    });
  }
};

// =====================
//   KONEKSI DATABASE
// =====================
const db = mysql.createConnection({
  host: "localhost",
  user: "root",
  password: "Rifqy2004_",
  database: "PraktikumToken",
  port: 3309,
});

db.connect((err) => {
  if (err) {
    console.log("❌ Database error:", err.message);
  } else {
    console.log("✅ Database connected");

    // Test query untuk cek struktur tabel
    db.query("DESC user", (err, results) => {
      if (err) {
        console.log("❌ Error checking table structure:", err.message);
      } else {
        console.log("✅ User table structure checked");
        console.log(
          "Columns:",
          results.map((r) => r.Field)
        );
      }
    });
  }
});

// =====================
//   CRON JOB AUTO NON-AKTIFKAN USER
// =====================
cron.schedule("0 0 * * *", () => {
  console.log("🔄 Running auto-deactivate inactive users...");

  const sql = `
    UPDATE user 
    SET is_active = FALSE 
    WHERE last_login < DATE_SUB(NOW(), INTERVAL 30 DAY)
    AND is_active = TRUE
  `;

  db.query(sql, (err, results) => {
    if (err) {
      console.log("❌ Error auto-deactivate:", err.message);
    } else {
      console.log(`✅ Auto-deactivated ${results.affectedRows} users`);
    }
  });
});

/* ============================================================
        ADMIN REGISTER
============================================================ */
app.post("/admin/register", (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.json({
      success: false,
      message: "Email dan password harus diisi",
    });
  }

  db.query(
    "INSERT INTO admin (email, password) VALUES (?, ?)",
    [email, password],
    (err, result) => {
      if (err) {
        console.log("❌ Admin register error:", err.message);
        return res.json({
          success: false,
          message: "Gagal register admin",
          error: err.message,
        });
      }

      res.json({
        success: true,
        message: "Admin berhasil dibuat",
        admin_id: result.insertId,
      });
    }
  );
});

/* ============================================================
        ADMIN LOGIN (DENGAN SESSION)
============================================================ */
app.post("/admin/login", (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.json({
      success: false,
      message: "Email dan password harus diisi",
    });
  }

  db.query(
    "SELECT * FROM admin WHERE email = ? AND password = ?",
    [email, password],
    (err, results) => {
      if (err) {
        console.log("❌ Admin login error:", err.message);
        return res.json({
          success: false,
          message: "Terjadi error",
        });
      }

      if (results.length === 0) {
        return res.json({
          success: false,
          message: "Email atau password salah!",
        });
      }

      // Create session
      const sessionId = generateSessionId();
      const adminData = {
        id: results[0].id,
        email: results[0].email,
        loginTime: new Date(),
      };

      sessions.set(sessionId, adminData);

      res.json({
        success: true,
        message: "Login successful",
        admin: adminData,
        sessionId: sessionId,
      });
    }
  );
});

/* ============================================================
        ADMIN LOGOUT
============================================================ */
app.post("/admin/logout", requireAuth, (req, res) => {
  const sessionId = req.headers.authorization?.replace("Bearer ", "");

  if (sessionId) {
    sessions.delete(sessionId);
  }

  res.json({
    success: true,
    message: "Logout successful",
  });
});

/* ============================================================
        CHECK AUTH STATUS
============================================================ */
app.get("/admin/auth-status", (req, res) => {
  const sessionId = req.headers.authorization?.replace("Bearer ", "");

  if (sessionId && sessions.has(sessionId)) {
    res.json({
      success: true,
      authenticated: true,
      admin: sessions.get(sessionId),
    });
  } else {
    res.json({
      success: true,
      authenticated: false,
    });
  }
});

/* ============================================================
        GENERATE API KEY (MASUK TABEL apikey)
============================================================ */
app.get("/generate-api-key", (req, res) => {
  const key = crypto.randomBytes(20).toString("hex");

  const outOfDate = new Date();
  outOfDate.setMonth(outOfDate.getMonth() + 1); // key berlaku 1 bulan

  db.query(
    "INSERT INTO apikey (`key`, out_of_date) VALUES (?, ?)",
    [key, outOfDate],
    (err, result) => {
      if (err) {
        console.log("❌ Generate API key error:", err.message);
        return res.json({
          success: false,
          message: "Gagal generate API key",
        });
      }

      res.json({
        success: true,
        api_key: key,
        apikey_id: result.insertId,
        expired_date: outOfDate,
        message: "API Key berhasil dibuat",
      });
    }
  );
});

/* ============================================================
        SIMPAN USER (MENGGUNAKAN apikey_id) - FIXED
============================================================ */
app.post("/user/register", (req, res) => {
  const { first_name, last_name, email, apikey_id } = req.body;

  if (!first_name || !last_name || !email || !apikey_id) {
    return res.json({
      success: false,
      message: "Semua field harus diisi",
    });
  }

  console.log("📝 Registering user:", {
    first_name,
    last_name,
    email,
    apikey_id,
  });

  db.query(
    "INSERT INTO user (first_name, last_name, email, apikey_id, last_login, is_active) VALUES (?, ?, ?, ?, NOW(), TRUE)",
    [first_name, last_name, email, apikey_id],
    (err, result) => {
      if (err) {
        console.log("❌ User register error:", err.message);
        return res.json({
          success: false,
          message: "Gagal menyimpan user",
          error: err.message,
        });
      }

      console.log("✅ User registered successfully, ID:", result.insertId);

      res.json({
        success: true,
        message: "User dan API key berhasil disimpan!",
        user_id: result.insertId,
      });
    }
  );
});

/* ============================================================
        DELETE USER (PROTECTED)
============================================================ */
app.delete("/user/:id", requireAuth, (req, res) => {
  const userId = req.params.id;

  console.log("🗑️ Deleting user ID:", userId);

  if (!userId) {
    return res.json({
      success: false,
      message: "User ID harus diisi",
    });
  }

  // First, get user info for logging
  db.query(
    "SELECT first_name, last_name, email FROM user WHERE id = ?",
    [userId],
    (err, userResults) => {
      if (err) {
        console.log("❌ Error fetching user data for delete:", err.message);
        return res.json({
          success: false,
          message: "Gagal mengambil data user",
          error: err.message,
        });
      }

      if (userResults.length === 0) {
        return res.json({
          success: false,
          message: "User tidak ditemukan",
        });
      }

      const userName = `${userResults[0].first_name} ${userResults[0].last_name}`;
      const userEmail = userResults[0].email;

      // Delete the user
      db.query("DELETE FROM user WHERE id = ?", [userId], (err, results) => {
        if (err) {
          console.log("❌ Delete user error:", err.message);
          return res.json({
            success: false,
            message: "Gagal menghapus user",
            error: err.message,
          });
        }

        if (results.affectedRows === 0) {
          return res.json({
            success: false,
            message: "User tidak ditemukan",
          });
        }

        console.log(`✅ User deleted: ${userName} (${userEmail})`);

        res.json({
          success: true,
          message: `User ${userName} berhasil dihapus`,
          deleted_user: {
            id: userId,
            name: userName,
            email: userEmail,
          },
        });
      });
    }
  );
});

// ============================================================
// SEMUA ENDPOINT BERIKUT DIPROTEKSI DENGAN requireAuth
// ============================================================

/* ============================================================
        LIST USER + API KEY + STATUS AKTIF UNTUK DASHBOARD
============================================================ */
app.get("/user/list", requireAuth, (req, res) => {
  console.log("📋 Fetching user list...");

  const sql = `
    SELECT 
      user.id,
      user.first_name,
      user.last_name,
      user.email,
      user.last_login,
      user.is_active,
      user.updated_at,
      apikey.key AS api_key,
      apikey.out_of_date AS expired
    FROM user
    LEFT JOIN apikey ON apikey.id = user.apikey_id
    ORDER BY user.id DESC
  `;

  db.query(sql, (err, results) => {
    if (err) {
      console.log("❌ User list error:", err.message);
      return res.json([]);
    }

    console.log(`✅ Found ${results.length} users`);

    const formattedResults = results.map((r) => {
      const daysSinceLogin = r.last_login
        ? Math.floor(
            (new Date() - new Date(r.last_login)) / (1000 * 60 * 60 * 24)
          )
        : "Belum login";

      let status = "Expired";
      if (new Date(r.expired) > new Date()) {
        status = r.is_active ? "Aktif" : "Non-Aktif";
      }

      return {
        id: r.id,
        first_name: r.first_name,
        last_name: r.last_name,
        email: r.email,
        api_key: r.api_key,
        last_login: r.last_login,
        is_active: r.is_active,
        updated_at: r.updated_at,
        status: status,
        days_since_login: daysSinceLogin,
      };
    });

    res.json(formattedResults);
  });
});

/* ============================================================
        AUTO NON-AKTIFKAN USER TIDAK AKTIF 30 HARI (MANUAL TRIGGER)
============================================================ */
app.post("/admin/deactivate-inactive-users", requireAuth, (req, res) => {
  console.log("🔄 Manual deactivate inactive users...");

  const sql = `
    UPDATE user 
    SET is_active = FALSE 
    WHERE last_login < DATE_SUB(NOW(), INTERVAL 30 DAY)
    AND is_active = TRUE
  `;

  db.query(sql, (err, results) => {
    if (err) {
      console.log("❌ Deactivate error:", err.message);
      return res.json({
        success: false,
        message: "Gagal menonaktifkan user",
        error: err.message,
      });
    }

    console.log(
      `✅ Manual deactivation: ${results.affectedRows} users deactivated`
    );

    res.json({
      success: true,
      message: `Berhasil menonaktifkan ${results.affectedRows} user yang tidak aktif`,
    });
  });
});

/* ============================================================
        MANUAL TOGGLE STATUS USER
============================================================ */
app.post("/admin/toggle-user-status", requireAuth, (req, res) => {
  const { user_id, is_active } = req.body;

  if (!user_id || typeof is_active === "undefined") {
    return res.json({
      success: false,
      message: "user_id dan is_active harus diisi",
    });
  }

  console.log("🔄 Toggle user status:", { user_id, is_active });

  db.query(
    "UPDATE user SET is_active = ?, updated_at = NOW() WHERE id = ?",
    [is_active, user_id],
    (err, results) => {
      if (err) {
        console.log("❌ Toggle status error:", err.message);
        return res.json({
          success: false,
          message: "Gagal update status user",
        });
      }

      if (results.affectedRows === 0) {
        return res.json({
          success: false,
          message: "User tidak ditemukan",
        });
      }

      const status = is_active ? "diaktifkan" : "dinonaktifkan";
      console.log(`✅ User ${user_id} ${status}`);

      res.json({
        success: true,
        message: `User berhasil ${status}`,
      });
    }
  );
});

/* ============================================================
        GET USER STATISTICS
============================================================ */
app.get("/admin/user-stats", requireAuth, (req, res) => {
  console.log("📊 Fetching user statistics...");

  const sql = `
    SELECT 
      COUNT(*) as total_users,
      SUM(is_active = TRUE) as active_users,
      SUM(is_active = FALSE) as inactive_users,
      SUM(last_login IS NULL) as never_logged_in,
      SUM(last_login < DATE_SUB(NOW(), INTERVAL 30 DAY) AND is_active = TRUE) as inactive_over_30_days
    FROM user
  `;

  db.query(sql, (err, results) => {
    if (err) {
      console.log("❌ User stats error:", err.message);
      return res.json({
        success: false,
        error: err.message,
      });
    }

    console.log("✅ User stats fetched:", results[0]);

    res.json({
      success: true,
      stats: results[0],
    });
  });
});

/* ============================================================
        GET USER DETAIL BY ID
============================================================ */
app.get("/user/:id", requireAuth, (req, res) => {
  const userId = req.params.id;

  console.log("👤 Fetching user detail for ID:", userId);

  const sql = `
    SELECT 
      user.id,
      user.first_name,
      user.last_name,
      user.email,
      user.last_login,
      user.is_active,
      user.updated_at,
      apikey.key AS api_key,
      apikey.out_of_date AS expired
    FROM user
    LEFT JOIN apikey ON apikey.id = user.apikey_id
    WHERE user.id = ?
  `;

  db.query(sql, [userId], (err, results) => {
    if (err) {
      console.log("❌ User detail error:", err.message);
      return res.json({
        success: false,
        error: err.message,
      });
    }

    if (results.length === 0) {
      console.log("❌ User not found:", userId);
      return res.json({
        success: false,
        message: "User tidak ditemukan",
      });
    }

    const user = results[0];
    const daysSinceLogin = user.last_login
      ? Math.floor(
          (new Date() - new Date(user.last_login)) / (1000 * 60 * 60 * 24)
        )
      : null;

    console.log("✅ User detail fetched:", user.email);

    res.json({
      success: true,
      user: {
        ...user,
        days_since_login: daysSinceLogin,
        status:
          new Date(user.expired) > new Date()
            ? user.is_active
              ? "Aktif"
              : "Non-Aktif"
            : "Expired",
      },
    });
  });
});

/* ============================================================
        BULK DELETE INACTIVE USERS
============================================================ */
app.post("/admin/bulk-delete-inactive", requireAuth, (req, res) => {
  console.log("🗑️ Bulk deleting inactive users...");

  const sql = `
    DELETE FROM user 
    WHERE is_active = FALSE 
    AND last_login < DATE_SUB(NOW(), INTERVAL 60 DAY)
  `;

  db.query(sql, (err, results) => {
    if (err) {
      console.log("❌ Bulk delete error:", err.message);
      return res.json({
        success: false,
        message: "Gagal menghapus user tidak aktif",
        error: err.message,
      });
    }

    console.log(`✅ Bulk delete: ${results.affectedRows} users deleted`);

    res.json({
      success: true,
      message: `Berhasil menghapus ${results.affectedRows} user tidak aktif`,
    });
  });
});

/* ============================================================
        UPDATE LAST LOGIN SAAT USER LOGIN - FIXED
============================================================ */
app.post("/user/login", (req, res) => {
  const { email } = req.body;

  if (!email) {
    return res.json({
      success: false,
      message: "Email harus diisi",
    });
  }

  console.log("🔐 Login attempt for email:", email);

  db.query(
    "UPDATE user SET last_login = NOW(), is_active = TRUE WHERE email = ?",
    [email],
    (err, results) => {
      if (err) {
        console.log("❌ User login error:", err.message);
        return res.json({
          success: false,
          message: "Error update login",
        });
      }

      console.log(
        "✅ Login update result - Affected rows:",
        results.affectedRows
      );

      if (results.affectedRows === 0) {
        return res.json({
          success: false,
          message: "User tidak ditemukan",
        });
      }

      // Get updated user data
      db.query(
        "SELECT id, first_name, last_name, email, last_login, is_active FROM user WHERE email = ?",
        [email],
        (err, userResults) => {
          if (err) {
            console.log("❌ Error fetching user data:", err.message);
            return res.json({
              success: true,
              message: "Login berhasil (tapi gagal ambil data user)",
            });
          }

          res.json({
            success: true,
            message: "Login berhasil",
            user: userResults[0],
            last_login: userResults[0].last_login,
          });
        }
      );
    }
  );
});

/* ============================================================
        MANUAL UPDATE LAST LOGIN (UNTUK TESTING & DEBUG)
============================================================ */
app.post("/admin/update-last-login", requireAuth, (req, res) => {
  const { user_id, email } = req.body;

  console.log("🛠️ Manual update last login:", { user_id, email });

  if (!user_id && !email) {
    return res.json({
      success: false,
      message: "Provide user_id or email",
    });
  }

  let query, params;

  if (user_id) {
    query = "UPDATE user SET last_login = NOW() WHERE id = ?";
    params = [user_id];
  } else {
    query = "UPDATE user SET last_login = NOW() WHERE email = ?";
    params = [email];
  }

  db.query(query, params, (err, results) => {
    if (err) {
      console.log("❌ Manual update error:", err.message);
      return res.json({
        success: false,
        message: "Gagal update last login",
        error: err.message,
      });
    }

    console.log(
      "✅ Manual update result - Affected rows:",
      results.affectedRows
    );

    if (results.affectedRows === 0) {
      return res.json({
        success: false,
        message: "User tidak ditemukan",
      });
    }

    // Get updated data
    db.query(
      "SELECT id, first_name, email, last_login FROM user WHERE " +
        (user_id ? "id = ?" : "email = ?"),
      params,
      (err, userResults) => {
        if (err) {
          return res.json({
            success: true,
            message: "Last login updated (tapi gagal ambil data)",
            affected_rows: results.affectedRows,
          });
        }

        res.json({
          success: true,
          message: "Last login berhasil diupdate",
          user: userResults[0],
          affected_rows: results.affectedRows,
        });
      }
    );
  });
});

/* ============================================================
        HEALTH CHECK & SERVER INFO
============================================================ */
app.get("/health", (req, res) => {
  db.query("SELECT 1 as test", (err) => {
    if (err) {
      return res.json({
        status: "❌ Unhealthy",
        database: "Disconnected",
        error: err.message,
      });
    }

    res.json({
      status: "✅ Healthy",
      database: "Connected",
      server_time: new Date(),
      uptime: process.uptime(),
    });
  });
});

/* ============================================================
        RUN SERVER
============================================================ */
app.listen(PORT, () => {
  console.log(`🚀 Server berjalan di http://localhost:${PORT}`);
  console.log(`⏰ Auto-deactivate job aktif (setiap hari jam 00:00)`);
  console.log(`🔍 Health check: http://localhost:${PORT}/health`);
  console.log(`📊 User stats: http://localhost:${PORT}/admin/user-stats`);
  console.log(`🗑️ Delete endpoint: DELETE http://localhost:${PORT}/user/:id`);
  console.log(`🔐 Authentication system activated`);
});
