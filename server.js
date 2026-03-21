import express from 'express';
import Database from 'better-sqlite3';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 18791;

// Database
const db = new Database(join(__dirname, 'data.db'));
db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    slug TEXT UNIQUE NOT NULL,
    created_at TEXT DEFAULT (datetime('now')),
    active INTEGER DEFAULT 1
  );
  CREATE TABLE IF NOT EXISTS responses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    event_id INTEGER NOT NULL REFERENCES events(id),
    rahmen INTEGER CHECK(rahmen BETWEEN 1 AND 5),
    relevanz INTEGER CHECK(relevanz BETWEEN 1 AND 4),
    weiterverfolgen INTEGER CHECK(weiterverfolgen BETWEEN 1 AND 4),
    freitext TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );
`);

// Ensure a default event exists
const defaultEvent = db.prepare('SELECT id FROM events WHERE slug = ?').get('default');
if (!defaultEvent) {
  db.prepare('INSERT INTO events (name, slug) VALUES (?, ?)').run('Demo-Veranstaltung', 'default');
}

app.use(express.json());
app.use(express.static(join(__dirname, 'public')));

// SSE clients per event
const sseClients = new Map();

function broadcast(eventSlug, data) {
  const clients = sseClients.get(eventSlug) || [];
  const msg = `data: ${JSON.stringify(data)}\n\n`;
  clients.forEach(res => res.write(msg));
}

// API: Submit feedback
app.post('/api/feedback/:slug', (req, res) => {
  const { slug } = req.params;
  const event = db.prepare('SELECT id FROM events WHERE slug = ? AND active = 1').get(slug);
  if (!event) return res.status(404).json({ error: 'Event nicht gefunden' });

  const { rahmen, relevanz, weiterverfolgen, freitext } = req.body;
  if (!rahmen || !relevanz || !weiterverfolgen) {
    return res.status(400).json({ error: 'Bitte alle Skalen ausfüllen' });
  }

  db.prepare('INSERT INTO responses (event_id, rahmen, relevanz, weiterverfolgen, freitext) VALUES (?, ?, ?, ?, ?)')
    .run(event.id, rahmen, relevanz, weiterverfolgen, freitext || null);

  const stats = getStats(event.id);
  broadcast(slug, stats);
  res.json({ ok: true });
});

// API: Get results
app.get('/api/results/:slug', (req, res) => {
  const { slug } = req.params;
  const event = db.prepare('SELECT id, name FROM events WHERE slug = ?').get(slug);
  if (!event) return res.status(404).json({ error: 'Event nicht gefunden' });
  res.json({ event: event.name, ...getStats(event.id) });
});

// API: SSE stream
app.get('/api/stream/:slug', (req, res) => {
  const { slug } = req.params;
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive'
  });
  if (!sseClients.has(slug)) sseClients.set(slug, []);
  sseClients.get(slug).push(res);
  req.on('close', () => {
    const arr = sseClients.get(slug) || [];
    sseClients.set(slug, arr.filter(c => c !== res));
  });
});

// API: Create event (admin)
app.post('/api/events', (req, res) => {
  const { name, slug } = req.body;
  if (!name || !slug) return res.status(400).json({ error: 'name und slug benötigt' });
  try {
    db.prepare('INSERT INTO events (name, slug) VALUES (?, ?)').run(name, slug);
    res.json({ ok: true });
  } catch (e) {
    res.status(409).json({ error: 'Slug existiert bereits' });
  }
});

// API: List events (admin)
app.get('/api/events', (req, res) => {
  const events = db.prepare('SELECT id, name, slug, active, created_at FROM events ORDER BY created_at DESC').all();
  res.json(events);
});

// API: Export CSV
app.get('/api/export/:slug', (req, res) => {
  const { slug } = req.params;
  const event = db.prepare('SELECT id, name FROM events WHERE slug = ?').get(slug);
  if (!event) return res.status(404).json({ error: 'Event nicht gefunden' });
  const rows = db.prepare('SELECT rahmen, relevanz, weiterverfolgen, freitext, created_at FROM responses WHERE event_id = ? ORDER BY created_at').all(event.id);
  const header = 'Rahmen,Relevanz,Weiterverfolgen,Freitext,Zeitpunkt\n';
  const csv = rows.map(r => `${r.rahmen},${r.relevanz},${r.weiterverfolgen},"${(r.freitext||'').replace(/"/g,'""')}",${r.created_at}`).join('\n');
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="wirkungsmessung-${slug}.csv"`);
  res.send(header + csv);
});

function getStats(eventId) {
  const total = db.prepare('SELECT COUNT(*) as c FROM responses WHERE event_id = ?').get(eventId).c;
  const rahmen = db.prepare('SELECT rahmen as v, COUNT(*) as c FROM responses WHERE event_id = ? GROUP BY rahmen').all(eventId);
  const relevanz = db.prepare('SELECT relevanz as v, COUNT(*) as c FROM responses WHERE event_id = ? GROUP BY relevanz').all(eventId);
  const weiterverfolgen = db.prepare('SELECT weiterverfolgen as v, COUNT(*) as c FROM responses WHERE event_id = ? GROUP BY weiterverfolgen').all(eventId);
  const freitexte = db.prepare("SELECT freitext FROM responses WHERE event_id = ? AND freitext IS NOT NULL AND freitext != '' ORDER BY created_at DESC LIMIT 50").all(eventId).map(r => r.freitext);
  return { total, rahmen, relevanz, weiterverfolgen, freitexte };
}

// SPA fallback for /event/:slug and /results/:slug and /admin
app.get(['/event/:slug', '/results/:slug', '/admin'], (req, res) => {
  res.sendFile(join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => console.log(`Wirkungsmessung läuft auf http://localhost:${PORT}`));
