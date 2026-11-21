// Wiz fan Club – Battles (eigener Bereich, Reiter neben Feed)
// Kampfberichte aus dem Mailcache des Spiels – der Kampf-Uploader auf dem PC (rok_kampf_upload.py) lädt sie hoch.
// Supabase: rok_battles (Einzelkämpfe), rok_loot (Beute), rok_rallies (Gruppenkämpfe), rok_item_names (optionale Namen)
// PvP = nur Kämpfe gegen Spieler mit Kill Points · PvE = Barbaren / Marodeure / Forts (NpcBType aus dem Bericht) + Belohnungen
// Läuft innerhalb von RokApp (scanner.js); R = geteilter Kontext (window.Rok).
window.RokMods = window.RokMods || {};
window.RokMods.battles = (R) => {
  const $ = R.$, fmt = R.fmt, short = R.short, esc = R.esc, RokAuth = window.RokAuth;
  const dec = (v, d = 2) => (+v || 0).toLocaleString('de-DE', { maximumFractionDigits: d });
  const isoDay = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const makeFold = (sec, key) => { if (sec && R.makeFold) R.makeFold(sec, key); };
  // Einstellungen (Filter, Sortierung, PvE-Zuordnung) – lokal je Profil
  const KEY = 'rok_battles_' + (R.PROFILE?.id || 'x');
  let S = {}; try { S = JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch { S = {}; }
  // Farm-Namen, Gruppen, verknüpfte IDs usw. zusätzlich in Supabase (rok_mydata_settings) → gleich auf jedem Gerät / jeder Vercel-Adresse
  const CLOUD_KEYS = ['rsNames', 'rsGroups', 'rsGroupNames', 'linkIds', 'rsKvk', 'idNames', 'accKvk', 'heatAcc', 'buffRes', 'buffAck', 'buffHide'];
  let cloudReady = false, cloudLast = '', cloudMissing = false;
  const cloudPick = () => { const k = S.kampf || {}, o = {}; CLOUD_KEYS.forEach(x => { if (k[x] != null) o[x] = k[x]; }); return o; };
  const cloudSave = () => {
    if (!cloudReady || cloudMissing) return; const uid = RokAuth?.userId?.(), db = RokAuth?.db?.(); if (!uid || !db) return;
    const v = cloudPick(), j = JSON.stringify(v); if (j === cloudLast) return; cloudLast = j;
    db.from('rok_mydata_settings').upsert({ user_id: uid, settings: v, updated_at: new Date().toISOString() }).then(({ error }) => { if (error) { console.warn('MyData-Einstellungen nicht in Supabase gespeichert', error); if (/rok_mydata_settings|relation|schema/i.test(error.message || '')) cloudMissing = true; } });
  };
  const savePassive = () => { clearTimeout(savePassive._t); savePassive._t = setTimeout(() => { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch {} cloudSave(); }, 300); };
  (async () => {
    try { const uid = RokAuth?.userId?.(), db = RokAuth?.db?.(); if (!uid || !db) return;
      const { data, error } = await db.from('rok_mydata_settings').select('settings').eq('user_id', uid).maybeSingle();
      if (error) { cloudMissing = true; console.warn('Tabelle rok_mydata_settings fehlt? Einstellungen bleiben nur im Browser.', error); return; }
      const cs = data?.settings && typeof data.settings === 'object' ? data.settings : null;
      cloudReady = true;
      if (cs && Object.keys(cs).length) {   // Cloud gewinnt, lokale Einträge die dort fehlen bleiben erhalten
        const k = (S.kampf = S.kampf || {});
        CLOUD_KEYS.forEach(x => { if (cs[x] == null) return; k[x] = (typeof cs[x] === 'object' && !Array.isArray(cs[x]) && k[x] && typeof k[x] === 'object') ? { ...k[x], ...cs[x] } : cs[x]; });
        cloudLast = JSON.stringify(cs);
        try { localStorage.setItem(KEY, JSON.stringify(S)); } catch {}
        if (R.view === 'battles' && typeof renderKampf === 'function') renderKampf();
      }
      cloudSave();   // lokal vorhandene Namen einmalig hochladen bzw. zusammengeführten Stand sichern
    } catch (e) { console.warn(e); }
  })();
  if (!$('battlesView')) return;
  (() => {   // ?heat=C13340&p=<ID> → direkt in die Heatmap (Watch)
    let q; try { q = new URLSearchParams(location.search); } catch { return; } const k = q.get('heat'); if (!k) return;
    try { const st = kbSt(), h = (st.heat = st.heat || {}); st.page = 'heat'; h.mode = 'watch'; h.wkvk = /^C\d{5}$/i.test(k) ? k.toUpperCase() : ''; h.watch = /^\d+$/.test(q.get('p') || '') ? q.get('p') : ''; h.src = 'pvp'; h.fight = null; h.pop = null; h.iso = null; h.tl = null; savePassive(); } catch {}
    try { const u = new URL(location.href); u.searchParams.delete('heat'); u.searchParams.delete('p'); history.replaceState(null, '', u.pathname + u.search + u.hash); } catch {}
    setTimeout(() => { R.view = 'battles'; R.applyView?.(); window.scrollTo({ top: 0 }); }, 400);
  })();

  var kbRows = null, kbErr = '', kbLoading = false, kbProg = 0, kbShow = 50, kbNpcCols = true, kbPosCols = true, kbAccCols = true, kbParCols = true, kbKdCols = true, kbFmCols = true;
  function kbSel() { return KB_COLS + (kbNpcCols ? ',npc_btype,npc_level,group_size' : '') + (kbPosCols ? ',pos_x,pos_y,city_x,city_y,map_role,room_id' : '') + (kbPosCols && kbAccCols ? ',acclaim' : '') + (kbParCols ? ',parent_id' : '') + (kbKdCols ? ',enemy_kingdom' : '') + (kbFmCols ? ',self_formation,enemy_formation' : ''); }
  var KB_COLS = 'mail_id,opponent_id,account,player_id,battle_start,battle_end,is_pvp,self_name,self_alliance,self_hero1,self_hero2,self_troops_start,self_wounded,self_severe,self_dead,self_healing,self_power_lost,enemy_name,enemy_alliance,enemy_hero1,enemy_hero2,enemy_troops_start,enemy_wounded,enemy_severe,enemy_dead,enemy_power_lost,kill_points,enemy_kill_points,server_id';
  // Laden pro Account: jede Governor-ID wird einmal geladen und gemerkt – Account-Wechsel ohne Neuladen
  var kbCache = new Map(), kbAllRows = null, kbCurKey = null, kbTotal = 0;
  function kbScopeIds() {   // welche IDs die aktuelle Seite braucht (null = alles, was du sehen darfst)
    const st = kbSt(), h = st.heat || {};
    if (st.page === 'heat' && hmSpect()) { const ws = h.wkvk ? hmWatchSet(hmCfg(st)) : null; return ws ? [...ws].map(String) : null; }
    const base = st.acc ? [String(st.acc)] : [...kbMyIds()];
    if (!base.length) return null;
    if (st.page === 'heat' && (h.fr || h.cmpOpen)) { if (!hmMates && !hmMatesLoading) hmLoadMates(); (hmMates || []).forEach(m => base.push(String(m.gid))); }
    return [...new Set(base)];
  }
  function kbApply() {
    const ids = kbScopeIds(), key = ids ? ids.slice().sort().join(',') : '*';
    if (key === kbCurKey && kbRows) return true;
    if (!ids) { if (!kbAllRows) return false; kbRows = kbAllRows; kbCurKey = key; return true; }
    if (ids.some(i => !kbCache.has(i))) return false;
    kbRows = ids.length === 1 ? kbCache.get(ids[0]) : ids.flatMap(i => kbCache.get(i)).sort((a, b) => (b.battle_start || '').localeCompare(a.battle_start || ''));
    kbCurKey = key; return true;
  }
  function kbProgUI() { if (R.view !== 'battles') return; const p = $('kbProg'), b = $('kbLoadBar'); if (p) p.textContent = fmt(kbProg) + (kbTotal ? ' / ' + fmt(kbTotal) : '');
    if (b) b.style.width = (kbTotal ? Math.min(100, kbProg / kbTotal * 100) : 8) + '%'; }
  function kbLoaderHtml() {   // ⚔️ zwei Schwerter, die aneinander klingen
    if (!document.getElementById('kbLoadCss')) { const c = document.createElement('style'); c.id = 'kbLoadCss';
      c.textContent = `.kbsw{position:relative;width:120px;height:80px;margin:0 auto}.kbsw span{position:absolute;top:14px;font-size:44px;line-height:1;transform-origin:50% 90%}
        .kbsw .l{left:18px;animation:kbswL .9s ease-in-out infinite}.kbsw .r{right:18px;animation:kbswR .9s ease-in-out infinite}
        .kbsw .s{left:50%;top:2px;font-size:22px;margin-left:-11px;opacity:0;animation:kbswS .9s ease-in-out infinite}
        @keyframes kbswL{0%,100%{transform:rotate(-55deg)}45%,55%{transform:rotate(12deg)}}@keyframes kbswR{0%,100%{transform:scaleX(-1) rotate(-55deg)}45%,55%{transform:scaleX(-1) rotate(12deg)}}
        @keyframes kbswS{0%,40%,70%,100%{opacity:0;transform:scale(.4)}50%{opacity:1;transform:scale(1.3)}}`; document.head.appendChild(c); }
    return `<div class="py-10 text-center"><div class="kbsw"><span class="l">🗡️</span><span class="r">🗡️</span><span class="s">✨</span></div>
      <div class="font-display text-gold-300 tracking-widest mt-2">Loading …</div>
      <div class="text-xs text-slate-400 mt-1"><span>Lade Kampfberichte</span> <span id="kbProg" class="tabular-nums">${fmt(kbProg)}${kbTotal ? ' / ' + fmt(kbTotal) : ''}</span></div>
      <div class="max-w-xs mx-auto mt-3 h-2 rounded-full bg-ink-800 overflow-hidden"><div id="kbLoadBar" class="h-2 rounded-full bg-gradient-to-r from-gold-500 to-red-400 transition-all" style="width:${kbTotal ? Math.min(100, kbProg / kbTotal * 100) : 8}%"></div></div></div>`;
  }
  async function loadBattles(force) {
    if (kbLoading) return;
    const ids = kbScopeIds();
    if (force) { if (ids) ids.forEach(i => kbCache.delete(i)); else kbAllRows = null; kbCurKey = null; }
    if (kbApply()) return;
    const miss = ids ? ids.filter(i => !kbCache.has(i)) : null;
    kbLoading = true; kbProg = 0; kbTotal = 0; kbErr = ''; if (R.view === 'battles') renderKampf();
    try { const db = RokAuth.db?.(); if (!db) throw new Error('offline');
      const q0 = (cnt) => { let q = db.from('rok_battles').select(kbSel(), cnt ? { count: 'exact' } : undefined); if (miss) q = q.in('player_id', miss); return q.order('battle_start', { ascending: false }).order('mail_id').order('opponent_id'); };
      let first = null;
      for (let t = 0; t < 8; t++) {
        first = await q0(true).range(0, 999); const m = first.error?.message || ''; if (!first.error) break;
        if (kbFmCols && /formation/i.test(m)) { kbFmCols = false; continue; }   // SQL v20 (Truppentyp) noch nicht ausgeführt
        if (kbKdCols && /enemy_kingdom/i.test(m)) { kbKdCols = false; continue; }
        if (kbParCols && /parent_id/i.test(m)) { kbParCols = false; continue; }   // SQL v17
        if (kbAccCols && /acclaim/i.test(m)) { kbAccCols = false; continue; }   // SQL v11
        if (kbPosCols && /pos_|city_|map_role|room_id/i.test(m)) { kbPosCols = false; continue; }   // SQL v9
        if (kbNpcCols && /npc_|group_size|column/i.test(m)) { kbNpcCols = false; continue; }   // SQL v4
        throw first.error;
      }
      if (first.error) throw first.error;
      let all = first.data || []; kbTotal = +first.count || 0; kbProg = all.length; kbProgUI();
      if (all.length >= 1000) {
        if (kbTotal) {   // restliche Seiten parallel (6 gleichzeitig)
          const n = Math.ceil(kbTotal / 1000), res = new Array(n); let next = 1;
          await Promise.all(Array.from({ length: 6 }, async () => { while (next < n) { const p = next++; const q = await q0(false).range(p * 1000, p * 1000 + 999); if (q.error) throw q.error; res[p] = q.data || []; kbProg += res[p].length; kbProgUI(); } }));
          for (let p = 1; p < n; p++) all = all.concat(res[p] || []);
        } else for (let from = 1000; from < 300000; from += 1000) { const q = await q0(false).range(from, from + 999); if (q.error) throw q.error; all = all.concat(q.data || []); kbProg = all.length; kbProgUI(); if (!q.data || q.data.length < 1000) break; }
        const seen = new Set(); all = all.filter(r => { const k = r.mail_id + '|' + r.opponent_id; if (seen.has(k)) return false; seen.add(k); return true; });
      }
      if (miss) { miss.forEach(i => kbCache.set(i, [])); all.forEach(r => { const k = String(r.player_id); (kbCache.get(k) || kbCache.set(k, []).get(k)).push(r); }); } else kbAllRows = all;
    } catch (e) { if (miss) miss.forEach(i => { if (!kbCache.has(i)) kbCache.set(i, []); }); else kbAllRows = kbAllRows || []; kbErr = /rok_battles|relation|schema cache/i.test(e?.message || '') ? 'missing' : (e?.message || String(e)); }
    kbLoading = false; kbCurKey = null; kbFreshT = Date.now(); kbApply(); if (R.view === 'battles') renderKampf();
  }
  // Live: nur Kämpfe nachladen, die neuer sind als der neueste geladene
  var kbFreshT = 0, kbFreshing = false;
  async function kbLoadNew() {   // neue Kämpfe nachladen – pro ID ab ihrem neuesten Kampf (minus 3 h, weil der Uploader Berichte auch später nachliefert)
    if (kbLoading || !kbRows || kbFreshing) return 0; kbFreshing = true; kbFreshT = Date.now();
    try { const db = RokAuth.db?.(); if (!db) return 0; const ids = kbScopeIds(), newest = new Map();
      kbRows.forEach(r => { const k = String(r.player_id), t = r.battle_start || ''; if (t > (newest.get(k) || '')) newest.set(k, t); });
      const base = ids ? ids.map(i => newest.get(String(i)) || '') : [...newest.values()], low = base.some(x => !x) ? '' : base.sort()[0] || '';
      const since = low ? new Date(Date.parse(low) - 3 * 36e5).toISOString() : new Date(Date.now() - 2 * 864e5).toISOString();
      let q = db.from('rok_battles').select(kbSel()).gte('battle_start', since); if (ids) q = q.in('player_id', ids.length ? ids : ['0']); q = await q.order('battle_start', { ascending: false }).limit(5000); if (q.error) return 0;
      const have = new Set(kbRows.map(r => r.mail_id + '|' + r.opponent_id)), add = (q.data || []).filter(r => !have.has(r.mail_id + '|' + r.opponent_id));
      if (add.length) { const touched = new Set(); add.forEach(r => { const c = kbCache.get(String(r.player_id)); if (c) { c.push(r); touched.add(c); } if (kbAllRows && kbAllRows !== c) { kbAllRows.push(r); touched.add(kbAllRows); } });
        touched.forEach(c => c.sort((x, y) => (y.battle_start || '').localeCompare(x.battle_start || ''))); kbCurKey = null; kbApply(); }
      return add.length; } catch { return 0; } finally { kbFreshing = false; }
  }
  function kbSt() { const s = (S.kampf = S.kampf || { acc: '', type: 'pvp', days: 30, from: '', to: '' }); if (s.type !== 'pvp' && s.type !== 'pve') s.type = 'pvp'; return s; }
  // PvE-Arten: NpcBType aus dem Bericht → Kategorie (1 = Barbar sicher, Rest einstellbar unter „PvE-Gegnerarten“)
  var KB_CATS = [['barb', '🪓 Barbaren'], ['fort', '🏯 Forts'], ['baulur', '🐗 Baulurs'], ['raid', '👑 Raid-Boss'], ['ckaruak', '💎 Kristall-Karuak'], ['maraud', '🐎 Marodeure']];
  // NpcBType aus den Berichten: 1 = Barbar (Kdt. 273) · 41 = Fort (Kdt. 272, viele Wellen) · 47 / 28–30 = Baulurs (KvK)
  // 2 = Raid-Boss (Kdt. 204, 2,1 Mio. Truppen, Belohnung per Mail „KillRaidBossReport“) · 13 = Kristall-Karuak? (Kdt. 77, Beute im Bericht)
  // 9 = Karuak ohne Belohnung und alles Unbekannte (z. B. Offseason-Event) → wird nicht gezählt
  var KB_NPC = { 1: 'barb', 41: 'fort', 47: 'baulur', 28: 'baulur', 29: 'baulur', 30: 'baulur', 2: 'raid', 13: 'ckaruak' };
  var KB_REWARD_MAIL = { KillRaidBossReport: 'raid' };   // Belohnungen, die als eigene Mail kommen → Kategorie
  // Ein Ziel zählt als besiegt, wenn alle Gegner-Truppen weg sind – ein Fort zählt einmal pro Bericht
  function kbDefeated(r) { const t = kbN(r.enemy_troops_start); return t > 0 && kbN(r.enemy_dead) + kbN(r.enemy_severe) + kbN(r.enemy_wounded) >= t * 0.999; }
  function kbTargets(rows, cat) {
    const s = new Set(); rows.forEach(r => { const c = kbCatOf(r.npc_btype, r.group_size); if (cat && c !== cat) return;
      if (c === 'fort') s.add('f|' + r.mail_id); else if (kbDefeated(r)) s.add(r.mail_id + '|' + r.opponent_id); });
    return s.size;
  }
  function kbCatOf(bt, group) {
    if (bt != null) return KB_NPC[bt] || 'skip';
    return group > 1 ? 'fort' : 'skip';   // alte Berichte ohne Art: Rally = Fort
  }
  function kbCatLabel(c) { return (KB_CATS.find(x => x[0] === c) || [c, '–'])[1]; }
  function kxLootCat(r) { return r.source === 'event' ? (KB_REWARD_MAIL[r.event_name] || 'skip') : kbCatOf(r.npc_btype, 1); }
  // Gruppenkämpfe, bei denen du nur Teilnehmer warst (rok_rallies) – als Zeilen für die Zählung
  // Meine IDs: Governor-ID aus dem Profil + selbst verknüpfte IDs (z. B. Filler oder zweiter Account).
  // Battles und Loot zeigen nur Daten dieser IDs – spielst du auf einem anderen Account, trag dessen ID im Profil ein.
  function kbProfileId() { try { return String((window.RokAuth?.ownMeta?.() || {}).governor_id || '').replace(/\D/g, ''); } catch { return ''; } }
  function kbMyIds() { const s = new Set((kbSt().linkIds || []).map(String)); const p = kbProfileId(); if (p) s.add(p); (kbAppIds || []).forEach(x => s.add(x)); if (!kbAppIds) kbLoadAppIds(); return s; }
  // In der Wiz-fan-Club-App gebundene IDs (Main + Zweitaccounts, bestätigt) zählen automatisch mit
  var kbAppIds = null;
  async function kbLoadAppIds() { if (kbAppIds) return; kbAppIds = new Set();
    try { const db = RokAuth?.db?.(); if (!db || !RokAuth?.userId?.()) { kbAppIds = null; return; }
      const q = await db.from('governor_links').select('governor_id,kind,status').eq('status', 'ok');
      (q.data || []).filter(x => x.kind !== 'pilot').forEach(x => kbAppIds.add(String(x.governor_id))); } catch {}
    if (kbAppIds.size && R.view === 'battles') renderKampf(); }
  var kbSiteNames = null;   // Governor-ID → Name auf der Website (leaderboard)
  async function kbLoadSiteNames() { if (kbSiteNames) return; kbSiteNames = new Map();
    try { const db = RokAuth?.db?.(), ids = [...kbMyIds()]; if (!db || !ids.length) return; const q = await db.from('leaderboard').select('username,governor_id').in('governor_id', ids);
      (q.data || []).forEach(x => { const g = String(x.governor_id || '').replace(/\D/g, ''); if (g && x.username) kbSiteNames.set(g, x.username); }); } catch {}
    if (kbSiteNames.size && R.view === 'battles') renderKampf(); }
  function kbIdName(id, names) { id = String(id); return kbSiteNames?.get(id) || (kbSt().idNames || {})[id] || names?.get(id) || ''; }
  function kbMine(pid) { const s = kbMyIds(), a = kbSt().acc; return !s.size || s.has(String(pid)) || (!!a && String(pid) === String(a)); }
  function kxRallyRows(pvp) {
    const st = kbSt();
    return (kxRally || []).filter(r => kbMine(r.player_id) && (!st.acc || String(r.player_id) === st.acc) && kxInRange(r.battle_start) && (pvp ? !!r.is_pvp : !r.is_pvp))
      .map(r => ({ mail_id: r.mail_id, opponent_id: 'rally', battle_start: r.battle_start, player_id: r.player_id, npc_btype: r.npc_btype, npc_level: r.npc_level, group_size: Math.max(2, +r.members || 2), is_pvp: !!r.is_pvp, joined: true }));
  }
  function kbIsAoo(r) { const g = +r.server_id; return g > 0 && g < 10000; }   // Ark of Osiris: eigener Schlachtfeld-Server (z. B. 3443), Königreich/KvK = 5-stellig (16144 …)
  function kbIsPvp(r) { return !!r.is_pvp && kbN(r.kill_points) > 0; }   // PvP = nur Kämpfe gegen Spieler, die Kill Points gebracht haben

  // ===== Truppentyp (geschätzt): erst nach Rüstungs-Formation, sonst nach Hauptkommandant =====
  const KB_FORM = { 17: 'inf', 20: 'inf', 2: 'arch', 19: 'arch', 9: 'cav', 13: 'cav', 21: 'cav', 3: 'siege' };   // Pincer = Inf, Wedge = Bogen, Delta = Kav, V = Belagerung
  const KB_TT = { inf: ['🛡️', 'Infanterie'], cav: ['🐎', 'Kavallerie'], arch: ['🏹', 'Bogenschützen'], siege: ['🪨', 'Belagerung'] };
  const KB_HERO_T = (() => { const o = {}, add = (t, l) => l.split(',').forEach(n => o[n.trim().toLowerCase()] = t);
    add('inf', 'Sun Tzu,Richard I,Charles Martel,Constantine I,Scipio Africanus,Scipio Africanus Prime,Leonidas I,Björn Ironside,Alexander the Great,Zenobia,Flavius Aetius,Gorgo,Liu Che,Heraclius,Sargon the Great,Bai Qi,William Wallace,Guan Yu,Tariq ibn Ziyad,Wak Chanil Ajaw,Harald Sigurdsson,Philip II,Tokugawa Ieyasu,Hua Mulan,Gaius Marius,Justinian I,Theodora,Martel');
    add('cav', 'Cao Cao,Minamoto no Yoshitsune,Pelagius,Baibars,Saladin,Attila,Takeda Shingen,Xiang Yu,Chandragupta Maurya,Alexander Nevsky,Belisarius,William I,Achilles,Ivan IV,Huo Qubing,El Cid,Lancelot,Bertrand du Guesclin,Jadwiga,Arthur Pendragon,Subutai,Genghis Khan,Tomoe Gozen');
    add('arch', 'Yi Seong-Gye,Hermann,Hermann Prime,Ramesses II,Henry V,Artemisia I,Nebuchadnezzar II,Amanitore,Zhuge Liang,Ashurbanipal,Dido,Yi Sun-sin,Edward of Woodstock,Tomyris,Gilgamesh,Shapur I,Kublai Khan,Qin Shi Huang,Boudica');
    add('siege', 'Mehmed II,Babur,Wu Zetian,Ivar the Boneless'); return o; })();
  var KB_HERO_TI = null;   // Truppentyp nach Bild-ID → funktioniert für deutsche und englische Namen (Iwan IV. = Ivan IV)
  function kbHeroT(n) { n = String(n || '').trim(); if (!n) return null; const d = KB_HERO_T[n.toLowerCase()]; if (d) return d;
    if (!KB_HERO_TI) { KB_HERO_TI = new Map(); Object.entries(KB_HERO_T).forEach(([k, t]) => { const id = hmIconId(k); if (id && !KB_HERO_TI.has(id)) KB_HERO_TI.set(id, t); }); }
    const id = hmIconId(n); return id ? KB_HERO_TI.get(id) || null : null; }
  function kbTroop(f, h1) { return KB_FORM[+f] || kbHeroT(h1) || null; }
  function kbTT(r, side) { return side === 'enemy' ? kbTroop(r.enemy_formation, r.enemy_hero1) : kbTroop(r.self_formation, r.self_hero1); }
  function kbTTChip(t, big) { if (!t) return ''; const x = KB_TT[t]; return `<span class="inline-flex items-center gap-1 rounded-md border border-ink-600 bg-ink-900 px-1.5 py-0.5 ${big ? 'text-xs' : 'text-[10px]'} text-slate-200" title="Truppentyp (geschätzt nach Formation / Kommandant)">${x[0]} <span>${x[1]}</span></span>`; }
  function kbMarchOf(r) { return [r.self_hero1, r.self_hero2].filter(Boolean).join(' / ') || '–'; }
  function kbEnemyOf(r) { return r.enemy_name ? (r.enemy_alliance ? `[${r.enemy_alliance}] ` : '') + r.enemy_name : null; }
  function kbN(v) { return +v || 0; }
  function kbAgg(rows) {
    const o = { battles: new Set(rows.map(r => r.mail_id)).size, rows: rows.length, kp: 0, sDead: 0, sSev: 0, sWound: 0, sHeal: 0, sPow: 0, sTroops: 0, eDead: 0, eSev: 0, eWound: 0, ePow: 0 };
    rows.forEach(r => { o.kp += kbN(r.kill_points); o.sDead += kbN(r.self_dead); o.sSev += kbN(r.self_severe); o.sWound += kbN(r.self_wounded); o.sHeal += kbN(r.self_healing); o.sPow += kbN(r.self_power_lost);
      o.sTroops += kbN(r.self_troops_start); o.eDead += kbN(r.enemy_dead); o.eSev += kbN(r.enemy_severe); o.eWound += kbN(r.enemy_wounded); o.ePow += kbN(r.enemy_power_lost); });
    return o;
  }
  function kbFiltered(skipMarch) {
    const st = kbSt(), rows = (kbRows || []).filter(r => kbMine(r.player_id));
    let from = null, to = null;
    if (st.days === 'custom') { from = st.from ? new Date(st.from + 'T00:00:00').getTime() : null; to = st.to ? new Date(st.to + 'T23:59:59').getTime() : null; }
    else if (+st.days > 0) from = Date.now() - st.days * 86400000;
    return rows.filter(r => { if (st.acc && String(r.player_id) !== st.acc) return false;
      if (st.type === 'pvp' && !kbIsPvp(r)) return false; if (st.type === 'pve' && r.is_pvp) return false;
      if (st.type === 'pve' && kbCatOf(r.npc_btype, r.group_size) === 'skip') return false;   // Karuak ohne Belohnung
      if (st.type === 'pve' && st.cat && kbCatOf(r.npc_btype, r.group_size) !== st.cat) return false;
      if (!skipMarch && st.march && kbMarchOf(r) !== st.march) return false;
      if (st.type === 'pvp' && st.enemy && kbEnemyOf(r) !== st.enemy) return false;
      if (st.type === 'pvp' && st.pvpMode === 'field' && kbIsAoo(r)) return false; if (st.type === 'pvp' && st.pvpMode === 'aoo' && !kbIsAoo(r)) return false;
      const t = r.battle_start ? Date.parse(r.battle_start) : NaN;
      if (from != null && !(t >= from)) return false; if (to != null && !(t <= to)) return false; return true; });
  }
  function kbHeroes(a, b) { return [a, b].filter(Boolean).map(esc).join(' / ') || '–'; }
  // Beute (rok_loot) + Gruppenkämpfe (rok_rallies) + optionale Item-Namen (rok_item_names)
  var kxLoot = null, kxRally = null, kxNames = {}, kxLoading = false;
  async function kxLoadAll(db, table, cols, order) {
    const all = [];
    for (let from = 0; from < 200000; from += 1000) {
      const { data, error } = await db.from(table).select(cols).order(order, { ascending: false }).range(from, from + 999);
      if (error) throw error; all.push(...(data || [])); if (!data || data.length < 1000) break;
    }
    return all;
  }
  async function loadKampfExtra(force) {
    if (kxLoading || (kxLoot && !force)) return; kxLoading = true;
    try { const db = RokAuth.db?.(); if (!db) throw new Error('offline');
      const LC = 'account,mail_id,idx,player_id,got_at,source,event_name,item_type,item_id,amount';
      try { kxLoot = await kxLoadAll(db, 'rok_loot', LC + ',npc_btype,npc_level', 'got_at'); } catch { try { kxLoot = await kxLoadAll(db, 'rok_loot', LC, 'got_at'); } catch { kxLoot = []; } }
      for (const c of ['account,mail_id,player_id,battle_start,leader_name,leader_alliance,members,my_hero1,my_hero2,group_kill_points,group_severe,group_dead,enemy_kill_points,opponents,enemy_names,enemy_alliances,is_pvp,npc_btype,npc_level,pos_x,pos_y,map_role', 'account,mail_id,player_id,battle_start,leader_name,leader_alliance,members,my_hero1,my_hero2,group_kill_points,group_severe,group_dead,enemy_kill_points,opponents,enemy_names,enemy_alliances,is_pvp,npc_btype,npc_level', 'account,mail_id,player_id,battle_start,leader_name,leader_alliance,members,my_hero1,my_hero2,group_kill_points,group_severe,group_dead,enemy_kill_points,opponents,enemy_names,enemy_alliances,is_pvp']) { try { kxRally = await kxLoadAll(db, 'rok_rallies', c, 'battle_start'); break; } catch { kxRally = []; } }   // neueste Spalten zuerst (SQL v9: Ort)
      try { const { data } = await db.from('rok_item_names').select('item_type,item_id,name'); kxNames = {}; (data || []).forEach(r => { kxNames[r.item_type + '_' + r.item_id] = r.name; }); } catch { kxNames = {}; }
    } catch { kxLoot = kxLoot || []; kxRally = kxRally || []; }
    { const seen = new Set(); kxRally = (kxRally || []).filter(r => { const k = r.player_id + '|' + r.battle_start + '|' + (r.group_kill_points ?? '') + '|' + (r.enemy_kill_points ?? ''); if (seen.has(k)) return false; seen.add(k); return true; }); }   // gleicher Gruppenkampf in mehreren Mails nur einmal zählen
    kxLoading = false; if (R.view === 'battles') renderKampf();
  }
  // Bekannte Gegenstände (aus den Kampfberichten abgeglichen: Menge pro Drop + Häufigkeit) – Reihenfolge der Gruppen = Anzeige
  var KX_GROUPS = [['crystal', '💎 Kristalle'], ['gem', '💠 Edelsteine'], ['speed', '⏱️ Beschleuniger'], ['mat', '🧱 Materialien'], ['res', '🌾 Ressourcen'], ['other', '📦 Sonstiges']];
  var KX_ITEMS = {
    '1_9': ['crystal', 'Kristalle'],
    '2_26': ['gem', '10 Edelsteine'],
    '2_34': ['speed', '1-Min. Beschleuniger'], '2_71': ['speed', '1-Min. Trainingsbeschleuniger'], '2_72': ['speed', '5-Min. Trainingsbeschleuniger'], '2_92': ['speed', '5-Min. Heilbeschleuniger'],
    '2_412': ['mat', 'Leder (normal)'], '2_413': ['mat', 'Eisenerz (normal)'], '2_414': ['mat', 'Tierknochen (normal)'], '2_417': ['mat', 'Ebenholz (normal)'],
    '2_141': ['res', '1.000 Nahrung'], '2_142': ['res', '1.000 Holz'], '2_143': ['res', '750 Stein'], '2_144': ['res', '500 Gold'], '2_7005': ['res', 'Ressourcenpaket C Stufe 1'],
    '2_130': ['other', 'Wissensbuch Stufe 3'] };
  function kxGroupOf(t, id) { return (KX_ITEMS[t + '_' + id] || [])[0] || (t === 1 ? 'res' : 'other'); }
  function kxItemName(t, id) { const k = t + '_' + id, own = kxNames[k]; return KX_ITEMS[k]?.[1] || (own && !/^name hier$/i.test(own.trim()) ? own : (t === 1 ? `Ressource #${id}` : `Gegenstand #${id}`)); }
  function kxInRange(ts) {
    const st = kbSt(); const t = ts ? Date.parse(ts) : NaN;
    if (st.days === 'custom') { const f = st.from ? new Date(st.from + 'T00:00:00').getTime() : null, to = st.to ? new Date(st.to + 'T23:59:59').getTime() : null;
      return (f == null || t >= f) && (to == null || t <= to); }
    return !(+st.days > 0) || t >= Date.now() - st.days * 86400000;
  }
  function kxSections(mode) {
    if (!kxLoot && !kxLoading) loadKampfExtra();
    if (!kxLoot) return '';
    const st = kbSt(), th = 'py-2 px-2 font-medium', td = 'py-1 px-2 text-right tabular-nums';
    const accOk = r => kbMine(r.player_id) && (!st.acc || String(r.player_id) === st.acc);
    // Beute
    const isLoot = mode === 'loot', pve = isLoot || st.type === 'pve', cat = pve ? st.cat || '' : '';
    const loot = kxLoot.filter(r => { if (!accOk(r) || !kxInRange(r.got_at)) return false; const c = kxLootCat(r); return c !== 'skip' && (!cat || c === cat); });
    const agg = new Map(); loot.forEach(r => { const k = r.item_type + '_' + r.item_id; const o = agg.get(k) || { t: r.item_type, id: r.item_id, amt: 0, seen: 0 }; o.amt += +r.amount || 0; o.seen++; agg.set(k, o); });
    const gi = (o) => KX_GROUPS.findIndex(g => g[0] === kxGroupOf(o.t, o.id));
    const items = [...agg.values()].sort((a, b) => gi(a) - gi(b) || b.amt - a.amt);
    const nNpc = new Set(loot.filter(r => r.source !== 'event').map(r => r.mail_id + r.idx.split('_')[0])).size, nEv = new Set(loot.filter(r => r.source === 'event').map(r => r.mail_id)).size;
    const lootBox = `<section id="kxLootBox" class="panel rounded-2xl p-5"><h2 class="font-display text-lg text-gold-300">🎁 <span>Belohnungen</span>${cat ? ' – <span>' + kbCatLabel(cat) + '</span>' : ''}</h2>
      <p class="text-xs text-slate-400 mb-3">Was du im gewählten Zeitraum aus NPC-Kämpfen (${fmt(nNpc)} besiegte Ziele) und eigenen Belohnungs-Mails (${fmt(nEv)} Mails, z. B. Raid-Boss) bekommen hast.</p>
      ${items.length ? `<div class="overflow-x-auto rounded-lg border border-ink-700"><table class="w-full text-xs"><thead class="text-[10px] uppercase tracking-wider text-slate-400"><tr class="border-b border-ink-700">
        <th class="${th} text-left">Gegenstand</th><th class="${th} text-right">Menge</th><th class="${th} text-right">Gesehen</th></tr></thead>
        <tbody>${items.map((o, i) => { const g = kxGroupOf(o.t, o.id), head = !i || kxGroupOf(items[i - 1].t, items[i - 1].id) !== g;
          return (head ? `<tr class="bg-ink-900/60"><td colspan="3" class="py-1.5 px-2 text-[11px] font-semibold uppercase tracking-wider text-gold-300">${KX_GROUPS.find(x => x[0] === g)[1]}</td></tr>` : '')
            + `<tr class="border-b border-ink-800/60"><td class="py-1 px-2 pl-4">${esc(kxItemName(o.t, o.id))}</td><td class="${td} text-gold-300">${fmt(o.amt)}</td><td class="${td} text-slate-400">${fmt(o.seen)}×</td></tr>`; }).join('')}</tbody></table></div>
        <div class="mt-2 text-[11px] text-slate-500">Menge = alles zusammen, Gesehen = wie oft der Gegenstand gedroppt ist. Unbekannte Gegenstände stehen als #Nummer unter „Sonstiges“.</div>` : '<div class="text-sm text-slate-500">Keine Beute in diesem Zeitraum.</div>'}</section>`;
    // Gruppenkämpfe
    const ral = (kxRally || []).filter(r => accOk(r) && kxInRange(r.battle_start) && (st.type === 'pvp' ? !!r.is_pvp : !r.is_pvp && (!cat || kbCatOf(r.npc_btype, 2) === cat)));
    const rSum = ral.reduce((a, r) => a + (+r.group_kill_points || 0), 0);
    const rallyBox = `<section id="kxRallyBox" class="panel rounded-2xl p-5"><h2 class="font-display text-lg text-gold-300">🛡️ Gruppenkämpfe (Rally / Garnison)</h2>
      <p class="text-xs text-slate-400 mb-3">Kämpfe, bei denen du nur Teilnehmer warst. Die Kill Points sind die <b>Summe der ganzen Gruppe</b> – deinen eigenen Anteil speichert das Spiel nicht im Bericht.</p>
      ${ral.length ? `<div class="text-[11px] text-slate-500 mb-2">${fmt(ral.length)} Gruppenkämpfe · zusammen ${short(rSum)} KP (Gruppe)</div>
        <div class="overflow-x-auto rounded-lg border border-ink-700"><table class="w-full text-xs"><thead class="text-[10px] uppercase tracking-wider text-slate-400"><tr class="border-b border-ink-700">
        <th class="${th} text-left">Zeit</th><th class="${th} text-left">Anführer</th><th class="${th} text-left">Deine Kdt.</th><th class="${th} text-right">Teiln.</th><th class="${th} text-left">Gegner</th><th class="${th} text-right">KP Gruppe</th><th class="${th} text-right">SV Gruppe</th></tr></thead>
        <tbody>${ral.slice(0, 100).map(r => `<tr class="border-b border-ink-800/60"><td class="py-1 px-2 whitespace-nowrap text-slate-400">${r.battle_start ? new Date(r.battle_start).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' }) : '–'}</td>
          <td class="py-1 px-2">${r.leader_alliance ? `[${esc(r.leader_alliance)}] ` : ''}${esc(r.leader_name || '–')}</td><td class="py-1 px-2 text-slate-400">${kbHeroes(r.my_hero1, r.my_hero2)}</td><td class="${td}">${fmt(r.members)}</td>
          <td class="py-1 px-2 text-slate-400">${r.is_pvp ? '' : '🪓 '}${esc(r.enemy_alliances || r.enemy_names || '–')}</td><td class="${td} text-gold-300">${short(r.group_kill_points)}</td><td class="${td} text-emerald-300">${short(r.group_severe)}</td></tr>`).join('')}</tbody></table></div>
        ${ral.length > 100 ? '<div class="mt-2 text-[11px] text-slate-500">Nur die letzten 100.</div>' : ''}` : '<div class="text-sm text-slate-500">Keine Gruppenkämpfe in diesem Filter.</div>'}</section>`;
    return isLoot ? lootBox : (pve ? '' : rallyBox);   // Loot-Seite: Belohnungen · PvP: Gruppenkämpfe
  }
  // Trade = Gegner-Verluste (Tote + schwer verwundet) pro eigene Verluste
  function kbTrade(a) { const own = a.sDead + a.sSev, en = a.eDead + a.eSev; return own > 0 ? en / own : (en > 0 ? Infinity : null); }
  function kbRatioTxt(v) { return v == null ? '–' : v === Infinity ? '∞' : dec(v, v < 10 ? 2 : 0); }
  // Sortierbare Tabelle: cols = [{k, l, v(row), f(row), left, c}]
  function kbTable(tab, cols, rows, defSort, limit) {
    const st = kbSt(), so = (st.sort = st.sort || {})[tab] || defSort, col = cols.find(c => c.k === so.k) || cols.find(c => c.k === defSort.k);
    const val = (r) => { const v = col.v(r); return v === Infinity ? 1e18 : v == null ? -1e18 : v; };
    const sorted = rows.slice().sort((a, b) => { const x = val(a), y = val(b); const r = typeof x === 'string' ? String(x).localeCompare(String(y)) : x - y; return so.dir === 'asc' ? r : -r; });
    const shown = limit ? sorted.slice(0, limit) : sorted;
    const th = (c) => `<th class="py-2 px-2 font-medium ${c.left ? 'text-left' : 'text-right'} whitespace-nowrap"><button type="button" data-kbsort="${tab}|${c.k}" class="hover:text-gold-300 ${c.k === col.k ? 'text-gold-300' : ''}">${c.l}${c.k === col.k ? `<span> ${so.dir === 'asc' ? '▲' : '▼'}</span>` : ''}</button></th>`;
    return { n: sorted.length, html: `<div class="overflow-x-auto rounded-lg border border-ink-700"><table class="w-full text-xs"><thead class="text-[10px] uppercase tracking-wider text-slate-400"><tr class="border-b border-ink-700">${cols.map(th).join('')}</tr></thead>
      <tbody>${shown.map(r => `<tr class="border-b border-ink-800/60 hover:bg-ink-800/40">${cols.map(c => `<td class="py-1.5 px-2 ${c.left ? 'text-left' : 'text-right tabular-nums'} whitespace-nowrap ${c.c || ''}">${c.f ? c.f(r) : esc(c.v(r))}</td>`).join('')}</tr>`).join('') || `<tr><td colspan="${cols.length}" class="py-6 text-center text-slate-500">Keine Kämpfe in diesem Filter.</td></tr>`}</tbody></table></div>` };
  }
  // Kennzahlen-Karten (oben, an-/abwählbar → Diagramme)
  var KB_METRICS = [
    { k: 'kp', l: 'Kill Points', icon: '🏆', c: '#f5c542', v: a => a.kp },
    { k: 'eLoss', l: 'Gegner T + SV', icon: '🎯', c: '#34d399', v: a => a.eDead + a.eSev },
    { k: 'sDead', l: 'Eigene Tote', icon: '💀', c: '#f87171', v: a => a.sDead },
    { k: 'sSev', l: 'Eigene schwer verwundet', icon: '🩸', c: '#fb923c', v: a => a.sSev },
    { k: 'sWound', l: 'Eigene verwundet', icon: '🩹', c: '#94a3b8', v: a => a.sWound },
    { k: 'sHeal', l: 'Heilung', icon: '💚', c: '#38bdf8', v: a => a.sHeal }];
  var kbCharts = [];
  function kbSecs(rows) {   // Kampfdauer: jede Mail nur einmal zählen
    const m = new Map(); rows.forEach(r => { if (m.has(r.mail_id)) return; const s = Date.parse(r.battle_start || 0), e = Date.parse(r.battle_end || 0); m.set(r.mail_id, s && e && e >= s ? (e - s) / 1000 : 0); });
    let t = 0; m.forEach(v => t += v); return t;
  }
  function kbDur(sec) { if (!(sec > 0)) return '–'; if (sec < 60) return dec(sec, sec < 10 ? 1 : 0) + ' s'; const m = Math.floor(sec / 60), s = Math.round(sec % 60); return m < 60 ? `${m} min ${s} s` : `${Math.floor(m / 60)} h ${m % 60} min`; }
  function kbRange(rows) {   // Tage im Filter (für "/ Tag" und die Diagramm-Achse)
    const st = kbSt(), today = new Date(); today.setHours(0, 0, 0, 0);
    const ts = rows.map(r => Date.parse(r.battle_start || 0)).filter(Boolean);
    let from, to = today;
    if (st.days === 'custom') { from = st.from ? new Date(st.from + 'T00:00:00') : (ts.length ? new Date(Math.min(...ts)) : today); if (st.to) to = new Date(st.to + 'T00:00:00'); }
    else if (+st.days > 0) from = new Date(today.getTime() - (st.days - 1) * 86400000);
    else from = ts.length ? new Date(Math.min(...ts)) : today;
    from = new Date(from); from.setHours(0, 0, 0, 0);
    const n = Math.max(1, Math.round((to - from) / 86400000) + 1);
    return { from, n };
  }
  function kbSubTabs() { const page = kbSt().page || 'battles'; return `<div class="grid grid-cols-3 sm:grid-cols-5 gap-3 max-w-4xl mx-auto mt-2" role="tablist">${[['battles', '⚔️', 'Battles', '#f43f5e'], ['heat', '🔥', 'Heatmap', '#fb923c'], ['ana', '📊', 'Analyse', '#a78bfa'], ['loot', '🎁', 'Loot', '#f5c542'], ['res', '🌾', 'Ressourcen', '#34d399']].map(([k, i, l, c]) =>
        `<button type="button" class="hub-tile panel !min-h-[6.5rem] sm:!min-h-[8rem]" data-kbpage="${k}" role="tab" aria-pressed="${page === k}"><span class="w-11 h-11 sm:w-14 sm:h-14 rounded-2xl grid place-items-center text-2xl sm:text-3xl" style="background:linear-gradient(135deg,${c}33,${c}11);border:1px solid ${c}55">${i}</span><span class="font-display text-sm sm:text-lg text-white tracking-wide">${l}</span></button>`).join('')}</div>`; }
  function kbAccBar() {   // alle Accounts in einer Reihe – gilt für Battles, Heatmap, Analyse, Loot und Ressourcen
    const st = kbSt(), pidP = kbProfileId(), ids = [...kbMyIds()], cur = String(st.acc || ''); if (!kbSiteNames) kbLoadSiteNames();
    const seen = (st.idAuto = st.idAuto || {}); kbCache.forEach((rows, id) => { if (rows[0]?.self_name) seen[id] = rows[0].self_name; });
    const names = new Map(Object.entries(seen)), loaded = (id) => kbCache.has(id);
    const farms = st.page === 'res' && rsRows ? [...new Map(rsRows.filter(r => r.pid != null && !ids.includes(String(r.pid))).map(r => [String(r.pid), rsNameOf(r.pid, r.acc)])).entries()] : [];
    const chip = (id, icon, label, extra) => { const on = cur === id; return `<span class="inline-flex items-center rounded-xl border transition ${on ? 'border-gold-400 bg-gold-500/20 text-gold-100 shadow-[0_0_12px_rgba(245,197,66,.25)]' : 'border-ink-600 bg-ink-950/60 text-slate-300 hover:border-gold-500/60'}" translate="no">
      <button type="button" data-kbaccbar="${esc(id)}" class="px-3 py-1.5 text-sm font-semibold whitespace-nowrap">${icon} ${label}${id ? ` <span class="text-[10px] tabular-nums ${on ? 'text-gold-300/80' : 'text-slate-500'}">${esc(id)}</span>${loaded(id) ? '' : ' <span class="text-[10px] text-slate-600" title="Noch nicht geladen">•</span>'}` : ''}</button>${extra || ''}</span>`; };
    const own = ids.map(id => { const n = kbIdName(id, names), me = id === pidP;
      return chip(id, me ? '👤' : '🔗', n ? esc(n) : '<span class="text-slate-500">?</span>', (kbSiteNames?.get(id) ? '' : `<button type="button" data-hmidname="${esc(id)}" class="pr-1 text-slate-500 hover:text-gold-300" title="Namen eintragen">✏️</button>`) + (me ? '' : `<button type="button" data-kbunlink="${esc(id)}" class="pr-2 text-slate-500 hover:text-red-300" title="Verknüpfung lösen">✕</button>`)); }).join('');
    return `<div class="max-w-6xl mx-auto mt-3 mb-1 flex flex-wrap items-center justify-center gap-2">
      ${ids.length > 1 || farms.length ? chip('', '🌍', '<span>Alle</span>') : ''}${own}
      ${farms.length ? `<span class="w-px h-7 bg-ink-700 mx-1"></span><span class="text-xs text-slate-500">🌾 <span>Farmen</span></span>${farms.map(([id, l]) => chip(id, '🌾', esc(l))).join('')}` : ''}
      <input data-kblinkid inputmode="numeric" placeholder="+ ID" maxlength="12" class="bg-ink-950 border border-ink-600 rounded-xl px-2.5 py-1.5 text-xs w-24 text-slate-100 focus:outline-none focus:border-gold-500">
      <a href="/uploader.html" class="inline-flex items-center gap-1.5 rounded-xl border border-gold-500/60 bg-gold-500/10 text-gold-200 hover:bg-gold-500/20 px-3 py-1.5 text-sm font-semibold whitespace-nowrap">📲 <span>App &amp; Overlay</span></a>
      ${ids.length ? '' : '<span class="text-[11px] text-amber-300">Keine Governor-ID im Profil – es werden alle hochgeladenen Accounts gezeigt.</span>'}</div>`;
  }
  function renderKampf() {
    const el = $('battlesView'); if (!el) return; const st0 = kbSt(); kbBuffStart();
    const wip = `<div class="text-center"><span class="inline-flex items-center gap-2 rounded-full border border-amber-500/50 bg-amber-500/10 px-4 py-1.5 font-display text-sm sm:text-base tracking-widest uppercase text-amber-300">🚧 <span>In Work</span> 🚧</span></div>`;
    if (!st0.accV2 && kbProfileId()) { st0.accV2 = 1; st0.acc = kbProfileId(); }   // Standard: dein Profil-Account
    if ((st0.page || 'battles') !== 'res' && !kbApply()) { kbRows = null; kbCurKey = null; if (!kbLoading) loadBattles(); }
    else if ((st0.page || 'battles') !== 'res' && kbRows && !kbLoading && !kbFreshing && Date.now() - kbFreshT > 90e3) kbLoadNew().then(n => { if (n && R.view === 'battles') renderKampf(); });   // gemerkte Accounts: neue Kämpfe alle 90 s nachladen
    kbCharts.forEach(c => { try { c.destroy(); } catch {} }); kbCharts = [];
    const st = kbSt(); let tab = st.tab || 'march'; let cards = (st.cards = st.cards || { kp: true, eLoss: true, sDead: true, sSev: true });
    const segBtn = (attr, k, l, on, cls) => `<button type="button" ${attr}="${k}" aria-pressed="${on}" class="seg-btn rounded-lg ${cls || 'px-2 py-1'} text-xs font-semibold transition">${l}</button>`;
    const inp = 'bg-ink-950 border border-ink-600 rounded-lg px-2 py-1 text-xs focus:outline-none focus:border-gold-500';
    const head = (txt) => `<section id="kampfBox" class="panel rounded-2xl p-5"><h2 class="font-display text-lg text-gold-300">${(kbSt().page || 'battles') === 'loot' ? '🎁 Loot' : '⚔️ Battles'}</h2>
      <p class="text-xs text-slate-400 mb-3">Deine Kampfberichte aus dem Mailcache des Spiels – der Uploader auf deinem PC lädt sie automatisch hoch. Nur Berichte, die noch im Postfach sind, kommen an.</p>${txt}`;
    let msg = '';
    if (kbLoading && !kbRows && (st.page || 'battles') !== 'res') { el.innerHTML = wip + kbSubTabs() + kbAccBar() + `<section class="panel rounded-2xl p-5">${kbLoaderHtml()}</section>`; kbBind(el); return; }
    if (msg) { el.innerHTML = wip + head(msg + (!kbLoading ? '<button type="button" id="kbReload" class="mt-2 px-3 py-1 rounded-lg border border-ink-600 hover:border-gold-500/60 text-xs">↻ Neu laden</button>' : '')) + '</section>'; kbBind(el); return; }

    // Ohne Daten sieht die Seite genauso aus – nur leer (für Spieler ohne Uploader)
    if (!kbRows) kbRows = [];
    const note = kbErr && kbErr !== 'missing' ? `<div class="mb-3 text-[11px] text-red-400">Laden hat nicht geklappt: ${esc(kbErr)}</div>`
      : !kbRows.length ? '<div class="mb-3 text-[11px] text-slate-500">Noch keine Kampfberichte – sie kommen automatisch, sobald der Kampf-Uploader auf dem PC läuft.</div>' : '';
    const accs = [...new Map(kbRows.filter(r => r.player_id != null && kbMine(r.player_id)).map(r => [String(r.player_id), `${r.self_name || 'Spieler'}${r.account ? ` (${r.account})` : ''}`])).entries()];
    const accsRes = [...new Map([...accs, ...(rsRows || []).filter(r => r.pid != null).map(r => [String(r.pid), rsNameOf(r.pid, r.acc)])]).entries()];   // + Farmen (nur Ressourcen)
    if (st.acc && kbMyIds().size && !kbMyIds().has(String(st.acc)) && rsRows && !rsRows.some(r => String(r.pid) === String(st.acc))) st.acc = '';
    st.type = (st.page || 'battles') === 'loot' ? 'pve' : 'pvp';   // Battles = PvP · Loot = kompletter PvE-Bereich
    const pvp = st.type === 'pvp';
    if (!pvp) cards = { ...cards, kp: false };   // PvE bringt keine Kill Points
    const allMarches = [...new Set(kbFiltered(true).map(kbMarchOf))].sort();
    if (st.march && !allMarches.includes(st.march)) st.march = '';
    const rows = kbFiltered(), A = kbAgg(rows), R0 = kbRange(rows);
    // Große Auswahl PvP / PvE
    if (!kxLoot && !kxLoading) loadKampfExtra();
    const rallyPvp = kxRallyRows(true), rallyPve = kxRallyRows(false).filter(r => kbCatOf(r.npc_btype, r.group_size) !== 'skip');
    const nPvp = new Set(kbRows.filter(r => kbIsPvp(r) && kbMine(r.player_id)).map(r => r.mail_id).concat(rallyPvp.map(r => r.mail_id))).size, nPve = new Set(kbRows.filter(r => !r.is_pvp && kbCatOf(r.npc_btype, r.group_size) !== 'skip').map(r => r.mail_id)).size;
    const bigBtn = (k, icon, l, sub, n) => `<button type="button" data-kbtype="${k}" aria-pressed="${st.type === k}" class="seg-btn rounded-xl px-5 py-4 text-left transition">
        <div class="flex items-center gap-3"><span class="text-3xl leading-none">${icon}</span><span><span class="block font-display text-xl tracking-wide">${l}</span><span class="block text-[11px] opacity-80">${sub}</span></span><span class="ml-auto text-sm tabular-nums opacity-80">${fmt(n)}</span></div></button>`;
    const typeSel = `<div class="grid grid-cols-2 gap-2 p-1.5 rounded-2xl bg-ink-950 border border-ink-700 mb-3">
        ${bigBtn('pvp', '⚔️', 'PvP', 'Kämpfe gegen Spieler mit Kill Points', nPvp)}${bigBtn('pve', '🪓', 'PvE', 'Barbaren, Forts, Baulurs, Raid-Boss und Belohnungen', nPve)}</div>`;
    // PvE: Kategorie-Auswahl
    const pveAll = kbRows.filter(r => !r.is_pvp && kbMine(r.player_id) && (!st.acc || String(r.player_id) === st.acc) && kxInRange(r.battle_start)).concat(rallyPve);
    const catN = (c) => kbTargets(pveAll, c);
    const catSel = pvp ? '' : `<div class="flex flex-wrap gap-1 p-1 rounded-xl bg-ink-950 border border-ink-700 mb-3">${segBtn('data-kbcat', '', 'Alle', !st.cat, 'px-3 py-1.5')}${KB_CATS.map(([k, l]) => segBtn('data-kbcat', k, `${l} <span class="opacity-60 tabular-nums">${fmt(catN(k))}</span>`, st.cat === k, 'px-3 py-1.5')).join('')}</div>`;
    const marchSel = `<select data-kbmarch class="${inp} min-w-[11rem]"><option value="">Alle Märsche</option>${allMarches.map(m => `<option value="${esc(m)}" ${st.march === m ? 'selected' : ''}>${esc(m)}</option>`).join('')}</select>`;
    const enemyChip = pvp && st.enemy ? `<button type="button" data-kbenemy="" class="px-2 py-1 rounded-lg bg-red-500/15 border border-red-500/40 text-xs text-red-200">🎯 ${esc(st.enemy)} ✕</button>` : '';
    const timeRow = (lead, list) => `<div class="flex flex-wrap items-center gap-2 mb-2">${lead}
        <div class="flex flex-wrap gap-1 p-1 rounded-xl bg-ink-950 border border-ink-700">${[[1, '24 h'], [7, '7 Tage'], [30, '30 Tage'], [90, '90 Tage'], [0, 'Alles'], ['custom', 'Zeitraum']].map(([k, l]) => segBtn('data-kbdays', k, l, String(st.days) === String(k))).join('')}</div>
        ${(st.kvks || []).map((k, i) => { const on = st.days === 'custom' && st.from === k.from && st.to === k.to;
          return `<span class="inline-flex items-center rounded-lg border ${on ? 'border-gold-500/70 bg-gold-500/15 text-gold-200' : 'border-ink-600 text-slate-300'} text-xs"><button type="button" data-kbkvk="${i}" class="pl-2 pr-1 py-1" title="${esc(k.from)} – ${esc(k.to)}">🏁 ${esc(k.n)}</button><button type="button" data-kbkvkdel="${i}" class="px-1.5 py-1 text-slate-500 hover:text-red-300" title="Zeitraum löschen">✕</button></span>`; }).join('')}
        ${st.days === 'custom' ? `<input type="date" data-kbdate="from" value="${esc(st.from)}" class="${inp}"><span class="text-xs text-slate-500">bis</span><input type="date" data-kbdate="to" value="${esc(st.to)}" class="${inp}">
          ${st.from && st.to && !(st.kvks || []).some(k => k.from === st.from && k.to === st.to) ? `<input type="text" data-kbkvkname placeholder="z. B. KvK 3" maxlength="24" class="${inp} w-28"><button type="button" data-kbkvksave class="px-2 py-1 rounded-lg border border-gold-500/50 text-xs text-gold-200 hover:bg-gold-500/10">🏁 Als KvK speichern</button>` : ''}` : ''}
        <button type="button" id="kbReload" class="ml-auto px-3 py-1 rounded-lg border border-ink-600 hover:border-gold-500/60 text-xs">${kbLoading ? 'Lädt …' : '↻ Neu laden'}</button>
      </div>`;
    const nAoo = pvp ? new Set((kbRows || []).filter(r => kbIsPvp(r) && kbMine(r.player_id) && kbIsAoo(r)).map(r => r.mail_id)).size : 0;
    const modeSel = pvp ? `<div class="flex items-center gap-1 p-1 rounded-xl bg-ink-950 border border-ink-700">${[['', '🌍 Alle'], ['field', '🗺️ Königreich / KvK'], ['aoo', '🏛️ Ark of Osiris']].map(([k, l]) => `<button type="button" data-kbpvpmode="${k}" aria-pressed="${(st.pvpMode || '') === k}" class="seg-btn rounded-lg px-2.5 py-1 text-xs font-semibold transition">${l}${k === 'aoo' ? ` <span class="text-slate-500">${fmt(nAoo)}</span>` : ''}</button>`).join('')}</div>` : '';
    const filters = catSel + timeRow(modeSel + marchSel + enemyChip);
    // Unterseiten: Battles · Loot · Ressourcen
    const page = st.page || 'battles';
    const subTabs = kbSubTabs() + kbAccBar();
    const pageHead = (icon, t, sub) => `<section class="panel rounded-2xl p-5"><h2 class="font-display text-lg text-gold-300">${icon} ${t}</h2><p class="text-xs text-slate-400 mb-3">${sub}</p>`;
    if (page === 'res') {
      if (!rsRows && !rsLoading) loadRes();
      el.innerHTML = wip + subTabs + rsHtml(timeRow('', accsRes));
      kbBind(el); rsDraw(); return;
    }
    if (page === 'ana') {
      if (!kxLoot && !kxLoading) loadKampfExtra();
      el.innerHTML = wip + subTabs + anaHtml(st, timeRow('', accsRes));
      kbBind(el); el.querySelectorAll('[data-anatab]').forEach(b => b.onclick = () => { st.anaTab = b.dataset.anatab; savePassive(); renderKampf(); });
      el.querySelectorAll('[data-anatier]').forEach(b => b.onclick = () => { st.anaTier = b.dataset.anatier; savePassive(); renderKampf(); });
      el.querySelectorAll('[data-anakd]').forEach(b => b.onclick = () => { const k = +b.dataset.anakd; st.anaKd = st.anaKd != null && +st.anaKd === k ? null : k; savePassive(); renderKampf(); }); return;
    }
    if (page === 'heat') {
      const accSel = accs.length > 1 ? `<select data-kbacc class="${inp}"><option value="">Alle Accounts</option>${accs.map(([k, l]) => `<option value="${esc(k)}" ${st.acc === k ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>` : '';
      el.innerHTML = wip + subTabs + hmHtml(st, `<button type="button" id="kbReload" class="ml-auto px-3 py-1 rounded-lg border border-ink-600 hover:border-gold-500/60 text-xs">${kbLoading ? 'Lädt …' : '↻ Neu laden'}</button>`);
      kbBind(el); hmBind(el, st); hmDraw(st); return;
    }
    const last = kbRows[0]?.battle_start ? new Date(kbRows[0].battle_start) : null;
    const nJoin = new Set((pvp ? rallyPvp : rallyPve).map(r => r.mail_id)).size;
    const pidP = kbProfileId(), links = (st.linkIds || []).map(String), names = new Map(kbRows.map(r => [String(r.player_id), r.self_name]));
    const idChip = (id, own) => `<span class="inline-flex items-center gap-1 rounded-lg border ${own ? 'border-gold-500/60 bg-gold-500/10 text-gold-200' : 'border-ink-600 text-slate-300'} px-2 py-0.5" translate="no">${own ? '👤' : '🔗'} ${esc(kbIdName(id, names))} <span class="tabular-nums text-slate-400">${esc(id)}</span>${own ? ' <span class="text-[10px] text-slate-500">Profil</span>' : `<button type="button" data-kbunlink="${esc(id)}" class="text-slate-500 hover:text-red-300" title="Verknüpfung lösen">✕</button>`}</span>`;
    const idBar = `<div class="flex flex-wrap items-center gap-1.5 mb-2 text-[11px]"><span class="text-slate-500">🆔 <span>Angezeigt für</span>:</span>
        ${pidP ? idChip(pidP, true) : '<span class="text-amber-300">Keine Governor-ID im Profil – es werden alle hochgeladenen Accounts gezeigt.</span>'}${links.filter(x => x !== pidP).map(x => idChip(x, false)).join('')}
        <input data-kblinkid inputmode="numeric" placeholder="+ ID verknüpfen" maxlength="12" class="bg-ink-950 border border-ink-600 rounded-lg px-2 py-0.5 text-[11px] w-32 text-slate-100 focus:outline-none focus:border-gold-500">
        <a href="/uploader.html" class="ml-auto inline-flex items-center gap-1 rounded-lg border border-gold-500/60 bg-gold-500/10 text-gold-200 hover:bg-gold-500/20 px-2 py-0.5">📲 <span>App &amp; Overlay</span></a></div>`;
    const info = note + `<div class="text-[11px] text-slate-500 mb-4">${nJoin ? `<span class="text-sky-300">🛡️ ${fmt(nJoin)}</span> <span>${pvp ? 'Rally-/Garnisonskämpfe als Teilnehmer (unten)' : 'Rallys als Teilnehmer mitgezählt'}</span> · ` : ''}${fmt(kbRows.length)} Berichte geladen${last ? ` · letzter Kampf ${last.toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' })}` : ''} · im Filter: ${fmt(rows.length)}</div>`;
    // 1) Karten
    const cardHtml = KB_METRICS.filter(m => pvp || m.k !== 'kp').map(m => { const v = m.v(A), on = !!cards[m.k];
      return `<button type="button" data-kbcard="${m.k}" aria-pressed="${on}" class="text-left rounded-xl border p-3 transition ${on ? 'border-ink-600 bg-ink-950/70' : 'border-ink-800 bg-ink-950/30 opacity-50'} hover:border-gold-500/50">
        <div class="flex items-start justify-between"><span class="text-xl leading-none">${m.icon}</span><span class="w-5 h-5 rounded-full grid place-items-center text-[11px] ${on ? 'bg-white text-ink-950' : 'border border-ink-600'}">${on ? '✓' : ''}</span></div>
        <div class="mt-2 flex items-center gap-1.5 text-[11px] text-slate-400"><span class="w-2 h-2 rounded-full" style="background:${m.c}"></span>${m.l}</div>
        <div class="font-display text-2xl tabular-nums text-white">${short(v)}</div>
        <div class="text-[10px] text-slate-500 tabular-nums">${short(v / R0.n)} / Tag</div></button>`; }).join('');
    // 0) Obere Leiste: Kill Points · Verwundete · Trade % (Kills ÷ Heilung im Lazarett)
    const khKills = A.eDead + A.eSev, khHeal = A.sSev, khTr = khHeal > 0 ? khKills / khHeal : (khKills > 0 ? Infinity : null);
    const khTile = (icon, l, v, sub, c) => `<div class="rounded-xl border border-ink-700 bg-ink-950/70 p-4"><div class="flex items-center gap-2 text-xs text-slate-400"><span class="text-lg leading-none">${icon}</span>${l}</div>
        <div class="font-display text-3xl tabular-nums ${c}">${v}</div><div class="text-[11px] text-slate-500">${sub}</div></div>`;
    const H = kbHealCost(rows, st.healType || 'mix');
    const rowsT = pvp ? rows : rows.concat(rallyPve.filter(r => !st.cat || kbCatOf(r.npc_btype, r.group_size) === st.cat));   // + Rallys, bei denen du dabei warst
    const cc = (c) => kbTargets(rowsT, c);
    const healTile = `<div class="rounded-xl border border-ink-700 bg-ink-950/70 p-4"><div class="flex items-center gap-2 text-xs text-slate-400"><span class="text-lg leading-none">💰</span>Heilkosten<span class="ml-auto px-1.5 py-0.5 rounded bg-ink-800 text-[10px] text-slate-300">${H.tier}</span></div>
        <div class="mt-1 grid grid-cols-2 gap-x-3 text-sm tabular-nums">${[['🌽', 'Nahrung', H.food], ['🪵', 'Holz', H.wood], ['🪨', 'Stein', H.stone], ['🪙', 'Gold', H.gold]].map(([i, l, v]) => `<div class="flex justify-between"><span class="text-slate-400">${i} <span>${l}</span></span><span class="text-white">${short(v)}</span></div>`).join('')}</div>
        <div class="mt-2 flex flex-wrap gap-1">${[['mix', 'Gemischt'], ['inf', 'Infanterie'], ['cav', 'Kavallerie'], ['arch', 'Bogen']].map(([k, l]) => segBtn('data-kbheal', k, l, (st.healType || 'mix') === k, 'px-1.5 py-0.5 !text-[10px]')).join('')}</div>
        <div class="mt-1 text-[10px] text-slate-500"><span>Schätzung ohne Boni für</span> ${short(khHeal)} <span>schwer Verwundete.</span> <span>Stufe aus der verlorenen Power erkannt, Truppenart steht nicht im Bericht.</span></div></div>`;
    const topBar = !pvp ? `<div class="grid grid-cols-1 sm:grid-cols-3 gap-2 mb-4">
        ${khTile('🪓', 'Besiegte Ziele', fmt(kbTargets(rowsT)), KB_CATS.filter(([k]) => cc(k)).map(([k, l]) => `<span style="color:${KB_CAT_COL[k]}">${l.split(' ')[0]} ${fmt(cc(k))}</span>`).join(' · ') || '–', 'text-emerald-300')}
        ${khTile('🩸', 'Verwundete', short(khHeal), `<span>schwer verwundet (Lazarett)</span> · ${short(A.sWound)} <span>leicht verwundet</span>`, 'text-orange-300')}
        ${healTile}
      </div>` : `<div class="grid grid-cols-1 sm:grid-cols-3 gap-2 mb-4">
        ${khTile('🏆', 'Kill Points', short(A.kp), fmt(A.kp), 'text-gold-300')}
        ${khTile('🩸', 'Verwundete', short(khHeal), `<span>schwer verwundet (Lazarett)</span> · ${short(A.sWound)} <span>leicht verwundet</span>`, 'text-orange-300')}
        ${khTile('⚖️', 'Trade %', khTr == null ? '–' : khTr === Infinity ? '∞' : dec(khTr * 100, 0) + ' %', `<span>Kills</span> ${short(khKills)} ÷ <span>Heal</span> ${short(khHeal)}`, khTr == null ? 'text-white' : khTr >= 1 ? 'text-emerald-300' : 'text-red-300')}
      </div>`;
    const cardsBox = !pvp ? '' : `<div class="text-[11px] text-slate-500 mb-2">Karten antippen, um sie im Diagramm ein- oder auszublenden. „/ Tag“ zählt jeden Tag im Zeitraum mit.</div><div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">${cardHtml}</div>`;
    // 1b) PvP: meistbekämpfte Gegner · PvE: Gegnerarten zuordnen
    let extraBox = '';
    if (pvp) {
      const keep = st.enemy; st.enemy = ''; const base = kbFiltered(); st.enemy = keep;
      const m = new Map(); base.forEach(r => { const k = kbEnemyOf(r); if (!k) return; if (!m.has(k)) m.set(k, []); m.get(k).push(r); });
      const all = [...m.entries()].map(([k, rs]) => { const a = kbAgg(rs); return { k, n: new Set(rs.map(r => r.mail_id)).size, ...a, t: kbTrade(a), net: (a.eDead + a.eSev) - (a.sDead + a.sSev), last: Math.max(0, ...rs.map(r => Date.parse(r.battle_start || 0) || 0)) }; }).filter(o => o.t != null);
      const tv = (o) => o.t === Infinity ? 1e9 : o.t;
      const sorted = all.slice().sort((a, b) => tv(b) - tv(a) || b.net - a.net), half = Math.min(6, Math.ceil(sorted.length / 2));
      const best = sorted.slice(0, half), worst = sorted.slice(half).reverse().slice(0, 6);   // keiner steht in beiden Spalten
      const card = (o, i, good) => `<button type="button" data-kbenemy="${esc(o.k)}" aria-pressed="${st.enemy === o.k}" class="w-full text-left rounded-xl border ${st.enemy === o.k ? 'border-gold-500/70 bg-gold-500/10' : 'border-ink-700 bg-ink-950/60'} hover:border-gold-500/50 p-3 transition">
            <div class="flex items-center gap-2"><span class="w-6 h-6 rounded-full grid place-items-center text-[11px] font-bold ${good ? 'bg-emerald-500/80' : 'bg-red-500/80'} text-ink-950">${i + 1}</span><span class="font-semibold text-slate-100 truncate" translate="no">${esc(o.k)}</span><span class="ml-auto font-display text-lg tabular-nums ${tv(o) >= 1 ? 'text-emerald-300' : 'text-red-300'}">${o.t === Infinity ? '∞' : dec(o.t * 100, 0) + ' %'}</span></div>
            <div class="mt-1.5 flex gap-3 text-[11px] tabular-nums text-slate-400"><span>${fmt(o.n)}×</span><span class="text-gold-300">${short(o.kp)} KP</span><span class="${o.net >= 0 ? 'text-emerald-300' : 'text-red-300'}">${o.net >= 0 ? '+' : '−'}${short(Math.abs(o.net))} <span>Truppen</span></span><span>${o.last ? new Date(o.last).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' }) : ''}</span></div></button>`;
      const col = (title, sub, list, good) => `<div><div class="text-sm font-semibold ${good ? 'text-emerald-300' : 'text-red-300'}">${title}</div><div class="text-[11px] text-slate-500 mb-2">${sub}</div>
          <div class="space-y-2">${list.length ? list.map((o, i) => card(o, i, good)).join('') : '<div class="rounded-xl border border-dashed border-ink-700 p-4 text-center text-xs text-slate-500">Noch keine Daten</div>'}</div></div>`;
      extraBox = `<section id="kbFoeBox" class="panel rounded-2xl p-5"><h2 class="font-display text-lg text-gold-300">🎯 Am häufigsten bekämpft</h2>
        <p class="text-xs text-slate-400 mb-3">Trade = Gegner (Tote + schwer verwundet) ÷ deine eigenen. „Truppen“ = was du mehr (+) oder weniger (−) ausgeteilt als eingesteckt hast. Antippen, um nur die Kämpfe gegen diesen Spieler zu sehen.</p>
        <div class="grid md:grid-cols-2 gap-4">${col('💚 Meister Gewinn', 'Bester Trade', best, true)}${col('💔 Meister Verlust', 'Schlechtester Trade', worst, false)}</div></section>`;
    }
    // 2) Verlauf (eigene Skala je Diagramm)
    const trend = `<section id="kbTrendBox" class="panel rounded-2xl p-5"><h2 class="font-display text-lg text-gold-300">Kampfverlauf</h2>
        <div class="flex flex-wrap items-center justify-between gap-2 mb-3"><div class="text-[11px] text-slate-500">Werte pro Tag. Jedes Diagramm hat seine eigene Skala.</div>
          <div class="flex gap-1 p-1 rounded-xl bg-ink-950 border border-ink-700">${segBtn('data-kbcum', '0', 'Pro Tag', !st.cum)}${segBtn('data-kbcum', '1', 'Kumuliert', !!st.cum)}</div></div>
        ${!pvp ? `<div class="rounded-xl border border-ink-700 p-3"><div class="text-xs font-semibold text-slate-200 mb-2">Besiegte Ziele pro Tag</div><div class="h-64"><canvas id="kbChartPve"></canvas></div></div>` : `<div class="grid gap-3 ${cards.kp ? 'lg:grid-cols-2' : ''}">
          ${cards.kp ? '<div class="rounded-xl border border-ink-700 p-3"><div class="text-xs font-semibold text-slate-200 mb-2">Kill Points</div><div class="h-56"><canvas id="kbChartKp"></canvas></div></div>' : ''}
          ${KB_METRICS.some(m => m.k !== 'kp' && cards[m.k]) ? '<div class="rounded-xl border border-ink-700 p-3"><div class="text-xs font-semibold text-slate-200 mb-2">Truppen</div><div class="h-56"><canvas id="kbChartTr"></canvas></div></div>' : ''}
          ${!KB_METRICS.some(m => cards[m.k]) ? '<div class="py-8 text-center text-xs text-slate-500">Oben mindestens eine Karte auswählen.</div>' : ''}
        </div>`}</section>`;
    // 3) Marsch-Analyse
    const marchOf = kbMarchOf, marches = allMarches;
    const mRows = rows, M = kbAgg(mRows), sec = kbSecs(mRows), tr = kbTrade(M);
    const ps = (v) => sec > 0 ? dec(v / sec, v / sec < 100 ? 2 : 0) + ' / s' : '–';
    const stat = (l, d, v, c) => `<div class="border-b border-ink-700 pb-3"><div class="text-sm font-semibold text-slate-100">${l}</div><div class="text-[11px] text-slate-500 min-h-[2rem]">${d}</div><div class="font-display text-2xl tabular-nums ${c || 'text-white'}">${v}</div></div>`;
    const analysis = `<section id="kbMarchBox" class="panel rounded-2xl p-5"><h2 class="font-display text-lg text-gold-300">Marsch-Analyse</h2>
        <div class="flex flex-wrap items-center gap-2 mb-4"><select data-kbmarch class="${inp} min-w-[12rem]"><option value="">Alle Märsche zusammen</option>${marches.map(m => `<option value="${esc(m)}" ${st.march === m ? 'selected' : ''}>${esc(m)}</option>`).join('')}</select>
          <span class="text-[11px] text-slate-500">Tipp: In der Tabelle „Märsche“ unten auf einen Marsch klicken.</span></div>
        <div class="grid sm:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-4">
          ${stat('Kampfberichte', 'Alle Berichte mit diesem Marsch im Filter.', fmt(M.battles))}
          ${stat('Kill Points', 'Gesammelte Kill Points mit diesem Marsch.', fmt(M.kp), 'text-gold-300')}
          ${stat('Trade', 'Gegner (Tote + schwer verwundet) geteilt durch deine eigenen. Über 100 % = besser getauscht.', tr == null ? '–' : tr === Infinity ? '∞' : dec(tr * 100, 0) + ' %', tr == null ? '' : tr >= 1 ? 'text-emerald-300' : 'text-red-300')}
          ${stat('Schwer verwundet zugefügt', 'Gegnerische Truppen, die dieser Marsch schwer verwundet hat.', fmt(M.eSev), 'text-emerald-300')}
          ${stat('Schwer verwundet erlitten', 'Eigene Truppen, die mit diesem Marsch schwer verwundet wurden.', fmt(M.sSev), 'text-red-300')}
          ${stat('Tote erlitten', 'Eigene Truppen, die gestorben sind.', fmt(M.sDead), 'text-red-300')}
          ${stat('Gegner getötet', 'Gegnerische Truppen, die dieser Marsch getötet hat.', fmt(M.eDead), 'text-emerald-300')}
          ${stat('Verwundet erlitten', 'Leicht verwundet – kommen von selbst zurück.', fmt(M.sWound))}
          ${stat('Ø Kampfdauer', 'Wie lange ein Kampf im Schnitt gedauert hat.', kbDur(M.battles ? sec / M.battles : 0))}
          ${stat('KP pro Toten', 'Kill Points pro eigenem Toten.', M.sDead > 0 ? dec(M.kp / M.sDead, 0) : '–')}
          ${stat('KP pro Sekunde', 'Kill Points pro Sekunde Kampfzeit.', ps(M.kp), 'text-gold-300')}
          ${stat('SV zugefügt pro Sekunde', 'Gegner schwer verwundet pro Sekunde Kampfzeit.', ps(M.eSev), 'text-emerald-300')}
          ${stat('SV erlitten pro Sekunde', 'Eigene schwer verwundet pro Sekunde Kampfzeit.', ps(M.sSev), 'text-red-300')}
          ${stat('Heilung pro Sekunde', 'Heilung pro Sekunde Kampfzeit.', ps(M.sHeal), 'text-sky-300')}
          ${stat('Power verloren', 'Deine verlorene Power – daneben die des Gegners.', short(M.sPow) + ' <span class="text-sm text-slate-500">/ ' + short(M.ePow) + '</span>')}
        </div></section>`;
    // 4) Tabellen
    const group = (keyFn) => { const m = new Map(); rows.forEach(r => { const k = keyFn(r); if (k == null) return; if (!m.has(k)) m.set(k, []); m.get(k).push(r); }); return [...m.entries()].map(([k, rs]) => ({ k, ...kbAgg(rs), sec: kbSecs(rs), last: rs.reduce((x, r) => Math.max(x, Date.parse(r.battle_start || 0) || 0), 0) })); };
    const red = 'text-red-300', grn = 'text-emerald-300', gold = 'text-gold-300', sky = 'text-sky-300';
    const tradeCol = { k: 'trade', l: 'Trade', v: kbTrade, f: (a) => { const t = kbTrade(a); return `<span class="${t == null ? '' : t >= 1 ? grn : red} font-semibold">${t == null ? '–' : t === Infinity ? '∞' : dec(t * 100, 0) + ' %'}</span>`; } };
    const kpdCol = { k: 'kpd', l: 'KP / Toter', v: (a) => a.sDead > 0 ? a.kp / a.sDead : (a.kp > 0 ? Infinity : null), f: (a) => kbRatioTxt(a.sDead > 0 ? a.kp / a.sDead : (a.kp > 0 ? Infinity : null)) };
    const lossCols = [
      { k: 'sDead', l: 'Tote', v: a => a.sDead, f: a => short(a.sDead), c: red }, { k: 'sSev', l: 'Schwer verw.', v: a => a.sSev, f: a => short(a.sSev), c: red },
      { k: 'sWound', l: 'Verwundet', v: a => a.sWound, f: a => short(a.sWound) }, { k: 'sHeal', l: 'Heilung', v: a => a.sHeal, f: a => short(a.sHeal), c: sky },
      { k: 'eDead', l: 'Geg. Tote', v: a => a.eDead, f: a => short(a.eDead), c: grn }, { k: 'eSev', l: 'Geg. SV', v: a => a.eSev, f: a => short(a.eSev), c: grn }];
    const lim = kbShow; let T, hint = '';
    if (!pvp) tab = 'list';
    if (tab === 'march') {
      T = kbTable('march', [{ k: 'k', l: 'Marsch', v: a => a.k, left: true, f: a => `<button type="button" data-kbpick="${esc(a.k)}" class="text-left text-slate-200 hover:text-gold-300 underline decoration-dotted underline-offset-2">${esc(a.k)}</button>` },
        { k: 'battles', l: 'Kämpfe', v: a => a.battles, f: a => fmt(a.battles) },
        { k: 'last', l: 'Zuletzt', v: a => a.last, f: a => a.last ? new Date(a.last).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: '2-digit' }) : '–' },
        { k: 'kp', l: 'Kill Points', v: a => a.kp, f: a => short(a.kp), c: gold }, { k: 'avg', l: 'Ø KP', v: a => a.battles ? a.kp / a.battles : 0, f: a => a.battles ? short(a.kp / a.battles) : '–' },
        tradeCol, kpdCol, { k: 'dur', l: 'Ø Dauer', v: a => a.battles ? a.sec / a.battles : 0, f: a => kbDur(a.battles ? a.sec / a.battles : 0) }, ...lossCols], group(marchOf), { k: 'kp', dir: 'desc' });
      hint = 'Ein Marsch = dein Kommandanten-Paar. Auf den Namen klicken → Marsch-Analyse oben.';
    } else if (tab === 'day') {
      T = kbTable('day', [{ k: 'k', l: 'Tag', v: a => a.k, left: true, f: a => new Date(a.k + 'T12:00:00').toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit', year: '2-digit' }) },
        { k: 'battles', l: 'Kämpfe', v: a => a.battles, f: a => fmt(a.battles) }, { k: 'kp', l: 'Kill Points', v: a => a.kp, f: a => short(a.kp), c: gold },
        tradeCol, kpdCol, ...lossCols], group(r => r.battle_start ? isoDay(new Date(r.battle_start)) : null), { k: 'k', dir: 'desc' }, lim);
    } else if (tab === 'enemy') {
      T = kbTable('enemy', [{ k: 'k', l: 'Gegner', v: a => a.k, left: true, c: 'text-slate-200' }, { k: 'rows', l: 'Kämpfe', v: a => a.rows, f: a => fmt(a.rows) },
        { k: 'last', l: 'Zuletzt', v: a => a.last, f: a => a.last ? new Date(a.last).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: '2-digit' }) : '–' },
        { k: 'kp', l: 'Kill Points', v: a => a.kp, f: a => short(a.kp), c: gold }, tradeCol, ...lossCols], group(r => pvp ? kbEnemyOf(r) : `${kbCatLabel(kbCatOf(r.npc_btype, r.group_size))}${r.npc_level ? ' Lv ' + r.npc_level : ''}`), { k: 'rows', dir: 'desc' }, lim);
      hint = pvp ? '' : 'Gegner nach Art und Level.';
    } else {
      const one = rows.map(r => ({ ...r, ...kbAgg([r]), t: Date.parse(r.battle_start || 0) || 0, march: marchOf(r), sec: kbSecs([r]) }));
      T = kbTable('list', [{ k: 't', l: 'Datum', v: a => a.t, left: true, f: a => a.t ? new Date(a.t).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' }) : '–' },
        pvp ? null : { k: 'cat', l: 'Art', v: a => kbCatOf(a.npc_btype, a.group_size), left: true, f: a => { const c = kbCatOf(a.npc_btype, a.group_size); return `<span class="px-1.5 py-0.5 rounded text-[10px] font-semibold" style="background:${KB_CAT_COL[c]}33;color:${KB_CAT_COL[c]}">${kbCatLabel(c)}</span>`; } },
        pvp ? null : { k: 'lvl', l: 'Level', v: a => +a.npc_level || 0, f: a => a.npc_level ? fmt(a.npc_level) : '–' },
        { k: 'march', l: 'Marsch', v: a => a.march, left: true, c: 'text-slate-200' },
        !pvp ? null : { k: 'enemy', l: 'Gegner', v: a => (a.enemy_alliance ? `[${a.enemy_alliance}] ` : '') + (a.enemy_name || ''), left: true, f: a => `${a.enemy_alliance ? `[${esc(a.enemy_alliance)}] ` : ''}${esc(a.enemy_name || '–')}` },
        pvp ? { k: 'kp', l: 'Kill Points', v: a => a.kp, f: a => a.kp ? fmt(a.kp) : '–', c: gold } : null, { k: 'dur', l: 'Dauer', v: a => a.sec, f: a => kbDur(a.sec) }, { k: 'troops', l: 'Truppen', v: a => a.sTroops, f: a => short(a.sTroops) },
        pvp ? tradeCol : null, ...lossCols,
        pvp ? { k: 'det', l: '🔍', v: a => a.t, f: a => `<button type="button" data-kbdetail="${esc(a.mail_id)}|${esc(a.opponent_id)}" title="Details: Ausrüstung, Skills, Rüstung" class="px-2 py-0.5 rounded-lg border border-gold-500/40 text-gold-200 hover:bg-gold-500/10">Details</button>` } : null].filter(Boolean), one, { k: 't', dir: 'desc' }, lim);
      hint = pvp ? 'Auf „Details“ klicken → Ausrüstung, Skills und Rüstung von dir und dem Gegner.' : hint;
    }
    const tabs = !pvp ? '<h2 class="font-display text-lg text-gold-300 mb-2">📜 Alle Kämpfe</h2>' : `<div class="grid grid-cols-2 sm:grid-cols-4 gap-1 p-1 rounded-xl bg-ink-950 border border-ink-700 mb-3 max-w-2xl">${[['march', '🛡️ Märsche'], ['day', '📅 Pro Tag'], ['enemy', pvp ? '🎯 Gegner' : '🪓 Ziele'], ['list', '📜 Alle Kämpfe']].map(([k, l]) => segBtn('data-kbtab', k, l, tab === k, 'py-1.5')).join('')}</div>`;
    const more = lim && T.n > lim && tab !== 'march' ? `<button type="button" id="kbMore" class="mt-3 px-3 py-1.5 rounded-lg border border-ink-600 hover:border-gold-500/60 text-xs">Mehr anzeigen (${fmt(T.n - lim)} weitere)</button>` : '';
    el.innerHTML = wip + subTabs + head(filters + info + topBar + cardsBox) + `</section>${extraBox}${pvp ? '' : kxSections('loot')}${trend}${pvp ? analysis + kxSections() : ''}
      <section id="kbTabBox" class="panel rounded-2xl p-5">${tabs}<div class="text-[11px] text-slate-500 mb-2">Zum Sortieren auf eine Spalte klicken.${hint ? ' ' + hint : ''}</div>${T.html}${more}</section>`;
    makeFold($('kbTrendBox'), 'kbtrend'); ['kbFoeBox', 'kbNpcBox'].forEach(id => $(id) && makeFold($(id), id)); makeFold($('kbMarchBox'), 'kbmarch'); ['kxLootBox', 'kxRallyBox'].forEach(id => $(id) && makeFold($(id), id));
    kbDrawCharts(pvp ? rows : rowsT, R0, cards, !!st.cum, pvp);
    kbBind(el);
  }
  function kbDrawCharts(rows, R0, cards, cum, pvp) {
    if (!window.Chart) return;
    if (pvp === false) return kbDrawPve(rows, R0, cum);
    const n = Math.min(R0.n, 400), from = new Date(R0.from.getTime() + (R0.n - n) * 86400000);
    const keys = [], labels = [];
    for (let i = 0; i < n; i++) { const d = new Date(from.getTime() + i * 86400000); keys.push(isoDay(d)); labels.push(d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' })); }
    const byDay = new Map(keys.map(k => [k, []])); rows.forEach(r => { if (!r.battle_start) return; const k = isoDay(new Date(r.battle_start)); byDay.get(k)?.push(r); });
    const ag = keys.map(k => kbAgg(byDay.get(k)));
    const series = (m) => { let s = 0; return ag.map(a => cum ? (s += m.v(a)) : m.v(a)); };
    const mk = (id, ms) => { const c = $(id); if (!c || !ms.length) return;
      kbCharts.push(new Chart(c, { type: cum ? 'line' : 'bar',
        data: { labels, datasets: ms.map(m => ({ label: m.l, data: series(m), backgroundColor: m.c + (cum ? '22' : 'cc'), borderColor: m.c, borderWidth: cum ? 2 : 0, borderRadius: 3, pointRadius: 0, pointHoverRadius: 4, tension: .25, fill: false, maxBarThickness: 18 })) },
        options: { responsive: true, maintainAspectRatio: false, interaction: { mode: 'index', intersect: false },
          plugins: { legend: { display: ms.length > 1, labels: { boxWidth: 10, color: '#94a3b8', font: { size: 10 } } }, tooltip: { callbacks: { label: (x) => `${x.dataset.label}: ${fmt(x.raw)}` } } },
          scales: { y: { beginAtZero: true, suggestedMax: 1, ticks: { precision: 0, callback: (v) => short(v), color: '#64748b' }, grid: { color: 'rgba(148,163,184,.08)' } }, x: { ticks: { maxTicksLimit: 10, color: '#64748b' }, grid: { display: false } } } } })); };
    if (cards.kp) mk('kbChartKp', KB_METRICS.filter(m => m.k === 'kp'));
    mk('kbChartTr', KB_METRICS.filter(m => m.k !== 'kp' && cards[m.k]));
  }
  // PvE-Verlauf: besiegte Ziele pro Tag, gestapelt nach Art
  var KB_CAT_COL = { barb: '#34d399', fort: '#f5c542', baulur: '#fb923c', raid: '#f87171', ckaruak: '#38bdf8', maraud: '#a78bfa', skip: '#64748b' };
  function kbDrawPve(rows, R0, cum) {
    const c = $('kbChartPve'); if (!c) return;
    const n = Math.min(R0.n, 400), from = new Date(R0.from.getTime() + (R0.n - n) * 86400000), keys = [], labels = [];
    for (let i = 0; i < n; i++) { const d = new Date(from.getTime() + i * 86400000); keys.push(isoDay(d)); labels.push(d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' })); }
    const idx = new Map(keys.map((k, i) => [k, i]));
    const has = new Set(rows.map(r => kbCatOf(r.npc_btype, r.group_size))), cats = KB_CATS.filter(([k]) => k === 'barb' || has.has(k));
    const data = Object.fromEntries(cats.map(([k]) => [k, keys.map(() => 0)]));
    const seen = new Set();
    rows.forEach(r => { if (!r.battle_start) return; const i = idx.get(isoDay(new Date(r.battle_start))); const k = kbCatOf(r.npc_btype, r.group_size); if (i == null || !data[k]) return;
      const key = k === 'fort' ? 'f|' + r.mail_id : r.mail_id + '|' + r.opponent_id; if (seen.has(key) || (k !== 'fort' && !kbDefeated(r))) return; seen.add(key); data[k][i]++; });
    if (cum) Object.values(data).forEach(a => { for (let i = 1; i < a.length; i++) a[i] += a[i - 1]; });
    kbCharts.push(new Chart(c, { type: cum ? 'line' : 'bar',
      data: { labels, datasets: cats.map(([k, l]) => ({ label: l, data: data[k], backgroundColor: KB_CAT_COL[k] + (cum ? '22' : 'dd'), borderColor: KB_CAT_COL[k], borderWidth: cum ? 2 : 0, borderRadius: 3, pointRadius: 0, tension: .25, fill: false, maxBarThickness: 22 })) },
      options: { responsive: true, maintainAspectRatio: false, interaction: { mode: 'index', intersect: false },
        plugins: { legend: { labels: { boxWidth: 10, color: '#94a3b8', font: { size: 11 } } }, tooltip: { callbacks: { label: (x) => `${x.dataset.label}: ${fmt(x.raw)}` } } },
        scales: { x: { stacked: !cum, ticks: { maxTicksLimit: 10, color: '#64748b' }, grid: { display: false } }, y: { stacked: !cum, beginAtZero: true, ticks: { precision: 0, color: '#64748b' }, grid: { color: 'rgba(148,163,184,.08)' } } } } }));
  }
  // Heilkosten (Schätzung, ohne Boni) – nur schwer Verwundete kommen ins Lazarett
  var KB_HEAL = {   // je Truppe: [Nahrung, Holz, Stein, Gold]
    inf: { 4: [120, 120, 0, 8], 5: [320, 320, 0, 160] },
    cav: { 4: [120, 0, 90, 8], 5: [320, 0, 240, 160] },
    arch: { 4: [0, 120, 90, 8], 5: [0, 320, 240, 160] } };
  function kbHealCost(rows, type) {
    const per = (t) => type === 'mix' ? [0, 1, 2, 3].map(j => (KB_HEAL.inf[t][j] + KB_HEAL.cav[t][j] + KB_HEAL.arch[t][j]) / 3) : KB_HEAL[type][t];
    const o = { food: 0, wood: 0, stone: 0, gold: 0 }; let u4 = 0, u5 = 0;
    rows.forEach(r => { const sev = kbN(r.self_severe), lost = sev + kbN(r.self_dead); if (!sev) return;
      const pp = lost ? Math.abs(kbN(r.self_power_lost)) / lost : 10, f5 = Math.min(1, Math.max(0, (pp - 10) / 10));   // Power je Truppe: T4 = 10, T5 = 20
      u4 += sev * (1 - f5); u5 += sev * f5; });
    const p4 = per(4), p5 = per(5);
    ['food', 'wood', 'stone', 'gold'].forEach((k, j) => { o[k] = u4 * p4[j] + u5 * p5[j]; });
    const tot = u4 + u5; o.tier = !tot ? 'T4' : u5 / tot > .95 ? 'T5' : u5 / tot < .05 ? 'T4' : `T4/T5 · ${dec(u5 / tot * 100, 0)} % T5`;
    return o;
  }
  // ---------- Ressourcen: Sammel-Mails (rok_mails, mail_type = 'Rss') ----------
  var rsRows = null, rsLoading = false, rsErr = '';
  var RS_TYPES = { 1: ['🌽', 'Nahrung', '#4ade80'], 2: ['🪵', 'Holz', '#b45309'], 3: ['🪨', 'Stein', '#94a3b8'], 4: ['🪙', 'Gold', '#facc15'], 5: ['💎', 'Edelsteine', '#f87171'] };   // Nahrung grün · Holz braun · Stein grau · Gold gelb · Edelsteine rot
  function rsType(t) { return RS_TYPES[t] || ['📦', 'Typ ' + t, '#64748b']; }
  async function loadRes(force) {
    if (rsLoading || (rsRows && !force)) return; rsLoading = true; rsErr = '';
    try { const db = RokAuth.db?.(); if (!db) throw new Error('offline');
      const all = [];
      for (let f = 0; f < 200000; f += 1000) {
        const { data, error } = await db.from('rok_mails').select('mail_id,player_id,account,sent_at,content').eq('mail_type', 'Rss').order('sent_at', { ascending: false }).range(f, f + 999);
        if (error) throw error; all.push(...(data || [])); if (!data || data.length < 1000) break;
      }
      rsRows = all.map(r => { let c = r.content; if (typeof c === 'string') { try { c = JSON.parse(c); } catch { c = {}; } } c = (c && (c.content || c)) || {};
        return { id: r.mail_id, pid: r.player_id, acc: r.account, t: r.sent_at, type: +c.ResType || 0, val: +c.ResValue || 0, talent: +c.talentAdd || 0, lvl: +c.Level || 0, crystal: +c.ResCollectCrystal || 0 }; });
      try { const agg = []; for (let f = 0; f < 200000; f += 1000) { const { data, error } = await db.from('rok_res_daily').select('player_id,account,day,res_type,total,cnt,talent,crystal').order('day', { ascending: false }).range(f, f + 999); if (error) break; agg.push(...(data || [])); if (!data || data.length < 1000) break; }
        agg.forEach(a => rsRows.push({ id: 'agg' + a.player_id + a.day + a.res_type, pid: a.player_id, acc: a.account, t: a.day + 'T12:00:00Z', type: +a.res_type || 0, val: +a.total || 0, talent: +a.talent || 0, lvl: 0, crystal: +a.crystal || 0, cnt: +a.cnt || 1, agg: true })); } catch {}
    } catch (e) { rsRows = rsRows || []; rsErr = e?.message || String(e); }
    rsLoading = false; if (R.view === 'battles' && kbSt().page === 'res') renderKampf();
  }
  // Gruppen: jede Farm (Spieler-ID) frei einer Gruppe zuordnen, z. B. „Mirox“ oder „Loli“ – lokal gespeichert
  var RS_GROUPS = ['g1', 'g2', 'g3', 'g4', 'g5'];
  function rsGroupOf(pid) { const g = (kbSt().rsGroups || {})[String(pid)] || ''; return RS_GROUPS.includes(g) ? g : ''; }
  function rsGroupLabel(g) { return ((kbSt().rsGroupNames || {})[g] || '').trim() || 'Gruppe ' + (RS_GROUPS.indexOf(g) + 1); }
  function rsNameOf(pid, fallback) { return ((kbSt().rsNames || {})[String(pid)] || '').trim() || fallback || ('Farm ' + pid); }
  function rsFiltered(noGroup) { const st = kbSt(); return (rsRows || []).filter(r => (!st.acc || String(r.pid) === st.acc) && (noGroup || !st.rsGroup || rsGroupOf(r.pid) === (st.rsGroup === '–' ? '' : st.rsGroup)) && kxInRange(r.t)); }
  function rsHtml(timeBar) {
    if (!rsRows) return '<section class="panel rounded-2xl p-6 text-center text-sm text-slate-400">Lade Sammel-Mails …</section>';
    const st = kbSt(), rows = rsFiltered(), by = {};
    rows.forEach(r => { const o = by[r.type] || (by[r.type] = { val: 0, n: 0, talent: 0 }); o.val += r.val; o.n += r.cnt || 1; o.talent += r.talent; });
    const types = Object.keys(by).map(Number).sort((a, b) => a - b), tot = rows.reduce((a, r) => a + r.val, 0), cry = rows.reduce((a, r) => a + r.crystal, 0);
    const tile = (icon, l, v, sub, c) => `<div class="rounded-xl border border-ink-700 bg-ink-950/70 p-4"><div class="flex items-center gap-2 text-xs text-slate-400"><span class="text-lg leading-none">${icon}</span><span>${l}</span></div><div class="font-display text-2xl tabular-nums" style="color:${c}">${short(v)}</div><div class="text-[11px] text-slate-500">${sub}</div></div>`;
    const shown = types.length ? types : [1, 2, 3, 4];
    const tiles = `<div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
        ${tile('📦', 'Gesamt', tot, `${fmt(rows.reduce((a, r) => a + (r.cnt || 1), 0))}× <span>gesammelt</span>`, '#ffffff')}
        ${shown.map(t => { const [i, l, c] = rsType(t), o = by[t] || { val: 0, n: 0, talent: 0 }; return tile(i, l, o.val, `${fmt(o.n)}× · <span>Talent</span> +${short(o.talent)}`, c); }).join('')}
        ${cry ? tile('🔷', 'Kristalle', cry, '<span>aus Kristallminen</span>', '#38bdf8') : ''}</div>`;
    const err = rsErr ? `<div class="mb-2 text-[11px] text-red-400">Laden hat nicht geklappt: ${esc(rsErr)}</div>` : '';
    // Gruppen: oben benennen (bis zu 5) und auswählen
    const used = new Set((rsRows || []).map(r => rsGroupOf(r.pid)));
    const gBtn = (k, l) => `<button type="button" data-rsgfilter="${esc(k)}" aria-pressed="${(st.rsGroup || '') === k}" class="seg-btn rounded-lg px-3 py-1.5 text-xs font-semibold transition" translate="no">${l}</button>`;
    const gInp = 'bg-ink-950 border border-ink-600 rounded-lg px-2 py-1 text-xs w-28 text-slate-100 focus:outline-none focus:border-gold-500';
    const editG = !!st.rsEditGroups;
    const groupSel = `<section class="sticky top-0 z-30 panel rounded-2xl p-3 !bg-ink-900/95 backdrop-blur shadow-xl">
        <div class="flex flex-wrap items-center gap-1 p-1 rounded-xl bg-ink-950 border border-ink-700 mb-2"><span class="px-2 text-sm">👥</span>${gBtn('', '<span>Alle</span>')}${RS_GROUPS.filter(g => used.has(g)).map(g => gBtn(g, esc(rsGroupLabel(g)))).join('')}${used.has('') ? gBtn('–', '<span>Ohne Gruppe</span>') : ''}
          <button type="button" data-rsgedit aria-pressed="${editG}" class="seg-btn ml-auto rounded-lg px-3 py-1.5 text-xs font-semibold transition">✏️ <span>${editG ? 'Fertig' : 'Bearbeiten'}</span></button></div>
        ${editG ? `<div class="flex flex-wrap items-center gap-2 mb-2 px-1"><span class="text-[11px] text-slate-400">Gruppennamen:</span>${RS_GROUPS.map((g, i) => `<label class="flex items-center gap-1 text-[11px] text-slate-500">${i + 1}<input data-rsgname="${g}" value="${esc((st.rsGroupNames || {})[g] || '')}" placeholder="Gruppe ${i + 1}" maxlength="20" class="${gInp}" translate="no"></label>`).join('')}<span class="text-[11px] text-slate-500">· Farmen zuordnen: unten in „Pro Account“</span></div>` : ''}
        ${timeBar || ''}</section>`;
    const groups = RS_GROUPS.filter(g => used.has(g));
    // Verlauf & Hochrechnung
    // Hochrechnung unabhängig vom Zeitraum oben: Ø aus den letzten N Tagen × Ziel-Tage (oder bis zum nächsten KvK)
    const avgD = +st.rsAvg || 7, since = Date.now() - avgD * 86400000;
    const kvkDays = st.rsKvk ? Math.max(0, Math.ceil((new Date(st.rsKvk + 'T00:00:00').getTime() - Date.now()) / 86400000)) : null;
    const hzKey = st.rsHz || 30, hz = hzKey === 'kvk' ? (kvkDays ?? 0) : +hzKey;
    const grpOk = (r) => !st.rsGroup || rsGroupOf(r.pid) === (st.rsGroup === '–' ? '' : st.rsGroup);
    const base = (rsRows || []).filter(r => (!st.acc || String(r.pid) === st.acc) && grpOk(r) && Date.parse(r.t || 0) >= since);
    const bBy = {}; base.forEach(r => { bBy[r.type] = (bBy[r.type] || 0) + r.val; }); const bTot = base.reduce((a, r) => a + r.val, 0);
    const pTypes = [...new Set([...shown, ...Object.keys(bBy).map(Number)])].sort((a, b) => a - b);
    const card = (i, l, big, sub, c) => `<div class="rounded-xl border border-ink-700 bg-ink-950/70 p-3"><div class="text-xs text-slate-400">${i} <span>${l}</span></div><div class="font-display text-xl tabular-nums" style="color:${c}">${big}</div><div class="text-[11px] text-slate-500">${sub}</div></div>`;
    const proj = `<div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 mt-3">${[['📦', 'Gesamt', bTot, '#ffffff'], ...pTypes.map(t => { const [i, l, c] = rsType(t); return [i, l, bBy[t] || 0, c]; })].map(([i, l, v, c]) =>
        card(i, l, short(v / avgD * hz), `Ø ${short(v / avgD)} <span>pro Tag</span>`, c)).join('')}</div>`;
    const seg = (attr, cur, vals, suf) => `<div class="flex items-center gap-1 p-1 rounded-xl bg-ink-950 border border-ink-700">${vals.map(n => `<button type="button" ${attr}="${n}" aria-pressed="${String(cur) === String(n)}" class="seg-btn rounded-lg px-2 py-1 text-xs font-semibold transition">${n}${suf ? ' <span>' + suf + '</span>' : ''}</button>`).join('')}</div>`;
    const kvkSel = `<div class="flex items-center gap-1 p-1 rounded-xl bg-ink-950 border border-ink-700"><button type="button" data-rshz="kvk" aria-pressed="${hzKey === 'kvk'}" class="seg-btn rounded-lg px-2 py-1 text-xs font-semibold transition">🏁 <span>bis KvK</span></button><input type="date" data-rskvk value="${esc(st.rsKvk || '')}" class="bg-ink-950 border border-ink-600 rounded-lg px-2 py-0.5 text-xs text-slate-100" title="Start des nächsten KvK"></div>`;
    // Sammelzüge: was bringt 1×–5× Rausschicken pro Tag (Ø pro Zug je Farm aus denselben Tagen)
    const trip = new Map(); base.forEach(r => { const k = String(r.pid); const o = trip.get(k) || { n: 0, v: 0 }; o.n += r.cnt || 1; o.v += r.val; trip.set(k, o); });
    const perTrip = [...trip.values()].reduce((a, o) => a + o.v / o.n, 0), farms = trip.size, nowTrips = farms ? base.reduce((a, r) => a + (r.cnt || 1), 0) / avgD / farms : 0;
    const tripBox = `<section id="rsTripBox" class="panel rounded-2xl p-5"><h2 class="font-display text-lg text-gold-300 mb-1">🚚 Wie oft rausschicken?</h2>
      <p class="text-xs text-slate-400 mb-3"><span>Ø pro Sammelzug aus den letzten</span> ${fmt(avgD)} <span>Tagen</span> · ${fmt(farms)} <span>Farmen</span> · <span>jetzt Ø</span> ${dec(nowTrips, 1)}× <span>pro Farm und Tag</span></p>
      ${farms ? `<div class="grid grid-cols-2 sm:grid-cols-5 gap-2">${[1, 2, 3, 4, 5].map(n => card('🚚', `${n}× <span>pro Tag</span>`, short(perTrip * n), `<span>in</span> ${fmt(hz)} <span>Tagen</span>: <b class="text-gold-300">${short(perTrip * n * hz)}</b>`, Math.abs(n - nowTrips) < .5 ? '#facc15' : '#ffffff')).join('')}</div>
        <div class="mt-2 text-[11px] text-slate-500">Pro Tag für alle Farmen der Auswahl zusammen. Gelb = ungefähr dein jetziges Tempo.</div>` : '<div class="text-sm text-slate-500">Keine Sammel-Mails in diesen Tagen.</div>'}</section>`;
    const ct = st.rsChart === 'line' ? 'line' : 'bar';
    const trendBox = `<section id="rsTrendBox" class="panel rounded-2xl p-5"><div class="flex flex-wrap items-center justify-between gap-2 mb-2"><h2 class="font-display text-lg text-gold-300">📈 Verlauf</h2>
        <div class="flex items-center gap-1 p-1 rounded-xl bg-ink-950 border border-ink-700">${[['bar', '📊 Balken'], ['line', '📈 Linien']].map(([k, l]) => `<button type="button" data-rschart="${k}" aria-pressed="${ct === k}" class="seg-btn rounded-lg px-2 py-1 text-xs font-semibold transition">${l}</button>`).join('')}</div></div>
        <div class="flex flex-wrap items-center gap-2 mb-2 text-[11px] text-slate-400"><span>Schritte</span><div class="flex items-center gap-1 p-1 rounded-xl bg-ink-950 border border-ink-700">${[['auto', 'Auto'], ['1', '1 Tag'], ['3', '3 Tage'], ['7', 'Woche'], ['30', 'Monat']].map(([k, l]) => `<button type="button" data-rsstep="${k}" aria-pressed="${(st.rsStep || 'auto') === k}" class="seg-btn rounded-lg px-2 py-1 text-xs font-semibold transition">${l}</button>`).join('')}</div><span id="rsStepInfo"></span></div>
        <div class="h-72"><canvas id="rsChart"></canvas></div></section>
      <section id="rsProjBox" class="panel rounded-2xl p-5"><h2 class="font-display text-lg text-gold-300 mb-2">🔮 Hochrechnung</h2>
        <div class="flex flex-wrap items-center gap-2 text-xs text-slate-400"><span>Durchschnitt aus den letzten</span>${seg('data-rsavg', avgD, [3, 7, 14, 30], 'Tagen')}<span>→ so viel hast du in</span>${seg('data-rshz', hzKey, [7, 30, 60, 90], 'Tagen')}${kvkSel}</div>
        <div class="mt-1 text-[11px] text-slate-500">${hzKey === 'kvk' ? (kvkDays == null ? '<span class="text-amber-300">Trag rechts das Datum vom nächsten KvK ein.</span>' : `<span>Noch</span> <b class="text-gold-300">${fmt(kvkDays)}</b> <span>Tage bis zum KvK.</span> `) : ''}<span>Unabhängig vom Zeitraum oben – Account und Gruppe gelten aber auch hier.</span></div>${proj}</section>${tripBox}`;
    // Pro Account: sortierbar, Bearbeiten-Modus, Summe oder Ø pro Tag
    const td = 'py-1 px-2 text-right tabular-nums', inp = 'bg-ink-950 border border-ink-600 rounded-lg px-2 py-1 text-xs w-28 focus:outline-none focus:border-gold-500';
    const accRows = rsFiltered(true).filter(r => !st.acc || String(r.pid) === st.acc), per = new Map();
    (rsRows || []).filter(r => kxInRange(r.t)).forEach(r => { const k = String(r.pid); const o = per.get(k) || { pid: k, acc: r.acc, n: 0, v: {}, tot: 0, last: 0 }; o.n += r.cnt || 1; o.v[r.type] = (o.v[r.type] || 0) + r.val; o.tot += r.val; o.last = Math.max(o.last, Date.parse(r.t || 0) || 0); per.set(k, o); });
    (rsRows || []).forEach(r => { const k = String(r.pid); if (!per.has(k)) per.set(k, { pid: k, acc: r.acc, n: 0, v: {}, tot: 0, last: 0 }); });   // auch ohne Mails im Zeitraum zuordnen können
    const cols = [1, 2, 3, 4, ...[...new Set(accRows.map(r => r.type))].filter(t => t > 4).sort()];
    const editA = !!st.rsEditAcc, mode = ['sum', 'avg', '7', '14', '30'].includes(st.rsAccMode) ? st.rsAccMode : 'sum', dDays = Math.max(1, kbRange(rows.map(r => ({ battle_start: r.t }))).n);
    const fac = mode === 'sum' ? 1 : mode === 'avg' ? 1 / dDays : +mode / dDays;
    const V = (v) => v * fac, nm = (o) => rsNameOf(o.pid, o.acc);
    const so = st.rsSort || { k: 'tot', dir: 'desc' };
    const sv = (o) => so.k === 'name' ? nm(o).toLowerCase() : so.k === 'id' ? +o.pid : so.k === 'n' ? o.n : so.k === 'last' ? o.last : so.k === 'tot' ? o.tot : (o.v[so.k] || 0);
    let accs = [...per.values()].filter(o => !st.rsGroup || rsGroupOf(o.pid) === (st.rsGroup === '–' ? '' : st.rsGroup));
    accs.sort((a, b) => { const g = (rsGroupOf(a.pid) || 'z').localeCompare(rsGroupOf(b.pid) || 'z'); if (g) return g; const x = sv(a), y = sv(b); const r = typeof x === 'string' ? x.localeCompare(y) : x - y; return so.dir === 'asc' ? r : -r; });
    const addSum = (list) => { const s = { n: 0, v: {}, tot: 0 }; list.forEach(o => { s.n += o.n; s.tot += o.tot; cols.forEach(t => s.v[t] = (s.v[t] || 0) + (o.v[t] || 0)); }); return s; };
    const cnt = (n) => mode === 'sum' ? fmt(n) : dec(n * fac, 1);
    const showGrp = editA, nCol = 4 + cols.length + (showGrp ? 1 : 0);
    const sumRow = (label, s, c, cls) => `<tr class="${cls} font-semibold"><td class="py-2 px-2 text-gold-300" ${showGrp ? 'colspan="2"' : ''}>${label}</td><td class="${td} text-slate-500">${fmt(c)} <span class="text-[10px]">Acc.</span></td><td class="${td}">${cnt(s.n)}</td>${cols.map(t => `<td class="${td}">${s.v[t] ? short(V(s.v[t])) : '–'}</td>`).join('')}<td class="${td} text-gold-300">${short(V(s.tot))}</td><td></td></tr>`;
    let body = accs.length ? sumRow('Σ <span>Alle zusammen</span>', addSum(accs), accs.length, 'bg-ink-900/90 border-b border-ink-700') : '';
    const splitGroups = !st.rsGroup && groups.length;   // bei einer gewählten Gruppe keine Gruppen-Überschriften
    accs.forEach((o, i) => {
      const g = rsGroupOf(o.pid), own = (st.rsNames || {})[o.pid], prev = accs[i - 1];
      if (splitGroups && (!prev || rsGroupOf(prev.pid) !== g)) { const gl = accs.filter(x => rsGroupOf(x.pid) === g); body += sumRow(g ? '👥 ' + esc(rsGroupLabel(g)) : '<span>Ohne Gruppe</span>', addSum(gl), gl.length, 'bg-ink-900/50 border-t border-ink-700'); }
      const nameCell = editA ? `<input data-rsname="${esc(o.pid)}" value="${esc(own || '')}" placeholder="${esc(o.acc || 'Farm ' + o.pid)}" maxlength="30" class="${inp} w-40 text-slate-100" translate="no">` : `<span class="${own ? 'text-slate-100' : 'text-slate-400'}" translate="no">${esc(nm(o))}</span>`;
      const grpCell = showGrp ? `<td class="py-1 px-2"><select data-rsgroup="${esc(o.pid)}" class="${inp}" translate="no"><option value="">–</option>${RS_GROUPS.map(x => `<option value="${x}" ${g === x ? 'selected' : ''}>${esc(rsGroupLabel(x))}</option>`).join('')}</select></td>` : '';
      body += `<tr class="border-b border-ink-800/60 hover:bg-ink-800/40 ${st.acc === o.pid ? 'bg-gold-500/10' : ''}"><td class="py-1.5 px-2 whitespace-nowrap ${splitGroups ? 'pl-5' : ''}">${nameCell}</td>
        ${grpCell}<td class="${td} text-slate-500">${esc(o.pid)}</td><td class="${td}">${cnt(o.n)}</td>${cols.map(t => `<td class="${td}">${o.v[t] ? short(V(o.v[t])) : '–'}</td>`).join('')}<td class="${td} text-gold-300 font-semibold">${short(V(o.tot))}</td><td class="${td} text-slate-400">${o.last ? new Date(o.last).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '–'}</td></tr>`;
    });
    const th = (k, html, left) => `<th class="py-2 px-2 ${left ? 'text-left' : 'text-right'} font-medium whitespace-nowrap"><button type="button" data-rssort="${k}" class="hover:text-gold-300 ${so.k === k ? 'text-gold-300' : ''}">${html}${so.k === k ? (so.dir === 'asc' ? ' ▲' : ' ▼') : ''}</button></th>`;
    const modeTxt = { sum: '', avg: `<span>Durchschnitt pro Tag im gewählten Zeitraum</span> (${fmt(dDays)} <span>Tage</span>). `, 7: '<span>Hochgerechnet auf 7 Tage</span>. ', 14: '<span>Hochgerechnet auf 14 Tage</span>. ', 30: '<span>Hochgerechnet auf 30 Tage</span>. ' }[mode];
    const perBox = `<section id="rsAccBox" class="panel rounded-2xl p-5"><div class="flex flex-wrap items-center justify-between gap-2 mb-1"><h2 class="font-display text-lg text-gold-300">👥 Pro Account</h2>
        <div class="flex flex-wrap items-center gap-2"><div class="flex items-center gap-1 p-1 rounded-xl bg-ink-950 border border-ink-700">${[['sum', 'Σ Summe'], ['avg', 'Ø pro Tag'], ['7', '7 Tage'], ['14', '14 Tage'], ['30', '30 Tage']].map(([k, l]) => `<button type="button" data-rsaccmode="${k}" aria-pressed="${mode === k}" class="seg-btn rounded-lg px-2 py-1 text-xs font-semibold transition">${l}</button>`).join('')}</div>
        <button type="button" data-rsaccedit aria-pressed="${editA}" class="seg-btn rounded-lg px-3 py-1.5 text-xs font-semibold transition border border-ink-700">✏️ <span>${editA ? 'Fertig' : 'Bearbeiten'}</span></button></div></div>
      <p class="text-xs text-slate-400 mb-3">${modeTxt}<span>Zum Sortieren auf eine Spalte klicken. Namen und Gruppen änderst du über ✏️ Bearbeiten (Farmen ohne Namen im Postfach heißen „Farm + ID“). 🔍 zeigt nur diesen Account.</span></p>
      ${accs.length ? `<div class="overflow-x-auto rounded-lg border border-ink-700"><table class="w-full text-xs"><thead class="text-[10px] uppercase tracking-wider text-slate-400"><tr class="border-b border-ink-700">
        ${th('name', '<span>Account</span>', true)}${showGrp ? '<th class="py-2 px-2 text-left font-medium">Gruppe</th>' : ''}${th('id', 'ID')}${th('n', mode === 'sum' ? '<span>Sammelzüge</span>' : '<span>Züge</span>')}${cols.map(t => { const [i, l] = rsType(t); return th(String(t), `${i} <span>${l}</span>`); }).join('')}${th('tot', '<span>Gesamt</span>')}${th('last', '<span>Zuletzt</span>')}</tr></thead>
        <tbody>${body}</tbody></table></div>` : '<div class="text-sm text-slate-500">Noch keine Sammel-Mails.</div>'}</section>`;
    const lg = st.rsListGroup || '', lgG = lg || st.rsGroup || '';
    const now = Date.now(), DAY = 86400000;
    // Basis für Liste + Zähler: unabhängig vom Zeitraum oben, aber mit Account- und Gruppenwahl
    const lbase = (rsRows || []).filter(r => r.t && (!st.acc || String(r.pid) === st.acc) && (!lgG || lgG === 'all' || rsGroupOf(r.pid) === (lgG === '–' ? '' : lgG)));
    const cntBox = (() => {
      const per = [7, 14].map(d => { const rr = lbase.filter(r => now - new Date(r.t) <= d * DAY), o = {}; rr.forEach(r => { const x = o[r.type] || (o[r.type] = { n: 0, v: 0 }); x.n++; x.v += r.val; }); return { d, rr, o }; });
      const ts = [...new Set(lbase.map(r => r.type))].sort((a, b) => a - b);
      const show = ts.length ? ts : [1, 2, 3, 4];
      return `<div class="overflow-x-auto rounded-lg border border-ink-700 mb-4"><table class="w-full text-xs"><thead class="text-[10px] uppercase tracking-wider text-slate-400"><tr class="border-b border-ink-700"><th class="py-2 px-2 text-left font-medium">Zeitraum</th>${show.map(t => { const [i, l] = rsType(t); return `<th class="py-2 px-2 text-right font-medium">${i} <span>${l}</span></th>`; }).join('')}<th class="py-2 px-2 text-right font-medium">Gesamt</th></tr></thead><tbody>
        ${per.map(p => `<tr class="border-b border-ink-800/60"><td class="py-2 px-2 font-semibold text-slate-200"><span>Letzte</span> ${p.d} <span>Tage</span></td>${show.map(t => { const x = p.o[t]; const [, , c] = rsType(t); return `<td class="${td}">${x ? `<b style="color:${c}">${fmt(x.n)}×</b><div class="text-[10px] text-slate-500">${short(x.v)}</div>` : '<span class="text-slate-600">–</span>'}</td>`; }).join('')}<td class="${td}"><b class="text-gold-300">${fmt(p.rr.length)}×</b><div class="text-[10px] text-slate-500">${short(p.rr.reduce((a, r) => a + r.val, 0))}</div></td></tr>`).join('')}</tbody></table></div>`;
    })();
    // Letzte 7 Tage, Mails je Account zu „Runden“ zusammengefasst (alles innerhalb von 2 Std. nach der ersten Mail)
    const week = lbase.filter(r => !r.agg && now - new Date(r.t) <= 7 * DAY).sort((a, b) => new Date(a.t) - new Date(b.t));
    const runs = [], open = new Map();
    week.forEach(r => { const t = +new Date(r.t), cur = open.get(r.pid); if (cur && t - cur.start <= 2 * 3600000) cur.rows.push(r); else { const n = { pid: r.pid, start: t, rows: [r] }; open.set(r.pid, n); runs.push(n); } });
    runs.forEach(x => { x.end = Math.max(...x.rows.map(r => +new Date(r.t))); x.rows.reverse(); });
    runs.sort((a, b) => b.end - a.end);
    const listSel = `<select data-rslistgroup class="${inp} w-40" translate="no"><option value="">wie oben</option><option value="all" ${lg === 'all' ? 'selected' : ''}>Alle Gruppen</option>${groups.map(g => `<option value="${g}" ${lg === g ? 'selected' : ''}>${esc(rsGroupLabel(g))}</option>`).join('')}${used.has('') ? `<option value="–" ${lg === '–' ? 'selected' : ''}>Ohne Gruppe</option>` : ''}</select>`;
    const fdt = (t) => new Date(t).toLocaleString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
    const runRows = runs.map((x, k) => {
      const n = x.rows.length, bg = k % 2 ? 'bg-slate-400/[.08]' : 'bg-sky-500/[.16]', badge = n >= 5 ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40' : n >= 4 ? 'bg-sky-500/20 text-sky-300 border-sky-500/40' : 'bg-amber-500/20 text-amber-300 border-amber-500/40';
      return x.rows.map((r, j) => { const [i, l] = rsType(r.type); return `<tr class="${bg} ${j === n - 1 ? 'border-b-2 border-ink-950' : ''}">
        ${j === 0 ? `<td rowspan="${n}" class="py-1 px-2 align-top border-r border-ink-800/60 whitespace-nowrap"><span class="inline-block rounded-md border px-2 py-0.5 text-[11px] font-bold ${badge}">${n} <span>${n === 1 ? 'Marsch' : 'Märsche'}</span></span><div class="text-[10px] text-slate-500 mt-1 tabular-nums">${short(x.rows.reduce((a, q) => a + q.val, 0))}</div></td>` : ''}
        <td class="py-1 px-2 whitespace-nowrap text-slate-300 tabular-nums">${fdt(r.t)}</td><td class="py-1 px-2" translate="no">${esc(rsNameOf(r.pid, r.acc))}</td><td class="py-1 px-2">${i} <span>${l}</span></td><td class="${td}">${r.lvl || '–'}</td><td class="${td} text-gold-300">${fmt(r.val)}</td><td class="${td} text-slate-400">${r.talent ? fmt(r.talent) : '–'}</td></tr>`; }).join('');
    }).join('');
    return groupSel + `<section class="panel rounded-2xl p-5">${err}${tiles}</section>${trendBox}${perBox}
      <section class="panel rounded-2xl p-5"><div class="flex flex-wrap items-center justify-between gap-2 mb-2"><h2 class="font-display text-lg text-gold-300">📜 Letzte Sammel-Mails</h2><label class="flex items-center gap-2 text-[11px] text-slate-400"><span>Gruppe</span>${listSel}</label></div>
        <p class="text-xs text-slate-400 mb-3"><span>Wie oft gesammelt wurde (unabhängig vom Zeitraum oben). Darunter die letzten 7 Tage: Mails eines Accounts, die innerhalb von 2 Stunden zurückkamen, bilden eine Runde (abwechselnd blau / grau) – so siehst du, ob alle 5 Märsche draußen waren.</span></p>
        ${cntBox}
        ${runs.length ? `<div class="overflow-x-auto rounded-lg border border-ink-700 max-h-[70vh] overflow-y-auto"><table class="w-full text-xs"><thead class="text-[10px] uppercase tracking-wider text-slate-400 sticky top-0 bg-ink-900 z-10"><tr class="border-b border-ink-700">
          <th class="py-2 px-2 text-left font-medium">Runde</th><th class="py-2 px-2 text-left font-medium">Datum</th><th class="py-2 px-2 text-left font-medium">Account</th><th class="py-2 px-2 text-left font-medium">Ressource</th><th class="py-2 px-2 text-right font-medium">Level</th><th class="py-2 px-2 text-right font-medium">Menge</th><th class="py-2 px-2 text-right font-medium">davon Talent</th></tr></thead>
          <tbody>${runRows}</tbody></table></div>` : '<div class="text-sm text-slate-500">Keine Sammel-Mails in den letzten 7 Tagen.</div>'}</section>`;
  }
  function rsDraw() {
    const c = $('rsChart'); if (!c || !window.Chart || !rsRows) return;
    const rows = rsFiltered(), R0 = kbRange(rows.map(r => ({ battle_start: r.t })));
    const n = Math.min(R0.n, 800), from = new Date(R0.from.getTime() + (R0.n - n) * 86400000), dayKeys = [];
    for (let i = 0; i < n; i++) dayKeys.push(isoDay(new Date(from.getTime() + i * 86400000)));
    const stepSet = kbSt().rsStep || 'auto', step = stepSet === 'auto' ? (n <= 14 ? 1 : n <= 60 ? 3 : n <= 180 ? 7 : 30) : +stepSet;
    // Abschnitte von hinten bilden, damit der neueste vollständig ist
    const nb = Math.ceil(n / step), bucketOf = (i) => nb - 1 - Math.floor((n - 1 - i) / step), bDays = Array(nb).fill(0), bFirst = Array(nb).fill(-1), labels = [];
    dayKeys.forEach((_, i) => { const b = bucketOf(i); bDays[b]++; if (bFirst[b] < 0) bFirst[b] = i; });
    const dl = (d) => d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' });
    for (let b = 0; b < nb; b++) { const d0 = new Date(from.getTime() + bFirst[b] * 86400000), d1 = new Date(d0.getTime() + (bDays[b] - 1) * 86400000); labels.push(bDays[b] === 1 ? dl(d0) : `${dl(d0)}–${dl(d1)}`); }
    const idx = new Map(dayKeys.map((k, i) => [k, bucketOf(i)])), types = [...new Set(rows.filter(r => r.val > 0).map(r => r.type))].sort((a, b) => a - b), data = {};
    types.forEach(t => data[t] = labels.map(() => 0));
    rows.forEach(r => { if (!r.t || !data[r.type]) return; const i = idx.get(isoDay(new Date(r.t))); if (i != null) data[r.type][i] += r.val; });
    if (step > 1) types.forEach(t => data[t] = data[t].map((v, b) => v / bDays[b]));   // Ø pro Tag im Abschnitt → auch angeschnittene Abschnitte vergleichbar
    const keys = labels;
    const inf = $('rsStepInfo'); if (inf) inf.textContent = step > 1 ? `${step === 7 ? 'Woche' : step === 30 ? 'Monat' : step + ' Tage'} je Punkt · Werte = Ø pro Tag` : 'Werte pro Tag';
    const line = kbSt().rsChart === 'line';
    if (line && types.length > 1) data.tot = keys.map((_, i) => types.reduce((a, t) => a + data[t][i], 0));
    const sets = types.map(t => { const [, l, col] = rsType(t); return line ? { label: l, data: data[t], borderColor: col, backgroundColor: col + '22', borderWidth: 2, pointRadius: 2, tension: .3, fill: false } : { label: l, data: data[t], backgroundColor: col + 'dd', borderRadius: 3, maxBarThickness: 22 }; });
    if (data.tot) sets.unshift({ label: 'Gesamt', data: data.tot, borderColor: '#ffffff', backgroundColor: '#ffffff22', borderWidth: 2.5, pointRadius: 2, tension: .3, fill: false });
    kbCharts.push(new Chart(c, { type: line ? 'line' : 'bar', data: { labels, datasets: sets },
      options: { responsive: true, maintainAspectRatio: false, interaction: { mode: 'index', intersect: false }, plugins: { legend: { labels: { boxWidth: 10, color: '#94a3b8', font: { size: 11 } } }, tooltip: { callbacks: { label: (x) => `${x.dataset.label}: ${fmt(x.raw)}` } } },
        scales: { x: { stacked: !line, ticks: { maxTicksLimit: 10, color: '#64748b' }, grid: { display: false } }, y: { stacked: !line, beginAtZero: true, suggestedMax: 1, ticks: { callback: (v) => short(v), color: '#64748b' }, grid: { color: 'rgba(148,163,184,.08)' } } } } }));
  }
  function kbBind(el) {
    const st = kbSt(), re = () => { kbShow = 50; savePassive(); renderKampf(); };
    $('kbReload')?.addEventListener('click', () => { loadBattles(true); loadKampfExtra(true); if (st.page === 'res') loadRes(true); renderKampf(); });
    el.querySelector('[data-kbacc]')?.addEventListener('change', (ev) => { st.acc = ev.target.value; re(); });
    el.querySelectorAll('[data-kbtype]').forEach(b => b.onclick = () => { st.type = b.dataset.kbtype; st.march = ''; st.enemy = ''; re(); });
    el.querySelectorAll('[data-rsgroup]').forEach(i => i.addEventListener('change', () => { const g = (st.rsGroups = st.rsGroups || {}); if (i.value) g[i.dataset.rsgroup] = i.value; else delete g[i.dataset.rsgroup]; re(); }));
    el.querySelectorAll('[data-rsgname]').forEach(i => i.addEventListener('change', () => { const g = (st.rsGroupNames = st.rsGroupNames || {}); g[i.dataset.rsgname] = i.value.trim().slice(0, 20); re(); }));
    el.querySelectorAll('[data-rsname]').forEach(i => i.addEventListener('change', () => { const n = (st.rsNames = st.rsNames || {}), v = i.value.trim().slice(0, 30); if (v) n[i.dataset.rsname] = v; else delete n[i.dataset.rsname]; re(); }));
    el.querySelectorAll('[data-rsgfilter]').forEach(b => b.onclick = () => { st.rsGroup = b.dataset.rsgfilter; re(); });
    el.querySelectorAll('[data-rssort]').forEach(b => b.onclick = () => { const k = b.dataset.rssort, cur = st.rsSort || { k: 'tot', dir: 'desc' }; st.rsSort = { k, dir: cur.k === k ? (cur.dir === 'desc' ? 'asc' : 'desc') : (k === 'name' ? 'asc' : 'desc') }; savePassive(); renderKampf(); });
    el.querySelector('[data-rsaccedit]')?.addEventListener('click', () => { st.rsEditAcc = !st.rsEditAcc; savePassive(); renderKampf(); });
    el.querySelectorAll('[data-rsaccmode]').forEach(b => b.onclick = () => { st.rsAccMode = b.dataset.rsaccmode; savePassive(); renderKampf(); });
    el.querySelector('[data-rskvk]')?.addEventListener('change', (ev) => { st.rsKvk = ev.target.value; st.rsHz = 'kvk'; savePassive(); renderKampf(); });
    el.querySelectorAll('[data-rsavg]').forEach(b => b.onclick = () => { st.rsAvg = +b.dataset.rsavg; savePassive(); renderKampf(); });
    el.querySelectorAll('[data-rsstep]').forEach(b => b.onclick = () => { st.rsStep = b.dataset.rsstep; savePassive(); renderKampf(); });
    el.querySelectorAll('[data-rschart]').forEach(b => b.onclick = () => { st.rsChart = b.dataset.rschart; savePassive(); renderKampf(); });
    el.querySelector('[data-rsgedit]')?.addEventListener('click', () => { st.rsEditGroups = !st.rsEditGroups; savePassive(); renderKampf(); });
    el.querySelector('[data-rslistgroup]')?.addEventListener('change', (ev) => { st.rsListGroup = ev.target.value; savePassive(); renderKampf(); });
    el.querySelectorAll('[data-rshz]').forEach(b => b.onclick = () => { st.rsHz = b.dataset.rshz === 'kvk' ? 'kvk' : +b.dataset.rshz; savePassive(); renderKampf(); });
    el.querySelectorAll('[data-kbaccpick]').forEach(b => b.onclick = () => { const v = b.dataset.kbaccpick; st.acc = st.acc === v ? '' : v; re(); });
    el.querySelector('[data-kblinkid]')?.addEventListener('change', (ev) => { const v = ev.target.value.replace(/\D/g, ''); if (v) { st.linkIds = [...new Set([...(st.linkIds || []), v])]; } re(); });
    el.querySelectorAll('[data-kbunlink]').forEach(b => b.onclick = () => { st.linkIds = (st.linkIds || []).filter(x => String(x) !== b.dataset.kbunlink); re(); });
    el.querySelectorAll('[data-kbpage]').forEach(b => b.onclick = () => { st.page = b.dataset.kbpage; re(); });
    el.querySelectorAll('[data-kbaccbar]').forEach(b => b.onclick = () => { st.acc = b.dataset.kbaccbar; st.accV2 = 1; st.march = ''; st.enemy = ''; const h = st.heat; if (h) { h.fight = null; h.tl = null; h.pop = null; h.iso = null; h.march = ''; try { const mp = hmAk(hmCfg(st)).map; if (mp) h.map = mp; } catch {} } hmView = { s: 1, x: 0, y: 0 }; re(); });
    el.querySelectorAll('[data-hmidname]').forEach(b => b.onclick = () => { const id = b.dataset.hmidname, n = (st.idNames || {})[id] || '';
      hmAsk('Name für ' + id, n, (v) => { st.idNames = { ...(st.idNames || {}) }; if (v) st.idNames[id] = v.slice(0, 24); else delete st.idNames[id]; re(); }, '', 'z. B. Farm 1'); });
    el.querySelectorAll('[data-kblootcat]').forEach(b => b.onclick = () => { st.lootCat = b.dataset.kblootcat; re(); });
    el.querySelectorAll('[data-kbheal]').forEach(b => b.onclick = () => { st.healType = b.dataset.kbheal; re(); });
    el.querySelectorAll('[data-kbkvk]').forEach(b => b.onclick = () => { const k = (st.kvks || [])[+b.dataset.kbkvk]; if (!k) return; st.days = 'custom'; st.from = k.from; st.to = k.to; re(); });
    el.querySelectorAll('[data-kbkvkdel]').forEach(b => b.onclick = () => { (st.kvks || []).splice(+b.dataset.kbkvkdel, 1); re(); });
    el.querySelector('[data-kbkvksave]')?.addEventListener('click', () => { const n = (el.querySelector('[data-kbkvkname]')?.value || '').trim() || 'KvK';
      (st.kvks = st.kvks || []).push({ n, from: st.from, to: st.to }); st.kvks.sort((a, b) => a.from.localeCompare(b.from)); re(); });
    el.querySelectorAll('[data-kbcat]').forEach(b => b.onclick = () => { st.cat = b.dataset.kbcat; re(); });
    el.querySelectorAll('[data-kbpvpmode]').forEach(b => b.onclick = () => { st.pvpMode = b.dataset.kbpvpmode; st.enemy = ''; re(); });
    el.querySelectorAll('[data-kbenemy]').forEach(b => b.onclick = () => { const v = b.dataset.kbenemy; st.enemy = st.enemy === v ? '' : v; re(); });
    el.querySelectorAll('[data-kbnpc]').forEach(s => s.addEventListener('change', () => { const m = (st.npcMap = st.npcMap || {}); m[s.dataset.kbnpc] = s.value; re(); }));
    el.querySelectorAll('[data-kbdays]').forEach(b => b.onclick = () => { const v = b.dataset.kbdays; st.days = v === 'custom' ? 'custom' : +v; re(); });
    el.querySelectorAll('[data-kbdate]').forEach(i => i.addEventListener('change', () => { st[i.dataset.kbdate] = i.value; re(); }));
    el.querySelectorAll('[data-kbtab]').forEach(b => b.onclick = () => { st.tab = b.dataset.kbtab; re(); });
    el.querySelectorAll('[data-kbsort]').forEach(b => b.onclick = () => { const [t, k] = b.dataset.kbsort.split('|'), S = (st.sort = st.sort || {}), cur = S[t];
      S[t] = { k, dir: cur && cur.k === k ? (cur.dir === 'desc' ? 'asc' : 'desc') : (['k', 'march', 'enemy', 'pvp'].includes(k) ? 'asc' : 'desc') }; savePassive(); renderKampf(); });
    $('kbMore')?.addEventListener('click', () => { kbShow += 50; renderKampf(); });
    el.querySelectorAll('[data-kbcard]').forEach(b => b.onclick = () => { const c = (st.cards = st.cards || {}); c[b.dataset.kbcard] = !c[b.dataset.kbcard]; savePassive(); renderKampf(); });
    el.querySelectorAll('[data-kbcum]').forEach(b => b.onclick = () => { st.cum = b.dataset.kbcum === '1'; savePassive(); renderKampf(); });
    el.querySelectorAll('[data-kbmarch]').forEach(sel => sel.addEventListener('change', (ev) => { st.march = ev.target.value; re(); }));
    el.querySelectorAll('[data-kbpick]').forEach(b => b.onclick = () => { st.march = b.dataset.kbpick; savePassive(); renderKampf(); setTimeout(() => $('kbMarchBox')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 0); });
    el.querySelectorAll('[data-kbdetail]').forEach(b => b.onclick = (ev) => { ev.stopPropagation(); const [m, o] = b.dataset.kbdetail.split('|'); kdOpen(m, o); });
    el.querySelectorAll('[data-kbrow]').forEach(tr => tr.onclick = (ev) => { if (ev.target.closest('button,a,input,select')) return; tr.querySelector('[data-kbdetail]')?.click(); });
  }

  // ================= 📊 Analyse: Gegner, Allianzen, Matchups, Leistung, Farm =================
  function anaRows(st) {   // eigene PvP-Kämpfe (Weltkarte, ohne Ark of Osiris, ohne Rally/Garnison) im Zeitraum oben
    return (kbRows || []).filter(r => kbMine(r.player_id) && (!st.acc || String(r.player_id) === st.acc) && kbIsPvp(r) && !kbIsAoo(r) && !(+r.group_size > 1) && kxInRange(r.battle_start))
      .filter(r => !(r.city_x != null && r.pos_x != null && Math.hypot(+r.pos_x - +r.city_x, +r.pos_y - +r.city_y) <= 30));
  }
  function anaSum(rows) { const o = { n: 0, kp: 0, ekp: 0, my: 0, en: 0, dead: 0 }; rows.forEach(r => { o.n++; o.kp += +r.kill_points || 0; o.ekp += +r.enemy_kill_points || 0; o.my += (+r.self_severe || 0) + (+r.self_dead || 0); o.en += (+r.enemy_severe || 0) + (+r.enemy_dead || 0); o.dead += +r.self_dead || 0; });
    o.kpt = o.ekp > 0 ? o.kp / o.ekp : (o.kp ? Infinity : null); o.trade = o.my > 0 ? o.en / o.my : (o.en ? Infinity : null); return o; }
  function kbKdNum(k) { k = +k; return k > 0 ? (k < 10000 ? k + 1000 : k) : null; }   // Bericht: COSId = Königreich − 1000 (79 → 1079, 2489 → 3489 …)
  function anaKd(k) { return k ? '#' + k : ''; }
  var anaKdCache = { src: null, f: null };
  function anaKdOf() {   // Königreich des Gegners; fehlt es im Bericht → vom selben Spieler, sonst von seiner Allianz
    if (anaKdCache.src === kbRows && anaKdCache.f) return anaKdCache.f;
    const P = new Map(), A = new Map(); (kbRows || []).forEach(r => { const k = kbKdNum(r.enemy_kingdom); if (!k) return; if (r.enemy_player_id) P.set(String(r.enemy_player_id), k);
      if (r.enemy_alliance) { const m = A.get(r.enemy_alliance) || new Map(); m.set(k, (m.get(k) || 0) + 1); A.set(r.enemy_alliance, m); } });
    const AA = new Map([...A.entries()].map(([a, m]) => [a, [...m.entries()].sort((x, y) => y[1] - x[1])[0][0]]));
    const f = (r) => kbKdNum(r.enemy_kingdom) || P.get(String(r.enemy_player_id)) || AA.get(r.enemy_alliance) || null;
    anaKdCache = { src: kbRows, f }; return f;
  }
  // ===== Buff abgelaufen (System-Mail „Buff Ended“ aus rok_mails) → blinkender Hinweis + automatisch im Buff-Rechner =====
  var kbBuffs = null, kbBuffLoading = false, kbBuffTimer = null, kbTitle0 = null, kbTitleT = null;
  const KB_BUFF = { exp: ['🪖', 'Army Expansion'], atk: ['⚔️', 'Angriffs-Buff'], def: ['🛡️', 'Verteidigungs-Buff'], shield: ['🕊️', 'Friedensschild'] };
  function kbBuffKind(x) { x = String(x || '').toLowerCase(); return /army expansion/.test(x) ? 'exp' : /peace shield/.test(x) ? 'shield' : /attack/.test(x) ? 'atk' : /defen[cs]e/.test(x) ? 'def' : null; }
  function kbLocalIso(t) { const d = new Date(t), z = (n) => String(n).padStart(2, '0'); return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}T${z(d.getHours())}:${z(d.getMinutes())}`; }
  async function kbBuffLoad() {
    if (kbBuffLoading) return; kbBuffLoading = true;
    try { const db = RokAuth.db?.(); if (!db) throw 0; const since = new Date(Date.now() - 21 * 864e5).toISOString(), cols = 'mail_id,player_id,account,sent_at,content';
      let q = await db.from('rok_mails').select(cols).eq('mail_type', 'System').eq('content->>title', 'Buff Ended').gte('sent_at', since).order('sent_at', { ascending: false }).limit(500);
      if (q.error) q = await db.from('rok_mails').select(cols).eq('mail_type', 'System').gte('sent_at', since).order('sent_at', { ascending: false }).limit(2000);
      if (q.error) throw q.error;
      const seen = new Set();
      kbBuffs = (q.data || []).filter(r => r.content && (r.content.title === 'Buff Ended' || +r.content.subType === 340)).map(r => { const sub = r.content.subTitle || r.content.content || '';
        return { id: String(r.mail_id), pid: String(r.player_id || ''), acc: r.account, t: Date.parse(r.sent_at), kind: kbBuffKind(sub), txt: sub }; })
        .filter(b => b.kind && b.t && !seen.has(b.pid + '|' + b.kind + '|' + Math.round(b.t / 6e4)) && seen.add(b.pid + '|' + b.kind + '|' + Math.round(b.t / 6e4)));
    } catch { kbBuffs = kbBuffs || []; }
    kbBuffLoading = false; kbBuffAlertUI();
  }
  function kbBuffAlertUI() {
    const st = kbSt(), ack = st.buffAck || {}, names = new Map(Object.entries(st.idAuto || {}));
    const L = (kbBuffs || []).filter(b => ['exp', 'atk', 'def'].includes(b.kind) && kbMine(b.pid) && Date.now() - b.t < 3 * 36e5 && !ack[b.id]);
    let box = document.getElementById('kbBuffAlert');
    if (!L.length) { if (box) box.remove(); if (kbTitleT) { clearInterval(kbTitleT); kbTitleT = null; if (kbTitle0 != null) document.title = kbTitle0; } return; }
    if (!document.getElementById('kbBuffCss')) { const c = document.createElement('style'); c.id = 'kbBuffCss'; c.textContent = '@keyframes kbBlink{0%,100%{box-shadow:0 0 0 0 rgba(248,113,113,.9);background:#7f1d1d}50%{box-shadow:0 0 28px 6px rgba(248,113,113,.7);background:#b91c1c}}.kb-blink{animation:kbBlink 1s ease-in-out infinite}'; document.head.appendChild(c); }
    if (!box) { box = document.createElement('div'); box.id = 'kbBuffAlert'; box.className = 'fixed top-3 left-1/2 -translate-x-1/2 z-[9999] flex flex-col gap-2 w-[min(94vw,34rem)]'; document.body.appendChild(box); }
    box.innerHTML = L.map(b => { const k = KB_BUFF[b.kind], n = kbIdName(b.pid, names) || b.acc || b.pid, ago = Math.max(0, Math.round((Date.now() - b.t) / 6e4));
      return `<div class="kb-blink rounded-xl border-2 border-red-300 text-white px-4 py-2.5 flex items-center gap-3 shadow-2xl"><span class="text-2xl">${k[0]}</span><div class="flex-1 min-w-0"><div class="font-bold">${k[1]} <span>abgelaufen!</span></div>
        <div class="text-xs text-red-100 truncate"><span translate="no">${esc(n)}</span> · ${new Date(b.t).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })} <span>Uhr</span> · <span>vor</span> ${ago} min</div></div>
        <button type="button" data-kbbuffok="${esc(b.id)}" class="rounded-lg bg-white/90 text-red-800 font-bold px-3 py-1 text-sm hover:bg-white">✓ OK</button></div>`; }).join('');
    box.querySelectorAll('[data-kbbuffok]').forEach(x => x.onclick = () => { st.buffAck = { ...(st.buffAck || {}), [x.dataset.kbbuffok]: 1 }; savePassive(); kbBuffAlertUI(); });
    if (!kbTitleT) { kbTitle0 = document.title; let on = false; kbTitleT = setInterval(() => { on = !on; document.title = on ? '⚠️ Buff abgelaufen!' : kbTitle0; }, 1000); }
  }
  function kbBuffStart() { if (kbBuffTimer) return; kbBuffLoad(); kbBuffTimer = setInterval(() => { if (document.visibilityState === 'visible') kbBuffLoad(); }, 60000); }
  // ===== ⚡ Schnell-Übersicht ganz links (Heute / letzte Stunde) =====
  function hmQuickHtml(st, h) {
    if (hmSpect()) return '';
    const d0 = new Date(); d0.setHours(0, 0, 0, 0); const acc = hmAcc(h), names = new Map(Object.entries(st.idAuto || {}));
    const P = (from) => hmPoints(st, 'pvp', [from, null], false).filter(p => p.mine && p.k === 'pvp');
    const a = hmSum(P(d0.getTime())), b = hmSum(P(Date.now() - 36e5));
    const tile = (i, l, v, v1, c) => `<div class="rounded-lg bg-ink-900/80 border border-ink-700 px-2 py-1.5"><div class="text-[10px] text-slate-400 whitespace-nowrap">${i} <span>${l}</span></div><div class="text-base font-bold tabular-nums leading-tight ${c || 'text-slate-100'}">${v}</div><div class="text-[10px] text-slate-500 tabular-nums">1 h: ${v1}</div></div>`;
    const kc = (t) => t == null ? 'text-slate-300' : t >= 1 ? 'text-emerald-300' : 'text-red-300';
    return `<div class="lg:col-span-2 xl:col-span-1 rounded-xl border border-gold-500/40 bg-ink-950/70 p-2 xl:sticky xl:top-2">
      <div class="flex items-center justify-between mb-1.5"><div class="text-xs font-bold text-gold-200">⚡ <span>Heute</span></div><div class="text-[10px] text-slate-500 truncate max-w-[6rem]" translate="no">${esc(kbIdName(acc, names) || acc || '')}</div></div>
      <div class="grid grid-cols-3 sm:grid-cols-6 xl:grid-cols-1 gap-1.5">
        ${tile('🏆', 'KP', short(a.kp), short(b.kp), 'text-gold-200')}
        ${tile('🎖️', 'Acclaim', a.acc ? short(a.acc) : '–', b.acc ? short(b.acc) : '–', 'text-sky-200')}
        ${tile('⚖️', 'Trade', hmTradeTxt(a.trade), hmTradeTxt(b.trade), kc(a.trade))}
        ${tile('🔁', 'KP-Trade', hmKptTxt(a.kpt), hmKptTxt(b.kpt), kc(a.kpt))}
        ${tile('⚔️', 'Kämpfe', fmt(a.n), fmt(b.n))}
        ${tile('💀', 'Verluste', short(a.dead + a.sev), short(b.dead + b.sev), 'text-red-200')}
      </div></div>`;
  }
  // ===== 📌 Koalitions-/Allianz-Marker (Test): aus den Allianz-Mails „New … Marker Placed“ =====
  var kbMarks = { rows: null, t: 0, loading: false, err: '' };
  function kbMarksLoad(force) {
    if (kbMarks.loading || (!force && kbMarks.rows && Date.now() - kbMarks.t < 120e3)) return; kbMarks.loading = true;
    (async () => { try { const db = RokAuth.db?.(); if (!db) throw new Error('offline'); const since = new Date(Date.now() - 7 * 864e5).toISOString(), cols = 'mail_id,player_id,account,sent_at,content';
        let q = null; try { q = await db.from('rok_mails').select(cols).eq('mail_type', 'Alliance').ilike('content->>title', '%Marker%').gte('sent_at', since).order('sent_at', { ascending: false }).limit(1000); } catch { q = { error: 1 }; }
        if (q.error) q = await db.from('rok_mails').select(cols).eq('mail_type', 'Alliance').gte('sent_at', since).order('sent_at', { ascending: false }).limit(3000);
        if (q.error) throw q.error;
        const seen = new Set(); kbMarks = { rows: (q.data || []).filter(r => /marker/i.test(r.content?.title || '') && r.content?.kvs).map(r => ({ ...r.content.kvs, title0: r.content.title, sub: r.content.subTitle, t: Date.parse(r.sent_at), by: r.account }))
          .filter(x => { const k = [Math.round(x.x), Math.round(x.y), x.comment, Math.round(x.t / 6e4)].join('|'); if (seen.has(k)) return false; seen.add(k); return true; }), t: Date.now(), loading: false, err: '' }; }
      catch (e) { kbMarks = { rows: kbMarks.rows || [], t: Date.now(), loading: false, err: e?.message || String(e) }; }
      if (R.view === 'battles' && kbSt().page === 'heat') renderKampf(); })();
  }
  function hmMarksHtml(st, h, m) {
    if (hmSpect()) return '';
    if (h.markOpen) kbMarksLoad();
    const L = kbMarks.rows || [], zoneOf = (x) => { if (x.x == null || x.y == null) return ''; const [u, v] = hmXY(+x.x, +x.y, h, m); const z = hmZoneAt(u, v, m, true); return z >= 0 ? hmZName(h, m, z) : ''; };
    const body = !h.markOpen ? '' : !kbMarks.rows ? '<div class="text-xs text-slate-500 py-2">Lädt …</div>' : kbMarks.err ? `<div class="text-xs text-red-300 py-2">${esc(kbMarks.err)}</div>` : !L.length ? '<div class="text-xs text-slate-500 py-2">Keine Marker-Mails in den letzten 7 Tagen.</div>' : `
      <div class="max-h-96 overflow-y-auto"><table class="w-full text-xs"><thead><tr class="text-slate-500 sticky top-0 bg-ink-950"><th class="text-left py-1 pr-2"><span>Zeit</span></th><th class="text-left pr-2"><span>Gesetzt von</span></th><th class="text-left pr-2"><span>Kommentar</span></th><th class="text-right pr-2">X</th><th class="text-right pr-2">Y</th><th class="text-left pr-2"><span>Zone</span></th><th class="text-left pr-2"><span>Art</span></th><th class="text-right pr-2">mark</th><th class="text-right pr-2">title</th><th class="text-left"><span>Postfach</span></th></tr></thead><tbody>
      ${L.map(x => `<tr class="border-t border-ink-800/60"><td class="py-1 pr-2 whitespace-nowrap text-slate-300">${hmWhen(x.t)}</td><td class="pr-2 text-slate-100" translate="no">${esc(x.name || '')}</td><td class="pr-2 text-amber-200" translate="no">${esc(x.comment || '')}</td>
        <td class="pr-2 text-right tabular-nums">${Math.round(+x.x / 6)}</td><td class="pr-2 text-right tabular-nums">${Math.round(+x.y / 6)}</td><td class="pr-2 whitespace-nowrap">${esc(zoneOf(x))}</td><td class="pr-2 text-slate-400 whitespace-nowrap">${/coalition/i.test(x.title0 || '') ? 'Koalition' : /alliance/i.test(x.title0 || '') ? 'Allianz' : esc(x.title0 || '')}</td>
        <td class="pr-2 text-right tabular-nums text-slate-500">${esc(x.mark ?? '')}</td><td class="pr-2 text-right tabular-nums text-slate-500">${esc(x.title ?? '')}</td><td class="text-slate-500" translate="no">${esc(x.by || '')}</td></tr>`).join('')}</tbody></table></div>`;
    return `<details data-hmmarks ${h.markOpen ? 'open' : ''} class="mt-3 rounded-xl border border-violet-500/50 bg-violet-500/5"><summary class="cursor-pointer select-none px-3 py-2 text-sm font-semibold text-violet-200">📌 <span>Marker (Test)</span>${L.length ? ` <span class="rounded-full bg-violet-500/25 border border-violet-400/60 px-2 text-xs tabular-nums">${L.length}</span>` : ''} <span class="text-[11px] text-slate-500 font-normal">– alle Marker-Mails der letzten 7 Tage, roh zum Durchschauen</span></summary><div class="px-3 pb-3">${body}</div></details>`;
  }
  // ===== 🔥 Gegner-Märsche auf dem Feld: aus den Kampfberichten der letzten Minuten (du + alle aus deinem KvK, die den Uploader nutzen) =====
  var kbField = { key: '', rows: null, t: 0, loading: false, err: '' };
  function kbFieldLoad(ids, force) {
    const key = ids.slice().sort().join(','); if (kbField.loading || (!force && kbField.key === key && Date.now() - kbField.t < 55e3)) return;
    kbField.loading = true;
    (async () => { try { const db = RokAuth.db?.(); if (!db) throw new Error('offline'); const since = new Date(Date.now() - 65 * 6e4).toISOString();
        let q = db.from('rok_battles').select('player_id,self_name,mail_id,opponent_id,enemy_player_id,enemy_name,enemy_alliance,enemy_kingdom,enemy_hero1,enemy_hero2,enemy_formation,battle_start,pos_x,pos_y,kill_points,enemy_severe,enemy_dead,is_pvp').gte('battle_start', since).eq('is_pvp', true);
        if (ids.length) q = q.in('player_id', ids);
        const r = await q.order('battle_start', { ascending: false }).limit(5000); if (r.error) throw r.error;
        kbField = { key, rows: r.data || [], t: Date.now(), loading: false, err: '' }; }
      catch (e) { kbField = { key, rows: kbField.rows || [], t: Date.now(), loading: false, err: e?.message || String(e) }; }
      if (R.view === 'battles' && kbSt().page === 'heat') renderKampf(); })();
  }
  function hmFieldHtml(st, h, m) {
    const win = [5, 10, 15, 30, 60].includes(+h.fw) ? +h.fw : 15, acc = hmAcc(h), code = hmKvkCode(h), ids = new Set();   // nur IDs mit derselben C-Nummer wie der gewählte Account
    if (acc) ids.add(String(acc));
    let kvkN = 0; if (code) { const i = hmWInfo[code]; if (!i) hmLoadWInfo(code); else if (!i.loading && i.ids) { i.ids.forEach(x => ids.add(String(x))); kvkN = i.ids.size; } }
    if (h.fieldOpen !== false && ids.size) kbFieldLoad([...ids]);
    const since = Date.now() - win * 6e4, rows = (kbField.rows || []).filter(r => r.is_pvp && +r.enemy_player_id > 0 && Date.parse(r.battle_start) >= since && ids.has(String(r.player_id)));
    const M = new Map(), P = new Set(), rep = new Set();
    rows.forEach(r => { const k = r.enemy_player_id + '|' + (r.enemy_hero1 || '') + '|' + (r.enemy_hero2 || ''), t = Date.parse(r.battle_start);
      const o = M.get(k) || { pid: r.enemy_player_id, name: r.enemy_name, ally: r.enemy_alliance, kd: kbKdNum(r.enemy_kingdom), pair: anaEnemyPair(r), tt: kbTT(r, 'enemy'), t: 0, n: 0, by: new Set(), x: null, y: null };
      o.n++; o.by.add(String(r.player_id)); if (t > o.t) { o.t = t; o.x = r.pos_x; o.y = r.pos_y; } M.set(k, o); P.add(String(r.enemy_player_id)); rep.add(String(r.player_id)); });
    const L = [...M.values()].sort((a, b) => b.t - a.t), zoneOf = (o) => { if (o.x == null || o.y == null) return ''; const [u, v] = hmXY(o.x, o.y, h, m); const z = hmZoneAt(u, v, m, false, o.t); return z >= 0 ? hmBaseName(hmZName(h, m, z)) : ''; };
    const cnt = (f) => { const c = new Map(); L.forEach(o => { const k = f(o); if (k) c.set(k, (c.get(k) || 0) + 1); }); return [...c.entries()].sort((a, b) => b[1] - a[1]); };
    const perP = cnt(o => o.pid), multi = perP.filter(x => x[1] >= 2).length;
    const chip = (t, n) => `<span class="inline-flex items-center gap-1 rounded-lg border border-ink-600 bg-ink-900 px-2 py-0.5 text-xs text-slate-200">${t} <b class="tabular-nums">${n}</b></span>`;
    const ago = (t) => { const mi = Math.max(0, Math.round((Date.now() - t) / 6e4)); return mi < 1 ? '<span>gerade</span>' : `<span>vor</span> ${mi} min`; };
    const tierOf = anaTierOf();
    const body = !kbField.rows ? '<div class="text-xs text-slate-500 py-2">Lädt …</div>' : kbField.err ? `<div class="text-xs text-red-300 py-2">${esc(kbField.err)}</div>` : !L.length ? `<div class="text-xs text-slate-500 py-2">In den letzten ${win} min keine Kämpfe gegen Spieler.</div>` : `
      <div class="flex flex-wrap items-end gap-4 mb-2"><div><div class="text-4xl font-bold text-red-300 tabular-nums leading-none">${fmt(L.length)}</div><div class="text-[11px] text-slate-400">Gegner-Märsche</div></div>
        <div><div class="text-2xl font-bold text-slate-100 tabular-nums leading-none">${fmt(P.size)}</div><div class="text-[11px] text-slate-400">Spieler${multi ? ` · ${multi} <span>mit 2+ Märschen</span>` : ''}</div></div>
        <div class="text-[11px] text-slate-500 pb-0.5">👀 <span>gesehen von</span> <b class="text-slate-300">${fmt(rep.size)}</b> <span>eigenen Leuten</span>${code ? ` · KvK <span translate="no">${esc(code)}</span>: ${fmt(kvkN)} IDs` : ' · <span class="text-amber-300">C-Nummer setzen, damit alle aus deinem KvK mitzählen</span>'}</div></div>
      <div class="flex flex-wrap gap-1.5 mb-2">${cnt(o => o.tt).map(([t, n]) => chip(KB_TT[t][0] + ' <span>' + KB_TT[t][1] + '</span>', n)).join('')}${cnt(o => o.kd ? '#' + o.kd : '').slice(0, 6).map(([k, n]) => chip('👑 ' + k, n)).join('')}${cnt(zoneOf).slice(0, 6).map(([k, n]) => chip('📍 ' + esc(k), n)).join('')}</div>
      <div class="max-h-80 overflow-y-auto pr-1"><table class="w-full text-xs"><thead><tr class="text-slate-500"><th class="text-left py-1">Spieler</th><th class="text-left"><span>Kommandanten</span></th><th class="text-left"><span>Ort</span></th><th class="text-right"><span>Kämpfe</span></th><th class="text-right"><span>zuletzt</span></th></tr></thead><tbody>
      ${L.slice(0, 60).map(o => `<tr class="border-t border-ink-800/60"><td class="py-1 pr-2"><div class="text-slate-100 truncate max-w-[11rem]" translate="no">${o.ally ? `<span class="text-slate-500">[${esc(o.ally)}]</span> ` : ''}${esc(o.name || o.pid)}</div><div class="text-[10px] text-slate-500">${o.kd ? '#' + o.kd : ''} ${anaTierChip(tierOf({ enemy_player_id: o.pid }))}</div></td>
        <td class="pr-2"><div class="flex items-center gap-1"><span class="flex gap-0.5">${hmHeroes(o.pair)}</span>${kbTTChip(o.tt)}</div></td><td class="pr-2 text-slate-300 whitespace-nowrap">${esc(zoneOf(o))}</td><td class="pr-2 text-right tabular-nums">${fmt(o.n)}${o.by.size > 1 ? ` <span class="text-[10px] text-sky-300" title="von mehreren eigenen Leuten gesehen">👀${o.by.size}</span>` : ''}</td><td class="text-right whitespace-nowrap text-slate-400">${ago(o.t)}</td></tr>`).join('')}</tbody></table></div>`;
    return `<details data-hmfield ${h.fieldOpen !== false ? 'open' : ''} class="mt-3 rounded-xl border border-red-500/50 bg-red-500/5"><summary class="cursor-pointer select-none px-3 py-2 text-sm font-semibold text-red-200 flex items-center gap-2">🔥 <span>Gegner-Märsche auf dem Feld</span>${L.length ? ` <span class="rounded-full bg-red-500/25 border border-red-400/60 px-2 text-xs tabular-nums">${L.length}</span>` : ''}
        <span class="ml-auto flex gap-0.5 p-0.5 rounded-lg bg-ink-950 border border-ink-700" onclick="event.stopPropagation()">${[5, 10, 15, 30, 60].map(v => `<button type="button" data-hmfw="${v}" aria-pressed="${win === v}" class="seg-btn rounded-md px-2 py-0.5 text-[11px] font-semibold">${v} min</button>`).join('')}</span>
        <button type="button" data-hmfrel onclick="event.stopPropagation()" class="text-xs text-slate-400 hover:text-gold-300" title="Neu laden">↻</button></summary>
      <div class="px-3 pb-3"><div class="text-[10px] text-slate-500 mb-2">Gezählt aus den Kampfberichten: jeder Gegner mit eigenem Kommandanten-Paar = 1 Marsch. Je mehr Leute aus deinem KvK den Uploader nutzen, desto genauer. Mit „🔴 Live“ aktualisiert es sich jede Minute.</div>${body}</div></details>`;
  }
  // Main oder Farm? KP pro schwer verletzter/toter Einheit: T4 = 10, T5 = 20 (gemessen über alle Kämpfe gegen den Spieler)
  var KB_TIER = { main: ['🐋', 'Main', 'meist T5'], mix: ['🔀', 'Gemischt', 'T4 + T5'], farm: ['🐟', 'Farm', 'meist T4'] };
  var anaTierCache = { src: null, f: null };
  function anaTierOf() {
    if (anaTierCache.src === kbRows && anaTierCache.f) return anaTierCache.f;
    const P = new Map(); (kbRows || []).forEach(r => { if (!kbIsPvp(r)) return; const n = (+r.enemy_severe || 0) + (+r.enemy_dead || 0), kp = +r.kill_points || 0; if (n < 20 || !kp) return;
      const k = String(r.enemy_player_id || r.enemy_name || ''); if (!k) return; const o = P.get(k) || { kp: 0, n: 0 }; o.kp += kp; o.n += n; P.set(k, o); });
    const T = new Map(); P.forEach((o, k) => { if (o.n < 100) return; const v = o.kp / o.n; T.set(k, { t: v >= 17 ? 'main' : v <= 12.5 ? 'farm' : 'mix', v }); });
    const f = (r) => T.get(String(r.enemy_player_id || r.enemy_name || '')) || null;
    anaTierCache = { src: kbRows, f }; return f;
  }
  function anaTierChip(x) { if (!x) return ''; const t = KB_TIER[x.t]; return `<span class="inline-flex items-center gap-0.5 rounded border border-ink-600 px-1 text-[10px] text-slate-300" title="${t[2]} · ${dec(x.v, 1)} KP pro Einheit">${t[0]} <span>${t[1]}</span></span>`; }
  // Online-Zeit aus dem Spiel-Log (Tabelle rok_play, Uploader v24) – nur PC-Client
  var kbPlay = { key: null, rows: null, loading: false, err: '' };
  function kbPlayLoad(ids) {
    const key = (ids || []).slice().sort().join(','); if (kbPlay.key === key && (kbPlay.rows || kbPlay.loading)) return;
    kbPlay = { key, rows: null, loading: true, err: '' };
    (async () => { try { const db = RokAuth.db?.(); if (!db) throw new Error('offline'); let q = db.from('rok_play').select('player_id,start_at,end_at,minutes,marches'); if (ids && ids.length) q = q.in('player_id', ids);
        const r = await q.order('start_at', { ascending: false }).limit(5000); if (r.error) throw r.error; kbPlay.rows = r.data || []; }
      catch (e) { kbPlay.rows = []; kbPlay.err = /rok_play|relation|schema cache/i.test(e?.message || '') ? 'missing' : (e?.message || String(e)); }
      kbPlay.loading = false; if (R.view === 'battles') renderKampf(); })();
  }
  function anaOnline(st, mineAll) {
    const ids = st.acc ? [String(st.acc)] : [...kbMyIds()]; kbPlayLoad(ids);
    const box = (inner) => `<div class="rounded-xl border border-ink-700 bg-ink-950/60 p-3 mt-5"><h4 class="font-semibold text-slate-100">🖥️ <span>Online-Zeit</span> <span class="text-[11px] text-slate-500 font-normal">– aus dem Spiel-Log, nur PC-Client (nicht MuMu)</span></h4>${inner}</div>`;
    if (kbPlay.loading || !kbPlay.rows) return box('<div class="text-xs text-slate-500 py-2">Lädt …</div>');
    if (kbPlay.err === 'missing') return box('<div class="text-xs text-amber-300 py-2">Tabelle rok_play fehlt – SQL v24 ausführen und Uploader v24 laufen lassen.</div>');
    const S = kbPlay.rows.filter(r => r.start_at && kxInRange(r.start_at));
    if (!S.length) return box('<div class="text-xs text-slate-500 py-2">Noch keine Sitzungen im Zeitraum. Der Uploader v24 liest das Spiel-Log alle 10 Minuten.</div>');
    const day = (t) => { const d = new Date(t); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
    const D = new Map(); S.forEach(r => { const k = day(r.start_at), o = D.get(k) || { m: 0, n: 0, s: 0, kp: 0 }; o.m += +r.minutes || 0; o.n += +r.marches || 0; o.s++; D.set(k, o); });
    mineAll.forEach(r => { if (!kbIsPvp(r) || kbIsAoo(r)) return; const o = D.get(day(r.battle_start)); if (o) o.kp += +r.kill_points || 0; });
    const L = [...D.entries()].sort((a, b) => a[0] < b[0] ? -1 : 1).slice(-21), mx = Math.max(1, ...L.map(x => x[1].m));
    const totM = S.reduce((a, r) => a + (+r.minutes || 0), 0), totN = S.reduce((a, r) => a + (+r.marches || 0), 0), kpOn = L.reduce((a, x) => a + x[1].kp, 0), mOn = L.reduce((a, x) => a + x[1].m, 0);
    const hm = (m) => m >= 60 ? Math.floor(m / 60) + ' h ' + String(Math.round(m % 60)).padStart(2, '0') : Math.round(m) + ' min';
    const tile = (i, l, v, sub) => `<div class="rounded-lg border border-ink-700 p-2"><div class="text-[11px] text-slate-400">${i} <span>${l}</span></div><div class="text-lg font-bold text-slate-100 tabular-nums">${v}</div>${sub ? `<div class="text-[10px] text-slate-500">${sub}</div>` : ''}</div>`;
    return box(`<div class="grid grid-cols-2 sm:grid-cols-4 gap-2 my-2">${tile('⏱️', 'Online gesamt', hm(totM), fmt(S.length) + ' <span>Sitzungen</span>')}${tile('📅', 'Pro Tag', hm(totM / Math.max(1, D.size)), fmt(D.size) + ' <span>Tage</span>')}
        ${tile('🏆', 'KP pro Online-Stunde', mOn ? short(kpOn / (mOn / 60)) : '–')}${tile('🏹', 'Märsche gesendet', fmt(totN), '<span>laut Spiel-Log</span>')}</div>
      <div class="flex items-end gap-1 h-28 mt-3">${L.map(([k, o]) => `<div class="flex-1 flex flex-col items-center justify-end h-full" title="${k}: ${hm(o.m)} online · ${o.s} Sitzungen · ${o.n} Märsche · ${short(o.kp)} KP"><span class="text-[9px] text-slate-400 tabular-nums">${(o.m / 60).toFixed(1)}</span><div class="w-full rounded-t bg-sky-400/70" style="height:${Math.max(3, o.m / mx * 100)}%"></div></div>`).join('')}</div>
      <div class="flex gap-1 mt-0.5">${L.map(([k]) => `<span class="flex-1 text-center text-[9px] text-slate-600">${k.slice(8)}.${k.slice(5, 7)}</span>`).join('')}</div>
      <div class="text-[10px] text-slate-500 mt-1">Balken = Stunden online pro Tag · Mauszeiger = Details (KP, Märsche)</div>`);
  }
  function anaHours(list, col, label, sub) {   // 24 Balken (0–23 Uhr) + Hauptzeit (beste 3 Stunden)
    const hr = new Array(24).fill(0); list.forEach(r => { const t = Date.parse(r.battle_start); if (t) hr[new Date(t).getHours()]++; }); const mx = Math.max(1, ...hr);
    let best = -1, bi = 0; for (let i = 0; i < 24; i++) { const v = hr[i] + hr[(i + 1) % 24] + hr[(i + 2) % 24]; if (v > best) { best = v; bi = i; } }
    return `<div class="flex items-center gap-3 py-1.5 border-t border-ink-800/60 first:border-0"><div class="w-36 shrink-0"><div class="text-xs font-semibold text-slate-200 truncate" translate="no">${label}</div><div class="text-[10px] text-slate-500">${sub || ''}${list.length ? ` · <span>Hauptzeit</span> <b class="text-slate-300">${bi}–${(bi + 3) % 24} <span>Uhr</span></b>` : ''}</div></div>
      <div class="flex-1"><div class="flex items-end gap-0.5 h-10">${hr.map((v, i) => `<span title="${i}–${i + 1} Uhr: ${v}" class="flex-1 rounded-sm" style="height:${v ? Math.max(8, v / mx * 100) : 4}%;background:${v ? col : '#1e2533'}"></span>`).join('')}</div>
      <div class="flex text-[9px] text-slate-600 mt-0.5">${hr.map((_, i) => `<span class="flex-1 text-center">${i % 3 ? '' : i}</span>`).join('')}</div></div></div>`;
  }
  function anaEnemyPair(r) { return [r.enemy_hero1, r.enemy_hero2].filter(Boolean).join(' / ') || '–'; }
  function anaHtml(st, top) {
    const tierOf = anaTierOf(), rows0 = anaRows(st), tf = st.anaTier || '', rows = tf ? rows0.filter(r => (tierOf(r)?.t || 'unk') === tf) : rows0, tab = st.anaTab || 'nem', th = 'py-1.5 pr-3 text-[11px] font-medium text-slate-500', td = 'py-1.5 pr-3 tabular-nums';
    const kptC = (v) => v == null ? 'text-slate-400' : v >= 1 ? 'text-emerald-300' : 'text-red-300';
    const tabs = [['nem', '🎯', 'Gegner'], ['ally', '👑', 'Königreiche'], ['time', '🕒', 'Aktive Zeiten'], ['match', '⚔️', 'Matchups'], ['troop', '🪖', 'Truppen'], ['perf', '📈', 'Leistung'], ['farm', '🪓', 'Farm']];
    let body = '';
    if (!rows.length && tab !== 'farm') body = '<div class="text-sm text-slate-500 py-6 text-center">Keine PvP-Kämpfe im Zeitraum.</div>';
    else if (tab === 'nem') {   // Nemesis, leichte Ziele, Finger weg
      const M = new Map(); rows.forEach(r => { const k = String(r.enemy_player_id || r.enemy_name); const o = M.get(k) || { name: r.enemy_name, ally: r.enemy_alliance, kd: anaKdOf()(r), tier: tierOf(r), rows: [] }; o.rows.push(r); M.set(k, o); });
      const L = [...M.values()].map(o => ({ ...o, w: anaSum(o.rows) })).filter(o => o.name);
      const tbl = (title, sub, list, col) => `<div class="rounded-xl border ${col} bg-ink-950/60 p-3"><div class="font-semibold text-slate-100">${title}</div><div class="text-[11px] text-slate-500 mb-2">${sub}</div>
        <table class="w-full text-xs"><thead><tr><th class="${th} text-left">Gegner</th><th class="${th} text-right">Kämpfe</th><th class="${th} text-right">🏆 KP</th><th class="${th} text-right">🗡️ Gegner-KP</th><th class="${th} text-right">🔁 KP-Trade</th></tr></thead><tbody>
        ${list.slice(0, 10).map(o => `<tr class="border-t border-ink-800/60"><td class="py-1.5 pr-3"><span class="text-red-200" translate="no">${o.ally ? '[' + esc(o.ally) + '] ' : ''}${esc(o.name)}</span>${o.kd ? ` <span class="text-[10px] text-slate-500">${anaKd(o.kd)}</span>` : ''} ${anaTierChip(o.tier)}</td><td class="${td} text-right">${fmt(o.w.n)}</td><td class="${td} text-right text-gold-200">${short(o.w.kp)}</td><td class="${td} text-right text-red-200">${short(o.w.ekp)}</td><td class="${td} text-right ${kptC(o.w.kpt)}">${hmKptTxt(o.w.kpt)}</td></tr>`).join('') || '<tr><td class="py-2 text-slate-500" colspan="5">–</td></tr>'}</tbody></table></div>`;
      const min = (o) => o.w.n >= 3;
      body = `<div class="grid lg:grid-cols-3 gap-3">
        ${tbl('😈 Nemesis', 'Wer dir die meisten KP abgenommen hat', [...L].sort((a, b) => b.w.ekp - a.w.ekp), 'border-red-500/40')}
        ${tbl('🍗 Leichte Ziele', 'Bester KP-Trade (ab 3 Kämpfen)', L.filter(min).sort((a, b) => (b.w.kpt === Infinity ? 1e9 : b.w.kpt || 0) - (a.w.kpt === Infinity ? 1e9 : a.w.kpt || 0)), 'border-emerald-500/40')}
        ${tbl('⛔ Finger weg', 'Schlechtester KP-Trade (ab 3 Kämpfen)', L.filter(min).sort((a, b) => (a.w.kpt ?? 0) - (b.w.kpt ?? 0)), 'border-amber-500/40')}</div>`;
    } else if (tab === 'ally' || tab === 'time') {   // Königreiche (ohne unbekannte) · Aktive Zeiten gegenüber den Königreichen
      const kdOf = anaKdOf(), M = new Map(); rows.forEach(r => { const k = kdOf(r); if (!k) return; const o = M.get(k) || { kd: k, rows: [], pl: new Set(), pt: new Map() }; o.rows.push(r); const pk = r.enemy_player_id || r.enemy_name; o.pl.add(pk); o.pt.set(pk, tierOf(r)?.t || 'unk'); M.set(k, o); });
      const L = [...M.values()].map(o => ({ ...o, w: anaSum(o.rows), mains: [...o.pt.values()].filter(x => x === 'main').length })).sort((a, b) => b.w.n - a.w.n), mx = Math.max(1, ...L.map(o => o.w.n));
      if (!L.length) body = '<div class="text-sm text-slate-500 py-6 text-center">Keine Kämpfe mit bekanntem Königreich im Zeitraum.</div>';
      else if (tab === 'ally') {
        body = `<div class="overflow-x-auto"><table class="w-full text-sm"><thead><tr><th class="${th} text-left">Königreich</th><th class="${th} text-right">Spieler</th><th class="${th} text-right" title="Main-Accounts (meist T5)">🐋 <span>davon Main</span></th><th class="${th} text-right">Kämpfe</th><th class="${th} text-right">🏆 KP</th><th class="${th} text-right">🗡️ Gegner-KP</th><th class="${th} text-right">🔁 KP-Trade</th><th class="${th} text-right">⚖️ Trade</th></tr></thead><tbody>
        ${L.map(o => `<tr class="border-t border-ink-800/60"><td class="py-2 pr-3"><div class="font-bold text-red-200" translate="no">👑 #${o.kd}</div><div class="h-1 rounded bg-ink-800 mt-1 w-32"><div class="h-1 rounded bg-red-400/70" style="width:${o.w.n / mx * 100}%"></div></div></td>
          <td class="${td} text-right">${fmt(o.pl.size)}</td><td class="${td} text-right text-sky-200 whitespace-nowrap">${fmt(o.mains)} <span class="text-[10px] text-slate-500">(${Math.round(o.mains / Math.max(1, o.pl.size) * 100)} %)</span></td><td class="${td} text-right">${fmt(o.w.n)}</td><td class="${td} text-right text-gold-200">${short(o.w.kp)}</td><td class="${td} text-right text-red-200">${short(o.w.ekp)}</td><td class="${td} text-right font-semibold ${kptC(o.w.kpt)}">${hmKptTxt(o.w.kpt)}</td><td class="${td} text-right ${kptC(o.w.trade)}">${hmTradeTxt(o.w.trade)}</td></tr>`).join('')}</tbody></table></div>`;
      } else {
        const mineAll = (kbRows || []).filter(r => kbMine(r.player_id) && (!st.acc || String(r.player_id) === st.acc) && kxInRange(r.battle_start));
        const hrs = (list) => { const h = new Array(24).fill(0); list.forEach(r => { const t = Date.parse(r.battle_start); if (t) h[new Date(t).getHours()]++; }); return h; };
        const peak = (h) => { let best = -1, bi = 0; for (let i = 0; i < 24; i++) { const v = h[i] + h[(i + 1) % 24] + h[(i + 2) % 24]; if (v > best) { best = v; bi = i; } } return best > 0 ? `${bi}–${(bi + 3) % 24}` : '–'; };
        const BL = [[0, 6, '🌙', 'Nacht', '0–6'], [6, 12, '🌅', 'Morgen', '6–12'], [12, 18, '☀️', 'Mittag', '12–18'], [18, 24, '🌆', 'Abend', '18–24']];
        const strip = (h, rgb) => { const m = Math.max(1, ...h); return `<div class="flex gap-px">${h.map((v, i) => `<span title="${i}–${i + 1} Uhr: ${v}" class="w-3.5 h-6 rounded-sm" style="background:${v ? `rgba(${rgb},${.15 + v / m * .85})` : '#151b26'}"></span>`).join('')}</div>`; };
        const myH = hrs(mineAll);
        const row = (label, list, rgb, isMe) => { const h = hrs(list), n = list.length;
          return `<tr class="border-t border-ink-800/60 ${isMe ? 'bg-gold-500/5' : ''}"><td class="py-2 pr-3 font-bold whitespace-nowrap ${isMe ? 'text-gold-200' : 'text-red-200'}" translate="no">${label}</td><td class="py-2 pr-3">${strip(h, rgb)}</td><td class="${td} text-right whitespace-nowrap"><b>${peak(h)}</b> <span class="text-[10px] text-slate-500">Uhr</span></td>
            ${BL.map(([a, b]) => { const L2 = list.filter(r => { const x = new Date(r.battle_start).getHours(); return x >= a && x < b; }), w = isMe ? null : anaSum(L2), pct = n ? Math.round(L2.length / n * 100) : 0;
              return `<td class="py-2 px-1.5 text-center tabular-nums"><div class="text-xs ${pct >= 35 ? 'text-slate-100 font-bold' : 'text-slate-400'}">${pct} %</div>${w && w.n ? `<div class="text-[10px] ${kptC(w.kpt)}">🔁 ${hmKptTxt(w.kpt)}</div>` : ''}</td>`; }).join('')}</tr>`; };
        body = `<div class="text-[11px] text-slate-500 mb-2">Wann gekämpft wird – deine Zeit (0–23 Uhr). Je heller das Kästchen, desto mehr Kämpfe in der Stunde. Rechts: Anteil der Kämpfe pro Tageszeit und dein KP-Trade gegen das Königreich zu dieser Zeit.</div>
          <div class="overflow-x-auto"><table class="text-sm"><thead><tr><th class="${th} text-left">Königreich</th><th class="${th} text-left"><div class="flex gap-px">${myH.map((_, i) => `<span class="w-3.5 text-center text-[9px]">${i % 3 ? '' : i}</span>`).join('')}</div></th><th class="${th} text-right">Hauptzeit</th>${BL.map(x => `<th class="px-1.5 text-center text-[11px] font-medium text-slate-500 whitespace-nowrap">${x[2]} <span>${x[3]}</span><div class="text-[9px] text-slate-600">${x[4]}</div></th>`).join('')}</tr></thead>
          <tbody>${row('🙋 Du', mineAll, '245,197,66', true)}${row('😈 Alle', L.flatMap(o => o.rows), '248,113,113')}${L.slice(0, 15).map(o => row('👑 #' + o.kd, o.rows, '248,113,113')).join('')}</tbody></table></div>${anaOnline(st, mineAll)}`;
      }
    } else if (tab === 'match') {   // dein Marsch gegen ihre Paare + Gegner-Meta
      const mine = [...new Set(rows.map(kbMarchOf))].map(k => [k, rows.filter(r => kbMarchOf(r) === k).length]).sort((a, b) => b[1] - a[1]).slice(0, 8).map(x => x[0]);
      const ep = new Map(); rows.forEach(r => { const k = anaEnemyPair(r); const o = ep.get(k) || []; o.push(r); ep.set(k, o); });
      const meta = [...ep.entries()].map(([k, v]) => { const c = {}; v.forEach(r => { const t = kbTT(r, 'enemy'); if (t) c[t] = (c[t] || 0) + 1; }); return { k, w: anaSum(v), t: Object.keys(c).sort((a, b) => c[b] - c[a])[0] }; }).sort((a, b) => b.w.n - a.w.n);
      const cols = meta.slice(0, 8).map(x => x.k), ttOf = (k, side) => { const c = {}; rows.filter(r => (side === 'self' ? kbMarchOf(r) : anaEnemyPair(r)) === k).forEach(r => { const t = kbTT(r, side); if (t) c[t] = (c[t] || 0) + 1; }); return Object.keys(c).sort((a, b) => c[b] - c[a])[0]; };
      const bg = (w) => { const v = w.kpt === Infinity ? 9 : w.kpt || 0; return v >= 1 ? `rgba(16,185,129,${Math.min(.6, .15 + (v - 1) * .2)})` : `rgba(239,68,68,${Math.min(.6, .15 + (1 - v) * .5)})`; };
      const cell = (a, b) => { const w = anaSum(rows.filter(r => kbMarchOf(r) === a && anaEnemyPair(r) === b)); if (!w.n) return '<td class="py-1 px-1 text-center text-slate-700">·</td>';
        return `<td class="py-1.5 px-1 text-center tabular-nums rounded-md" style="background:${bg(w)}" title="${esc(a)} gegen ${esc(b)}: ${w.n} Kämpfe · deine KP ${short(w.kp)} · ihre KP an dir ${short(w.ekp)}"><b class="text-sm">${hmKptTxt(w.kpt)}</b><div class="text-[9px] text-slate-200/70">${w.n} <span>Kämpfe</span></div></td>`; };
      const head = (k, side) => `<div class="flex flex-col items-center gap-0.5 w-24"><span class="flex gap-0.5">${hmHeroes(k)}</span><span class="text-[10px] leading-tight text-slate-300 text-center" translate="no">${esc(k).replace(' / ', '<br>')}</span>${kbTTChip(ttOf(k, side))}</div>`;
      // Beste Konter: gegen jedes häufige Gegner-Paar dein bester Marsch (ab 3 Kämpfen)
      const tips = meta.slice(0, 8).map(x => { const best = mine.map(a => ({ a, w: anaSum(rows.filter(r => kbMarchOf(r) === a && anaEnemyPair(r) === x.k)) })).filter(o => o.w.n >= 3).sort((p, q) => (q.w.kpt === Infinity ? 1e9 : q.w.kpt || 0) - (p.w.kpt === Infinity ? 1e9 : p.w.kpt || 0))[0]; return best ? { e: x.k, ...best } : null; }).filter(Boolean);
      body = `<div class="rounded-xl border border-violet-500/30 bg-violet-500/5 p-3 mb-3 text-xs text-slate-300 grid sm:grid-cols-2 lg:grid-cols-4 gap-2">
          <div>🙋 <b>Zeilen</b> = <span>deine Märsche</span></div><div>😈 <b>Spalten</b> = <span>Gegner-Paare (die häufigsten)</span></div>
          <div>🔁 <b>Zahl</b> = <span>KP-Trade: deine KP für 1 KP, die der Gegner an dir macht</span></div>
          <div class="flex items-center gap-1.5"><span class="inline-block w-4 h-4 rounded" style="background:rgba(16,185,129,.5)"></span><span>du gewinnst</span> <span class="inline-block w-4 h-4 rounded ml-2" style="background:rgba(239,68,68,.5)"></span><span>du verlierst</span> · ∞ = <span>keine KP an dir</span></div></div>
        <div class="overflow-x-auto"><table class="text-xs border-separate border-spacing-1"><thead><tr><th class="text-left align-bottom p-1"><div class="text-[11px] text-slate-400 leading-tight">🙋 <span>Dein Marsch</span> ↓<br>😈 <span>Gegner</span> →</div></th>${cols.map(c => `<th class="p-1 align-bottom">${head(c, 'enemy')}</th>`).join('')}</tr></thead>
        <tbody>${mine.map(a => `<tr><th class="pr-2 text-left"><div class="flex items-center gap-1.5"><span class="flex gap-0.5 shrink-0">${hmHeroes(a)}</span><div><div class="text-[11px] leading-tight text-slate-200" translate="no">${esc(a).replace(' / ', '<br>')}</div>${kbTTChip(ttOf(a, 'self'))}</div></div></th>${cols.map(b => cell(a, b)).join('')}</tr>`).join('')}</tbody></table></div>
        ${tips.length ? `<h4 class="font-semibold text-slate-200 mt-5 mb-1">💡 <span>Bester Konter</span> <span class="text-[11px] text-slate-500 font-normal">– dein Marsch mit dem besten KP-Trade gegen jedes Paar (ab 3 Kämpfen)</span></h4>
        <div class="grid sm:grid-cols-2 lg:grid-cols-4 gap-2">${tips.map(t => `<div class="rounded-xl border border-ink-700 bg-ink-950/60 p-2.5"><div class="flex items-center gap-1.5"><span class="flex gap-0.5">${hmHeroes(t.e)}</span><span class="text-[10px] text-red-200 truncate" translate="no">${esc(t.e)}</span></div>
          <div class="text-[10px] text-slate-500 my-1">↓ <span>nimm</span></div><div class="flex items-center gap-1.5"><span class="flex gap-0.5">${hmHeroes(t.a)}</span><span class="text-[10px] text-gold-200 truncate" translate="no">${esc(t.a)}</span></div>
          <div class="text-[11px] mt-1"><b class="${kptC(t.w.kpt)}">🔁 ${hmKptTxt(t.w.kpt)}</b> <span class="text-slate-500">· ${fmt(t.w.n)} <span>Kämpfe</span></span></div></div>`).join('')}</div>` : ''}
        <h4 class="font-semibold text-slate-200 mt-5 mb-1">👁️ Gegner-Meta <span class="text-[11px] text-slate-500 font-normal">– welche Paare am häufigsten gegen dich laufen</span></h4>
        <div class="grid sm:grid-cols-2 lg:grid-cols-3 gap-2">${meta.slice(0, 12).map(x => `<div class="flex items-center gap-2 rounded-xl border border-ink-700 bg-ink-950/60 p-2"><span class="flex gap-0.5">${hmHeroes(x.k)}</span><div class="min-w-0 flex-1"><div class="text-xs text-slate-200 truncate"><span translate="no">${esc(x.k)}</span> ${kbTTChip(x.t)}</div><div class="text-[11px] text-slate-400">${fmt(x.w.n)}× · 🗡️ ${short(x.w.ekp)} · <span class="${kptC(x.w.kpt)}">🔁 ${hmKptTxt(x.w.kpt)}</span></div></div></div>`).join('')}</div>`;
    } else if (tab === 'troop') {   // Truppentyp gegen Truppentyp (geschätzt)
      const T4 = ['inf', 'cav', 'arch', 'siege'], known = rows.filter(r => kbTT(r, 'self') && kbTT(r, 'enemy'));
      const cell = (a, b) => { const w = anaSum(known.filter(r => kbTT(r, 'self') === a && kbTT(r, 'enemy') === b)); if (!w.n) return '<td class="py-2 px-2 text-center text-slate-700">·</td>';
        const v = w.kpt === Infinity ? 9 : w.kpt || 0, bg = v >= 1 ? `rgba(16,185,129,${Math.min(.6, .15 + (v - 1) * .2)})` : `rgba(239,68,68,${Math.min(.6, .15 + (1 - v) * .5)})`;
        return `<td class="py-2 px-2 text-center tabular-nums" style="background:${bg}" title="${w.n} Kämpfe · ${short(w.kp)} KP gegen ${short(w.ekp)} · Trade ${hmTradeTxt(w.trade)}"><b>${hmKptTxt(w.kpt).replace(' : 1', '')}</b><div class="text-[10px] text-slate-300/70">${w.n}× · ${hmTradeTxt(w.trade)}</div></td>`; };
      const card = (side, title) => `<div class="rounded-xl border border-ink-700 bg-ink-950/60 p-3"><div class="font-semibold text-slate-100 mb-2">${title}</div><div class="grid grid-cols-2 gap-2">${T4.map(t => { const L = rows.filter(r => kbTT(r, side) === t), w = anaSum(L);
        return `<div class="rounded-lg border border-ink-700 p-2"><div class="text-sm">${KB_TT[t][0]} <span>${KB_TT[t][1]}</span></div><div class="text-[11px] text-slate-400">${fmt(w.n)} <span>Kämpfe</span> · ${rows.length ? Math.round(w.n / rows.length * 100) : 0} %</div><div class="text-[11px]"><span class="text-gold-200">🏆 ${short(w.kp)}</span> · <span class="${kptC(w.kpt)}">🔁 ${w.n ? hmKptTxt(w.kpt) : '–'}</span></div></div>`; }).join('')}</div>
        <div class="text-[10px] text-slate-500 mt-1">${fmt(rows.filter(r => !kbTT(r, side)).length)} <span>Kämpfe ohne erkennbaren Typ</span></div></div>`;
      body = `<div class="text-[11px] text-slate-500 mb-2">Truppentyp geschätzt: Rüstung Pincer = Infanterie, Wedge = Bogen, Delta = Kavallerie, V-Formation = Belagerung – sonst nach Hauptkommandant.${kbFmCols ? '' : ' <span class="text-amber-300">Formation noch nicht in der Datenbank (SQL v20 + Uploader v20) – nur nach Kommandant.</span>'}</div>
        <div class="grid lg:grid-cols-2 gap-3 mb-4">${card('self', '🙋 Deine Truppen')}${card('enemy', '😈 Gegner-Truppen')}</div>
        <h4 class="font-semibold text-slate-200 mb-1">⚔️ Typ gegen Typ <span class="text-[11px] text-slate-500 font-normal">– Zeile = du, Spalte = Gegner · Zahl = KP-Trade</span></h4>
        <div class="overflow-x-auto"><table class="text-xs border-separate border-spacing-1"><thead><tr><th></th>${T4.map(t => `<th class="px-2 text-slate-300 font-medium">${KB_TT[t][0]} <span>${KB_TT[t][1]}</span></th>`).join('')}</tr></thead>
        <tbody>${T4.map(a => `<tr><th class="pr-2 text-left text-slate-300 font-medium whitespace-nowrap">${KB_TT[a][0]} <span>${KB_TT[a][1]}</span></th>${T4.map(b => cell(a, b)).join('')}</tr>`).join('')}</tbody></table></div>`;
    } else if (tab === 'perf') {   // Müdigkeitskurve, Hochrechnung, Rekorde, Abzeichen
      const R = rows.slice().sort((a, b) => Date.parse(a.battle_start) - Date.parse(b.battle_start)), T = R.map(r => Date.parse(r.battle_start));
      const B = [[0, 15, '0–15 min'], [15, 30, '15–30 min'], [30, 60, '30–60 min'], [60, 120, '1–2 h'], [120, 1e9, '> 2 h']].map(b => ({ b, rows: [] }));
      let s0 = null, last = -1e15; R.forEach((r, i) => { const t = T[i]; if (t - last > 45 * 6e4) s0 = t; last = t; const m = (t - s0) / 6e4; B.find(x => m >= x.b[0] && m < x.b[1]).rows.push(r); });
      const fat = B.map(x => ({ l: x.b[2], w: anaSum(x.rows) }));
      // Rekorde
      let best10 = 0, bi = 0, fast = null; for (let i = 0, j = 0, sum = 0; i < R.length; i++) { sum += +R[i].kill_points || 0; while (T[i] - T[j] > 10 * 6e4) { sum -= +R[j].kill_points || 0; j++; } if (sum > best10) { best10 = sum; bi = T[i]; } }
      for (let i = 0, j = 0, sum = 0; i < R.length; i++) { sum += +R[i].kill_points || 0; while (sum - (+R[j].kill_points || 0) >= 1e7 && j < i) { sum -= +R[j].kill_points || 0; j++; } if (sum >= 1e7) { const d = T[i] - T[j]; if (fast == null || d < fast.d) fast = { d, t: T[j] }; } }
      const S = new Map(); R.forEach(r => { const k = String(r.parent_id || r.mail_id); S.set(k, (S.get(k) || 0) + (+r.kill_points || 0)); }), bigS = Math.max(0, ...S.values());
      let run = 0, bestRun = 0; R.forEach(r => { if (+r.self_dead > 0) run = 0; else { run++; bestRun = Math.max(bestRun, run); } });
      const days = new Map(); R.forEach((r, i) => { const d = new Date(T[i]).toLocaleDateString('de-DE'); days.set(d, (days.get(d) || 0) + (+r.kill_points || 0)); }), bestDay = [...days.entries()].sort((a, b) => b[1] - a[1])[0];
      const tot = anaSum(R);
      const hcfg = hmCfg(st), ks = hmStart(hcfg), kA = ks ? Date.parse(ks + 'T00:00:00Z') : null, dEl = kA ? Math.max(1, (Date.now() - kA) / 864e5) : null, kvkKp = kA ? R.filter((r, i) => T[i] >= kA).reduce((a, r) => a + (+r.kill_points || 0), 0) : 0, proj = dEl && dEl < 50 ? kvkKp / dEl * 50 : null;
      const rec = (i, l, v, sub) => `<div class="rounded-xl border border-gold-500/30 bg-ink-950/60 p-3"><div class="text-[11px] text-slate-400">${i} ${l}</div><div class="text-xl font-bold text-gold-200 tabular-nums">${v}</div><div class="text-[10px] text-slate-500">${sub || ''}</div></div>`;
      const MR = (kbRows || []).filter(r => kbMine(r.player_id) && (!st.acc || String(r.player_id) === st.acc) && kbIsPvp(r) && !kbIsAoo(r) && kxInRange(r.battle_start));   // inkl. Rally/Garnison
      const mKp = MR.reduce((a, r) => a + (+r.kill_points || 0), 0), mAc = MR.reduce((a, r) => a + (+r.acclaim || 0), 0), mN = MR.length;
      const accSteps = Array.from({ length: Math.max(8, Math.floor(mAc / 5e5) + 4) }, (_, i) => (i + 1) * 5e5);
      const track = (icon, title, sub, val, steps, f, col) => { const done = steps.filter(x => x <= val), nx = steps.find(x => x > val), prev = done.length ? done[done.length - 1] : 0, pct = nx ? Math.max(2, (val - prev) / (nx - prev) * 100) : 100;
        const lo = Math.max(0, done.length - 3), win = steps.slice(lo, lo + 7);
        return `<div class="rounded-xl border border-ink-700 bg-ink-950/60 p-3"><div class="flex items-start justify-between gap-2"><div><div class="font-semibold text-slate-100">${icon} <span>${title}</span></div><div class="text-[10px] text-slate-500">${sub}</div></div>
          <div class="text-right"><div class="text-xl font-bold tabular-nums" style="color:${col}">${f(val)}</div><div class="text-[10px] text-slate-400">${done.length} / ${steps.length > 30 ? '∞' : steps.length} <span>erreicht</span></div></div></div>
          <div class="mt-2 h-2.5 rounded-full bg-ink-800 overflow-hidden"><div class="h-2.5 rounded-full" style="width:${pct}%;background:${col}"></div></div>
          <div class="text-[10px] text-slate-400 mt-1">${nx ? `<span>Nächstes Ziel</span> <b class="text-slate-200">${f(nx)}</b> · <span>noch</span> ${f(nx - val)}` : '🏆 <span>Alle geschafft!</span>'}</div>
          <div class="flex flex-wrap gap-1 mt-2">${win.map(x => { const ok = x <= val, nxt = x === nx; return `<span class="rounded-md border px-1.5 py-0.5 text-[10px] tabular-nums ${ok ? 'border-gold-400/70 bg-gold-500/15 text-gold-100' : nxt ? 'border-sky-400/70 text-sky-200' : 'border-ink-700 text-slate-600'}">${ok ? '✓ ' : nxt ? '▶ ' : ''}${f(x)}</span>`; }).join('')}</div></div>`; };
      const sec = (t, sub) => `<h4 class="font-semibold text-slate-100 mt-5 mb-1 text-base">${t} <span class="text-[11px] text-slate-500 font-normal">${sub || ''}</span></h4>`;
      const badges = [[bigS >= 1e7, '💥', 'Flex-König', 'Battle Streak ab 10 Mio.'], [best10 >= 5e6, '⚡', 'Blitzkrieg', '5 Mio. KP in 10 min'], [(tot.kpt || 0) >= 2, '🔁', 'Trader', 'KP-Trade ab 2 : 1']];
      body = `${sec('📊 <span>Überblick</span>', '– Zeitraum oben')}
        <div class="grid sm:grid-cols-3 gap-2">${rec('🏆', 'KP im Zeitraum', short(tot.kp), fmt(tot.n) + ' <span>Kämpfe</span>')}${rec('🔁', 'KP-Trade im Zeitraum', hmKptTxt(tot.kpt))}${rec('🔮', 'Hochrechnung KvK-Ende', proj ? '~' + short(proj) : '–', proj ? `<span>bei</span> ${short(kvkKp)} <span>nach</span> ${Math.floor(dEl)} <span>von 50 Tagen</span>` : '<span>KvK-Start in der Heatmap setzen</span>')}</div>
        ${sec('🏁 <span>Meilensteine</span>', '– alle PvP-Kämpfe im Zeitraum oben inkl. Rally/Garnison (für alles: Zeitraum „Alles“)')}
        <div class="grid lg:grid-cols-3 gap-2">${track('🏆', 'Kill Points', '100 M · 300 M · 500 M · 700 M · 1 Mrd …', mKp, [1e8, 3e8, 5e8, 7e8, 1e9, 1.5e9, 2e9, 2.5e9, 3e9, 4e9, 5e9, 7.5e9, 1e10], short, '#f5c542')}
          ${track('🎖️', 'Verdienst', '<span>alle</span> 500 K', mAc, accSteps, short, '#7dd3fc')}
          ${track('⚔️', 'Kämpfe', '1 K · 10 K · 50 K · 100 K …', mN, [1e3, 1e4, 5e4, 1e5, 2.5e5, 5e5], short, '#f87171')}</div>
        ${sec('🏅 <span>Rekorde</span>')}
        <div class="grid sm:grid-cols-2 lg:grid-cols-4 gap-2">${rec('💥', 'Größter Battle Streak', short(bigS) + ' KP')}${rec('⚡', 'Meiste KP in 10 min', short(best10), bi ? hmWhen(bi) : '')}
          ${rec('🏁', 'Schnellste 10 Mio.', fast ? Math.round(fast.d / 6e4) + ' min' : '–', fast ? hmWhen(fast.t) : '')}${rec('📅', 'Bester Tag', bestDay ? short(bestDay[1]) : '–', bestDay ? bestDay[0] : '')}</div>
        ${sec('🎖️ <span>Abzeichen</span>')}
        <div class="flex flex-wrap gap-2">${badges.map(([ok, i, n, d]) => `<span class="inline-flex items-center gap-2 rounded-xl border px-3 py-2 ${ok ? 'border-gold-400 bg-gold-500/15 text-gold-100' : 'border-ink-700 text-slate-600 grayscale opacity-60'}" title="${esc(d)}"><span class="text-xl">${i}</span><span><b class="text-xs">${n}</b><br><span class="text-[10px] opacity-80">${d}</span></span></span>`).join('')}</div>
        <div class="mt-5"></div>
        <h4 class="font-semibold text-slate-100 mb-1 text-base">😮‍💨 Müdigkeitskurve <span class="text-[11px] text-slate-500 font-normal">– wie lange du schon in der Schlacht bist (Pause über 45 min = neue Schlacht)</span></h4>
        <div class="grid grid-cols-5 gap-2">${fat.map(x => { const v = x.w.kpt === Infinity ? 3 : x.w.kpt || 0; return `<div class="rounded-xl border border-ink-700 bg-ink-950/60 p-2 text-center"><div class="text-[11px] text-slate-400">${x.l}</div><div class="text-lg font-bold ${kptC(x.w.kpt)}">${x.w.n ? hmKptTxt(x.w.kpt) : '–'}</div><div class="h-1.5 rounded bg-ink-800 mt-1"><div class="h-1.5 rounded ${v >= 1 ? 'bg-emerald-400' : 'bg-red-400'}" style="width:${Math.min(100, v / 3 * 100)}%"></div></div><div class="text-[10px] text-slate-500 mt-1">${fmt(x.w.n)} <span>Kämpfe</span> · ${hmTradeTxt(x.w.trade)}</div></div>`; }).join('')}</div>`;
    } else if (tab === 'farm') {   // Barbaren-Effizienz
      const B = (kbRows || []).filter(r => !r.is_pvp && kbMine(r.player_id) && (!st.acc || String(r.player_id) === st.acc) && kbCatOf(r.npc_btype, r.group_size) === 'barb' && kxInRange(r.battle_start));
      if (!B.length) body = '<div class="text-sm text-slate-500 py-6 text-center">Keine Barbaren im Zeitraum.</div>';
      else { const T = B.map(r => Date.parse(r.battle_start)), hrs = new Set(T.map(t => Math.floor(t / 36e5))).size, days = new Set(T.map(t => new Date(t).toDateString())).size, lv = new Map();
        B.forEach(r => { const k = +r.npc_level || 0; lv.set(k, (lv.get(k) || 0) + 1); });
        const L = [...lv.entries()].sort((a, b) => b[0] - a[0]), mx = Math.max(...L.map(x => x[1]));
        const hr = new Array(24).fill(0); T.forEach(t => hr[new Date(t).getHours()]++); const hmx = Math.max(1, ...hr);
        const loot = (kxLoot || []).filter(l => B.some(r => r.mail_id === l.mail_id)).length;
        body = `<div class="grid sm:grid-cols-4 gap-2 mb-4">
            ${[['🪓', 'Barbaren', fmt(B.length)], ['⏱️', 'pro Farm-Stunde', (B.length / Math.max(1, hrs)).toFixed(1)], ['📅', 'pro Tag', (B.length / Math.max(1, days)).toFixed(1)], ['🎁', 'Beute pro Barbar', loot ? (loot / B.length).toFixed(2) : '–']].map(([i, l, v]) => `<div class="rounded-xl border border-sky-500/30 bg-ink-950/60 p-3"><div class="text-[11px] text-slate-400">${i} ${l}</div><div class="text-xl font-bold text-sky-200 tabular-nums">${v}</div></div>`).join('')}</div>
          <div class="grid lg:grid-cols-2 gap-4"><div><h4 class="font-semibold text-slate-200 mb-1">📊 <span>Nach Stufe</span></h4>${L.map(([k, n]) => `<div class="flex items-center gap-2 text-xs mb-1"><span class="w-12 text-slate-400">Lv ${k || '?'}</span><div class="flex-1 h-3 rounded bg-ink-800"><div class="h-3 rounded bg-sky-500" style="width:${n / mx * 100}%"></div></div><span class="w-10 text-right tabular-nums">${fmt(n)}</span></div>`).join('')}</div>
            <div><h4 class="font-semibold text-slate-200 mb-1">🕒 <span>Wann du farmst</span></h4><div class="flex items-end gap-1 h-28">${hr.map((v, i) => `<div class="flex-1 flex flex-col items-center justify-end h-full" title="${i}–${i + 1} Uhr: ${v}"><div class="w-full rounded-t ${v ? 'bg-sky-500' : 'bg-ink-800'}" style="height:${Math.max(3, v / hmx * 100)}%"></div><span class="text-[9px] text-slate-500">${i % 3 ? '' : i}</span></div>`).join('')}</div></div></div>`; }
    }
    return `<section class="panel rounded-2xl p-4 sm:p-5 mt-4"><h2 class="font-display text-lg text-gold-300 mb-2">📊 <span>Analyse</span></h2>${top}
      <div class="flex flex-wrap gap-1 p-1 rounded-xl bg-ink-950 border border-ink-700 my-3">${tabs.map(([k, i, l]) => `<button type="button" data-anatab="${k}" aria-pressed="${tab === k}" class="seg-btn rounded-lg px-3 py-1.5 text-sm font-semibold">${i} <span>${l}</span></button>`).join('')}</div>
      ${tab !== 'farm' ? `<div class="flex flex-wrap items-center gap-1.5 mb-3"><span class="text-[11px] text-slate-500">Gegner:</span>${[['', '🌍', 'Alle'], ['main', '🐋', 'Mains'], ['mix', '🔀', 'Gemischt'], ['farm', '🐟', 'Farms']].map(([k, i, l]) => { const n = k ? rows0.filter(r => (tierOf(r)?.t || 'unk') === k).length : rows0.length;
        return `<button type="button" data-anatier="${k}" aria-pressed="${tf === k}" class="seg-btn rounded-lg px-2.5 py-1 text-xs font-semibold">${i} <span>${l}</span> <span class="text-slate-500 tabular-nums">${fmt(n)}</span></button>`; }).join('')}
        <span class="text-[10px] text-slate-500">🐋 = meist T5 (20 KP pro Einheit) · 🐟 = meist T4 (10 KP) · ab 100 schwer verletzten/toten Einheiten</span></div>` : ''}${body}</section>`;
  }
  // ================= Heatmap: wo du kämpfst (Testversion) =================
  // Kampfort aus dem Bericht (Attacks[].Pos) – unabhängig davon, wo deine Stadt gerade steht. Nur die KvK-Weltkarte (Role „gsmp“),
  // das KvK erkennt man an der Server-Nummer im Bericht (z. B. 16144 → „C16144“). Bericht rechnet ~6 Einheiten pro Feld, X0/Y0 unten links.
  var HM_MAPS = [{ k: 'heroic_anthem', n: 'Heroic Anthem', lay: 'lk1', img: 'icons/map_heroic_anthem.jpg', size: 1200, unit: 6, pad: 1.1, zones: {"w":240,"r":"a87b72c81a87b72c81a87b72c81a87b72c81a87b72c81a87b72c81a87b72c81a87b72c81a87b72c81a87b72c81a87b72c81a87b72c81a87b72c81a87b72c81a90b1a2b60c3b3c81a93b60c87a93b60c87a93b60c87a93b60c87a93b60c87a93b60c87a93b60c87a93b60c87a93b60c87a93b60c87a93b60c87a96b57c87a99b50c91a99b48c93a99b48c93a99b48c93a99b48c93a101b46c93a103b4a4b36c93a111b36c93a111b36c93a111b36c93a111b36c93a111b36c93a111b14d22c93a111b12d24c93a111b12d24c93a111b12d24c93a111b12d24c93a111b12d24c93a101e10b2e1u1b2u2d28c93a99e15u6d27c93a99e15u6d27c93a99e15u6d27c93a99e15u6d27c93a99e15u6d30c90a70e3a4e37u6d33c87a69e6a1e38u6d33c87a69e45u6d33c87a69e45u10d29c87a69e45u11d28c87a69e45u12d27c87a65e2a2e46u11d27c87a63e53u10d27c87a63e56u7d27c87a63e57u6d27c87a63e57u6d27c87a63e56u7d30c6d3c75a63e56u7d39c75a63e57u6d39c75a63e57u6d39c75a63e57u6d39c75a63e57u6d39c75a63e57u6d41c73a63e57u6d51c63a63e57u6d51c63a63e57u6d51c63a63e57u6d51c63a63e57u6d51c63a57e3a3e54f3u6d51c63a57e60f6u2f4d48c49g14a57e60f12d48c48g15a57e60f12d48c48g15a57e60f12d48c48g15a57e60f12d48c48g15a57e60f12d48c48g15h21a36e60f12d48c48g15h21a36e60f12d48c48g15h21a36e60f12d48c48g15h21a36e60f12d48c48g15h21a36e60f13d47c48g15h24a18h3a12e60f12d50c46g15h45a12e49i3e4i4f2i10d52c4d4c20g31h45a12e48i6e1i17d54c1d5c18g33h45a12e48i24d60c18g33h45a12e48i24d60c18g33h45a13e47i24d60c18g33h47a10e48i24d60c12g3c3g33h57e44i2e2i25d1i4d54c12g39h57e42i36d54c12g39h57e42i36d54c12g39h57e42i36d54c12g39h57e42i36d54c12g39h57e42i39d1i2d51c9g39h57e37i47d52c2g45h57e36i48d54g45h57e36i48d11s5d38g45h57e2t5e29i48d10s13d31g45h57t8e29i47d9s16d29g45h57t9e15j3e9i48d9s17d28g45h53l1t12e15j12i48d9s15m12d18g45h51l3t12e15j12i48d9s15m12d18g45h51l4t11e15j12i48d9s15m12d18g45h51l5t25j12i48d3s12k6s3m12s18g45h51l9t21j12i48s15k9m12s18g45h51l9t21j12i48s15k9m12s18g45h51l9t21j12i44k1s18k9m12s18g45h51l9t21j12i42k3s17k10m12s18g45h51l10t20j12i42k4s15k11m12s18g45h51l30j12i42k5s3k22m12k18g45h51l30j12i42k30m12k18g45h51l30j12i42k32m10k18g45h46l36j1l10i2l4i36k34m4k2m2k18g45h45l54i36k60g45h45l54i36k60g45h45l54i36k60g45h45l54i36k60g45h45l54i36k63g42h45l54i36k66g39h45l54i36k66g39h45l54i36k66g39h45l54i36k66g39h45l54i36k66g39h45l57i33k66g39h45l60i25k71g39h45l60i24k72g39h45l60i24k72g39h45l60i24k72g39h45l60i24k72g39h45l60i24k72g39h45l69r1i2r2k71g50h45l69r6k69g51h45l69r6k69g51h45l69r6k69g51h45l69r6k70g50h45l69r6k57n3k9g51h45l69r6k57n12g51h45l69r6k57n12g51h45l69r6k57n12g51h45l69r6k57n12g51h45l69r6k57n12g51h15o3h27l69r6k57n14g49h15o22h4o4l2o4l63r6k46n29g26n2g3n14h15o24h1o11l63r6k45n30g24n21h15o36l63r6k45n30g24n21h15o36l63r6k45n30g24n21h15o36l63r6k45n30g24n21h15o39l60r6k45n32g22n21o57l56p4r2p4k42n36g13n26o57l54p12k42n36g12n27o57l54p12k42n36g12n27o57l54p12k42n36g12n27o57l54p12k42n36g12n27o57l54p12k42n39g9n27o69l42p12k38n79o69l42p12k36n81o69l42p12k36n81o69l42p12k36n81o69l42p12k36n81o69l44p10k36n81o69l45r1p2r2k35n86o69l45r6k33n87o69l45r6k33n87o69l45r6k33n87o69l45r6k33n87o69l45r6k33n87o75l39r6k33n87o75l39r6k33n87o75l39r6k33n87o75l39r6k33n87o75l39r6k33n87o78l36r6k33n87o91l4o8l2q12r2q14k2n10k4n91o105q30n105o105q30n105o105q30n105o105q30n105o105q30n105o105q30n105o105q30n105o105q30n105o105q30n105o105q30n105o105q30n105o101q2o2q30n105o99q36n105o99q36n105o99q36n105o99q36n105o99q36n105o89q46n105o87q48n105o87q48n105o87q48n105o87q48n105o87q51n102o82q59n99o81q60n99o81q60n99o81q60n99o81q60n99o81q60n99o81q60n99o81q60n99o81q60n99o81q60n99o81q60n99o83q60n97o87q60n93o87q60n93o87q60n93o87q60n93o87q60n93o87q60n93o87q60n93o87q60n93o87q60n93o87q60n93o87q60n93o87q60n93o82q66n1q4n87o81q72n87o81q72n87o81q72n87o81q72n87o81q72n87o81q72n87o81q72n87o81q72n87o80q72n88o80q72n88o80q72n88o80q72n88o81q72n87o81q72n87","n":["Zone 4 NW","Zone 5 N","Zone 4 NO","Zone 6 NO","Zone 6 NW","Altar N","Zone 5 O","Zone 5 W","Kingsland","Altar W","Zone 6 SO","Zone 6 SW","Altar O","Zone 4 SO","Zone 4 SW","Altar S","Zone 5 S","Pass 7 S","Pass 7 O","Pass 7 W","Pass 7 N"],"c":[[0.1831,0.1632],[0.5136,0.0747],[0.8225,0.1737],[0.633,0.326],[0.3652,0.3191],[0.5111,0.3376],[0.9088,0.4937],[0.0978,0.4815],[0.4857,0.4611],[0.3618,0.4618],[0.6377,0.5833],[0.3364,0.5964],[0.7123,0.4626],[0.8036,0.813],[0.1756,0.8175],[0.4872,0.6628],[0.4808,0.8891],[0.4867,0.6458],[0.686,0.4545],[0.2805,0.4548],[0.5023,0.249]]} },
    { k: 'mighty_assembly', n: 'Mighty Assembly', lay: 'lk2', img: 'icons/map_mighty_assembly.jpg', size: 1200, unit: 6, pad: 1.1, zones: {"w":240,"r":"a69b106c65a69b106c65a69b107c64a69b107c64a69b108c63a69b108c63a69b108c63a69b108c63a69b108c63a69b108c63a69b108c63a69b108c63a69b108c63a69b108c63a69b108c63a69b108c63a69b108c63a69b108c63a69b108c63a69b108c63a69b108c63a69b108c63a69b108c63a69b108c63a69b108c63a69b108c63a69b108c63a69b108c63a69b108c63a69b108c63a69b108c63a69b108c63a69b108c63a69b108c63a69b108c63a69b108c63a69b108c63a69b108c63a69b108c63a69b108c63a69b108c63a69b108c63a69b108c63a69b108c63a69b108c63a74b37d11b49c4b2c63a75b36d12b48c69a75b36d12b48c69a75b36d12b48c69a75b36d12b48c69a75b35d13b48c69a75d22b4d38b3d29c69a75d24b1d71c69a75d96c69a75d96c69a75d96c69a75d96c69a75d96c69a75d96c69a75d96c69a75d96c69a75d96c69e6a69d96c24f2c43e13a4e20a4e5a24d101c24f10c4f20c4f7e15a1e23a1e6a23d102c24f12c1f23c1f8e45a24d102c24f45e45a24r1d94s7c24f45e45a24r2d92s8c24f45e45a4e2a18r3d90s9c24f45e51g4a4g7r6d90s12h1c4h4f11c1f45e51g15r6d90s12h9f57e51g15r10d86s11h10f57e51g15r11d85s7h14f57e51g15r12d85s6h14f57e51g15r12d85s6h14f57e51g15r9i12d66j5d1j6s4h14f57e51g15r9i12d66j12s3h15f57e51g16r7g1i12d66j12s2h16f57e51g24i12d66j12h18f57e51g24i12d66j12h18f57e51g24i12d66j12h18f57e51g24i12d66j12h18f57e51g24i12d66j12h18f57e51g24i12d66j12h18f57e51g24i12r6d58s2j12h18f57e51g24i12r7d56s3j12h18f57e51g25i11r8d54s4j12h19f56e51g34r10d54s6h34f51e51g34r10d54s6h34f51e51g35r10d53s7h33f51e51g39r6d49s11h33f51e51g39r6d49s11h33f51e51g39r7d47s12h33f51e47g43r7d47s12h39f45e45g45r6d48s11h40f45e45g45r6d48s6h45f45e45g45r6d48s6h45f45e45g45r6d48s6h45f45e45g45r6d48s6h45f45e45g45r6d48s6h45f45e45g45r6d48s6h45f45e45g45r6d48s6h45f45e45g45r16d34s10h45f45e45g46r16d32s11h45f45e45g46r17d30s12h45f45e45g46r14k11d2k11d1k11s9h45f45e45g47r13k36s8h46f45e45g48r12k36s7h47f45e45g53r2g5k36h54f45e45g60k36h54f45e46g59k36h54f45e50g55k36h49f50e50g55k36h48f51e51g54k36h48f51e51g54k36h48f51e51g54k36h48f51e51g54k36h48f51e51g54k36h48f51e51g54k36h48f51e51g54k36h48f51e51g54k36h48f51e51g54k36h49f50e51g54k36h49f50e51g54k36h53f46e51g54k36h53f46e51g54k36h54f45e51g54k36h54f45e51g54k36h54f45e51g54k36h54f45e51g54k36h54f45e51g54k36h54f45e51g54k36h54f45e51g54k36h54f45e51g54k36h54f45e51g54k36h54f45e45g60k36h54f45e45g60k36h54f45e45g60k36h54f45e45g47t13k36u1h53f45e45g46t14k36u2h52f45e45g45t15k36u2h52f45e45g45t18l9k1l11k1l8u6h51f45e45g45t17l31u6h51f45e45g45t15l33u6h51f45e45g45t6l42u6h51f45e46g44t6l42u6h51f45e46g44t6l42u6h51f45e51g39t6l42u6h56f40e51g39t6l42u6h56f40e51g39t6l42u6h57f39e51g29t16l42u22h41f39e51g28t17l42u23h40f39e51g27t18l42u24h39f39e51g27t18l42u24h39f39e51g27t18l42u24h39f39e51g27t17l44u23h39f39e51g27t7l1t2l3t2l48u3l2u2l4u2l2u6h39f39e51g28t6l71u6h39f39e51g28t6l71u6h39f39e51g19m11t4l71u3n11h31f39e51g18m12t3l73u2n11h31f39e51g18m12t2l75u1n12h30f39e51g18m12l78n12h30f39e51g18m12l78n12h30f39e51g18m12l78n12h30f39e51g18m12l78n12h12o4h4o10f39e51g18m12l78n12h12o18f39e51g18m12l78n12h12o18f39e51g11t7m12l78n12h12o18f39e51g10t8m12l78n12h12o18f39e51g9t1p2t6m10l80n5o2n5h12o18f39p7e4p20e3p17g2p2g3p5t9l93o6h3o27f39p63t9l93o36f39p63t8l94o36f39p63l102o36f39p63l102o36f39p63l102o36f39p63l102o40f4o20f4o1f6p63l102o75p63l102o75p63l102o75p63l102o75p63l102o75p63l106o71p63l108o69p63l108o69p63l108o69p63l108o69p63l108o69p63l30q4l4q28l14q2l4q4l18o69p63l30q36l12q12l18o69p63l30q36l12q12l18o69p63l30q36l12q12l18o69p63l30q36l12q12l18o69p63l30q36l12q12l18o69p62q115o63p62q115o63p63q114o63p63q114o63p63q114o63p63q114o63p62q115o63p63q114o63p63q114o63p63q114o63p63q114o63p64q113o63p75q102o63p75q102o63p75q102o63p75q102o63p75q102o63p75q100o65p75q96o69p75q96o69p75q96o69p75q96o69p75q96o69p75q96o69p75q96o69p75q96o69p75q96o69p75q96o69p75q96o69p63q3p8q97o69p63q114o63p63q114o63p63q114o63p63q114o63p63q114o63p63q114o63p63q114o63p63q114o63p63q114o63p62q115o63p62q115o63p61q116o63p61q116o63p61q116o63p61q116o63","n":["Zone 5 NW","Zone 4 N","Zone 5 NO","Zone 6 N","Zone 4 W","Zone 4 O","Zone 6 W","Zone 6 O","Altar NW","Altar NO","Kingsland","Zone 6 S","Altar SW","Altar SO","Zone 5 SO","Zone 5 SW","Zone 4 S","Pass 7 NW","Pass 7 NO","Pass 7 SW","Pass 7 SO"],"c":[[0.1498,0.1377],[0.5119,0.1036],[0.8607,0.1381],[0.5023,0.3081],[0.1019,0.489],[0.9015,0.4862],[0.2994,0.5009],[0.71,0.5128],[0.3376,0.3369],[0.6623,0.3376],[0.5121,0.5125],[0.4868,0.7106],[0.3122,0.6875],[0.6866,0.6871],[0.8542,0.8553],[0.1378,0.858],[0.5044,0.9003],[0.3661,0.3776],[0.6414,0.3687],[0.3641,0.633],[0.6178,0.6307]]} }];
  HM_MAPS.forEach(m => { const z = m.zones; if (z.d) return; let d = ''; z.r.replace(/([a-z])(\d+)/g, (_, c, n) => { d += c.repeat(+n); return ''; }); z.d = d; });   // Zonen-Raster entpacken
  var HM_ICON = {"Achilleus":"achilles","Iwan IV.":"ivan","Julius Caesar":"caesar","Sun Tzu":"sun","Frederick I":"fred","Minamoto no Yoshitsune":"mina","Yi Seong-Gye":"ysg","Cao Cao":"cc","Richard I":"richard","El Cid":"cid","Hermann":"hermann","Kusunoki Masashige":"kuso","Scipio Africanus":"scipio","Eulji Mundeok":"eulji","Boudica":"boudica","Pelagius":"pelagius","Centurion":"centurion","Hannibal Barca":"barca","Cleopatra VII":"cleo","Constance":"constance","Gaius Marius":"gaius","Tomoe Gozen":"tomoe","Lancelot":"lancelot","Lohar":"lohar","Šárka":"sarka","Belisarius":"beli","Baibars":"baibars","Osman I":"osman","Saladin":"saladin","Mehmed II":"mehmed","Genghis Khan":"khan","Mulan":"mulan","Wu Zetian":"wu","Charlemagne":"charlemagne","Alexander the Great":"alex","Æthelflæd":"aethel","Tomyris":"tomy","Seondeok":"seondeok","Keira":"keira","Keira's Secondary Commander":"keira","Keira's Guard":"keira","Keira's Elite Guard":"keira","Attila":"attila","Takeda Shingen":"takeda","Ishida Mitsunari":"ishida","Theodora":"theo","Guan Yu":"guan","Leonidas I":"leo","Artemisia I":"art","Yi Sun-sin":"yss","Chandragupta Maurya":"chandra","William I":"william","Matilda of Flanders":"matilda","Zenobia":"zeno","Lu Bu":"lubu","Diaochan":"diaochan","Cyrus the Great":"cyrus","Nebuchadnezzar II":"nebu","Moctezuma I":"mocte","Trajan":"trajan","Jadwiga":"jad","Xiang Yu":"xy","Ragnar Lodbrok":"ragnar","Cheok Jun-gyeong":"cj","Gilgamesh":"gilga","Amanitore":"amani","Honda Tadakatsu":"honda","Bertrand du Guesclin":"bert","Alexander Nevsky":"nevsky","Flavius Aetius":"flav","Thutmose III":"thutmose","Imhotep":"imhotep","Henry V":"henry","Lohar's Guard":"lohar","Lohar's Elite Guard":"lohar","Jan Žižka":"jan","Tariq ibn Ziyad":"tariq","Babur":"babur","Heraclius":"hera","Dido":"dido","Zhuge Liang":"zl","Pyrrhus":"pyrrhus","Pericles":"pericles","Huo Qubing":"huo","Justinian I":"justinian","Liu Che":"liu","Ashurbanipal":"ash","Lapulapu":"lapu","Gorgo":"gorgo","Gonzalo de Córdoba":"gonzalo","Gajah Mada":"gajah","Eleanor of Aquitaine":"eleanor","William Wallace":"wallace","Shajar al-Durr":"shajar","Philip II":"philip","Stephen III":"stephen","John Hunyadi":"john","Narses":"narses","Subutai":"subutai","Arthur Pendragon":"arthur","Bai Qi":"bq","Tokugawa Ieyasu":"toku","Shapur I":"shapur","Qin Shi Huang":"qin","Archimedes":"archimedes","Achilles":"achilles","Hector":"hector","Casimir III":"casimir","David IV":"david","Gang Gamchan":"gamchan","Ivar":"ivar","Alp Arslan":"alp","Hayam Wuruk":"hayam","Vercingetorix":"verci","Elizabeth I":"elizabeth","William Marshal":"marshal","Charles Martel":"cm","Constantine the Great":"const","Joan of Arc":"joan","Pakal the Great":"pakal","Ramesses II":"ramesses","Sargon the Great":"sargon","Suleiman I":"suleiman","Edward of Woodstock":"edward","Harald Sigurdsson":"harald","Björn Ironside":"bjorn","Afonso I":"afonso","Pepin the Short":"pepin","Mary I":"mary","Matthias Corvinus":"matthias","Margaret I":"margaret","Tamar":"tamar","Catherine I":"catherine","Ivan IV":"ivan","Afonso I.":"afonso","Alexander der Große":"alex","Alexander Newski":"nevsky","Artemisia I.":"art","Assurbanipal":"ash","Björn Eisenseite":"bjorn","Cy":"cy","David IV.":"david","Dschingis Khan":"khan","Edward von Woodstock":"edward","Eleonore von Aquitanien":"eleanor","Elisabeth I.":"elizabeth","Friedrich I.":"fred","Gang Gam-chan":"gamchan","Gilgamesch":"gilga","Harald Hardrada":"harald","Heinrich V.":"henry","Hektor":"hector","Herakleios":"hera","Iwan III.":"ivan","Jeanne d’Arc":"joan","Johann Hunyadi":"john","Justinian I.":"justinian","Karl der Große":"charlemagne","Karl Martell":"cm","Kasimir III.":"casimir","Kleopatra VII.":"cleo","Konstantin der Große":"const","Kyros der Große":"cyrus","Lapu-Lapu":"lapu","Leonidas":"leo","Lü Bu":"lubu","Margarete I.":"margaret","Maria I.":"mary","Mehmed II.":"mehmed","Moctezuma I.":"mocte","Nebukadnezar II.":"nebu","Osman I.":"osman","Pakal der Große":"pakal","Philipp II.":"philip","Pippin der Jüngere":"pepin","Ragnar (alt)":"ragnarold","Ramses II.":"ramesses","Richard I.":"richard","Sargon der Große":"sargon","Sa":"sa","Shapur I.":"shapur","Siyaj Chan":"siyaj","Stephan I.":"stephen","Süleyman I.":"suleiman","Thutmosis III.":"thutmose","Wilhelm I.":"william","Yi Seong-gye":"ysg","Belisarius (Episch)":"beliepic","Boudica (Episch)":"boudicaepic","Hermann (Episch)":"hermannepic","Jeanne d’Arc (Episch)":"joanepic","Katharina":"catherine","Lady Six Sky":"wak","Mathilde von Flandern":"matilda","Perikles":"pericles","Scipio (Episch)":"scipioepic","Sun Tzu (Episch)":"sunepic","Drachenlanzer":"dragonlancer","Schützin":"markswoman","Stadtwächter":"citykeeper","Zenturio":"centurion","Selim I":"selim","Selim I.":"selim","Yi Do":"yido","Yi To":"yido","YiTo":"yido","Queen Tamar of Georgia":"tamar","Kʼinich Janaabʼ Pakal":"pakal","Artus Pendragon":"arthur"};   // Kommandanten-Name (Bericht, englisch) → Bild in icons/comander
  var HM_ICONN = null;
  window.hmImgErr = (el) => { const id = el.dataset.id, t = +(el.dataset.t || 0), L = el.dataset.x ? ['comanderexpertise/' + id, 'comander/' + id, 'comander/' + id + '_1'] : ['comander/' + id, 'comanderexpertise/' + id, 'comander/' + id + '_1'];
    if (t + 1 < L.length) { el.dataset.t = t + 1; el.src = '/icons/' + L[t + 1] + '.webp'; return; }
    const sp = document.createElement('span'); sp.className = el.className + ' grid place-items-center bg-ink-800 text-[10px] text-slate-300'; sp.textContent = String(el.title || id || '?').slice(0, 2); el.replaceWith(sp); };
  function hmHeroImg(n, cls, exp) { const id = hmIconId(n); if (!id) return `<span class="${cls} grid place-items-center bg-ink-800 border border-ink-600 text-[10px] text-slate-300" title="${esc(n)}">${esc(String(n || '?').slice(0, 2))}</span>`;
    return `<img src="/icons/${exp ? 'comanderexpertise' : 'comander'}/${id}.webp" data-id="${id}" ${exp ? 'data-x="1"' : ''} alt="" title="${esc(n)}" class="${cls} object-cover border ${exp ? 'border-gold-400' : 'border-ink-600'} bg-ink-900" loading="lazy" onerror="hmImgErr(this)">`; }
  function hmIconId(n) { n = String(n || '').trim(); if (HM_ICON[n]) return HM_ICON[n];
    const norm = (x) => x.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '');
    if (!HM_ICONN) { HM_ICONN = new Map(); Object.entries(HM_ICON).forEach(([k, v]) => { HM_ICONN.set(norm(k), v); HM_ICONN.set(norm(k.split(/[ .]/)[0]), HM_ICONN.get(norm(k.split(/[ .]/)[0])) || v); }); }
    const k = norm(n); return HM_ICONN.get(k) || HM_ICONN.get(norm(n.split(/[ .]/)[0])) || HM_ICONN.get(k.replace(/w/g, 'v')) || (k.length >= 5 ? [...HM_ICONN].find(([x]) => x.length >= 5 && (x.startsWith(k.slice(0, 6)) || k.startsWith(x.slice(0, 6))))?.[1] : null) || null; }
  var HM_SRC = [['pvp', '⚔️ Kämpfe', '#ef4444'], ['barb', '🪓 Barbaren', '#3b82f6'], ['fort', '👹 Kahar', '#a855f7'], ['rally', '🛡️ Rally+Garnison', '#38bdf8'], ['all', '📅 Ganzes KvK', '#f5c542']];
  var HM_T = [['kvk', '🏁 KvK-Zeitraum'], ['d1', '24 h'], ['d3', '3 Tage'], ['d7', '7 Tage'], ['custom', 'Zeitraum']];
  var HM_TRAIL = [[3600e3, '1 h'], [6 * 3600e3, '6 h'], [86400e3, '24 h'], [0, 'alles bis dahin']];
  var HM_COL = ['#22d3ee', '#f472b6', '#facc15', '#a3e635', '#fb923c', '#c084fc', '#2dd4bf', '#f87171', '#60a5fa', '#e879f9'];
  var hmTC = null, hmTCc = null, hmSubOpen = new Set(), hmMates = null, hmMatesLoading = false, hmPlay = null, hmView = { s: 1, x: 0, y: 0 }, hmCalMode = false, hmShare = null, hmShareCol = true, hmLiveT = null, hmMaskC = null, hmLast = null;
  function hmCfg(st) { const h = (st.heat = st.heat || {});
    if (h.v !== 4) { h.rot = 0; h.mir = false; h.zn2 = {}; h.iso = null; h.pop = null; h.v = 4; }   // neue Zonen (Zone 4/5/6, Pass 7, Altar, Kingsland)
    if (!['pvp', 'barb', 'fort', 'all', 'rally'].includes(h.src) || hmSpect()) h.src = 'pvp';   // Barbaren/Forts bleiben privat
    if (!h.map) h.map = hmCalc()?.layout === 'lk2' ? 'mighty_assembly' : 'heroic_anthem';
    h.t = h.t || 'kvk'; h.rad = +h.rad || 3; h.zn2 = h.zn2 || {}; h.fn = h.fn || {}; h.ak = h.ak || {}; if (h.tlOpen == null) h.tlOpen = true; if (h.liveV !== 1) { h.live = true; h.liveV = 1; } h.speed = +h.speed || 4;
    if (h.zm == null) h.zm = true; if (h.fr == null) h.fr = false; { const ak = hmAk(h), wi = hmSpect() ? hmWInfoCur(h) : null; if (wi?.map && HM_MAPS.some(x => x.k === wi.map)) h.map = wi.map; else if (ak.map && HM_MAPS.some(x => x.k === ak.map)) h.map = ak.map; else ak.map = h.map; } if (h.trail == null) h.trail = 6 * 3600e3; if (h.pngMk == null) h.pngMk = true; return h; }
  function hmMap(h) { return HM_MAPS.find(m => m.k === h.map) || HM_MAPS[0]; }
  function hmCalc() { try { const s = window.KvKCalc?.getState?.(); return s ? { start: s.startDate || '', end: s.endDate || '', days: +s.mid?.days || 0, layout: s.mid?.layout || '', passAt: s.passAt || {} } : null; } catch { return null; } }
  // ---------- Account + KvK (C-Nummer) – jede ID hat ihr eigenes KvK ----------
  function hmAcc(h) { if (hmSpect()) return ''; const st = kbSt(), ids = [...kbMyIds()], p = kbProfileId(); return String(st.acc || p || ids[0] || ''); }   // Account kommt aus der Leiste oben
  function hmAccRows(gid) { return (kbRows || []).filter(r => String(r.player_id) === gid && r.map_role === 'gsmp'); }
  function hmGsAuto(gid) { let b = null; hmAccRows(gid).forEach(r => { if (+r.server_id >= 10000 && (!b || (r.battle_start || '') > b.t)) b = { id: +r.server_id, t: r.battle_start || '' }; }); return b ? b.id : null; }   // interne Karten-Nummer aus dem Bericht (GsId) – nicht die C-Nummer
  function hmAk(h) { if (hmSpect()) return (h.wAk = h.wAk || {}); const st = kbSt(), g = hmAcc(h); if (!st.accKvk) st.accKvk = { ...(h.ak || {}) }; st.accKvk[g] = st.accKvk[g] || {}; return st.accKvk[g]; }   // pro ID: C-Nummer, Start, Karte (auf jedem Gerät gleich)
  function hmKvkCode(h) { return hmAk(h).kvk || ''; }   // C-Nummer gibst du selbst ein, sie steht nicht in den Berichten
  function hmSid(h) { return null; }   // nicht mehr nach Karten-Nummer filtern – die wird von mehreren KvKs benutzt; Zeitraum kommt vom KvK-Start   // gefiltert wird über die Karten-Nummer, die beim Eintragen der C-Nummer aktuell war
  function hmIsProf(h) { return hmAcc(h) === kbProfileId(); }
  function hmStart(h) { const sp = hmSpect(), a = hmAk(h), wi = sp ? hmWInfoCur(h) : null; if (!sp && a.start) return a.start; if (wi?.start) return String(wi.start).slice(0, 10);
    const c = hmCalc(); if (c?.start) return c.start;   // sonst KvK-Rechner im Profil
    const lim = new Date(Date.now() - 50 * 864e5).toISOString(); let t = ''; hmAccRows(hmAcc(h)).forEach(r => { if (r.battle_start && r.battle_start >= lim && (!t || r.battle_start < t)) t = r.battle_start; }); return t ? t.slice(0, 10) : ''; }
  function hmEnd(h) { const s = hmStart(h); return s ? Date.parse(s + 'T00:00:00Z') + 50 * 864e5 : null; }   // KvK = 50 Tage
  function hmUnit(h, ax) { const m = hmMap(h), v = ax === 'x' ? +h.ux : +h.uy; return v > 0 ? v : (m.unit || 1); }
  function hmTile(v, ax) { return v == null ? null : +v / hmUnit(hmCfg(kbSt()), ax || 'x'); }
  function hmIn(x, y, role) { const z = hmMap(hmCfg(kbSt())).size; if (role && role !== 'gsmp') return false; const a = hmTile(x, 'x'), b = hmTile(y, 'y'); return a != null && b != null && a >= 0 && b >= 0 && a <= z && b <= z; }
  function hmXY(x, y, h, m) { const u = x / hmUnit(h, 'x') / m.size, v = y / hmUnit(h, 'y') / m.size, p = (m.pad || 0) / 100; return [p + u * (1 - 2 * p), p + (1 - v) * (1 - 2 * p)]; }
  function hmNearPass(m) {   // für jedes Feld: nächster Pass-7-Bereich (einmal pro Karte berechnet)
    if (m._np) return m._np; const z = m.zones, W = z.w, N = W * W, out = new Int16Array(N).fill(-1), q = new Int32Array(N); let qh = 0, qt = 0;
    for (let i = 0; i < N; i++) { const k = z.d.charCodeAt(i) - 97; if (/^Pass/.test(z.n[k] || '')) { out[i] = k; q[qt++] = i; } }
    while (qh < qt) { const i = q[qh++], x = i % W, y = (i / W) | 0; for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const xx = x + dx, yy = y + dy; if (xx < 0 || yy < 0 || xx >= W || yy >= W) continue; const j = yy * W + xx; if (out[j] < 0) { out[j] = out[i]; q[qt++] = j; } } }
    return (m._np = out); }
  var hmPT = { p7: null, kl: null };
  function hmPhaseTimes(h) {   // ab wann gilt alles als Pass 7 / Kingsland: eigene Eingabe → Zuschauer-Daten → KvK-Rechner
    const a = hmSpect() ? (hmWInfoCur(h) || {}) : hmAk(h), ev = hmSched(h), pt = (v) => v ? Date.parse(String(v).length <= 16 ? v + (String(v).includes('T') ? '' : 'T00:00') : v) : null;
    const s7 = ev.find(e => e.kind === 'pass' && e.n === 7)?.ts ?? null, s8 = ev.find(e => e.kind === 'pass' && e.n === 8)?.ts ?? null;
    return { p7: pt(a.p7) ?? s7, kl: pt(a.kl) ?? s8 };
  }
  function hmIdxOf(m, re) { m._ix = m._ix || {}; if (m._ix[re] == null) m._ix[re] = m.zones.n.findIndex(n => new RegExp(re).test(n || '')); return m._ix[re]; }
  function hmZoneAt(u, v, m, noPass, t) { const z = m.zones, x = Math.floor(u * z.w), y = Math.floor(v * z.w); if (x < 0 || y < 0 || x >= z.w || y >= z.w) return -1; const k = z.d.charCodeAt(y * z.w + x) - 97;
    if (!noPass) {   // Kämpfe: Altar-Kästchen (bis ~15 Felder davor) = Altar · alle Pass-7-Bereiche = ein „Pass 7“ · ab Kingsland-Start alles Kingsland
      const p7 = hmIdxOf(m, '^Pass'), kl = hmIdxOf(m, '^Kingsland');
      if (t != null && hmPT.kl && t >= hmPT.kl && kl >= 0) return kl;
      if (/^Altar/.test(z.n[k] || '')) return k;
      for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) { const xx = x + dx, yy = y + dy; if (xx < 0 || yy < 0 || xx >= z.w || yy >= z.w) continue; const j = z.d.charCodeAt(yy * z.w + xx) - 97; if (/^Altar/.test(z.n[j] || '')) return j; }
      if (t != null && hmPT.p7 && t >= hmPT.p7 && p7 >= 0) return p7;   // ab Pass-7-Start: alles Pass 7
      if (/^Zone 6|^Pass/.test(z.n[k] || '') && p7 >= 0) return p7;   // in Zone 6 wird nicht gekämpft → Pass 7
      return k; }
    if (!/^Pass/.test(z.n[k] || '')) return k;
    for (let r = 1; r < 12; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) { if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue; const xx = x + dx, yy = y + dy; if (xx < 0 || yy < 0 || xx >= z.w || yy >= z.w) continue;
      const j = z.d.charCodeAt(yy * z.w + xx) - 97; if (!/^Pass/.test(z.n[j] || '')) return j; }   // nächste echte Zone
    return k; }
  function hmZName(h, m, z) { const n = m.zones.n[z] || '–'; return (h.zn2[m.k] || {})[z] || (/^Pass 7/.test(n) ? 'Pass 7' : n); }
  function hmKind(r) { if (r.is_pvp) return kbIsPvp(r) && !kbIsAoo(r) ? 'pvp' : null; const c = kbCatOf(r.npc_btype, r.group_size); return c === 'barb' ? 'barb' : c === 'fort' ? 'fort' : null; }
  function hmKP(r) { return +r.kill_points || +r.group_kill_points || 0; }
  // Lost-Kingdom-Kill-Punkte: T4 = 1, T5 = 5 je schwer verwundeter/getöteter Gegner-Einheit – aus Profil-KP (T4 = 10, T5 = 20) zurückgerechnet
  function hmLK(r) { const n = (+r.enemy_severe || 0) + (+r.enemy_dead || 0), kp = +r.kill_points || 0; if (!n) return 0; const t5 = Math.min(n, Math.max(0, (kp - 10 * n) / 10)); return Math.round((n - t5) + 5 * t5); }
  // eigene Verluste: T5-Anteil aus den KP, die der Gegner an dir gemacht hat (T4 = 10, T5 = 20 KP je Einheit)
  function hmOwnT5(r) { const n = (+r.self_severe || 0) + (+r.self_dead || 0), ekp = +r.enemy_kill_points || 0; if (!n || !ekp) return 0; return Math.min(1, Math.max(0, (ekp - 10 * n) / (10 * n))); }
  function hmSum(pts) { const o = { n: 0, ekp: 0, kp: 0, lk: 0, lkD: 0, lkH: 0, dead: 0, sev: 0, eLoss: 0, acc: 0, heal: 0, first: null, kpS: 0, ekpS: 0, rkp: 0, rekp: 0, rn: 0 };
    pts.forEach(p => { const r = p.r; o.n++; o.kp += hmKP(r); o.lk += hmLK(r); o.dead += +r.self_dead || 0; o.sev += +r.self_severe || 0; o.eLoss += (+r.enemy_dead || 0) + (+r.enemy_severe || 0); o.acc += +r.acclaim || 0; o.ekp += +r.enemy_kill_points || 0;
      { const f = hmOwnT5(r); o.lkD += (+r.self_dead || 0) * (1 + 4 * f); o.lkH += (+r.self_severe || 0) * (1 + 4 * f); }   // LK Deads (Tote) / LK Heal (schwer Verwundete): T4 = 1, T5 = 5
      if (p.grp || p.joined || +r.group_size > 1) { o.rkp += hmKP(r); o.rekp += +r.enemy_kill_points || 0; o.rn++; } else { o.kpS += hmKP(r); o.ekpS += +r.enemy_kill_points || 0; } o.heal += +r.self_healing || 0; if (o.first == null || p.t < o.first) o.first = p.t; });
    o.lkD = Math.round(o.lkD); o.lkH = Math.round(o.lkH);
    o.kpt = o.ekpS > 0 ? o.kpS / o.ekpS : (o.kpS ? Infinity : null);   // KP-Trade: deine KP ÷ KP des Gegners – ohne Rally/Garnison
    o.rkpt = o.rekp > 0 ? o.rkp / o.rekp : (o.rkp ? Infinity : null);   // eigener Wert für Rally/Garnison
    o.trade = o.dead + o.sev > 0 ? o.eLoss / (o.dead + o.sev) : (o.eLoss ? Infinity : null); return o; }
  function hmKptTxt(t) { return t == null ? '–' : t === Infinity ? '∞' : (t >= 10 ? Math.round(t) : t.toFixed(2).replace('.', ',')) + ' : 1'; }
  function hmTradeTxt(t) { return t == null ? '–' : t === Infinity ? '∞' : Math.round(t * 100) + ' %'; }
  function hmWhen(t) { return t == null ? '' : new Date(t).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }); }
  function hmRange(h, fights) { const f = h.fight && (fights || []).find(x => x.id === h.fight); if (f) return [f.a - 10 * 6e4, f.b + 10 * 6e4];
    const now = Date.now(), s = hmStart(h), ks = s ? Date.parse(s + 'T00:00:00Z') : null;
    if (h.t === 'd1' || h.t === 'd3' || h.t === 'd7') return [now - (+h.t.slice(1)) * 864e5, null];
    if (h.t === 'day' && h.day) { const a = Date.parse(h.day + 'T00:00:00Z'); return [a, a + 864e5 - 1]; }
    if (h.t === 'custom') return [h.from ? new Date(h.from).getTime() : ks, h.to ? new Date(h.to).getTime() : null];
    return [ks, hmEnd(h)];
  }
  function hmPoints(st, src, range, withMates) {   // Punkte des gewählten KvK: du + (optional) Freunde/Königreich
    const h = hmCfg(st), m = hmMap(h), sid = hmSid(h), acc = hmAcc(h), [from, to] = range, mates = withMates && hmMates ? new Map(hmMates.map((f, i) => [f.gid, i])) : new Map();
    const tm = (x) => { const q = /^(\d{1,2}):(\d{2})$/.exec(x || ''); return q ? +q[1] * 60 + +q[2] : null; }, hf = tm(h.hf) ?? (h.ht ? 0 : null), ht = tm(h.ht) ?? 1439; hmPT = hmPhaseTimes(h);
    const sp = hmSpect(), ws = sp ? hmWatchSet(h) : null, out = [], own = (pid) => acc ? String(pid) === acc : sp ? ((!ws || ws.has(String(pid))) && (!h.watch || String(pid) === h.watch)) : kbMine(pid);
    const add = (r, joined) => { const kd = hmKind(r); if (!kd) return; const city = !joined && kd === 'pvp' && r.city_x != null && r.pos_x != null && Math.hypot(+r.pos_x - +r.city_x, +r.pos_y - +r.city_y) <= 30;
      const grp = joined || city || (+r.group_size > 1 && kd === 'pvp');
      if (src === 'rally' ? !(grp && kd === 'pvp') : ((src !== 'all' && kd !== src) || (grp && kd === 'pvp'))) return;   // Rally/Garnison/City-Rally zählen nicht zu den normalen Kämpfen
      if (!joined && sid && r.server_id != null && +r.server_id !== sid) return;
      const mine = own(r.player_id), fi = mates.get(String(r.player_id)); if (!mine && fi == null) return; if (!mine && kd !== 'pvp') return;   // Barbaren anderer bleiben privat
      if (!hmIn(r.pos_x, r.pos_y, r.map_role)) return;
      const t = r.battle_start ? Date.parse(r.battle_start) : NaN; if (from != null && !(t >= from)) return; if (to != null && !(t <= to)) return;
      if (hf != null) { const d = new Date(t), mm = d.getHours() * 60 + d.getMinutes(); if (hf <= ht ? (mm < hf || mm > ht) : (mm < hf && mm > ht)) return; }   // Uhrzeit-Fenster (z. B. 15–18 Uhr)
      const [u, v] = hmXY(+r.pos_x, +r.pos_y, h, m); out.push({ r, k: kd, u, v, t, mine, fi: mine ? -1 : fi, z: hmZoneAt(u, v, m, kd !== 'pvp', t), joined, grp, city }); };   // Pass 7 nur für Kämpfe
    (kbRows || []).forEach(r => add(r, false));
    (kxRally || []).forEach(r => { if (r.pos_x != null) add({ ...r, kill_points: r.group_kill_points, is_pvp: r.is_pvp && (+r.group_kill_points || 0) > 0 }, true); });
    return out.sort((a, b) => a.t - b.t);
  }
  // Kalender (KvK-Rechner): Pass-/Altar-Zeiten – Ersatz, wenn der Ort nichts Eindeutiges sagt
  function hmSched(h) {
    const s = hmStart(h), c = hmCalc(), m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s); if (!m) return [];
    const HR = 36e5, DY = 864e5, MN = 6e4, base = Date.UTC(+m[1], +m[2] - 1, +m[3]), lay = c?.layout || hmMap(h).lay;
    const S = lay === 'lk1' ? { p4: 5 * DY + 21 * HR + 46 * MN, rel: { 5: [4, 8 * DY], 6: [4, 10 * DY + 9 * HR + 31 * MN], 7: [6, 9 * DY], 8: [6, 12 * DY] }, altar: { from: 6, off: 48 * HR, every: 86, count: 8 } }
      : { p4: 7 * DY, rel: { 5: [4, 7 * DY], 6: [4, 8 * DY], 7: [4, 17 * DY], 8: [4, 21 * DY] } };
    const pu = (v) => { const x = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(v || ''); return x ? Date.UTC(+x[1], +x[2] - 1, +x[3], +x[4], +x[5]) : null; }, pa = c?.passAt || {}, at = {};
    at[4] = pu(pa[4]) ?? base + S.p4; [5, 6, 7, 8].forEach(n => { const r = S.rel[n]; at[n] = pu(pa[n]) ?? at[r[0]] + r[1]; });
    const ev = [4, 5, 6, 7, 8].map(n => ({ kind: 'pass', n, ts: at[n] }));
    if (S.altar) for (let i = 0; i < S.altar.count; i++) ev.push({ kind: 'altar', ts: at[S.altar.from] + S.altar.off + i * S.altar.every * HR });
    return ev;
  }
  function hmBaseName(n) { n = n || ''; const m = /^(Zone \d|Pass \d)/.exec(n); return m ? m[1] : /^Altar/.test(n) ? 'Altar' : /^Kingsland/.test(n) ? 'Kingsland' : n; }
  function hmFightName(h, m, zs, a, b) {   // Ort: Altar-Kästchen, Kingsland, Pass 7 (Grenze Zone 6/Zone 6), Zone 4/5/6 – sonst Kalender
    const n1 = zs[0] ? m.zones.n[zs[0][0]] : '', n2 = zs[1] && zs[1][1] >= zs[0][1] * .3 ? m.zones.n[zs[1][0]] : '';
    if (/^Zone 6/.test(n1) && /^Zone 6/.test(n2)) return 'Pass 7'; if (n1) return hmBaseName(n1);
    const ev = hmSched(h); if (ev.some(e => e.kind === 'altar' && a <= e.ts + 3 * 36e5 && b >= e.ts - 30 * 6e4)) return 'Altar';
    const p = ev.filter(e => e.kind === 'pass' && e.ts <= b + 30 * 6e4 && a - e.ts <= 72 * 36e5).sort((x, y) => y.ts - x.ts)[0];
    return p ? (({ 4: 'Zone 4', 7: 'Pass 7', 8: 'Kingsland' })[p.n] || 'Pass ' + p.n) : 'Kampf';
  }
  function hmFights(st) {   // Schlachten: deine PvP-Kämpfe im KvK, Pause > 45 min = neue Schlacht
    const h = hmCfg(st), m = hmMap(h), s = hmStart(h), pts = hmPoints(st, 'pvp', [s ? Date.parse(s + 'T00:00:00Z') : null, null], false).filter(p => p.mine), out = []; let cur = null;
    pts.forEach(p => { if (!cur || p.t - cur.b > 45 * 6e4 || Math.floor(p.t / 864e5) !== Math.floor(cur.a / 864e5)) { cur = { a: p.t, b: p.t, kp: 0, n: 0, zk: new Map(), u0: 1, v0: 1, u1: 0, v1: 0, pts: [] }; out.push(cur); }
      const kp = hmKP(p.r); cur.b = p.t; cur.kp += kp; cur.n++; cur.pts.push(p); cur.zk.set(p.z, (cur.zk.get(p.z) || 0) + kp);
      cur.u0 = Math.min(cur.u0, p.u); cur.v0 = Math.min(cur.v0, p.v); cur.u1 = Math.max(cur.u1, p.u); cur.v1 = Math.max(cur.v1, p.v); });
    const big = Math.max(0, ...out.map(f => f.kp));
    const L = out.filter((f, i) => (f.n >= 3 && f.kp >= Math.max(500000, big * .05)) || (i === out.length - 1 && Date.now() - f.b < 45 * 6e4)).map(f => {
      const zs = [...f.zk.entries()].filter(([z]) => z >= 0).sort((a, b) => b[1] - a[1]), id = String(f.a), auto = hmFightName(h, m, zs, f.a, f.b);
      return { ...f, id, z: zs[0] ? zs[0][0] : -1, auto, live: Date.now() - f.b < 45 * 6e4 };
    });
    const cnt = {}, idx = {}; L.forEach(f => cnt[f.auto] = (cnt[f.auto] || 0) + 1);
    L.forEach(f => { f.base = f.auto; if (cnt[f.auto] > 1) { idx[f.auto] = (idx[f.auto] || 0) + 1; f.auto += ' ' + idx[f.auto]; } f.name = h.fn[f.id] || f.auto; });   // Altar 1, Altar 2 …
    return L.reverse();
  }
  // ---------- Freunde, Königreich, Sichtbarkeit ----------
  async function hmLoadMates() {
    if (hmMatesLoading || hmMates) return; hmMatesLoading = true; const out = new Map();
    try { const db = RokAuth?.db?.(), me = RokAuth?.userId?.(); if (!db || !me) throw 0; const ids = new Map();
      try { const rel = await db.from('friendships').select('a,b,status').or(`a.eq.${me},b.eq.${me}`); (rel.data || []).filter(x => x.status === 'accepted').forEach(x => ids.set(x.a === me ? x.b : x.a, 'f')); } catch {}
      try { const my = await db.from('kingdom_members').select('kingdom_id,status').eq('user_id', me); const kid = (my.data || []).find(x => x.status === 'member')?.kingdom_id;
        if (kid) { const mem = await db.from('kingdom_members').select('user_id,status').eq('kingdom_id', kid); (mem.data || []).filter(x => x.status === 'member' && x.user_id !== me && !ids.has(x.user_id)).forEach(x => ids.set(x.user_id, 'k')); } } catch {}
      if (ids.size) { let lb = await db.from('leaderboard').select('user_id,username,governor_id,heat_share').in('user_id', [...ids.keys()]);
        if (lb.error) { hmShareCol = false; lb = await db.from('leaderboard').select('user_id,username,governor_id').in('user_id', [...ids.keys()]); }
        (lb.data || []).filter(x => !hmShareCol || x.heat_share === true).forEach(x => { const g = String(x.governor_id || '').replace(/\D/g, ''); if (g && !kbMine(g)) out.set(g, { gid: g, name: x.username || 'Spieler', kind: ids.get(x.user_id) }); }); }
    } catch {}
    hmMates = [...out.values()].sort((a, b) => (a.kind > b.kind ? 1 : -1) || a.name.localeCompare(b.name)); hmMatesLoading = false; if (R.view === 'battles' && kbSt().page === 'heat') renderKampf();
  }
  async function hmLoadShare() { if (hmShare != null) return; hmShare = false;
    try { const db = RokAuth?.db?.(), me = RokAuth?.userId?.(); if (!db || !me) return; const q = await db.from('leaderboard').select('heat_share').eq('user_id', me).maybeSingle(); if (q.error) { hmShareCol = false; return; } hmShare = !!q.data?.heat_share; } catch {}
    finally { if (R.view === 'battles' && kbSt().page === 'heat') renderKampf(); } }
  async function hmSetShare(v) { try { const db = RokAuth?.db?.(), me = RokAuth?.userId?.(); if (!db || !me) return; const q = await db.from('leaderboard').update({ heat_share: v }).eq('user_id', me);
      if (q.error) { hmAsk('Sichtbarkeit', '', null, 'Konnte nicht gespeichert werden – fehlt das neue SQL (heat_share)?'); return; } hmShare = v; } catch {} renderKampf(); }
  function hmCity(gid) { const h = hmCfg(kbSt()), sid = gid ? null : hmSid(h), me = hmAcc(h);
    return (kbRows || []).find(r => (gid ? String(r.player_id) === gid : (me ? String(r.player_id) === me : kbMine(r.player_id))) && (!sid || +r.server_id === sid) && hmIn(r.city_x, r.city_y, r.map_role)); }
  // ---------- schönes Eingabefenster (statt Browser-Prompt) ----------
  function hmAsk(title, value, onOk, msg, ph) {
    document.getElementById('hmAsk')?.remove(); const d = document.createElement('div'); d.id = 'hmAsk'; d.className = 'fixed inset-0 z-[90] grid place-items-center bg-black/60 backdrop-blur-sm p-4';
    d.innerHTML = `<div class="panel rounded-2xl p-5 w-full max-w-sm border border-gold-500/40"><h3 class="font-display text-lg text-gold-300 mb-1">${esc(title)}</h3>${msg ? `<p class="text-xs text-slate-400 mb-3">${esc(msg)}</p>` : ''}
      ${onOk ? `<input id="hmAskIn" value="${esc(value || '')}" placeholder="${esc(ph || '')}" maxlength="40" class="w-full bg-ink-950 border border-ink-600 rounded-xl px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-gold-500">` : ''}
      <div class="flex justify-end gap-2 mt-4">${onOk ? '<button type="button" data-x class="px-3 py-1.5 rounded-lg border border-ink-600 hover:border-gold-500/60 text-sm">Abbrechen</button><button type="button" data-ok class="px-4 py-1.5 rounded-lg bg-gold-500 text-ink-950 font-semibold text-sm hover:bg-gold-400">Speichern</button>' : '<button type="button" data-x class="px-4 py-1.5 rounded-lg bg-gold-500 text-ink-950 font-semibold text-sm">OK</button>'}</div></div>`;
    document.body.appendChild(d); const inp = d.querySelector('#hmAskIn'); inp?.focus(); inp?.select();
    const close = () => d.remove(), ok = () => { const v = inp ? inp.value.trim() : ''; close(); onOk && onOk(v); };
    d.addEventListener('click', (e) => { if (e.target === d || e.target.closest('[data-x]')) close(); else if (e.target.closest('[data-ok]')) ok(); });
    inp?.addEventListener('keydown', (e) => { if (e.key === 'Enter') ok(); if (e.key === 'Escape') close(); });
  }
  // ---------- Darstellung ----------
  function hmHeroes(march) { return String(march || '').split(' / ').slice(0, 2).map(n => hmHeroImg(n, 'w-7 h-7 rounded-lg')).join(''); }
  function hmMarches(pts, src) {   // jeder Marsch: KP, Verdienst, Trade (Kämpfe) bzw. Anzahl (Barbaren/Forts)
    const M = new Map(); pts.forEach(p => { const k = p.joined ? 'Rally (Teilnehmer)' : kbMarchOf(p.r); (M.get(k) || M.set(k, []).get(k)).push(p); });
    return [...M.entries()].map(([k, v]) => { const c = {}; v.forEach(p => { const t = p.r && !p.joined ? kbTT(p.r, 'self') : null; if (t) c[t] = (c[t] || 0) + 1; }); return [k, hmSum(v), Object.keys(c).sort((a, b) => c[b] - c[a])[0]]; }).sort((a, b) => src === 'pvp' ? b[1].kp - a[1].kp : b[1].n - a[1].n);
  }
  function hmMarchTable(list, src, small) {
    return `<table class="w-full ${small ? 'text-[11px]' : 'text-xs'}"><tbody>${list.map(([k, w]) => `<tr class="border-t border-ink-800/60"><td class="py-1 pr-1"><div class="flex items-center gap-1.5 min-w-0">${k.startsWith('Rally') ? '<span class="w-7 h-7 rounded-lg grid place-items-center bg-sky-500/15 border border-sky-500/40">🛡️</span>' : `<span class="flex gap-0.5 shrink-0">${hmHeroes(k)}</span>`}${small ? '' : `<span class="truncate text-slate-300" translate="no" title="${esc(k)}">${esc(k)}</span>`}</div></td>
      ${src === 'pvp' ? `<td class="py-1 text-right tabular-nums text-gold-200 whitespace-nowrap">🏆 ${short(w.kp)}</td><td class="py-1 pl-2 text-right tabular-nums text-sky-200 whitespace-nowrap">🎖️ ${w.acc ? short(w.acc) : '–'}</td><td class="py-1 pl-2 text-right tabular-nums whitespace-nowrap ${w.trade >= 1 ? 'text-emerald-300' : 'text-red-300'}">⚖️ ${hmTradeTxt(w.trade)}</td>` : `<td class="py-1 text-right tabular-nums">${src === 'barb' ? '🪓' : '🏰'} ${fmt(w.n)}</td>`}</tr>`).join('')}</tbody></table>`;
  }
  function hmState(st) {
    const h = hmCfg(st), m = hmMap(h), fights = h.src === 'pvp' || h.src === 'all' ? hmFights(st) : [];
    if (h.fight && !fights.some(f => f.id === h.fight)) h.fight = null;
    const range = hmRange(h, fights), allA = hmPoints(st, h.src, range, h.fr), mk = (p) => p.joined ? 'Rally (Teilnehmer)' : kbMarchOf(p.r);
    const marches = [...new Set(allA.filter(p => p.mine).map(mk))].sort(); if (h.march && !marches.includes(h.march)) h.march = '';
    const allM = h.march ? allA.filter(p => !p.mine || mk(p) === h.march) : allA, zbOf = (z) => z >= 0 ? hmBaseName(hmZName(h, m, z)) : '', all0 = h.zb ? allM.filter(p => zbOf(p.z) === h.zb) : allM, all = h.iso != null ? all0.filter(p => p.z === h.iso) : all0;
    const t0 = all.length ? all[0].t : Date.now(), t1 = all.length ? all[all.length - 1].t : Date.now(), cur = h.tl == null ? null : Math.min(t1, Math.max(t0, h.tl));
    const upto = cur == null ? all : all.filter(p => p.t <= cur), dots = cur == null || !h.trail ? upto : upto.filter(p => p.t >= cur - h.trail);
    const merge = (L) => { const M = new Map(), other = []; L.forEach(p => { if (p.k !== 'pvp') { other.push(p); return; } const k = (p.mine ? 'm' : 'f' + p.fi) + '|' + p.r.mail_id, o = M.get(k);   // ein Bericht = ein Punkt
      if (o) { o.kp += hmKP(p.r); o.n++; } else M.set(k, { ...p, kp: hmKP(p.r), n: 1 }); }); return [...M.values(), ...other]; };
    const live = [], lastP = new Map(); allA.forEach(p => { if (p.k !== 'pvp' || (!p.mine && p.fi < 0)) return; const k = String(p.r.player_id), o = lastP.get(k); if (!o || p.t > o.t) lastP.set(k, p); });
    lastP.forEach((p, k) => { if (Date.now() - p.t < 15 * 6e4) live.push({ k, p, name: p.mine ? hmPName(k, p.r.self_name) : (hmMates?.[p.fi]?.name || hmPName(k, p.r.self_name)) }); });   // live = Kampf in den letzten 15 min
    const zb = new Map(); allM.forEach(p => { if (!p.mine || p.z < 0) return; const b = zbOf(p.z), o = zb.get(b) || { b, kp: 0, n: 0 }; o.kp += hmKP(p.r); o.n++; zb.set(b, o); });
    return { h, m, fights, marches, live, zbList: [...zb.values()].sort((a, b) => b.kp - a.kp || b.n - a.n), allA, all0, all, upto, dots, dotsM: merge(dots), t0, t1, cur, zs: hmZoneStats(h.src === 'all' ? upto.filter(p => p.k === 'pvp') : upto), zsAll: hmZoneStats(h.src === 'all' ? all0.filter(p => p.k === 'pvp') : all0) };
  }
  function hmPName(pid, nm) { return kbIdName(pid) || nm || String(pid); }
  function hmZoneStats(pts) {
    const Z = new Map();
    pts.forEach(p => { if (p.z < 0) return; const o = Z.get(p.z) || { z: p.z, mine: [], who: new Map(), pn: new Map(), ally: new Map(), su: 0, sv: 0, sc: 0 };
      const key = p.mine ? 'p' + p.r.player_id : 'm' + p.fi; (o.who.get(key) || o.who.set(key, []).get(key)).push(p); if (p.mine) o.pn.set(String(p.r.player_id), p.r.self_name);
      if (p.mine) { o.mine.push(p); o.su += p.u; o.sv += p.v; o.sc++; if (p.r.enemy_alliance) o.ally.set(p.r.enemy_alliance, (o.ally.get(p.r.enemy_alliance) || 0) + 1); }
      Z.set(p.z, o); });
    return [...Z.values()].filter(o => o.sc).map(o => { const me = hmSum(o.mine); return { ...o, ...me, whoSum: new Map([...o.who].map(([k, v]) => [k, hmSum(v)])), mu: o.su / o.sc, mv: o.sv / o.sc }; })
      .sort((a, b) => b.kp - a.kp || b.n - a.n);
  }
  function hmWho(o) {   // Spieler in einer Zone, bester zuerst
    return [...o.whoSum.entries()].map(([k, w]) => { const mate = k[0] === 'm' ? hmMates?.[+k.slice(1)] : null, pid = k[0] === 'p' ? k.slice(1) : '';
      return { k, w, name: mate ? mate.name : hmPName(pid, o.pn.get(pid)), tag: mate ? (mate.kind === 'k' ? '👑' : '🤝') : '', col: mate ? HM_COL[+k.slice(1) % HM_COL.length] : '#f5c542' }; })
      .sort((a, b) => b.w.kp - a.w.kp || b.w.n - a.w.n);
  }
  function hmMarkCard(S, o) {   // Marker auf der Karte: nur Zone, Name, KP und Trade – alles Weitere rechts
    const { h, m } = S, pvp = h.src === 'pvp' || h.src === 'all' || h.src === 'rally', sel = h.pop === o.z, ppl = hmWho(o);
    const names = ppl.slice(0, 2).map(x => esc(x.name)).join(', ') + (ppl.length > 2 ? ` +${ppl.length - 2}` : '');
    return `<div class="rounded-xl border ${sel ? 'border-white ring-2 ring-amber-400' : 'border-amber-400/70'} bg-ink-950/90 px-2 py-1 shadow-xl text-[11px] text-slate-200 max-w-[16rem]">
      <div class="flex items-center gap-1.5 whitespace-nowrap"><b class="text-gold-300" translate="no">📍 ${esc(hmZName(h, m, o.z))}</b><span class="text-cyan-200 truncate" translate="no">· ${names}</span></div>
      <div class="whitespace-nowrap">${pvp ? `🏆 <b class="text-gold-200">${short(o.kp)}</b> · ⚖️ <b class="${o.trade >= 1 ? 'text-emerald-300' : 'text-red-300'}">${hmTradeTxt(o.trade)}</b> · 🔁 <b class="${o.kpt >= 1 ? 'text-emerald-300' : 'text-red-300'}">${hmKptTxt(o.kpt).replace(' : ', ':')}</b>` : `${h.src === 'barb' ? '🪓' : '👹'} <b class="text-gold-200">${fmt(o.n)}</b>`}</div></div>`;
  }
  function hmLivePanel(S) {   // rechts: gewählte Zone (Marker anklicken oder Auswahl) – sonst die aktuelle Schlacht
    const { h, m, fights, zs } = S, pvp = h.src === 'pvp' || h.src === 'all' || h.src === 'rally', zo = h.pop != null ? zs.find(o => o.z === h.pop) : null, spect = hmSpect();
    const f = !zo && pvp ? ((h.fight && fights.find(x => x.id === h.fight)) || fights[0]) : null;
    const pts = zo ? zo.mine : f ? (S.cur != null ? f.pts.filter(p => p.t <= S.cur) : f.pts) : [], o = hmSum(pts);
    const big = (l, v, c) => `<div class="rounded-xl bg-ink-900/80 border border-ink-700 p-2"><div class="text-[10px] text-slate-400">${l}</div><div class="text-lg font-bold tabular-nums ${c}">${v}</div></div>`;
    const sel = `<select data-hmpanel class="w-full bg-ink-950 border border-gold-500/40 rounded-lg px-2 py-1.5 text-xs text-slate-100 focus:outline-none focus:border-gold-500 mb-2">${pvp ? '<option value="">⚔️ Aktuelle Schlacht</option>' : '<option value="">📍 Zone wählen …</option>'}${zs.map(z => `<option value="${z.z}" ${h.pop === z.z ? 'selected' : ''}>📍 ${esc(hmZName(h, m, z.z))} – ${pvp ? short(z.kp) : fmt(z.n)}</option>`).join('')}</select>`;
    const ppl = zo ? hmWho(zo) : (() => { const W = new Map(); pts.forEach(p => { const k = String(p.r.player_id); (W.get(k) || W.set(k, { name: hmPName(k, p.r.self_name), pts: [] }).get(k)).pts.push(p); });
      return [...W.values()].map(x => ({ name: x.name, w: hmSum(x.pts), col: '#f5c542', tag: '' })).sort((a, b) => b.w.kp - a.w.kp); })();
    const rank = ppl.length > 1 || spect ? `<div class="mt-2 text-[10px] uppercase tracking-wider text-slate-500">Spieler</div><table class="w-full text-xs"><tbody>${ppl.map((r, i) => `<tr class="border-t border-ink-800/60"><td class="py-1 pr-1 text-slate-500 tabular-nums">${i + 1}.</td><td class="truncate"><span class="inline-block w-2 h-2 rounded-full mr-1" style="background:${r.col}"></span><span translate="no">${esc(r.name)}</span> ${r.tag}</td><td class="text-right tabular-nums text-gold-200">${pvp ? short(r.w.kp) : fmt(r.w.n)}</td>${pvp ? `<td class="pl-2 text-right tabular-nums ${r.w.trade >= 1 ? 'text-emerald-300' : 'text-red-300'}">${hmTradeTxt(r.w.trade)}</td>` : ''}</tr>`).join('')}</tbody></table>` : '';
    const ally = zo && zo.ally.size ? `<div class="mt-2 text-[11px] text-red-200"><span class="text-slate-500">Gegner:</span> <span translate="no">${[...zo.ally.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([a, n]) => `[${esc(a)}] ${n}`).join(' · ')}</span></div>` : '';
    const title = zo ? `📍 <span translate="no">${esc(hmZName(h, m, zo.z))}</span>` : f ? `⚔️ <span translate="no">${esc(f.name)}</span>` : '';
    const when = zo ? `<span>erste KP</span> ${hmWhen(o.first)}` : f ? `${hmWhen(f.a)} – ${new Date(S.cur != null ? Math.min(S.cur, f.b) : f.b).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}` : '';
    const tiles = pvp ? `${big('🏆 Kill Points', short(o.kp), 'text-gold-200')}${big('🏟️ LK Kills', short(o.lk), 'text-amber-200')}${big('🪦 LK Deads', short(o.lkD), 'text-red-200')}${big('💉 LK Heal', short(o.lkH), 'text-emerald-200')}${big('💀 Deads', short(o.dead), 'text-red-300')}${big('⚖️ Trade', hmTradeTxt(o.trade), o.trade >= 1 ? 'text-emerald-300' : 'text-red-300')}${big('🔁 KP-Trade', hmKptTxt(o.kpt), o.kpt >= 1 ? 'text-emerald-300' : 'text-red-300')}${o.rn ? big('🛡️ Rally/Garnison KP-Trade', hmKptTxt(o.rkpt), o.rkpt >= 1 ? 'text-emerald-300' : 'text-red-300') : ''}${big('🗡️ Gegner-KP', short(o.ekp), 'text-red-200')}${big('🎖️ Verdienst', o.acc ? short(o.acc) : '–', 'text-sky-200')}${big('💚 Heilung', short(o.heal), 'text-emerald-200')}`
      : big(h.src === 'barb' ? '🪓 Barbaren' : '👹 Kahar', fmt(o.n), 'text-gold-200');
    return `<aside class="rounded-xl border ${f?.live ? 'border-red-500/60' : 'border-ink-700'} bg-ink-950/70 p-3 lg:sticky lg:top-2 self-start">
      <div class="flex items-center justify-between gap-2 mb-2"><h3 class="font-display text-base text-gold-300">${f?.live ? '<span class="inline-block w-2 h-2 rounded-full bg-red-500 animate-pulse mr-1"></span><span>Kampf läuft</span>' : '📊 <span>Werte</span>'}</h3>
        <label class="flex items-center gap-1 text-[11px] text-slate-400" title="Lädt jede Minute neue Kampfberichte nach"><input type="checkbox" data-hmlive ${h.live ? 'checked' : ''} class="accent-red-500"> <span>🔴 Live</span></label></div>
      ${sel}
      ${!pts.length ? '<div class="text-xs text-slate-500">Noch keine Kämpfe.</div>' : `
      <div class="text-sm text-slate-100 font-semibold">${title}</div>
      <div class="text-[10px] text-slate-500 mb-2">${when} · ${fmt(o.n)} <span>Kämpfe</span></div>
      ${zo ? `<div class="flex gap-1 mb-2"><button type="button" data-hmiso2="${zo.z}" class="px-2 py-0.5 rounded-lg border border-ink-600 hover:border-gold-500/60 text-[11px]">${h.iso === zo.z ? '✕ <span>Alle Zonen</span>' : '🔍 <span>Nur diese Zone</span>'}</button><button type="button" data-hmzren2="${zo.z}" class="px-2 py-0.5 rounded-lg border border-ink-600 hover:border-gold-500/60 text-[11px]">✏️ <span>Umbenennen</span></button></div>` : ''}
      <div class="grid grid-cols-2 gap-1.5">${tiles}</div>${rank}
      <div class="mt-2 text-[10px] uppercase tracking-wider text-slate-500">Märsche</div>${hmMarchTable(hmMarches(pts, pvp ? 'pvp' : h.src), pvp ? 'pvp' : h.src, true)}${ally}`}
      ${spect ? '' : `<div class="mt-2 pt-2 border-t border-ink-700 flex items-center justify-between gap-2 text-[11px]"><span class="text-slate-400">Sichtbarkeit</span>
        <button type="button" data-hmshare class="px-2 py-1 rounded-lg border ${hmShare ? 'border-emerald-500/60 text-emerald-300' : 'border-ink-600 text-slate-300'}">${hmShare == null ? '…' : hmShare ? '👁️ <span>Für Freunde &amp; Königreich sichtbar</span>' : '🔒 <span>Privat</span>'}</button></div>`}
    </aside>`;
  }
  function hmIdBar(st, h) {   // Account wählen (Profil-ID + verknüpfte IDs) – jede ID hat ihr eigenes KvK
    if (hmSpect()) return hmWatchBar(h);
    const pidP = kbProfileId(), ids = [...kbMyIds()], acc = hmAcc(h), names = new Map((kbRows || []).map(r => [String(r.player_id), r.self_name])); if (!kbSiteNames) kbLoadSiteNames();
    const chip = (id) => { const on = id === acc, own = id === pidP; return `<span class="inline-flex items-center rounded-xl border ${on ? 'border-gold-500 bg-gold-500/15 text-gold-200' : 'border-ink-600 text-slate-300 hover:border-gold-500/60'}" translate="no">
      <button type="button" data-hmacc="${esc(id)}" class="px-2.5 py-1 text-xs font-semibold">${own ? '👤' : '🔗'} ${esc(kbIdName(id, names)) || '<span class="text-slate-500">?</span>'} <span class="tabular-nums ${on ? 'text-gold-300/80' : 'text-slate-500'}">${esc(id)}</span></button>${kbSiteNames?.get(id) ? '' : `<button type="button" data-hmidname="${esc(id)}" class="pr-1 text-slate-500 hover:text-gold-300" title="Namen eintragen">✏️</button>`}${own ? '' : `<button type="button" data-kbunlink="${esc(id)}" class="pr-2 text-slate-500 hover:text-red-300" title="Verknüpfung lösen">✕</button>`}</span>`; };
    const ak = hmAk(h), start = hmStart(h);
    return `<div class="rounded-xl border border-ink-700 bg-ink-950/60 p-2.5 mb-3 flex flex-wrap items-center gap-2">
      <span class="text-xs text-slate-400">🆔 <b class="text-gold-200" translate="no">${esc(kbIdName(acc, names) || acc)}</b></span>
      <span class="w-px h-6 bg-ink-700 mx-1"></span>
      <span class="text-xs text-slate-400">🏁 KvK</span>
      <input data-hmkvkcode value="${esc(ak.kvk || '')}" placeholder="C•••••" maxlength="6" spellcheck="false" class="bg-ink-950 border border-gold-500/50 rounded-xl px-3 py-1 text-sm font-bold tracking-widest text-gold-200 w-28 uppercase focus:outline-none focus:border-gold-400" translate="no">
      <span class="text-xs text-slate-400">📅</span>
      <input type="date" data-hmkvkstart value="${esc(start)}" class="bg-ink-950 border border-ink-600 rounded-xl px-2.5 py-1 text-xs text-slate-100 focus:outline-none focus:border-gold-500">
      ${(() => { const pt = hmPhaseTimes(h), loc = (t) => { if (!t) return ''; const d = new Date(t - new Date(t).getTimezoneOffset() * 6e4); return d.toISOString().slice(0, 16); }, inp = 'bg-ink-950 border border-ink-600 rounded-xl px-2 py-1 text-xs text-slate-100 focus:outline-none focus:border-gold-500';
        return `<span class="text-xs text-slate-400" title="Ab hier zählt jeder Kampf als Pass 7">⚔️ <span>Pass 7 ab</span></span><input type="datetime-local" data-hmp7 value="${esc(ak.p7 || loc(pt.p7))}" class="${inp} ${ak.p7 ? 'border-gold-500/60' : ''}">
          <span class="text-xs text-slate-400" title="Ab hier zählt jeder Kampf als Kingsland">👑 <span>Kingsland ab</span></span><input type="datetime-local" data-hmkl value="${esc(ak.kl || loc(pt.kl))}" class="${inp} ${ak.kl ? 'border-gold-500/60' : ''}">`; })()}
    </div>`;
  }
  function hmHtml(st, reload) {
    const S = hmState(st), { h, m, fights, marches, all, t0, t1, cur, zs, zsAll } = S;
    if (h.fr && !hmMates && !hmMatesLoading) hmLoadMates();
    const seg = (attr, k, l, on) => `<button type="button" ${attr}="${k}" aria-pressed="${on}" class="seg-btn rounded-lg px-2 py-1 text-xs font-semibold transition">${l}</button>`;
    const sel = 'bg-ink-950 border border-ink-600 rounded-lg px-2 py-1 text-xs text-slate-100 focus:outline-none focus:border-gold-500', pvp = h.src === 'pvp' || h.src === 'all' || h.src === 'rally', start = hmStart(h);
    const fightSel = pvp ? `<select data-hmfight class="${sel} max-w-[22rem]"><option value="">🎞️ Komplette Timeline</option>${fights.map(f => `<option value="${f.id}" ${h.fight === f.id ? 'selected' : ''}>⚔️ ${esc(f.name)} · ${hmWhen(f.a)}–${new Date(f.b).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })} · ${short(f.kp)} KP</option>`).join('')}</select>
      ${h.fight ? '<button type="button" data-hmfren title="Schlacht umbenennen" class="px-2 py-1 rounded-lg border border-ink-600 hover:border-gold-500/60">✏️</button>' : ''}` : '';
    const zOpt = zsAll.slice().sort((a, b) => hmZName(h, m, a.z).localeCompare(hmZName(h, m, b.z), 'de', { numeric: true }));
    const zoneSel = (big) => `<select data-hmzsel class="${sel} ${big ? 'text-sm py-1.5' : ''}"><option value="">🗺️ Alle Zonen</option>${zOpt.map(o => `<option value="${o.z}" ${h.iso === o.z ? 'selected' : ''}>${esc(hmZName(h, m, o.z))} – ${pvp ? '🏆 ' + short(o.kp) : (h.src === 'barb' ? '🪓 ' : '👹 ') + fmt(o.n)}</option>`).join('')}</select>`;
    const marchSel = `<select data-hmmarch class="${sel} text-sm py-1.5"><option value="">⚔️ Alle Märsche</option>${marches.map(x => `<option value="${esc(x)}" ${h.march === x ? 'selected' : ''}>${esc(x)}</option>`).join('')}</select>`;
    const matesBar = h.fr ? `<div class="flex flex-wrap items-center gap-1.5 text-[11px] mb-1">${hmMatesLoading ? '<span class="text-slate-500">…</span>' : !hmMates?.length ? '<span class="text-slate-500">Niemand sichtbar</span>'
      : hmMates.map((f, i) => `<span class="inline-flex items-center gap-1 rounded-md border border-ink-600 px-1.5 py-0.5"><span class="w-2 h-2 rounded-full" style="background:${HM_COL[i % HM_COL.length]}"></span><span translate="no">${esc(f.name)}</span><span class="text-slate-500">${f.kind === 'k' ? '👑' : '🤝'}</span></span>`).join('')}</div>` : '';
    // Märsche groß: zwei Kommandanten-Bilder, Name, Werte
    const mine = S.upto.filter(p => p.mine && (h.src !== 'all' || p.k === 'pvp')), ml = hmMarches(mine, pvp ? 'pvp' : h.src);
    const icon = (n) => hmHeroImg(n, 'w-12 h-12 rounded-xl');
    const st6 = (l, v, c) => `<div><div class="text-[10px] text-slate-500">${l}</div><div class="font-semibold tabular-nums ${c || 'text-slate-100'}">${v}</div></div>`;
    const marchCards = ml.map(([k, w, tt]) => `<div class="rounded-xl border border-ink-700 bg-ink-950/60 p-3 flex items-center gap-3">
        <div class="flex gap-1 shrink-0">${k.startsWith('Rally') ? '<span class="w-12 h-12 rounded-xl grid place-items-center bg-sky-500/15 border border-sky-500/40 text-xl">🛡️</span>' : String(k).split(' / ').slice(0, 2).map(icon).join('')}</div>
        <div class="min-w-0 flex-1"><div class="flex items-center gap-1.5 min-w-0"><div class="text-sm font-semibold text-slate-100 truncate" translate="no" title="${esc(k)}">${esc(k)}</div>${kbTTChip(tt)}</div>
          <div class="grid grid-cols-3 gap-x-3 gap-y-1 mt-1 text-sm">${pvp ? st6('🏆 KP', short(w.kp), 'text-gold-200') + st6('⚖️ Trade', hmTradeTxt(w.trade), w.trade >= 1 ? 'text-emerald-300' : 'text-red-300') + st6('🔁 KP-Trade', hmKptTxt(w.kpt), w.kpt >= 1 ? 'text-emerald-300' : 'text-red-300') : st6(h.src === 'barb' ? '🪓 Barbaren' : '👹 Kahar', fmt(w.n), 'text-gold-200')}</div></div></div>`).join('');
    const zoneChips = `<button type="button" data-hmzf="" aria-pressed="${h.iso == null}" class="seg-btn rounded-lg px-2.5 py-1 text-xs font-semibold">🗺️ Alle</button>` + zOpt.map(o => `<button type="button" data-hmzf="${o.z}" aria-pressed="${h.iso === o.z}" class="seg-btn rounded-lg px-2.5 py-1 text-xs font-semibold"><span translate="no">${esc(hmZName(h, m, o.z))}</span> <span class="text-gold-300 tabular-nums">${pvp ? short(o.kp) : fmt(o.n)}</span></button>`).join('');
    // Alle Kämpfe: ein Bericht = eine Zeile (weitere Gegner aufklappbar) · Barbaren: Ketten desselben Marsches zusammengefasst
    const mkOf = (p) => p.joined ? 'Rally (Teilnehmer)' : kbMarchOf(p.r), marchCell = (mk, joined) => `<div class="flex items-center gap-1.5 min-w-0">${joined ? '🛡️' : `<span class="flex gap-0.5 shrink-0">${hmHeroes(mk)}</span>`}<span class="truncate max-w-[10rem]" translate="no">${esc(mk)}</span></div>`;
    const tog = (key, n) => `<button type="button" data-hmsub="${esc(key)}" class="ml-1 px-1.5 rounded-md border border-ink-600 text-[10px] text-slate-300 hover:border-gold-500/60">${hmSubOpen.has(key) ? '▴' : '▾'} ${n}</button>`;
    const subCls = (key) => `data-subof="${esc(key)}" class="${hmSubOpen.has(key) ? '' : 'hidden '}bg-ink-900/40 border-t border-ink-800/40 text-slate-300"`;
    let groups = [];
    if (pvp) { const B = new Map(); mine.forEach(p => { const k = String(p.r.mail_id || p.t); (B.get(k) || B.set(k, []).get(k)).push(p); });
      groups = [...B.entries()].map(([k, pts]) => ({ k, pts: pts.sort((a, b) => hmKP(b.r) - hmKP(a.r)), t: Math.min(...pts.map(p => p.t)) })); }
    else { let cur = null; mine.slice().sort((a, b) => a.t - b.t).forEach(p => { const mk = mkOf(p);   // Kette: gleicher Marsch, max. 5 min Abstand
        if (cur && cur.mk === mk && p.t - cur.last <= 5 * 6e4) { cur.pts.push(p); cur.last = p.t; } else { cur = { k: 'c' + p.t + mk, mk, pts: [p], t: p.t, last: p.t }; groups.push(cur); } }); }
    groups.sort((a, b) => b.t - a.t); const bl = groups, blShow = bl.slice(0, 300);
    const enemy = (r) => (r.enemy_alliance ? `[${r.enemy_alliance}] ` : '') + (r.enemy_name || '');
    const pvpCells = (w, r, joined) => `<td class="pr-2 text-right tabular-nums text-gold-200">${short(w.kp)}</td><td class="pr-2 text-right tabular-nums text-sky-200">${w.acc ? short(w.acc) : '–'}</td><td class="pr-2 text-right tabular-nums ${w.trade >= 1 ? 'text-emerald-300' : 'text-red-300'}">${hmTradeTxt(w.trade)}</td><td class="pr-2 text-right tabular-nums whitespace-nowrap ${w.kpt >= 1 ? 'text-emerald-300' : 'text-red-300'}">${hmKptTxt(w.kpt)}</td><td class="pr-2 text-right tabular-nums text-red-300">${short(w.dead)}</td>
      <td class="text-right">${joined || !r ? '' : `<button type="button" data-kbdetail="${esc(r.mail_id)}|${esc(r.opponent_id)}" class="px-2 py-0.5 rounded-lg border border-gold-500/40 text-gold-200 hover:bg-gold-500/10">🔍</button>`}</td>`;
    const blRows = blShow.map(g => { const p0 = g.pts[0], r = p0.r, mk = mkOf(p0), w = hmSum(g.pts), n = g.pts.length;
      if (pvp) { const main = `<tr ${p0.joined ? '' : 'data-kbrow'} class="border-t border-ink-800/70 hover:bg-ink-900/60 ${p0.joined ? '' : 'cursor-pointer'}"><td class="py-1.5 pr-2 tabular-nums text-slate-400 whitespace-nowrap">${hmWhen(g.t)}</td><td class="pr-2 whitespace-nowrap" translate="no">${esc(hmZName(h, m, p0.z))}</td><td class="pr-2">${marchCell(mk, p0.joined)}</td>
          <td class="pr-2 text-red-200 whitespace-nowrap"><span class="inline-block truncate max-w-[12rem] align-middle" translate="no">${esc(enemy(r))}</span>${n > 1 ? tog(g.k, '+' + (n - 1)) : ''}</td>${pvpCells(w, r, p0.joined)}</tr>`;
        return main + (n > 1 ? g.pts.map(p => `<tr ${subCls(g.k)}><td class="py-1 pr-2 pl-3 text-slate-500">↳</td><td></td><td></td><td class="pr-2 text-red-200 truncate max-w-[12rem]" translate="no">${esc(enemy(p.r))}</td>${pvpCells(hmSum([p]), p.r, p.joined)}</tr>`).join('') : ''); }
      const lv = [...new Set(g.pts.map(p => +p.r.npc_level).filter(Boolean))].sort((a, b) => a - b), lvTxt = lv.length ? 'Lv ' + (lv.length > 1 ? lv[0] + '–' + lv[lv.length - 1] : lv[0]) : '';
      const main = `<tr ${n > 1 ? `data-hmsubrow="${esc(g.k)}"` : ''} class="border-t border-ink-800/70 hover:bg-ink-900/60 ${n > 1 ? 'cursor-pointer' : ''}"><td class="py-1.5 pr-2 tabular-nums text-slate-400 whitespace-nowrap">${hmWhen(g.t)}</td><td class="pr-2 whitespace-nowrap" translate="no">${esc(hmZName(h, m, p0.z))}</td><td class="pr-2">${marchCell(mk, p0.joined)}</td>
        <td class="pr-2 text-right whitespace-nowrap">${n > 1 ? `<span class="rounded-md bg-sky-500/15 border border-sky-500/40 text-sky-200 px-1.5 py-0.5 text-[11px] font-semibold">⛓️ Chain ×${n}</span>${tog(g.k, '')}` : ''}</td><td class="pr-2 text-right tabular-nums whitespace-nowrap">${lvTxt}</td></tr>`;
      return main + (n > 1 ? g.pts.map(p => `<tr ${subCls(g.k)}><td class="py-1 pr-2 pl-3 tabular-nums text-slate-500">↳ ${new Date(p.t).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</td><td class="pr-2" translate="no">${esc(hmZName(h, m, p.z))}</td><td></td><td></td><td class="pr-2 text-right tabular-nums">${p.r.npc_level ? 'Lv ' + esc(p.r.npc_level) : ''}</td></tr>`).join('') : ''); }).join('');
    const th = (l, r) => `<th class="py-1 pr-2 font-medium ${r ? 'text-right' : 'text-left'}">${l}</th>`;
    const blHead = `<tr class="text-[11px] text-slate-500">${th('Zeit')}${th('Zone')}${th('Marsch')}${pvp ? th('Gegner') + th('🏆 KP', 1) + th('🎖️ Acclaim', 1) + th('⚖️ Trade', 1) + th('🔁 KP-Trade', 1) + th('💀 Deads', 1) + th('') : th('Kette', 1) + th('Stufe', 1)}</tr>`;
    // 📜 Battlereport: Rally, Garnison und City-Rally einzeln – zählen nicht in die normalen Werte
    let brHtml = '';
    if (h.src === 'pvp' || h.src === 'all') {
      const G = hmPoints(st, 'rally', hmRange(h, fights), false).filter(p => p.mine), B = new Map(); G.forEach(p => { const k = String(p.r.mail_id) + '|' + p.r.player_id; (B.get(k) || B.set(k, []).get(k)).push(p); });
      const L = [...B.values()].map(pts => ({ pts, p: pts[0], w: hmSum(pts) })).sort((a, b) => b.p.t - a.p.t);
      const typ = (p) => p.city ? '🏯 City-Rally' : p.joined ? '🛡️ Rally/Garnison (dabei)' : '🚩 Rally/Garnison (Anführer)';
      const rowsB = L.slice(0, 200).map(x => { const r = x.p.r, mk = x.p.joined ? [r.my_hero1, r.my_hero2].filter(Boolean).join(' / ') : kbMarchOf(r), kp = x.w.rkp, ekp = x.w.rekp, kpt = ekp > 0 ? kp / ekp : (kp ? Infinity : null);
        return `<tr class="border-t border-ink-800/70"><td class="py-2 pr-3 tabular-nums text-slate-400 whitespace-nowrap">${hmWhen(x.p.t)}</td><td class="pr-3 whitespace-nowrap text-sky-200">${typ(x.p)}</td><td class="pr-3 whitespace-nowrap" translate="no">${esc(hmZName(h, m, x.p.z))}</td>
          <td class="pr-3"><span class="flex gap-0.5" title="${esc(mk)}">${hmHeroes(mk)}</span></td><td class="pr-3 text-red-200 truncate max-w-[12rem]" translate="no">${esc(r.enemy_names || ((r.enemy_alliance ? '[' + r.enemy_alliance + '] ' : '') + (r.enemy_name || '')))}</td>
          <td class="pr-3 text-right tabular-nums text-gold-200 font-semibold">🏆 ${short(kp)}</td><td class="pr-3 text-right tabular-nums text-red-200">🗡️ ${short(ekp)}</td><td class="pr-3 text-right tabular-nums ${kpt >= 1 ? 'text-emerald-300' : 'text-red-300'}">🔁 ${hmKptTxt(kpt)}</td>
          <td class="text-right">${x.p.joined ? '' : `<button type="button" data-kbdetail="${esc(r.mail_id)}|${esc(r.opponent_id)}" class="px-2 py-0.5 rounded-lg border border-gold-500/40 text-gold-200 hover:bg-gold-500/10">🔍</button>`}</td></tr>`; }).join('');
      const tot = hmSum(G), tkpt = tot.rekp > 0 ? tot.rkp / tot.rekp : null;
      brHtml = `<details data-hmbr ${h.brOpen ? 'open' : ''} class="mt-3 rounded-xl border border-sky-500/40 bg-ink-950/60"><summary class="cursor-pointer select-none px-3 py-2 text-sm font-semibold text-sky-200">📜 Battlereport <span class="text-slate-400 font-normal">· Rally · Garnison · City-Rally</span> <span class="tabular-nums text-gold-300">(${fmt(L.length)})</span>${L.length ? ` <span class="ml-2 text-xs text-slate-300">🏆 ${short(tot.rkp)} · 🔁 ${hmKptTxt(tkpt)}</span>` : ''}</summary>
        <div class="overflow-x-auto px-3 pb-3"><table class="w-full text-xs"><tbody>${rowsB || '<tr><td class="py-2 text-slate-500">Keine Rally, Garnison oder City-Rally im Zeitraum.</td></tr>'}</tbody></table></div></details>`;
    }
    // 📈 Trade-Verlauf (eigene Auswahl: Zeitraum + Zone) und ⚡ Buff-Rechner
    let tcHtml = '';
    if (h.src === 'pvp' || h.src === 'all') {
      const bk = [30, 60, 240, 1440].includes(+h.tcB) ? +h.tcB : 60, BM = bk * 6e4, sc = h.tcR || 'top', ks0 = hmStart(h), kvA = ks0 ? Date.parse(ks0 + 'T00:00:00Z') : null, d0 = new Date(); d0.setHours(0, 0, 0, 0);
      const base0 = sc === 'top' ? mine : hmPoints(st, 'pvp', sc === 'kvk' ? [kvA, hmEnd(h)] : sc === 'today' ? [d0.getTime(), null] : [Date.now() - 864e5, null], false).filter(p => p.mine);
      const P0 = base0.filter(p => p.k === 'pvp' && !p.grp), zbOf = (z) => z >= 0 ? hmBaseName(hmZName(h, m, z)) : '';
      const zopts = [...new Set(P0.map(p => zbOf(p.z)).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'de', { numeric: true }));
      if (h.tcZ && !zopts.includes(h.tcZ)) h.tcZ = '';
      const P = h.tcZ ? P0.filter(p => zbOf(p.z) === h.tcZ) : P0, bucket = new Map();
      P.forEach(p => { const k = Math.floor(p.t / BM) * BM; (bucket.get(k) || bucket.set(k, []).get(k)).push(p); });
      const accB = String(hmAcc(h) || ''), hideB = st.buffHide || {};
      const autoB = (kbBuffs || []).filter(b => b.kind === 'exp' && b.pid === accB && !hideB[b.id]).map(b => ({ a: kbLocalIso(b.t - 4 * 36e5), d: 4, s: b.t - 4 * 36e5, e: b.t, auto: b.id }));   // 🪖 Army Expansion abgelaufen → die 4 h davor
      const buffs = (h.buffs || []).map(b => typeof b === 'string' ? { a: b, d: 4 } : b).filter(b => b && !isNaN(Date.parse(b.a))).map(b => ({ ...b, s: Date.parse(b.a), e: Date.parse(b.a) + (+b.d || 4) * 36e5 })).concat(autoB);
      // Ergebnis jedes automatischen Buffs speichern (bleibt, auch wenn die Kämpfe später nicht mehr geladen sind)
      const BR = (st.buffRes = st.buffRes || {}); let brCh = false;
      autoB.forEach(b => { if (Date.now() < b.e) return; const pts = hmPoints(st, 'pvp', [b.s - 4 * 36e5, b.e], false).filter(p => p.mine && p.k === 'pvp' && !p.grp);
        const wi = hmSum(pts.filter(p => p.t >= b.s)), wb = hmSum(pts.filter(p => p.t < b.s)), old = BR[b.auto];
        if (!old || (wi.n > (old.n || 0)) || (wb.n > (old.bn || 0))) { BR[b.auto] = { pid: accB, s: b.s, e: b.e, kp: wi.kp, ekp: wi.ekp, n: wi.n, kpt: wi.kpt === Infinity ? 999 : wi.kpt, trade: wi.trade === Infinity ? 999 : wi.trade, dead: wi.sev + wi.dead, bkp: wb.kp, bn: wb.n, bkpt: wb.kpt === Infinity ? 999 : wb.kpt }; brCh = true; } });
      if (brCh) setTimeout(savePassive, 0);
      const brList = Object.entries(BR).filter(([, r]) => r.pid === accB).sort((x, y) => y[1].e - x[1].e).slice(0, 15);
      const brHtml = brList.length ? `<div class="mt-3"><div class="text-xs font-semibold text-amber-200 mb-1">📜 <span>Army-Expansion-Verlauf</span> <span class="text-[10px] text-slate-500 font-normal">– automatisch aus der Mail „Buff Ended“: jeweils die 4 h davor, gespeichert</span></div>
        <div class="overflow-x-auto"><table class="w-full text-xs"><thead><tr class="text-slate-500"><th class="text-left pr-2"><span>Buff</span></th><th class="text-right pr-2">🏆 KP</th><th class="text-right pr-2">🔁 KP-Trade</th><th class="text-right pr-2">⚔️</th><th class="text-right pr-2">💀</th><th class="text-right pr-2"><span>4 h davor</span></th><th class="text-right"><span>Unterschied</span></th></tr></thead><tbody>
        ${brList.map(([id, r]) => { const dif = r.kp - (r.bkp || 0); return `<tr class="border-t border-ink-800/60"><td class="py-1 pr-2 whitespace-nowrap text-amber-100">🪖 ${hmWhen(r.s)} – ${new Date(r.e).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}</td><td class="pr-2 text-right tabular-nums text-gold-200">${short(r.kp)}</td><td class="pr-2 text-right tabular-nums ${r.kpt >= 1 ? 'text-emerald-300' : 'text-red-300'}">${r.n ? hmKptTxt(r.kpt >= 999 ? Infinity : r.kpt) : '–'}</td><td class="pr-2 text-right tabular-nums">${fmt(r.n)}</td><td class="pr-2 text-right tabular-nums text-red-200">${short(r.dead || 0)}</td><td class="pr-2 text-right tabular-nums text-slate-400">${short(r.bkp || 0)}</td><td class="text-right tabular-nums font-semibold ${dif >= 0 ? 'text-emerald-300' : 'text-red-300'}">${dif >= 0 ? '+' : '−'}${short(Math.abs(dif))}</td></tr>`; }).join('')}</tbody></table></div></div>` : '';
      const inBuff = (t) => buffs.some(b => t >= b.s && t < b.e);
      const ks = [...bucket.keys()].sort((a, b) => a - b), rowsT = ks.map(k => ({ k, w: hmSum(bucket.get(k)) }));
      hmTC = { labels: rowsT.map(x => new Date(x.k).toLocaleString('de-DE', bk >= 1440 ? { day: '2-digit', month: '2-digit' } : { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })), trade: rowsT.map(x => x.w.trade === Infinity || x.w.trade == null ? null : Math.round(x.w.trade * 100)), kpt: rowsT.map(x => x.w.kpt === Infinity || x.w.kpt == null ? null : +x.w.kpt.toFixed(2)), kp: rowsT.map(x => x.w.kp), buff: rowsT.map(x => buffs.some(b => x.k + BM > b.s && x.k < b.e)) };
      const segB = (attr, v, l, on) => `<button type="button" ${attr}="${v}" aria-pressed="${on}" class="seg-btn rounded-md px-2 py-0.5 text-[11px] font-semibold">${l}</button>`;
      // Buff-Auswertung
      const pin = P.filter(p => inBuff(p.t)), pout = P.filter(p => !inBuff(p.t)), wi = hmSum(pin), wo = hmSum(pout), hrs = (L) => new Set(L.map(p => Math.floor(p.t / 36e5))).size || 1;
      const rIn = wi.kp / hrs(pin), rOut = wo.kp / hrs(pout), gain = pin.length && pout.length ? (rIn - rOut) * hrs(pin) : null;
      const cell = (l, a, b, f) => `<tr class="border-t border-ink-800/60"><td class="py-1 pr-3 text-slate-400">${l}</td><td class="pr-3 text-right tabular-nums text-amber-200 font-semibold">${f(a)}</td><td class="text-right tabular-nums text-slate-300">${f(b)}</td></tr>`;
      const now = Date.now(), act = buffs.find(b => now >= b.s && now < b.e), left = act ? act.e - now : 0;
      const buffHtml = `<details data-hmbuff ${h.buffOpen !== false ? 'open' : ''} class="mt-3 rounded-xl border border-amber-500/50 bg-amber-500/5"><summary class="cursor-pointer select-none px-3 py-2 text-sm font-semibold text-amber-200">⚡ <span>Buff-Rechner</span>${act ? ` <span class="ml-2 inline-flex items-center gap-1 rounded-full bg-amber-500/20 border border-amber-400/60 px-2 py-0.5 text-xs"><span class="w-2 h-2 rounded-full bg-amber-400 animate-pulse"></span><span>läuft noch</span> ${Math.floor(left / 36e5)} h ${Math.floor(left % 36e5 / 6e4)} min</span>` : ''}</summary>
        <div class="px-3 pb-3">
          <div class="flex flex-wrap items-center gap-2 text-xs">
            <button type="button" data-hmbuffnow class="px-3 py-1.5 rounded-xl bg-amber-500 text-ink-950 font-bold hover:bg-amber-400">⚡ <span>Buff jetzt starten</span></button>
            <span class="text-slate-400"><span>Dauer</span></span><input type="number" data-hmbuffd min="0.5" max="24" step="0.5" value="${esc(h.buffD || 4)}" class="w-16 bg-ink-950 border border-amber-500/50 rounded-lg px-2 py-1 text-xs text-slate-100"> <span class="text-slate-400">h</span>
            <span class="text-slate-500 mx-1">·</span><span class="text-slate-400"><span>oder Start</span></span><input type="datetime-local" data-hmbuffin class="bg-ink-950 border border-amber-500/50 rounded-lg px-2 py-1 text-xs text-slate-100"><button type="button" data-hmbuffadd class="px-2.5 py-1 rounded-lg border border-amber-500/50 text-amber-200 hover:bg-amber-500/10">+ <span>Buff</span></button>
          </div>
          ${buffs.length ? `<div class="flex flex-wrap gap-1.5 mt-2">${buffs.map((b, i) => `<span class="inline-flex items-center gap-1 rounded-lg border ${now >= b.s && now < b.e ? 'border-amber-300 bg-amber-500/25' : 'border-amber-500/40 bg-amber-500/10'} px-2 py-0.5 text-xs text-amber-100" ${b.auto ? 'title="Automatisch aus der Mail „Army Expansion abgelaufen“"' : ''}>${b.auto ? '🪖' : '⚡'} ${hmWhen(b.s)} – ${new Date(b.e).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })} <span class="text-slate-400">(${+b.d || 4} h${b.auto ? ' · auto' : ''})</span>${b.auto ? `<button type="button" data-hmbuffhide="${esc(b.auto)}" class="text-slate-400 hover:text-red-300">✕</button>` : `<button type="button" data-hmbuffx="${i}" class="text-slate-400 hover:text-red-300">✕</button>`}</span>`).join('')}</div>
          <div class="mt-3 grid sm:grid-cols-[minmax(0,1fr)_15rem] gap-3 items-start"><table class="w-full text-xs"><thead><tr class="text-slate-500"><th></th><th class="text-right pr-3">⚡ <span>mit Buff</span></th><th class="text-right"><span>ohne</span></th></tr></thead><tbody>
            ${cell('🏆 KP pro Kampfstunde', rIn, rOut, short)}${cell('🏆 KP gesamt', wi.kp, wo.kp, short)}${cell('⚖️ Trade', wi.trade, wo.trade, hmTradeTxt)}${cell('🔁 KP-Trade', wi.kpt, wo.kpt, hmKptTxt)}${cell('💀 Verluste (schwer + tot)', wi.sev + wi.dead, wo.sev + wo.dead, short)}${cell('⚔️ Kämpfe', wi.n, wo.n, fmt)}</tbody></table>
            <div class="rounded-xl border border-amber-500/50 bg-amber-500/10 p-3"><div class="text-[11px] text-slate-400"><span>Der Buff hat gebracht</span></div><div class="text-2xl font-bold tabular-nums ${gain == null ? 'text-slate-400' : gain >= 0 ? 'text-emerald-300' : 'text-red-300'}">${gain == null ? '–' : (gain >= 0 ? '+' : '−') + short(Math.abs(gain)) + ' KP'}</div>
              <div class="text-[11px] text-slate-400">${!pin.length ? '<span>Keine Kämpfe im Buff-Zeitraum.</span>' : !pout.length ? '<span>Zum Vergleich fehlen Kämpfe ohne Buff im Zeitraum.</span>' : rOut > 0 ? `${rIn >= rOut ? '+' : ''}${Math.round((rIn / rOut - 1) * 100)} % <span>KP pro Stunde</span>` : ''}</div>
              <div class="text-[10px] text-slate-500 mt-1"><span>Gerechnet mit</span>: ${sc === 'kvk' ? '<span>Ganzes KvK</span>' : sc === 'today' ? '<span>Heute</span>' : sc === 'h24' ? '24 h' : '<span>Zeitraum oben</span>'}${h.tcZ ? ' · ' + esc(h.tcZ) : ''}</div></div></div>` : '<div class="text-xs text-slate-500 mt-2">Noch kein Buff eingetragen.</div>'}
          ${brHtml}
        </div></details>`;
      tcHtml = buffHtml + `<details data-hmtc ${h.tcOpen !== false ? 'open' : ''} class="mt-3 rounded-xl border border-ink-700 bg-ink-950/60"><summary class="cursor-pointer select-none px-3 py-2 text-sm font-semibold text-slate-200">📈 <span>Trade-Verlauf</span></summary>
        <div class="px-3 pb-3"><div class="flex flex-wrap items-center gap-2 mb-2 text-xs">
          <span class="flex gap-0.5 p-0.5 rounded-lg bg-ink-950 border border-ink-700">${[['top', 'Zeitraum oben'], ['today', 'Heute'], ['h24', '24 h'], ['kvk', 'Ganzes KvK']].map(([v, l]) => segB('data-hmtcr', v, `<span>${l}</span>`, sc === v)).join('')}</span>
          <span class="flex gap-0.5 p-0.5 rounded-lg bg-ink-950 border border-ink-700">${segB('data-hmtcz', '', '🗺️ <span>Alle</span>', !h.tcZ)}${zopts.map(z => segB('data-hmtcz', esc(z), esc(z), h.tcZ === z)).join('')}</span>
          <span class="flex gap-0.5 p-0.5 rounded-lg bg-ink-950 border border-ink-700">${[[30, '30 min'], [60, '1 h'], [240, '4 h'], [1440, '1 Tag']].map(([v, l]) => segB('data-hmtcb', v, l, bk === v)).join('')}</span>
        </div>
        ${rowsT.length ? '<div class="h-60"><canvas id="hmTradeChart"></canvas></div>' : '<div class="text-xs text-slate-500">Keine Kämpfe in dieser Auswahl.</div>'}</div></details>`;
    }
    // 💪 Flex: ganze Battle Streaks (Hauptbericht) ab 2 Mio. KP – nur Märsche, KP und Trade
    let flexHtml = '';
    if (h.src === 'pvp' || h.src === 'all') {
      const F = new Map(), fmin = +h.flexMin || 2e6; mine.filter(p => p.k === 'pvp' && !p.grp).forEach(p => { const k = String(p.r.parent_id || p.r.mail_id); (F.get(k) || F.set(k, []).get(k)).push(p); });
      const L = [...F.values()].map(pts => { const zk = {}; pts.forEach(p => { zk[p.z] = (zk[p.z] || 0) + hmKP(p.r); }); const z = +Object.entries(zk).sort((a, b) => b[1] - a[1])[0][0];
        return { pts, w: hmSum(pts), t: Math.min(...pts.map(p => p.t)), z, mk: [...new Set(pts.map(p => kbMarchOf(p.r)))] }; }).filter(x => x.w.kp >= fmin).sort((a, b) => b.t - a.t);
      const rowsF = L.slice(0, 200).map(x => `<tr class="border-t border-ink-800/70"><td class="py-2 pr-3 tabular-nums text-slate-400 whitespace-nowrap">${hmWhen(x.t)}</td><td class="pr-3 whitespace-nowrap" translate="no">${esc(hmZName(h, m, x.z))}</td>
        <td class="pr-3"><div class="flex flex-wrap gap-2">${x.mk.slice(0, 4).map(k => `<span class="flex gap-0.5" title="${esc(k)}">${hmHeroes(k)}</span>`).join('')}</div></td>
        <td class="pr-3 text-right tabular-nums text-gold-200 font-bold text-sm">🏆 ${short(x.w.kp)}</td><td class="text-right tabular-nums font-semibold ${x.w.trade >= 1 ? 'text-emerald-300' : 'text-red-300'}">⚖️ ${hmTradeTxt(x.w.trade)}</td></tr>`).join('');
      flexHtml = `<details data-hmflex ${h.flexOpen !== false ? 'open' : ''} class="mt-3 rounded-xl border border-gold-500/40 bg-ink-950/60"><summary class="cursor-pointer select-none px-3 py-2 text-sm font-semibold text-gold-200">💪 Flex <span class="text-gold-300 tabular-nums">(${fmt(L.length)})</span>
          <select data-hmflexmin onclick="event.stopPropagation()" class="ml-2 bg-ink-950 border border-ink-600 rounded-lg px-1.5 py-0.5 text-xs text-slate-100">${[1e6, 2e6, 5e6, 10e6].map(v => `<option value="${v}" ${fmin === v ? 'selected' : ''}>≥ ${short(v)} KP</option>`).join('')}</select></summary>
        <div class="overflow-x-auto px-3 pb-3"><table class="w-full text-xs"><tbody>${rowsF || '<tr><td class="py-2 text-slate-500">Noch kein Battle Streak über dieser Grenze.</td></tr>'}</tbody></table></div></details>`;
    }
    return `<style>#battlesView:fullscreen{overflow-y:auto;padding:12px;background:#07090f}#battlesView:fullscreen #hmBox{width:min(100%,calc(100vh - 170px));margin:0 auto}</style>
      <section class="panel rounded-2xl p-4 sm:p-5 mt-4"><div class="flex items-center gap-2 mb-3"><h2 class="font-display text-lg text-gold-300">🔥 <span>Heatmap</span></h2><span class="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/15 border border-amber-500/40 text-amber-300">TEST</span><span class="flex gap-1 p-1 rounded-xl bg-ink-950 border border-ink-700 ml-2"><button type="button" data-hmmode="my" aria-pressed="${!hmSpect()}" ${kbMyIds().size ? '' : 'disabled'} class="seg-btn rounded-lg px-3 py-1 text-xs font-semibold disabled:opacity-40">🏠 My KvK</button><button type="button" data-hmmode="watch" aria-pressed="${hmSpect()}" class="seg-btn rounded-lg px-3 py-1 text-xs font-semibold">👁️ Watch</button></span><button type="button" data-hmlink class="ml-2 px-3 py-1 rounded-xl border border-gold-500/50 text-gold-200 hover:bg-gold-500/10 text-xs font-semibold">🔗 <span>Link teilen</span></button><span class="ml-auto">${reload}</span></div>
      ${S.live.length ? `<div class="flex flex-wrap items-center gap-1.5 mb-3">${S.live.map(x => `<span class="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/60 bg-emerald-500/10 px-2.5 py-1 text-xs text-emerald-200"><span class="relative flex w-2.5 h-2.5"><span class="absolute inset-0 rounded-full bg-emerald-400 animate-ping"></span><span class="relative w-2.5 h-2.5 rounded-full bg-emerald-400"></span></span><b translate="no">${esc(x.name)}</b> <span>fightet</span></span>`).join('')}</div>` : ''}
      ${hmIdBar(st, h)}
      <div class="flex flex-wrap items-center gap-2 mb-2 text-xs">
        <div class="flex flex-wrap gap-1 p-1 rounded-xl bg-ink-950 border border-ink-700">${HM_SRC.filter(x => !hmSpect() || x[0] === 'pvp').map(([k, l, c]) => seg('data-hmsrc', k, `<span class="inline-block w-2 h-2 rounded-full mr-1" style="background:${c}"></span>${l}`, h.src === k)).join('')}</div>
        <div class="flex flex-wrap gap-1 p-1 rounded-xl bg-ink-950 border border-ink-700">${HM_T.map(([k, l]) => seg('data-hmt', k, l, !h.fight && h.t === k)).join('')}</div>
        <span class="flex items-center gap-1 p-1 rounded-xl bg-ink-950 border ${h.hf || h.ht ? 'border-gold-500/60' : 'border-ink-700'}" title="Nur Kämpfe in dieser Uhrzeit (jeden Tag)"><span class="px-1">🕒</span><input type="time" data-hmhf value="${esc(h.hf || '')}" class="bg-transparent text-xs text-slate-100 focus:outline-none w-[5.5rem]"><span class="text-slate-500">–</span><input type="time" data-hmht value="${esc(h.ht || '')}" class="bg-transparent text-xs text-slate-100 focus:outline-none w-[5.5rem]">${h.hf || h.ht ? '<button type="button" data-hmhx class="px-1.5 text-slate-400 hover:text-red-300">✕</button>' : ''}</span>
      </div>
      ${!h.fight && h.t === 'custom' ? `<div class="flex flex-wrap items-center gap-2 mb-2 text-xs"><span class="text-slate-400">Von</span><input type="datetime-local" data-hmfrom value="${esc(h.from || (start ? start + 'T00:00' : ''))}" class="${sel}"><span class="text-slate-400">bis</span><input type="datetime-local" data-hmto value="${esc(h.to || '')}" class="${sel}"></div>` : ''}
      ${hmDays(h, S)}
      <div class="flex flex-wrap items-center gap-2 mb-2 text-xs">
        <label class="flex items-center gap-1 text-slate-400" title="Alle Teleports deiner Stadt als Linie"><input type="checkbox" data-hmcpath ${h.cpath ? 'checked' : ''} class="accent-emerald-400"> <span>🏙️ Stadt-Weg</span></label>
        <label class="flex items-center gap-1 text-slate-400"><input type="checkbox" data-hmzm ${h.zm ? 'checked' : ''} class="accent-amber-400"> <span>Zonen-Marker</span></label>
        <label class="flex items-center gap-1 text-slate-400"><input type="checkbox" data-hmfr ${h.fr ? 'checked' : ''} class="accent-amber-400"> <span>👥 Freunde &amp; Königreich</span></label>
        ${zoneSel(false)}
        <label class="flex items-center gap-1 text-slate-400"><span>Glühen</span> <input type="range" min="1" max="8" value="${h.rad}" data-hmrad class="accent-amber-400 w-20"></label>
        <span class="ml-auto flex flex-wrap items-center gap-1"><span class="flex gap-1 p-0.5 rounded-lg bg-ink-950 border border-ink-700">${HM_MAPS.map(x => `<button type="button" data-hmmap="${x.k}" aria-pressed="${h.map === x.k}" class="seg-btn rounded-md px-2 py-0.5 text-[11px] font-semibold" translate="no">🗺️ ${esc(x.n)}</button>`).join('')}</span>
          <button type="button" data-hmcal class="px-2 py-1 rounded-lg border ${hmCalMode ? 'border-emerald-400 text-emerald-300' : 'border-ink-600'} hover:border-gold-500/60" title="Auf die Stelle klicken, an der deine Stadt im Spiel wirklich steht">📍 <span>${hmCalMode ? 'Jetzt auf deine Stadt klicken …' : 'Stadt kalibrieren'}</span></button>
          ${h.ux ? '<button type="button" data-hmcalx class="px-2 py-1 rounded-lg border border-ink-600 hover:border-gold-500/60" title="Kalibrierung zurücksetzen">↺</button>' : ''}</span>
      </div>
      ${matesBar}
      <div class="grid lg:grid-cols-[minmax(0,1fr)_19rem] xl:grid-cols-[9.5rem_minmax(0,1fr)_19rem] gap-3 items-start mt-2">${hmQuickHtml(st, h)}<div id="hmWrap" class="bg-ink-950 rounded-xl">
        ${h.iso != null ? `<div class="flex items-center gap-2 mb-1 text-xs"><span class="text-amber-300 font-semibold">🔍 <span translate="no">${esc(hmZName(h, m, h.iso))}</span></span><button type="button" data-hmiso="${h.iso}" class="px-2 py-0.5 rounded-lg border border-ink-600 hover:border-gold-500/60">✕ <span>Alle Zonen</span></button></div>` : ''}
        <div id="hmBox" class="relative w-full aspect-square rounded-xl overflow-hidden border border-ink-700 bg-ink-950 ${hmCalMode ? 'cursor-crosshair' : 'cursor-grab'} touch-none select-none">
          <div id="hmStage" class="absolute inset-0 origin-top-left">
            <img src="${esc(m.img)}" alt="" class="absolute inset-0 w-full h-full select-none pointer-events-none" draggable="false" decoding="async" onerror="this.style.display='none';document.getElementById('hmNoImg')?.classList.remove('hidden')">
            <canvas id="hmCanvas" width="1600" height="1600" class="absolute inset-0 w-full h-full pointer-events-none"></canvas>
          </div>
          <canvas id="hmDots" class="absolute inset-0 w-full h-full pointer-events-none"></canvas>
          <div id="hmMarks" class="absolute inset-0 pointer-events-none overflow-hidden"></div>
          <div id="hmNoImg" class="hidden absolute inset-0 grid place-items-center text-sm text-slate-500 p-6 text-center">${esc(m.img)}</div>
          <div class="absolute top-2 right-2 flex flex-col gap-1 z-40">
            ${[['in', '＋', 'Hineinzoomen'], ['out', '－', 'Herauszoomen'], ['fit', '🎯', 'Auf Kämpfe zoomen'], ['reset', '⤢', 'Ganze Karte'], ['full', '⛶', 'Vollbild'], ['png', '📷', 'Als Bild speichern'], ['vid', '🎬', 'Replay als Video speichern']].map(([k, i, t]) => `<button type="button" data-hmz="${k}" title="${t}" class="w-9 h-9 rounded-lg bg-ink-950/85 border border-ink-600 hover:border-gold-500/60 text-base">${i}</button>`).join('')}
          </div>
          <div id="hmTip" class="hidden absolute z-50 pointer-events-none rounded-lg border border-ink-600 bg-ink-950/95 px-2 py-1 text-[11px] text-slate-200 whitespace-nowrap"></div>
        </div>
        <div class="mt-2 rounded-xl border border-ink-700 bg-ink-950/70 p-2">
          <div class="flex flex-wrap items-center gap-2 text-xs"><button type="button" data-hmtlopen class="px-2.5 py-1 rounded-lg border border-ink-600 hover:border-gold-500/60 font-semibold text-slate-200">🎞️ <span>Timeline</span> ${h.tlOpen ? '▴' : '▾'}</button>${fightSel}</div>
          ${h.tlOpen ? `<div class="flex flex-wrap items-center gap-2 text-xs mt-2">
            <button type="button" data-hmplay class="px-3 py-1 rounded-lg border border-gold-500/50 text-gold-200 hover:bg-gold-500/10 font-semibold">${hmPlay ? '⏸ Pause' : '▶ Abspielen'}</button>
            <span class="flex gap-0.5">${[1, 4, 16].map(x => seg('data-hmspeed', x, '×' + x, h.speed === x)).join('')}</span>
            <span class="font-semibold text-slate-200 tabular-nums" id="hmTlLabel">${cur == null ? '<span>Alles</span>' : hmWhen(cur)}</span>
            <span class="text-slate-500">· <span>Spur</span>:</span>${HM_TRAIL.map(([k, l]) => seg('data-hmtrail', k, l, +h.trail === k)).join('')}
            <label class="ml-auto flex items-center gap-1 text-slate-400"><input type="checkbox" data-hmpngmk ${h.pngMk ? 'checked' : ''} class="accent-amber-400"> <span>📷 Marker ins Bild</span></label>
            ${cur != null ? '<button type="button" data-hmtlx class="px-2 py-1 rounded-lg border border-ink-600 hover:border-gold-500/60">✕</button>' : ''}
          </div>
          <input type="range" data-hmtl min="${t0}" max="${t1}" step="60000" value="${cur == null ? t1 : cur}" class="w-full accent-amber-400 mt-1" ${all.length < 2 ? 'disabled' : ''}>
          <div class="flex justify-between text-[10px] text-slate-500 tabular-nums"><span>${all.length ? hmWhen(t0) : ''}</span><span>${all.length ? hmWhen(t1) : ''}</span></div>` : ''}
        </div>
      </div>${hmLivePanel(S)}</div>
      ${!kbPosCols ? '<div class="mt-2 text-xs text-amber-300">SQL für die Heatmap fehlt noch in Supabase.</div>' : ''}
      <div class="mt-5 flex flex-wrap items-center gap-2"><h3 class="font-display text-base text-gold-300 mr-2">📍 <span>Zonen</span></h3>${marchSel}</div>
      <div class="flex flex-wrap gap-1.5 mt-2">${[{ b: '', kp: S.zbList.reduce((a, x) => a + x.kp, 0), n: S.zbList.reduce((a, x) => a + x.n, 0) }, ...S.zbList].map(x => `<button type="button" data-hmzb="${esc(x.b)}" aria-pressed="${(h.zb || '') === x.b}" class="seg-btn rounded-xl px-3 py-2 text-left"><div class="text-sm font-bold" translate="no">${x.b ? esc(x.b) : '🗺️ <span>Alle</span>'}</div><div class="text-xs tabular-nums text-gold-300">${pvp ? '🏆 ' + short(x.kp) : (h.src === 'barb' ? '🪓 ' : '👹 ') + fmt(x.n)}</div></button>`).join('')}</div>
      <div class="grid md:grid-cols-2 gap-2 mt-2">${marchCards || '<div class="text-sm text-slate-500 p-2">Keine Kämpfe im Filter.</div>'}</div>
      ${hmSpect() ? '' : hmFieldHtml(st, h, m)}${hmMarksHtml(st, h, m)}${tcHtml}
      ${pvp ? hmCompare(h, S) : ''}
      ${brHtml}
      ${flexHtml || `<details data-hmbl ${h.blOpen ? 'open' : ''} class="mt-3 rounded-xl border border-ink-700 bg-ink-950/60"><summary class="cursor-pointer select-none px-3 py-2 text-sm font-semibold text-slate-200">${h.src === 'rally' ? '🛡️ <span>Rally &amp; Garnison</span>' : h.src === 'barb' ? '🪓 <span>Alle Barbaren</span>' : '👹 <span>Alle Kahar</span>'} <span class="text-gold-300 tabular-nums">(${fmt(bl.length)})</span></summary>
        <div class="overflow-x-auto px-3 pb-3"><table class="w-full text-xs"><thead>${blHead}</thead><tbody>${blRows}</tbody></table>${bl.length > blShow.length ? `<div class="text-[11px] text-slate-500 mt-1">${fmt(blShow.length)} / ${fmt(bl.length)}</div>` : ''}</div></details>`}
      </section>`;
  }
  // ---------- My KvK / Watch (Zuschauer) ----------
  var hmWInfo = {};
  function hmSpect() { const h = kbSt().heat || {}; return h.mode === 'watch' || kbMyIds().size === 0; }
  function hmWInfoCur(h) { const c = h.wkvk; if (!c) return null; const i = hmWInfo[c]; if (!i) hmLoadWInfo(c); return i && !i.loading ? i : null; }
  async function hmLoadWInfo(c) {   // wer ist in diesem KvK (C-Nummer), welche Karte, welcher Start – vom Besitzer der ID gesetzt
    hmWInfo[c] = { loading: true }; const o = { ids: new Set(), map: null, start: null, err: false };
    try { const db = RokAuth?.db?.(); if (!db) throw 0; let q = await db.from('rok_kvk_ids').select('governor_id,map,kvk_start,p7_at,kl_at').eq('kvk', c); if (q.error) q = await db.from('rok_kvk_ids').select('governor_id,map,kvk_start').eq('kvk', c); if (q.error) throw q.error;
      const mc = {}, sc = {}, p7 = {}, kl = {}; (q.data || []).forEach(x => { o.ids.add(String(x.governor_id)); if (x.map) mc[x.map] = (mc[x.map] || 0) + 1; if (x.kvk_start) sc[x.kvk_start] = (sc[x.kvk_start] || 0) + 1; if (x.p7_at) p7[x.p7_at] = (p7[x.p7_at] || 0) + 1; if (x.kl_at) kl[x.kl_at] = (kl[x.kl_at] || 0) + 1; });
      const top = (m) => Object.entries(m).sort((a, b) => b[1] - a[1])[0]?.[0] || null; o.map = top(mc); o.start = top(sc); o.p7 = top(p7); o.kl = top(kl); } catch { o.err = true; }
    hmWInfo[c] = o; if (R.view === 'battles' && kbSt().page === 'heat') renderKampf();
  }
  function hmWatchSet(h) { if (!h.wkvk) return null; const i = hmWInfoCur(h); return i ? i.ids : new Set(); }
  async function hmSyncKvk(h) {   // deine ID → KvK, Karte, Start für Zuschauer veröffentlichen
    if (hmSpect()) return; const acc = hmAcc(h), a = hmAk(h); if (!acc || !a.kvk) return; const sig = [a.kvk, a.map || h.map, a.start || hmStart(h) || '', a.p7 || '', a.kl || ''].join('|'); if (a.sync === sig) return;
    try { const db = RokAuth?.db?.(), uid = RokAuth?.userId?.(); if (!db || !uid) return;
      const row = { governor_id: acc, kvk: a.kvk, map: a.map || h.map, kvk_start: a.start || hmStart(h) || null, user_id: uid, updated_at: new Date().toISOString(), p7_at: a.p7 ? new Date(a.p7).toISOString() : null, kl_at: a.kl ? new Date(a.kl).toISOString() : null };
      let q = await db.from('rok_kvk_ids').upsert(row); if (q.error && /p7_at|kl_at/i.test(q.error.message || '')) { delete row.p7_at; delete row.kl_at; q = await db.from('rok_kvk_ids').upsert(row); }
      if (!q.error) { a.sync = sig; savePassive(); } } catch {}
  }
  function hmWatchBar(h) {
    const ws = hmWatchSet(h), wi = hmWInfoCur(h), P = new Map();
    (kbRows || []).forEach(r => { if (!r.is_pvp || r.map_role !== 'gsmp') return; const k = String(r.player_id); if (ws && !ws.has(k)) return; const o = P.get(k) || P.set(k, { n: r.self_name, kp: 0 }).get(k); o.kp += hmKP(r); });
    return `<div class="rounded-xl border border-sky-500/40 bg-sky-500/5 p-2.5 mb-3 flex flex-wrap items-center gap-2">
      <span class="text-xs text-sky-200 font-semibold">👁️ Watch</span><span class="text-xs text-slate-400">🏁 KvK</span>
      <input data-hmwkvk value="${esc(h.wkvk || '')}" placeholder="C•••••" maxlength="6" spellcheck="false" class="bg-ink-950 border border-gold-500/50 rounded-xl px-3 py-1 text-sm font-bold tracking-widest text-gold-200 w-28 uppercase focus:outline-none focus:border-gold-400" translate="no">
      ${h.wkvk ? (wi ? (wi.err ? '<span class="text-xs text-amber-300">SQL für rok_kvk_ids fehlt</span>' : `<span class="text-xs text-slate-400">${fmt(ws.size)} <span>Spieler</span></span>`) : '<span class="text-xs text-slate-500">…</span>') : ''}
      <select data-hmwatch class="bg-ink-950 border border-ink-600 rounded-xl px-2.5 py-1 text-xs text-slate-100 focus:outline-none focus:border-gold-400"><option value="">👥 Alle Spieler</option>${[...P.entries()].sort((a, b) => b[1].kp - a[1].kp).map(([k, o]) => `<option value="${esc(k)}" ${h.watch === k ? 'selected' : ''}>${esc(hmPName(k, o.n))} · ${short(o.kp)}</option>`).join('')}</select>
    </div>`;
  }
  function hmCompare(h, S) {   // Vergleich: deine Werte gegen andere Spieler im gleichen Zeitraum
    const [from, to] = hmRange(h, S.fights), ws = hmSpect() ? hmWatchSet(h) : null, P = new Map(), mp = hmMap(h), cz = h.cmpZ || '', zSeen = new Map();
    (kbRows || []).forEach(r => { if (!kbIsPvp(r) || kbIsAoo(r) || r.map_role !== 'gsmp' || !r.battle_start) return; const t = Date.parse(r.battle_start); if (from != null && t < from) return; if (to != null && t > to) return;
      const k = String(r.player_id); if (ws && !ws.has(k)) return;
      let z = -1; if (hmIn(r.pos_x, r.pos_y, r.map_role)) { const [u, v] = hmXY(+r.pos_x, +r.pos_y, h, mp); z = hmZoneAt(u, v, mp, false, Date.parse(r.battle_start)); if (z >= 0) zSeen.set(z, (zSeen.get(z) || 0) + hmKP(r)); }
      if (cz) { if (z < 0) return; const n = mp.zones.n[z] || ''; if (cz.startsWith('z:') ? +cz.slice(2) !== z : hmBaseName(n) !== cz.slice(2)) return; } (P.get(k) || P.set(k, { n: r.self_name, pts: [] }).get(k)).pts.push({ r, t }); });
    const all = [...P.entries()].map(([k, o]) => ({ k, name: hmPName(k, o.n), w: hmSum(o.pts), pts: o.pts })).sort((a, b) => b.w.kp - a.w.kp);
    if (!all.length && !cz) return '';
    const me = hmAcc(h); let ids = (h.cmp || []).filter(k => P.has(k)); if (!ids.length) ids = [...(me && P.has(me) ? [me] : []), ...all.map(x => x.k).filter(k => k !== me)].slice(0, 4);
    const sel = ids.map(k => all.find(x => x.k === k));
    const chips = all.slice(0, 20).map(x => `<button type="button" data-hmcmpp="${esc(x.k)}" aria-pressed="${ids.includes(x.k)}" class="seg-btn rounded-lg px-2 py-1 text-xs font-semibold"><span translate="no">${esc(x.name)}</span> <span class="text-gold-300 tabular-nums">${short(x.w.kp)}</span></button>`).join('');
    const bm = (x) => hmMarches(x.pts, 'pvp')[0]?.[0] || '–';
    const R0 = [['🏆 Kill Points', x => x.w.kp, short, 1], ['🏟️ LK Kills', x => x.w.lk, short, 1], ['🪦 LK Deads', x => x.w.lkD, short, 0], ['💉 LK Heal', x => x.w.lkH, short, 0], ['🎖️ Acclaim', x => x.w.acc, v => v ? short(v) : '–', 1], ['⚖️ Trade', x => x.w.trade === Infinity ? 1e9 : (x.w.trade ?? 0), (v, x) => hmTradeTxt(x.w.trade), 1],
      ['🔁 KP-Trade', x => x.w.kpt === Infinity ? 1e9 : (x.w.kpt ?? 0), (v, x) => hmKptTxt(x.w.kpt), 1], ['🗡️ Gegner-KP', x => x.w.ekp, short, 0], ['🛡️ Rally/Garnison KP-Trade', x => x.w.rkpt === Infinity ? 1e9 : (x.w.rkpt ?? 0), (v, x) => x.w.rn ? hmKptTxt(x.w.rkpt) : '–', 1], ['☠️ Gegner-Verluste', x => x.w.eLoss, short, 1], ['💀 Deads', x => x.w.dead, short, 0], ['🩸 Schwer verw.', x => x.w.sev, short, 0], ['💚 Heilung', x => x.w.heal, short, 1],
      ['⚔️ Kämpfe', x => x.w.n, fmt, 1], ['📈 KP pro Kampf', x => x.w.n ? x.w.kp / x.w.n : 0, short, 1]];
    const body = R0.map(([l, f, fm, good]) => { const vals = sel.map(f), best = good ? Math.max(...vals) : null;
      return `<tr class="border-t border-ink-800/60"><td class="py-1.5 pr-3 text-slate-400 whitespace-nowrap">${l}</td>${sel.map((x, i) => `<td class="py-1.5 px-2 text-right tabular-nums ${good && vals[i] === best && sel.length > 1 && best > 0 ? 'text-emerald-300 font-bold' : 'text-slate-100'}">${fm(vals[i], x)}</td>`).join('')}</tr>`; }).join('')
      + `<tr class="border-t border-ink-800/60"><td class="py-1.5 pr-3 text-slate-400">🥇 <span>Bester Marsch</span></td>${sel.map(x => `<td class="py-1.5 px-2"><div class="flex justify-end items-center gap-1">${String(bm(x)).split(' / ').length > 1 ? `<span class="flex gap-0.5">${hmHeroes(bm(x))}</span>` : ''}<span class="text-[11px] text-slate-300 truncate max-w-[8rem]" translate="no">${esc(bm(x))}</span></div></td>`).join('')}</tr>`;
    return `<details data-hmcmp ${h.cmpOpen !== false ? 'open' : ''} class="mt-3 rounded-xl border border-ink-700 bg-ink-950/60"><summary class="cursor-pointer select-none px-3 py-2 text-sm font-semibold text-slate-200">⚖️ <span>Vergleich</span></summary>
      <div class="px-3 pb-3"><div class="flex flex-wrap items-center gap-2 mb-2"><select data-hmcmpz class="bg-ink-950 border border-gold-500/40 rounded-lg px-2 py-1 text-xs text-slate-100 focus:outline-none focus:border-gold-500"><option value="">🗺️ Alles gesamt</option>
        ${[...new Set([...zSeen.keys()].map(z => hmBaseName(mp.zones.n[z])))].sort((a, b) => a.localeCompare(b, 'de', { numeric: true })).map(b => `<option value="b:${esc(b)}" ${cz === 'b:' + b ? 'selected' : ''}>📍 ${esc(b)} (alle)</option>`).join('')}
        ${[...zSeen.keys()].sort((a, b) => hmZName(h, mp, a).localeCompare(hmZName(h, mp, b), 'de', { numeric: true })).map(z => `<option value="z:${z}" ${cz === 'z:' + z ? 'selected' : ''}>· ${esc(hmZName(h, mp, z))}</option>`).join('')}</select></div><div class="flex flex-wrap gap-1 mb-2">${chips}</div><div class="overflow-x-auto"><table class="w-full text-sm"><thead><tr class="text-xs"><th></th>${sel.map(x => `<th class="px-2 py-1 text-right font-semibold ${x.k === me ? 'text-gold-300' : 'text-slate-200'}" translate="no">${esc(x.name)}</th>`).join('')}</tr></thead><tbody>${body}</tbody></table></div></div></details>`;
  }
  function hmDays(h, S) {   // KvK-Tage (50 Tage ab Start): rot = Kämpfe, blau = Barbaren, beides = diagonal geteilt
    const kv = hmStart(h); if (!kv) return ''; const a = Date.parse(kv + 'T00:00:00Z'), N = 50, today = Math.floor((Date.now() - a) / 864e5), sp = hmSpect(), acc = hmAcc(h), ws = sp ? hmWatchSet(h) : null;
    const kp = new Array(N).fill(0), bb = new Array(N).fill(0), zk = {}, mp = hmMap(h);
    (kbRows || []).forEach(r => { const k = String(r.player_id); if (acc ? k !== acc : sp ? ((ws && !ws.has(k)) || (h.watch && k !== h.watch)) : !kbMine(k)) return;
      if (r.map_role !== 'gsmp' || !r.battle_start) return; const i = Math.floor((Date.parse(r.battle_start) - a) / 864e5); if (i < 0 || i >= N) return;
      if (r.is_pvp) { if (kbIsPvp(r) && !kbIsAoo(r)) { kp[i] += hmKP(r); if (hmIn(r.pos_x, r.pos_y, r.map_role)) { const [u, v] = hmXY(+r.pos_x, +r.pos_y, h, mp), z = hmZoneAt(u, v, mp, false, Date.parse(r.battle_start)), n = z >= 0 ? hmBaseName(mp.zones.n[z]) : ''; if (n) (zk[i] = zk[i] || {})[n] = (zk[i][n] || 0) + hmKP(r); } } }
      else if (!sp && (h.src === 'fort' ? kbCatOf(r.npc_btype, r.group_size) === 'fort' : kbCatOf(r.npc_btype, r.group_size) === 'barb')) bb[i]++; });
    const mk = Math.max(1, ...kp), mb = Math.max(1, ...bb), pvpM = h.src === 'pvp', dm = pvpM ? 'fight' : 'all', mode = h.src === 'all' ? 'both' : pvpM ? 'r' : 'b';
    const btn = (i) => { const onlyRed = mode === 'r', onlyBlue = mode === 'b'; const d = new Date(a + i * 864e5), k = d.toISOString().slice(0, 10), on = !h.fight && h.t === 'day' && h.day === k, fut = i > today;
      const ar = !onlyBlue && kp[i] ? (.35 + .6 * Math.sqrt(kp[i] / mk)).toFixed(2) : 0, ab = !onlyRed && bb[i] ? (.35 + .6 * Math.sqrt(bb[i] / mb)).toFixed(2) : 0, bl = h.src === 'fort' ? '147,51,234' : '37,99,235';
      const bg = ar && ab ? `background:linear-gradient(135deg,rgba(220,38,38,${ar}) 0 50%,rgba(${bl},${ab}) 50% 100%)` : ar ? `background:rgba(220,38,38,${ar})` : ab ? `background:rgba(${bl},${ab})` : '';
      return `<button type="button" data-hmday="${k}" ${fut ? 'disabled' : ''} title="${d.toLocaleDateString('de-DE')}${kp[i] ? ' · 🏆 ' + short(kp[i]) : ''}${bb[i] && !onlyRed ? (h.src === 'fort' ? ' · 👹 ' : ' · 🪓 ') + bb[i] : ''}" style="${bg}" class="min-w-[1.75rem] rounded-md px-1.5 py-0.5 text-[11px] font-semibold tabular-nums border ${fut ? 'opacity-30 border-ink-800 text-slate-500' : on ? 'border-gold-400 text-white ring-1 ring-gold-400' : 'border-ink-700 text-slate-100 hover:border-gold-500/60'}">${i + 1}</button>`; };
    let rowHtml;
    if (dm === 'fight') {   // nur Kampftage, gruppiert nach Schlacht: „Zone 4 · 7 8 9“, „Kingsland · 20“
      const nm = {}; (S.fights || []).forEach(f => { const i = Math.floor((f.a - a) / 864e5); if (i < 0 || i >= N) return; const n = h.fn[f.id] || f.base || f.auto; (nm[i] = nm[i] || {})[n] = (nm[i][n] || 0) + f.kp; });
      const G = []; for (let i = 0; i < N; i++) { if (!kp[i]) continue; const top = (o) => o ? Object.entries(o).sort((x, y) => y[1] - x[1])[0]?.[0] : null, n = top(nm[i]) || top(zk[i]) || 'Kampf', last = G[G.length - 1]; if (last && last.n === n) last.d.push(i); else G.push({ n, d: [i] }); }
      rowHtml = G.length ? G.map(g => `<span class="inline-flex items-center gap-1 rounded-lg border border-red-500/30 bg-red-500/5 pl-2 pr-1 py-0.5"><button type="button" data-hmdgrp="${esc(g.n)}" title="Alle Kämpfe in ${esc(g.n)} über das ganze KvK" class="text-[11px] font-semibold mr-0.5 rounded px-1 ${h.t === 'kvk' && !h.fight && h.zb === g.n ? 'bg-gold-500/25 text-gold-100 ring-1 ring-gold-400' : 'text-red-200 hover:bg-red-500/20 hover:text-white'}" translate="no">${esc(g.n)}</button>${g.d.map(i => btn(i)).join('')}</span>`).join('') : '<span class="text-[11px] text-slate-500">Noch keine Kampftage</span>';
    } else { const out = []; for (let i = 0; i < N; i++) out.push(btn(i)); rowHtml = out.join(''); }
    return `<div class="flex flex-wrap items-center gap-1 mb-2"><span class="text-[11px] text-slate-500 mr-1">KvK-Tag:</span>${rowHtml}</div>`;
  }
  // ---------- Zeichnen ----------
  function hmHeat(S) {
    if (hmLast && hmLast.S === S && hmLast.heat) return hmLast.heat;
    const { h, dotsM } = S, mine = dotsM.filter(p => p.mine && (h.src !== 'all' || p.k === 'pvp')), N = 300, grid = new Float32Array(N * N);
    mine.forEach(p => { const gx = Math.floor(p.u * N), gy = Math.floor(p.v * N); if (gx >= 0 && gy >= 0 && gx < N && gy < N) grid[gy * N + gx] += h.src === 'pvp' ? Math.max(1, (p.kp ?? hmKP(p.r)) / 1e4) : 1; });
    const sig = h.rad * 1.2, Rr = Math.ceil(sig * 3), ker = []; for (let i = -Rr; i <= Rr; i++) ker.push(Math.exp(-(i * i) / (2 * sig * sig)));
    const tmp = new Float32Array(N * N), out = new Float32Array(N * N); let max = 0;
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) { let a = 0; for (let k = -Rr; k <= Rr; k++) { const xx = x + k; if (xx >= 0 && xx < N) a += grid[y * N + xx] * ker[k + Rr]; } tmp[y * N + x] = a; }
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) { let a = 0; for (let k = -Rr; k <= Rr; k++) { const yy = y + k; if (yy >= 0 && yy < N) a += tmp[yy * N + x] * ker[k + Rr]; } out[y * N + x] = a; if (a > max) max = a; }
    if (!max) return null;
    const pal = h.src === 'barb' ? [[0, [147, 197, 253]], [.5, [59, 130, 246]], [1, [30, 64, 175]]] : h.src === 'fort' ? [[0, [233, 213, 255]], [.5, [168, 85, 247]], [1, [107, 33, 168]]] : [[0, [253, 224, 71]], [.35, [251, 146, 60]], [.7, [239, 68, 68]], [1, [185, 28, 28]]];
    const img = new ImageData(N, N);
    for (let i = 0; i < N * N; i++) { const t = Math.pow(out[i] / max, .45); if (t < .05) continue; let j = 1; while (j < pal.length - 1 && t > pal[j][0]) j++;
      const [a0, c0] = pal[j - 1], [a1, c1] = pal[j], f = Math.min(1, Math.max(0, (t - a0) / (a1 - a0)));
      img.data[i * 4] = c0[0] + (c1[0] - c0[0]) * f; img.data[i * 4 + 1] = c0[1] + (c1[1] - c0[1]) * f; img.data[i * 4 + 2] = c0[2] + (c1[2] - c0[2]) * f; img.data[i * 4 + 3] = Math.min(215, t * 260); }
    const off = document.createElement('canvas'); off.width = off.height = N; off.getContext('2d').putImageData(img, 0, 0); return off;
  }
  function hmMask(h, m) { if (h.iso == null) return null; const key = m.k + ':' + h.iso; if (hmMaskC && hmMaskC.key === key) return hmMaskC.c;
    const d = m.zones, c = document.createElement('canvas'); c.width = c.height = d.w; const g = c.getContext('2d'), im = g.createImageData(d.w, d.w);
    for (let i = 0; i < d.w * d.w; i++) if (d.d.charCodeAt(i) - 97 !== h.iso) { im.data[i * 4] = 7; im.data[i * 4 + 1] = 9; im.data[i * 4 + 2] = 15; im.data[i * 4 + 3] = 242; }
    g.putImageData(im, 0, 0); hmMaskC = { key, c }; return c; }
  // Punkte + Städte: scharf, in Bildschirm-Auflösung (nicht mitvergrößert)
  function hmPaintDots(ctx, W, S, map) {   // map(u, v) → [x, y] in Pixeln
    const { h, m, dotsM: dots } = S, col = HM_SRC.find(x => x[0] === h.src)[2], dpr = W / 1000 * 1.6;
    if (h.cpath) {   // Stadt-Weg: jede neue Stadt-Position (Teleport) als Station
      const pts = [], own = (S.allA || S.all || []).filter(p => p.mine && p.r.city_x != null && hmIn(p.r.city_x, p.r.city_y, p.r.map_role)).sort((a, b) => a.t - b.t);
      own.forEach(p => { const l = pts[pts.length - 1]; if (!l || Math.hypot(+p.r.city_x - l.x, +p.r.city_y - l.y) > 12) pts.push({ x: +p.r.city_x, y: +p.r.city_y, t: p.t }); });
      if (pts.length > 1) { ctx.save(); ctx.setLineDash([6 * dpr, 4 * dpr]); ctx.lineWidth = 2 * dpr; ctx.strokeStyle = 'rgba(52,211,153,.85)'; ctx.beginPath();
        pts.forEach((q, i) => { const [u, v] = hmXY(q.x, q.y, h, m), [x, y] = map(u, v); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }); ctx.stroke(); ctx.setLineDash([]);
        ctx.font = `bold ${Math.round(9 * dpr)}px system-ui,sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        pts.forEach((q, i) => { const [u, v] = hmXY(q.x, q.y, h, m), [x, y] = map(u, v); ctx.beginPath(); ctx.arc(x, y, 7 * dpr, 0, 7); ctx.fillStyle = '#064e3b'; ctx.fill(); ctx.lineWidth = 1.5 * dpr; ctx.strokeStyle = '#34d399'; ctx.stroke(); ctx.fillStyle = '#d1fae5'; ctx.fillText(String(i + 1), x, y + .5); });
        ctx.restore(); }
    }
    const selZ = h.pop;
    dots.forEach(p => { const [x, y] = map(p.u, p.v); if (x < -10 || y < -10 || x > W + 10 || y > W + 10) return; const fresh = S.cur != null && S.cur - p.t < 5 * 6e4;
      if (h.src === 'rally') { ctx.font = `${Math.round(13 * dpr)}px system-ui,"Segoe UI Emoji",sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(p.city ? '🏯' : p.joined ? '🛡️' : '🚩', x, y); return; }   // Rally/Garnison als Symbol
      const other = selZ != null && p.k === 'pvp' && p.z !== selZ;   // Zone ausgewählt → andere Kampfpunkte orange
      ctx.beginPath(); ctx.arc(x, y, (p.mine ? 3.2 : 2.8) * dpr, 0, 7); ctx.fillStyle = other ? '#f97316' : p.mine ? (HM_SRC.find(x => x[0] === p.k)?.[2] || col) : HM_COL[p.fi % HM_COL.length]; ctx.fill();
      ctx.lineWidth = (fresh ? 2 : 1) * dpr; ctx.strokeStyle = fresh ? '#fde047' : 'rgba(0,0,0,.7)'; ctx.stroke(); });
    const dot = (c, color, r) => { if (!c) return; const [u, v] = hmXY(+c.city_x, +c.city_y, h, m), [x, y] = map(u, v); ctx.beginPath(); ctx.arc(x, y, (r + 5) * dpr, 0, 7); ctx.fillStyle = color + '44'; ctx.fill();
      ctx.beginPath(); ctx.arc(x, y, r * dpr, 0, 7); ctx.fillStyle = color; ctx.fill(); ctx.lineWidth = 2 * dpr; ctx.strokeStyle = '#052e16'; ctx.stroke(); };
    if (h.src === 'barb' || h.src === 'fort') { dot(hmCity(), '#22c55e', 6); if (h.fr && hmMates) hmMates.forEach((f, i) => dot(hmCity(f.gid), HM_COL[i % HM_COL.length], 4.5)); return; }
    (S.live || []).forEach(({ p }) => { if (p.r.city_x != null && hmIn(p.r.city_x, p.r.city_y, p.r.map_role)) dot(p.r, p.mine ? '#22c55e' : HM_COL[p.fi % HM_COL.length], p.mine ? 6 : 4.5); });   // Kämpfe: Stadt nur, solange gekämpft wird
  }
  function hmApplyView() {
    const st = $('hmStage'), box = $('hmBox'); if (!st || !box) return; const W = box.clientWidth;
    hmView.s = Math.min(10, Math.max(1, hmView.s)); const max = W * (hmView.s - 1); hmView.x = Math.min(0, Math.max(-max, hmView.x)); hmView.y = Math.min(0, Math.max(-max, hmView.y));
    st.style.transform = `translate(${hmView.x}px,${hmView.y}px) scale(${hmView.s})`;
    const map = (u, v) => [hmView.x + u * W * hmView.s, hmView.y + v * W * hmView.s];
    document.querySelectorAll('#hmMarks [data-hmcity]').forEach(e => { const [x, y] = map(+e.dataset.u, +e.dataset.v); e.style.left = x + 'px'; e.style.top = y + 'px'; });
    document.querySelectorAll('#hmMarks [data-hmmark]').forEach(e => { const [x, y] = map(+e.dataset.u, +e.dataset.v); if (x < 0 || y < 0 || x > W || y > W) { e.style.display = 'none'; return; } e.style.display = '';
      const w = e.offsetWidth, hh = e.offsetHeight, left = x + 14 + w > W - 48 && x - 14 - w >= 0, L = left ? x - 14 - w : x + 14, T = Math.max(4, Math.min(W - hh - 4, y - hh / 2)), ar = e.querySelector('[data-ar]');   // Karte bleibt immer im Bild
      e.style.left = L + 'px'; e.style.top = T + 'px'; if (ar) { ar.style.top = Math.max(4, Math.min(hh - 12, y - T - 4)) + 'px'; ar.style.left = left ? (w - 2) + 'px' : '-6px'; } });
    const dc = $('hmDots'); if (dc && hmLast?.S) { const dpr = window.devicePixelRatio || 1, px = Math.round(W * dpr); if (dc.width !== px) { dc.width = dc.height = px; }
      const ctx = dc.getContext('2d'); ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, W, W); hmPaintDots(ctx, W, hmLast.S, map); }
  }
  function hmZoomTo(u0, v0, u1, v1) { const box = $('hmBox'); if (!box) return; const W = box.clientWidth, span = Math.max(.04, u1 - u0, v1 - v0) * 1.3;
    hmView.s = Math.min(10, Math.max(1, 1 / span)); hmView.x = -((u0 + u1) / 2 * hmView.s - .5) * W; hmView.y = -((v0 + v1) / 2 * hmView.s - .5) * W; hmApplyView(); }
  function hmZoneBox(m, z) { const d = m.zones, W = d.w; let x0 = 1, y0 = 1, x1 = 0, y1 = 0;
    for (let i = 0; i < d.d.length; i++) if (d.d.charCodeAt(i) - 97 === z) { const x = (i % W) / W, y = Math.floor(i / W) / W; x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x + 1 / W); y1 = Math.max(y1, y + 1 / W); }
    return [x0, y0, x1, y1]; }
  function hmDraw(st, S) {
    const cv = $('hmCanvas'); if (!cv) return; S = S || hmState(st); const { h, m, zs } = S, ctx = cv.getContext('2d'), W = cv.width;
    const heat = hmHeat(S); hmLast = { S, heat };
    ctx.clearRect(0, 0, W, W); const mk = hmMask(h, m); if (mk) { ctx.imageSmoothingEnabled = true; ctx.drawImage(mk, 0, 0, W, W); }
    if (heat) { ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high'; ctx.drawImage(heat, 0, 0, W, W); }
    const box = $('hmMarks'); if (box) {
      const pulse = (S.live || []).filter(({ p }) => p.r.city_x != null && hmIn(p.r.city_x, p.r.city_y, p.r.map_role)).map(({ p }) => { const [u, v] = hmXY(+p.r.city_x, +p.r.city_y, h, m);
        return `<div data-hmcity data-u="${u}" data-v="${v}" class="absolute pointer-events-none z-0" style="left:0;top:0"><span class="absolute -translate-x-1/2 -translate-y-1/2 w-12 h-12 rounded-full bg-emerald-400/50 animate-ping"></span><span class="absolute -translate-x-1/2 -translate-y-1/2 w-20 h-20 rounded-full bg-emerald-400/15 blur-md animate-pulse"></span></div>`; }).join('');
      box.innerHTML = pulse + (!h.zm ? '' : zs.map(o => `<div data-hmmark data-hmzone="${o.z}" data-u="${o.mu}" data-v="${o.mv}" class="absolute pointer-events-auto cursor-pointer ${h.pop === o.z ? 'z-30' : 'z-10'}" style="left:0;top:0">
          <span data-ar class="absolute w-2 h-2 rotate-45 bg-amber-400"></span>${hmMarkCard(S, o)}</div>`).join(''));
      box.querySelectorAll('[data-hmmark]').forEach(e => e.onclick = (ev) => { ev.stopPropagation(); if (ev.target.closest('[data-hmpop]')) return; hmPickZone(st, +e.dataset.hmzone, false); });
      box.querySelectorAll('[data-hmpop]').forEach(e => { e.addEventListener('pointerdown', ev => ev.stopPropagation()); e.addEventListener('wheel', ev => ev.stopPropagation(), { passive: true }); });
      box.querySelectorAll('[data-hmiso]').forEach(b => b.onclick = (ev) => { ev.stopPropagation(); hmIso(st, +b.dataset.hmiso); });
      box.querySelectorAll('[data-hmzren]').forEach(b => b.onclick = (ev) => { ev.stopPropagation(); hmRename(st, +b.dataset.hmzren); });
    }
    hmApplyView();
  }
  async function hmRecord(st) {   // Timeline als Video (WebM): Karte, Glühen, Punkte, Uhrzeit – Ausschnitt wie gerade gezoomt
    const h = hmCfg(st), box = $('hmBox'), img = box?.querySelector('img'); if (!img?.complete || !window.MediaRecorder) { hmAsk('🎬 Replay', '', null, 'Dein Browser kann hier kein Video aufnehmen.'); return; }
    const S0 = hmState(st); if (S0.all.length < 2) { hmAsk('🎬 Replay', '', null, 'Zu wenig Kämpfe im Zeitraum.'); return; }
    const P = 1080, c = document.createElement('canvas'); c.width = c.height = P; const ctx = c.getContext('2d'), Wb = box.clientWidth, sx = -hmView.x / (Wb * hmView.s), sy = -hmView.y / (Wb * hmView.s), sw = 1 / hmView.s;
    const mime = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'].find(t => MediaRecorder.isTypeSupported(t)) || '', rec = new MediaRecorder(c.captureStream(30), mime ? { mimeType: mime, videoBitsPerSecond: 6e6 } : undefined), chunks = [];
    rec.ondataavailable = (e) => e.data.size && chunks.push(e.data); rec.start();
    const keep = h.tl, N = 180, tmp = document.createElement('canvas'); tmp.width = tmp.height = 1600; const tc = tmp.getContext('2d');
    for (let i = 0; i <= N; i++) { h.tl = S0.t0 + (S0.t1 - S0.t0) * i / N; const S = hmState(st);
      ctx.drawImage(img, sx * img.naturalWidth, sy * img.naturalHeight, sw * img.naturalWidth, sw * img.naturalHeight, 0, 0, P, P);
      tc.clearRect(0, 0, 1600, 1600); const ht = hmHeat(S); if (ht) { tc.imageSmoothingEnabled = true; tc.drawImage(ht, 0, 0, 1600, 1600); } ctx.drawImage(tmp, sx * 1600, sy * 1600, sw * 1600, sw * 1600, 0, 0, P, P);
      hmPaintDots(ctx, P, S, (u, v) => [(u - sx) / sw * P, (v - sy) / sw * P]);
      ctx.fillStyle = 'rgba(7,9,15,.8)'; ctx.fillRect(16, P - 64, 330, 48); ctx.fillStyle = '#fcd34d'; ctx.font = 'bold 28px system-ui,sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.fillText('⏱ ' + hmWhen(h.tl), 28, P - 40);
      await new Promise(r => setTimeout(r, 50)); }
    await new Promise(r => setTimeout(r, 600)); rec.stop(); await new Promise(r => { rec.onstop = r; }); h.tl = keep; hmLast = null; hmDraw(st);
    const a = document.createElement('a'); a.download = 'heatmap-replay.webm'; a.href = URL.createObjectURL(new Blob(chunks, { type: 'video/webm' })); a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 30000);
  }
  function hmIso(st, z) { const h = hmCfg(st), m = hmMap(h); h.iso = h.iso === z || z == null || isNaN(z) ? null : z; h.tl = null; savePassive(); renderKampf();
    if (h.iso != null) hmZoomTo(...hmZoneBox(m, h.iso)); else { hmView = { s: 1, x: 0, y: 0 }; hmApplyView(); } }
  function hmRename(st, z) { const h = hmCfg(st), m = hmMap(h), cur = (h.zn2[m.k] || {})[z] || '';
    hmAsk('Zone umbenennen', cur, (v) => { h.zn2[m.k] = h.zn2[m.k] || {}; if (v) h.zn2[m.k][z] = v.slice(0, 30); else delete h.zn2[m.k][z]; savePassive(); renderKampf(); }, '', m.zones.n[z]); }
  function hmPickZone(st, z, zoom) { const h = hmCfg(st), m = hmMap(h); h.pop = h.pop === z ? null : z; savePassive(); renderKampf(); if (zoom && h.pop != null) hmZoomTo(...hmZoneBox(m, z)); }
  function hmBind(el, st) {
    const h = hmCfg(st), m = hmMap(h), re = () => { savePassive(); renderKampf(); };
    el.querySelectorAll('[data-hmsrc]').forEach(b => b.onclick = () => { h.src = b.dataset.hmsrc; h.pop = null; h.fight = null; re(); });
    el.querySelectorAll('[data-hmt]').forEach(b => b.onclick = () => { h.t = b.dataset.hmt; h.tl = null; h.fight = null; re(); });
    el.querySelectorAll('[data-hmday]').forEach(b => b.onclick = () => { if (!h.fight && h.t === 'day' && h.day === b.dataset.hmday) h.t = 'kvk'; else { h.t = 'day'; h.day = b.dataset.hmday; } h.tl = null; h.fight = null; re(); });
    el.querySelectorAll('[data-hmacc]').forEach(b => b.onclick = () => { st.heatAcc = b.dataset.hmacc; h.fight = null; h.tl = null; h.pop = null; h.iso = null; h.march = ''; const mp = hmAk(h).map; if (mp) h.map = mp; hmView = { s: 1, x: 0, y: 0 }; re(); });
    el.querySelector('[data-hmwatch]')?.addEventListener('change', (ev) => { h.watch = ev.target.value; h.fight = null; h.tl = null; h.pop = null; re(); });
    el.querySelector('[data-hmpanel]')?.addEventListener('change', (ev) => { const v = ev.target.value; h.pop = v === '' ? null : +v; re(); if (h.pop != null) hmZoomTo(...hmZoneBox(m, h.pop)); });
    el.querySelectorAll('[data-hmiso2]').forEach(b => b.onclick = () => hmIso(st, +b.dataset.hmiso2));
    el.querySelectorAll('[data-hmzren2]').forEach(b => b.onclick = () => hmRename(st, +b.dataset.hmzren2));
    el.querySelector('[data-hmlink]')?.addEventListener('click', async () => {   // Link: öffnet direkt die Heatmap (Watch) mit KvK und Spieler
      const sp = hmSpect(), kvk = sp ? h.wkvk : hmKvkCode(h), pid = sp ? h.watch : hmAcc(h), u = new URL(location.origin + location.pathname);
      u.searchParams.set('heat', kvk || '1'); if (pid) u.searchParams.set('p', pid); const url = u.toString();
      let ok = false; try { await navigator.clipboard.writeText(url); ok = true; } catch {}
      hmAsk('🔗 Link zur Heatmap', url, () => {}, (ok ? 'In die Zwischenablage kopiert. ' : '') + (kvk ? 'Öffnet die Heatmap für ' + kvk + (pid ? ' mit diesem Spieler' : '') + '.' : 'Tipp: zuerst die C-Nummer eintragen, dann sehen andere das ganze KvK.'));
      setTimeout(() => { const i = document.getElementById('hmAskIn'); if (i) { i.readOnly = true; i.select(); } const b = document.querySelector('#hmAsk [data-ok]'); if (b) b.textContent = 'OK'; }, 30); });
    el.querySelector('[data-hmp7]')?.addEventListener('change', (ev) => { const a = hmAk(h); if (ev.target.value) a.p7 = ev.target.value; else delete a.p7; re(); });
    el.querySelector('[data-hmkl]')?.addEventListener('change', (ev) => { const a = hmAk(h); if (ev.target.value) a.kl = ev.target.value; else delete a.kl; re(); });
    el.querySelector('[data-hmhf]')?.addEventListener('change', (ev) => { h.hf = ev.target.value || ''; h.tl = null; re(); });
    el.querySelector('[data-hmht]')?.addEventListener('change', (ev) => { h.ht = ev.target.value || ''; h.tl = null; re(); });
    el.querySelector('[data-hmhx]')?.addEventListener('click', () => { h.hf = ''; h.ht = ''; re(); });
    el.querySelector('[data-hmflexmin]')?.addEventListener('change', (ev) => { h.flexMin = +ev.target.value; re(); });
    el.querySelector('[data-hmflex]')?.addEventListener('toggle', (ev) => { h.flexOpen = ev.target.open; savePassive(); });
    el.querySelectorAll('[data-hmdgrp]').forEach(b => b.onclick = () => { const n = b.dataset.hmdgrp; if (h.t === 'kvk' && !h.fight && h.zb === n) h.zb = ''; else { h.t = 'kvk'; h.zb = n; } h.tl = null; h.fight = null; h.pop = null; re(); });   // Gruppen-Name (z. B. Pass 7) = ganzes KvK, nur diese Zone
    el.querySelectorAll('[data-hmzb]').forEach(b => b.onclick = () => { h.zb = b.dataset.hmzb || ''; h.pop = null; re(); });
    el.querySelectorAll('[data-hmtcb]').forEach(b => b.onclick = () => { h.tcB = +b.dataset.hmtcb; re(); });
    const bDur = () => Math.min(24, Math.max(0.5, +(el.querySelector('[data-hmbuffd]')?.value) || 4));
    el.querySelector('[data-hmbuffd]')?.addEventListener('change', () => { h.buffD = bDur(); savePassive(); });
    const addBuff = (a) => { const B = (h.buffs || []).map(b => typeof b === 'string' ? { a: b, d: 4 } : b); B.push({ a, d: bDur() }); h.buffs = B.sort((x, y) => Date.parse(x.a) - Date.parse(y.a)); h.buffD = bDur(); h.buffOpen = true; re(); };
    el.querySelector('[data-hmbuffadd]')?.addEventListener('click', () => { const v = el.querySelector('[data-hmbuffin]')?.value; if (v) addBuff(v); });
    el.querySelector('[data-hmbuffnow]')?.addEventListener('click', () => { const d = new Date(); d.setSeconds(0, 0); addBuff(new Date(d - d.getTimezoneOffset() * 6e4).toISOString().slice(0, 16)); });
    el.querySelectorAll('[data-hmtcr]').forEach(b => b.onclick = () => { h.tcR = b.dataset.hmtcr; if (h.tcR === 'kvk' && (+h.tcB || 60) < 240) h.tcB = 1440; re(); });
    el.querySelectorAll('[data-hmtcz]').forEach(b => b.onclick = () => { h.tcZ = b.dataset.hmtcz; re(); });
    el.querySelector('[data-hmbuff]')?.addEventListener('toggle', (ev) => { h.buffOpen = ev.target.open; savePassive(); });
    el.querySelectorAll('[data-hmbuffx]').forEach(b => b.onclick = () => { h.buffs = (h.buffs || []).filter((_, i) => i !== +b.dataset.hmbuffx); re(); });
    el.querySelectorAll('[data-hmfw]').forEach(b => b.onclick = (e) => { e.preventDefault(); h.fw = +b.dataset.hmfw; re(); });
    el.querySelectorAll('[data-hmfrel]').forEach(b => b.onclick = (e) => { e.preventDefault(); kbField.t = 0; kbFieldLoad(kbField.key ? kbField.key.split(',') : [], true); });
    el.querySelectorAll('[data-hmmarks]').forEach(d => d.ontoggle = () => { if (!!h.markOpen !== d.open) { h.markOpen = d.open; savePassive(); renderKampf(); } });
    el.querySelectorAll('[data-hmfield]').forEach(d => d.ontoggle = () => { if (h.fieldOpen !== d.open) { h.fieldOpen = d.open; savePassive(); if (d.open) renderKampf(); } });
    el.querySelectorAll('[data-hmbuffhide]').forEach(b => b.onclick = () => { st.buffHide = { ...(st.buffHide || {}), [b.dataset.hmbuffhide]: 1 }; re(); });
    el.querySelector('[data-hmtc]')?.addEventListener('toggle', (ev) => { h.tcOpen = ev.target.open; savePassive(); });
    el.querySelector('[data-hmbr]')?.addEventListener('toggle', (ev) => { h.brOpen = ev.target.open; savePassive(); });
    try { hmTCc?.destroy(); } catch {} hmTCc = null;
    const tcv = document.getElementById('hmTradeChart'); if (tcv && window.Chart && hmTC) {
      hmTCc = new Chart(tcv, { data: { labels: hmTC.labels, datasets: [
        { type: 'bar', label: 'KP', data: hmTC.kp, yAxisID: 'kp', backgroundColor: hmTC.buff.map(b => b ? 'rgba(245,158,11,.45)' : 'rgba(148,163,184,.18)'), borderWidth: 0 },
        { type: 'line', label: 'Trade %', data: hmTC.trade, yAxisID: 'tr', borderColor: '#34d399', backgroundColor: '#34d399', tension: .3, spanGaps: true, pointRadius: 2 },
        { type: 'line', label: 'KP-Trade', data: hmTC.kpt, yAxisID: 'kt', borderColor: '#60a5fa', backgroundColor: '#60a5fa', tension: .3, spanGaps: true, pointRadius: 2 }] },
        options: { responsive: true, maintainAspectRatio: false, interaction: { mode: 'index', intersect: false }, plugins: { legend: { labels: { color: '#cbd5e1', boxWidth: 10 } }, tooltip: { callbacks: { label: (x) => x.dataset.label + ': ' + (x.dataset.yAxisID === 'kp' ? short(x.raw) : x.dataset.yAxisID === 'tr' ? x.raw + ' %' : x.raw + ' : 1') } } },
          scales: { x: { ticks: { color: '#64748b', maxTicksLimit: 12 }, grid: { display: false } }, kp: { position: 'right', ticks: { color: '#64748b', callback: (v) => short(v) }, grid: { display: false } },
            tr: { position: 'left', ticks: { color: '#34d399', callback: (v) => v + ' %' }, grid: { color: 'rgba(148,163,184,.08)' } }, kt: { display: false } } } });
    }
    el.querySelector('[data-hmcpath]')?.addEventListener('change', (ev) => { h.cpath = ev.target.checked; savePassive(); hmDraw(st); });
    el.querySelectorAll('[data-hmmode]').forEach(b => b.onclick = () => { h.mode = b.dataset.hmmode; h.fight = null; h.tl = null; h.pop = null; h.iso = null; h.march = ''; hmView = { s: 1, x: 0, y: 0 }; re(); });
    el.querySelector('[data-hmwkvk]')?.addEventListener('change', (ev) => { const v = ev.target.value.trim().toUpperCase().replace(/\s/g, '');
      if (v && !/^C\d{5}$/.test(v)) { hmAsk('KvK', '', null, 'Format: C + 5 Ziffern, z. B. C13340'); ev.target.value = h.wkvk || ''; return; } h.wkvk = v || ''; h.watch = ''; h.fight = null; h.tl = null; h.pop = null; delete hmWInfo[v]; re(); });
    el.querySelectorAll('[data-hmdmode]').forEach(b => b.onclick = () => { h.dmode = b.dataset.hmdmode; re(); });
    el.querySelectorAll('[data-hmcmpp]').forEach(b => b.onclick = () => { const k = b.dataset.hmcmpp, cur = [...el.querySelectorAll('[data-hmcmpp][aria-pressed="true"]')].map(x => x.dataset.hmcmpp);
      h.cmp = cur.includes(k) ? cur.filter(x => x !== k) : [...cur, k].slice(-6); re(); });
    el.querySelector('[data-hmcmpz]')?.addEventListener('change', (ev) => { h.cmpZ = ev.target.value; re(); });
    el.querySelector('[data-hmcmp]')?.addEventListener('toggle', (ev) => { h.cmpOpen = ev.target.open; savePassive(); });
    hmSyncKvk(h);
    el.querySelector('[data-hmkvkcode]')?.addEventListener('change', (ev) => { const v = ev.target.value.trim().toUpperCase().replace(/\s/g, ''), a = hmAk(h);
      if (!v) { delete a.kvk; delete a.gs; re(); return; } if (!/^C\d{5}$/.test(v)) { hmAsk('KvK', '', null, 'Format: C + 5 Ziffern, z. B. C16144'); ev.target.value = hmKvkCode(h); return; } if (a.kvk !== v) a.gs = hmGsAuto(hmAcc(h)) || undefined; a.kvk = v; h.fight = null; h.tl = null; re(); });
    el.querySelector('[data-hmkvkstart]')?.addEventListener('change', (ev) => { const a = hmAk(h); if (ev.target.value) a.start = ev.target.value; else delete a.start; h.fight = null; h.tl = null; re(); });
    el.querySelectorAll('[data-hmmarch]').forEach(x => x.addEventListener('change', (ev) => { h.march = ev.target.value; h.tl = null; re(); }));
    el.querySelector('[data-hmtlopen]')?.addEventListener('click', () => { h.tlOpen = !h.tlOpen; if (!h.tlOpen && hmPlay) { clearInterval(hmPlay); hmPlay = null; } re(); });
    el.querySelectorAll('[data-hmzf]').forEach(b => b.onclick = () => { const z = b.dataset.hmzf === '' ? null : +b.dataset.hmzf; if (z == null) hmIso(st, null); else if (h.iso !== z) hmIso(st, z); });
    el.querySelectorAll('[data-hmsub],[data-hmsubrow]').forEach(b => b.onclick = (ev) => { ev.stopPropagation(); const k = b.dataset.hmsub || b.dataset.hmsubrow, on = !hmSubOpen.has(k); on ? hmSubOpen.add(k) : hmSubOpen.delete(k);
      el.querySelectorAll(`[data-subof="${CSS.escape(k)}"]`).forEach(r => r.classList.toggle('hidden', !on)); el.querySelectorAll(`[data-hmsub="${CSS.escape(k)}"]`).forEach(x => x.textContent = x.textContent.replace(/^[▴▾]/, on ? '▴' : '▾')); });
    el.querySelector('[data-hmbl]')?.addEventListener('toggle', (ev) => { h.blOpen = ev.target.open; savePassive(); });
    el.querySelector('[data-hmfrom]')?.addEventListener('change', (ev) => { h.from = ev.target.value; re(); });
    el.querySelector('[data-hmto]')?.addEventListener('change', (ev) => { h.to = ev.target.value; re(); });
    el.querySelector('[data-hmrad]')?.addEventListener('input', (ev) => { h.rad = +ev.target.value; hmLast = null; hmDraw(st); });
    el.querySelector('[data-hmrad]')?.addEventListener('change', () => savePassive());
    el.querySelector('[data-hmzm]')?.addEventListener('change', (ev) => { h.zm = ev.target.checked; savePassive(); hmDraw(st); });
    el.querySelector('[data-hmfr]')?.addEventListener('change', (ev) => { h.fr = ev.target.checked; re(); });
    el.querySelectorAll('[data-hmzsel]').forEach(x => x.addEventListener('change', (ev) => hmIso(st, ev.target.value === '' ? null : +ev.target.value)));
    el.querySelector('[data-hmpngmk]')?.addEventListener('change', (ev) => { h.pngMk = ev.target.checked; savePassive(); });
    el.querySelectorAll('[data-hmmap]').forEach(b => b.onclick = () => { h.map = b.dataset.hmmap; hmAk(h).map = h.map; h.pop = null; h.iso = null; h.fight = null; hmView = { s: 1, x: 0, y: 0 }; re(); });
    el.querySelectorAll('#hmWrap > div > [data-hmiso]').forEach(b => b.onclick = () => hmIso(st, null));
    el.querySelectorAll('[data-hmzone]:not([data-hmmark])').forEach(b => b.onclick = () => hmPickZone(st, +b.dataset.hmzone, true));
    el.querySelector('[data-hmshare]')?.addEventListener('click', () => { if (hmShare != null) hmSetShare(!hmShare); });
    if (hmShare == null) hmLoadShare();
    const liveTick = async () => { const s2 = kbSt(), h2 = hmCfg(s2); if (R.view !== 'battles' || s2.page !== 'heat' || !h2.live) { clearInterval(hmLiveT); hmLiveT = null; return; } if (document.hidden) return;
      const n = await kbLoadNew(); h2.lastLive = Date.now(); if (n) renderKampf(); };
    el.querySelector('[data-hmlive]')?.addEventListener('change', (ev) => { h.live = ev.target.checked; savePassive(); if (h.live) liveTick(); else { clearInterval(hmLiveT); hmLiveT = null; } renderKampf(); });
    if (h.live && !hmLiveT) hmLiveT = setInterval(liveTick, 60000);
    el.querySelector('[data-hmfight]')?.addEventListener('change', (ev) => { h.fight = ev.target.value || null; h.tl = null; h.pop = null; re();
      const f = h.fight && hmFights(st).find(x => x.id === h.fight); if (f) hmZoomTo(f.u0, f.v0, f.u1, f.v1); else { hmView = { s: 1, x: 0, y: 0 }; hmApplyView(); } });
    el.querySelector('[data-hmfren]')?.addEventListener('click', () => { const f = hmFights(st).find(x => x.id === h.fight); if (!f) return; hmAsk('Schlacht benennen', h.fn[f.id] || '', (v) => { if (v) h.fn[f.id] = v.slice(0, 40); else delete h.fn[f.id]; re(); }, '', f.auto); });
    // Timeline
    const tlIn = el.querySelector('[data-hmtl]'), lab = $('hmTlLabel');
    tlIn?.addEventListener('input', () => { h.tl = +tlIn.value; if (lab) lab.textContent = hmWhen(h.tl); hmDraw(st); });
    tlIn?.addEventListener('change', () => re());
    el.querySelectorAll('[data-hmtrail]').forEach(b => b.onclick = () => { h.trail = +b.dataset.hmtrail; if (h.tl == null && tlIn) h.tl = +tlIn.max; re(); });
    el.querySelectorAll('[data-hmspeed]').forEach(b => b.onclick = () => { h.speed = +b.dataset.hmspeed; savePassive(); el.querySelectorAll('[data-hmspeed]').forEach(x => x.setAttribute('aria-pressed', String(+x.dataset.hmspeed === h.speed))); });
    el.querySelector('[data-hmtlx]')?.addEventListener('click', () => { h.tl = null; if (hmPlay) { clearInterval(hmPlay); hmPlay = null; } re(); });
    el.querySelector('[data-hmplay]')?.addEventListener('click', () => {
      if (hmPlay) { clearInterval(hmPlay); hmPlay = null; re(); return; }
      if (!tlIn || tlIn.disabled) return; const a = +tlIn.min, b = +tlIn.max; if (h.tl == null || h.tl >= b) h.tl = a;
      hmPlay = setInterval(() => { const box = $('hmTlLabel'), inp = document.querySelector('[data-hmtl]'); if (!box || !inp) { clearInterval(hmPlay); hmPlay = null; return; }
        h.tl = Math.min(b, h.tl + Math.max(6e4, (b - a) / 160) * h.speed); inp.value = h.tl; box.textContent = hmWhen(h.tl); hmDraw(st);
        if (h.tl >= b) { clearInterval(hmPlay); hmPlay = null; re(); } }, 50);
      re();
    });
    el.querySelector('[data-hmcal]')?.addEventListener('click', () => { hmCalMode = !hmCalMode; renderKampf(); });
    el.querySelector('[data-hmcalx]')?.addEventListener('click', () => { delete h.ux; delete h.uy; re(); });
    // Zoom / Verschieben
    const box = $('hmBox'); if (!box) return;
    box.addEventListener('wheel', (ev) => { if (ev.target.closest('[data-hmpop]')) return; ev.preventDefault(); const bb = box.getBoundingClientRect(), mx = ev.clientX - bb.left, my = ev.clientY - bb.top, s0 = hmView.s, s1 = Math.min(10, Math.max(1, s0 * (ev.deltaY < 0 ? 1.25 : .8)));
      hmView.x = mx - (mx - hmView.x) * s1 / s0; hmView.y = my - (my - hmView.y) * s1 / s0; hmView.s = s1; hmApplyView(); }, { passive: false });
    let drag = null;
    box.addEventListener('pointerdown', (ev) => { if (ev.target.closest('button,[data-hmmark]')) return; drag = { x: ev.clientX, y: ev.clientY, vx: hmView.x, vy: hmView.y, moved: false }; box.setPointerCapture(ev.pointerId); box.style.cursor = 'grabbing'; });
    box.addEventListener('pointermove', (ev) => { if (drag) { if (Math.abs(ev.clientX - drag.x) + Math.abs(ev.clientY - drag.y) > 4) drag.moved = true; hmView.x = drag.vx + ev.clientX - drag.x; hmView.y = drag.vy + ev.clientY - drag.y; hmApplyView(); } });
    box.addEventListener('pointerup', (ev) => { const d = drag; drag = null; box.style.cursor = '';
      if (d && !d.moved && hmCalMode) { const c = hmCity(), bb = box.getBoundingClientRect(), u = (ev.clientX - bb.left - hmView.x) / (bb.width * hmView.s), v = (ev.clientY - bb.top - hmView.y) / (bb.height * hmView.s), p = (m.pad || 0) / 100;
        const tx = (u - p) / (1 - 2 * p) * m.size, ty = (1 - (v - p) / (1 - 2 * p)) * m.size; if (c && tx > 5 && ty > 5) { h.ux = +(+c.city_x / tx).toFixed(4); h.uy = +(+c.city_y / ty).toFixed(4); }
        hmCalMode = false; re(); } });
    el.querySelectorAll('[data-hmz]').forEach(b => b.onclick = async () => { const k = b.dataset.hmz, W = box.clientWidth;
      if (k === 'in' || k === 'out') { const s0 = hmView.s, s1 = Math.min(10, Math.max(1, s0 * (k === 'in' ? 1.5 : 1 / 1.5))); hmView.x = W / 2 - (W / 2 - hmView.x) * s1 / s0; hmView.y = W / 2 - (W / 2 - hmView.y) * s1 / s0; hmView.s = s1; hmApplyView(); }
      else if (k === 'reset') { hmView = { s: 1, x: 0, y: 0 }; hmApplyView(); }
      else if (k === 'fit') { const p = hmState(st).dots.filter(q => q.mine); if (!p.length) return; hmZoomTo(Math.min(...p.map(q => q.u)), Math.min(...p.map(q => q.v)), Math.max(...p.map(q => q.u)), Math.max(...p.map(q => q.v))); }
      else if (k === 'full') { const w = $('battlesView'); try { if (document.fullscreenElement) await document.exitFullscreen(); else { await w.requestFullscreen(); setTimeout(() => $('hmWrap')?.scrollIntoView({ block: 'start' }), 150); } } catch {} setTimeout(hmApplyView, 250); }
      else if (k === 'vid') { if (b.dataset.busy) return; b.dataset.busy = 1; b.textContent = '⏺'; try { await hmRecord(st); } catch (e) { console.warn(e); } delete b.dataset.busy; b.textContent = '🎬'; }
      else if (k === 'png') { try { const S = hmState(st), img = box.querySelector('img'), Wb = box.clientWidth, P = 2048, o = document.createElement('canvas'); o.width = o.height = P; const c = o.getContext('2d');
          const sx = -hmView.x / (Wb * hmView.s), sy = -hmView.y / (Wb * hmView.s), sw = 1 / hmView.s;   // Ausschnitt wie gerade gezoomt
          if (img?.complete && img.naturalWidth) c.drawImage(img, sx * img.naturalWidth, sy * img.naturalHeight, sw * img.naturalWidth, sw * img.naturalHeight, 0, 0, P, P);
          const tmp = document.createElement('canvas'); tmp.width = tmp.height = 1600; const tc = tmp.getContext('2d'), mk = hmMask(S.h, S.m), ht = hmHeat(S); if (mk) tc.drawImage(mk, 0, 0, 1600, 1600); if (ht) { tc.imageSmoothingEnabled = true; tc.drawImage(ht, 0, 0, 1600, 1600); }
          c.drawImage(tmp, sx * 1600, sy * 1600, sw * 1600, sw * 1600, 0, 0, P, P);
          const map = (u, v) => [(u - sx) / sw * P, (v - sy) / sw * P]; hmPaintDots(c, P, S, map);
          if (h.zm && h.pngMk) S.zs.forEach(z => { const [x, y] = map(z.mu, z.mv), title = hmZName(h, m, z.z), l2 = h.src === 'pvp' ? `KP ${short(z.kp)} · Trade ${hmTradeTxt(z.trade)} · Deads ${short(z.dead)}` : `${h.src === 'barb' ? 'Barbaren' : 'Forts'} ${z.n}`, l3 = 'ab ' + hmWhen(z.first);
            c.font = 'bold 26px system-ui,sans-serif'; const w1 = c.measureText(title).width; c.font = '20px system-ui,sans-serif'; const w = Math.max(w1, c.measureText(l2).width, c.measureText(l3).width) + 24;
            c.fillStyle = 'rgba(7,9,15,.9)'; c.strokeStyle = '#f59e0b'; c.lineWidth = 2; c.beginPath(); c.roundRect(x + 14, y - 44, w, 88, 12); c.fill(); c.stroke();
            c.fillStyle = '#fcd34d'; c.font = 'bold 26px system-ui,sans-serif'; c.fillText(title, x + 26, y - 14); c.fillStyle = '#e2e8f0'; c.font = '20px system-ui,sans-serif'; c.fillText(l2, x + 26, y + 12); c.fillStyle = '#94a3b8'; c.fillText(l3, x + 26, y + 34); });
          const a = document.createElement('a'); a.download = 'heatmap.png'; a.href = o.toDataURL('image/png'); a.click(); } catch (e) { console.warn(e); } }
    });
    const tip = $('hmTip');
    box.addEventListener('mousemove', (ev) => { if (drag || hmCalMode || ev.target.closest('[data-hmmark]')) { tip.classList.add('hidden'); return; } const bb = box.getBoundingClientRect(), u = (ev.clientX - bb.left - hmView.x) / (bb.width * hmView.s), v = (ev.clientY - bb.top - hmView.y) / (bb.height * hmView.s);
      const near = (hmLast?.S || hmState(st)).dotsM.filter(p => Math.hypot(p.u - u, p.v - v) < .012 / Math.sqrt(hmView.s));
      if (!near.length) { tip.classList.add('hidden'); return; }
      const kp = near.reduce((s, p) => s + (p.kp ?? hmKP(p.r)), 0), en = [...new Set(near.map(p => p.r.enemy_name).filter(Boolean))].slice(0, 3), who = [...new Set(near.map(p => p.mine ? (kbIdName(p.r.player_id) || p.r.self_name || 'Du') + ' · ' + p.r.player_id : hmMates?.[p.fi]?.name).filter(Boolean))];
      tip.innerHTML = `${h.src === 'pvp' ? `⚔️ ${near.length} · 🏆 ${short(kp)}` : (h.src === 'barb' ? '🪓 ' : '👹 ') + near.length}<br><span class="text-slate-400">X ${Math.round(hmTile(near[0].r.pos_x, 'x'))} · Y ${Math.round(hmTile(near[0].r.pos_y, 'y'))} · ${hmWhen(near[near.length - 1].t)}</span>${en.length ? `<br><span class="text-red-200" translate="no">${en.map(esc).join(', ')}</span>` : ''}${who.length ? `<br><span class="text-cyan-200" translate="no">${who.map(esc).join(', ')}</span>` : ''}`;
      tip.style.left = Math.min(bb.width - 190, ev.clientX - bb.left + 12) + 'px'; tip.style.top = (ev.clientY - bb.top + 12) + 'px'; tip.classList.remove('hidden'); });
    box.addEventListener('mouseleave', () => tip.classList.add('hidden'));
    document.addEventListener('fullscreenchange', () => setTimeout(hmApplyView, 100), { once: true });
    if (!window._hmRs) { window._hmRs = true; window.addEventListener('resize', () => hmApplyView()); }
  }

  // ================= Detailansicht eines Kampfes (Ausrüstung, Skills, Rüstung – du und Gegner) =================
  var kdCache = {}, kdCur = null, kdChart = null;
  var KD_SLOTS = ['', 'Waffe', 'Helm', 'Brust', 'Handschuhe', 'Beine', 'Stiefel', 'Zubehör', 'Zubehör'];
  var KD_SLOT_ICON = ['', '⚔️', '⛑️', '🛡️', '🧤', '👖', '👢', '💍', '💍'];
  function kdLang() { try { return window.I18N?.lang?.() === 'en' ? 0 : 1; } catch { return 1; } }
  function kdNm(en, de, fb) { const l = kdLang(); const v = (l ? de : en) || en || de; return v ? esc(v) : esc(fb); }
  // Klick auf einen Kampf → darunter klappen Ausrüstung, Skills, Rüstung und alle Werte auf
  async function kdToggle(btn, mail, opp) {
    const tr = btn.closest('tr'), key = mail + '|' + opp; if (!tr) { kdOpen(mail, opp); return; }
    const nx = tr.nextElementSibling; if (nx && nx.dataset.kdexp === key) { try { nx.querySelector('canvas')?._ch?.destroy(); } catch {} nx.remove(); btn.setAttribute('aria-pressed', 'false'); return; }
    const row = (kbRows || []).find(r => String(r.mail_id) === mail && String(r.opponent_id) === opp) || {}, exp = document.createElement('tr'), cid = 'kdc' + Math.random().toString(36).slice(2, 8);
    exp.dataset.kdexp = key; exp.innerHTML = `<td colspan="99" class="p-0"><div class="m-2 rounded-xl border border-gold-500/30 bg-ink-950/80 p-3 sm:p-4 text-left whitespace-normal"></div></td>`; tr.after(exp); btn.setAttribute('aria-pressed', 'true');
    const box = exp.querySelector('div'), paint = () => { box.innerHTML = kdBody(row, kdCache[key], kdCache[key] === undefined, cid); kdChartOn($(cid), kdCache[key]); };
    paint(); if (kdCache[key] !== undefined) return;
    try { const db = RokAuth?.db?.(); if (!db) throw new Error('offline'); const { data, error } = await db.from('rok_battles').select('detail').eq('mail_id', mail).eq('opponent_id', opp).maybeSingle(); if (error) throw error; kdCache[key] = data?.detail || null; }
    catch (e) { kdCache[key] = { err: /detail/i.test(e?.message || '') ? 'col' : (e?.message || String(e)) }; }
    if (exp.isConnected) paint();
  }
  async function kdOpen(mail, opp) {   // ganzer Bericht: angeklickter Kampf oben, die anderen Gegner darunter
    kdCur = { mail, opp };
    const rows = (kbRows || []).filter(r => String(r.mail_id) === mail).sort((a, b) => (String(b.opponent_id) === opp) - (String(a.opponent_id) === opp) || (+b.kill_points || 0) - (+a.kill_points || 0));
    if (!rows.length) rows.push({ mail_id: mail, opponent_id: opp });
    const need = rows.filter(r => kdCache[mail + '|' + r.opponent_id] === undefined);
    kdRender(rows, !!need.length);
    if (!need.length) return;
    try { const db = RokAuth?.db?.(); if (!db) throw new Error('offline'); const { data, error } = await db.from('rok_battles').select('opponent_id,detail').eq('mail_id', mail); if (error) throw error;
      rows.forEach(r => { kdCache[mail + '|' + r.opponent_id] = (data || []).find(x => String(x.opponent_id) === String(r.opponent_id))?.detail || null; }); }
    catch (e) { const err = { err: /detail/i.test(e?.message || '') ? 'col' : (e?.message || String(e)) }; rows.forEach(r => { kdCache[mail + '|' + r.opponent_id] = err; }); }
    if (kdCur && kdCur.mail === mail) kdRender(rows, false);
  }

  function kdClose() { kdCur = null; (kdChart || []).forEach(c => { try { c?.destroy(); } catch {} }); kdChart = null; $('kdModal')?.remove(); document.body.style.overflow = ''; }
  window.addEventListener('langchange', () => { if (kdCur) kdOpen(kdCur.mail, kdCur.opp); });
  function kdBuffSum(arm) {   // alle Rüstungswerte zusammengezählt
    const m = new Map();
    (arm || []).forEach(a => (a[5] || []).forEach(b => { const o = m.get(b[0]) || { v: 0, en: b[2], de: b[3] }; o.v += +b[1] || 0; m.set(b[0], o); }));
    return [...m.entries()].sort((a, b) => b[1].v - a[1].v);
  }
  function kdExpIdx(h) { const L = h?.sk || []; if (L.length < 5) return -1; let k = -1; L.forEach((s, i) => { if (k < 0 || +s[1] < +L[k][1]) k = i; }); return +L[k][1] <= 1 ? k : -1; }   // 5. Skill mit Stufe 1 = Expertise
  function kdExp(h) { return kdExpIdx(h) >= 0; }
  function kdSkills(h) { const k = kdExpIdx(h); return (h?.sk || []).filter((_, i) => i !== k); }
  function kdHero(h, main) {
    if (!h) return '';
    const sk = kdSkills(h).map(s => `<span class="w-10 h-10 grid place-items-center rounded-lg border-2 ${+s[1] >= 5 ? 'border-gold-500/70 bg-gold-500/10 text-gold-200' : 'border-ink-600 bg-ink-900 text-slate-300'} text-lg font-bold tabular-nums" title="${esc(s[2] || s[3] || 'Skill ' + s[0])}">${esc(s[1] ?? '–')}</span>`).join('');
    const ic = hmIconId(h.n?.[0]), expd = kdExp(h), expDir = expd ? 'comanderexpertise' : 'comander';
    return `<div class="rounded-xl border border-ink-700 bg-ink-950/60 p-3 mb-2 flex gap-3"><div class="shrink-0">${hmHeroImg(h.n?.[0], 'w-16 h-16 rounded-xl', expd)}</div><div class="min-w-0 flex-1">
      <div class="flex items-center justify-between gap-2"><div class="font-semibold text-slate-100"><span>${main ? 'Hauptkommandant' : 'Nebenkommandant'}</span>: <span translate="no" class="text-gold-200">${kdNm(h.n?.[0], h.n?.[1], '#' + h.id)}</span></div>
      <div class="text-[11px] text-slate-400 whitespace-nowrap"><span>Lv</span> ${esc(h.lv ?? '–')} · ${'★'.repeat(Math.min(+h.st || 0, 6))}${h.aw ? ' · <span class="text-sky-300">erweckt</span>' : ''}</div></div>
      <div class="mt-2 flex flex-wrap gap-1.5">${sk}</div></div></div>`;
  }
  function kdGearImg(en, fb) { const slug = String(en || '').toLowerCase().replace(/['’]/g, '').replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
    if (!slug) return `<span class="w-9 text-center">${fb}</span>`;
    return `<img src="/icons/gear/${slug}.webp" data-alt="${slug}" data-try="0" alt="" class="w-9 h-9 rounded-lg object-contain bg-ink-900 border border-ink-700 shrink-0" loading="lazy" onerror="const t=+this.dataset.try,s=['_purple','_blue','_grey'];if(t<3){this.dataset.try=t+1;this.src='/icons/gear/'+this.dataset.alt+s[t]+'.webp'}else{this.replaceWith(Object.assign(document.createElement('span'),{className:'w-9 text-center',textContent:'${fb}'}))}">`; }
  function kdSide(sd, title, col, tt) {
    if (!sd) return `<div class="text-sm text-slate-500">Keine Daten.</div>`;
    const gear = (sd.gear || []).map(g => `<div class="flex items-center gap-2 py-1 border-b border-ink-800/60 last:border-0">${kdGearImg(g[3], KD_SLOT_ICON[g[0]] || '•')}<span class="text-[10px] text-slate-500 w-20 shrink-0">${esc(KD_SLOTS[g[0]] || g[0])}</span><span translate="no" class="text-slate-100 flex-1">${kdNm(g[3], g[4], '#' + g[1])}</span>${g[2] ? `<span class="text-[10px] tabular-nums rounded px-1 border border-ink-600 text-slate-400" title="Zusatzwert aus dem Bericht (vermutlich kritische Werte / Erweckung)">${esc(g[2])}</span>` : ''}</div>`).join('');
    const arm = (sd.arm || []).map(a => `<div class="py-1.5 border-b border-ink-800/60 last:border-0"><div class="flex flex-wrap items-center gap-1"><span translate="no" class="text-slate-100 font-medium">${kdNm(a[2], a[3], '#' + a[1])}</span>${(a[4] || []).map(x => `<span translate="no" class="rounded-md bg-violet-500/15 border border-violet-500/40 text-violet-200 px-1.5 py-0.5 text-[10px]">${kdNm(x[1], x[2], '#' + x[0])}</span>`).join('')}</div>
      <div class="text-[11px] text-slate-400 mt-0.5">${(a[5] || []).map(b => `<span translate="no">${kdNm(b[2], b[3], '#' + b[0])}</span> <b class="text-emerald-300 tabular-nums">+${dec((+b[1] || 0) * 100, 1)} %</b>`).join(' · ')}</div></div>`).join('');
    const sum = kdBuffSum(sd.arm).map(([id, o]) => `<span class="inline-flex gap-1 rounded-md border border-ink-600 px-1.5 py-0.5 text-[10px]"><span translate="no">${kdNm(o.en, o.de, '#' + id)}</span> <b class="text-emerald-300 tabular-nums">+${dec(o.v * 100, 1)} %</b></span>`).join(' ');
    return `<div class="min-w-0">
      <div class="flex items-baseline gap-2 mb-2"><h3 class="font-display text-lg" style="color:${col}">${title}</h3>${kbTTChip(tt, true)}<span class="text-sm text-slate-200" translate="no">${sd.abbr ? `[${esc(sd.abbr)}] ` : ''}${esc(sd.name || '–')}</span>${sd.city ? `<span class="text-[11px] text-slate-500"><span>Rathaus</span> ${esc(sd.city)}</span>` : ''}</div>
      ${kdHero(sd.h1, true)}${kdHero(sd.h2, false)}
      ${sd.gear || sd.arm ? `<div class="rounded-xl border border-ink-700 bg-ink-950/60 p-3 mb-2"><div class="text-[11px] uppercase tracking-wider text-slate-400 mb-1">Ausrüstung</div>${gear || '<div class="text-[11px] text-slate-500">Keine Ausrüstung im Bericht.</div>'}</div>
      <div class="rounded-xl border border-ink-700 bg-ink-950/60 p-3"><div class="text-[11px] uppercase tracking-wider text-slate-400 mb-1">Rüstung &amp; Inschriften</div>${arm || '<div class="text-[11px] text-slate-500">Keine Rüstung im Bericht.</div>'}
        ${sum ? `<div class="mt-2 pt-2 border-t border-ink-700"><div class="text-[10px] text-slate-500 mb-1">Rüstung gesamt</div><div class="flex flex-wrap gap-1">${sum}</div></div>` : ''}</div>` : ''}</div>`;   // ohne gespeichertes Gear: Kästen weglassen
  }
  function kdStats(d, row) {
    const o = d.own || {}, p = d.opp || {}, ab = v => Math.abs(+v || 0);
    const line = (l, a, b, good, fmtf) => { const f = fmtf || fmt; const x = +a || 0, y = +b || 0;
      const wa = x === y ? null : good === 1 ? x > y : good === -1 ? x < y : null;
      return `<tr class="border-b border-ink-800/60"><td class="py-1.5 px-2 text-slate-300">${l}</td><td class="py-1.5 px-2 text-right tabular-nums ${wa === true ? 'text-emerald-300' : wa === false ? 'text-red-300' : 'text-slate-200'}">${a == null ? '–' : f(a)}</td><td class="py-1.5 px-2 text-right tabular-nums ${wa === false ? 'text-emerald-300' : wa === true ? 'text-red-300' : 'text-slate-200'}">${b == null ? '–' : f(b)}</td></tr>`; };
    const pct = (a, t) => t ? dec(a / t * 100, 0) + ' %' : '–';
    // Schaden, den eine Seite verursacht hat = Machtverlust der anderen Seite (aufgeteilt in Skills und Normalangriff)
    const dealtMe = ab(p.Power), dealtEn = ab(o.Power);
    const bar = (sk, at, tot, c) => tot ? `<div class="flex h-2 rounded overflow-hidden bg-ink-800 mt-1"><div style="width:${sk / tot * 100}%;background:${c}"></div><div style="width:${at / tot * 100}%;background:#64748b"></div></div>` : '';
    return `<div class="overflow-x-auto rounded-lg border border-ink-700"><table class="w-full text-xs"><thead class="text-[10px] uppercase tracking-wider text-slate-400"><tr class="border-b border-ink-700"><th class="py-2 px-2 text-left font-medium">Wert</th><th class="py-2 px-2 text-right font-medium text-gold-300">Du</th><th class="py-2 px-2 text-right font-medium text-red-300">Gegner</th></tr></thead><tbody>
      ${line('Truppen zu Beginn', o.InitMax, p.InitMax, 0)}
      ${line('Übrig am Ende', o.Cnt, p.Cnt, 0)}
      ${line('Verwundet', o.Hurt, p.Hurt, -1)}
      ${line('Schwer verwundet', o.BadHurt, p.BadHurt, -1)}
      ${line('Tote', o.Death, p.Death, -1)}
      ${line('Heilung', o.Healing, p.Healing, 1)}
      ${line('Kill Points', o.KillScore, p.KillScore, 1)}
      ${line('Power verloren', ab(o.Power), ab(p.Power), -1)}
      ${line('… durch Skills', ab(o.SkillPower), ab(p.SkillPower), -1)}
      ${line('… durch Normalangriffe', ab(o.AtkPower), ab(p.AtkPower), -1)}
      </tbody></table></div>
      <div class="grid sm:grid-cols-2 gap-2 mt-3">
        <div class="rounded-xl border border-ink-700 bg-ink-950/60 p-3"><div class="text-[11px] text-slate-400">Dein Schaden (Power beim Gegner)</div><div class="text-lg font-semibold text-gold-300 tabular-nums">${short(dealtMe)}</div>
          <div class="text-[11px] text-slate-400"><span>Skills</span> <b class="text-gold-200">${pct(ab(p.SkillPower), dealtMe)}</b> · <span>Normalangriff</span> <b>${pct(ab(p.AtkPower), dealtMe)}</b></div>${bar(ab(p.SkillPower), ab(p.AtkPower), dealtMe, '#f5c542')}</div>
        <div class="rounded-xl border border-ink-700 bg-ink-950/60 p-3"><div class="text-[11px] text-slate-400">Schaden des Gegners (deine Power)</div><div class="text-lg font-semibold text-red-300 tabular-nums">${short(dealtEn)}</div>
          <div class="text-[11px] text-slate-400"><span>Skills</span> <b class="text-red-200">${pct(ab(o.SkillPower), dealtEn)}</b> · <span>Normalangriff</span> <b>${pct(ab(o.AtkPower), dealtEn)}</b></div>${bar(ab(o.SkillPower), ab(o.AtkPower), dealtEn, '#f87171')}</div>
      </div>`;
  }
  function kdRender(rows, loading) {
    let m = $('kdModal');
    if (!m) { m = document.createElement('div'); m.id = 'kdModal'; m.className = 'fixed inset-0 z-[80] bg-black/70 backdrop-blur-sm overflow-y-auto p-2 sm:p-6'; document.body.appendChild(m); document.body.style.overflow = 'hidden';
      m.addEventListener('click', (ev) => { if (ev.target === m || ev.target.closest('[data-kdclose]')) kdClose(); });
      document.addEventListener('keydown', function esc_(ev) { if (ev.key === 'Escape') { kdClose(); document.removeEventListener('keydown', esc_); } }); }
    const r0 = rows[0], t = r0.battle_start ? new Date(r0.battle_start).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' }) : '', en = (r) => `${r.enemy_alliance ? `[${esc(r.enemy_alliance)}] ` : ''}${esc(r.enemy_name || '')}`;
    const tot = rows.reduce((a, r) => a + (+r.kill_points || 0), 0);
    const parts = rows.map((r, i) => { const d = kdCache[r.mail_id + '|' + r.opponent_id];
      return `<section class="${i ? 'mt-6 pt-5 border-t-2 border-gold-500/30' : ''}">
        ${rows.length > 1 ? `<div class="flex flex-wrap items-baseline gap-2 mb-3"><span class="rounded-lg bg-gold-500/15 border border-gold-500/40 text-gold-200 px-2 py-0.5 text-xs font-bold tabular-nums">${i + 1} / ${rows.length}</span><span class="text-sm text-slate-300"><span>gegen</span> <b translate="no" class="text-red-200">${en(r)}</b></span><span class="text-xs text-gold-300 tabular-nums">🏆 ${short(+r.kill_points || 0)}</span></div>` : ''}
        ${kdBody(r, d, loading && d === undefined, 'kdChart' + i)}</section>`; }).join('');
    m.innerHTML = `<div class="panel rounded-2xl p-4 sm:p-6 max-w-6xl mx-auto">
      <div class="flex items-start justify-between gap-3 mb-4"><div><h2 class="font-display text-xl text-gold-300">⚔️ Kampfdetails</h2>
        <div class="text-xs text-slate-400 mt-0.5"><span translate="no">${esc(r0.self_name || '')}</span> <span>gegen</span> <span translate="no" class="text-red-200">${en(r0)}</span>${rows.length > 1 ? ` <span>und</span> ${rows.length - 1} <span>weitere</span> · 🏆 ${short(tot)}` : ''}${t ? ' · ' + esc(t) : ''}</div></div>
        <button type="button" data-kdclose class="px-3 py-1.5 rounded-lg border border-ink-600 hover:border-gold-500/60 text-sm">✕ <span>Schließen</span></button></div>${parts}</div>`;
    (kdChart || []).forEach(c => { try { c?.destroy(); } catch {} }); kdChart = rows.map((r, i) => kdChartOn($('kdChart' + i), kdCache[r.mail_id + '|' + r.opponent_id]));
  }
  function kdBody(row, d, loading, cid) {
    if (loading) return '<div class="py-10 text-center text-sm text-slate-400">Lade Details …</div>';
    if (d && d.err === 'col') return '<div class="py-8 text-center text-sm text-amber-200">Die Spalte „detail“ fehlt noch in Supabase. Bitte zuerst das neue SQL ausführen.</div>';
    if (d && d.err) return `<div class="py-8 text-center text-sm text-red-300">${esc(d.err)}</div>`;
    if (!d) return '<div class="py-8 text-center text-sm text-slate-400">Für diesen Kampf gibt es noch keine Details. Der neue Uploader liest alle Berichte auf dem PC einmal neu ein – danach sind sie da.</div>';
    return `<div class="grid lg:grid-cols-2 gap-4 mb-4">${kdSide(d.self, 'Du', '#f5c542', kbTT(row, 'self'))}${kdSide(d.enemy, 'Gegner', '#f87171', kbTT(row, 'enemy'))}</div>
      <h3 class="font-display text-lg text-gold-300 mb-2">📊 Kampfwerte</h3>${kdStats(d, row)}
      ${(d.samples || []).length > 2 ? `<h3 class="font-display text-lg text-gold-300 mt-4 mb-1">📉 Deine Truppen im Kampfverlauf</h3><div class="text-[11px] text-slate-500 mb-2">${d.fights > 1 ? `<span>Ganzer Bericht mit</span> ${fmt(d.fights)} <span>Gegnern</span> · ` : ''}<span>Rote Punkte = Zeit gegen diesen Gegner.</span></div><div class="h-48"><canvas id="${cid}"></canvas></div>` : ''}`;
  }
  function kdChartOn(c, d) {
    if (!c || !window.Chart || !d?.samples) return null;
    const t0 = d.t0, t1 = d.t0 != null && d.ticks != null ? d.t0 + d.ticks : null;
    const ch = new Chart(c, { type: 'line', data: { labels: d.samples.map(s => s[0] - d.samples[0][0] + ' s'), datasets: [
      { label: 'Truppen', data: d.samples.map(s => s[1]), borderColor: '#f5c542', backgroundColor: '#f5c54222', fill: true, tension: .25, pointRadius: d.samples.map(s => t0 != null && s[0] >= t0 && s[0] <= t1 ? 3 : 0), pointBackgroundColor: '#f87171', borderWidth: 2 }] },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: { callbacks: { label: (x) => fmt(x.raw) } } },
        scales: { y: { ticks: { callback: (v) => short(v), color: '#64748b' }, grid: { color: 'rgba(148,163,184,.08)' } }, x: { ticks: { maxTicksLimit: 10, color: '#64748b' }, grid: { display: false } } } } });
    c._ch = ch; return ch;
  }
  R.viewHooks.battles = () => renderKampf();
  if (R.view === 'battles') renderKampf();
};
