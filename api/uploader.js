// Vercel Serverless Function: /api/uploader?action=...
// Verbindet die Desktop-App (Wiz fan Club App) mit einem Website-Account – ohne Service-Key in der App.
//
//  Website (eingeloggt, Header "Authorization: Bearer <Supabase-JWT>"):
//    POST newcode            -> { code, expires_at }       6-stelliger Code, 10 Minuten gueltig
//    GET  overview           -> { links, devices }         gebundene IDs + verbundene PCs
//    POST revoke  {id}       -> PC trennen
//    POST unlink  {governor_id}
//    POST pilot_answer {id, allow}   -> Pilot-Anfrage fuer die eigene Profil-ID erlauben/ablehnen
//  App (Header "X-Device-Token: <token>"):
//    POST pair    {code, device_name} -> { token, user }   (ohne Token)
//    GET  me                          -> { user, links }
//    POST link    {governor_id, gov_name, kind}   kind: main (= ID im Website-Profil), alt (eigener Zweitaccount), pilot (fremder Account, den ich spiele)
//    POST unlink  {governor_id}
//    POST upload  {rows}              -> nur Kampfzeilen eigener, gebundener IDs
//
// Benoetigt in Vercel → Settings → Environment Variables: SUPABASE_SERVICE_ROLE_KEY (optional SUPABASE_URL)

const crypto = require('crypto');

const SB_URL = (process.env.SUPABASE_URL || 'https://tqkhnicaiokyckiqwvpw.supabase.co').replace(/\/+$/, '').replace(/\/rest\/v1$/, '');
const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || '';
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';   // ohne 0/O/1/I
const CODE_MIN = 10;
const MAX_ROWS = 500;

const sha = (s) => crypto.createHash('sha256').update(String(s)).digest('hex');
const now = () => new Date().toISOString();

async function rest(method, path, body, prefer) {
  const r = await fetch(`${SB_URL}/rest/v1/${path}`, {
    method,
    headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, 'Content-Type': 'application/json', ...(prefer ? { Prefer: prefer } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const txt = await r.text();
  let data = null; try { data = txt ? JSON.parse(txt) : null; } catch { data = txt; }
  if (!r.ok) { const e = new Error((data && (data.message || data.hint)) || `Supabase ${r.status}`); e.status = r.status; throw e; }
  return data;
}

async function userFromJwt(req) {
  const h = req.headers.authorization || '';
  const jwt = h.startsWith('Bearer ') ? h.slice(7) : '';
  if (!jwt) return null;
  const r = await fetch(`${SB_URL}/auth/v1/user`, { headers: { apikey: SB_KEY, Authorization: `Bearer ${jwt}` } });
  if (!r.ok) return null;
  const u = await r.json();
  return u && u.id ? u : null;
}

async function userFromDevice(req) {
  const tok = String(req.headers['x-device-token'] || '');
  if (tok.length < 20) return null;
  const rows = await rest('GET', `uploader_devices?token_hash=eq.${sha(tok)}&select=id,user_id`);
  const d = rows && rows[0];
  if (!d) return null;
  rest('PATCH', `uploader_devices?id=eq.${d.id}`, { last_seen: now() }).catch(() => {});
  return { id: d.user_id, device_id: d.id };
}

async function userName(uid) {
  try {
    const lb = await rest('GET', `leaderboard?user_id=eq.${uid}&select=username,governor_id&limit=1`);
    if (lb && lb[0]) return { name: lb[0].username || 'Spieler', profile_gov: lb[0].governor_id || null };
  } catch {}
  return { name: 'Spieler', profile_gov: null };
}

const LCOLS = 'id,governor_id,gov_name,kind,status,verified,created_at';
const links = (uid) => rest('GET', `governor_links?user_id=eq.${uid}&select=${LCOLS}&order=created_at`);
const okIds = async (uid) => new Map(((await links(uid)) || []).filter((x) => x.status === 'ok').map((x) => [String(x.governor_id), x.gov_name || String(x.governor_id)]));
const gidOf = (v) => { const s = String(v ?? '').replace(/\D/g, ''); return s && s.length <= 12 ? s : ''; };

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (!SB_KEY) return res.status(500).json({ error: 'Server nicht konfiguriert: SUPABASE_SERVICE_ROLE_KEY fehlt in Vercel.' });
  const action = String(req.query?.action || '');
  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch { body = {}; } }
  body = body || {};

  try {
    // ---------- Website ----------
    if (action === 'newcode' || action === 'overview' || action === 'revoke' || action === 'pilot_answer' || (action === 'unlink' && !req.headers['x-device-token'])) {
      const u = await userFromJwt(req);
      if (!u) return res.status(401).json({ error: 'Nicht eingeloggt.' });

      if (action === 'newcode') {
        await rest('DELETE', `uploader_codes?user_id=eq.${u.id}&used=eq.false`);
        let code = '';
        for (let i = 0; i < 6; i++) code += CODE_CHARS[crypto.randomInt(CODE_CHARS.length)];
        const expires_at = new Date(Date.now() + CODE_MIN * 60000).toISOString();
        await rest('POST', 'uploader_codes', { code, user_id: u.id, expires_at });
        return res.json({ code, expires_at });
      }
      const prof = gidOf((await userName(u.id)).profile_gov);
      if (action === 'overview') {
        const [l, d] = await Promise.all([links(u.id), rest('GET', `uploader_devices?user_id=eq.${u.id}&select=id,device_name,created_at,last_seen&order=created_at`)]);
        let pilots = [];                                       // wer pilotiert meine Profil-ID?
        if (prof) {
          pilots = (await rest('GET', `governor_links?governor_id=eq.${prof}&kind=eq.pilot&user_id=neq.${u.id}&select=id,user_id,status,created_at`)) || [];
          if (pilots.length) {
            const lb = (await rest('GET', `leaderboard?user_id=in.(${pilots.map((p) => p.user_id).join(',')})&select=user_id,username`)) || [];
            const nm = new Map(lb.map((x) => [x.user_id, x.username]));
            pilots = pilots.map((p) => ({ id: p.id, status: p.status, created_at: p.created_at, name: nm.get(p.user_id) || 'Spieler' }));
          }
        }
        return res.json({ links: l || [], devices: d || [], pilots, profile_gov: prof || null });
      }
      if (action === 'pilot_answer') {
        if (!prof) return res.status(400).json({ error: 'In deinem Profil ist keine Governor-ID eingetragen.' });
        const id = parseInt(body.id, 10) || 0;
        const q = `governor_links?id=eq.${id}&governor_id=eq.${prof}&kind=eq.pilot`;
        if (body.allow) await rest('PATCH', q, { status: 'ok' }); else await rest('DELETE', q);
        return res.json({ ok: true });
      }
      if (action === 'revoke') {
        await rest('DELETE', `uploader_devices?id=eq.${parseInt(body.id, 10) || 0}&user_id=eq.${u.id}`);
        return res.json({ ok: true });
      }
      const g = gidOf(body.governor_id);
      await rest('DELETE', `governor_links?governor_id=eq.${g || 0}&user_id=eq.${u.id}`);
      return res.json({ ok: true });
    }

    // ---------- App: Koppeln ----------
    if (action === 'pair') {
      if (req.method !== 'POST') return res.status(405).json({ error: 'Nur POST.' });
      const code = String(body.code || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
      if (code.length !== 6) return res.status(400).json({ error: 'Code muss 6 Zeichen haben.' });
      const rows = await rest('GET', `uploader_codes?code=eq.${code}&select=user_id,expires_at,used`);
      const c = rows && rows[0];
      if (!c || c.used || new Date(c.expires_at) < new Date()) return res.status(400).json({ error: 'Code ungültig oder abgelaufen.' });
      await rest('PATCH', `uploader_codes?code=eq.${code}`, { used: true });
      const token = crypto.randomBytes(32).toString('base64url');
      await rest('POST', 'uploader_devices', { user_id: c.user_id, token_hash: sha(token), device_name: String(body.device_name || 'PC').slice(0, 60), last_seen: now() });
      return res.json({ token, user: await userName(c.user_id) });
    }

    // ---------- App: alles weitere nur mit Geraete-Token ----------
    const u = await userFromDevice(req);
    if (!u) return res.status(401).json({ error: 'App ist nicht (mehr) verbunden. Bitte neu koppeln.' });

    if (action === 'me') {
      const me = await userName(u.id);
      return res.json({ user: { ...me, profile_gov: gidOf(me.profile_gov) || null }, links: (await links(u.id)) || [] });
    }
    if (action === 'link') {
      const g = gidOf(body.governor_id);
      if (!g) return res.status(400).json({ error: 'Ungültige Governor-ID.' });
      const kind = ['main', 'alt', 'pilot'].includes(body.kind) ? body.kind : 'alt';
      const prof = gidOf((await userName(u.id)).profile_gov);
      const owners = ((await rest('GET', `leaderboard?governor_id=eq.${g}&select=user_id,username`)) || []).filter((o) => o.user_id !== u.id);
      const ex = ((await rest('GET', `governor_links?governor_id=eq.${g}&select=user_id,kind`)) || []).filter((x) => x.user_id !== u.id && x.kind !== 'pilot');
      let status = 'ok', verified = false;
      if (kind === 'main') {
        if (!prof) return res.status(400).json({ error: 'In deinem Website-Profil ist noch keine Governor-ID eingetragen. Trag sie dort zuerst ein.' });
        if (prof !== g) return res.status(400).json({ error: `Diese ID stimmt nicht mit der Governor-ID in deinem Profil (${prof}) überein.` });
        verified = true;
      } else if (kind === 'alt') {
        if (owners.length) return res.status(409).json({ error: `Diese ID steht im Profil von ${owners[0].username || 'einem anderen Spieler'}. Wenn du den Account spielst, binde ihn als „Pilot“.` });
      } else {
        if (owners.length) status = 'pending';               // Besitzer ist auf der Website -> muss erlauben
      }
      if (kind !== 'pilot' && ex.length) return res.status(409).json({ error: 'Diese ID ist schon mit einem anderen Account verbunden.' });
      await rest('POST', 'governor_links?on_conflict=governor_id,user_id',
        { governor_id: +g, user_id: u.id, gov_name: String(body.gov_name || '').slice(0, 40) || null, kind, status, verified }, 'resolution=merge-duplicates');
      return res.json({ ok: true, status, links: await links(u.id) });
    }
    if (action === 'unlink') {
      const g = gidOf(body.governor_id);
      await rest('DELETE', `governor_links?governor_id=eq.${g || 0}&user_id=eq.${u.id}`);
      return res.json({ ok: true, links: await links(u.id) });
    }
    if (action === 'upload') {
      const rows = Array.isArray(body.rows) ? body.rows.slice(0, MAX_ROWS) : [];
      if (!rows.length) return res.json({ ok: true, saved: 0 });
      const mine = await okIds(u.id);                          // nur bestaetigte Bindungen (keine offenen Pilot-Anfragen)
      const ok = rows.filter((r) => r && r.mail_id && r.opponent_id != null && mine.has(String(r.player_id)))
        .map((r) => ({ ...r, account: mine.get(String(r.player_id)) }));
      if (ok.length) await rest('POST', 'rok_battles?on_conflict=mail_id,opponent_id', ok, 'resolution=merge-duplicates,return=minimal');
      return res.json({ ok: true, saved: ok.length, skipped: rows.length - ok.length });
    }
    return res.status(400).json({ error: 'Unbekannte Aktion.' });
  } catch (e) {
    return res.status(e.status && e.status < 500 ? 400 : 500).json({ error: e.message || 'Serverfehler' });
  }
};
