// Wiz fan Club – Battles (eigener Bereich, Reiter neben Feed)
// Kampfberichte aus dem Mailcache des Spiels – der Kampf-Uploader auf dem PC (rok_kampf_upload.py) lädt sie hoch.
// Supabase: rok_battles (Einzelkämpfe), rok_loot (Beute), rok_rallies (Gruppenkämpfe), rok_item_names (optionale Namen)
// PvP = nur Kämpfe gegen Spieler mit Kill Points · PvE = Barbaren / Marodeure / Forts (NpcBType aus dem Bericht) + Belohnungen
// Läuft innerhalb von RokApp (scanner.js); R = geteilter Kontext (window.Rok).
window.RokMods = window.RokMods || {};
window.RokMods.battles = (R) => {
  const $ = R.$, fmt = R.fmt, esc = R.esc, RokAuth = window.RokAuth;
  const short = (v) => { const n = +v; if (isFinite(n) && Math.abs(n) >= 1e9) return (n / 1e9).toFixed(Math.abs(n) >= 1e10 ? 1 : 2).replace(/\.?0+$/, '') + 'B'; return R.short(v); };   // 1000.0M → 1B
  const dec = (v, d = 2) => (+v || 0).toLocaleString('de-DE', { maximumFractionDigits: d });
  const isoDay = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const makeFold = (sec, key) => { if (sec && R.makeFold) R.makeFold(sec, key); };
  // Einstellungen (Filter, Sortierung, PvE-Zuordnung) – lokal je Profil
  const KEY = 'rok_battles_' + (R.PROFILE?.id || 'x');
  let S = {}; try { S = JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch { S = {}; }
  // Farm-Namen, Gruppen, verknüpfte IDs usw. zusätzlich in Supabase (rok_mydata_settings) → gleich auf jedem Gerät / jeder Vercel-Adresse
  const CLOUD_KEYS = ['badgeSeen', 'kdCamp', 'anaMin', 'kvks', 'kvkSeen', 'kvkEdit', 'rsNames', 'rsGroups', 'rsGroupNames', 'linkIds', 'rsKvk', 'idNames', 'accKvk', 'heatAcc', 'buffRes', 'buffAck', 'buffHide'];
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
  (() => {   // My Data öffnet immer mit „Battles“ (außer Direktlink in die Heatmap)
    let hp = false; try { hp = !!new URLSearchParams(location.search).get('heat'); } catch {}
    try { if (!hp) { kbSt().page = 'battles'; } } catch {}
    document.querySelectorAll('.main-tab[data-view="battles"]').forEach(b => b.addEventListener('click', () => { try { if (R.view !== 'battles') kbSt().page = 'battles'; } catch {} }, true));
  })();

  var kbRows = null, kbErr = '', kbLoading = false, kbProg = 0, kbShow = 50, kbNpcCols = true, kbPosCols = true, kbAccCols = true, kbParCols = true, kbKdCols = true, kbFmCols = true;
  function kbSel() { return KB_COLS + (kbNpcCols ? ',npc_btype,npc_level,group_size' : '') + (kbPosCols ? ',pos_x,pos_y,city_x,city_y,map_role,room_id' : '') + (kbPosCols && kbAccCols ? ',acclaim' : '') + (kbParCols ? ',parent_id' : '') + (kbKdCols ? ',enemy_kingdom' : '') + (kbFmCols ? ',self_formation,enemy_formation' : '') + (kbSkCols ? ',enemy_skills,enemy_hero_lv' : '') + (kbPlCols ? ',pilot_gov,pilot_name,pilot_user,pilot_ok' : '') + (kbGrCols ? ',self_gear,enemy_gear' : ''); }
  var kbSkCols = true, kbPlCols = true, kbGrCols = true;
  function kbPilotRow(r) { return r.pilot_gov != null && r.pilot_gov !== ''; }   // von einem Piloten gesteuert → zählt beim Account, aber nicht für Ziele/Erfolge
  function kbPilotHidden(r) { return r.pilot_ok === false && String(r.pilot_user || '') !== String(RokAuth.userId?.() || ''); }   // Pilot noch nicht freigegeben
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
  // Nur so viel laden wie nötig: Standard die letzten 75 Tage (ein ganzes KvK). „Alles“ oder ein früherer Zeitraum lädt den Rest nach.
  var kbCacheFrom = new Map(), kbAllFrom = undefined;
  function kbNeedFrom() {
    const st = kbSt(), d75 = Date.now() - 75 * 864e5; let f = d75;
    if (st.days === 'custom') { if (!st.from) return null; f = Math.min(d75, Date.parse(st.from + 'T00:00:00') - 864e5); }
    else if (!(+st.days > 0)) return null;
    else f = Math.min(d75, Date.now() - (+st.days + 1) * 864e5);
    return new Date(f - f % 864e5).toISOString();
  }
  function kbCovers(from) { const need = kbNeedFrom(); return from == null || (need != null && need >= from); }
  function kbApply() {
    const ids = kbScopeIds(), key = (ids ? ids.slice().sort().join(',') : '*') + '@' + (kbNeedFrom() || 'all');
    if (key === kbCurKey && kbRows) return true;
    if (!ids) { if (!kbAllRows || !kbCovers(kbAllFrom)) return false; kbRows = kbAllRows; kbCurKey = key; return true; }
    if (ids.some(i => !kbCache.has(i) || !kbCovers(kbCacheFrom.get(i)))) return false;
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
    const need = kbNeedFrom(), miss = ids ? ids.filter(i => !kbCache.has(i) || !kbCovers(kbCacheFrom.get(i))) : null;
    if (miss) miss.forEach(i => kbCache.delete(i)); else kbAllRows = null;
    kbLoading = true; kbProg = 0; kbTotal = 0; kbErr = ''; if (R.view === 'battles') renderKampf();
    try { const db = RokAuth.db?.(); if (!db) throw new Error('offline');
      const q0 = (cnt) => { let q = db.from('rok_battles').select(kbSel(), cnt ? { count: 'exact' } : undefined); if (miss) q = q.in('player_id', miss); if (need) q = q.gte('battle_start', need); return q.order('battle_start', { ascending: false }).order('mail_id').order('opponent_id'); };
      let first = null;
      for (let t = 0; t < 8; t++) {
        first = await q0(true).range(0, 999); const m = first.error?.message || ''; if (!first.error) break;
        if (kbGrCols && /self_gear|enemy_gear/i.test(m)) { kbGrCols = false; continue; }
        if (kbPlCols && /pilot_/i.test(m)) { kbPlCols = false; continue; }   // SQL v29/v30 (Pilot) noch nicht ausgeführt
        if (kbSkCols && /enemy_skills|enemy_hero_lv/i.test(m)) { kbSkCols = false; continue; }   // SQL v28 (Skill-Level) noch nicht ausgeführt
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
      all = all.filter(r => !kbPilotHidden(r));   // Pilot-Kämpfe ohne Freigabe sieht nur der Pilot selbst
      if (miss) miss.forEach(i => kbCacheFrom.set(i, need)); else kbAllFrom = need;
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
      if (add.length) { const touched = new Set(); add.filter(r => !kbPilotHidden(r)).forEach(r => { const c = kbCache.get(String(r.player_id)); if (c) { c.push(r); touched.add(c); } if (kbAllRows && kbAllRows !== c) { kbAllRows.push(r); touched.add(kbAllRows); } });
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
  function kbMyIds() { const s = new Set((kbSt().linkIds || []).map(String)); const p = kbProfileId(); if (p) s.add(p); if (typeof kbAdmIds !== 'undefined') kbAdmIds.forEach(x => s.add(x)); (kbAppIds || []).forEach(x => s.add(x)); if (!kbAppIds) kbLoadAppIds(); return s; }
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
  function kbIsAoo(r) { if (r.map_role) return r.map_role === 'dungeon'; const g = +r.server_id; return g > 0 && g < 5000 && g !== +kbHomeSrv(r.player_id); }   // Ark of Osiris = eigenes Schlachtfeld („dungeon“); Heimat-Königreich & KvK = Weltkarte („gsmp“)
  function kbHomeSrv(pid) { const c = kbCache.get(String(pid)); if (!c) return 0; for (const r of c) if (r.map_role === 'gsmp' && +r.server_id < 10000) return +r.server_id; return 0; }
  // 🗓️ KvK-Zeitplan: jede KvK-Karte hat ihre eigene Server-ID (= C-Nummer). Start/Ende aus den Kämpfen, von Hand änderbar.
  var kbPlanMemo = { sig: '', v: null };
  function kbKvkPlan() {
    const st = kbSt(), seen = (st.kvkSeen = st.kvkSeen || {}), ed = st.kvkEdit || {}; let ch = false, nR = 0; kbCache.forEach(r => nR += (r || []).length);
    const sig = nR + '|' + kbCache.size + '|' + JSON.stringify(ed) + '|' + Object.keys(seen).length + '|' + new Date().toISOString().slice(0, 13); if (kbPlanMemo.sig === sig) return kbPlanMemo.v;
    kbCache.forEach(rows => { const M = new Map(); for (const r of rows || []) { const g = +r.server_id; if (!(g >= 10000) || (r.map_role && r.map_role !== 'gsmp') || !r.is_pvp || !r.battle_start) continue; const d = r.battle_start.slice(0, 10), o = M.get(g); if (!o) M.set(g, { a: d, b: d, n: 1 }); else { if (d < o.a) o.a = d; if (d > o.b) o.b = d; o.n++; } }
      M.forEach((o, g) => { if (o.n < 20) return; const c = 'C' + g, x = seen[c]; if (!x) { seen[c] = { a: o.a, b: o.b }; ch = true; } else { if (o.a < x.a) { x.a = o.a; ch = true; } if (o.b > x.b) { x.b = o.b; ch = true; } } }); });
    if (ch) try { savePassive(); } catch {}
    const today = new Date().toISOString().slice(0, 10);
    const out = Object.entries(seen).map(([c, x]) => { const e = ed[c] || {}, from = e.from || x.a, to = e.to || x.b, live = !e.to && Date.now() - Date.parse(x.b + 'T00:00:00Z') < 3 * 864e5;
      return { c, n: e.n || c, from, to: live ? today : to, live, edited: !!(e.from || e.to || e.n) }; }).sort((a, b) => b.from.localeCompare(a.from));
    kbPlanMemo = { sig, v: out }; return out;
  }
  function kbKvkOf(code) { const c = String(code || '').toUpperCase(); return c ? kbKvkPlan().find(k => k.c === c) || null : null; }   // Ark of Osiris: eigener Schlachtfeld-Server (z. B. 3443), Königreich/KvK = 5-stellig (16144 …)
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
    rows.forEach(r => { o.kp += kbN(r.kill_points); o.acc = (o.acc || 0) + kbN(r.acclaim); o.sDead += kbN(r.self_dead); o.sSev += kbN(r.self_severe); o.sWound += kbN(r.self_wounded); o.sHeal += kbN(r.self_healing); o.sPow += kbN(r.self_power_lost);
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
  function kbSubTabs() { const page = kbSt().page || 'battles'; return `<div class="grid grid-cols-4 sm:grid-cols-8 gap-2 sm:gap-3 max-w-6xl mx-auto mt-2" role="tablist">${[['battles', '⚔️', 'Battles', '#f43f5e'], ['heat', '🔥', 'Heatmap', '#fb923c'], ['ana', '📊', 'Analyse', '#a78bfa'], ['loot', '🎁', 'Loot', '#f5c542'], ['res', '🌾', 'Ressourcen', '#34d399'], ['hist', '📚', 'History', '#60a5fa'], ['pilot', '🕹️', 'Pilot', '#c084fc'], ['feed', '📣', 'Feed', '#f472b6']].map(([k, i, l, c]) =>
        `<button type="button" class="hub-tile panel !min-h-[5.5rem] sm:!min-h-[7rem]" data-kbpage="${k}" role="tab" aria-pressed="${page === k}"><span class="w-11 h-11 sm:w-14 sm:h-14 rounded-2xl grid place-items-center text-2xl sm:text-3xl" style="background:linear-gradient(135deg,${c}33,${c}11);border:1px solid ${c}55">${i}</span><span class="font-display text-sm sm:text-lg text-white tracking-wide">${l}</span></button>`).join('')}</div>`; }
  function kbLiveBar() {   // „… kämpft gerade“: Kampf in den letzten 15 min – auf allen Seiten (Heatmap hat ihre eigene Anzeige mit Freunden)
    const L = new Map(), now = Date.now(); kbCache.forEach(rows => { for (const r of rows || []) { const t = Date.parse(r.battle_start || ''); if (!t || now - t > 15 * 6e4) break; if (!r.is_pvp || !kbMine(r.player_id)) continue; const k = String(r.player_id), o = L.get(k); if (!o || t > o.t) L.set(k, { t, name: hmPName(k, r.self_name), n: (o?.n || 0) + 1 }); else o.n++; } });
    if (!L.size) return '';
    return `<div class="max-w-6xl mx-auto mb-2 flex flex-wrap items-center justify-center gap-1.5">${[...L.entries()].map(([id, x]) => `<button type="button" data-kblive="${esc(id)}" title="Zur Heatmap von ${esc(x.name)}" class="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/60 bg-emerald-500/10 hover:bg-emerald-500/20 px-2.5 py-1 text-xs text-emerald-200"><span class="relative flex w-2.5 h-2.5"><span class="absolute inset-0 rounded-full bg-emerald-400 animate-ping"></span><span class="relative w-2.5 h-2.5 rounded-full bg-emerald-400"></span></span><b translate="no">${esc(x.name)}</b>${kbBadgeIcons(id, 2)} <span>fightet</span> <span class="text-emerald-300/70 tabular-nums">· ${Math.max(0, Math.round((now - x.t) / 6e4))} min</span> <span class="text-emerald-300">🔥 →</span></button>`).join('')}</div>`;
  }
  function kbAccBar() {   // alle Accounts in einer Reihe – gilt für Battles, Heatmap, Analyse, Loot und Ressourcen
    const st = kbSt(), pidP = kbProfileId(), ids = [...kbMyIds()], cur = String(st.acc || ''); if (!kbSiteNames) kbLoadSiteNames();
    const seen = (st.idAuto = st.idAuto || {}); kbCache.forEach((rows, id) => { if (rows[0]?.self_name) seen[id] = rows[0].self_name; });
    const names = new Map(Object.entries(seen)), loaded = (id) => kbCache.has(id);
    const farms = st.page === 'res' && rsRows ? [...new Map(rsRows.filter(r => r.pid != null && !ids.includes(String(r.pid))).map(r => [String(r.pid), rsNameOf(r.pid, r.acc)])).entries()] : [];
    const chip = (id, icon, label, extra) => { const on = cur === id; return `<span class="inline-flex items-center rounded-xl border transition ${on ? 'border-gold-400 bg-gold-500/20 text-gold-100 shadow-[0_0_12px_rgba(245,197,66,.25)]' : 'border-ink-600 bg-ink-950/60 text-slate-300 hover:border-gold-500/60'}" translate="no">
      <button type="button" data-kbaccbar="${esc(id)}" class="px-3 py-1.5 text-sm font-semibold whitespace-nowrap">${icon} ${label}${id ? ` <span class="text-[10px] tabular-nums ${on ? 'text-gold-300/80' : 'text-slate-500'}">${esc(id)}</span>${loaded(id) ? '' : ' <span class="text-[10px] text-slate-600" title="Noch nicht geladen">•</span>'}` : ''}</button>${extra || ''}</span>`; };
    const own = ids.slice().sort((a, b) => (b === pidP) - (a === pidP)).map(id => { const n = kbIdName(id, names), me = id === pidP;
      return chip(id, me ? '👤' : '🔗', (n ? esc(n) : '<span class="text-slate-500">?</span>') + kbBadgeIcons(id, 3), (kbSiteNames?.get(id) ? '' : `<button type="button" data-hmidname="${esc(id)}" class="pr-1 text-slate-500 hover:text-gold-300" title="Namen eintragen">✏️</button>`) + (me ? '' : `<button type="button" data-kbunlink="${esc(id)}" class="pr-2 text-slate-500 hover:text-red-300" title="Verknüpfung lösen">✕</button>`)); }).join('');
    return `<div class="max-w-6xl mx-auto mt-3 mb-1 flex flex-wrap items-center justify-center gap-2">
      ${ids.length > 1 || farms.length ? chip('', '🌍', '<span>Alle</span>') : ''}${own}
      ${farms.length ? (() => { const curF = farms.find(([id]) => id === cur), fs = farms.slice().sort((a, b) => String(a[1]).localeCompare(String(b[1]), 'de', { numeric: true }));
        return `${curF ? chip(curF[0], '🌾', esc(curF[1])) : ''}<span class="relative inline-block"><button type="button" data-kbfarmtog class="inline-flex items-center gap-1.5 rounded-xl border ${st.farmOpen ? 'border-gold-400 text-gold-100' : 'border-ink-600 text-slate-300'} bg-ink-950/60 px-3 py-1.5 text-sm font-semibold hover:border-gold-500/60">🌾 <span>Farmen</span> <span class="text-[10px] text-slate-500 tabular-nums">${fmt(farms.length)}</span> ${st.farmOpen ? '▴' : '▾'}</button>
          ${st.farmOpen ? `<div class="absolute z-40 left-1/2 -translate-x-1/2 mt-2 w-[min(92vw,640px)] rounded-2xl border border-ink-600 bg-ink-900 shadow-2xl p-3"><input data-kbfarmq placeholder="🔍 Farm suchen …" value="${esc(st.farmQ || '')}" class="w-full mb-2 bg-ink-950 border border-ink-600 rounded-lg px-2.5 py-1.5 text-xs text-slate-100 focus:outline-none focus:border-gold-500">
            <div class="max-h-72 overflow-y-auto grid grid-cols-2 sm:grid-cols-3 gap-1.5 pr-1">${fs.filter(([id, l]) => !st.farmQ || (l + ' ' + id).toLowerCase().includes(st.farmQ.toLowerCase())).map(([id, l]) => `<button type="button" data-kbaccbar="${esc(id)}" class="text-left rounded-lg border ${cur === id ? 'border-gold-400 bg-gold-500/20 text-gold-100' : 'border-ink-700 bg-ink-950/60 text-slate-300 hover:border-gold-500/60'} px-2 py-1 text-xs" translate="no"><div class="font-semibold truncate">🌾 ${esc(l)}</div><div class="text-[10px] text-slate-500 tabular-nums">${esc(id)}</div></button>`).join('')}</div></div>` : ''}</span>`; })() : ''}
      <input data-kblinkid inputmode="numeric" placeholder="+ ID" maxlength="12" class="bg-ink-950 border border-ink-600 rounded-xl px-2.5 py-1.5 text-xs w-24 text-slate-100 focus:outline-none focus:border-gold-500">
      ${kbAdmHtml(st)}
      ${ids.length ? '' : '<span class="text-[11px] text-amber-300">Keine Governor-ID im Profil – es werden alle hochgeladenen Accounts gezeigt.</span>'}</div>`;
  }
  function renderKampf() {
    const el = $('battlesView'); if (!el) return; const st0 = kbSt(); kbBuffStart(); kbKvkFillLoad();
    const idWarn = kbProfileId() ? '' : `<div class="max-w-3xl mx-auto mb-3 rounded-2xl border-2 border-red-500/70 bg-red-500/10 p-4 text-center"><div class="text-lg font-bold text-red-200">🆔 <span>Bitte trag deine Governor-ID ein</span></div><div class="text-sm text-slate-300 mt-1">Ohne ID kann die Seite deine Kämpfe, Erfolge und Pilot-Daten nicht zuordnen. Du findest sie im Spiel im Profil („Governor (ID: …)“).</div><button type="button" data-kbgoprof class="mt-3 rounded-xl bg-red-500 hover:bg-red-400 text-white font-bold px-5 py-2">👤 <span>Zum Profil – ID eintragen</span></button></div>`;
    const wip = idWarn + `<div class="flex flex-wrap items-center justify-center gap-2">
      <button type="button" data-kbapp class="relative inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-gold-400 to-amber-500 text-ink-950 font-bold px-5 py-2 shadow-lg shadow-amber-500/30 hover:brightness-110"><span class="absolute -top-1 -right-1 flex w-3 h-3"><span class="absolute inset-0 rounded-full bg-emerald-400 animate-ping"></span><span class="relative w-3 h-3 rounded-full bg-emerald-400"></span></span>📲 <span>App herunterladen</span> <span class="text-[10px] font-semibold opacity-70">Windows</span></button></div>`;
    if (!st0.accV2 && kbProfileId()) { st0.accV2 = 1; st0.acc = kbProfileId(); }
    if (st0.pvpV2 !== 1) { st0.pvpV2 = 1; st0.pvpMode = 'field'; }   // KvK und Ark of Osiris getrennt – Standard: nur Weltkarte   // Standard: dein Profil-Account
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
        ${kbKvkPlan().slice(0, 6).map(k => { const on = st.days === 'custom' && st.from === k.from && st.to === k.to, dd = (x) => x.slice(8, 10) + '.' + x.slice(5, 7) + '.' + x.slice(2, 4);
          return `<span class="inline-flex items-center rounded-lg border ${on ? 'border-gold-500/70 bg-gold-500/15 text-gold-200' : 'border-ink-600 text-slate-300'} text-xs" translate="no"><button type="button" data-kbplan="${esc(k.c)}" class="pl-2 pr-1 py-1" title="KvK-Karte ${esc(k.c)}">🏁 <b>${esc(k.n)}</b>${k.n !== k.c ? ` <span class="text-slate-500">${esc(k.c)}</span>` : ''} <span class="text-slate-400">${dd(k.from)} – ${k.live ? '<span class="text-emerald-300">läuft</span>' : dd(k.to)}</span></button>${on ? `<button type="button" data-kbplanedit="${esc(k.c)}" class="px-1.5 py-1 text-slate-400 hover:text-gold-300" title="Name, Start und Ende ändern">✏️</button>` : ''}</span>`; }).join('')}
        <button type="button" data-kbnewkvk class="inline-flex items-center gap-1 rounded-lg border border-emerald-500/60 bg-emerald-500/10 text-emerald-200 px-2 py-1 text-xs font-semibold">🆕 <span>Neues KvK</span></button>${kbNewKvkHtml(st)}
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
    const subTabs = kbSubTabs() + kbAccBar() + kbLiveBar();
    const pageHead = (icon, t, sub) => `<section class="panel rounded-2xl p-5"><h2 class="font-display text-lg text-gold-300">${icon} ${t}</h2><p class="text-xs text-slate-400 mb-3">${sub}</p>`;
    if (page === 'res') {
      if (!rsRows && !rsLoading) loadRes();
      el.innerHTML = wip + subTabs + rsHtml(timeRow('', accsRes));
      kbBind(el); rsDraw(); return;
    }
    try { kbFeedCheck(); } catch {}
    if (page === 'pilot' || page === 'hist' || page === 'feed') {
      el.innerHTML = wip + subTabs + (page === 'pilot' ? kbPilotHtml(st) : page === 'feed' ? kbFeedHtml(st) : kbHistHtml(st));
      el.querySelectorAll('[data-kbfeedf]').forEach(b => b.onclick = () => { st.feedMine = b.dataset.kbfeedf === '1'; renderKampf(); });
      kbBind(el); el.querySelectorAll('[data-kbpses]').forEach(b => b.onclick = () => { const [pid, day, f, t] = b.dataset.kbpses.split('|'), h = hmCfg(st); kbAdmIds.add(pid); st.acc = pid; st.page = 'heat'; h.mode = 'my'; h.t = 'day'; h.day = day; h.hf = f; h.ht = t; h.fight = null; savePassive(); renderKampf(); window.scrollTo({ top: 0 }); });
      el.querySelectorAll('[data-kbpilotsel]').forEach(b => b.onclick = () => { st.pilotSel = b.dataset.kbpilotsel; renderKampf(); });
      el.querySelectorAll('[data-kbpilotre]').forEach(b => b.onclick = () => { kbPilot.key = ''; kbPilotLoad(true); renderKampf(); });
      el.querySelectorAll('[data-kbhist]').forEach(b => b.onclick = () => { st.histOpen = st.histOpen === b.dataset.kbhist ? '' : b.dataset.kbhist; renderKampf(); });
      el.querySelectorAll('[data-kbhistsave]').forEach(b => b.onclick = () => { const todo = kbHistTodo(false); if (!todo.length) { kbHist.msg = 'Keine KvK-Kämpfe im geladenen Zeitraum (mind. 20 PvP).'; renderKampf(); return; } b.disabled = true; kbHistSave(todo).then(n => { kbHist.msg = n + ' gespeichert'; }).catch(e => { kbHist.err = e?.message || String(e); }).finally(() => { kbHist.rows = null; kbHistLoad(true); renderKampf(); }); });
      return;
    }
    if (page === 'ana') {
      if (!kxLoot && !kxLoading) loadKampfExtra();
      el.innerHTML = wip + subTabs + anaHtml(st, timeRow('', accsRes));
      kbBind(el); el.querySelectorAll('[data-anatab]').forEach(b => b.onclick = () => { st.anaTab = b.dataset.anatab; savePassive(); renderKampf(); });
      el.querySelectorAll('[data-anatier]').forEach(b => b.onclick = () => { st.anaTier = b.dataset.anatier; savePassive(); renderKampf(); });
      el.querySelectorAll('[data-anamin]').forEach(b => b.onclick = () => { st.anaMin = +b.dataset.anamin; savePassive(); renderKampf(); });
      el.querySelectorAll('[data-anacamp]').forEach(x => x.onchange = () => { const m = (st.kdCamp = st.kdCamp || {}); if (x.value === 'auto') delete m[x.dataset.anacamp]; else m[x.dataset.anacamp] = +x.value; savePassive(); renderKampf(); });
      el.querySelectorAll('[data-anacampf]').forEach(b => b.onclick = () => { st.anaCampF = +b.dataset.anacampf || 0; savePassive(); renderKampf(); });
      el.querySelectorAll('[data-anaby]').forEach(b => b.onclick = () => { st.anaBy = b.dataset.anaby; savePassive(); renderKampf(); });
      el.querySelectorAll('[data-anakd]').forEach(b => b.onclick = () => { const k = +b.dataset.anakd; st.anaKd = st.anaKd != null && +st.anaKd === k ? null : k; savePassive(); renderKampf(); }); return;
    }
    if (page === 'heat') {
      const accSel = accs.length > 1 ? `<select data-kbacc class="${inp}"><option value="">Alle Accounts</option>${accs.map(([k, l]) => `<option value="${esc(k)}" ${st.acc === k ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>` : '';
      el.innerHTML = wip + subTabs + hmHtml(st, `<button type="button" id="kbReload" class="ml-auto px-3 py-1 rounded-lg border border-ink-600 hover:border-gold-500/60 text-xs">${kbLoading ? 'Lädt …' : '↻ Neu laden'}</button>`);
      kbBind(el); hmBind(el, st); { const box = $('hmBox'); if (box && !hmLast) box.style.opacity = '.55'; requestAnimationFrame(() => setTimeout(() => { hmDraw(st); if (box) box.style.opacity = ''; }, 0)); } return;
    }
    const last = kbRows[0]?.battle_start ? new Date(kbRows[0].battle_start) : null;
    const nJoin = new Set((pvp ? rallyPvp : rallyPve).map(r => r.mail_id)).size;
    const pidP = kbProfileId(), links = (st.linkIds || []).map(String), names = new Map(kbRows.map(r => [String(r.player_id), r.self_name]));
    const idChip = (id, own) => `<span class="inline-flex items-center gap-1 rounded-lg border ${own ? 'border-gold-500/60 bg-gold-500/10 text-gold-200' : 'border-ink-600 text-slate-300'} px-2 py-0.5" translate="no">${own ? '👤' : '🔗'} ${esc(kbIdName(id, names))} <span class="tabular-nums text-slate-400">${esc(id)}</span>${own ? ' <span class="text-[10px] text-slate-500">Profil</span>' : `<button type="button" data-kbunlink="${esc(id)}" class="text-slate-500 hover:text-red-300" title="Verknüpfung lösen">✕</button>`}</span>`;
    const idBar = `<div class="flex flex-wrap items-center gap-1.5 mb-2 text-[11px]"><span class="text-slate-500">🆔 <span>Angezeigt für</span>:</span>
        ${pidP ? idChip(pidP, true) : '<span class="text-amber-300">Keine Governor-ID im Profil – es werden alle hochgeladenen Accounts gezeigt.</span>'}${links.filter(x => x !== pidP).map(x => idChip(x, false)).join('')}
        <input data-kblinkid inputmode="numeric" placeholder="+ ID verknüpfen" maxlength="12" class="bg-ink-950 border border-ink-600 rounded-lg px-2 py-0.5 text-[11px] w-32 text-slate-100 focus:outline-none focus:border-gold-500">
        <button type="button" data-kbapp class="ml-auto inline-flex items-center gap-1 rounded-lg border border-gold-500/60 bg-gold-500/10 text-gold-200 hover:bg-gold-500/20 px-2 py-0.5">📲 <span>App &amp; Overlay</span></button></div>`;
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
        ${khTile('🩸', 'Schwer verwundet', short(khHeal), '<span>eigene Truppen im Lazarett</span>', 'text-orange-300')}
        ${healTile}
      </div>` : `<div class="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-3">
        ${khTile('🏆', 'Kill Points', short(A.kp), fmt(A.kp), 'text-gold-300')}
        ${khTile('🎖️', 'Verdienst', short(A.acc || 0), fmt(A.acc || 0), 'text-sky-300')}
        ${khTile('⚖️', 'Trade %', khTr == null ? '–' : khTr === Infinity ? '∞' : dec(khTr * 100, 0) + ' %', `<span>Kills</span> ${short(khKills)} ÷ <span>Heal</span> ${short(khHeal)}`, khTr == null ? 'text-white' : khTr >= 1 ? 'text-emerald-300' : 'text-red-300')}
      </div>${pvp ? kbBaseStats(rows, A) : ''}`;
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
          ${stat('Verdienst', 'Verdienst (Acclaim) mit diesem Marsch.', fmt(M.acc || 0), 'text-sky-300')}
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
      { k: 'acc', l: 'Verdienst', v: a => a.acc || 0, f: a => short(a.acc || 0), c: sky }, { k: 'sHeal', l: 'Heilung', v: a => a.sHeal, f: a => short(a.sHeal), c: sky },
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
    const fieldBox = pvp ? (() => { try { const hc = hmCfg(st); return `<section class="panel rounded-2xl px-4 pb-4 pt-3 mt-4">${hmQuickHtml(st, hc).replace('xl:grid-cols-1', 'xl:grid-cols-6').replace('xl:sticky xl:top-2', '')}${hmFieldHtml(st, hc, hmMap(hc))}</section>${kbGearHtml(st)}`; } catch (e) { return ''; } })() : '';
    el.innerHTML = wip + subTabs + head(filters + info + topBar + cardsBox) + `</section>${fieldBox}${extraBox}${pvp ? '' : kbBarbHtml(st) + kxSections('loot')}${trend}${pvp ? analysis + kxSections() : ''}
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
    el.querySelectorAll('[data-kbgearcmp]').forEach(c => c.onclick = () => { const r = kbGearIdx[+c.dataset.kbgearcmp]; if (r) kbGearCompare(r); });
    el.querySelectorAll('[data-kbgeardet]').forEach(d => d.ontoggle = () => { st.gearOpen = d.open; savePassive(); });
    el.querySelectorAll('[data-kbgearq]').forEach(i => i.onchange = () => { st.gearQ = i.value.trim(); re(); });
    kbNewKvkBind(el);
    el.querySelectorAll('[data-kbgoprof]').forEach(b => b.onclick = () => { try { R.openProfile ? R.openProfile(RokAuth.userId()) : (R.view = 'profile', R.applyView?.()); } catch { R.view = 'profile'; R.applyView?.(); } window.scrollTo({ top: 0 }); });
    el.querySelectorAll('[data-kbapp]').forEach(b => b.onclick = (e) => { e.preventDefault(); kbAppModal(); });
    el.querySelectorAll('[data-kblive]').forEach(b => b.onclick = () => { st.acc = b.dataset.kblive; st.page = 'heat'; const h = hmCfg(st); h.mode = 'my'; re(); window.scrollTo({ top: 0, behavior: 'smooth' }); });
    el.querySelectorAll('[data-kbadm]').forEach(b => b.onclick = (e) => { e.stopPropagation(); st.admOpen = !st.admOpen; renderKampf(); });
    el.querySelectorAll('[data-kbadmq]').forEach(i => { i.oninput = () => { const q = i.value.toLowerCase(); i.nextElementSibling.querySelectorAll('[data-kbadmpick]').forEach(b => b.style.display = !q || b.textContent.toLowerCase().includes(q) ? '' : 'none'); }; setTimeout(() => i.focus(), 0); });
    el.querySelectorAll('[data-kbadmpick]').forEach(b => b.onclick = () => { const id = b.dataset.kbadmpick; kbAdmIds.add(id); st.admOpen = false; st.acc = id; re(); });
    if (st.page !== 'heat') { const h = hmCfg(st);
      el.querySelectorAll('[data-hmfw]').forEach(b => b.onclick = (e) => { e.preventDefault(); h.fw = +b.dataset.hmfw; re(); });
      el.querySelectorAll('[data-hmfrel]').forEach(b => b.onclick = (e) => { e.preventDefault(); kbField.t = 0; kbFieldLoad(kbField.key ? kbField.key.split(',') : [], true, h.fw); });
      el.querySelectorAll('[data-hmfield]').forEach(d => d.ontoggle = () => { if (h.fieldOpen !== d.open) { h.fieldOpen = d.open; savePassive(); if (d.open) renderKampf(); } }); }
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
    el.querySelectorAll('[data-kbfarmtog]').forEach(b => b.onclick = (e) => { e.stopPropagation(); st.farmOpen = !st.farmOpen; re(); });
    el.querySelectorAll('[data-kbfarmq]').forEach(i => { i.oninput = () => { st.farmQ = i.value; const q = i.value.toLowerCase(); i.nextElementSibling.querySelectorAll('[data-kbaccbar]').forEach(b => b.style.display = !q || b.textContent.toLowerCase().includes(q) ? '' : 'none'); }; });
    el.querySelectorAll('[data-kbaccbar]').forEach(b => b.onclick = () => { st.farmOpen = false; st.acc = b.dataset.kbaccbar; st.accV2 = 1; st.march = ''; st.enemy = ''; const h = st.heat; if (h) { h.fight = null; h.tl = null; h.pop = null; h.iso = null; h.march = ''; try { const mp = hmAk(hmCfg(st)).map; if (mp) h.map = mp; } catch {} } hmView = { s: 1, x: 0, y: 0 }; re(); });
    el.querySelectorAll('[data-hmidname]').forEach(b => b.onclick = () => { const id = b.dataset.hmidname, n = (st.idNames || {})[id] || '';
      hmAsk('Name für ' + id, n, (v) => { st.idNames = { ...(st.idNames || {}) }; if (v) st.idNames[id] = v.slice(0, 24); else delete st.idNames[id]; re(); }, '', 'z. B. Farm 1'); });
    el.querySelectorAll('[data-kblootcat]').forEach(b => b.onclick = () => { st.lootCat = b.dataset.kblootcat; re(); });
    el.querySelectorAll('[data-kbheal]').forEach(b => b.onclick = () => { st.healType = b.dataset.kbheal; re(); });
    el.querySelectorAll('[data-kbplan]').forEach(b => b.onclick = () => { const k = kbKvkOf(b.dataset.kbplan); if (!k) return; st.days = 'custom'; st.from = k.from; st.to = k.to; st.pvpMode = 'field'; re(); });
    el.querySelectorAll('[data-kbplanedit]').forEach(b => b.onclick = () => { const c = b.dataset.kbplanedit, k = kbKvkOf(c); if (!k) return; const e = ((st.kvkEdit = st.kvkEdit || {})[c] = st.kvkEdit[c] || {});
      const n = prompt('Name für ' + c + ' (leer = ' + c + ')', e.n || ''); if (n === null) return; const f = prompt('Start (JJJJ-MM-TT)', k.from); if (f === null) return; const t = prompt('Ende (JJJJ-MM-TT, leer = läuft noch)', e.to || (k.live ? '' : k.to)); if (t === null) return;
      const ok = (x) => /^\d{4}-\d{2}-\d{2}$/.test(x); e.n = n.trim() || undefined; e.from = ok(f.trim()) ? f.trim() : undefined; e.to = ok(t.trim()) ? t.trim() : undefined; if (!e.n && !e.from && !e.to) delete st.kvkEdit[c];
      const k2 = kbKvkOf(c); if (k2) { st.from = k2.from; st.to = k2.to; } re(); });
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
      .filter(r => !(+r.group_size > 1 && r.city_x != null && r.pos_x != null && Math.hypot(+r.pos_x - +r.city_x, +r.pos_y - +r.city_y) <= 30));
  }
  function anaSum(rows) { const o = { n: 0, kp: 0, ekp: 0, my: 0, en: 0, dead: 0 }; rows.forEach(r => { o.n++; o.kp += +r.kill_points || 0; o.ekp += +r.enemy_kill_points || 0; o.my += (+r.self_severe || 0) + (+r.self_dead || 0); o.en += (+r.enemy_severe || 0) + (+r.enemy_dead || 0); o.dead += +r.self_dead || 0; });
    o.kpt = o.ekp > 0 ? o.kp / o.ekp : (o.kp ? Infinity : null); o.trade = o.my > 0 ? o.en / o.my : (o.en ? Infinity : null); return o; }
  function kbKdNum(k) { k = +k; return k > 0 ? (k < 10000 ? k + 1000 : k) : null; }   // Bericht: COSId = Königreich − 1000 (79 → 1079, 2489 → 3489 …)
  function anaKd(k) { return k ? '#' + k : ''; }
  // 🏕️ Camps: von Hand je Königreich (Analyse) – sonst aus dem KvK-Rechner im Profil (Karte → Camps)
  var ANA_CAMPS = [{ i: '🔥', n: 'Feuer', c: '#f87171', rgb: '248,113,113' }, { i: '🪨', n: 'Erde', c: '#d6a46b', rgb: '214,164,107' }, { i: '💧', n: 'Wasser', c: '#60a5fa', rgb: '96,165,250' }, { i: '🌪️', n: 'Wind', c: '#b794f4', rgb: '183,148,244' }];
  function anaCalcCamps() { try { const md = window.KvKCalc?.getState?.()?.mid; if (!md?.camps) return null; const m = new Map(); md.camps.forEach((c, i) => String(c?.kds || '').split(/[,;\s]+/).map(k => k.replace(/[^\d]/g, '').slice(0, 4)).filter(Boolean).forEach(k => m.set(k, i + 1)));
    return { m, names: md.camps.map((c, i) => (c?.name || '').trim() || ANA_CAMPS[i].n), my: +md.myCamp || 0 }; } catch { return null; } }
  function anaCampOf(kd) { const st = kbSt(), man = (st.kdCamp || {})[kd]; if (man != null) return { c: +man, auto: false }; const cc = anaCalcCamps(); const v = cc?.m.get(String(kd)); return v ? { c: v, auto: true } : { c: 0, auto: false }; }
  function anaCampName(i) { const cc = anaCalcCamps(); return i ? ANA_CAMPS[i - 1].i + ' ' + (cc?.names[i - 1] || ANA_CAMPS[i - 1].n) : '–'; }
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
  // ⏱️ Kampfzeit aus den Kampfzeiten: Kämpfe mit höchstens 5 min Pause gehören zusammen
  function kbFightTime(rows) { const I = rows.map(r => { const a = Date.parse(r.battle_start || ''), b = Date.parse(r.battle_end || '') || a + 30e3; return [a, Math.max(b, a + 10e3)]; }).filter(x => x[0]).sort((x, y) => x[0] - y[0]);
    let tot = 0, cur = null, n = 0; I.forEach(([a, b]) => { if (cur && a - cur[1] <= 5 * 6e4) cur[1] = Math.max(cur[1], b); else { if (cur) tot += cur[1] - cur[0]; cur = [a, b]; n++; } }); if (cur) tot += cur[1] - cur[0]; return { ms: tot, n }; }
  function kbDurTxt(ms) { const m = Math.round(ms / 6e4); return m < 60 ? m + ' min' : Math.floor(m / 60) + ' h ' + String(m % 60).padStart(2, '0') + ' min'; }
  function kbBaseStats(rows, A) {   // 📋 Basis-Statistik unter den großen Kacheln
    const ft = kbFightTime(rows), en = new Set(rows.map(r => String(r.enemy_player_id || r.enemy_name || '')).filter(Boolean)), days = new Set(rows.map(r => (r.battle_start || '').slice(0, 10))).size, h = ft.ms / 36e5;
    const kills = A.eDead + A.eSev, own = A.sDead + A.sSev, ek = rows.reduce((a, r) => a + kbN(r.enemy_kill_points), 0), def = rows.filter(kbDefeated).length;
    const it = (i, l, v, sub, c) => `<div class="rounded-lg border border-ink-800 bg-ink-950/50 px-3 py-2"><div class="text-[10px] text-slate-400">${i} <span>${l}</span></div><div class="text-base font-bold tabular-nums ${c || 'text-slate-100'}">${v}</div>${sub ? `<div class="text-[10px] text-slate-500">${sub}</div>` : ''}</div>`;
    return `<div class="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2 mb-4">
      ${it('⏱️', 'Kampfzeit', kbDurTxt(ft.ms), fmt(ft.n) + ' <span>Schlachten</span>', 'text-amber-200')}
      ${it('⚔️', 'Kämpfe', fmt(rows.length), fmt(days) + ' <span>Tage aktiv</span>')}
      ${it('🎯', 'Gegner', fmt(en.size), '<span>verschiedene Spieler</span>')}
      ${it('🏆', 'KP pro Stunde', h > 0 ? short(A.kp / h) : '–', '<span>Kampfzeit</span>', 'text-gold-300')}
      ${it('📊', 'Ø KP pro Kampf', rows.length ? short(A.kp / rows.length) : '–')}
      ${it('🔁', 'KP-Trade', ek ? dec(A.kp / ek, 2) + ' : 1' : '–', short(ek) + ' <span>Gegner-KP</span>', ek && A.kp / ek >= 1 ? 'text-emerald-300' : 'text-red-300')}
      ${it('☠️', 'Kills', short(kills), short(A.eDead) + ' <span>tot</span> · ' + short(A.eSev) + ' SV', 'text-emerald-300')}
      ${it('💀', 'Eigene Verluste', short(own), short(A.sDead) + ' <span>tot</span> · ' + short(A.sSev) + ' SV · ' + fmt(def) + ' <span>Gegner besiegt</span>', 'text-red-300')}</div>`;
  }
  // ===== 🆕 Neues KvK starten: C-Nummer + Karte angeben → altes KvK landet automatisch in der History =====
  function kbNewKvkHtml(st) { if (!st.newKvkOpen) return ''; const today = new Date().toISOString().slice(0, 10);
    return `<div class="basis-full mt-2 rounded-2xl border border-emerald-500/50 bg-emerald-500/5 p-3"><div class="text-sm font-semibold text-emerald-100 mb-2">🆕 <span>Neues KvK starten</span></div>
      <div class="flex flex-wrap items-end gap-2 text-xs"><label class="flex flex-col gap-1"><span class="text-slate-400">C-Nummer</span><input data-nk="c" placeholder="C16152" maxlength="8" class="w-28 bg-ink-950 border border-ink-600 rounded-lg px-2 py-1.5 text-slate-100 uppercase"></label>
        <label class="flex flex-col gap-1"><span class="text-slate-400">Karte</span><select data-nk="map" class="bg-ink-950 border border-ink-600 rounded-lg px-2 py-1.5 text-slate-100">${HM_MAPS.map(m => `<option value="${m.k}">${esc(m.n)}</option>`).join('')}</select></label>
        <label class="flex flex-col gap-1"><span class="text-slate-400">Start</span><input data-nk="from" type="date" value="${today}" class="bg-ink-950 border border-ink-600 rounded-lg px-2 py-1.5 text-slate-100"></label>
        <label class="flex flex-col gap-1"><span class="text-slate-400">Name (optional)</span><input data-nk="n" placeholder="z. B. KvK 3 – Heroic Anthem" class="w-48 bg-ink-950 border border-ink-600 rounded-lg px-2 py-1.5 text-slate-100"></label>
        <button type="button" data-nkgo class="rounded-lg bg-emerald-500 hover:bg-emerald-400 text-ink-950 font-bold px-4 py-1.5">✔ <span>Starten</span></button><button type="button" data-nkx class="rounded-lg border border-ink-600 px-3 py-1.5 text-slate-300">✕</button></div>
      <div class="text-[11px] text-slate-400 mt-2">Das laufende KvK wird am Tag davor beendet und mit allen Accounts in der 📚 History gespeichert. Danach zählen Battles, Heatmap und Analyse ab dem Start des neuen KvK.</div><div data-nkmsg class="text-xs mt-1"></div></div>`; }
  function kbNewKvkBind(el) { const st = kbSt(), g = (k) => el.querySelector(`[data-nk="${k}"]`)?.value?.trim() || '';
    el.querySelectorAll('[data-kbnewkvk]').forEach(b => b.onclick = () => { st.newKvkOpen = !st.newKvkOpen; renderKampf(); });
    el.querySelectorAll('[data-nkx]').forEach(b => b.onclick = () => { st.newKvkOpen = false; renderKampf(); });
    el.querySelectorAll('[data-nkgo]').forEach(b => b.onclick = async () => { const msg = el.querySelector('[data-nkmsg]'), c = ('C' + g('c').replace(/\D/g, '')).toUpperCase(), from = g('from'), map = g('map'), n = g('n');
      if (c.length < 4 || !/^\d{4}-\d{2}-\d{2}$/.test(from)) { msg.innerHTML = '<span class="text-red-300">C-Nummer und Start angeben.</span>'; return; }
      b.disabled = true; msg.innerHTML = '<span class="text-slate-300">Speichere altes KvK …</span>';
      const prev = new Date(Date.parse(from + 'T12:00:00') - 864e5).toISOString().slice(0, 10), ed = (st.kvkEdit = st.kvkEdit || {});
      kbKvkPlan().filter(k => k.c !== c && k.live).forEach(k => { ed[k.c] = { ...(ed[k.c] || {}), to: prev }; });
      ed[c] = { ...(ed[c] || {}), from, n: n || undefined }; (st.kvkSeen = st.kvkSeen || {})[c] = st.kvkSeen[c] || { a: from, b: from }; kbPlanMemo.sig = '';
      let saved = 0; try { const todo = kbHistTodo(false).filter(x => x.c !== c); if (todo.length) saved = await kbHistSave(todo); kbHist.rows = null; } catch (e) { msg.innerHTML = '<span class="text-red-300">History: ' + esc(e?.message || String(e)) + '</span>'; }
      const acc = (st.accKvk = st.accKvk || {}); [...kbMyIds()].forEach(id => { acc[id] = { ...(acc[id] || {}), kvk: c, start: from, map }; }); try { hmCfg(st).map = map; } catch {}
      st.days = 'custom'; st.from = from; st.to = new Date().toISOString().slice(0, 10); st.pvpMode = 'field'; st.newKvkOpen = false; savePassive(); renderKampf();
      try { R.toast?.(`🆕 ${c} gestartet · ${saved} KvK-Zusammenfassung(en) in der History`); } catch {} }); }
  // ===== 📣 Feed: erreichte Abzeichen-Stufen werden automatisch gepostet (Tabelle rok_feed) =====
  var kbFeed = { rows: null, loading: false, err: '', t: 0 }, kbFeedBusy = false, kbFeedT = 0;
  function kbFeedCheck() {   // neue Stufen der eigenen Accounts erkennen und posten (beim ersten Mal nur merken, nichts posten)
    if (kbFeedBusy || Date.now() - kbFeedT < 20e3 || !RokAuth.userId?.()) return; kbFeedT = Date.now(); const st = kbSt(), seen = (st.badgeSeen = st.badgeSeen || {}), out = []; let ch = false;
    [...kbMyIds()].filter(id => !kbAdmIds.has(id) && kbCache.has(id)).forEach(id => { const B = kbAccBadges(id), was = seen[id]; const nm = (kbCache.get(id) || []).find(r => r.self_name)?.self_name || id;
      if (!was) { seen[id] = Object.fromEntries(B.map(b => [b.k, b.lv])); ch = true; return; }
      B.forEach(b => { if (b.lv > (was[b.k] || 0)) { out.push({ governor_id: +id, name: nm, badge: b.k, icon: b.ic, tier: b.one ? 0 : b.lv, title: b.title, value: String(b.f(b.v)).replace(/<[^>]+>/g, ''), descr: b.d }); was[b.k] = b.lv; ch = true; } }); });
    if (ch) savePassive(); if (!out.length) return; kbFeedBusy = true;
    (async () => { try { const db = RokAuth.db?.(); const r = await db.from('rok_feed').insert(out); if (r.error) throw r.error; kbFeed.rows = null; try { R.toast?.('📣 ' + out.map(o => o.icon + ' ' + o.title).join(' · ')); } catch {} } catch (e) { kbFeed.err = e?.message || String(e); } kbFeedBusy = false; })();
  }
  function kbFeedLoad() { if (kbFeed.loading || (kbFeed.rows && Date.now() - kbFeed.t < 60e3)) return; kbFeed.loading = true;
    (async () => { try { const db = RokAuth.db?.(); const r = await db.from('rok_feed').select('*').order('created_at', { ascending: false }).limit(150); if (r.error) throw r.error; kbFeed.rows = r.data || []; kbFeed.err = ''; }
      catch (e) { kbFeed.rows = []; kbFeed.err = e?.message || String(e); } kbFeed.loading = false; kbFeed.t = Date.now(); if (R.view === 'battles' && kbSt().page === 'feed') renderKampf(); })(); }
  function kbFeedHtml(st) { kbFeedLoad(); const miss = /rok_feed|relation|does not exist|schema cache/i.test(kbFeed.err || ''), mine = new Set([...kbMyIds()]), f = st.feedMine;
    const L = (kbFeed.rows || []).filter(r => !f || mine.has(String(r.governor_id)));
    const ago = (t) => { const m = Math.round((Date.now() - Date.parse(t)) / 6e4); return m < 60 ? m + ' min' : m < 1440 ? Math.round(m / 60) + ' h' : Math.round(m / 1440) + ' d'; };
    return `<section class="panel rounded-2xl p-5 mt-4"><div class="flex flex-wrap items-center gap-2 mb-1"><h2 class="font-display text-lg text-gold-300">📣 <span>Feed</span></h2>
      <div class="ml-auto flex gap-1 p-1 rounded-xl bg-ink-950 border border-ink-700 text-xs"><button type="button" data-kbfeedf="0" aria-pressed="${!f}" class="seg-btn rounded-lg px-2 py-0.5 font-semibold"><span>Alle</span></button><button type="button" data-kbfeedf="1" aria-pressed="${!!f}" class="seg-btn rounded-lg px-2 py-0.5 font-semibold"><span>Meine</span></button></div></div>
      <p class="text-xs text-slate-400 mb-3">Erreicht jemand eine neue Abzeichen-Stufe (Bronze bis Diamant), wird das hier automatisch gepostet. Pilot-Kämpfe zählen nicht.</p>
      ${miss ? '<div class="rounded-xl border border-amber-500/50 bg-amber-500/10 p-3 text-xs text-amber-100 mb-3">⚠️ <span>Die Tabelle rok_feed fehlt noch – SQL v30 aus dem Chat ausführen.</span></div>' : ''}
      ${L.length ? `<div class="space-y-2">${L.map(r => { const t = !r.tier ? KB_ONE : KB_TIER5[r.tier - 1] || KB_TIER5[0]; return `<div class="flex items-center gap-3 rounded-xl border bg-ink-950/60 p-2.5" style="border-color:${t[2]}66"><span class="grid place-items-center w-11 h-11 rounded-full text-2xl shrink-0" style="background:${t[2]}22;box-shadow:0 0 0 2px ${t[2]}">${esc(r.icon || '🏅')}</span>
        <div class="min-w-0 flex-1"><div class="text-sm"><b translate="no">${esc(r.name || r.governor_id)}</b> <span class="text-slate-400">hat</span> <b style="color:${t[2]}">${esc(r.title || r.badge)}</b> <span class="text-slate-400">erreicht</span></div><div class="text-[11px] text-slate-500">${t[0]} ${t[1]} · ${esc(r.descr || '')}: <b class="text-slate-300">${esc(r.value || '')}</b></div></div><span class="text-[11px] text-slate-500 shrink-0">${ago(r.created_at)}</span></div>`; }).join('')}</div>` : `<div class="text-sm text-slate-500 py-6 text-center">${kbFeed.loading ? 'Lädt …' : 'Noch keine Einträge.'}</div>`}</section>`; }
  // ===== 🎖️ Abzeichen (5 Stufen) – nur eigene Kämpfe, Pilot-Kämpfe zählen nicht =====
  var KB_ONE = ['✅', 'Erreicht', '#f5c542'];
  var KB_CMD = [['huo', '🏹', 'Huo-Jäger', 'Huo Qubing'], ['cm', '🛡️', 'Martel-Brecher', 'Charles Martel']];   // weitere Kommandanten: hier ergänzen
  var KB_TIER5 = [['🥉', 'Bronze', '#d08b4f'], ['🥈', 'Silber', '#cbd5e1'], ['🥇', 'Gold', '#f5c542'], ['🏅', 'Platin', '#a5b4fc'], ['💎', 'Diamant', '#67e8f9']];
  function kbBadges(R, MR, ALL) {   // R = PvP-Kämpfe zeitlich sortiert, MR = PvP inkl. Rally/Garnison (für Verdienst/Tote), ALL = alle eigenen Kämpfe inkl. PvE (für PvE-Ziele, Teleports)
    const T = R.map(r => Date.parse(r.battle_start)); let best10 = 0;
    for (let i = 0, j = 0, sum = 0; i < R.length; i++) { sum += +R[i].kill_points || 0; while (T[i] - T[j] > 10 * 6e4) { sum -= +R[j].kill_points || 0; j++; } if (sum > best10) best10 = sum; }
    const S = new Map(); R.forEach(r => { const k = String(r.parent_id || r.mail_id); S.set(k, (S.get(k) || 0) + (+r.kill_points || 0)); }); const bigS = Math.max(0, ...S.values());
    const dayKp = new Map(), dayAcc = new Map(); R.forEach((r, i) => { const d = (r.battle_start || '').slice(0, 10); dayKp.set(d, (dayKp.get(d) || 0) + (+r.kill_points || 0)); });
    MR.forEach(r => { const d = (r.battle_start || '').slice(0, 10); dayAcc.set(d, (dayAcc.get(d) || 0) + (+r.acclaim || 0)); });
    const SS = []; { let cur = null; R.forEach((r, i) => { const t = T[i]; if (!cur || t - cur.b > 45 * 6e4) { cur = { a: t, b: t, rows: [] }; SS.push(cur); } cur.b = t; cur.rows.push(r); }); }
    const bestTrade = Math.max(0, ...SS.map(x => anaSum(x.rows)).filter(w => w.kp >= 1e6).map(w => w.kpt === Infinity ? 99 : w.kpt || 0));
    const longSess = Math.max(0, ...SS.map(x => (x.b - x.a) / 36e5)), night = T.filter(t => new Date(t).getHours() < 5).length, big = R.filter(r => (+r.enemy_severe || 0) + (+r.enemy_dead || 0) >= 1e4).length;
    const deads = MR.reduce((a, r) => a + (+r.self_dead || 0), 0);
    // Battle Streaks (ein Bericht mit mehreren Gegnern = parent_id): Trade pro Streak
    const ST = new Map(); R.forEach(r => { const k = String(r.parent_id || r.mail_id), o = ST.get(k) || { kp: 0, ek: 0 }; o.kp += +r.kill_points || 0; o.ek += +r.enemy_kill_points || 0; ST.set(k, o); });
    let snip = 0, ouch = 0; ST.forEach(o => { if (o.kp >= 1e6 && o.kp >= 5 * Math.max(1, o.ek)) snip++; if (o.ek >= 1e6 && o.ek >= 5 * Math.max(1, o.kp)) ouch++; });
    const maxRep = Math.max(0, ...R.map(r => +r.kill_points || 0)), foes = new Set(R.map(r => String(r.enemy_player_id || r.enemy_name || '')).filter(Boolean)).size;
    let unb = 0; { let run = 0; R.forEach(r => { const kp = +r.kill_points || 0, ek = +r.enemy_kill_points || 0; if (kp < 5e5 && ek < 5e5) return; if (kp >= ek) { run++; unb = Math.max(unb, run); } else run = 0; }); }
    const L = [
      ['⚡', 'blitz', 'Blitzkrieg', 'KP in 10 Minuten', best10, [1e7, 2e7, 3e7, 4e7, 5e7], short, ['Blitzkrieg', 'Silberner Blitz', 'Goldener Blitz', 'Platin-Blitz', 'Diamant-Blitz']],
      ['🔁', 'trade', 'Trader', 'KP-Trade in einer Schlacht (ab 1 Mio. KP)', bestTrade, [2, 4, 6, 8, 10], v => v >= 99 ? '∞' : dec(v, 1) + ' : 1'],
      ['💥', 'flex', 'Flex-König', 'KP in einem Battle Streak / Rally', bigS, [1e7, 2.5e7, 5e7, 7.5e7, 1e8], short],
      ['📅', 'day', 'Tageskönig', 'KP an einem Tag', Math.max(0, ...dayKp.values()), [2e7, 5e7, 1e8, 1.5e8, 2e8], short],
      ['🎖️', 'acc', 'Ruhmesjäger', 'Verdienst an einem Tag', Math.max(0, ...dayAcc.values()), [1e5, 2.5e5, 5e5, 7.5e5, 1e6], short],
      ['💀', 'dead', 'Blutzoll', 'eigene Tote im Zeitraum', deads, [5e5, 1e6, 1.5e6, 2e6, 3e6], short],
      ['⏱️', 'mara', 'Marathon', 'längste Schlacht ohne 45 min Pause', longSess, [1, 2, 4, 6, 8], v => dec(v, 1) + ' h'],
      ['🦉', 'owl', 'Nachteule', 'Kämpfe zwischen 0 und 5 Uhr', night, [100, 500, 1000, 2500, 5000], fmt],
      ['🌙', 'nshift', 'Nachtschicht', 'eigene Kämpfe zwischen 3 und 5 Uhr', T.filter(t => { const h = new Date(t).getHours(); return h >= 3 && h < 5; }).length, [50, 100, 250, 500, 1000], fmt],
      ['🌅', 'early', 'Frühaufsteher', 'Kämpfe zwischen 7 und 9 Uhr', T.filter(t => { const h = new Date(t).getHours(); return h >= 7 && h < 9; }).length, [100, 500, 1000, 2500, 5000], fmt],
      ['🎯', 'sniper', 'Scharfschütze', 'Battle Streaks mit KP-Trade ab 5 : 1 (ab 1 Mio. KP)', snip, [10, 50, 100, 250, 500], fmt],
      ['🤕', 'ouch', 'Auf die Schnauze', 'Battle Streaks mit 1 : 5 oder schlechter (ab 1 Mio. Gegner-KP)', ouch, [5, 10, 25, 50, 100], fmt],
      ['🗡️', 'regi', 'Königsmörder', 'KP in einem einzigen Bericht', maxRep, [2e6, 5e6, 7e6, 1e7, 1.5e7], short],
      ['🔍', 'hunt', 'Kopfgeldjäger', 'verschiedene Gegner bekämpft', foes, [20, 30, 50, 100, 200], fmt],
      ['🧱', 'unb', 'Unbesiegt', 'Berichte am Stück mit Trade ab 1 : 1 (nur ab 500K KP oder Gegner-KP)', unb, [5, 10, 25, 50, 100], fmt],
      ['🌋', 'big', 'Großschlag', 'Kämpfe mit 10.000+ Gegner-Verlusten', big, [10, 50, 100, 250, 500], fmt]];
    if (ALL) {   // PvE-Ziele fürs KvK, Teleports, Einzel-Erfolge
      const A2 = ALL.filter(r => !kbPilotRow(r) && !kbIsAoo(r)).map(r => [Date.parse(r.battle_start || ''), r]).filter(x => x[0]).sort((a, b) => a[0] - b[0]), cat = (r) => r.is_pvp ? '' : kbCatOf(r.npc_btype, r.group_size);
      const barb = A2.filter(([, r]) => cat(r) === 'barb'), fort = A2.filter(([, r]) => cat(r) === 'fort').length, kar = A2.filter(([, r]) => cat(r) === 'ckaruak').length;
      let chain = 0; { const last = new Map(); barb.filter(([, r]) => !(+r.group_size > 1)).forEach(([t, r]) => { const k = kbMarchOf(r), c = last.get(k); if (c && t - c.t <= 5 * 6e4) { c.n++; c.t = t; } else last.set(k, { n: 1, t }); chain = Math.max(chain, last.get(k).n); }); }
      let tp = 0, far = 0, lc = null; A2.forEach(([, r]) => { if (r.city_x == null) return; const x = +r.city_x / 6, y = +r.city_y / 6; if (lc) { const d = Math.hypot(x - lc[0], y - lc[1]); if (d > 10) { tp++; far = Math.max(far, d); } } lc = [x, y]; });
      const cityHit = A2.some(([, r]) => r.is_pvp && !r.joined && r.city_x != null && r.pos_x != null && Math.hypot(+r.pos_x - +r.city_x, +r.pos_y - +r.city_y) <= 18 && !(+r.group_size > 1 && r.self_role === 'att'));
      L.push(['🌀', 'tp', 'Teleporter', 'Teleports (ab 10 Feldern)', tp, [5, 10, 15, 20, 30], fmt],
        ['🪓', 'barb', 'Barbarenjäger', 'Barbaren besiegt', barb.length, [500, 1000, 5000, 10000, 20000], fmt],
        ['⛓️', 'chain', 'Kettenmeister', 'längste Barbaren-Kette', chain, [3, 5, 7, 10, 15], v => v + '×'],
        ['🏯', 'fort', 'Fortbrecher', 'Forts zerstört', fort, [50, 100, 150, 200, 500], fmt],
        ['💎', 'kar', 'Karuak-Jäger', 'Kristall-Karuaks besiegt', kar, [10, 20, 50, 100, 200], fmt],
        ['🏰', 'city', 'Belagert', 'Einzel-Erfolg: deine Stadt wurde angegriffen', cityHit ? 1 : 0, [1], v => v ? '✔' : '–', null, true],
        ['🚀', 'far', 'Fernreise', 'Einzel-Erfolg: Teleport über 300 Felder', far, [300], v => fmt(Math.round(v)) + ' <span>Felder</span>', null, true]);
    }
    // ⚔️ Kommandanten-Bereich: Kämpfe gegen bestimmte Kommandanten (Haupt- oder Zweitkommandant)
    const vsH = (slug) => R.filter(r => hmIconId(r.enemy_hero1) === slug || hmIconId(r.enemy_hero2) === slug).length;
    KB_CMD.forEach(([slug, ic, n, hn]) => L.push([ic, 'cmd_' + slug, n, 'Kämpfe gegen ' + hn, vsH(slug), [50, 100, 250, 500, 1000], fmt, null, false, 'cmd']));
    const out = L.map(([ic, k, n, d, v, steps, f, names, one, cat]) => { const lv = steps.filter(x => v >= x).length; return { ic, k, n, d, v, steps, f, names, lv, one: !!one, cat: cat || (['tp', 'barb', 'chain', 'fort', 'kar', 'city', 'far'].includes(k) ? 'pve' : 'fight'), t: lv ? (one ? KB_ONE : KB_TIER5[lv - 1]) : null, title: lv ? (names ? names[lv - 1] : n) : n }; });
    // 🏆 Meta-Erfolge: zählen die anderen Abzeichen
    const got = out.filter(b => b.lv > 0).length, dia = out.filter(b => !b.one && b.lv >= 5).length;
    [['🏅', 'meta', 'Sammler', 'erreichte Abzeichen', got, [5, 10, 20, 30, 40]], ['💎', 'metad', 'Diamant-Sammler', 'Abzeichen auf Diamant', dia, [1, 3, 5, 10, 15]]].forEach(([ic, k, n, d, v, steps]) => { const lv = steps.filter(x => v >= x).length; out.push({ ic, k, n, d, v, steps, f: fmt, lv, one: false, cat: 'meta', t: lv ? KB_TIER5[lv - 1] : null, title: n }); });
    return out;
  }
  var kbBadgeMemo = new Map();
  function kbAccBadges(id) {   // Abzeichen eines Accounts aus den geladenen Kämpfen (ohne Pilot, ohne Ark of Osiris)
    const rows = kbCache.get(String(id)); if (!rows || !rows.length) return []; const sig = rows.length + '|' + (rows[0]?.battle_start || ''), m = kbBadgeMemo.get(String(id)); if (m && m.sig === sig) return m.v;
    const MR = rows.filter(r => kbIsPvp(r) && !kbIsAoo(r) && !kbPilotRow(r)), R = MR.filter(r => !(+r.group_size > 1)).sort((a, b) => Date.parse(a.battle_start) - Date.parse(b.battle_start));
    const v = kbBadges(R, MR, rows).filter(b => b.lv > 0); kbBadgeMemo.set(String(id), { sig, v }); return v;
  }
  function kbBadgeIcons(id, max) {   // kleine Abzeichen neben dem Namen – Maus drauf zeigt den Wert
    const B = kbAccBadges(id).filter(b => !b.one && b.cat !== 'meta').sort((a, b) => b.lv - a.lv).slice(0, max || 4); if (!B.length) return '';
    return `<span class="inline-flex items-center gap-0.5 ml-1">${B.map(b => { const t = b.t; return `<span class="inline-grid place-items-center w-5 h-5 rounded-full text-[11px] leading-none" style="background:${t[2]}26;box-shadow:0 0 0 1.5px ${t[2]}" title="${esc(b.title)} (${t[1]}) · ${esc(b.d)}: ${esc(b.f(b.v))}">${b.ic}</span>`; }).join('')}</span>`;
  }
  // ===== 🕹️ Pilot: Kämpfe, die ich für andere gesteuert habe – und die andere für mich gesteuert haben (Spalte pilot_gov kommt aus der App) =====
  var kbPilot = { key: '', mine: null, forMe: null, loading: false, err: '' };
  function kbPilotLoad(force) {
    const me = kbProfileId(), ids = [...kbMyIds()], key = me + '|' + ids.join(','); if (kbPilot.loading || (!force && kbPilot.key === key && kbPilot.mine)) return; kbPilot.loading = true;
    const cols = 'player_id,self_name,pilot_gov,pilot_name,battle_start,battle_end,is_pvp,kill_points,enemy_kill_points,enemy_severe,enemy_dead,self_severe,self_dead,acclaim,mail_id,opponent_id,npc_btype,group_size,server_id,map_role,pos_x,pos_y';
    (async () => { try { const db = RokAuth.db?.(); if (!db) throw new Error('offline');
        const all = async (mk) => { let out = []; for (let p = 0; p < 20; p++) { const r = await mk().range(p * 1000, p * 1000 + 999); if (r.error) throw r.error; out = out.concat(r.data || []); if ((r.data || []).length < 1000) break; } return out; };
        const mine = me ? await all(() => db.from('rok_battles').select(cols).eq('pilot_gov', +me).order('battle_start', { ascending: false })) : [];
        const forMe = ids.length ? await all(() => db.from('rok_battles').select(cols).in('player_id', ids).not('pilot_gov', 'is', null).order('battle_start', { ascending: false })) : [];
        kbPilot = { key, mine, forMe: forMe.filter(r => String(r.pilot_gov) !== me), loading: false, err: '' }; }
      catch (e) { kbPilot = { key, mine: [], forMe: [], loading: false, err: e?.message || String(e) }; }
      if (R.view === 'battles' && kbSt().page === 'pilot') renderKampf(); })();
  }
  function kbPilotHtml(st) {
    kbPilotLoad(); if (kbPilot.loading && !kbPilot.mine) return `<section class="panel rounded-2xl p-8 mt-4 text-center">${kbLoaderHtml ? kbLoaderHtml('Pilot-Daten') : 'Lädt …'}</section>`;
    const miss = /pilot_gov|pilot_name|column/i.test(kbPilot.err || '');
    const sess = (rows) => { const S = [], last = new Map(); rows.map(r => [Date.parse(r.battle_start), r]).sort((a, b) => a[0] - b[0]).forEach(([t, r]) => { const k = String(r.player_id) + '|' + (r.pilot_gov || ''), c = last.get(k); if (c && t - c.b <= 45 * 6e4) { c.b = t; c.rows.push(r); } else { const n = { k, a: t, b: t, rows: [r], r }; S.push(n); last.set(k, n); } }); return S.sort((a, b) => b.a - a.a); };
    const grp = (rows, keyF, nameF) => { const M = new Map(); rows.forEach(r => { const k = keyF(r), o = M.get(k) || { k, name: nameF(r), rows: [] }; o.rows.push(r); M.set(k, o); }); return [...M.values()].map(o => ({ ...o, w: anaSum(o.rows.filter(r => r.is_pvp)), pve: o.rows.filter(r => !r.is_pvp).length, acc: o.rows.reduce((a, r) => a + (+r.acclaim || 0), 0), first: o.rows.reduce((m, r) => Math.min(m, Date.parse(r.battle_start)), Infinity), last: o.rows.reduce((m, r) => Math.max(m, Date.parse(r.battle_start)), 0), ses: sess(o.rows).length })).sort((a, b) => b.last - a.last); };
    const th = 'py-1.5 pr-3 font-medium text-slate-400 whitespace-nowrap', td = 'py-2 pr-3 tabular-nums whitespace-nowrap';
    const tbl = (L, who) => L.length ? `<div class="overflow-x-auto"><table class="w-full text-sm"><thead><tr class="text-[11px]"><th class="${th} text-left">${who}</th><th class="${th} text-right">PvP</th><th class="${th} text-right">KP</th><th class="${th} text-right">KP-Trade</th><th class="${th} text-right">Verdienst</th><th class="${th} text-right">PvE</th><th class="${th} text-right">Sitzungen</th><th class="${th} text-right">Zeitraum</th></tr></thead><tbody>
      ${L.map(o => `<tr class="border-t border-ink-800/60"><td class="py-2 pr-3"><b class="text-slate-100" translate="no">${esc(o.name)}</b> <span class="text-[10px] text-slate-500">${esc(o.k)}</span></td><td class="${td} text-right">${fmt(o.w.n)}</td><td class="${td} text-right text-gold-200 font-semibold">${short(o.w.kp)}</td><td class="${td} text-right ${o.w.kpt >= 1 ? 'text-emerald-300' : 'text-red-300'}">${hmKptTxt(o.w.kpt)}</td><td class="${td} text-right text-sky-200">${o.acc ? short(o.acc) : '–'}</td><td class="${td} text-right">${fmt(o.pve)}</td><td class="${td} text-right">${fmt(o.ses)}</td><td class="${td} text-right text-[11px] text-slate-400">${hmWhen(o.first)} – ${hmWhen(o.last)}</td></tr>`).join('')}</tbody></table></div>` : '';
    const zoneOf = (rows) => { try { const h = hmCfg(st), m = hmMap(h), Z = new Map(); rows.forEach(r => { if (!r.is_pvp || r.pos_x == null || !hmIn(r.pos_x, r.pos_y, r.map_role)) return; const [u, v] = hmXY(+r.pos_x, +r.pos_y, h, m), z = hmZoneAt(u, v, m, false, Date.parse(r.battle_start)); if (z < 0) return; const n = hmZName(h, m, z); Z.set(n, (Z.get(n) || 0) + 1); }); return [...Z.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3); } catch { return []; } };
    const kvkOf = (r) => { const g = +r.server_id; return r.map_role === 'dungeon' ? '🏛️ Osiris' : g >= 10000 ? '🏁 C' + g : g ? '🏠 #' + g : ''; };
    const sesList = (rows, lab) => { const S = sess(rows).slice(0, 15); return S.length ? `<h3 class="text-sm font-semibold text-slate-200 mt-4 mb-1">🕒 <span>Sitzungen</span> <span class="text-[11px] text-slate-500 font-normal">– <span>antippen = Heatmap genau dieser Sitzung</span></span></h3><div class="space-y-1">${S.map(x => { const w = anaSum(x.rows.filter(r => r.is_pvp)), zs = zoneOf(x.rows), d0 = new Date(x.a), hh = (t) => new Date(t).toTimeString().slice(0, 5), acc = x.rows.reduce((a, r) => a + (+r.acclaim || 0), 0), pve = x.rows.filter(r => !r.is_pvp).length;
      return `<button type="button" data-kbpses="${esc(x.r.player_id)}|${new Date(x.a).toISOString().slice(0, 10)}|${hh(x.a)}|${hh(x.b + 6e4)}" class="w-full text-left flex flex-wrap items-center gap-x-3 gap-y-0.5 rounded-lg bg-ink-950/60 border border-ink-800 hover:border-fuchsia-400/60 px-2.5 py-1.5 text-xs"><span class="text-slate-300 tabular-nums font-semibold">📅 ${d0.toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit' })} ${hh(x.a)}–${hh(x.b)}</span><b translate="no">${esc(lab(x.r))}</b><span class="text-sky-300" translate="no">${kvkOf(x.r)}</span>${zs.map(([n, c]) => `<span class="rounded bg-ink-800 px-1.5 text-slate-300" translate="no">📍 ${esc(n)} <span class="text-slate-500">${c}</span></span>`).join('')}<span class="ml-auto flex gap-3"><span>⚔️ ${fmt(w.n)}${pve ? ` <span class="text-slate-500">+${pve} PvE</span>` : ''}</span><span class="text-gold-200">🏆 ${short(w.kp)}</span><span class="text-sky-200">🎖️ ${short(acc)}</span><span class="${w.kpt >= 1 ? 'text-emerald-300' : 'text-red-300'}">🔁 ${hmKptTxt(w.kpt)}</span></span></button>`; }).join('')}</div>` : ''; };
    const A = grp(kbPilot.mine || [], r => String(r.player_id), r => r.self_name || String(r.player_id)), B = grp(kbPilot.forMe || [], r => String(r.pilot_gov), r => r.pilot_name || String(r.pilot_gov));
    const tot = anaSum((kbPilot.mine || []).filter(r => r.is_pvp)), sel = st.pilotSel || '';
    const P = sel ? (sel[0] === 'a' ? A : B).find(o => o.k === sel.slice(2)) : null;
    const chipP = (k, o, ic) => `<button type="button" data-kbpilotsel="${k}" class="inline-flex items-center gap-1.5 rounded-xl border ${sel === k ? 'border-fuchsia-400 bg-fuchsia-500/15 text-fuchsia-100' : 'border-ink-600 bg-ink-950/60 text-slate-300 hover:border-fuchsia-400/60'} px-2.5 py-1 text-xs" translate="no">${ic} <b>${esc(o.name)}</b> <span class="text-gold-200 tabular-nums">${short(o.w.kp)}</span> <span class="text-slate-500 tabular-nums">· ${fmt(o.w.n)}</span></button>`;
    const pick = (A.length || B.length) ? `<div class="flex flex-wrap items-center gap-1.5 mb-4"><button type="button" data-kbpilotsel="" class="rounded-xl border ${!sel ? 'border-fuchsia-400 bg-fuchsia-500/15 text-fuchsia-100' : 'border-ink-600 text-slate-300'} px-2.5 py-1 text-xs font-semibold">👥 <span>Alle</span></button>${A.map(o => chipP('a:' + o.k, o, '🕹️')).join('')}${B.map(o => chipP('b:' + o.k, o, '🤝')).join('')}</div>` : '';
    const detail = P ? (() => { const pv = P.rows.filter(r => r.is_pvp), w = anaSum(pv), ft = kbFightTime(pv), dd = pv.reduce((a, r) => a + (+r.self_dead || 0), 0), sv = pv.reduce((a, r) => a + (+r.self_severe || 0), 0);
      const it = (i, l, v, c) => `<div class="rounded-xl border border-fuchsia-500/30 bg-fuchsia-500/5 p-3"><div class="text-[11px] text-slate-400">${i} <span>${l}</span></div><div class="text-xl font-bold tabular-nums ${c || 'text-slate-100'}">${v}</div></div>`;
      return `<div class="rounded-2xl border border-fuchsia-500/40 p-3 mb-4"><div class="font-semibold text-fuchsia-100 mb-2" translate="no">${sel[0] === 'a' ? '🕹️ <span>Du für</span>' : '🤝 <span>Für dich:</span>'} ${esc(P.name)}</div><div class="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2">
        ${it('⚔️', 'PvP', fmt(w.n))}${it('🏆', 'KP', short(w.kp), 'text-gold-200')}${it('🔁', 'KP-Trade', hmKptTxt(w.kpt), w.kpt >= 1 ? 'text-emerald-300' : 'text-red-300')}${it('🎖️', 'Verdienst', short(P.acc), 'text-sky-200')}
        ${it('⏱️', 'Kampfzeit', kbDurTxt(ft.ms), 'text-amber-200')}${it('💀', 'Tote', short(dd), 'text-red-300')}${it('🩸', 'Schwer verwundet', short(sv), 'text-orange-300')}${it('📅', 'Sitzungen', fmt(P.ses))}</div></div>`; })() : '';
    return `<section class="panel rounded-2xl p-5 mt-4"><div class="flex flex-wrap items-center gap-2 mb-1"><h2 class="font-display text-lg text-gold-300">🕹️ <span>Pilot</span></h2><button type="button" data-kbpilotre class="ml-auto px-2.5 py-1 rounded-lg border border-ink-600 hover:border-gold-500/60 text-xs">↻ <span>Neu laden</span></button></div>
      <p class="text-xs text-slate-400 mb-3">Kämpfe zählen immer beim gesteuerten Account. Hier siehst du extra, wen du gesteuert hast und wer dich gesteuert hat. Den Account, den du pilotierst, bindest du in der App als „Pilot“ – ab dann schickt die App mit, dass du gesteuert hast.</p>
      ${miss ? `<div class="rounded-xl border border-amber-500/50 bg-amber-500/10 p-3 text-xs text-amber-100 mb-3">⚠️ <span>Die Pilot-Spalten fehlen noch in Supabase – SQL v29 aus dem Chat ausführen.</span></div>` : kbPilot.err ? `<div class="text-xs text-red-300 mb-2">${esc(kbPilot.err)}</div>` : ''}
      ${!kbProfileId() ? '<div class="text-xs text-amber-200 mb-3">Trag im Profil deine Governor-ID ein – daran erkennt die Seite deine Pilot-Kämpfe.</div>' : ''}
      <div class="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4">${[['🕹️', 'Gesteuerte Accounts', fmt(A.length)], ['⚔️', 'PvP als Pilot', fmt(tot.n)], ['🏆', 'KP als Pilot', short(tot.kp)], ['🤝', 'Haben dich gesteuert', fmt(B.length)]].map(([i, l, v]) => `<div class="rounded-xl border border-ink-700 bg-ink-950/60 p-3"><div class="text-[11px] text-slate-400">${i} <span>${l}</span></div><div class="text-2xl font-bold tabular-nums text-slate-100">${v}</div></div>`).join('')}</div>
      ${pick}${detail}
      <h3 class="font-semibold text-slate-100 mb-1">🕹️ <span>Ich habe gesteuert</span></h3>${tbl(A, 'Account') || '<div class="text-xs text-slate-500 py-2">Noch keine gepilotierten Kämpfe.</div>'}${sesList(P && sel[0] === 'a' ? P.rows : (kbPilot.mine || []), r => r.self_name || r.player_id)}
      <h3 class="font-semibold text-slate-100 mt-6 mb-1">🤝 <span>Wurde für mich gesteuert</span></h3>${tbl(B, 'Pilot') || '<div class="text-xs text-slate-500 py-2">Niemand hat deine Accounts gesteuert.</div>'}${sesList(P && sel[0] === 'b' ? P.rows : (kbPilot.forMe || []), r => (r.pilot_name || r.pilot_gov) + ' → ' + (r.self_name || r.player_id))}</section>`;
  }
  // ===== 📚 KvK-History: wenn ein KvK vorbei ist, wird es mit seiner C-Nummer zusammengefasst gespeichert (Tabelle rok_kvk_history) =====
  var kbHist = { rows: null, loading: false, err: '', saving: false, msg: '' };
  function kbHistLoad(force) { if (kbHist.loading || (kbHist.rows && !force)) return; kbHist.loading = true;
    (async () => { try { const db = RokAuth.db?.(), uid = RokAuth.userId?.(); if (!db || !uid) throw new Error('Bitte einloggen.'); const r = await db.from('rok_kvk_history').select('*').eq('user_id', uid).order('date_from', { ascending: false }); if (r.error) throw r.error; kbHist.rows = r.data || []; kbHist.err = ''; }
      catch (e) { kbHist.rows = []; kbHist.err = e?.message || String(e); } kbHist.loading = false; if (R.view === 'battles' && kbSt().page === 'hist') { kbHistAuto(); renderKampf(); } })(); }
  function kbHistBuild(acc, k) {
    const a = Date.parse(k.from + 'T00:00:00'), b = Date.parse(k.to + 'T23:59:59'), sid = +String(k.c).replace(/\D/g, '');
    const rows = (kbCache.get(String(acc)) || []).filter(r => { const t = Date.parse(r.battle_start || ''); return t >= a && t <= b && (+r.server_id === sid || (r.is_pvp === false && +r.server_id >= 10000)); });
    const pvp = rows.filter(r => r.is_pvp), w = anaSum(pvp); if (pvp.length < 20) return null;
    const acc2 = rows.reduce((s, r) => s + (+r.acclaim || 0), 0), D = new Map(), KD = new Map(), EN = new Map(), HG = new Map();
    pvp.forEach(r => { const d = r.battle_start.slice(0, 10), o = D.get(d) || { d, n: 0, kp: 0 }; o.n++; o.kp += +r.kill_points || 0; D.set(d, o);
      const kd = kbKdNum(r.enemy_kingdom); if (kd) { const q = KD.get(kd) || { kd, n: 0, kp: 0 }; q.n++; q.kp += +r.kill_points || 0; KD.set(kd, q); }
      const en = String(r.enemy_player_id || r.enemy_name || ''); if (en) { const q = EN.get(en) || { name: r.enemy_name || en, kd, n: 0, kp: 0 }; q.n++; q.kp += +r.kill_points || 0; EN.set(en, q); }
      if (r.pos_x != null && r.pos_y != null) { const x = Math.floor(+r.pos_x / 6 / 10), y = Math.floor(+r.pos_y / 6 / 10), hk = x + ',' + y; HG.set(hk, (HG.get(hk) || 0) + 1); } });
    const pve = rows.filter(r => !r.is_pvp);
    const own = pvp.filter(r => !kbPilotRow(r)), BG = kbBadges(own.filter(r => !(+r.group_size > 1)).sort((x, y) => Date.parse(x.battle_start) - Date.parse(y.battle_start)), own, rows).filter(b => b.lv > 0).map(b => ({ ic: b.ic, t: b.title, tier: b.one ? 0 : b.lv, v: String(b.f(b.v)).replace(/<[^>]+>/g, ''), d: b.d })), ft = kbFightTime(pvp), sum = (k) => pvp.reduce((x, r) => x + (+r[k] || 0), 0), dl = [...D.values()].sort((x, y) => y.kp - x.kp)[0];
    return { acc: String(acc), name: (rows.find(r => r.self_name) || {}).self_name || String(acc), tot: { n: w.n, kp: w.kp, ekp: w.ekp, my: w.my, en: w.en, dead: w.dead, acclaim: acc2, pve: pve.length, barb: pve.filter(r => kbCatOf(r.npc_btype, r.group_size) === 'barb').length,
        sDead: sum('self_dead'), sSev: sum('self_severe'), eDead: sum('enemy_dead'), eSev: sum('enemy_severe'), ftMs: ft.ms, ftN: ft.n, daysOn: D.size, bestDay: dl ? [dl.d, dl.kp] : null, foes: EN.size, pilotN: pvp.length - own.length },
      days: [...D.values()].sort((x, y) => x.d.localeCompare(y.d)), kds: [...KD.values()].sort((x, y) => y.n - x.n).slice(0, 6), enemies: [...EN.values()].sort((x, y) => y.kp - x.kp).slice(0, 5), heat: [...HG.entries()].map(([k, n]) => [...k.split(',').map(Number), n]), badges: BG, v: 3 };
  }
  async function kbHistSave(list) { const db = RokAuth.db?.(), uid = RokAuth.userId?.(); if (!db || !uid || !list.length) return 0;
    const r = await db.from('rok_kvk_history').upsert(list.map(x => ({ user_id: uid, governor_id: +x.acc, c_code: x.c, name: x.n, date_from: x.from, date_to: x.to, data: x.data, updated_at: new Date().toISOString() })), { onConflict: 'user_id,governor_id,c_code' }); if (r.error) throw r.error; return list.length; }
  function kbHistTodo(onlyEnded) { const have = new Set((kbHist.rows || []).map(h => h.governor_id + '|' + h.c_code)), out = [];
    kbKvkPlan().filter(k => !onlyEnded || !k.live).forEach(k => [...kbMyIds()].forEach(acc => { if (onlyEnded && have.has(acc + '|' + k.c)) return; const data = kbHistBuild(acc, k); if (data) out.push({ acc, c: k.c, n: k.n, from: k.from, to: k.to, data }); })); return out; }
  function kbHistAuto() { if (kbHist.saving || kbHist.autoDone || !kbHist.rows || kbHist.err) return; kbHist.autoDone = true; /* einmal pro Besuch */ const todo = kbHistTodo(true); if (!todo.length) return; kbHist.saving = true;
    kbHistSave(todo).then(n => { kbHist.msg = n + ' KvK gespeichert'; kbHist.rows = null; }).catch(e => { kbHist.err = e?.message || String(e); }).finally(() => { kbHist.saving = false; kbHistLoad(true); }); }
  function kbHistHtml(st) {
    kbHistLoad(); const miss = /rok_kvk_history|relation|does not exist|schema cache/i.test(kbHist.err || '');
    const L = (kbHist.rows || []).filter(h => !st.acc || String(h.governor_id) === st.acc), open = st.histOpen || '';
    const card = (h) => { const d = h.data || {}, t = d.tot || {}, kpt = t.ekp ? t.kp / t.ekp : null, on = open === h.id;
      return `<div class="rounded-2xl border ${on ? 'border-gold-400' : 'border-ink-700'} bg-ink-950/60"><button type="button" data-kbhist="${esc(h.id)}" class="w-full text-left p-3 flex flex-wrap items-center gap-x-4 gap-y-1"><span class="font-display text-lg text-gold-200" translate="no">🏁 ${esc(h.name || h.c_code)}</span>${h.name && h.name !== h.c_code ? `<span class="text-xs text-slate-500">${esc(h.c_code)}</span>` : ''}<span class="text-xs text-slate-400">${esc(h.date_from)} – ${esc(h.date_to)}</span><b class="text-sm" translate="no">${esc(d.name || h.governor_id)}</b>
        <span class="ml-auto flex flex-wrap gap-3 text-xs"><span>⚔️ ${fmt(t.n)}</span><span class="text-gold-200">🏆 ${short(t.kp)}</span><span class="${kpt >= 1 ? 'text-emerald-300' : 'text-red-300'}">🔁 ${hmKptTxt(kpt)}</span><span class="text-sky-200">🎖️ ${short(t.acclaim || 0)}</span>${t.ftMs != null ? `<span class="text-amber-200">⏱️ ${kbDurTxt(t.ftMs)}</span>` : ''}</span></button>
        ${on ? kbHistDetail(h) : ''}</div>`; };
    return `<section class="panel rounded-2xl p-5 mt-4"><div class="flex flex-wrap items-center gap-2 mb-1"><h2 class="font-display text-lg text-gold-300">📚 <span>KvK-History</span></h2><button type="button" data-kbhistsave class="ml-auto px-2.5 py-1 rounded-lg border border-gold-500/60 bg-gold-500/10 text-gold-200 text-xs">💾 <span>Laufendes KvK jetzt sichern</span></button></div>
      <p class="text-xs text-slate-400 mb-3">Ist ein KvK vorbei (C-Nummer im Zeitplan, letzter Kampf älter als 3 Tage), wird es automatisch zusammengefasst gespeichert: Summen, Tage, Königreiche, Gegner und Heatmap-Raster. Das braucht nur ein paar KB – die einzelnen Kämpfe kann man später löschen.</p>
      ${miss ? `<div class="rounded-xl border border-amber-500/50 bg-amber-500/10 p-3 text-xs text-amber-100 mb-3">⚠️ <span>Die Tabelle rok_kvk_history fehlt noch – SQL v29 aus dem Chat ausführen.</span></div>` : kbHist.err ? `<div class="text-xs text-red-300 mb-2">${esc(kbHist.err)}</div>` : ''}${kbHist.msg ? `<div class="text-xs text-emerald-300 mb-2">✔ ${esc(kbHist.msg)}</div>` : ''}
      ${kbHist.loading && !kbHist.rows ? '<div class="text-xs text-slate-500">Lädt …</div>' : L.length ? `<div class="space-y-2">${L.map(card).join('')}</div>` : '<div class="text-sm text-slate-500 py-4 text-center">Noch kein KvK gespeichert.</div>'}</section>`;
  }
  function kbHistDetail(h) { const d = h.data || {}, t = d.tot || {}, days = d.days || [], mx = Math.max(1, ...days.map(x => x.kp)), hm = d.heat || [], hx = Math.max(1, ...hm.map(x => x[2])), kpt = t.ekp ? t.kp / t.ekp : null;
    const xs = hm.map(x => x[0]), ys = hm.map(x => x[1]), x0 = Math.min(...xs, 0), y0 = Math.min(...ys, 0), x1 = Math.max(...xs, 1), y1 = Math.max(...ys, 1), sz = Math.max(x1 - x0, y1 - y0) + 2;
    const hmSvg = hm.length ? `<svg viewBox="${x0 - 1} ${-(y0 + sz - 1)} ${sz} ${sz}" class="w-full aspect-square rounded-xl bg-ink-950 border border-ink-700">${hm.map(([x, y, n]) => `<rect x="${x}" y="${-y - 1}" width="1" height="1" rx=".2" fill="rgb(245,${Math.round(197 - n / hx * 160)},${Math.round(66 - n / hx * 40)})" opacity="${(.35 + .65 * n / hx).toFixed(2)}"/>`).join('')}</svg>` : '<div class="text-xs text-slate-500">–</div>';
    const it = (i, l, v, sub, c) => `<div class="rounded-xl border border-ink-700 bg-ink-950/60 px-3 py-2"><div class="text-[10px] text-slate-400">${i} <span>${l}</span></div><div class="text-lg font-bold tabular-nums ${c || 'text-slate-100'}">${v}</div>${sub ? `<div class="text-[10px] text-slate-500">${sub}</div>` : ''}</div>`;
    const nn = (v, f) => v == null ? '–' : (f || short)(v);
    return `<div class="border-t border-ink-800 p-3"><div class="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-3">
        ${it('🏆', 'Kill Points', short(t.kp), fmt(t.n) + ' <span>Kämpfe</span>', 'text-gold-200')}${it('🎖️', 'Verdienst', short(t.acclaim || 0), '', 'text-sky-200')}
        ${it('🔁', 'KP-Trade', hmKptTxt(kpt), short(t.ekp) + ' <span>Gegner-KP</span>', kpt >= 1 ? 'text-emerald-300' : 'text-red-300')}${it('⏱️', 'Kampfzeit', t.ftMs != null ? kbDurTxt(t.ftMs) : '–', t.ftN != null ? fmt(t.ftN) + ' <span>Schlachten</span> · ' + fmt(t.daysOn) + ' <span>Tage</span>' : '', 'text-amber-200')}
        ${it('☠️', 'Kills', nn(t.eDead != null ? t.eDead + t.eSev : null), t.eDead != null ? short(t.eDead) + ' <span>tot</span> · ' + short(t.eSev) + ' SV' : '', 'text-emerald-300')}${it('💀', 'Eigene Tote', nn(t.sDead), t.sSev != null ? short(t.sSev) + ' <span>schwer verwundet</span>' : '', 'text-red-300')}
        ${it('📅', 'Bester Tag', t.bestDay ? short(t.bestDay[1]) : '–', t.bestDay ? t.bestDay[0].slice(8, 10) + '.' + t.bestDay[0].slice(5, 7) + '.' : '')}${it('🎯', 'Gegner', nn(t.foes, fmt), '<span>PvE</span> ' + fmt(t.pve || 0) + (t.pilotN ? ' · 🕹️ ' + fmt(t.pilotN) + ' <span>gepilotet</span>' : ''))}</div>
      <div class="grid lg:grid-cols-[1fr_15rem] gap-4"><div><div class="text-xs text-slate-400 mb-1">📅 <span>KP pro Tag</span></div><div class="flex items-end gap-px h-20">${days.map(x => `<div class="flex-1 rounded-t bg-gold-400/70" style="height:${Math.max(2, x.kp / mx * 100)}%" title="${x.d}: ${short(x.kp)} KP · ${x.n} Kämpfe"></div>`).join('')}</div>
        <div class="grid sm:grid-cols-2 gap-4 mt-3"><div><div class="text-xs text-slate-400 mb-1">👑 <span>Königreiche</span></div>${(d.kds || []).slice(0, 6).map(k => `<div class="flex justify-between text-xs border-t border-ink-800/60 py-1"><span>#${k.kd}</span><span class="tabular-nums text-slate-400">${fmt(k.n)} · <span class="text-gold-200">${short(k.kp)}</span></span></div>`).join('')}</div>
        <div><div class="text-xs text-slate-400 mb-1">🎯 <span>Top-Gegner</span></div>${(d.enemies || []).slice(0, 5).map(e => `<div class="flex justify-between gap-2 text-xs border-t border-ink-800/60 py-1"><span class="truncate" translate="no">${esc(e.name)}</span><span class="tabular-nums text-gold-200 shrink-0">${short(e.kp)}</span></div>`).join('')}</div></div></div>
      <div><div class="text-xs text-slate-400 mb-1">🔥 <span>Wo du gekämpft hast</span></div>${hmSvg}</div></div>
      ${(d.badges || []).length ? `<div class="mt-4"><div class="text-xs text-slate-400 mb-1.5">🎖️ <span>In diesem KvK geschafft</span></div><div class="flex flex-wrap gap-1.5">${d.badges.map(b => { const t = !b.tier ? KB_ONE : KB_TIER5[b.tier - 1]; return `<span class="inline-flex items-center gap-1.5 rounded-xl border px-2 py-1 text-xs" style="border-color:${t[2]}88;background:${t[2]}14" title="${esc(b.d)}: ${esc(b.v)}"><span class="text-base">${b.ic}</span><b style="color:${t[2]}">${esc(b.t)}</b><span class="text-slate-400">${t[0]} ${esc(b.v)}</span></span>`; }).join('')}</div></div>` : (d.v || 1) < 3 ? '<div class="mt-3 text-[11px] text-slate-500">🎖️ Erfolge gibt es ab jetzt gespeicherten KvKs (mit „Laufendes KvK jetzt sichern“ neu speichern).</div>' : ''}</div>`; }
  // ===== 👑 Admin: Statistiken aller Spieler ansehen =====
  var kbIsAdm = false, kbAdmIds = new Set(), kbAdmList = null;
  try { Promise.resolve(window.RokAuth?.isAdmin?.()).then(v => { kbIsAdm = !!v; if (kbIsAdm && R.view === 'battles') renderKampf(); }).catch(() => {}); } catch {}
  function kbAdmLoad() { if (kbAdmList) return; kbAdmList = [];
    (async () => { try { const db = RokAuth.db?.(); const r = await db.from('leaderboard').select('username,governor_id').not('governor_id', 'is', null).limit(2000); kbAdmList = (r.data || []).map(x => ({ n: x.username || '', id: String(x.governor_id || '').replace(/\D/g, '') })).filter(x => x.id); } catch { kbAdmList = []; } if (R.view === 'battles') renderKampf(); })(); }
  function kbAdmHtml(st) { if (!kbIsAdm) return ''; if (st.admOpen) kbAdmLoad();
    return `<span class="relative inline-block"><button type="button" data-kbadm class="inline-flex items-center gap-1.5 rounded-xl border ${st.admOpen ? 'border-fuchsia-400 text-fuchsia-100' : 'border-fuchsia-500/50 text-fuchsia-200'} bg-fuchsia-500/10 px-3 py-1.5 text-sm font-semibold">👑 <span>Admin</span> ▾</button>
      ${st.admOpen ? `<div class="absolute z-40 left-1/2 -translate-x-1/2 mt-2 w-[min(92vw,560px)] rounded-2xl border border-fuchsia-500/50 bg-ink-900 shadow-2xl p-3"><div class="text-[11px] text-slate-400 mb-1.5">Statistiken jedes Spielers ansehen (Name oder ID) – nur für dich als Admin sichtbar.</div>
        <input data-kbadmq placeholder="🔍 Name oder ID …" class="w-full mb-2 bg-ink-950 border border-ink-600 rounded-lg px-2.5 py-1.5 text-xs text-slate-100 focus:outline-none focus:border-fuchsia-400">
        <div class="max-h-72 overflow-y-auto grid grid-cols-2 sm:grid-cols-3 gap-1.5 pr-1">${(kbAdmList || []).map(x => `<button type="button" data-kbadmpick="${esc(x.id)}" class="text-left rounded-lg border border-ink-700 bg-ink-950/60 hover:border-fuchsia-400 px-2 py-1 text-xs" translate="no"><div class="font-semibold truncate">${esc(x.n || x.id)}</div><div class="text-[10px] text-slate-500 tabular-nums">${esc(x.id)}</div></button>`).join('') || '<div class="text-xs text-slate-500">Lädt …</div>'}</div></div>` : ''}</span>`; }
  // ===== 📲 App-Download mit Erklär-Fenster =====
  function kbAppModal() { document.getElementById('kbAppDlg')?.remove();
    const REPO = 'https://github.com/marcopopp51200-coder/rok-scanner', TAG = /-git-/.test(location.hostname) ? 'app-test' : 'app-main', d = document.createElement('div'); d.id = 'kbAppDlg';
    d.className = 'fixed inset-0 z-[90] bg-black/70 backdrop-blur-sm grid place-items-center p-4';
    d.innerHTML = `<div class="panel rounded-2xl max-w-lg w-full p-5 border border-gold-500/50 max-h-[90vh] overflow-y-auto"><div class="flex items-start gap-3 mb-3"><span class="text-4xl">📲</span><div><h2 class="font-display text-xl text-gold-200">Wiz fan Club App</h2><div class="text-xs text-slate-400">Windows · kostenlos · verändert nichts am Spiel</div></div><button type="button" data-kbappx class="ml-auto text-slate-400 hover:text-white text-xl leading-none">✕</button></div>
      <ul class="space-y-2 text-sm text-slate-200 mb-4">
        <li>⚔️ <b>Kampfberichte automatisch hochladen</b> – die App liest deine Berichte aus dem Spielordner und schickt sie an die Website. Kein Abtippen, kein Screenshot.</li>
        <li>📊 <b>Live-Overlay über dem Spiel</b> – KP, Trade, Verluste und Kämpfe der Sitzung direkt im Spiel sehen.</li>
        <li>🕹️ <b>Pilot-Modus</b> – steuerst du einen fremden Account, bindest du ihn als „Pilot“. Die Kämpfe zählen beim Account, und im Reiter „Pilot“ siehst du, was du gesteuert hast.</li>
        <li>🔔 <b>Meldungen</b> – Buffs, Pass-Eroberungen und Meilensteine auf Wunsch auch in Discord.</li>
        <li>🔒 <b>Sicher</b> – die App ist an deinen Website-Account gebunden und lädt nur Kämpfe deiner eigenen oder freigegebenen IDs hoch.</li></ul>
      <div class="flex flex-wrap gap-2"><a href="${REPO}/releases/download/${TAG}/WizFanClubApp.exe" class="flex-1 text-center rounded-xl bg-gold-500 hover:bg-gold-400 text-ink-950 font-bold px-4 py-2.5">⬇️ <span>Jetzt herunterladen</span></a><a href="/uploader.html" class="flex-1 text-center rounded-xl border border-gold-500/60 text-gold-200 px-4 py-2.5 font-semibold">🔗 <span>Einrichten &amp; verbinden</span></a></div>
      <div class="text-[11px] text-slate-500 mt-3">Windows warnt beim ersten Start („Unbekannter Herausgeber“)? → „Weitere Informationen“ → „Trotzdem ausführen“.</div></div>`;
    d.onclick = (e) => { if (e.target === d || e.target.closest('[data-kbappx]')) d.remove(); }; document.body.appendChild(d); try { window.RokI18n?.apply?.(d); } catch {} }
  var KB_EQ = {"1":["Sacred Dominion","sacred_dominion.webp"],"2":["Hammer of the Sun and Moon","hammer_of_the_sun_and_moon.webp"],"3":["The Hydra's Blast","the_hydras_blast.webp"],"4":["Pride of the Khan","pride_of_the_khan.webp"],"5":["Helm of the Conqueror","helm_of_the_conqueror.webp"],"6":["Ancestral Mask of Night","ancestral_mask_of_night.webp"],"7":["Lance of the Hellish Wasteland","lance_of_the_hellish_wasteland.webp"],"8":["War Helm of the Hellish Wasteland","war_helm_of_the_hellish_wasteland.webp"],"9":["Heavy Armor of the Hellish Wasteland","heavy_armor_of_the_hellish_wasteland.webp"],"10":["Armband of the Hellish Wasteland","armband_of_the_hellish_wasteland.webp"],"11":["Tassets of the Hellish Wasteland","tassets_of_the_hellish_wasteland.webp"],"12":["Boots of the Hellish Wasteland","boots_of_the_hellish_wasteland.webp"],"13":["Shield of the Eternal Empire","shield_of_the_eternal_empire.webp"],"14":["Gold Helm of the Eternal Empire","gold_helm_of_the_eternal_empire.webp"],"15":["Plate of the Eternal Empire","plate_of_the_eternal_empire.webp"],"16":["Vambraces of the Eternal Empire","vambraces_of_the_eternal_empire.webp"],"17":["Greaves of the Eternal Empire","greaves_of_the_eternal_empire.webp"],"18":["Sturdy Boots of the Eternal Empire","sturdy_boots_of_the_eternal_empire.webp"],"19":["Dragon's Breath Bow","dragons_breath_bow.webp"],"20":["Dragon's Breath Helm","dragons_breath_helm.webp"],"21":["Dragon's Breath Plate","dragons_breath_plate.webp"],"22":["Dragon's Breath Vambraces","dragons_breath_vambraces.webp"],"23":["Dragon's Breath Tassets","dragons_breath_tassets.webp"],"24":["Dragon's Breath Boots","dragons_breath_boots.webp"],"25":["Shadow Legion's Retribution","shadow_legions_retribution.webp"],"26":["Hope Cloak","hope_cloak.webp"],"27":["The Milky Way","the_milky_way.webp"],"28":["Navar's Control","navars_control.webp"],"29":["Sacred Grips","sacred_grips.webp"],"30":["Ian's Choice","ians_choice.webp"],"31":["Tassets of the War God","tassets_of_the_war_god.webp"],"32":["Eternal Night","eternal_night.webp"],"33":["Ash of the Dawn","ash_of_the_dawn.webp"],"34":["Shio's Return","shios_return.webp"],"35":["Mountain Crushers","mountain_crushers.webp"],"36":["Commander's Boots","commanders_boots.webp"],"37":["Ring of Doom","ring_of_doom.webp"],"38":["Greatest Glory","greatest_glory.webp"],"39":["Pendant of Eternal Night","pendant_of_eternal_night.webp"],"40":["Horn of Fury","horn_of_fury.webp"],"41":["Concealed Dagger","concealed_dagger.webp"],"42":["Mora's Web","moras_web.webp"],"43":["Scolas' Lucky Coin","scolas_lucky_coin.webp"],"44":["Vengeance","vengeance.webp"],"51":["Revival Helm","revival_helm_purple.webp"],"52":["Revival Plate","revival_plate_purple.webp"],"53":["Revival Gauntlets","revival_gauntlets_purple.webp"],"55":["Scepter of the Forest Guardian","scepter_of_the_forest_guardian_purple.webp"],"56":["Mask of the Forest Guardian","mask_of_the_forest_guardian_purple.webp"],"57":["Robe of the Forest Guardian","robe_of_the_forest_guardian_purple.webp"],"58":["Claws of the Forest Guardian","claws_of_the_forest_guardian_purple.webp"],"59":["Sakura Fubuki","sakura_fubuki_purple.webp"],"60":["Golden Age","golden_age_purple.webp"],"61":["Heart of the Saint","heart_of_the_saint_purple.webp"],"62":["Abyssal Visage","abyssal_visage_purple.webp"],"63":["Witch's Lineage","witchs_lineage_purple.webp"],"64":["Dark Lord's Blessing","dark_lords_blessing_purple.webp"],"65":["Quinn's Soul","quinns_soul_purple.webp"],"66":["Iset's Sufferance","isets_sufferance_purple.webp"],"67":["Seth's Brutality","seths_brutality_purple.webp"],"68":["Karuak's Humility","karuaks_humility_purple.webp"],"69":["Fanatic's Tassets","fanatics_tassets_purple.webp"],"70":["Gladiator","gladiator_purple.webp"],"71":["Cloud Racers","cloud_racers_purple.webp"],"72":["Frost Treads","frost_treads_purple.webp"],"73":["Flame Treads","flame_treads_purple.webp"],"74":["The Bard's Pendant","the_bards_pendant_purple.webp"],"75":["Silent Trial","silent_trial_purple.webp"],"76":["Delane's Amulet","delanes_amulet_purple.webp"],"77":["Peter's Sickle","peters_sickle_purple.webp"],"78":["Crimson Ring","crimson_ring_purple.webp"],"79":["Harvester's Headscarf","harvesters_headscarf_blue.webp"],"80":["Harvester Robes","harvester_robes_blue.webp"],"81":["Harvester Breeches","harvester_breeches_blue.webp"],"82":["Harvester Boots","harvester_boots_blue.webp"],"97":["Call of the Loyal","call_of_the_loyal_blue.webp"],"98":["Lohar's Bone Necklace","lohars_bone_necklace_blue.webp"],"99":["Savage Totem","savage_totem_blue.webp"],"112":["Sharp Longsword","sharp_longsword_grey.webp"],"116":["Cloth Gloves","cloth_gloves_grey.webp"],"118":["Karuak's War Drums","karuaks_war_drums.webp"],"119":["Seth's Call","seths_call.webp"],"120":["Wind Scars","wind_scars_purple.webp"],"121":["Ancient Stratagems","ancient_stratagems_purple.webp"],"122":["Fierce Wolf's Helmet","fierce_wolfs_helmet.webp"],"123":["Vigilant Wolf's Leather Armor","vigilant_wolfs_leather_armor.webp"],"124":["Twilight Epiphany","twilight_epiphany.webp"],"125":["Wailing Wolf's Gauntlets","wailing_wolfs_gauntlets.webp"],"126":["Lone Wolf's Leather Tassets","lone_wolfs_leather_tassets.webp"],"128":["Knight's Battleworn Gauntlets","knights_battleworn_gauntlets_purple.webp"],"127":["Roaring Wolf's Claws","roaring_wolfs_claws.webp"],"129":["Knight's Triumphant Tassets","knights_triumphant_tassets_purple.webp"],"130":["Knight's Winter Sabatons","knights_winter_sabatons_purple.webp"],"131":["Knight's Steel Diadem","knights_steel_diadem_purple.webp"],"132":["Knight's Valorous Cloak","knights_valorous_cloak_purple.webp"],"133":["Knight's Oathsworn Bow","knights_oathsworn_bow_purple.webp"],"140":["Scepter of the Glorious Goddess","scepter_of_the_glorious_goddess.webp"],"141":["Diadem of the Glorious Goddess","diadem_of_the_glorious_goddess.webp"],"142":["Plate of the Glorious Goddess","plate_of_the_glorious_goddess.webp"],"143":["Gauntlets of the Glorious Goddess","gauntlets_of_the_glorious_goddess.webp"],"144":["Chausses of the Glorious Goddess","chausses_of_the_glorious_goddess.webp"],"145":["Greaves of the Glorious Goddess","greaves_of_the_glorious_goddess.webp"],"164":["Immolating Plume","immolating_plume.webp"],"166":["Hero's Hilt","heros_hilt.webp"],"167":["Saddle of a Thousand Blessings","saddle_of_a_thousand_blessings.webp"],"168":["Timeless Amber","timeless_amber.webp"]};
  var KB_AFX = {"1101":"Destructive","1201":"Straight to the Point","1301":"Invincible","1401":"Fearless","2101":"Hunter","2201":"Unstoppable","2301":"Balanced","2401":"Intrepid","3101":"Sharpshooter","3201":"Drilled","3301":"Merciless","3401":"Astute","4101":"Influential Leader","4201":"Loaded","4301":"Civilized","4401":"Fixed","5101":"Cocoon","5201":"Inviolable","5301":"Crowned","5401":"Rounded","6101":"Rich","6201":"Battlements","6301":"Moneyed","6401":"Transporter","7101":"Enmeshed","7201":"Logistical","7301":"Unassailed","7401":"Winged","101":"Warcry","201":"Brutal","301":"Spiked","401":"Infamy","102":"Fearless","202":"Rugged","302":"Duelist","402":"Secure","103":"Well Clad","203":"Armored","303":"Metallics","403":"Shielded","104":"Robust","204":"Fit","304":"Vitality","404":"Hardy","105":"Swift","205":"Fine Horse","305":"Galloping","405":"Haste","106":"Payback","206":"Annexer","306":"Cleanser","406":"Pacifier","107":"Onslaught","207":"Warhunger","307":"Striker","407":"Militant","108":"Retaliatory","208":"Alert","308":"Rebuff","408":"Resistant","109":"Enraged","209":"Devious","309":"Brawler","409":"Daring","110":"Valiant","210":"Fearsome","310":"Warflames","410":"Elite","111":"Iron Wall","211":"Evasive","311":"Eclipsed","411":"Evasive","112":"Bellicose","212":"Requital","312":"Brave","412":"Smite","113":"Pulverize","213":"Respite","313":"Strategic","413":"Enduring","114":"Breaker","214":"Guarded","314":"Desperado","414":"Artisan","115":"Furious","215":"Embattled","315":"Cohesive","415":"Rapacious","116":"Ward","216":"Vengeful","316":"Pursuer","416":"Guardians","117":"Phalanx","217":"Patronage","317":"Assertive","417":"Counterer","118":"Hurried","218":"Primed","318":"Wary","418":"Deflecter","119":"Tremors","219":"Uplifting","319":"Siegework","419":"Watchmen","120":"Calm","220":"Spirited","320":"Sentries","420":"Lineshot","121":"Loosed","221":"Bluster","321":"Ballistics","421":"Riftmaker","122":"Warcry","222":"Brutal","322":"Spiked","422":"Infamy","124":"Well Clad","224":"Armored","324":"Metallics","424":"Shielded","125":"Robust","225":"Fit","325":"Vitality","425":"Hardy","126":"Swift","226":"Fine Horse","326":"Galloping","426":"Haste","127":"Payback","227":"Annexer","327":"Cleanser","427":"Pacifier","128":"Onslaught","228":"Warhunger","328":"Striker","428":"Militant","129":"Retaliatory","229":"Alert","329":"Rebuff","429":"Resistant","130":"Enraged","230":"Devious","330":"Brawler","430":"Daring","131":"Valiant","231":"Fearsome","331":"Warflames","431":"Elite","132":"Iron Wall","232":"Evasive","332":"Eclipsed","432":"Evasive","133":"Bellicose","233":"Respite","333":"Strategic","433":"Guardians","134":"Breaker","234":"Guarded","334":"Cohesive","434":"Counterer","135":"Ward","235":"Primed","335":"Assertive","435":"Deflecter","136":"Loosed","236":"Spirited","336":"Ballistics","436":"Lineshot","137":"Enrichment","237":"Brisk","337":"Harvester","437":"Bountiful","5102":"Self-Defense","5202":"Aegis","5302":"Reinforced","5402":"Tenacious","8101":"Irreproachable","8201":"Cautious","8301":"Shield Bash","8401":"Rock Solid","9101":"Avenger","9201":"Guarding Light","9301":"Turn the Corner","9401":"Panacea","8102":"Ironclad","8202":"Strike & Parry","8302":"Unshakeable","8402":"Convalescing","9102":"Back In Action","9202":"Medic","9302":"Rise Up","9402":"Refreshing","1102":"Battle-Ready","1202":"Even-Keeled","1302":"Unswerving","1402":"Forceful","2102":"Crazed","2202":"Boiling Blood","2302":"Defiant","2402":"Focus Fire","3102":"Full Draw","3202":"Bloody Bolt","3302":"Tempered","3402":"Sharp Arrows","4102":"Drums of War","4202":"Nullify","4302":"Counter-Parry","4402":"Persevering","6102":"Gold Panner","6202":"Safeguard","6302":"Plentitude","6402":"Sturdy Back","7102":"Entangling","7202":"Arms Race","7302":"Sprinter","7402":"Strider","10101":"Hasty Retreat","10102":"Fall Back","10201":"Blast Shield","10202":"Spread Out","10301":"Full Force","10302":"Shock Troops","10401":"United Front","10402":"Mutual Defense","13101":"Thrasher","13102":"Pummeler","13201":"Butterfly Effect","13202":"Causative","13301":"Steelskin","13302":"Determined","13401":"Flurry","13402":"Relentless","14101":"Battle Ready","14102":"Vigilant","14201":"Fortified","14202":"Resolute","14301":"Chokepoint","14302":"Precautions","14401":"Steelheart","14402":"Ironsides","17101":"Toppler","17102":"Imploder","17201":"Demolisher","17202":"Raider","17301":"Airtight","17302":"Hardheaded","17401":"Thundering","17402":"Rattling","16101":"Vanquisher","16102":"Overwhelm","16201":"Self Heal","16202":"Self Tend","16301":"Brilliant","16302":"Astute","16401":"Mountain","16402":"Stone","19101":"Advantage Advanced","19102":"Fury","19201":"Indomitable","19202":"Soar","19301":"Maneuver at Ease","19302":"Ballista","19401":"Horseback Action","19402":"Divine Staff","20101":"Dominate","20102":"Bludgeon","20201":"Cleaver","20202":"Charge","20301":"Bulwark","20302":"Bolstered","20401":"Tidebreaker","20402":"Vigor","21101":"Rapid Advance","21102":"Driven","21201":"Bold Ambitions","21202":"Burst","21301":"Impervious","21302":"Steady","21401":"Raging Tide","21402":"Surge"};
  // ===== 🛡️ Gegner-Gear: nur bei Garnison (Pass/Heiligtum, Allianz-Flagge) und Rallys – nur der Hauptkommandant (Spalte enemy_gear, Uploader v29) =====
  var kbGearCols = true, kbSelfGear = true, kbGearIdx = [];
  var kbGear = { key: '', rows: null, loading: false, err: '' };
  function kbGearLoad(ids) { const key = ids.slice().sort().join(',') + '|' + (kbNeedFrom() || 'all'); if (!kbGearCols || kbGear.loading || kbGear.key === key) return; kbGear.loading = true; kbGear.key = key;
    (async () => { try { const db = RokAuth.db?.(); let q = db.from('rok_battles').select('player_id,self_name,self_hero1,battle_start,enemy_player_id,enemy_name,enemy_alliance,enemy_kingdom,enemy_hero1,enemy_hero2,enemy_gear,kill_points,group_size,pos_x,pos_y' + (kbSelfGear ? ',self_gear' : '')).not('enemy_gear', 'is', null);
        if (ids.length) q = q.in('player_id', ids); const nf = kbNeedFrom(); if (nf) q = q.gte('battle_start', nf);
        const r = await q.order('battle_start', { ascending: false }).limit(2000); if (r.error) throw r.error; kbGear.rows = r.data || []; kbGear.err = ''; }
      catch (e) { kbGear.rows = []; kbGear.err = e?.message || String(e); if (/self_gear/.test(kbGear.err)) { kbSelfGear = false; kbGear.key = ''; kbGear.loading = false; return kbGearLoad(ids); } if (/enemy_gear/.test(kbGear.err)) kbGearCols = false; }
      kbGear.loading = false; if (R.view === 'battles' && (kbSt().page || 'battles') === 'battles') renderKampf(); })(); }
  function kbGearCard(g, r) {
    const ROM = ['', 'I', 'II', 'III', 'IV', 'V'], TT = { 1: ['infantry.webp', 'Infanterie'], 2: ['archer (1).webp', 'Bogen'], 3: ['cavalry (1).webp', 'Kavallerie'] };
    const items = [...String(g.eq || '').matchAll(/(\d+):(\d+)_\d+:(\d+)/g)].map(m => { const id = +m[2] - 20000, v = +m[3], tt = Math.floor(v / 10), ic = v % 10, e = KB_EQ[id];
      return `<div class="text-center" title="${esc(e ? e[0] : '#' + id)}${TT[tt] ? ' · ' + TT[tt][1] : ''}"><div class="relative aspect-square rounded-md bg-ink-900 border border-ink-700 overflow-hidden">${e ? `<img src="/icons/gear/${encodeURIComponent(e[1])}" class="w-full h-full object-contain" loading="lazy" alt="">` : '<span class="text-[9px] text-slate-500">?</span>'}${TT[tt] ? `<img src="/icons/gear/${encodeURIComponent(TT[tt][0])}" class="absolute right-0 bottom-0 w-3 h-3" alt="">` : ''}</div><div class="text-[9px] font-extrabold text-amber-200 leading-tight h-3">${ic >= 1 && ic <= 5 ? ROM[ic] : ''}</div></div>`; }).join('');
    const ord = { 3: 0, 4: 1, 1: 2, 2: 3 }, ins = Object.values(g.wb || {}).sort((a, b) => (ord[String(a[0])[2]] ?? 9) - (ord[String(b[0])[2]] ?? 9)).flatMap(w => String(w[1] || '').split(';').filter(Boolean)).map(a => { const n = KB_AFX[+a] || a, c = a.length >= 5 ? (a.endsWith('01') ? 'text-orange-400' : 'text-sky-400') : 'text-stone-400'; return `<span class="${c}">${esc(n)}</span>`; }).join('');
    const pos = r.pos_x != null ? ` · ${Math.round(+r.pos_x / 6)}:${Math.round(+r.pos_y / 6)}` : '', where = (g.ct === 5 ? '🏯 Pass' : g.ct === 7 ? '🚩 Flagge' : g.r ? '⚔️ Rally' : '') + pos, gi = kbGearIdx.push(r) - 1;
    return `<div class="rounded-xl border border-ink-700 bg-ink-950/60 p-2 cursor-pointer hover:border-gold-500/60" data-kbgearcmp="${gi}" title="Klicken: dein Gear gegen seins"><div class="flex items-center gap-2 mb-1.5">${hmHeroImg(r.enemy_hero1, 'w-8 h-8 rounded-lg' + (g.aw ? ' ring-2 ring-gold-400' : ''))}<div class="min-w-0 flex-1"><div class="text-xs font-bold truncate" translate="no">${r.enemy_alliance ? `<span class="text-slate-500">[${esc(r.enemy_alliance)}]</span> ` : ''}${esc(r.enemy_name || '?')}</div>
      <div class="text-[10px] text-slate-400 truncate" translate="no">${esc(r.enemy_hero1 || '')} · Lv${g.lv || '?'} · ★${g.st || 0} · ${esc(g.sk || '')} · ${g.aw ? '<span class="text-gold-300">✦ Awk</span>' : '<span class="text-red-300">✗ Awk</span>'}</div></div><div class="text-right text-[10px] text-slate-500 shrink-0">${where}<br>${hmWhen(Date.parse(r.battle_start))}</div></div>
      <div class="grid grid-cols-8 gap-1">${items}</div><div class="flex flex-wrap gap-x-2 text-[11px] font-bold mt-1">${ins}</div></div>`;
  }
  // ⚔️ Gear-Vergleich: dein Hauptkommandant gegen den des Gegners (gleicher Kampf)
  var KB_SLOT = ['Waffe', 'Helm', 'Brust', 'Hände', 'Beine', 'Füße', 'Zubehör', 'Zubehör'];
  function kbGearParse(js) { let g = null; try { g = JSON.parse(js || 'null'); } catch {} if (!g) return null; const it = {}; [...String(g.eq || '').matchAll(/(\d+):(\d+)_\d+:(\d+)/g)].forEach(m => { it[+m[1]] = { id: +m[2] - 20000, ic: +m[3] % 10, tt: Math.floor(+m[3] / 10) }; });
    const bf = {}; Object.values(g.wb || {}).forEach(w => String(w[2] || '').split(';').forEach(x => { const [k, v] = x.split('_'); if (k) bf[k] = (bf[k] || 0) + (+v || 0); }));
    const ins = Object.values(g.wb || {}).flatMap(w => String(w[1] || '').split(';').filter(Boolean)); return { ...g, it, bf, ins }; }
  function kbBuffLab(k) { if (k === '10002') return 'Zusatzwert'; const a = { 3: 'Angriff', 4: 'Verteidigung', 5: 'Leben' }[k[0]], t = { 1: 'Infanterie', 2: 'Kavallerie', 3: 'Bogen', 4: 'Belagerung' }[k[k.length - 1]]; return a ? a + (t ? ' ' + t : '') : 'Wert ' + k; }
  function kbGearCompare(r) { document.getElementById('kbGearDlg')?.remove(); const A = kbGearParse(r.self_gear), B = kbGearParse(r.enemy_gear), ROM = ['', 'I', 'II', 'III', 'IV', 'V'], TT = { 1: 'infantry.webp', 2: 'archer (1).webp', 3: 'cavalry (1).webp' };
    const cell = (x) => { if (!x) return '<div class="h-12 grid place-items-center text-slate-600 text-xs">–</div>'; const e = KB_EQ[x.id]; return `<div class="flex items-center gap-1.5"><div class="relative w-11 h-11 rounded-md bg-ink-900 border border-ink-700 overflow-hidden shrink-0">${e ? `<img src="/icons/gear/${encodeURIComponent(e[1])}" class="w-full h-full object-contain">` : ''}${TT[x.tt] ? `<img src="/icons/gear/${encodeURIComponent(TT[x.tt])}" class="absolute right-0 bottom-0 w-3.5 h-3.5">` : ''}</div><div class="min-w-0"><div class="text-[11px] truncate">${esc(e ? e[0] : '#' + x.id)}</div><div class="text-[11px] font-bold text-amber-200">${x.ic ? 'Iconic ' + ROM[x.ic] : '<span class="text-slate-600 font-normal">kein Iconic</span>'}</div></div></div>`; };
    const head = (g, hero, nm) => g ? `<div class="flex items-center gap-2">${hmHeroImg(hero, 'w-10 h-10 rounded-lg' + (g.aw ? ' ring-2 ring-gold-400' : ''))}<div class="min-w-0"><div class="font-bold text-sm truncate" translate="no">${esc(nm || '?')}</div><div class="text-[11px] text-slate-400" translate="no">${esc(hero || '')} · Lv${g.lv || '?'} · ★${g.st || 0} · ${esc(g.sk || '')} · ${g.aw ? '✦ Awk' : '✗ Awk'}</div></div></div>` : '<div class="text-xs text-slate-500">Dein Gear fehlt in diesem Bericht (erst ab Uploader v30).</div>';
    const iconSum = (g) => g ? Object.values(g.it).reduce((a, x) => a + x.ic, 0) : 0, specN = (g) => g ? Object.values(g.it).filter(x => x.tt >= 1 && x.tt <= 3).length : 0;
    const keys = [...new Set([...Object.keys(A?.bf || {}), ...Object.keys(B?.bf || {})])].sort();
    const cmp = (a, b, f) => { const c = a > b ? 'text-emerald-300' : a < b ? 'text-red-300' : 'text-slate-300'; return `<td class="py-1 text-right tabular-nums font-semibold ${c}">${f(a)}</td>`; };
    const insH = (g) => (g?.ins || []).map(a => { const n = KB_AFX[+a] || a, c = a.length >= 5 ? (a.endsWith('01') ? 'text-orange-400' : 'text-sky-400') : 'text-stone-400'; return `<span class="${c}">${esc(n)}</span>`; }).join(' ');
    const d = document.createElement('div'); d.id = 'kbGearDlg'; d.className = 'fixed inset-0 z-[90] bg-black/70 backdrop-blur-sm grid place-items-center p-3';
    d.innerHTML = `<div class="panel rounded-2xl w-full max-w-3xl p-4 border border-gold-500/40 max-h-[92vh] overflow-y-auto"><div class="flex items-center gap-2 mb-3"><h2 class="font-display text-lg text-gold-200">⚔️ <span>Gear-Vergleich</span></h2><span class="text-xs text-slate-400">${hmWhen(Date.parse(r.battle_start))}${r.pos_x != null ? ' · ' + Math.round(+r.pos_x / 6) + ':' + Math.round(+r.pos_y / 6) : ''}</span><button type="button" data-x class="ml-auto text-xl text-slate-400 hover:text-white">✕</button></div>
      <div class="grid grid-cols-[1fr_auto_1fr] gap-x-3 gap-y-2 items-center"><div class="text-xs text-emerald-300 font-semibold">🙋 <span>Du</span></div><div></div><div class="text-xs text-red-300 font-semibold text-right">🎯 <span>Gegner</span></div>
        <div>${head(A, r.self_hero1, r.self_name)}</div><div class="text-slate-500 text-xs">vs</div><div>${head(B, r.enemy_hero1, r.enemy_name)}</div>
        ${[1, 2, 3, 4, 5, 6, 7, 8].map(i => `<div>${cell(A?.it[i])}</div><div class="text-[10px] text-slate-500 text-center w-14">${KB_SLOT[i - 1]}</div><div>${cell(B?.it[i])}</div>`).join('')}</div>
      <table class="w-full text-xs mt-4"><thead><tr class="text-slate-500"><th class="text-left font-medium py-1"><span>Wert</span></th><th class="text-right font-medium"><span>Du</span></th><th class="text-right font-medium"><span>Gegner</span></th></tr></thead><tbody>
        <tr class="border-t border-ink-800/60"><td class="py-1"><span>Iconic-Stufen gesamt</span></td>${cmp(iconSum(A), iconSum(B), fmt)}${cmp(iconSum(B), iconSum(A), fmt)}</tr>
        <tr class="border-t border-ink-800/60"><td class="py-1"><span>Teile mit Spezialisierung</span></td>${cmp(specN(A), specN(B), fmt)}${cmp(specN(B), specN(A), fmt)}</tr>
        ${keys.map(k => { const a = A?.bf[k] || 0, b = B?.bf[k] || 0, f = v => '+' + dec(v * 100, 1) + ' %'; return `<tr class="border-t border-ink-800/60"><td class="py-1">⚔️ <span>${kbBuffLab(k)}</span> <span class="text-slate-500">(Armaments)</span></td>${cmp(a, b, f)}${cmp(b, a, f)}</tr>`; }).join('')}</tbody></table>
      <div class="grid sm:grid-cols-2 gap-3 mt-3 text-xs font-bold"><div><div class="text-[10px] text-slate-500 font-normal mb-0.5"><span>Deine Inschriften</span></div>${insH(A) || '–'}</div><div><div class="text-[10px] text-slate-500 font-normal mb-0.5"><span>Inschriften Gegner</span></div>${insH(B) || '–'}</div></div>
      <div class="text-[10px] text-slate-500 mt-3">Grün = besser, rot = schlechter. Gear-Werte selbst stehen nicht im Kampfbericht – verglichen werden Teile, Iconic-Stufe, Spezialisierung und die Armament-Werte.</div></div>`;
    d.onclick = (e) => { if (e.target === d || e.target.closest('[data-x]')) d.remove(); }; document.body.appendChild(d); try { window.RokI18n?.apply?.(d); } catch {} }
  function kbGearHtml(st) {
    if (!kbGearCols) return ''; const ids = st.acc ? [st.acc] : [...kbMyIds()]; kbGearLoad(ids); if (!kbGear.rows || !kbGear.rows.length) return '';
    const P = new Map(); kbGear.rows.forEach(r => { let g; try { g = JSON.parse(r.enemy_gear); } catch { return; } if (!g || !g.h) return; const k = (r.enemy_player_id || r.enemy_name) + '|' + g.h; if (!P.has(k)) P.set(k, { g, r, n: 0 }); P.get(k).n++; });
    const q = (st.gearQ || '').toLowerCase(), L = [...P.values()].filter(x => !q || ((x.r.enemy_name || '') + ' ' + (x.r.enemy_alliance || '') + ' ' + (x.r.enemy_hero1 || '')).toLowerCase().includes(q));
    return `<section class="panel rounded-2xl p-4 mt-4"><details ${st.gearOpen ? 'open' : ''} data-kbgeardet><summary class="cursor-pointer flex flex-wrap items-center gap-2"><h2 class="font-display text-lg text-gold-300 inline">🛡️ <span>Gegner-Gear</span></h2><span class="text-[11px] text-slate-400">${fmt(P.size)} <span>Märsche</span> · <span>nur Garnisonen (Pässe, Flaggen) und Rallys · nur Hauptkommandant</span></span></summary>
      <input data-kbgearq value="${esc(st.gearQ || '')}" placeholder="🔍 Name, Allianz oder Kommandant …" class="mt-2 mb-2 w-full sm:w-72 bg-ink-950 border border-ink-600 rounded-lg px-2.5 py-1.5 text-xs text-slate-100 focus:outline-none focus:border-gold-500">
      <div class="text-[10px] text-slate-500 mb-2">Römische Zahl = Iconic-Stufe · kleines Symbol = Truppen-Spezialisierung · Inschriften: <span class="text-orange-400 font-bold">Spezial</span> <span class="text-sky-400 font-bold">Selten</span> <span class="text-stone-400 font-bold">Normal</span></div>
      <div class="grid sm:grid-cols-2 lg:grid-cols-3 gap-2">${(kbGearIdx = [], L.slice(0, 60).map(x => kbGearCard(x.g, x.r)).join(''))}</div></details></section>`;
  }
  // ===== 🪓 Barbaren & Ketten (Loot-Seite): Kette = gleicher Marsch, max. 5 min zwischen zwei Barbaren =====
  function kbBarbHtml(st) {
    const R0 = (kbRows || []).filter(r => !r.is_pvp && kbMine(r.player_id) && (!st.acc || String(r.player_id) === st.acc) && kxInRange(r.battle_start) && kbCatOf(r.npc_btype, r.group_size) === 'barb' && !(+r.group_size > 1))
      .map(r => ({ r, t: Date.parse(r.battle_start), mk: kbMarchOf(r) })).filter(x => x.t).sort((a, b) => a.t - b.t);
    if (!R0.length) return '';
    const C = [], last = new Map(); R0.forEach(x => { const c = last.get(x.mk); if (c && x.t - c.end <= 5 * 6e4) { c.n++; c.end = x.t; c.lv.push(+x.r.npc_level || 0); } else { const n = { mk: x.mk, n: 1, a: x.t, end: x.t, lv: [+x.r.npc_level || 0] }; C.push(n); last.set(x.mk, n); } });
    const avg = R0.length / C.length, best = C.reduce((a, c) => c.n > a.n ? c : a, C[0]), multi = C.filter(c => c.n > 1);
    const days = new Set(R0.map(x => new Date(x.t).toDateString())).size, lvC = new Map(); R0.forEach(x => { const l = +x.r.npc_level || 0; if (l) lvC.set(l, (lvC.get(l) || 0) + 1); });
    const lv = [...lvC.entries()].sort((a, b) => b[0] - a[0]).slice(0, 12), lvMax = Math.max(1, ...lv.map(x => x[1]));
    const M = new Map(); C.forEach(c => { const o = M.get(c.mk) || { mk: c.mk, n: 0, ch: 0, best: 0 }; o.n += c.n; o.ch++; o.best = Math.max(o.best, c.n); M.set(c.mk, o); });
    const ML = [...M.values()].sort((a, b) => b.n - a.n).slice(0, 10);
    const D = new Map(); C.forEach(c => { const d = new Date(c.a), k = `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.`, o = D.get(k) || { n: 0, ch: 0, t: c.a }; o.n += c.n; o.ch++; D.set(k, o); });
    const DL = [...D.entries()].sort((a, b) => a[1].t - b[1].t).slice(-21), dMax = Math.max(1, ...DL.map(x => x[1].n));
    const tile = (i, l, v, sub, c) => `<div class="rounded-xl border border-ink-700 bg-ink-950/60 p-3"><div class="text-[11px] text-slate-400">${i} <span>${l}</span></div><div class="text-2xl font-bold tabular-nums ${c || 'text-slate-100'}">${v}</div>${sub ? `<div class="text-[11px] text-slate-500">${sub}</div>` : ''}</div>`;
    return `<section class="panel rounded-2xl p-5 mt-4"><h2 class="font-display text-lg text-gold-300 mb-1">🪓 <span>Barbaren &amp; Ketten</span></h2>
      <div class="text-[11px] text-slate-500 mb-3">Zeitraum und Account oben · Kette = derselbe Marsch, höchstens 5 min zwischen zwei Barbaren (nur eigene Märsche, keine Forts)</div>
      <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 mb-4">
        ${tile('🪓', 'Alle Barbaren', fmt(R0.length), fmt(days) + ' <span>Tage</span> · Ø ' + fmt(Math.round(R0.length / Math.max(1, days))) + ' <span>pro Tag</span>', 'text-gold-200')}
        ${tile('⛓️', 'Ø Kettenlänge', dec(avg, 1), '<span>Barbaren pro Kette</span>', 'text-sky-200')}
        ${tile('🔗', 'Ketten', fmt(C.length), fmt(multi.length) + ' <span>mit 2+</span>')}
        ${tile('🏆', 'Längste Kette', fmt(best.n), hmWhen(best.a))}
        ${tile('📈', 'Ø nur echte Ketten', multi.length ? dec(multi.reduce((a, c) => a + c.n, 0) / multi.length, 1) : '–', '<span>ohne Einzelkämpfe</span>')}
        ${tile('🎚️', 'Höchstes Level', lv.length ? fmt(lv[0][0]) : '–', lv.length ? fmt(lv[0][1]) + '×' : '')}</div>
      <div class="grid lg:grid-cols-2 gap-4">
        <div><h3 class="text-sm font-semibold text-slate-200 mb-1">🛡️ <span>Pro Marsch</span></h3><table class="w-full text-xs"><thead><tr class="text-slate-500"><th class="text-left py-1"><span>Marsch</span></th><th class="text-right"><span>Barbaren</span></th><th class="text-right"><span>Ketten</span></th><th class="text-right">Ø</th><th class="text-right"><span>Längste</span></th></tr></thead><tbody>
          ${ML.map(o => `<tr class="border-t border-ink-800/60"><td class="py-1 pr-2"><div class="flex items-center gap-1.5"><span class="flex gap-0.5 shrink-0 [&_img]:w-5 [&_img]:h-5">${hmHeroes(o.mk)}</span><span class="truncate" translate="no">${esc(o.mk)}</span></div></td><td class="text-right tabular-nums">${fmt(o.n)}</td><td class="text-right tabular-nums">${fmt(o.ch)}</td><td class="text-right tabular-nums text-sky-200 font-semibold">${dec(o.n / o.ch, 1)}</td><td class="text-right tabular-nums">${fmt(o.best)}</td></tr>`).join('')}</tbody></table></div>
        <div><h3 class="text-sm font-semibold text-slate-200 mb-1">📅 <span>Pro Tag</span> <span class="text-[11px] text-slate-500 font-normal">– Barbaren · Ø Kette</span></h3>
          <div class="flex items-end gap-1 h-32">${DL.map(([k, o]) => `<div class="flex-1 flex flex-col items-center justify-end h-full" title="${k}: ${o.n} Barbaren · ${o.ch} Ketten · Ø ${dec(o.n / o.ch, 1)}"><span class="text-[9px] text-sky-300 tabular-nums">${dec(o.n / o.ch, 1)}</span><div class="w-full rounded-t bg-amber-400/70" style="height:${Math.max(3, o.n / dMax * 100)}%"></div></div>`).join('')}</div>
          <div class="flex gap-1 mt-0.5">${DL.map(([k]) => `<span class="flex-1 text-center text-[9px] text-slate-600">${k.slice(0, 3)}</span>`).join('')}</div>
          ${lv.length ? `<h3 class="text-sm font-semibold text-slate-200 mt-4 mb-1">🎚️ <span>Nach Level</span></h3><div class="space-y-1">${lv.map(([l, n]) => `<div class="flex items-center gap-2 text-xs"><span class="w-10 text-slate-400">Lv ${l}</span><div class="flex-1 h-2.5 rounded bg-ink-800"><div class="h-2.5 rounded bg-amber-400/70" style="width:${n / lvMax * 100}%"></div></div><span class="w-12 text-right tabular-nums">${fmt(n)}</span></div>`).join('')}</div>` : ''}</div></div></section>`;
  }
  // ===== 🚩 Gebiet & Flaggen: aus den Allianz-Mails (Territory Report, Crusader Flag Planning/Under Attack) =====
  var kbFlags = { key: '', ev: null, loading: false, err: '' };
  function kbFlagsLoad(pid, since) {
    const key = pid + '|' + since; if (kbFlags.loading || (kbFlags.key === key && kbFlags.ev && Date.now() - kbFlags.t < 120e3)) return; kbFlags.loading = true;
    (async () => { try { const db = RokAuth.db?.(); if (!db) throw new Error('offline');
        const q = await db.from('rok_mails').select('mail_id,player_id,sent_at,mail_type,content').eq('player_id', pid).in('mail_type', ['AllianceBuilding', 'Alliance']).gte('sent_at', since).order('sent_at', { ascending: true }).limit(8000);
        if (q.error) throw q.error;
        const ev = [], seen = new Set();
        (q.data || []).forEach(r => { const c = r.content || {}, k = c.kvs || {}, ti = String(c.title || ''), su = String(c.subTitle || ''), pos = k.pos; if (!pos || pos.X == null) return;
          if (!/Territory Report|Crusader Flag Under Attack|Crusader Flag Planning/.test(ti)) return;
          const kind = /Under Attack/.test(ti) ? 'attack' : /Completed/.test(su) ? 'built' : /Destroyed/.test(su) ? 'lost' : /Demolished/.test(su) ? 'demol' : /Started Construction/.test(su) ? 'start' : /Planned$/.test(su) ? 'plan' : /Canceled/.test(su) ? 'cancel' : /Can't Be Built/.test(su) ? 'fail' : null; if (!kind) return;
          const bt = /Fortress/.test(su) ? 'fort' : /Mother Lode/.test(su) ? 'lode' : 'flag', t = Date.parse(r.sent_at), x = +pos.X, y = +pos.Y, id = kind + '|' + Math.round(x / 6) + '|' + Math.round(y / 6) + '|' + Math.round(t / 6e4); if (seen.has(id)) return; seen.add(id);
          const cost = (+k.cost_Fund || 0) + (+k.cost_food || 0) + (+k.cost_wood || 0) + (+k.cost_stone || 0) + (+k.cost_coin || 0);
          ev.push({ kind, bt, t, x, y, who: k.creator_name || k.oper_name || '', atk: k.atker_num ? Array.from({ length: +k.atker_num }, (_, i) => (k['atker_abbr_' + i] ? '[' + k['atker_abbr_' + i] + '] ' : '') + (k['atker_name_' + i] || '')).filter(Boolean) : [], cost, fund: +k.cost_Fund || 0 }); });
        kbFlags = { key, ev, t: Date.now(), loading: false, err: '' }; }
      catch (e) { kbFlags = { key, ev: kbFlags.ev || [], t: Date.now(), loading: false, err: e?.message || String(e) }; }
      if (R.view === 'battles' && kbSt().page === 'heat') renderKampf(); })();
  }
  function hmFlagModel(h) {   // Gebäude mit Lebenszeit [a, b): gebaut → zerstört/abgerissen
    const ev = kbFlags.ev || [], B = new Map(), L = [];
    ev.forEach(e => { const k = e.bt + '|' + Math.round(e.x / 6) + '|' + Math.round(e.y / 6);
      if (e.kind === 'built') { const o = { k, bt: e.bt, x: e.x, y: e.y, a: e.t, b: Infinity, who: e.who, end: '' }; B.set(k, o); L.push(o); }
      else if (e.kind === 'lost' || e.kind === 'demol') {   // Position in der Zerstört-Mail weicht ein paar Felder ab → nächste stehende Flagge (max. 6 Felder)
        let best = null, bd = 6 * 6; L.forEach(o => { if (o.b !== Infinity || o.bt !== e.bt || o.a > e.t) return; const d = Math.hypot(o.x - e.x, o.y - e.y); if (d <= bd) { bd = d; best = o; } });
        if (best) { best.b = e.t; best.end = e.kind; } } });
    const r = Math.max(1, +h.flR || 6), u = hmUnit(h, 'x');
    const half = (o) => (o.bt === 'fort' ? r * 1.5 : r) * u;
    const activeAt = (t) => L.filter(o => o.a <= t && t < o.b && o.bt !== 'lode');
    const inOwn = (x, y, t) => activeAt(t).some(o => Math.abs(x - o.x) <= half(o) && Math.abs(y - o.y) <= half(o));
    return { L, ev, activeAt, inOwn, half };
  }
  function hmFlagsHtml(st, h, S) {
    if (hmSpect()) return '';
    const acc = hmAcc(h), start = hmStart(h), since = start ? new Date(start + 'T00:00').toISOString() : new Date(Date.now() - 50 * 864e5).toISOString();
    if (acc && (h.flags || h.flOpen)) kbFlagsLoad(acc, since);
    const FM = hmFlagModel(h), [a0, b0] = [S.t0 || 0, S.t1 || Date.now()], inR = (t) => t >= a0 - 6e4 && t <= b0 + 6e4;
    const ev = FM.ev.filter(e => inR(e.t)), now = S.cur ?? Math.min(Date.now(), b0), act = FM.activeAt(now);
    const cnt = (k, bt) => ev.filter(e => e.kind === k && (!bt || e.bt === bt)).length;
    const fund = ev.filter(e => e.kind === 'built').reduce((x, e) => x + e.fund, 0), res = ev.filter(e => e.kind === 'built').reduce((x, e) => x + e.cost, 0);
    const mine = (S.all || []).filter(p => p.mine && p.k === 'pvp' && p.r.pos_x != null), own = [], out = [];
    if (FM.L.length) mine.forEach(p => (FM.inOwn(+p.r.pos_x, +p.r.pos_y, p.t) ? own : out).push(p));
    const so = hmSum(own), sx = hmSum(out), kc = (t) => t >= 1 ? 'text-emerald-300' : 'text-red-300';
    const top = (arr) => { const c = new Map(); arr.forEach(n => n && c.set(n, (c.get(n) || 0) + 1)); return [...c.entries()].sort((x, y) => y[1] - x[1]).slice(0, 6); };
    const builders = top(ev.filter(e => e.kind === 'built').map(e => e.who)), attackers = top(ev.filter(e => e.kind === 'attack').flatMap(e => e.atk));
    const tile = (i, l, v, c) => `<div class="rounded-lg border border-ink-700 p-2"><div class="text-[10px] text-slate-400">${i} <span>${l}</span></div><div class="text-lg font-bold tabular-nums ${c || 'text-slate-100'}">${v}</div></div>`;
    const cmp = (l, w, c) => `<div class="rounded-lg border ${c} p-2"><div class="text-xs font-semibold text-slate-200">${l}</div><div class="text-[11px] text-slate-400">${fmt(w.n)} <span>Kämpfe</span> · 🏆 ${short(w.kp)}</div><div class="text-sm"><span class="${kc(w.kpt)}">🔁 ${w.n ? hmKptTxt(w.kpt) : '–'}</span> · <span class="${kc(w.trade)}">⚖️ ${w.n ? hmTradeTxt(w.trade) : '–'}</span></div></div>`;
    const KN = { built: ['🚩', 'gebaut', 'text-emerald-300'], lost: ['💥', 'zerstört', 'text-red-300'], demol: ['🪓', 'abgerissen', 'text-slate-400'], attack: ['⚠️', 'angegriffen', 'text-amber-300'], plan: ['📝', 'geplant', 'text-sky-300'], start: ['🔨', 'Bau gestartet', 'text-sky-200'], cancel: ['✕', 'Plan abgebrochen', 'text-slate-500'], fail: ['⛔', 'nicht baubar', 'text-slate-500'] };
    const BN = { flag: 'Flagge', fort: 'Festung', lode: 'Mutterader' };
    const body = !h.flOpen ? '' : !kbFlags.ev ? '<div class="text-xs text-slate-500 py-2">Lädt …</div>' : kbFlags.err ? `<div class="text-xs text-red-300 py-2">${esc(kbFlags.err)}</div>` : !FM.ev.length ? '<div class="text-xs text-slate-500 py-2">Keine Gebäude-Mails für diesen Account seit KvK-Start.</div>' : `
      <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 mb-3">${tile('🚩', 'Stehen (geschätzt)', fmt(act.length), 'text-sky-200')}${tile('✅', 'Gebaut', fmt(cnt('built')), 'text-emerald-300')}${tile('💥', 'Zerstört', fmt(cnt('lost')), 'text-red-300')}${tile('🪓', 'Abgerissen', fmt(cnt('demol')))}${tile('⚠️', 'Angriffe', fmt(cnt('attack')), 'text-amber-300')}${tile('💰', 'Kosten', short(res), 'text-gold-200')}</div>
      <div class="text-xs font-semibold text-slate-200 mb-1">⚔️ <span>Kämpfe im eigenen Gebiet</span> <span class="text-[10px] text-slate-500 font-normal">– geschätzt: Kampf liegt im Bereich einer Flagge, die zu dem Zeitpunkt stand</span></div>
      <div class="grid sm:grid-cols-2 gap-2 mb-3">${cmp('🏠 <span>Eigenes Gebiet</span>', so, 'border-sky-500/50 bg-sky-500/5')}${cmp('🌍 <span>Außerhalb</span>', sx, 'border-ink-700')}</div>
      <label class="flex items-center gap-2 text-[11px] text-slate-400 mb-3"><span>Gebiet pro Flagge</span> <input type="range" min="2" max="12" value="${+h.flR || 6}" data-hmflr class="accent-sky-400 w-28"> <b class="text-slate-200">±${+h.flR || 6} <span>Felder</span></b> <span class="text-slate-500">(Festung ×1,5 – an einer Flagge im Spiel abgleichen)</span></label>
      <div class="grid md:grid-cols-2 gap-3 mb-3"><div><div class="text-xs font-semibold text-slate-200 mb-1">👷 <span>Meiste Flaggen gebaut</span></div>${builders.map(([n, c]) => `<div class="flex justify-between text-xs border-t border-ink-800/60 py-1"><span translate="no">${esc(n)}</span><b class="tabular-nums">${c}</b></div>`).join('') || '<div class="text-xs text-slate-500">–</div>'}</div>
        <div><div class="text-xs font-semibold text-slate-200 mb-1">🗡️ <span>Wer greift eure Flaggen an</span></div>${attackers.map(([n, c]) => `<div class="flex justify-between text-xs border-t border-ink-800/60 py-1"><span class="text-red-200" translate="no">${esc(n)}</span><b class="tabular-nums">${c}×</b></div>`).join('') || '<div class="text-xs text-slate-500">–</div>'}</div></div>
      <div class="text-xs font-semibold text-slate-200 mb-1">📜 <span>Ereignisse</span> <span class="text-[10px] text-slate-500 font-normal">${fmt(ev.length)}</span></div>
      <div class="max-h-72 overflow-y-auto"><table class="w-full text-xs"><tbody>${ev.slice().reverse().slice(0, 200).map(e => { const k = KN[e.kind]; return `<tr class="border-t border-ink-800/60"><td class="py-1 pr-2 whitespace-nowrap text-slate-400">${hmWhen(e.t)}</td><td class="pr-2 whitespace-nowrap ${k[2]}">${k[0]} <span>${k[1]}</span></td><td class="pr-2 text-slate-300"><span>${BN[e.bt]}</span></td><td class="pr-2 tabular-nums text-slate-400">X ${Math.round(e.x / 6)} · Y ${Math.round(e.y / 6)}</td><td class="text-slate-300 truncate max-w-[14rem]" translate="no">${esc(e.atk.length ? e.atk.join(', ') : e.who)}</td></tr>`; }).join('')}</tbody></table></div>`;
    return `<details data-hmflags ${h.flOpen ? 'open' : ''} class="mt-3 rounded-xl border border-sky-500/50 bg-sky-500/5"><summary class="cursor-pointer select-none px-3 py-2 text-sm font-semibold text-sky-200">🚩 <span>Gebiet &amp; Flaggen</span> ${kbFlags.ev && FM.L.length ? `<span class="rounded-full bg-sky-500/25 border border-sky-400/60 px-2 text-xs tabular-nums">${act.length}</span>` : ''} <span class="text-[11px] text-slate-500 font-normal">– aus den Allianz-Mails: gebaut, zerstört, angegriffen</span></summary><div class="px-3 pb-3">${body}</div></details>`;
  }
  // ===== 🔥 Gegner-Märsche auf dem Feld: aus den Kampfberichten der letzten Minuten (du + alle aus deinem KvK, die den Uploader nutzen) =====
  var kbField = { key: '', rows: null, t: 0, loading: false, err: '' };
  var KB_FW = [[15, '15 min'], [60, '1 h'], [180, '3 h'], [1440, '24 h'], [10080, '1 Woche'], [20160, '2 Wochen'], [40320, '4 Wochen']];
  function kbFieldLoad(ids, force, win) {
    win = +win || 60; const key = ids.slice().sort().join(','), need = Math.max(65, win + 5); if (kbField.loading || (!force && kbField.key === key && (kbField.win || 0) >= need && Date.now() - kbField.t < (win > 180 ? 5 * 6e4 : 55e3))) return;
    kbField.loading = true;
    (async () => { try { const db = RokAuth.db?.(); if (!db) throw new Error('offline'); const since = new Date(Date.now() - need * 6e4).toISOString();
        const q0 = () => { let q = db.from('rok_battles').select('player_id,self_name,mail_id,opponent_id,enemy_player_id,enemy_name,enemy_alliance,enemy_kingdom,enemy_hero1,enemy_hero2,enemy_formation,battle_start,pos_x,pos_y,kill_points,enemy_severe,enemy_dead,is_pvp').gte('battle_start', since).eq('is_pvp', true).gt('enemy_player_id', 0);
          if (ids.length) q = q.in('player_id', ids); return q.order('battle_start', { ascending: false }).order('mail_id').order('opponent_id'); };
        let all = []; for (let p = 0; p < 40; p += 4) { const R4 = await Promise.all([0, 1, 2, 3].map(i => q0().range((p + i) * 1000, (p + i) * 1000 + 999))); let end = false; for (const r of R4) { if (r.error) throw r.error; all = all.concat(r.data || []); if ((r.data || []).length < 1000) end = true; } if (end) break; }
        kbField = { key, win: need, rows: all, t: Date.now(), loading: false, err: '' }; }
      catch (e) { kbField = { key, win: 0, rows: kbField.rows || [], t: Date.now(), loading: false, err: e?.message || String(e) }; }
      if (R.view === 'battles' && kbSt().page === 'heat') renderKampf(); })();
  }
  function hmFieldHtml(st, h, m) {
    const win = KB_FW.some(x => x[0] === +h.fw) ? +h.fw : 60, winL = KB_FW.find(x => x[0] === win)[1], acc = hmAcc(h), code = hmKvkCode(h), ids = new Set();   // nur IDs mit derselben C-Nummer wie der gewählte Account
    if (acc) ids.add(String(acc));
    let kvkN = 0; if (code) { const i = hmWInfo[code]; if (!i) hmLoadWInfo(code); else if (!i.loading && i.ids) { i.ids.forEach(x => ids.add(String(x))); kvkN = i.ids.size; } }
    if (h.fieldOpen !== false && ids.size) kbFieldLoad([...ids], false, win);
    const since = Date.now() - win * 6e4, rows = (kbField.rows || []).filter(r => r.is_pvp && +r.enemy_player_id > 0 && Date.parse(r.battle_start) >= since && ids.has(String(r.player_id)));
    const M = new Map(), P = new Set(), rep = new Set();
    rows.forEach(r => { const k = r.enemy_player_id + '|' + (r.enemy_hero1 || '') + '|' + (r.enemy_hero2 || ''), t = Date.parse(r.battle_start);
      const o = M.get(k) || { pid: r.enemy_player_id, name: r.enemy_name, ally: r.enemy_alliance, kd: kbKdNum(r.enemy_kingdom), pair: anaEnemyPair(r), tt: kbTT(r, 'enemy'), t: 0, n: 0, by: new Set(), x: null, y: null };
      o.n++; o.by.add(String(r.player_id)); if (t > o.t) { o.t = t; o.x = r.pos_x; o.y = r.pos_y; } M.set(k, o); P.add(String(r.enemy_player_id)); rep.add(String(r.player_id)); });
    const L = [...M.values()].sort((a, b) => b.t - a.t), zoneOf = (o) => { if (o.x == null || o.y == null) return ''; const [u, v] = hmXY(o.x, o.y, h, m); const z = hmZoneAt(u, v, m, false, o.t); return z >= 0 ? hmBaseName(hmZName(h, m, z)) : ''; };
    const cnt = (f) => { const c = new Map(); L.forEach(o => { const k = f(o); if (k) c.set(k, (c.get(k) || 0) + 1); }); return [...c.entries()].sort((a, b) => b[1] - a[1]); };
    const perP = cnt(o => o.pid), multi = perP.filter(x => x[1] >= 2).length, pM = new Map(perP), avgM = P.size ? L.length / P.size : 0;
    const chip = (t, n) => `<span class="inline-flex items-center gap-1 rounded-lg border border-ink-600 bg-ink-900 px-2 py-0.5 text-xs text-slate-200">${t} <b class="tabular-nums">${n}</b></span>`;
    const ago = (t) => { const mi = Math.max(0, Math.round((Date.now() - t) / 6e4)); return mi < 1 ? '<span>gerade</span>' : mi < 120 ? `<span>vor</span> ${mi} min` : mi < 2880 ? `<span>vor</span> ${Math.round(mi / 60)} h` : hmWhen(t); };
    const tierOf = anaTierOf();
    const body = !kbField.rows ? '<div class="text-xs text-slate-500 py-2">Lädt …</div>' : kbField.err ? `<div class="text-xs text-red-300 py-2">${esc(kbField.err)}</div>` : !L.length ? `<div class="text-xs text-slate-500 py-2"><span>Im Zeitfenster</span> ${winL} <span>keine Kämpfe gegen Spieler.</span></div>` : `
      <div class="flex flex-wrap items-end gap-4 mb-2"><div><div class="text-4xl font-bold text-red-300 tabular-nums leading-none">${fmt(L.length)}</div><div class="text-[11px] text-slate-400">Gegner-Märsche</div></div>
        <div><div class="text-2xl font-bold text-slate-100 tabular-nums leading-none">${fmt(P.size)}</div><div class="text-[11px] text-slate-400">Spieler${multi ? ` · ${multi} <span>mit 2+ Märschen</span>` : ''}</div></div>
        <div><div class="text-2xl font-bold text-sky-200 tabular-nums leading-none">${dec(avgM, 1)}</div><div class="text-[11px] text-slate-400"><span>Ø Märsche pro Spieler</span></div></div>
        <div class="text-[11px] text-slate-500 pb-0.5">👀 <span>gesehen von</span> <b class="text-slate-300">${fmt(rep.size)}</b> <span>eigenen Leuten</span>${code ? ` · KvK <span translate="no">${esc(code)}</span>: ${fmt(kvkN)} IDs` : ' · <span class="text-amber-300">C-Nummer setzen, damit alle aus deinem KvK mitzählen</span>'}</div></div>
      <div class="flex flex-wrap gap-1.5 mb-2">${cnt(o => o.tt).map(([t, n]) => chip(KB_TT[t][0] + ' <span>' + KB_TT[t][1] + '</span>', n)).join('')}${cnt(o => o.kd ? '#' + o.kd : '').slice(0, 6).map(([k, n]) => chip('👑 ' + k, n)).join('')}${cnt(zoneOf).slice(0, 6).map(([k, n]) => chip('📍 ' + esc(k), n)).join('')}</div>
      <div class="max-h-80 overflow-y-auto pr-1"><table class="w-full text-xs"><thead><tr class="text-slate-500"><th class="text-left py-1">Spieler</th><th class="text-left"><span>Kommandanten</span></th><th class="text-left"><span>Ort</span></th><th class="text-right"><span>Kämpfe</span></th><th class="text-right"><span>zuletzt</span></th></tr></thead><tbody>
      ${L.slice(0, 200).map(o => `<tr class="border-t border-ink-800/60"><td class="py-1 pr-2"><div class="text-slate-100 truncate max-w-[11rem]" translate="no">${o.ally ? `<span class="text-slate-500">[${esc(o.ally)}]</span> ` : ''}${esc(o.name || o.pid)}${(pM.get(o.pid) || 0) > 1 ? ` <span class="text-[10px] text-sky-300" title="Märsche dieses Spielers im Zeitfenster">×${pM.get(o.pid)}</span>` : ''}</div><div class="text-[10px] text-slate-500">${o.kd ? '#' + o.kd : ''} ${anaTierChip(tierOf({ enemy_player_id: o.pid }))}</div></td>
        <td class="pr-2"><div class="flex items-center gap-1"><span class="flex gap-0.5">${hmHeroes(o.pair)}</span>${kbTTChip(o.tt)}</div></td><td class="pr-2 text-slate-300 whitespace-nowrap">${esc(zoneOf(o))}</td><td class="pr-2 text-right tabular-nums">${fmt(o.n)}${o.by.size > 1 ? ` <span class="text-[10px] text-sky-300" title="von mehreren eigenen Leuten gesehen">👀${o.by.size}</span>` : ''}</td><td class="text-right whitespace-nowrap text-slate-400">${ago(o.t)}</td></tr>`).join('')}</tbody></table></div>`;
    return `<details data-hmfield ${h.fieldOpen !== false ? 'open' : ''} class="mt-3 rounded-xl border border-red-500/50 bg-red-500/5"><summary class="cursor-pointer select-none px-3 py-2 text-sm font-semibold text-red-200 flex items-center gap-2">🔥 <span>Gegner-Märsche auf dem Feld</span>${L.length ? ` <span class="rounded-full bg-red-500/25 border border-red-400/60 px-2 text-xs tabular-nums">${L.length}</span>` : ''}
        <span class="ml-auto flex gap-0.5 p-0.5 rounded-lg bg-ink-950 border border-ink-700" onclick="event.stopPropagation()">${KB_FW.map(([v, l]) => `<button type="button" data-hmfw="${v}" aria-pressed="${win === v}" class="seg-btn rounded-md px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap">${l}</button>`).join('')}</span>
        <button type="button" data-hmfrel onclick="event.stopPropagation()" class="text-xs text-slate-400 hover:text-gold-300" title="Neu laden">↻</button></summary>
      <div class="px-3 pb-3"><div class="text-[10px] text-slate-500 mb-2">Gezählt aus den Kampfberichten: jeder Gegner mit eigenem Kommandanten-Paar = 1 Marsch. Je mehr Leute aus deinem KvK den Uploader nutzen, desto genauer. Mit „🔴 Live“ aktualisiert es sich jede Minute.</div>${body}</div></details>`;
  }
  // Main oder Farm? KP pro schwer verletzter/toter Einheit: T4 = 10, T5 = 20 (gemessen über alle Kämpfe gegen den Spieler)
  var KB_TIER = { main: ['🐋', 'Main', 'wahrscheinlich Main-Account'], mix: ['❔', 'Unklar', 'nicht eindeutig'], farm: ['🐟', 'Farm', 'wahrscheinlich Farm / Filler'] };
  var anaTierCache = { src: null, f: null };
  // Main oder Farm? Punkte aus mehreren Hinweisen (über alle Kämpfe gegen den Spieler):
  //  Name (Farm, Filler, TP …) · Truppen-Stufe (KP pro Einheit: T4 = 10, T5 = 20) · Skill-Level der Kommandanten · alte Kommandanten · Marschgröße
  var KB_FARM_RX = /farm|f[i1]ll|\btp\b|tele|bank|feeder|reinf|garri|storage|\brss\b|lager|\balt\b|^alt|\bacc\s?\d|^\d{5,}$/i;
  var KB_OLD_HERO = new Set(['richard', 'sun', 'sunepic', 'mina', 'cc', 'cid', 'hermann', 'hermannepic', 'kuso', 'scipioepic', 'eulji', 'boudica', 'boudicaepic', 'pelagius', 'fred', 'caesar', 'joanepic', 'baibars', 'osman', 'mulan', 'lohar', 'const', 'beliepic', 'tomy', 'centurion', 'markswoman', 'citykeeper', 'dragonlancer', 'ysg']);   // Charles Martel & Co. gelten wieder als Standard
  function anaSkillSum(x) { const a = String(x || '').split('/')[0].replace(/\D/g, '').slice(0, 4); return a.length === 4 ? [...a].reduce((s, c) => s + +c, 0) : null; }
  function anaTierOf() {
    if (anaTierCache.src === kbRows && anaTierCache.f) return anaTierCache.f;
    const P = new Map(); (kbRows || []).forEach(r => { if (!kbIsPvp(r)) return; const k = String(r.enemy_player_id || r.enemy_name || ''); if (!k) return;
      const o = P.get(k) || { kp: 0, n: 0, name: r.enemy_name || '', sk: null, sk2: null, h: new Map(), troops: 0, rows: 0 }; o.rows++;
      const n = (+r.enemy_severe || 0) + (+r.enemy_dead || 0), kp = +r.kill_points || 0; if (n >= 20 && kp) { o.kp += kp; o.n += n; }
      const ss = anaSkillSum(r.enemy_skills); if (ss != null) o.sk = Math.max(o.sk ?? 0, ss); const s2 = String(r.enemy_skills || '').split('/')[1]; if (s2) { const v = anaSkillSum(s2); if (v != null) o.sk2 = Math.max(o.sk2 ?? 0, v); }
      const hid = hmIconId(r.enemy_hero1); if (hid) o.h.set(hid, (o.h.get(hid) || 0) + 1); o.troops = Math.max(o.troops, +r.enemy_troops_start || 0); P.set(k, o); });
    const T = new Map(); P.forEach((o, k) => { let sc = 0; const why = [];
      if (KB_FARM_RX.test(o.name)) { sc += 3; why.push('Name'); }
      const v = o.n >= 100 ? o.kp / o.n : null; if (v != null) { if (v <= 12.5) { sc += 2; why.push('T4-Truppen'); } else if (v >= 17) { sc -= 1; why.push('T5-Truppen'); } }
      if (o.sk != null) { if (o.sk <= 12) { sc += 2; why.push('Skills ' + o.sk + '/20'); } else if (o.sk >= 16) { sc -= 1; why.push('Skills ' + o.sk + '/20'); } if (o.sk2 != null && o.sk2 <= 6) { sc += 1; why.push('2. Kommandant kaum geskillt'); } }
      const hs = [...o.h.entries()], tot = hs.reduce((a, x) => a + x[1], 0), old = hs.filter(([h]) => KB_OLD_HERO.has(h)).reduce((a, x) => a + x[1], 0);
      if (tot >= 2 && old / tot >= .75) { sc += 2; why.push('alte Kommandanten'); } else if (tot && old / tot >= .4) { sc += 1; why.push('teils alte Kommandanten'); }
      if (o.troops && o.troops < 250000) { sc += 1; why.push('kleiner Marsch'); }
      const known = v != null || o.sk != null || why.length; if (!known) return;
      T.set(k, { t: sc >= 3 ? 'farm' : sc <= 0 ? 'main' : 'mix', v: v ?? 0, sc, why }); });
    const f = (r) => T.get(String(r.enemy_player_id || r.enemy_name || '')) || null;
    anaTierCache = { src: kbRows, f }; return f;
  }
  function anaTierChip(x) { if (!x) return ''; const t = KB_TIER[x.t]; return `<span class="inline-flex items-center gap-0.5 rounded border border-ink-600 px-1 text-[10px] text-slate-300" title="${esc(t[2])} · ${esc(x.why.join(' · ') || '–')}${x.v ? ' · ' + dec(x.v, 1) + ' KP pro Einheit' : ''}">${t[0]} <span>${t[1]}</span></span>`; }
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
    const tabs = [['nem', '🎯', 'Gegner'], ['ally', '👑', 'Königreiche'], ['time', '🕒', 'Aktive Zeiten'], ['match', '⚔️', 'Matchups'], ['troop', '🪖', 'Truppen'], ['perf', '🏆', 'Erfolge'], ['farm', '🪓', 'Farm']];
    let body = '';
    if (!rows.length && tab !== 'farm') body = '<div class="text-sm text-slate-500 py-6 text-center">Keine PvP-Kämpfe im Zeitraum.</div>';
    else if (tab === 'nem') {   // Nemesis, leichte Ziele, Finger weg
      const M = new Map(); rows.forEach(r => { const k = String(r.enemy_player_id || r.enemy_name); const o = M.get(k) || { name: r.enemy_name, ally: r.enemy_alliance, kd: anaKdOf()(r), tier: tierOf(r), rows: [] }; o.rows.push(r); M.set(k, o); });
      const mn = +st.anaMin || 5, L = [...M.values()].map(o => ({ ...o, w: anaSum(o.rows) })).filter(o => o.name && o.w.n >= mn);
      const minSel = `<div class="flex flex-wrap items-center gap-1.5 mb-3 text-xs"><span class="text-slate-400">📏 <span>Gegner erst ab</span></span><div class="flex gap-1 p-1 rounded-xl bg-ink-950 border border-ink-700">${[1, 3, 5, 10, 20, 50].map(v => `<button type="button" data-anamin="${v}" aria-pressed="${v === mn}" class="seg-btn rounded-lg px-2 py-0.5 font-semibold">${v}</button>`).join('')}</div><span class="text-slate-400"><span>Kämpfen</span> · ${fmt(L.length)} <span>Gegner</span> · <span>weniger Kämpfe sagen wenig aus</span></span></div>`;
      const tbl = (title, sub, list, col) => `<div class="rounded-xl border ${col} bg-ink-950/60 p-3"><div class="font-semibold text-slate-100">${title}</div><div class="text-[11px] text-slate-500 mb-2">${sub}</div>
        <table class="w-full text-xs"><thead><tr><th class="${th} text-left">Gegner</th><th class="${th} text-right">Kämpfe</th><th class="${th} text-right">🏆 KP</th><th class="${th} text-right">🗡️ Gegner-KP</th><th class="${th} text-right">🔁 KP-Trade</th></tr></thead><tbody>
        ${list.slice(0, 10).map(o => `<tr class="border-t border-ink-800/60"><td class="py-1.5 pr-3"><span class="text-red-200" translate="no">${o.ally ? '[' + esc(o.ally) + '] ' : ''}${esc(o.name)}</span>${o.kd ? ` <span class="text-[10px] text-slate-500">${anaKd(o.kd)}</span>` : ''} ${anaTierChip(o.tier)}</td><td class="${td} text-right">${fmt(o.w.n)}</td><td class="${td} text-right text-gold-200">${short(o.w.kp)}</td><td class="${td} text-right text-red-200">${short(o.w.ekp)}</td><td class="${td} text-right ${kptC(o.w.kpt)}">${hmKptTxt(o.w.kpt)}</td></tr>`).join('') || '<tr><td class="py-2 text-slate-500" colspan="5">–</td></tr>'}</tbody></table></div>`;
      const min = () => true;
      body = minSel + `<div class="grid lg:grid-cols-3 gap-3">
        ${tbl('😈 Nemesis', 'Wer dir die meisten KP abgenommen hat', [...L].sort((a, b) => b.w.ekp - a.w.ekp), 'border-red-500/40')}
        ${tbl('🍗 Leichte Ziele', 'Bester KP-Trade', L.filter(min).sort((a, b) => (b.w.kpt === Infinity ? 1e9 : b.w.kpt || 0) - (a.w.kpt === Infinity ? 1e9 : a.w.kpt || 0)), 'border-emerald-500/40')}
        ${tbl('⛔ Finger weg', 'Schlechtester KP-Trade', L.filter(min).sort((a, b) => (a.w.kpt ?? 0) - (b.w.kpt ?? 0)), 'border-amber-500/40')}</div>`;
    } else if (tab === 'ally' || tab === 'time') {   // Königreiche (ohne unbekannte) · Aktive Zeiten gegenüber den Königreichen
      const kdOf = anaKdOf(), M = new Map(); rows.forEach(r => { const k = kdOf(r); if (!k) return; const o = M.get(k) || { kd: k, rows: [], pl: new Set(), pt: new Map() }; o.rows.push(r); const pk = r.enemy_player_id || r.enemy_name; o.pl.add(pk); o.pt.set(pk, tierOf(r)?.t || 'unk'); M.set(k, o); });
      const cf = +st.anaCampF || 0, L0 = [...M.values()].map(o => ({ ...o, w: anaSum(o.rows), camp: anaCampOf(o.kd), mains: [...o.pt.values()].filter(x => x === 'main').length })).sort((a, b) => b.w.n - a.w.n), L = cf ? L0.filter(o => o.camp.c === cf) : L0, mx = Math.max(1, ...L.map(o => o.w.n));
      const campsUsed = [1, 2, 3, 4].filter(i => L0.some(o => o.camp.c === i)), cc = anaCalcCamps();
      const campBar = `<div class="flex flex-wrap items-center gap-1.5 mb-3 text-xs"><span class="text-slate-400">🏕️ Camp</span><div class="flex gap-1 p-1 rounded-xl bg-ink-950 border border-ink-700"><button type="button" data-anacampf="0" aria-pressed="${!cf}" class="seg-btn rounded-lg px-2 py-0.5 font-semibold"><span>Alle</span></button>${[1, 2, 3, 4].map(i => `<button type="button" data-anacampf="${i}" aria-pressed="${cf === i}" class="seg-btn rounded-lg px-2 py-0.5 font-semibold ${campsUsed.includes(i) ? '' : 'opacity-40'}" translate="no">${anaCampName(i)}</button>`).join('')}</div>
        <span class="text-[11px] text-slate-500">${cc && cc.m.size ? '<span>Camps aus dem KvK-Rechner (Profil) – pro Königreich änderbar</span>' : '<span>Camp pro Königreich wählen – oder im Profil unter KvK → Karte → Camps eintragen</span>'}</span></div>`;
      const campSel = (o) => `<select data-anacamp="${o.kd}" class="bg-ink-950 border ${o.camp.auto ? 'border-ink-700' : 'border-gold-500/50'} rounded-lg px-1 py-0.5 text-[11px] text-slate-200" title="${o.camp.auto ? 'aus dem Profil' : 'von Hand'}"><option value="auto">${o.camp.auto ? '↺ ' + anaCampName(o.camp.c) : '–'}</option>${[0, 1, 2, 3, 4].map(i => `<option value="${i}" ${!o.camp.auto && o.camp.c === i && (kbSt().kdCamp || {})[o.kd] != null ? 'selected' : ''}>${i ? anaCampName(i) : '✕ kein Camp'}</option>`).join('')}</select>`;
      if (!L.length) body = (L0.length ? campBar : '') + '<div class="text-sm text-slate-500 py-6 text-center">Keine Kämpfe mit bekanntem Königreich im Zeitraum.</div>';
      else if (tab === 'ally') {
        const campSum = campsUsed.length ? `<div class="grid sm:grid-cols-2 lg:grid-cols-4 gap-2 mb-3">${campsUsed.map(i => { const K = L0.filter(o => o.camp.c === i), w = anaSum(K.flatMap(o => o.rows)), C = ANA_CAMPS[i - 1];
          return `<button type="button" data-anacampf="${cf === i ? 0 : i}" class="text-left rounded-xl border p-2.5" style="border-color:${C.c}66;background:${C.c}12"><div class="font-semibold text-sm" style="color:${C.c}" translate="no">${anaCampName(i)} ${cc && cc.my === i ? '<span class="text-[10px] text-gold-300">(<span>dein Camp</span>)</span>' : ''}</div><div class="text-[11px] text-slate-400">${fmt(K.length)} <span>Königreiche</span> · ${fmt(K.reduce((a, o) => a + o.pl.size, 0))} <span>Spieler</span> · ${fmt(w.n)} <span>Kämpfe</span></div><div class="text-xs mt-0.5"><span class="text-gold-200">🏆 ${short(w.kp)}</span> · <span class="${kptC(w.kpt)}">🔁 ${hmKptTxt(w.kpt)}</span></div></button>`; }).join('')}</div>` : '';
        body = campBar + campSum + `<div class="overflow-x-auto"><table class="w-full text-sm"><thead><tr><th class="${th} text-left">Königreich</th><th class="${th} text-left">Camp</th><th class="${th} text-right">Spieler</th><th class="${th} text-right" title="wahrscheinlich Main-Accounts (Name, T5, Skills, Kommandanten)">🐋 <span>davon Main</span></th><th class="${th} text-right">Kämpfe</th><th class="${th} text-right">🏆 KP</th><th class="${th} text-right">🗡️ Gegner-KP</th><th class="${th} text-right">🔁 KP-Trade</th><th class="${th} text-right">⚖️ Trade</th></tr></thead><tbody>
        ${L.map(o => `<tr class="border-t border-ink-800/60"><td class="py-2 pr-3"><div class="font-bold text-red-200" translate="no">👑 #${o.kd}</div><div class="h-1 rounded bg-ink-800 mt-1 w-32"><div class="h-1 rounded bg-red-400/70" style="width:${o.w.n / mx * 100}%"></div></div></td>
          <td class="py-2 pr-2">${campSel(o)}</td><td class="${td} text-right">${fmt(o.pl.size)}</td><td class="${td} text-right text-sky-200 whitespace-nowrap">${fmt(o.mains)} <span class="text-[10px] text-slate-500">(${Math.round(o.mains / Math.max(1, o.pl.size) * 100)} %)</span></td><td class="${td} text-right">${fmt(o.w.n)}</td><td class="${td} text-right text-gold-200">${short(o.w.kp)}</td><td class="${td} text-right text-red-200">${short(o.w.ekp)}</td><td class="${td} text-right font-semibold ${kptC(o.w.kpt)}">${hmKptTxt(o.w.kpt)}</td><td class="${td} text-right ${kptC(o.w.trade)}">${hmTradeTxt(o.w.trade)}</td></tr>`).join('')}</tbody></table></div>`;
      } else {
        const mineAll = (kbRows || []).filter(r => kbMine(r.player_id) && (!st.acc || String(r.player_id) === st.acc) && kxInRange(r.battle_start));
        const hrs = (list) => { const h = new Array(24).fill(0); list.forEach(r => { const t = Date.parse(r.battle_start); if (t) h[new Date(t).getHours()]++; }); return h; };
        const peak = (h) => { let best = -1, bi = 0; for (let i = 0; i < 24; i++) { const v = h[i] + h[(i + 1) % 24] + h[(i + 2) % 24]; if (v > best) { best = v; bi = i; } } return best > 0 ? `${bi}–${(bi + 3) % 24}` : '–'; };
        const BL = [[0, 6, '🌙', 'Nacht', '0–6'], [6, 12, '🌅', 'Morgen', '6–12'], [12, 18, '☀️', 'Mittag', '12–18'], [18, 24, '🌆', 'Abend', '18–24']];
        const strip = (h, rgb) => { const m = Math.max(1, ...h); return `<div class="flex gap-px">${h.map((v, i) => `<span title="${i}–${i + 1} Uhr: ${v}" class="w-3.5 h-6 rounded-sm" style="background:${v ? `rgba(${rgb},${.15 + v / m * .85})` : '#151b26'}"></span>`).join('')}</div>`; };
        const myH = hrs(mineAll);
        const by = st.anaBy === 'kd' || !campsUsed.length ? 'kd' : 'camp', n0 = mineAll.length;
        const groups = by === 'camp' ? campsUsed.map(i => ({ l: anaCampName(i), rows: L0.filter(o => o.camp.c === i).flatMap(o => o.rows), rgb: ANA_CAMPS[i - 1].rgb, c: ANA_CAMPS[i - 1].c, sub: L0.filter(o => o.camp.c === i).map(o => '#' + o.kd).join(' ') }))
          : L.slice(0, 15).map(o => ({ l: '👑 #' + o.kd, rows: o.rows, rgb: o.camp.c ? ANA_CAMPS[o.camp.c - 1].rgb : '248,113,113', c: o.camp.c ? ANA_CAMPS[o.camp.c - 1].c : '#f87171', sub: o.camp.c ? anaCampName(o.camp.c) : '' }));
        const row = (g, isMe) => { const h = hrs(g.rows), n = g.rows.length;
          return `<tr class="border-t border-ink-800/60 ${isMe ? 'bg-gold-500/5' : ''}"><td class="py-2 pr-3 whitespace-nowrap"><div class="font-bold" style="color:${isMe ? '#fde68a' : g.c}" translate="no">${g.l}</div>${g.sub ? `<div class="text-[10px] text-slate-500 max-w-[11rem] truncate" translate="no">${esc(g.sub)}</div>` : ''}</td><td class="py-2 pr-3">${strip(h, isMe ? '245,197,66' : g.rgb)}</td><td class="${td} text-right whitespace-nowrap"><b>${peak(h)}</b> <span class="text-[10px] text-slate-500">Uhr</span></td>
            ${BL.map(([a, b]) => { const c = g.rows.filter(r => { const x = new Date(r.battle_start).getHours(); return x >= a && x < b; }).length, pct = n ? Math.round(c / n * 100) : 0;
              return `<td class="py-2 px-1.5 text-center tabular-nums"><div class="text-xs ${pct >= 35 ? 'text-slate-100 font-bold' : 'text-slate-400'}">${pct} %</div></td>`; }).join('')}<td class="${td} text-right text-slate-400">${fmt(n)}</td></tr>`; };
        // 📅 Verlauf: Kämpfe pro Tag, gestapelt nach Camp/Königreich – darunter du
        const dayK = (r) => (r.battle_start || '').slice(0, 10), DS = [...new Set([...mineAll, ...groups.flatMap(g => g.rows)].map(dayK).filter(Boolean))].sort().slice(-31);
        const per = groups.map(g => { const m = new Map(); g.rows.forEach(r => { const d = dayK(r); m.set(d, (m.get(d) || 0) + 1); }); return m; }), myD = new Map(); mineAll.forEach(r => { const d = dayK(r); myD.set(d, (myD.get(d) || 0) + 1); });
        const dMax = Math.max(1, ...DS.map(d => per.reduce((a, m) => a + (m.get(d) || 0), 0))), mMax = Math.max(1, ...DS.map(d => myD.get(d) || 0));
        const tl = DS.length ? `<h4 class="font-semibold text-slate-100 mt-5 mb-1 text-base">📅 <span>Verlauf</span> <span class="text-[11px] text-slate-500 font-normal">– <span>Kämpfe pro Tag gegen</span> ${by === 'camp' ? '<span>die Camps</span>' : '<span>die Königreiche</span>'} · <span>gelb = deine Kämpfe</span></span></h4>
          <div class="flex items-end gap-1 h-36 border-b border-ink-700">${DS.map(d => `<div class="flex-1 flex flex-col justify-end h-full" title="${d}: ${groups.map((g, i) => g.l.replace(/<[^>]+>/g, '') + ' ' + (per[i].get(d) || 0)).join(' · ')}">${groups.map((g, i) => { const v = per[i].get(d) || 0; return v ? `<div style="height:${v / dMax * 100}%;background:${g.c};opacity:.75"></div>` : ''; }).join('')}</div>`).join('')}</div>
          <div class="flex items-start gap-1 h-8 mt-0.5">${DS.map(d => `<div class="flex-1"><div class="rounded-b bg-gold-400/80" style="height:${(myD.get(d) || 0) / mMax * 28}px"></div></div>`).join('')}</div>
          <div class="flex gap-1">${DS.map((d, i) => `<span class="flex-1 text-center text-[9px] text-slate-600">${i % Math.ceil(DS.length / 12) ? '' : d.slice(8, 10) + '.' + d.slice(5, 7)}</span>`).join('')}</div>
          <div class="flex flex-wrap gap-3 mt-1 text-[11px]">${groups.map(g => `<span class="inline-flex items-center gap-1" translate="no"><span class="w-2.5 h-2.5 rounded-sm" style="background:${g.c}"></span>${g.l}</span>`).join('')}</div>` : '';
        body = `${campBar}<div class="flex flex-wrap items-center gap-2 mb-2 text-xs"><div class="flex gap-1 p-1 rounded-xl bg-ink-950 border border-ink-700"><button type="button" data-anaby="camp" aria-pressed="${by === 'camp'}" class="seg-btn rounded-lg px-2 py-0.5 font-semibold ${campsUsed.length ? '' : 'opacity-40'}">🏕️ <span>Nach Camp</span></button><button type="button" data-anaby="kd" aria-pressed="${by === 'kd'}" class="seg-btn rounded-lg px-2 py-0.5 font-semibold">👑 <span>Nach Königreich</span></button></div>
          <span class="text-[11px] text-slate-500">Wann gekämpft wird – deine Zeit (0–23 Uhr). Je heller das Kästchen, desto mehr Kämpfe in der Stunde.</span></div>
          <div class="overflow-x-auto"><table class="text-sm"><thead><tr><th class="${th} text-left">${by === 'camp' ? 'Camp' : 'Königreich'}</th><th class="${th} text-left"><div class="flex gap-px">${myH.map((_, i) => `<span class="w-3.5 text-center text-[9px]">${i % 3 ? '' : i}</span>`).join('')}</div></th><th class="${th} text-right">Hauptzeit</th>${BL.map(x => `<th class="px-1.5 text-center text-[11px] font-medium text-slate-500 whitespace-nowrap">${x[2]} <span>${x[3]}</span><div class="text-[9px] text-slate-600">${x[4]}</div></th>`).join('')}<th class="${th} text-right">Kämpfe</th></tr></thead>
          <tbody>${row({ l: '🙋 Du', rows: mineAll }, true)}${groups.map(g => row(g)).join('')}</tbody></table></div>${tl}${anaOnline(st, mineAll)}`;
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
      const R = rows.filter(r => !kbPilotRow(r)).sort((a, b) => Date.parse(a.battle_start) - Date.parse(b.battle_start)), T = R.map(r => Date.parse(r.battle_start));   // ohne Pilot-Kämpfe
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
      const MR = (kbRows || []).filter(r => kbMine(r.player_id) && (!st.acc || String(r.player_id) === st.acc) && kbIsPvp(r) && !kbIsAoo(r) && !kbPilotRow(r) && kxInRange(r.battle_start));   // inkl. Rally/Garnison, ohne Pilot
      const mKp = MR.reduce((a, r) => a + (+r.kill_points || 0), 0), mAc = MR.reduce((a, r) => a + (+r.acclaim || 0), 0), mN = MR.length;
      const accSteps = [1e6, 2e6, 5e6, ...Array.from({ length: Math.max(8, Math.floor(mAc / 5e6) + 4) }, (_, i) => (i + 2) * 5e6)];
      const kpSteps = [5e7, ...Array.from({ length: Math.max(12, Math.floor(mKp / 1e8) + 4) }, (_, i) => (i + 1) * 1e8)];
      const ALLr = (kbRows || []).filter(r => kbMine(r.player_id) && (!st.acc || String(r.player_id) === st.acc) && kxInRange(r.battle_start)), BADGES = kbBadges(R, MR, ALLr);
      const badgeHtml = BADGES.map(b => { const { ic, d, v, steps, f, lv, t } = b, nx = steps[lv], top = steps[steps.length - 1];
        return [b.cat, `<div class="rounded-xl border p-3 ${t ? '' : 'border-ink-700 opacity-70'}" style="${t ? `border-color:${t[2]}99;background:${t[2]}14` : ''}"><div class="flex items-center gap-2"><span class="text-2xl ${t ? '' : 'grayscale'}">${ic}</span><div class="min-w-0"><div class="font-semibold text-sm text-slate-100"><span>${b.title}</span> ${t ? `<span class="text-xs" style="color:${t[2]}">${t[0]} <span>${t[1]}</span></span>` : ''}</div><div class="text-[10px] text-slate-500"><span>${d}</span></div></div><div class="ml-auto text-right text-sm font-bold tabular-nums" style="color:${t ? t[2] : '#64748b'}">${f(v)}</div></div>
          ${b.one ? '' : `<div class="flex gap-1 mt-2">${steps.map((x, i) => `<span class="flex-1 rounded-md border px-1 py-0.5 text-center text-[10px] tabular-nums" style="${i < lv ? `border-color:${KB_TIER5[i][2]};color:${KB_TIER5[i][2]};background:${KB_TIER5[i][2]}1f` : 'border-color:#334155;color:#64748b'}">${KB_TIER5[i][0]} ${f(x)}</span>`).join('')}</div>`}
          ${b.one ? '' : nx != null ? `<div class="mt-1.5 h-1.5 rounded-full bg-ink-800 overflow-hidden"><div class="h-1.5 rounded-full" style="width:${Math.min(100, Math.max(2, (v - (steps[lv - 1] || 0)) / (nx - (steps[lv - 1] || 0)) * 100))}%;background:${KB_TIER5[lv][2]}"></div></div><div class="text-[10px] text-slate-500 mt-1"><span>Nächste Stufe</span>: ${f(nx)} · <span>noch</span> ${f(Math.max(0, nx - v)).replace('<span>Felder</span>', '')}</div>` : `<div class="text-[10px] text-cyan-300 mt-1">💎 <span>Höchste Stufe!</span> <span class="text-slate-400">· <span>Zähler läuft weiter</span>: +${f(v - top).replace('<span>Felder</span>', '')} <span>darüber</span></span></div>`}</div>`]; });
      const track = (icon, title, sub, val, steps, f, col) => { const done = steps.filter(x => x <= val), nx = steps.find(x => x > val), prev = done.length ? done[done.length - 1] : 0, pct = nx ? Math.max(2, (val - prev) / (nx - prev) * 100) : 100;
        const lo = Math.max(0, done.length - 3), win = steps.slice(lo, lo + 7);
        return `<div class="rounded-xl border border-ink-700 bg-ink-950/60 p-3"><div class="flex items-start justify-between gap-2"><div><div class="font-semibold text-slate-100">${icon} <span>${title}</span></div><div class="text-[10px] text-slate-500">${sub}</div></div>
          <div class="text-right"><div class="text-xl font-bold tabular-nums" style="color:${col}">${f(val)}</div><div class="text-[10px] text-slate-400">${done.length} / ${steps.length > 30 ? '∞' : steps.length} <span>erreicht</span></div></div></div>
          <div class="mt-2 h-2.5 rounded-full bg-ink-800 overflow-hidden"><div class="h-2.5 rounded-full" style="width:${pct}%;background:${col}"></div></div>
          <div class="text-[10px] text-slate-400 mt-1">${nx ? `<span>Nächstes Ziel</span> <b class="text-slate-200">${f(nx)}</b> · <span>noch</span> ${f(nx - val)}` : '🏆 <span>Alle geschafft!</span>'}</div>
          <div class="flex flex-wrap gap-1 mt-2">${win.map(x => { const ok = x <= val, nxt = x === nx; return `<span class="rounded-md border px-1.5 py-0.5 text-[10px] tabular-nums ${ok ? 'border-gold-400/70 bg-gold-500/15 text-gold-100' : nxt ? 'border-sky-400/70 text-sky-200' : 'border-ink-700 text-slate-600'}">${ok ? '✓ ' : nxt ? '▶ ' : ''}${f(x)}</span>`; }).join('')}</div></div>`; };
      const sec = (t, sub) => `<h4 class="font-semibold text-slate-100 mt-5 mb-1 text-base">${t} <span class="text-[11px] text-slate-500 font-normal">${sub || ''}</span></h4>`;
      body = `${sec('📊 <span>Überblick</span>', '– Zeitraum oben')}
        <div class="grid sm:grid-cols-3 gap-2">${rec('🏆', 'KP im Zeitraum', short(tot.kp), fmt(tot.n) + ' <span>Kämpfe</span>')}${rec('🔁', 'KP-Trade im Zeitraum', hmKptTxt(tot.kpt))}${rec('🔮', 'Hochrechnung KvK-Ende', proj ? '~' + short(proj) : '–', proj ? `<span>bei</span> ${short(kvkKp)} <span>nach</span> ${Math.floor(dEl)} <span>von 50 Tagen</span>` : '<span>KvK-Start in der Heatmap setzen</span>')}</div>
        ${sec('🏁 <span>Meilensteine</span>', '– alle PvP-Kämpfe im Zeitraum oben inkl. Rally/Garnison (für alles: Zeitraum „Alles“)')}
        <div class="grid lg:grid-cols-3 gap-2">${track('🏆', 'Kill Points', '50 M · 100 M · <span>dann alle</span> 100 M', mKp, kpSteps, short, '#f5c542')}
          ${track('🎖️', 'Verdienst', '1 M · 2 M · 5 M · 10 M · <span>dann alle</span> 5 M', mAc, accSteps, short, '#7dd3fc')}
          ${track('⚔️', 'Kämpfe', '1 K · 10 K · 50 K · 100 K …', mN, [1e3, 1e4, 5e4, 1e5, 2.5e5, 5e5], short, '#f87171')}</div>
        ${sec('🏅 <span>Rekorde</span>')}
        <div class="grid sm:grid-cols-2 lg:grid-cols-4 gap-2">${rec('💥', 'Größter Battle Streak', short(bigS) + ' KP')}${rec('⚡', 'Meiste KP in 10 min', short(best10), bi ? hmWhen(bi) : '')}
          ${rec('🏁', 'Schnellste 10 Mio.', fast ? Math.round(fast.d / 6e4) + ' min' : '–', fast ? hmWhen(fast.t) : '')}${rec('📅', 'Bester Tag', bestDay ? short(bestDay[1]) : '–', bestDay ? bestDay[0] : '')}</div>
        ${sec('🎖️ <span>Abzeichen &amp; Ziele</span>', '– 🥉 Bronze · 🥈 Silber · 🥇 Gold · 🏅 Platin · 💎 Diamant · ✅ Einzel-Erfolge · ohne Pilot-Kämpfe')}
        ${[['fight', '⚔️ Kampf'], ['pve', '🪓 PvE & Stadt'], ['cmd', '🎯 Kommandanten'], ['meta', '🏆 Meta']].map(([c, l]) => { const H = badgeHtml.filter(x => x[0] === c).map(x => x[1]).join(''); return H ? `<div class="text-xs font-semibold text-slate-300 mt-3 mb-1.5">${l}</div><div class="grid sm:grid-cols-2 lg:grid-cols-3 gap-2">${H}</div>` : ''; }).join('')}
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
      ${tab !== 'farm' ? `<div class="flex flex-wrap items-center gap-1.5 mb-3"><span class="text-[11px] text-slate-500">Gegner:</span>${[['', '🌍', 'Alle'], ['main', '🐋', 'Mains'], ['mix', '❔', 'Unklar'], ['farm', '🐟', 'Farms']].map(([k, i, l]) => { const n = k ? rows0.filter(r => (tierOf(r)?.t || 'unk') === k).length : rows0.length;
        return `<button type="button" data-anatier="${k}" aria-pressed="${tf === k}" class="seg-btn rounded-lg px-2.5 py-1 text-xs font-semibold">${i} <span>${l}</span> <span class="text-slate-500 tabular-nums">${fmt(n)}</span></button>`; }).join('')}
        <span class="text-[10px] text-slate-500">🐋 Main / 🐟 Farm aus: Name (Farm, Filler, TP …) · T4/T5 · Skill-Level · alte Kommandanten · Marschgröße – Maus auf das Symbol zeigt die Gründe</span></div>` : ''}${body}</section>`;
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
  function hmKvkCode(h) { return hmAk(h).kvk || ''; }
  // C-Nummer, Start, Pass 7 / Kingsland bleiben pro Account fest: fehlt etwas lokal, kommt es aus rok_kvk_ids (z. B. auf anderem Gerät oder in der App eingetragen)
  var kbKvkFill = null;
  function kbKvkFillLoad() {
    if (hmSpect()) return; const ids = [...kbMyIds()], key = ids.slice().sort().join(','); if (!ids.length || kbKvkFill === key || kbKvkFill === 'loading') return; kbKvkFill = 'loading';
    (async () => { try { const db = RokAuth.db?.(); if (!db) throw 0; const q = await db.from('rok_kvk_ids').select('governor_id,kvk,map,kvk_start,p7_at,kl_at').in('governor_id', ids); if (q.error) throw q.error;
        const st = kbSt(); st.accKvk = st.accKvk || {}; let ch = false; const loc = (t) => { if (!t) return ''; const d = new Date(t), z = (n) => String(n).padStart(2, '0'); return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}T${z(d.getHours())}:${z(d.getMinutes())}`; };
        (q.data || []).forEach(x => { const a = (st.accKvk[String(x.governor_id)] = st.accKvk[String(x.governor_id)] || {});
          if (!a.kvk && x.kvk) { a.kvk = x.kvk; ch = true; } if (!a.map && x.map) { a.map = x.map; ch = true; } if (!a.start && x.kvk_start) { a.start = String(x.kvk_start).slice(0, 10); ch = true; }
          if (!a.p7 && x.p7_at) { a.p7 = loc(x.p7_at); ch = true; } if (!a.kl && x.kl_at) { a.kl = loc(x.kl_at); ch = true; } });
        kbKvkFill = key; if (ch) { savePassive(); if (R.view === 'battles') renderKampf(); } } catch { kbKvkFill = key; } })();
  }   // C-Nummer gibst du selbst ein, sie steht nicht in den Berichten
  function hmSid(h) { return null; }   // nicht mehr nach Karten-Nummer filtern – die wird von mehreren KvKs benutzt; Zeitraum kommt vom KvK-Start   // gefiltert wird über die Karten-Nummer, die beim Eintragen der C-Nummer aktuell war
  function hmIsProf(h) { return hmAcc(h) === kbProfileId(); }
  function hmStart(h) { const sp = hmSpect(), a = hmAk(h), wi = sp ? hmWInfoCur(h) : null; if (!sp && a.start) return a.start; if (wi?.start) return String(wi.start).slice(0, 10);
    const pk = !sp && a.kvk ? kbKvkOf(a.kvk) : null; if (pk) return pk.from;
    const c = hmCalc(); if (c?.start) return c.start;   // sonst KvK-Rechner im Profil
    const lim = new Date(Date.now() - 50 * 864e5).toISOString(); let t = ''; hmAccRows(hmAcc(h)).forEach(r => { if (r.battle_start && r.battle_start >= lim && (!t || r.battle_start < t)) t = r.battle_start; }); return t ? t.slice(0, 10) : ''; }
  function hmEnd(h) { const a = hmSpect() ? null : hmAk(h), pk = a?.kvk ? kbKvkOf(a.kvk) : null; if (pk && !pk.live) return Date.parse(pk.to + 'T23:59:59'); const s = hmStart(h); return s ? Date.parse(s + 'T00:00:00Z') + 50 * 864e5 : null; }   // KvK = 50 Tage
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
    const add = (r, joined) => { const kd = hmKind(r); if (!kd) return; const city = !joined && kd === 'pvp' && +r.group_size > 1 && r.city_x != null && r.pos_x != null && Math.hypot(+r.pos_x - +r.city_x, +r.pos_y - +r.city_y) <= 30;   // City-Rally nur bei Gruppenkampf (Garnison) – normale Kämpfe neben der Stadt zählen normal
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
  async function hmLoadShare() { if (hmShare != null) return; hmShare = false; let was = false;
    try { const db = RokAuth?.db?.(), me = RokAuth?.userId?.(); if (!db || !me) return; const q = await db.from('leaderboard').select('heat_share').eq('user_id', me).maybeSingle(); if (q.error) { hmShareCol = false; return; } hmShare = !!q.data?.heat_share; } catch {}
    finally { if (hmShare !== was && R.view === 'battles' && kbSt().page === 'heat') renderKampf(); else { const b = document.querySelector('[data-hmshare]'); if (b) b.innerHTML = hmShare ? '👁️ <span>Für Freunde &amp; Königreich sichtbar</span>' : '🔒 <span>Privat</span>'; } } }
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
    const allM = h.march ? allA.filter(p => !p.mine || mk(p) === h.march) : allA, zbOf = (z) => z >= 0 ? hmBaseName(hmZName(h, m, z)) : '';
    if (h.zb && !allM.some(p => p.mine && zbOf(p.z) === h.zb)) h.zb = '';   // Zonen-Filter ohne Kämpfe im Zeitraum (z. B. „Pass 7“ nach Kingsland-Start) → aufheben, sonst bleibt die Karte leer
    const all0 = h.zb ? allM.filter(p => zbOf(p.z) === h.zb) : allM;
    if (h.iso != null && !all0.some(p => p.z === h.iso)) h.iso = null;   // „Nur diese Zone“ ohne Kämpfe (andere Karte / anderer Account / anderer Zeitraum) → aufheben
    const all = h.iso != null ? all0.filter(p => p.z === h.iso) : all0;
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
  // Aktive Filter auf einen Blick – jeder mit ✕, dazu „Alles zurücksetzen“
  function hmActiveFilters(h, S) {
    const m = S.m, L = [];
    if (h.fight) { const f = S.fights.find(x => x.id === h.fight); L.push(['fight', '⚔️ ' + (f ? esc(f.name) : 'Schlacht')]); }
    else if (h.t === 'day' && h.day) L.push(['t', '📅 <span>KvK-Tag</span> ' + esc(h.day)]);
    else if (h.t && h.t !== 'kvk') L.push(['t', '🗓️ ' + (HM_T.find(x => x[0] === h.t)?.[1] || h.t)]);
    if (h.hf || h.ht) L.push(['hour', '🕒 ' + esc(h.hf || '00:00') + '–' + esc(h.ht || '24:00')]);
    if (h.zb) L.push(['zb', '📍 ' + esc(h.zb)]);
    if (h.iso != null) L.push(['iso', '🔍 ' + esc(hmZName(h, m, h.iso))]);
    if (h.march) L.push(['march', '🛡️ ' + esc(h.march)]);
    if (h.tl != null) L.push(['tl', '🎞️ <span>bis</span> ' + hmWhen(S.cur)]);
    if (!L.length) return '';
    return `<div class="flex flex-wrap items-center gap-1.5 mb-2 text-xs"><span class="text-[11px] text-amber-300 font-semibold">⚠️ <span>Aktive Filter</span>:</span>${L.map(([k, l]) => `<button type="button" data-hmclr="${k}" class="inline-flex items-center gap-1 rounded-lg border border-amber-400/60 bg-amber-500/10 text-amber-100 px-2 py-0.5 hover:bg-amber-500/25">${l} <span class="text-amber-300">✕</span></button>`).join('')}
      ${L.length > 1 ? '<button type="button" data-hmclr="all" class="rounded-lg border border-ink-600 px-2 py-0.5 text-slate-300 hover:border-gold-500/60">↺ <span>Alles zurücksetzen</span></button>' : ''}</div>`;
  }
  function hmHtml(st, reload) {
    const S = hmState(st), { h, m, fights, marches, all, t0, t1, cur, zs, zsAll } = S;
    if (h.fr && !hmMates && !hmMatesLoading) hmLoadMates();
    const seg = (attr, k, l, on) => `<button type="button" ${attr}="${k}" aria-pressed="${on}" class="seg-btn rounded-lg px-2 py-1 text-xs font-semibold transition">${l}</button>`;
    const sel = 'bg-ink-950 border border-ink-600 rounded-lg px-2 py-1 text-xs text-slate-100 focus:outline-none focus:border-gold-500', pvp = h.src === 'pvp' || h.src === 'all' || h.src === 'rally', start = hmStart(h);
    const fightSel = pvp ? `<select data-hmfight class="${sel} max-w-[22rem]"><option value="">🎞️ Komplette Timeline</option>${fights.map(f => `<option value="${f.id}" ${h.fight === f.id ? 'selected' : ''}>⚔️ ${esc(f.name)} · ${hmWhen(f.a)}–${new Date(f.b).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })} · ${short(f.kp)} KP</option>`).join('')}</select>
      ${h.fight ? '<button type="button" data-hmfren title="Schlacht umbenennen" class="px-2 py-1 rounded-lg border border-ink-600 hover:border-gold-500/60">✏️</button>' : ''}` : '';
    const zOpt = zsAll.slice().sort((a, b) => hmZName(h, m, a.z).localeCompare(hmZName(h, m, b.z), 'de', { numeric: true }));
    const zoneSel = (big) => `<select data-hmzsel class="${sel} ${big ? 'text-sm py-1.5' : ''}"><option value="">🗺️ Alle Zonen</option>${S.zbList.length > 1 ? `<optgroup label="Bereiche">${S.zbList.map(x => `<option value="b:${esc(x.b)}" ${h.iso == null && h.zb === x.b ? 'selected' : ''}>📍 ${esc(x.b)} (alle) – ${pvp ? '🏆 ' + short(x.kp) : fmt(x.n)}</option>`).join('')}</optgroup><optgroup label="Einzelne Zonen">` : ''}${zOpt.map(o => `<option value="${o.z}" ${h.iso === o.z ? 'selected' : ''}>${esc(hmZName(h, m, o.z))} – ${pvp ? '🏆 ' + short(o.kp) : (h.src === 'barb' ? '🪓 ' : '👹 ') + fmt(o.n)}</option>`).join('')}${S.zbList.length > 1 ? '</optgroup>' : ''}</select>`;
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
      <div class="rounded-xl border border-ink-700 bg-ink-950/50 px-3 py-1.5 mb-2 text-xs">
        <div class="flex flex-wrap items-center gap-2 py-1.5 border-t border-ink-800/70 first:border-0"><span class="w-20 shrink-0 text-[11px] font-semibold text-slate-400">📂 <span>Was</span></span><div class="flex flex-wrap gap-1 p-1 rounded-xl bg-ink-950 border border-ink-700">${HM_SRC.filter(x => !hmSpect() || x[0] === 'pvp').map(([k, l, c]) => seg('data-hmsrc', k, `<span class="inline-block w-2 h-2 rounded-full mr-1" style="background:${c}"></span>${l}`, h.src === k)).join('')}</div></div>
        <div class="flex flex-wrap items-center gap-2 py-1.5 border-t border-ink-800/70 first:border-0"><span class="w-20 shrink-0 text-[11px] font-semibold text-slate-400">🗓️ <span>Wann</span></span><div class="flex flex-wrap gap-1 p-1 rounded-xl bg-ink-950 border border-ink-700">${HM_T.map(([k, l]) => seg('data-hmt', k, l, !h.fight && h.t === k)).join('')}</div>${pvp && fights.length ? fightSel : ""}<span class="flex items-center gap-1 p-1 rounded-xl bg-ink-950 border ${h.hf || h.ht ? 'border-gold-500/60' : 'border-ink-700'}" title="Nur Kämpfe in dieser Uhrzeit (jeden Tag)"><span class="px-1">🕒</span><input type="time" data-hmhf value="${esc(h.hf || '')}" class="bg-transparent text-xs text-slate-100 focus:outline-none w-[5.5rem]"><span class="text-slate-500">–</span><input type="time" data-hmht value="${esc(h.ht || '')}" class="bg-transparent text-xs text-slate-100 focus:outline-none w-[5.5rem]">${h.hf || h.ht ? '<button type="button" data-hmhx class="px-1.5 text-slate-400 hover:text-red-300">✕</button>' : ''}</span></div>
        ${!h.fight && h.t === 'custom' ? `<div class="flex flex-wrap items-center gap-2 mb-2 text-xs"><span class="text-slate-400">Von</span><input type="datetime-local" data-hmfrom value="${esc(h.from || (start ? start + 'T00:00' : ''))}" class="${sel}"><span class="text-slate-400">bis</span><input type="datetime-local" data-hmto value="${esc(h.to || '')}" class="${sel}"></div>` : ''}
        <div class="pl-20">${hmDays(h, S)}</div>
        <div class="flex flex-wrap items-center gap-2 py-1.5 border-t border-ink-800/70 first:border-0"><span class="w-20 shrink-0 text-[11px] font-semibold text-slate-400">📍 <span>Wo</span></span>${zoneSel(false)}${marches.length > 1 ? marchSel.replace("text-sm py-1.5", "") : ""}</div>
        <div class="flex flex-wrap items-center gap-2 py-1.5 border-t border-ink-800/70 first:border-0"><span class="w-20 shrink-0 text-[11px] font-semibold text-slate-400">👁️ <span>Anzeige</span></span><label class="flex items-center gap-1 text-slate-400" title="Blau = deine Garnison in Flagge/Pass · Rot = gegnerische Garnison, die du angegriffen/geralliert hast"><input type="checkbox" data-hmgfl ${h.gflags !== false ? 'checked' : ''} class="accent-sky-400"> <span>🚩 Garnisonen</span></label><label class="flex items-center gap-1 text-slate-400" title="Alle Teleports deiner Stadt als Linie"><input type="checkbox" data-hmcpath ${h.cpath ? 'checked' : ''} class="accent-emerald-400"> <span>🏙️ Stadt-Weg</span></label>${h.cpath ? `<label class="flex items-center gap-1 text-slate-400"><input type="checkbox" data-hmtpl ${h.tpLines !== false ? 'checked' : ''} class="accent-emerald-400"> <span>Linien</span></label>
          <label class="flex items-center gap-1 text-slate-400" title="Kleine Teleports (nur Stadt verschoben) zusammenfassen"><span>TP ab</span><select data-hmtpmin class="bg-ink-950 border border-ink-600 rounded px-1 py-0.5 text-[11px]">${[2, 10, 25, 50, 100].map(v => `<option value="${v}" ${(+h.tpMin || 10) === v ? 'selected' : ''}>${v} <span>Feldern</span></option>`).join('')}</select></label>${(h.tpHide || []).length ? `<button type="button" data-hmtpreset class="text-[11px] text-slate-400 hover:text-gold-300">↺ ${h.tpHide.length} <span>ausgeblendete TPs zeigen</span></button>` : ''}` : ''}
        <label class="flex items-center gap-1 text-slate-400"><input type="checkbox" data-hmzm ${h.zm ? 'checked' : ''} class="accent-amber-400"> <span>Zonen-Marker</span></label>
        <label class="flex items-center gap-1 text-slate-400" title="Eigene Flaggen + geschätztes Gebiet aus den Allianz-Mails"><input type="checkbox" data-hmflagsx ${h.flags ? 'checked' : ''} class="accent-sky-400"> <span>🚩 Flaggen</span></label>
        <label class="flex items-center gap-1 text-slate-400"><input type="checkbox" data-hmfr ${h.fr ? 'checked' : ''} class="accent-amber-400"> <span>👥 Freunde &amp; Königreich</span></label><label class="flex items-center gap-1 text-slate-400"><span>Glühen</span> <input type="range" min="1" max="8" value="${h.rad}" data-hmrad class="accent-amber-400 w-20"></label><span class="ml-auto flex flex-wrap items-center gap-1"><span class="flex gap-1 p-0.5 rounded-lg bg-ink-950 border border-ink-700">${HM_MAPS.map(x => `<button type="button" data-hmmap="${x.k}" aria-pressed="${h.map === x.k}" class="seg-btn rounded-md px-2 py-0.5 text-[11px] font-semibold" translate="no">🗺️ ${esc(x.n)}</button>`).join('')}</span>
          <button type="button" data-hmcal class="px-2 py-1 rounded-lg border ${hmCalMode ? 'border-emerald-400 text-emerald-300' : 'border-ink-600'} hover:border-gold-500/60" title="Auf die Stelle klicken, an der deine Stadt im Spiel wirklich steht">📍 <span>${hmCalMode ? 'Jetzt auf deine Stadt klicken …' : 'Stadt kalibrieren'}</span></button>
          ${h.ux ? '<button type="button" data-hmcalx class="px-2 py-1 rounded-lg border border-ink-600 hover:border-gold-500/60" title="Kalibrierung zurücksetzen">↺</button>' : ''}</span></div>
      </div>
      ${hmActiveFilters(h, S)}
      ${matesBar}
      <div class="grid lg:grid-cols-[minmax(0,1fr)_19rem] ${hmSpect() ? '' : 'xl:grid-cols-[9.5rem_minmax(0,1fr)_19rem]'} gap-3 items-start mt-2">${hmQuickHtml(st, h)}<div id="hmWrap" class="bg-ink-950 rounded-xl">
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
          <div class="flex flex-wrap items-center gap-2 text-xs"><button type="button" data-hmtlopen class="px-2.5 py-1 rounded-lg border border-ink-600 hover:border-gold-500/60 font-semibold text-slate-200">🎞️ <span>Timeline</span> ${h.tlOpen ? '▴' : '▾'}</button><span class="text-[11px] text-slate-500">Abspielen und Zeitpunkt wählen</span></div>
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
      <div class="mt-5 flex flex-wrap items-center gap-2"><h3 class="font-display text-base text-gold-300 mr-2">📍 <span>Zonen</span></h3><span class="text-[11px] text-slate-500">Klick = nur diesen Bereich zeigen</span></div>
      <div class="flex flex-wrap gap-1.5 mt-2">${[{ b: '', kp: S.zbList.reduce((a, x) => a + x.kp, 0), n: S.zbList.reduce((a, x) => a + x.n, 0) }, ...S.zbList].map(x => `<button type="button" data-hmzb="${esc(x.b)}" aria-pressed="${(h.zb || '') === x.b}" class="seg-btn rounded-xl px-3 py-2 text-left"><div class="text-sm font-bold" translate="no">${x.b ? esc(x.b) : '🗺️ <span>Alle</span>'}</div><div class="text-xs tabular-nums text-gold-300">${pvp ? '🏆 ' + short(x.kp) : (h.src === 'barb' ? '🪓 ' : '👹 ') + fmt(x.n)}</div></button>`).join('')}</div>
      <div class="grid md:grid-cols-2 gap-2 mt-2">${marchCards || '<div class="text-sm text-slate-500 p-2">Keine Kämpfe im Filter.</div>'}</div>
      ${hmSpect() ? '' : hmFieldHtml(st, h, m)}${hmFlagsHtml(st, h, S)}${tcHtml}
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
  var hmHeatC = { sig: '', c: null };
  function hmHeat(S) {
    if (hmLast && hmLast.S === S && hmLast.heat) return hmLast.heat;
    const { h, dotsM } = S, mine = dotsM.filter(p => p.mine && (h.src !== 'all' || p.k === 'pvp')), N = 300, grid = new Float32Array(N * N);
    const hsig = [h.src, h.rad, mine.length, mine[0]?.t, mine[mine.length - 1]?.t, mine.reduce((a, p) => a + p.u + p.v, 0).toFixed(4)].join('|'); if (hmHeatC.sig === hsig) return hmHeatC.c;
    mine.forEach(p => { const gx = Math.floor(p.u * N), gy = Math.floor(p.v * N); if (gx >= 0 && gy >= 0 && gx < N && gy < N) grid[gy * N + gx] += h.src === 'pvp' ? Math.max(1, (p.kp ?? hmKP(p.r)) / 1e4) : 1; });
    const sig = h.rad * 1.2, Rr = Math.ceil(sig * 3), ker = []; for (let i = -Rr; i <= Rr; i++) ker.push(Math.exp(-(i * i) / (2 * sig * sig)));
    const tmp = new Float32Array(N * N), out = new Float32Array(N * N); let max = 0;
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) { let a = 0; for (let k = -Rr; k <= Rr; k++) { const xx = x + k; if (xx >= 0 && xx < N) a += grid[y * N + xx] * ker[k + Rr]; } tmp[y * N + x] = a; }
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) { let a = 0; for (let k = -Rr; k <= Rr; k++) { const yy = y + k; if (yy >= 0 && yy < N) a += tmp[yy * N + x] * ker[k + Rr]; } out[y * N + x] = a; if (a > max) max = a; }
    if (!max) { hmHeatC = { sig: hsig, c: null }; return null; }
    const pal = h.src === 'barb' ? [[0, [147, 197, 253]], [.5, [59, 130, 246]], [1, [30, 64, 175]]] : h.src === 'fort' ? [[0, [233, 213, 255]], [.5, [168, 85, 247]], [1, [107, 33, 168]]] : [[0, [253, 224, 71]], [.35, [251, 146, 60]], [.7, [239, 68, 68]], [1, [185, 28, 28]]];
    const img = new ImageData(N, N);
    for (let i = 0; i < N * N; i++) { const t = Math.pow(out[i] / max, .45); if (t < .05) continue; let j = 1; while (j < pal.length - 1 && t > pal[j][0]) j++;
      const [a0, c0] = pal[j - 1], [a1, c1] = pal[j], f = Math.min(1, Math.max(0, (t - a0) / (a1 - a0)));
      img.data[i * 4] = c0[0] + (c1[0] - c0[0]) * f; img.data[i * 4 + 1] = c0[1] + (c1[1] - c0[1]) * f; img.data[i * 4 + 2] = c0[2] + (c1[2] - c0[2]) * f; img.data[i * 4 + 3] = Math.min(215, t * 260); }
    const off = document.createElement('canvas'); off.width = off.height = N; off.getContext('2d').putImageData(img, 0, 0); hmHeatC = { sig: hsig, c: off }; return off;
  }
  function hmMask(h, m) { if (h.iso == null) return null; const key = m.k + ':' + h.iso; if (hmMaskC && hmMaskC.key === key) return hmMaskC.c;
    const d = m.zones, c = document.createElement('canvas'); c.width = c.height = d.w; const g = c.getContext('2d'), im = g.createImageData(d.w, d.w);
    for (let i = 0; i < d.w * d.w; i++) if (d.d.charCodeAt(i) - 97 !== h.iso) { im.data[i * 4] = 7; im.data[i * 4 + 1] = 9; im.data[i * 4 + 2] = 15; im.data[i * 4 + 3] = 242; }
    g.putImageData(im, 0, 0); hmMaskC = { key, c }; return c; }
  // Punkte + Städte: scharf, in Bildschirm-Auflösung (nicht mitvergrößert)
  var hmTpPts = [];
  function hmPaintDots(ctx, W, S, map) {   // map(u, v) → [x, y] in Pixeln
    const { h, m, dotsM: dots } = S, col = HM_SRC.find(x => x[0] === h.src)[2], dpr = W / 1000 * 1.6;
    if (h.cpath) {   // Stadt-Weg: jede neue Stadt-Position (Teleport) als Station
      const pts = [], own = (S.allA || S.all || []).filter(p => p.mine && p.r.city_x != null && hmIn(p.r.city_x, p.r.city_y, p.r.map_role)).sort((a, b) => a.t - b.t);
      const tpMin = (+h.tpMin || 10) * 6, hid = new Set(h.tpHide || []);   // TP erst ab x Feldern · von Hand ausgeblendete Stationen
      own.forEach(p => { const l = pts[pts.length - 1], k = Math.round(+p.r.city_x / 6) + ':' + Math.round(+p.r.city_y / 6); if (hid.has(k)) return; if (!l || Math.hypot(+p.r.city_x - l.x, +p.r.city_y - l.y) > tpMin) pts.push({ x: +p.r.city_x, y: +p.r.city_y, t: p.t, k }); });
      hmTpPts = pts.map(q => { const [u, v] = hmXY(q.x, q.y, h, m); return { ...q, u, v }; });
      if (pts.length > 1) { ctx.save(); if (h.tpLines !== false) { ctx.setLineDash([6 * dpr, 4 * dpr]); ctx.lineWidth = 2 * dpr; ctx.strokeStyle = 'rgba(52,211,153,.85)'; ctx.beginPath();
        pts.forEach((q, i) => { const [u, v] = hmXY(q.x, q.y, h, m), [x, y] = map(u, v); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }); ctx.stroke(); ctx.setLineDash([]); }
        ctx.font = `bold ${Math.round(9 * dpr)}px system-ui,sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        pts.forEach((q, i) => { const [u, v] = hmXY(q.x, q.y, h, m), [x, y] = map(u, v); ctx.beginPath(); ctx.arc(x, y, 7 * dpr, 0, 7); ctx.fillStyle = '#064e3b'; ctx.fill(); ctx.lineWidth = 1.5 * dpr; ctx.strokeStyle = '#34d399'; ctx.stroke(); ctx.fillStyle = '#d1fae5'; ctx.fillText(String(i + 1), x, y + .5); });
        ctx.restore(); }
    }
    const dot = (c, color, r) => { if (!c) return; const [u, v] = hmXY(+c.city_x, +c.city_y, h, m), [x, y] = map(u, v); ctx.beginPath(); ctx.arc(x, y, (r + 5) * dpr, 0, 7); ctx.fillStyle = color + '44'; ctx.fill();
      ctx.beginPath(); ctx.arc(x, y, r * dpr, 0, 7); ctx.fillStyle = color; ctx.fill(); ctx.lineWidth = 2 * dpr; ctx.strokeStyle = '#052e16'; ctx.stroke(); };
    if (h.flags && kbFlags.ev) { const FM = hmFlagModel(h), t = S.cur ?? Math.min(Date.now(), S.t1 || Date.now());   // 🚩 eigene Flaggen + Gebiet, zerstörte als ✕
      ctx.save(); FM.activeAt(t).forEach(o => { const d = FM.half(o), [u1, v1] = hmXY(o.x - d, o.y + d, h, m), [u2, v2] = hmXY(o.x + d, o.y - d, h, m), [x1, y1] = map(u1, v1), [x2, y2] = map(u2, v2);
          ctx.fillStyle = 'rgba(59,130,246,.22)'; ctx.fillRect(x1, y1, x2 - x1, y2 - y1); ctx.strokeStyle = 'rgba(147,197,253,.9)'; ctx.lineWidth = 1.5 * dpr; ctx.strokeRect(x1, y1, x2 - x1, y2 - y1);
          const [u, v] = hmXY(o.x, o.y, h, m), [x, y] = map(u, v); ctx.fillStyle = o.bt === 'fort' ? '#1d4ed8' : '#3b82f6'; ctx.fillRect(x - 4 * dpr, y - 4 * dpr, 8 * dpr, 8 * dpr); ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5 * dpr; ctx.strokeRect(x - 4 * dpr, y - 4 * dpr, 8 * dpr, 8 * dpr); });
        FM.L.filter(o => o.end === 'lost' && o.b <= t && o.b >= (S.t0 || 0)).forEach(o => { const [u, v] = hmXY(o.x, o.y, h, m), [x, y] = map(u, v), q = 4 * dpr; ctx.strokeStyle = '#ef4444'; ctx.lineWidth = 2 * dpr; ctx.beginPath(); ctx.moveTo(x - q, y - q); ctx.lineTo(x + q, y + q); ctx.moveTo(x + q, y - q); ctx.lineTo(x - q, y + q); ctx.stroke(); });
      ctx.restore(); }
    if (h.gflags !== false) {   // 🚩 Garnisonen: blau = deine (Flagge/Pass verteidigt), rot = gegnerische, die du angegriffen hast
      const F = new Map(); (S.allA || S.all || []).forEach(p => { if (!p.mine) return; const r = p.r, sg = /"ct":(5|7)[,}]/.exec(r.self_gear || ''), eg = /"ct":(5|7)[,}]/.exec(r.enemy_gear || ''); if (!sg && !eg) return;
        const k = Math.round(p.u * 400) + ',' + Math.round(p.v * 400) + (sg ? 'b' : 'r'); const o = F.get(k); if (o) o.n++; else F.set(k, { u: p.u, v: p.v, own: !!sg, pass: (sg || eg)[1] === '5', n: 1 }); });
      ctx.save(); F.forEach(f => { const [x, y] = map(f.u, f.v), sz = (f.pass ? 8 : 6.5) * dpr, c = f.own ? '#3b82f6' : '#ef4444';
        ctx.strokeStyle = '#0b0f17'; ctx.lineWidth = 3 * dpr; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y - sz * 1.9); ctx.stroke(); ctx.strokeStyle = '#e5e7eb'; ctx.lineWidth = 1.2 * dpr; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y - sz * 1.9); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(x, y - sz * 1.9); ctx.lineTo(x + sz * 1.4, y - sz * 1.45); ctx.lineTo(x, y - sz); ctx.closePath(); ctx.fillStyle = c; ctx.fill(); ctx.lineWidth = 1 * dpr; ctx.strokeStyle = '#0b0f17'; ctx.stroke(); }); ctx.restore(); }
    if (h.src === 'barb' || h.src === 'fort') { dot(hmCity(), '#22c55e', 6); if (h.fr && hmMates) hmMates.forEach((f, i) => dot(hmCity(f.gid), HM_COL[i % HM_COL.length], 4.5)); }
    (S.live || []).forEach(({ p }) => { if (p.r.city_x != null && hmIn(p.r.city_x, p.r.city_y, p.r.map_role)) dot(p.r, p.mine ? '#22c55e' : HM_COL[p.fi % HM_COL.length], p.mine ? 6 : 4.5); });   // Stadt zuerst zeichnen – Kämpfe direkt an der Stadt liegen darüber und bleiben sichtbar
    const selZ = h.pop, seen = new Set(), G = new Map(), kc = {};   // schnell: Punkte am selben Pixel nur einmal, gleiche Farbe in einem Rutsch zeichnen
    const clu = h.src !== 'rally' && dots.length > 1500, cell = (dots.length > 6000 ? 9 : 6) * dpr, CL = clu ? new Map() : null;   // viele Punkte → nahe Kämpfe zu einem Punkt bündeln (Größe = Anzahl)
    for (let i = dots.length - 1; i >= 0; i--) { const p = dots[i], [x, y] = map(p.u, p.v); if (x < -10 || y < -10 || x > W + 10 || y > W + 10) continue; const fresh = S.cur != null && S.cur - p.t < 5 * 6e4;
      if (clu && !fresh) { const ck = Math.floor(x / cell) + ',' + Math.floor(y / cell) + (p.mine ? 'm' : 'o') + (selZ != null && p.k === 'pvp' && p.z !== selZ ? 'x' : ''), c = CL.get(ck); if (c) { c.n++; c.x += x; c.y += y; } else CL.set(ck, { n: 1, x, y, p }); continue; }
      if (h.src === 'rally') { ctx.font = `${Math.round(13 * dpr)}px system-ui,"Segoe UI Emoji",sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(p.city ? '🏯' : p.joined ? '🛡️' : '🚩', x, y); continue; }   // Rally/Garnison als Symbol
      const other = selZ != null && p.k === 'pvp' && p.z !== selZ;   // Zone ausgewählt → andere Kampfpunkte orange
      const fill = other ? '#f97316' : p.mine ? (kc[p.k] = kc[p.k] || HM_SRC.find(x => x[0] === p.k)?.[2] || col) : HM_COL[p.fi % HM_COL.length], key = Math.round(x * 2) + ',' + Math.round(y * 2) + fill;
      if (!fresh) { if (seen.has(key)) continue; seen.add(key); }
      const r = (p.mine ? 3.2 : 2.8) * dpr, gk = fill + '|' + (fresh ? 1 : 0) + '|' + r; let g = G.get(gk); if (!g) G.set(gk, g = { fill, fresh, path: new Path2D() });
      g.path.moveTo(x + r, y); g.path.arc(x, y, r, 0, 7); }
    if (CL) CL.forEach(c => { const p = c.p, x = c.x / c.n, y = c.y / c.n, other = selZ != null && p.k === 'pvp' && p.z !== selZ, fill = other ? '#f97316' : p.mine ? (kc[p.k] = kc[p.k] || HM_SRC.find(z => z[0] === p.k)?.[2] || col) : HM_COL[p.fi % HM_COL.length];
      const r = Math.min(10, (p.mine ? 3 : 2.6) + Math.sqrt(c.n - 1) * .55) * dpr, gk = fill + '|0|' + r.toFixed(1); let g = G.get(gk); if (!g) G.set(gk, g = { fill, fresh: false, path: new Path2D() }); g.path.moveTo(x + r, y); g.path.arc(x, y, r, 0, 7); });
    [...G.values()].sort((a, b) => a.fresh - b.fresh).forEach(g => { ctx.fillStyle = g.fill; ctx.fill(g.path); ctx.lineWidth = (g.fresh ? 2 : 1) * dpr; ctx.strokeStyle = g.fresh ? '#fde047' : 'rgba(0,0,0,.7)'; ctx.stroke(g.path); });
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
      const ctx = dc.getContext('2d'); ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, W, W); try { hmPaintDots(ctx, W, hmLast.S, map); } catch (e) { console.error(e); const b = $('hmBox'); if (b && !b.querySelector('#hmErr')) { const x = document.createElement('div'); x.id = 'hmErr'; x.className = 'absolute bottom-2 left-2 z-50 max-w-[90%] rounded-lg bg-red-900/90 border border-red-400 px-2 py-1 text-[11px] text-red-100'; x.textContent = '⚠️ Punkte: ' + (e?.message || e); b.appendChild(x); } } }
  }
  function hmZoomTo(u0, v0, u1, v1) { const box = $('hmBox'); if (!box) return; const W = box.clientWidth, span = Math.max(.04, u1 - u0, v1 - v0) * 1.3;
    hmView.s = Math.min(10, Math.max(1, 1 / span)); hmView.x = -((u0 + u1) / 2 * hmView.s - .5) * W; hmView.y = -((v0 + v1) / 2 * hmView.s - .5) * W; hmApplyView(); }
  function hmZoneBox(m, z) { const d = m.zones, W = d.w; let x0 = 1, y0 = 1, x1 = 0, y1 = 0;
    for (let i = 0; i < d.d.length; i++) if (d.d.charCodeAt(i) - 97 === z) { const x = (i % W) / W, y = Math.floor(i / W) / W; x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x + 1 / W); y1 = Math.max(y1, y + 1 / W); }
    return [x0, y0, x1, y1]; }
  function hmDraw(st, S) {   // Fehler beim Zeichnen sichtbar machen statt leerer Karte
    try { hmDraw0(st, S); } catch (e) { console.error(e); const b = $('hmBox'); if (b) { let x = b.querySelector('#hmErr'); if (!x) { x = document.createElement('div'); x.id = 'hmErr'; x.className = 'absolute bottom-2 left-2 z-50 max-w-[90%] rounded-lg bg-red-900/90 border border-red-400 px-2 py-1 text-[11px] text-red-100'; b.appendChild(x); } x.textContent = '⚠️ Karte: ' + (e?.message || e) + ' · ' + String(e?.stack || '').split('\n')[1]?.trim(); } }
  }
  function hmDraw0(st, S) {
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
  function hmIso(st, z) { const h = hmCfg(st), m = hmMap(h); h.iso = h.iso === z || z == null || isNaN(z) ? null : z; if (h.iso != null) h.zb = ''; h.tl = null; savePassive(); renderKampf();
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
    el.querySelectorAll('[data-hmdgrp]').forEach(b => b.onclick = () => { const n = b.dataset.hmdgrp; if (h.t === 'kvk' && !h.fight && h.zb === n) h.zb = ''; else { h.t = 'kvk'; h.zb = n; h.iso = null; } h.tl = null; h.fight = null; h.pop = null; re(); });   // Gruppen-Name (z. B. Pass 7) = ganzes KvK, nur diese Zone
    el.querySelectorAll('[data-hmclr]').forEach(b => b.onclick = () => { const k = b.dataset.hmclr, all = k === 'all';
      if (all || k === 'fight') h.fight = null; if (all || k === 't') { h.t = 'kvk'; h.day = null; } if (all || k === 'hour') { h.hf = ''; h.ht = ''; }
      if (all || k === 'zb') h.zb = ''; if (all || k === 'iso') h.iso = null; if (all || k === 'march') h.march = ''; h.tl = null; h.pop = null; if (hmPlay) { clearInterval(hmPlay); hmPlay = null; } re(); });
    el.querySelectorAll('[data-hmzb]').forEach(b => b.onclick = () => { h.zb = b.dataset.hmzb || ''; h.iso = null; h.pop = null; h.tl = null; re(); });
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
    el.querySelectorAll('[data-hmfrel]').forEach(b => b.onclick = (e) => { e.preventDefault(); kbField.t = 0; kbFieldLoad(kbField.key ? kbField.key.split(',') : [], true, h.fw); });
    el.querySelectorAll('[data-hmflags]').forEach(d => d.ontoggle = () => { if (!!h.flOpen !== d.open) { h.flOpen = d.open; savePassive(); renderKampf(); } });
    el.querySelector('[data-hmflagsx]')?.addEventListener('change', (ev) => { h.flags = ev.target.checked; re(); });
    el.querySelector('[data-hmflr]')?.addEventListener('change', (ev) => { h.flR = +ev.target.value; re(); });
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
    el.querySelector('[data-hmcpath]')?.addEventListener('change', (ev) => { h.cpath = ev.target.checked; savePassive(); renderKampf(); });
    el.querySelector('[data-hmgfl]')?.addEventListener('change', (ev) => { h.gflags = ev.target.checked; savePassive(); hmDraw(st); });
    el.querySelector('[data-hmtpl]')?.addEventListener('change', (ev) => { h.tpLines = ev.target.checked; savePassive(); hmDraw(st); });
    el.querySelector('[data-hmtpmin]')?.addEventListener('change', (ev) => { h.tpMin = +ev.target.value; savePassive(); hmDraw(st); });
    el.querySelector('[data-hmtpreset]')?.addEventListener('click', () => { h.tpHide = []; savePassive(); renderKampf(); });
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
    el.querySelectorAll('[data-hmzsel]').forEach(x => x.addEventListener('change', (ev) => { const v = ev.target.value; if (v.startsWith('b:')) { h.zb = v.slice(2); h.iso = null; h.tl = null; h.pop = null; re(); } else { h.zb = ''; hmIso(st, v === '' ? null : +v); } }));   // ein Zonen-Filter: Bereich ODER einzelne Zone
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
        hmCalMode = false; re(); }
      else if (d && !d.moved && h.cpath && hmTpPts.length) { const bb = box.getBoundingClientRect(), u = (ev.clientX - bb.left - hmView.x) / (bb.width * hmView.s), v = (ev.clientY - bb.top - hmView.y) / (bb.height * hmView.s);   // TP-Station antippen → ausblenden
        const q = hmTpPts.map((p, i) => ({ p, i, d: Math.hypot(p.u - u, p.v - v) })).sort((a, b) => a.d - b.d)[0];
        if (q && q.d < .012 / hmView.s && confirm(`Teleport ${q.i + 1} (${q.p.k}) ausblenden?`)) { h.tpHide = [...new Set([...(h.tpHide || []), q.p.k])]; savePassive(); renderKampf(); } } });
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
