// GreenLoop backend with presigned-like upload (dev demo)
const express = require('express');
const cors = require('cors');
const { nanoid } = require('nanoid');
const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const multer = require('multer');

const app = express();
app.use(cors());
app.use(express.json());

const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir);

const dbPath = path.join(__dirname, 'greenloop.db');
const db = new Database(dbPath);

// init tables if not exist
db.exec(`
CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, phone TEXT, name TEXT, points INTEGER DEFAULT 0);
CREATE TABLE IF NOT EXISTS actions (id TEXT PRIMARY KEY, title TEXT, points INTEGER, verification TEXT);
CREATE TABLE IF NOT EXISTS submissions (id TEXT PRIMARY KEY, user_id TEXT, action_id TEXT, status TEXT, payload TEXT, created_at INTEGER);
CREATE TABLE IF NOT EXISTS offers (id TEXT PRIMARY KEY, merchant TEXT, title TEXT, pts_required INTEGER, active INTEGER DEFAULT 1);
CREATE TABLE IF NOT EXISTS redemptions (id TEXT PRIMARY KEY, user_id TEXT, offer_id TEXT, code TEXT, status TEXT, created_at INTEGER);
`);

// seed data if empty
const countActions = db.prepare('SELECT COUNT(*) as c FROM actions').get().c;
if (countActions === 0) {
  const insertAction = db.prepare('INSERT INTO actions (id,title,points,verification) VALUES (?,?,?,?)');
  insertAction.run('act_recycle','Recycle 1kg plastic',10,'photo+pin');
  insertAction.run('act_refill','Refill bottle at partner cafe',20,'merchant_qr');
  insertAction.run('act_tree','Plant a tree',50,'event_checkin');
}
const countOffers = db.prepare('SELECT COUNT(*) as c FROM offers').get().c;
if (countOffers === 0) {
  const insertOffer = db.prepare('INSERT INTO offers (id,merchant,title,pts_required) VALUES (?,?,?,?)');
  insertOffer.run('off_cafe20','Green Café','₹20 off iced tea (200 pts)',200);
  insertOffer.run('off_metro50','City Metro','₹50 top-up (300 pts)',300);
}

// Dev login - returns/create user. token is user id
app.post('/auth/dev-login', (req, res) => {
  const phone = req.body.phone || '+919999000000';
  const name = req.body.name || 'Dev User';
  let user = db.prepare('SELECT * FROM users WHERE phone = ?').get(phone);
  if (!user) {
    const id = nanoid();
    db.prepare('INSERT INTO users (id,phone,name,points) VALUES (?,?,?,?)').run(id, phone, name, 0);
    user = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
  }
  res.json({ token: user.id, user });
});

// feed actions
app.get('/feed', (req, res) => {
  const actions = db.prepare('SELECT * FROM actions').all();
  res.json({ actions });
});

// PRESIGN endpoint - returns an upload URL (for demo we use a backend endpoint as the upload receiver)
app.post('/uploads/presign', (req, res) => {
  const { filename, token } = req.body || {};
  if (!token) return res.status(401).json({ error: 'No token' });
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(token);
  if (!user) return res.status(401).json({ error: 'Invalid token' });
  const key = `uploads/${user.id}_${Date.now()}_${filename}`;
  // For demo, we return a direct upload URL to our server endpoint
  const uploadUrl = `${req.protocol}://${req.get('host')}/uploads/upload?key=${encodeURIComponent(key)}`;
  res.json({ url: uploadUrl, key });
});

// upload receiver (accepts PUT with binary body)
const upload = multer({ dest: uploadsDir });
app.put('/uploads/upload', upload.single('file'), (req, res) => {
  // multer will save file to uploadsDir with random name; rename to the provided key
  const key = req.query.key;
  if (!key) return res.status(400).json({ error: 'Missing key query' });
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  const tempPath = req.file.path;
  const targetPath = path.join(uploadsDir, path.basename(key));
  fs.renameSync(tempPath, targetPath);
  res.json({ ok: true, key });
});

// submit action (accepts payload.key referencing uploaded file)
app.post('/submission', (req, res) => {
  const { token, action_id, payload } = req.body || {};
  if (!token) return res.status(401).json({ error: 'No token' });
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(token);
  if (!user) return res.status(401).json({ error: 'Invalid token' });
  const action = db.prepare('SELECT * FROM actions WHERE id = ?').get(action_id);
  if (!action) return res.status(400).json({ error: 'Unknown action' });

  // check cooldown (1 hour)
  const oneHour = 60*60*1000;
  const last = db.prepare('SELECT * FROM submissions WHERE user_id = ? AND action_id = ? ORDER BY created_at DESC LIMIT 1').get(user.id, action_id);
  if (last && (Date.now() - last.created_at) < oneHour) {
    return res.status(429).json({ error: 'Cooldown active. Try later.' });
  }

  const id = nanoid();
  const payloadStr = payload ? JSON.stringify(payload) : null;
  db.prepare('INSERT INTO submissions (id,user_id,action_id,status,payload,created_at) VALUES (?,?,?,?,?,?)').run(id, user.id, action_id, 'pending', payloadStr, Date.now());

  // Very simple verification: if payload.key exists, auto-approve and award points
  if (payload && payload.key) {
    db.prepare('UPDATE submissions SET status = ? WHERE id = ?').run('approved', id);
    db.prepare('UPDATE users SET points = points + ? WHERE id = ?').run(action.points, user.id);
    const updated = db.prepare('SELECT * FROM users WHERE id = ?').get(user.id);
    return res.json({ submission: { id, action_id, status: 'approved' }, new_points: updated.points });
  }

  res.json({ submission: { id, action_id, status: 'pending' } });
});

// rewards list
app.get('/rewards', (req, res) => {
  const offers = db.prepare('SELECT * FROM offers WHERE active = 1').all();
  res.json({ offers });
});

// redeem offer
app.post('/redeem', (req, res) => {
  const { token, offer_id } = req.body || {};
  if (!token) return res.status(401).json({ error: 'No token' });
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(token);
  if (!user) return res.status(401).json({ error: 'Invalid token' });
  const offer = db.prepare('SELECT * FROM offers WHERE id = ?').get(offer_id);
  if (!offer) return res.status(400).json({ error: 'Unknown offer' });
  if (user.points < offer.pts_required) return res.status(400).json({ error: 'Insufficient points' });

  const code = nanoid(8).toUpperCase();
  const rid = nanoid();
  db.prepare('INSERT INTO redemptions (id,user_id,offer_id,code,status,created_at) VALUES (?,?,?,?,?,?)').run(rid, user.id, offer.id, code, 'issued', Date.now());

  // deduct points
  db.prepare('UPDATE users SET points = points - ? WHERE id = ?').run(offer.pts_required, user.id);
  const updated = db.prepare('SELECT * FROM users WHERE id = ?').get(user.id);

  res.json({ redemption: { id: rid, code, status: 'issued' }, remaining_points: updated.points });
});

// partner validate (merchant PINs are simple demo values)
app.post('/partner/validate', (req, res) => {
  const { code, merchant_pin } = req.body || {};
  // sample pins: 123456 and 654321 map to merchants; in demo we accept any of them
  const validPins = ['123456','654321'];
  if (!validPins.includes(merchant_pin)) return res.status(401).json({ error: 'Invalid merchant PIN' });
  const red = db.prepare('SELECT * FROM redemptions WHERE code = ?').get(code);
  if (!red) return res.status(404).json({ error: 'Code not found' });
  if (red.status !== 'issued') return res.status(400).json({ error: 'Code already used/void' });
  db.prepare('UPDATE redemptions SET status = ?, created_at = ? WHERE id = ?').run('redeemed', Date.now(), red.id);
  res.json({ ok: true, redemption: { id: red.id, code: red.code, status: 'redeemed' } });
});

// impact
app.get('/impact', (req, res) => {
  const auth = (req.headers.authorization || '').replace('Bearer ','') || req.query.token;
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(auth);
  if (!user) return res.status(401).json({ error: 'Invalid token' });
  // naive co2: 0.02 kg per point
  const co2 = Math.round(user.points * 0.02 * 100) / 100;
  res.json({ points: user.points, co2_saved_kg: co2 });
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(`GreenLoop backend with uploads (dev) running on http://localhost:${PORT}`));
