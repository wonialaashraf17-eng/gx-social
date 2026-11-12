require("dotenv").config();
const express = require("express");
const helmet = require("helmet");
const cookieParser = require("cookie-parser");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const { Pool } = require("pg");

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || "";
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : false });
const uploadDir = path.join(__dirname, "uploads");
fs.mkdirSync(uploadDir, { recursive: true });

app.use(helmet({ crossOriginResourcePolicy: { policy: "cross-origin" } }));
app.use(express.json({ limit: "1mb" }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, "public")));

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDir),
  filename: (_req, file, cb) => cb(null, `${Date.now()}-${Math.random().toString(36).slice(2)}${path.extname(file.originalname).toLowerCase()}`)
});
const maxMb = Number(process.env.MAX_UPLOAD_MB || 100);
const upload = multer({
  storage,
  limits: { fileSize: maxMb * 1024 * 1024 },
  fileFilter: (_req, file, cb) => cb(null, ["video/mp4", "video/webm", "video/quicktime"].includes(file.mimetype))
});

function auth(req, res, next) {
  const token = req.cookies.gx_token;
  if (!token) return res.status(401).json({ error: "Please sign in." });
  try { req.user = jwt.verify(token, JWT_SECRET); next(); }
  catch { return res.status(401).json({ error: "Your session expired. Please sign in again." }); }
}

app.get("/api/health", (_req, res) => res.json({ ok: true, app: "GX Social" }));

app.post("/api/register", async (req, res) => {
  try {
    if (!JWT_SECRET || JWT_SECRET.length < 32) return res.status(500).json({ error: "Server JWT_SECRET must be at least 32 characters." });
    const { username, email, password } = req.body || {};
    if (!/^[a-zA-Z0-9_]{3,30}$/.test(username || "") || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email || "") || typeof password !== "string" || password.length < 10)
      return res.status(400).json({ error: "Use a 3–30 character username, valid email and password of at least 10 characters." });
    const hash = await bcrypt.hash(password, 12);
    const result = await pool.query("INSERT INTO users(username,email,password_hash) VALUES($1,$2,$3) RETURNING id,username,email", [username, email.toLowerCase(), hash]);
    const user = result.rows[0];
    res.cookie("gx_token", jwt.sign({ id: user.id, username: user.username }, JWT_SECRET, { expiresIn: "7d" }), { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", maxAge: 7*24*60*60*1000 });
    res.status(201).json({ user });
  } catch (e) { res.status(e.code === "23505" ? 409 : 500).json({ error: e.code === "23505" ? "Username or email already exists." : "Could not create account." }); }
});

app.post("/api/login", async (req, res) => {
  try {
    if (!JWT_SECRET || JWT_SECRET.length < 32) return res.status(500).json({ error: "Server JWT_SECRET must be at least 32 characters." });
    const { email, password } = req.body || {};
    const result = await pool.query("SELECT id,username,email,password_hash FROM users WHERE email=$1", [(email || "").toLowerCase()]);
    if (!result.rowCount || !await bcrypt.compare(password || "", result.rows[0].password_hash)) return res.status(401).json({ error: "Email or password is incorrect." });
    const u = result.rows[0];
    res.cookie("gx_token", jwt.sign({ id: u.id, username: u.username }, JWT_SECRET, { expiresIn: "7d" }), { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", maxAge: 7*24*60*60*1000 });
    res.json({ user: { id: u.id, username: u.username, email: u.email } });
  } catch { res.status(500).json({ error: "Could not sign in." }); }
});
app.post("/api/logout", (_req, res) => { res.clearCookie("gx_token"); res.json({ ok: true }); });
app.get("/api/me", auth, async (req, res) => {
  const r = await pool.query("SELECT id,username,email FROM users WHERE id=$1", [req.user.id]);
  res.json({ user: r.rows[0] || null });
});
app.get("/api/videos", async (_req, res) => {
  try {
    const r = await pool.query("SELECT v.id,v.caption,v.filename,v.mime_type,v.created_at,u.username FROM videos v JOIN users u ON u.id=v.user_id ORDER BY v.created_at DESC LIMIT 50");
    res.json({ videos: r.rows.map(v => ({ ...v, url: `/uploads/${encodeURIComponent(v.filename)}` })) });
  } catch { res.status(500).json({ error: "Could not load videos." }); }
});
app.post("/api/videos", auth, (req, res) => {
  upload.single("video")(req, res, async err => {
    if (err) return res.status(400).json({ error: err.code === "LIMIT_FILE_SIZE" ? `Maximum upload size is ${maxMb} MB.` : "Choose an MP4, WebM or MOV video." });
    if (!req.file) return res.status(400).json({ error: "Choose an MP4, WebM or MOV video." });
    try {
      const r = await pool.query("INSERT INTO videos(user_id,caption,filename,mime_type) VALUES($1,$2,$3,$4) RETURNING id", [req.user.id, String(req.body.caption || "").slice(0, 500), req.file.filename, req.file.mimetype]);
      res.status(201).json({ id: r.rows[0].id, message: "Video uploaded." });
    } catch { fs.unlink(req.file.path, () => {}); res.status(500).json({ error: "Upload could not be saved." }); }
  });
});
app.use("/uploads", express.static(uploadDir, { fallthrough: false }));
app.post("/api/reports", auth, async (req, res) => {
  const { videoId, reason } = req.body || {};
  if (!videoId || !String(reason || "").trim()) return res.status(400).json({ error: "Select a video and provide a reason." });
  try { await pool.query("INSERT INTO reports(reporter_id,video_id,reason) VALUES($1,$2,$3)", [req.user.id, videoId, String(reason).slice(0, 500)]); res.status(201).json({ ok: true }); }
  catch { res.status(400).json({ error: "Could not submit report." }); }
});
app.get("*", (req, res, next) => req.path.startsWith("/api/") ? next() : res.sendFile(path.join(__dirname, "public", "index.html")));
app.listen(PORT, () => console.log(`GX Social listening on ${PORT}`));
