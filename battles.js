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
  const CLOUD_KEYS = ['rsNames', 'rsGroups', 'rsGroupNames', 'linkIds', 'rsKvk'];
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

  var kbRows = null, kbErr = '', kbLoading = false, kbProg = 0, kbShow = 50, kbNpcCols = true, kbPosCols = true, kbAccCols = true;
  function kbSel() { return KB_COLS + (kbNpcCols ? ',npc_btype,npc_level,group_size' : '') + (kbPosCols ? ',pos_x,pos_y,city_x,city_y,map_role,room_id' : '') + (kbPosCols && kbAccCols ? ',acclaim' : ''); }
  var KB_COLS = 'mail_id,opponent_id,account,player_id,battle_start,battle_end,is_pvp,self_name,self_alliance,self_hero1,self_hero2,self_troops_start,self_wounded,self_severe,self_dead,self_healing,self_power_lost,enemy_name,enemy_alliance,enemy_hero1,enemy_hero2,enemy_troops_start,enemy_wounded,enemy_severe,enemy_dead,enemy_power_lost,kill_points,server_id';
  async function loadBattles(force) {
    if (kbLoading || (kbRows && !force)) return; kbLoading = true; kbProg = 0; kbErr = '';
    try { const db = RokAuth.db?.(); if (!db) throw new Error('offline');
      const all = [];
      for (let from = 0; from < 100000; from += 1000) {
        let q = await db.from('rok_battles').select(kbSel()).order('battle_start', { ascending: false }).order('mail_id').order('opponent_id').range(from, from + 999);
        if (q.error && kbAccCols && /acclaim/i.test(q.error.message || '')) { kbAccCols = false; from -= 1000; continue; }   // SQL v11 (Verdienst) noch nicht ausgeführt
        if (q.error && kbPosCols && /pos_|city_|map_role|room_id/i.test(q.error.message || '')) { kbPosCols = false; from -= 1000; continue; }   // SQL v9 (Heatmap) noch nicht ausgeführt
        if (q.error && kbNpcCols && /npc_|group_size|column/i.test(q.error.message || '')) { kbNpcCols = false; from -= 1000; continue; }   // SQL v4 noch nicht ausgeführt
        const { data, error } = q;
        if (error) throw error; all.push(...(data || [])); kbProg = all.length;
        if (R.view === 'battles' && $('kbProg')) $('kbProg').textContent = fmt(kbProg);
        if (!data || data.length < 1000) break;
      }
      kbRows = all;
    } catch (e) { kbRows = kbRows || []; kbErr = /rok_battles|relation|schema cache/i.test(e?.message || '') ? 'missing' : (e?.message || String(e)); }
    kbLoading = false; if (R.view === 'battles') renderKampf();
  }
  // Live: nur Kämpfe nachladen, die neuer sind als der neueste geladene
  async function kbLoadNew() {
    if (kbLoading || !kbRows) return 0;
    try { const db = RokAuth.db?.(); if (!db) return 0; const newest = kbRows.reduce((m, r) => (r.battle_start || '') > m ? r.battle_start : m, '');
      const q = await db.from('rok_battles').select(kbSel()).gte('battle_start', newest || '2000-01-01').order('battle_start', { ascending: false }).limit(2000); if (q.error) return 0;
      const have = new Set(kbRows.map(r => r.mail_id + '|' + r.opponent_id)), add = (q.data || []).filter(r => !have.has(r.mail_id + '|' + r.opponent_id));
      if (add.length) kbRows = add.concat(kbRows).sort((a, b) => (b.battle_start || '').localeCompare(a.battle_start || ''));
      return add.length; } catch { return 0; }
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
  function kbMyIds() { const s = new Set((kbSt().linkIds || []).map(String)); const p = kbProfileId(); if (p) s.add(p); return s; }
  function kbMine(pid) { const s = kbMyIds(); return !s.size || s.has(String(pid)); }
  function kxRallyRows(pvp) {
    const st = kbSt();
    return (kxRally || []).filter(r => kbMine(r.player_id) && (!st.acc || String(r.player_id) === st.acc) && kxInRange(r.battle_start) && (pvp ? !!r.is_pvp : !r.is_pvp))
      .map(r => ({ mail_id: r.mail_id, opponent_id: 'rally', battle_start: r.battle_start, player_id: r.player_id, npc_btype: r.npc_btype, npc_level: r.npc_level, group_size: Math.max(2, +r.members || 2), is_pvp: !!r.is_pvp, joined: true }));
  }
  function kbIsAoo(r) { const g = +r.server_id; return g > 0 && g < 10000; }   // Ark of Osiris: eigener Schlachtfeld-Server (z. B. 3443), Königreich/KvK = 5-stellig (16144 …)
  function kbIsPvp(r) { return !!r.is_pvp && kbN(r.kill_points) > 0; }   // PvP = nur Kämpfe gegen Spieler, die Kill Points gebracht haben
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
  function renderKampf() {
    const el = $('battlesView'); if (!el) return;
    const wip = `<div class="text-center"><span class="inline-flex items-center gap-2 rounded-full border border-amber-500/50 bg-amber-500/10 px-4 py-1.5 font-display text-sm sm:text-base tracking-widest uppercase text-amber-300">🚧 <span>In Work</span> 🚧</span></div>`;
    if (!kbRows && !kbLoading) loadBattles();
    kbCharts.forEach(c => { try { c.destroy(); } catch {} }); kbCharts = [];
    const st = kbSt(); let tab = st.tab || 'march'; let cards = (st.cards = st.cards || { kp: true, eLoss: true, sDead: true, sSev: true });
    const segBtn = (attr, k, l, on, cls) => `<button type="button" ${attr}="${k}" aria-pressed="${on}" class="seg-btn rounded-lg ${cls || 'px-2 py-1'} text-xs font-semibold transition">${l}</button>`;
    const inp = 'bg-ink-950 border border-ink-600 rounded-lg px-2 py-1 text-xs focus:outline-none focus:border-gold-500';
    const head = (txt) => `<section id="kampfBox" class="panel rounded-2xl p-5"><h2 class="font-display text-lg text-gold-300">${(kbSt().page || 'battles') === 'loot' ? '🎁 Loot' : '⚔️ Battles'}</h2>
      <p class="text-xs text-slate-400 mb-3">Deine Kampfberichte aus dem Mailcache des Spiels – der Uploader auf deinem PC lädt sie automatisch hoch. Nur Berichte, die noch im Postfach sind, kommen an.</p>${txt}`;
    let msg = '';
    if (kbLoading && !kbRows) msg = `<div class="py-8 text-center text-sm text-slate-400">Lade Kampfberichte … <span id="kbProg" class="tabular-nums">${fmt(kbProg)}</span></div>`;
    if (msg) { el.innerHTML = wip + head(msg + (!kbLoading ? '<button type="button" id="kbReload" class="mt-2 px-3 py-1 rounded-lg border border-ink-600 hover:border-gold-500/60 text-xs">↻ Neu laden</button>' : '')) + '</section>'; kbBind(el); return; }

    // Ohne Daten sieht die Seite genauso aus – nur leer (für Spieler ohne Uploader)
    if (!kbRows) kbRows = [];
    const note = kbErr && kbErr !== 'missing' ? `<div class="mb-3 text-[11px] text-red-400">Laden hat nicht geklappt: ${esc(kbErr)}</div>`
      : !kbRows.length ? '<div class="mb-3 text-[11px] text-slate-500">Noch keine Kampfberichte – sie kommen automatisch, sobald der Kampf-Uploader auf dem PC läuft.</div>' : '';
    const accs = [...new Map(kbRows.filter(r => r.player_id != null && kbMine(r.player_id)).map(r => [String(r.player_id), `${r.self_name || 'Spieler'}${r.account ? ` (${r.account})` : ''}`])).entries()];
    const accsRes = [...new Map([...accs, ...(rsRows || []).filter(r => r.pid != null).map(r => [String(r.pid), rsNameOf(r.pid, r.acc)])]).entries()];   // + Farmen (nur Ressourcen)
    if (st.acc && !accsRes.some(([k]) => k === st.acc)) st.acc = '';
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
        ${(list || accs).length > 1 ? `<select data-kbacc class="${inp}"><option value="">Alle Accounts</option>${(list || accs).map(([k, l]) => `<option value="${esc(k)}" ${st.acc === k ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>` : ''}
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
    const subTabs = `<div class="grid grid-cols-2 sm:grid-cols-4 gap-3 max-w-3xl mx-auto mt-2" role="tablist">${[['battles', '⚔️', 'Battles', '#f43f5e'], ['heat', '🔥', 'Heatmap', '#fb923c'], ['loot', '🎁', 'Loot', '#f5c542'], ['res', '🌾', 'Ressourcen', '#34d399']].map(([k, i, l, c]) =>
        `<button type="button" class="hub-tile panel !min-h-[6.5rem] sm:!min-h-[8rem]" data-kbpage="${k}" role="tab" aria-pressed="${page === k}"><span class="w-11 h-11 sm:w-14 sm:h-14 rounded-2xl grid place-items-center text-2xl sm:text-3xl" style="background:linear-gradient(135deg,${c}33,${c}11);border:1px solid ${c}55">${i}</span><span class="font-display text-sm sm:text-lg text-white tracking-wide">${l}</span></button>`).join('')}</div>`;
    const pageHead = (icon, t, sub) => `<section class="panel rounded-2xl p-5"><h2 class="font-display text-lg text-gold-300">${icon} ${t}</h2><p class="text-xs text-slate-400 mb-3">${sub}</p>`;
    if (page === 'res') {
      if (!rsRows && !rsLoading) loadRes();
      el.innerHTML = wip + subTabs + rsHtml(timeRow('', accsRes));
      kbBind(el); rsDraw(); return;
    }
    if (page === 'heat') {
      const accSel = accs.length > 1 ? `<select data-kbacc class="${inp}"><option value="">Alle Accounts</option>${accs.map(([k, l]) => `<option value="${esc(k)}" ${st.acc === k ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>` : '';
      el.innerHTML = wip + subTabs + hmHtml(st, `<div class="flex flex-wrap items-center gap-2 mb-2">${marchSel}${accSel}<button type="button" id="kbReload" class="ml-auto px-3 py-1 rounded-lg border border-ink-600 hover:border-gold-500/60 text-xs">${kbLoading ? 'Lädt …' : '↻ Neu laden'}</button></div>`);
      kbBind(el); hmBind(el, st); hmDraw(st); return;
    }
    const last = kbRows[0]?.battle_start ? new Date(kbRows[0].battle_start) : null;
    const nJoin = new Set((pvp ? rallyPvp : rallyPve).map(r => r.mail_id)).size;
    const pidP = kbProfileId(), links = (st.linkIds || []).map(String), names = new Map(kbRows.map(r => [String(r.player_id), r.self_name]));
    const idChip = (id, own) => `<span class="inline-flex items-center gap-1 rounded-lg border ${own ? 'border-gold-500/60 bg-gold-500/10 text-gold-200' : 'border-ink-600 text-slate-300'} px-2 py-0.5" translate="no">${own ? '👤' : '🔗'} ${esc(names.get(id) || '')} <span class="tabular-nums text-slate-400">${esc(id)}</span>${own ? ' <span class="text-[10px] text-slate-500">Profil</span>' : `<button type="button" data-kbunlink="${esc(id)}" class="text-slate-500 hover:text-red-300" title="Verknüpfung lösen">✕</button>`}</span>`;
    const idBar = `<div class="flex flex-wrap items-center gap-1.5 mb-2 text-[11px]"><span class="text-slate-500">🆔 <span>Angezeigt für</span>:</span>
        ${pidP ? idChip(pidP, true) : '<span class="text-amber-300">Keine Governor-ID im Profil – es werden alle hochgeladenen Accounts gezeigt.</span>'}${links.filter(x => x !== pidP).map(x => idChip(x, false)).join('')}
        <input data-kblinkid inputmode="numeric" placeholder="+ ID verknüpfen" maxlength="12" class="bg-ink-950 border border-ink-600 rounded-lg px-2 py-0.5 text-[11px] w-32 text-slate-100 focus:outline-none focus:border-gold-500"></div>`;
    const info = note + idBar + `<div class="text-[11px] text-slate-500 mb-4">${nJoin ? `<span class="text-sky-300">🛡️ ${fmt(nJoin)}</span> <span>${pvp ? 'Rally-/Garnisonskämpfe als Teilnehmer (unten)' : 'Rallys als Teilnehmer mitgezählt'}</span> · ` : ''}${fmt(kbRows.length)} Berichte geladen${last ? ` · letzter Kampf ${last.toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' })}` : ''} · im Filter: ${fmt(rows.length)}</div>`;
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
    rows.forEach(r => { const o = by[r.type] || (by[r.type] = { val: 0, n: 0, talent: 0 }); o.val += r.val; o.n++; o.talent += r.talent; });
    const types = Object.keys(by).map(Number).sort((a, b) => a - b), tot = rows.reduce((a, r) => a + r.val, 0), cry = rows.reduce((a, r) => a + r.crystal, 0);
    const tile = (icon, l, v, sub, c) => `<div class="rounded-xl border border-ink-700 bg-ink-950/70 p-4"><div class="flex items-center gap-2 text-xs text-slate-400"><span class="text-lg leading-none">${icon}</span><span>${l}</span></div><div class="font-display text-2xl tabular-nums" style="color:${c}">${short(v)}</div><div class="text-[11px] text-slate-500">${sub}</div></div>`;
    const shown = types.length ? types : [1, 2, 3, 4];
    const tiles = `<div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
        ${tile('📦', 'Gesamt', tot, `${fmt(rows.length)}× <span>gesammelt</span>`, '#ffffff')}
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
    const trip = new Map(); base.forEach(r => { const k = String(r.pid); const o = trip.get(k) || { n: 0, v: 0 }; o.n++; o.v += r.val; trip.set(k, o); });
    const perTrip = [...trip.values()].reduce((a, o) => a + o.v / o.n, 0), farms = trip.size, nowTrips = farms ? base.length / avgD / farms : 0;
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
    (rsRows || []).filter(r => kxInRange(r.t)).forEach(r => { const k = String(r.pid); const o = per.get(k) || { pid: k, acc: r.acc, n: 0, v: {}, tot: 0, last: 0 }; o.n++; o.v[r.type] = (o.v[r.type] || 0) + r.val; o.tot += r.val; o.last = Math.max(o.last, Date.parse(r.t || 0) || 0); per.set(k, o); });
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
      body += `<tr class="border-b border-ink-800/60 hover:bg-ink-800/40 ${st.acc === o.pid ? 'bg-gold-500/10' : ''}"><td class="py-1.5 px-2 whitespace-nowrap ${splitGroups ? 'pl-5' : ''}"><button type="button" data-kbaccpick="${esc(o.pid)}" title="Nur diesen Account zeigen" class="mr-1 text-slate-500 hover:text-gold-300">🔍</button>${nameCell}</td>
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
    const week = lbase.filter(r => now - new Date(r.t) <= 7 * DAY).sort((a, b) => new Date(a.t) - new Date(b.t));
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
    el.querySelectorAll('[data-kbdetail]').forEach(b => b.onclick = () => { const [m, o] = b.dataset.kbdetail.split('|'); kdOpen(m, o); });
  }

  // ================= Heatmap: wo du kämpfst (Testversion) =================
  // Kampfort aus dem Bericht (Attacks[].Pos) – unabhängig davon, wo deine Stadt gerade steht. Nur die KvK-Weltkarte (Role „gsmp“),
  // das KvK erkennt man an der Server-Nummer im Bericht (z. B. 16144 → „C16144“). Bericht rechnet ~6 Einheiten pro Feld, X0/Y0 unten links.
  var HM_MAPS = [{ k: 'heroic_anthem', n: 'Heroic Anthem', lay: 'lk1', img: 'icons/map_heroic_anthem.jpg', size: 1200, unit: 6, pad: 1.1, zones: {"w":240,"r":"a87b72c81a87b72c81a87b72c81a87b72c81a87b72c81a87b72c81a87b72c81a87b72c81a87b72c81a87b72c81a87b72c81a87b72c81a87b72c81a87b72c81a90b1a2b60c3b3c81a93b60c87a93b60c87a93b60c87a93b60c87a93b60c87a93b60c87a93b60c87a93b60c87a93b60c87a93b60c87a93b60c87a96b57c87a99b50c91a99b48c93a99b48c93a99b48c93a99b48c93a101b46c93a103b4a4b36c93a111b36c93a111b36c93a111b36c93a111b36c93a111b36c93a111b14d22c93a111b12d24c93a111b12d24c93a111b12d24c93a111b12d24c93a111b12d24c93a101e10b2e2b2d30c93a99e18d30c93a99e18d30c93a99e18d30c93a99e18d30c93a99e18d33c90a70e3a4e40d36c87a69e6a1e41d36c87a69e48d36c87a69e48d36c87a69e48d36c87a69e50d34c87a65e2a2e54d30c87a63e60d30c87a63e60d30c87a63e60d30c87a63e60d30c87a63e60d33c6d3c75a63e60d42c75a63e60d42c75a63e60d42c75a63e60d42c75a63e60d42c75a63e60d44c73a63e60d54c63a63e60d54c63a63e60d54c63a63e60d54c63a63e60d54c63a57e3a3e54f3e3d54c63a57e60f6d2f4d48c49g14a57e60f12d48c48g15a57e60f12d48c48g15a57e60f12d48c48g15a57e60f12d48c48g15a57e60f12d48c48g15h21a36e60f12d48c48g15h21a36e60f12d48c48g15h21a36e60f12d48c48g15h21a36e60f12d48c48g15h21a36e60f13d47c48g15h24a18h3a12e60f12d50c46g15h45a12e49i3e4i4f2i10d52c4d4c20g31h45a12e48i6e1i17d54c1d5c18g33h45a12e48i24d60c18g33h45a12e48i24d60c18g33h45a13e47i24d60c18g33h47a10e48i24d60c12g3c3g33h57e44i2e2i25d1i4d54c12g39h57e42i36d54c12g39h57e42i36d54c12g39h57e42i36d54c12g39h57e42i36d54c12g39h57e42i39d1i2d51c9g39h57e37i47d52c2g45h57e36i48d54g45h57e36i48d54g45h57e36i48d54g45h57e37i47d54g45h57e24j3e9i48d12k3d39g45h53l4e2l4e18j12i48d12k10d2m12d18g45h51l12e18j12i48d12k12m12d18g45h51l12e18j12i48d12k12m12d18g45h51l12e18j12i48d12k12m12d18g45h51l12e18j12i48d12k12m12d18g45h51l12e18j12i48d12k12m12d18g45h51l30j12i44k4d2k22m12k18g45h51l30j12i42k30m12k18g45h51l30j12i42k30m12k18g45h51l30j12i42k30m12k18g45h51l30j12i42k30m12k18g45h51l30j12i42k32m10k18g45h46l36j1l10i2l4i36k34m4k2m2k18g45h45l54i36k60g45h45l54i36k60g45h45l54i36k60g45h45l54i36k60g45h45l54i36k63g42h45l54i36k66g39h45l54i36k66g39h45l54i36k66g39h45l54i36k66g39h45l54i36k66g39h45l57i33k66g39h45l60i25k71g39h45l60i24k72g39h45l60i24k72g39h45l60i24k72g39h45l60i24k72g39h45l60i24k72g39h45l70i2k73g50h45l72k72g51h45l72k72g51h45l72k72g51h45l72k73g50h45l72k60n3k9g51h45l72k60n12g51h45l72k60n12g51h45l72k60n12g51h45l72k60n12g51h45l72k60n12g51h15o3h27l72k60n14g49h15o22h4o4l2o4l66k49n29g26n2g3n14h15o24h1o11l66k48n30g24n21h15o36l66k48n30g24n21h15o36l66k48n30g24n21h15o36l66k48n30g24n21h15o39l63k48n32g22n21o57l56p4k2p4k42n36g13n26o57l54p12k42n36g12n27o57l54p12k42n36g12n27o57l54p12k42n36g12n27o57l54p12k42n36g12n27o57l54p12k42n39g9n27o69l42p12k38n79o69l42p12k36n81o69l42p12k36n81o69l42p12k36n81o69l42p12k36n81o69l44p10k36n81o69l46p2k37n86o69l48k36n87o69l48k36n87o69l48k36n87o69l48k36n87o69l48k36n87o75l42k36n87o75l42k36n87o75l42k36n87o75l42k36n87o75l42k36n87o78l39k36n87o91l4o8l2q12k2q14k2n10k4n91o105q30n105o105q30n105o105q30n105o105q30n105o105q30n105o105q30n105o105q30n105o105q30n105o105q30n105o105q30n105o105q30n105o101q2o2q30n105o99q36n105o99q36n105o99q36n105o99q36n105o99q36n105o89q46n105o87q48n105o87q48n105o87q48n105o87q48n105o87q51n102o82q59n99o81q60n99o81q60n99o81q60n99o81q60n99o81q60n99o81q60n99o81q60n99o81q60n99o81q60n99o81q60n99o83q60n97o87q60n93o87q60n93o87q60n93o87q60n93o87q60n93o87q60n93o87q60n93o87q60n93o87q60n93o87q60n93o87q60n93o87q60n93o82q66n1q4n87o81q72n87o81q72n87o81q72n87o81q72n87o81q72n87o81q72n87o81q72n87o81q72n87o80q72n88o80q72n88o80q72n88o80q72n88o81q72n87o81q72n87","n":["Außen NW","Außen N","Außen NO","Innen NO","Innen NW","Altar N","Außen O","Außen W","Kingsland","Altar W","Innen SO","Innen SW","Altar O","Außen SO","Außen SW","Altar S","Außen S"],"c":[[0.1831,0.1632],[0.5136,0.0747],[0.8225,0.1737],[0.633,0.326],[0.3652,0.3191],[0.5111,0.3376],[0.9088,0.4937],[0.0978,0.4815],[0.4857,0.4611],[0.3618,0.4618],[0.6377,0.5833],[0.3364,0.5964],[0.7123,0.4626],[0.8036,0.813],[0.1756,0.8175],[0.4872,0.6628],[0.4808,0.8891]]} },
    { k: 'mighty_assembly', n: 'Mighty Assembly', lay: 'lk2', img: 'icons/map_mighty_assembly.jpg', size: 1200, unit: 6, pad: 1.1, zones: {"w":240,"r":"a69b106c65a69b106c65a69b107c64a69b107c64a69b108c63a69b108c63a69b108c63a69b108c63a69b108c63a69b108c63a69b108c63a69b108c63a69b108c63a69b108c63a69b108c63a69b108c63a69b108c63a69b108c63a69b108c63a69b108c63a69b108c63a69b108c63a69b108c63a69b108c63a69b108c63a69b108c63a69b108c63a69b108c63a69b108c63a69b108c63a69b108c63a69b108c63a69b108c63a69b108c63a69b108c63a69b108c63a69b108c63a69b108c63a69b108c63a69b108c63a69b108c63a69b108c63a69b108c63a69b108c63a69b108c63a74b37d11b49c4b2c63a75b36d12b48c69a75b36d12b48c69a75b36d12b48c69a75b36d12b48c69a75b35d13b48c69a75d22b4d38b3d29c69a75d24b1d71c69a75d96c69a75d96c69a75d96c69a75d96c69a75d96c69a75d96c69a75d96c69a75d96c69a75d96c69e6a69d96c24f2c43e13a4e20a4e5a24d101c24f10c4f20c4f7e15a1e23a1e6a23d102c24f12c1f23c1f8e45a24d102c24f45e45a24d102c24f45e45a24d102c24f45e45a4e2a18d102c24f45e51g4a4g10d96h10c4h4f11c1f45e51g18d96h18f57e51g18d96h18f57e51g18d96h18f57e51g18d97h17f57e51g18d4g2d91h17f57e51g24i12d66j5d1j6h18f57e51g24i12d66j12h18f57e51g24i12d66j12h18f57e51g24i12d66j12h18f57e51g24i12d66j12h18f57e51g24i12d66j12h18f57e51g24i12d66j12h18f57e51g24i12d66j12h18f57e51g24i12d66j12h18f57e51g24i12d66j12h18f57e51g24i12d66j12h18f57e51g25i11d66j12h19f56e51g41d60h37f51e51g41d60h37f51e51g42d60h36f51e51g42d60h36f51e51g42d60h36f51e51g42d57h39f51e47g46d54h48f45e45g48d54h48f45e45g48d54h48f45e45g48d54h48f45e45g48d54h48f45e45g48d54h48f45e45g48d54h48f45e45g48d54h48f45e45g48d54h48f45e45g49d53h48f45e45g49d53h48f45e45g49d53h48f45e45g60k11d2k11d1k11h54f45e45g60k36h54f45e45g60k36h54f45e45g60k36h54f45e45g60k36h54f45e46g59k36h54f45e50g55k36h49f50e50g55k36h48f51e51g54k36h48f51e51g54k36h48f51e51g54k36h48f51e51g54k36h48f51e51g54k36h48f51e51g54k36h48f51e51g54k36h48f51e51g54k36h48f51e51g54k36h49f50e51g54k36h49f50e51g54k36h53f46e51g54k36h53f46e51g54k36h54f45e51g54k36h54f45e51g54k36h54f45e51g54k36h54f45e51g54k36h54f45e51g54k36h54f45e51g54k36h54f45e51g54k36h54f45e51g54k36h54f45e51g54k36h54f45e45g60k36h54f45e45g60k36h54f45e45g60k36h54f45e45g60k36h54f45e45g60k36h54f45e45g60k36h54f45e45g48l24k1l11k1l11h54f45e45g48l48h54f45e45g48l48h54f45e45g48l48h54f45e46g47l48h54f45e46g47l48h54f45e51g42l48h59f40e51g42l48h59f40e51g42l48h60f39e51g42l48h60f39e51g42l48h60f39e51g42l48h60f39e51g30l10g2l49h1l16h42f39e51g30l78h42f39e51g30l78h42f39e51g30l78h42f39e51g31l77h42f39e51g31l77h42f39e51g19m11l78n11h31f39e51g18m12l78n11h31f39e51g18m12l78n12h30f39e51g18m12l78n12h30f39e51g18m12l78n12h30f39e51g18m12l78n12h30f39e51g18m12l78n12h12o4h4o10f39e51g18m12l78n12h12o18f39e51g18m12l78n12h12o18f39e51g18m12l78n12h12o18f39e51g18m12l78n12h12o18f39e51g10p2g6m10l80n5o2n5h12o18f39p7e4p20e3p17g2p2g3p5l102o6h3o27f39p63l102o36f39p63l102o36f39p63l102o36f39p63l102o36f39p63l102o36f39p63l102o40f4o20f4o1f6p63l102o75p63l102o75p63l102o75p63l102o75p63l102o75p63l106o71p63l108o69p63l108o69p63l108o69p63l108o69p63l108o69p63l30q4l4q28l14q2l4q4l18o69p63l30q36l12q12l18o69p63l30q36l12q12l18o69p63l30q36l12q12l18o69p63l30q36l12q12l18o69p63l30q36l12q12l18o69p62q115o63p62q115o63p63q114o63p63q114o63p63q114o63p63q114o63p62q115o63p63q114o63p63q114o63p63q114o63p63q114o63p64q113o63p75q102o63p75q102o63p75q102o63p75q102o63p75q102o63p75q100o65p75q96o69p75q96o69p75q96o69p75q96o69p75q96o69p75q96o69p75q96o69p75q96o69p75q96o69p75q96o69p75q96o69p63q3p8q97o69p63q114o63p63q114o63p63q114o63p63q114o63p63q114o63p63q114o63p63q114o63p63q114o63p63q114o63p62q115o63p62q115o63p61q116o63p61q116o63p61q116o63p61q116o63","n":["Ecke NW","Zone 5 N","Ecke NO","Innen N","Zone 5 W","Zone 5 O","Innen W","Innen O","Altar NW","Altar NO","Kingsland","Innen S","Altar SW","Altar SO","Ecke SO","Ecke SW","Zone 5 S"],"c":[[0.1498,0.1377],[0.5119,0.1036],[0.8607,0.1381],[0.5023,0.3081],[0.1019,0.489],[0.9015,0.4862],[0.2994,0.5009],[0.71,0.5128],[0.3376,0.3369],[0.6623,0.3376],[0.5121,0.5125],[0.4868,0.7106],[0.3122,0.6875],[0.6866,0.6871],[0.8542,0.8553],[0.1378,0.858],[0.5044,0.9003]]} }];
  HM_MAPS.forEach(m => { const z = m.zones; if (z.d) return; let d = ''; z.r.replace(/([a-z])(\d+)/g, (_, c, n) => { d += c.repeat(+n); return ''; }); z.d = d; });   // Zonen-Raster entpacken
  var HM_ICON = {"Julius Caesar":"caesar","Sun Tzu":"sun","Frederick I":"fred","Minamoto no Yoshitsune":"mina","Yi Seong-Gye":"ysg","Cao Cao":"cc","Richard I":"richard","El Cid":"cid","Hermann":"hermann","Kusunoki Masashige":"kuso","Scipio Africanus":"scipio","Eulji Mundeok":"eulji","Boudica":"boudica","Pelagius":"pelagius","Centurion":"centurion","Hannibal Barca":"barca","Cleopatra VII":"cleo","Constance":"constance","Gaius Marius":"gaius","Tomoe Gozen":"tomoe","Lancelot":"lancelot","Lohar":"lohar","Šárka":"sarka","Belisarius":"beli","Baibars":"baibars","Osman I":"osman","Saladin":"saladin","Mehmed II":"mehmed","Genghis Khan":"khan","Mulan":"mulan","Wu Zetian":"wu","Charlemagne":"charlemagne","Alexander the Great":"alex","Æthelflæd":"aethel","Tomyris":"tomy","Seondeok":"seondeok","Keira":"keira","Keira's Secondary Commander":"keira","Keira's Guard":"keira","Keira's Elite Guard":"keira","Attila":"attila","Takeda Shingen":"takeda","Ishida Mitsunari":"ishida","Theodora":"theo","Guan Yu":"guan","Leonidas I":"leo","Artemisia I":"art","Yi Sun-sin":"yss","Chandragupta Maurya":"chandra","William I":"william","Matilda of Flanders":"matilda","Zenobia":"zeno","Lu Bu":"lubu","Diaochan":"diaochan","Cyrus the Great":"cyrus","Nebuchadnezzar II":"nebu","Moctezuma I":"mocte","Trajan":"trajan","Jadwiga":"jad","Xiang Yu":"xy","Ragnar Lodbrok":"ragnar","Cheok Jun-gyeong":"cj","Gilgamesh":"gilga","Amanitore":"amani","Honda Tadakatsu":"honda","Bertrand du Guesclin":"bert","Alexander Nevsky":"nevsky","Flavius Aetius":"flav","Thutmose III":"thutmose","Imhotep":"imhotep","Henry V":"henry","Lohar's Guard":"lohar","Lohar's Elite Guard":"lohar","Jan Žižka":"jan","Tariq ibn Ziyad":"tariq","Babur":"babur","Heraclius":"hera","Dido":"dido","Zhuge Liang":"zl","Pyrrhus":"pyrrhus","Pericles":"pericles","Huo Qubing":"huo","Justinian I":"justinian","Liu Che":"liu","Ashurbanipal":"ash","Lapulapu":"lapu","Gorgo":"gorgo","Gonzalo de Córdoba":"gonzalo","Gajah Mada":"gajah","Eleanor of Aquitaine":"eleanor","William Wallace":"wallace","Shajar al-Durr":"shajar","Philip II":"philip","Stephen III":"stephen","John Hunyadi":"john","Narses":"narses","Subutai":"subutai","Arthur Pendragon":"arthur","Bai Qi":"bq","Tokugawa Ieyasu":"toku","Shapur I":"shapur","Qin Shi Huang":"qin","Archimedes":"archimedes","Achilles":"achilles","Hector":"hector","Casimir III":"casimir","David IV":"david","Gang Gamchan":"gamchan","Ivar":"ivar","Alp Arslan":"alp","Hayam Wuruk":"hayam","Vercingetorix":"verci","Elizabeth I":"elizabeth","William Marshal":"marshal","Charles Martel":"cm","Constantine the Great":"const","Joan of Arc":"joan","Pakal the Great":"pakal","Ramesses II":"ramesses","Sargon the Great":"sargon","Suleiman I":"suleiman","Edward of Woodstock":"edward","Harald Sigurdsson":"harald","Björn Ironside":"bjorn","Afonso I":"afonso","Pepin the Short":"pepin","Mary I":"mary","Matthias Corvinus":"matthias","Margaret I":"margaret","Tamar":"tamar","Catherine I":"catherine"};   // Kommandanten-Name (Bericht, englisch) → Bild in icons/comander
  var HM_SRC = [['pvp', '⚔️ Kämpfe', '#ef4444'], ['barb', '🪓 Barbaren', '#3b82f6'], ['fort', '🏰 Forts', '#a855f7']];
  var HM_T = [['kvk', '🏁 Ganzes KvK'], ['d1', '24 h'], ['d3', '3 Tage'], ['d7', '7 Tage'], ['custom', 'Zeitraum']];
  var HM_TRAIL = [[3600e3, '1 h'], [6 * 3600e3, '6 h'], [86400e3, '24 h'], [0, 'alles bis dahin']];
  var HM_COL = ['#22d3ee', '#f472b6', '#facc15', '#a3e635', '#fb923c', '#c084fc', '#2dd4bf', '#f87171', '#60a5fa', '#e879f9'];
  var hmMates = null, hmMatesLoading = false, hmPlay = null, hmView = { s: 1, x: 0, y: 0 }, hmCalMode = false, hmShare = null, hmShareCol = true, hmLiveT = null, hmMaskC = null, hmLast = null;
  function hmCfg(st) { const h = (st.heat = st.heat || {});
    if (h.v !== 3) { h.rot = 0; h.mir = false; h.zn2 = {}; h.v = 3; }   // neue Zonen (mit Altären) – alte Zonen-Namen passen nicht mehr
    if (!['pvp', 'barb', 'fort'].includes(h.src)) h.src = 'pvp';
    if (!h.map) h.map = hmCalc()?.layout === 'lk2' ? 'mighty_assembly' : 'heroic_anthem';
    h.t = h.t || 'kvk'; h.rad = +h.rad || 3; h.zn2 = h.zn2 || {}; h.fn = h.fn || {}; h.kv = h.kv || {}; h.speed = +h.speed || 4;
    if (h.zm == null) h.zm = true; if (h.fr == null) h.fr = false; if (h.trail == null) h.trail = 6 * 3600e3; if (h.pngMk == null) h.pngMk = true; return h; }
  function hmMap(h) { return HM_MAPS.find(m => m.k === h.map) || HM_MAPS[0]; }
  function hmCalc() { try { const s = window.KvKCalc?.getState?.(); return s ? { start: s.startDate || '', end: s.endDate || '', days: +s.mid?.days || 0, layout: s.mid?.layout || '', passAt: s.passAt || {} } : null; } catch { return null; } }
  // ---------- KvK (C-Nummer) ----------
  function hmKvks() {   // alle KvKs aus deinen Berichten (Weltkarte), neuestes zuerst
    const M = new Map(), pid = kbProfileId();
    (kbRows || []).forEach(r => { if (!kbMine(r.player_id) || r.map_role !== 'gsmp' || !(+r.server_id >= 10000)) return; const id = 'C' + r.server_id, o = M.get(id) || { id, n: 0, last: '', prof: false, pids: new Set() };
      o.n++; if ((r.battle_start || '') > o.last) o.last = r.battle_start || ''; if (pid && String(r.player_id) === pid) o.prof = true; o.pids.add(String(r.player_id)); M.set(id, o); });
    const list = [...M.values()].sort((a, b) => b.last.localeCompare(a.last)), firstProf = list.find(x => x.prof);
    list.forEach(x => { x.isProfile = x === firstProf; }); return list;
  }
  function hmKvkCur(h) { const L = hmKvks(); if (!L.some(x => x.id === h.kvkId)) h.kvkId = L[0]?.id || null; return L.find(x => x.id === h.kvkId) || null; }
  function hmKvkName(h, k) { return (k && h.kv[k.id]?.name) || (k ? k.id : 'KvK'); }
  function hmStart(h) { const k = hmKvkCur(h); return (k && h.kv[k.id]?.start) || ((!k || k.isProfile) ? hmCalc()?.start || '' : ''); }   // Profil-KvK → Start aus dem KvK-Rechner
  function hmEnd(h) { const s = hmStart(h), c = hmCalc(), k = hmKvkCur(h); if (!s) return null; const a = Date.parse(s + 'T00:00:00Z');
    if ((!k || k.isProfile) && c?.end && Date.parse(c.end + 'T00:00:00Z') > a) return Date.parse(c.end + 'T00:00:00Z'); return a + Math.max(1, (k?.isProfile && c?.days) || 60) * 864e5; }
  function hmUnit(h, ax) { const m = hmMap(h), v = ax === 'x' ? +h.ux : +h.uy; return v > 0 ? v : (m.unit || 1); }
  function hmTile(v, ax) { return v == null ? null : +v / hmUnit(hmCfg(kbSt()), ax || 'x'); }
  function hmIn(x, y, role) { const z = hmMap(hmCfg(kbSt())).size; if (role && role !== 'gsmp') return false; const a = hmTile(x, 'x'), b = hmTile(y, 'y'); return a != null && b != null && a >= 0 && b >= 0 && a <= z && b <= z; }
  function hmXY(x, y, h, m) { const u = x / hmUnit(h, 'x') / m.size, v = y / hmUnit(h, 'y') / m.size, p = (m.pad || 0) / 100; return [p + u * (1 - 2 * p), p + (1 - v) * (1 - 2 * p)]; }
  function hmZoneAt(u, v, m) { const z = m.zones, x = Math.floor(u * z.w), y = Math.floor(v * z.w); if (x < 0 || y < 0 || x >= z.w || y >= z.w) return -1; return z.d.charCodeAt(y * z.w + x) - 97; }
  function hmZName(h, m, z) { return (h.zn2[m.k] || {})[z] || m.zones.n[z] || '–'; }
  function hmKind(r) { if (r.is_pvp) return kbIsPvp(r) && !kbIsAoo(r) ? 'pvp' : null; const c = kbCatOf(r.npc_btype, r.group_size); return c === 'barb' ? 'barb' : c === 'fort' ? 'fort' : null; }
  function hmKP(r) { return +r.kill_points || +r.group_kill_points || 0; }
  // Lost-Kingdom-Kill-Punkte: T4 = 1, T5 = 5 je schwer verwundeter/getöteter Gegner-Einheit – aus Profil-KP (T4 = 10, T5 = 20) zurückgerechnet
  function hmLK(r) { const n = (+r.enemy_severe || 0) + (+r.enemy_dead || 0), kp = +r.kill_points || 0; if (!n) return 0; const t5 = Math.min(n, Math.max(0, (kp - 10 * n) / 10)); return Math.round((n - t5) + 5 * t5); }
  function hmSum(pts) { const o = { n: 0, kp: 0, lk: 0, dead: 0, sev: 0, eLoss: 0, acc: 0, heal: 0, first: null };
    pts.forEach(p => { const r = p.r; o.n++; o.kp += hmKP(r); o.lk += hmLK(r); o.dead += +r.self_dead || 0; o.sev += +r.self_severe || 0; o.eLoss += (+r.enemy_dead || 0) + (+r.enemy_severe || 0); o.acc += +r.acclaim || 0; o.heal += +r.self_healing || 0; if (o.first == null || p.t < o.first) o.first = p.t; });
    o.trade = o.dead + o.sev > 0 ? o.eLoss / (o.dead + o.sev) : (o.eLoss ? Infinity : null); return o; }
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
    const h = hmCfg(st), m = hmMap(h), k = hmKvkCur(h), sid = k ? +k.id.slice(1) : null, [from, to] = range, mates = withMates && hmMates ? new Map(hmMates.map((f, i) => [f.gid, i])) : new Map();
    const out = [], own = (pid) => kbMine(pid) && (!st.acc || String(pid) === st.acc);
    const add = (r, joined) => { const kd = hmKind(r); if (kd !== src) return;
      if (!joined && sid && r.server_id != null && +r.server_id !== sid) return;
      const mine = own(r.player_id), fi = mates.get(String(r.player_id)); if (!mine && fi == null) return;
      if (mine && st.march && kd === 'pvp' && !joined && kbMarchOf(r) !== st.march) return;
      if (!hmIn(r.pos_x, r.pos_y, r.map_role)) return;
      const t = r.battle_start ? Date.parse(r.battle_start) : NaN; if (from != null && !(t >= from)) return; if (to != null && !(t <= to)) return;
      const [u, v] = hmXY(+r.pos_x, +r.pos_y, h, m); out.push({ r, k: kd, u, v, t, mine, fi: mine ? -1 : fi, z: hmZoneAt(u, v, m), joined }); };
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
  function hmFightName(h, m, zs, a, b) {   // Ort zuerst: Altar-Kästchen, Kingsland, zwei innere Zonen = Pass 7, Zone 5 – sonst Kalender, sonst Zone
    const n1 = zs[0] ? m.zones.n[zs[0][0]] : '', n2 = zs[1] && zs[1][1] >= zs[0][1] * .3 ? m.zones.n[zs[1][0]] : '';
    if (/^Altar/.test(n1)) return 'Altar'; if (/^Kingsland/.test(n1)) return 'Kingsland';
    if (/^Innen/.test(n1) && /^Innen/.test(n2)) return 'Pass 7'; if (/^Zone 5/.test(n1)) return 'Zone 5';
    const ev = hmSched(h); if (ev.some(e => e.kind === 'altar' && a <= e.ts + 3 * 36e5 && b >= e.ts - 30 * 6e4)) return 'Altar';
    const p = ev.filter(e => e.kind === 'pass' && e.ts <= b + 30 * 6e4 && a - e.ts <= 72 * 36e5).sort((x, y) => y.ts - x.ts)[0];
    if (p) return ({ 4: 'Zone 4', 7: 'Pass 7', 8: 'Kingsland' })[p.n] || 'Pass ' + p.n;
    return zs[0] ? hmZName(h, m, zs[0][0]) : 'Kampf';
  }
  function hmFights(st) {   // Schlachten: deine PvP-Kämpfe im KvK, Pause > 45 min = neue Schlacht
    const h = hmCfg(st), m = hmMap(h), s = hmStart(h), pts = hmPoints(st, 'pvp', [s ? Date.parse(s + 'T00:00:00Z') : null, null], false).filter(p => p.mine), out = []; let cur = null;
    pts.forEach(p => { if (!cur || p.t - cur.b > 45 * 6e4) { cur = { a: p.t, b: p.t, kp: 0, n: 0, zk: new Map(), u0: 1, v0: 1, u1: 0, v1: 0, pts: [] }; out.push(cur); }
      const kp = hmKP(p.r); cur.b = p.t; cur.kp += kp; cur.n++; cur.pts.push(p); cur.zk.set(p.z, (cur.zk.get(p.z) || 0) + kp);
      cur.u0 = Math.min(cur.u0, p.u); cur.v0 = Math.min(cur.v0, p.v); cur.u1 = Math.max(cur.u1, p.u); cur.v1 = Math.max(cur.v1, p.v); });
    const big = Math.max(0, ...out.map(f => f.kp));
    return out.filter((f, i) => (f.n >= 3 && f.kp >= Math.max(500000, big * .05)) || (i === out.length - 1 && Date.now() - f.b < 45 * 6e4)).map(f => {
      const zs = [...f.zk.entries()].filter(([z]) => z >= 0).sort((a, b) => b[1] - a[1]), id = String(f.a), auto = hmFightName(h, m, zs, f.a, f.b);
      return { ...f, id, z: zs[0] ? zs[0][0] : -1, name: h.fn[id] || auto, auto, live: Date.now() - f.b < 45 * 6e4 };
    }).reverse();
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
  function hmCity(gid) { const h = hmCfg(kbSt()), k = hmKvkCur(h), sid = k ? +k.id.slice(1) : null;
    return (kbRows || []).find(r => (gid ? String(r.player_id) === gid : kbMine(r.player_id)) && (!sid || +r.server_id === sid) && hmIn(r.city_x, r.city_y, r.map_role)); }
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
  function hmHeroes(march) { return String(march || '').split(' / ').slice(0, 2).map(n => { const id = HM_ICON[n];
    return id ? `<img src="/icons/comander/${id}.webp" alt="" title="${esc(n)}" class="w-7 h-7 rounded-lg object-cover border border-ink-600 bg-ink-900" loading="lazy" onerror="this.replaceWith(Object.assign(document.createElement('span'),{className:'w-7 h-7 rounded-lg grid place-items-center bg-ink-800 border border-ink-600 text-[10px] text-slate-300',textContent:'${esc(n).slice(0, 2)}'}))">`
      : `<span class="w-7 h-7 rounded-lg grid place-items-center bg-ink-800 border border-ink-600 text-[10px] text-slate-300" title="${esc(n)}">${esc(n.slice(0, 2))}</span>`; }).join(''); }
  function hmMarches(pts, src) {   // jeder Marsch: KP, Verdienst, Trade (Kämpfe) bzw. Anzahl (Barbaren/Forts)
    const M = new Map(); pts.forEach(p => { const k = p.joined ? 'Rally (Teilnehmer)' : kbMarchOf(p.r); (M.get(k) || M.set(k, []).get(k)).push(p); });
    return [...M.entries()].map(([k, v]) => [k, hmSum(v)]).sort((a, b) => src === 'pvp' ? b[1].kp - a[1].kp : b[1].n - a[1].n);
  }
  function hmMarchTable(list, src, small) {
    return `<table class="w-full ${small ? 'text-[11px]' : 'text-xs'}"><tbody>${list.map(([k, w]) => `<tr class="border-t border-ink-800/60"><td class="py-1 pr-1"><div class="flex items-center gap-1.5 min-w-0">${k.startsWith('Rally') ? '<span class="w-7 h-7 rounded-lg grid place-items-center bg-sky-500/15 border border-sky-500/40">🛡️</span>' : `<span class="flex gap-0.5 shrink-0">${hmHeroes(k)}</span>`}${small ? '' : `<span class="truncate text-slate-300" translate="no" title="${esc(k)}">${esc(k)}</span>`}</div></td>
      ${src === 'pvp' ? `<td class="py-1 text-right tabular-nums text-gold-200 whitespace-nowrap">🏆 ${short(w.kp)}</td><td class="py-1 pl-2 text-right tabular-nums text-sky-200 whitespace-nowrap">🎖️ ${w.acc ? short(w.acc) : '–'}</td><td class="py-1 pl-2 text-right tabular-nums whitespace-nowrap ${w.trade >= 1 ? 'text-emerald-300' : 'text-red-300'}">⚖️ ${hmTradeTxt(w.trade)}</td>` : `<td class="py-1 text-right tabular-nums">${src === 'barb' ? '🪓' : '🏰'} ${fmt(w.n)}</td>`}</tr>`).join('')}</tbody></table>`;
  }
  function hmZoneStats(pts) {
    const Z = new Map();
    pts.forEach(p => { if (p.z < 0) return; const o = Z.get(p.z) || { z: p.z, mine: [], who: new Map(), ally: new Map(), su: 0, sv: 0, sc: 0 };
      const key = p.mine ? 'me' : 'm' + p.fi; (o.who.get(key) || o.who.set(key, []).get(key)).push(p);
      if (p.mine) { o.mine.push(p); o.su += p.u; o.sv += p.v; o.sc++; if (p.r.enemy_alliance) o.ally.set(p.r.enemy_alliance, (o.ally.get(p.r.enemy_alliance) || 0) + 1); }
      Z.set(p.z, o); });
    return [...Z.values()].filter(o => o.sc).map(o => { const me = hmSum(o.mine); return { ...o, ...me, whoSum: new Map([...o.who].map(([k, v]) => [k, hmSum(v)])), mu: o.su / o.sc, mv: o.sv / o.sc }; })
      .sort((a, b) => b.kp - a.kp || b.n - a.n);
  }
  function hmState(st) {
    const h = hmCfg(st), m = hmMap(h), kvk = hmKvkCur(h), fights = h.src === 'pvp' ? hmFights(st) : [];
    if (h.fight && !fights.some(f => f.id === h.fight)) h.fight = null;
    const range = hmRange(h, fights), all0 = hmPoints(st, h.src, range, h.fr), all = h.iso != null ? all0.filter(p => p.z === h.iso) : all0;
    const t0 = all.length ? all[0].t : Date.now(), t1 = all.length ? all[all.length - 1].t : Date.now(), cur = h.tl == null ? null : Math.min(t1, Math.max(t0, h.tl));
    const upto = cur == null ? all : all.filter(p => p.t <= cur), dots = cur == null || !h.trail ? upto : upto.filter(p => p.t >= cur - h.trail);
    return { h, m, kvk, fights, all0, all, upto, dots, t0, t1, cur, zs: hmZoneStats(upto), zsAll: hmZoneStats(all0) };
  }
  function hmMarkCard(S, o) {   // Marker: Name + seit wann + Werte (immer sichtbar), Klick = Rangliste & Märsche
    const { h, m } = S, pvp = h.src === 'pvp', open = h.pop === o.z;
    const stat = pvp ? `🏆 <b class="text-gold-200">${short(o.kp)}</b> · ⚖️ <b class="${o.trade >= 1 ? 'text-emerald-300' : 'text-red-300'}">${hmTradeTxt(o.trade)}</b> · 💀 ${short(o.dead)}${o.acc ? ` · 🎖️ ${short(o.acc)}` : ''}` : `${h.src === 'barb' ? '🪓' : '🏰'} <b class="text-gold-200">${fmt(o.n)}</b>`;
    let body = '';
    if (open) { const rows = [...o.whoSum.entries()].map(([k, w]) => { const me = k === 'me', mt = me ? null : hmMates?.[+k.slice(1)];
        return { name: me ? 'Du' : (mt?.name || 'Spieler'), tag: me ? '' : mt?.kind === 'k' ? '👑' : '🤝', col: me ? '#f5c542' : HM_COL[+k.slice(1) % HM_COL.length], w }; }).sort((a, b) => b.w.kp - a.w.kp || b.w.n - a.w.n);
      body = `<div data-hmpop class="mt-1.5 pt-1.5 border-t border-ink-700 cursor-default">
        <div class="flex gap-1 mb-1"><button type="button" data-hmiso="${o.z}" class="px-1.5 py-0.5 rounded border border-ink-600 hover:border-gold-500/60 text-[10px]">${h.iso === o.z ? '✕ <span>Alle Zonen</span>' : '🔍 <span>Nur diese Zone</span>'}</button><button type="button" data-hmzren="${o.z}" class="px-1.5 py-0.5 rounded border border-ink-600 hover:border-gold-500/60 text-[10px]">✏️ <span>Umbenennen</span></button></div>
        ${pvp ? `<div class="text-[10px] text-slate-400">🏟️ <span>LK-Punkte</span> <b class="text-amber-200">${short(o.lk)}</b> · <span>Schwer verw.</span> ${short(o.sev)} · <span>Kämpfe</span> ${fmt(o.n)}</div>` : ''}
        <div class="mt-1 text-[9px] uppercase tracking-wider text-slate-500">${rows.length > 1 ? 'Rangliste' : 'Nur du in dieser Zone'}</div>
        <table class="w-full text-[11px]"><tbody>${rows.map((r, i) => `<tr><td class="pr-1 text-slate-500 tabular-nums">${i + 1}.</td><td><span class="inline-block w-2 h-2 rounded-full mr-1" style="background:${r.col}"></span><span translate="no">${esc(r.name)}</span> ${r.tag}</td><td class="text-right tabular-nums text-gold-200">${pvp ? short(r.w.kp) : fmt(r.w.n)}</td>${pvp ? `<td class="pl-1 text-right tabular-nums text-slate-400">${hmTradeTxt(r.w.trade)}</td>` : ''}</tr>`).join('')}</tbody></table>
        <div class="mt-1 text-[9px] uppercase tracking-wider text-slate-500">Märsche</div>${hmMarchTable(hmMarches(o.mine, h.src), h.src, true)}
        ${o.ally.size ? `<div class="mt-1 text-[10px] text-red-200"><span class="text-slate-500">Gegner:</span> <span translate="no">${[...o.ally.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([a, n]) => `[${esc(a)}] ${n}`).join(' · ')}</span></div>` : ''}</div>`; }
    return `<div class="rounded-xl border ${open ? 'border-white' : 'border-amber-400/70'} bg-ink-950/90 px-2 py-1 shadow-xl text-[11px] text-slate-200 ${open ? 'w-80' : 'max-w-[15rem]'}">
      <div class="flex items-center justify-between gap-2"><b class="text-gold-300" translate="no">📍 ${esc(hmZName(h, m, o.z))}</b><span class="text-slate-500">${open ? '▴' : '▾'}</span></div>
      <div class="text-[10px] text-slate-500">${pvp ? '<span>erste KP</span>' : '<span>erster Kill</span>'} ${hmWhen(o.first)}</div>
      <div class="whitespace-nowrap">${stat}${o.whoSum.size > 1 ? ` · <span class="text-cyan-300">👥${o.whoSum.size}</span>` : ''}</div>${body}</div>`;
  }
  function hmLivePanel(S) {
    const { h, fights } = S; if (h.src !== 'pvp') return '';
    const f = (h.fight && fights.find(x => x.id === h.fight)) || fights[0], pts = f ? (S.cur != null ? f.pts.filter(p => p.t <= S.cur) : f.pts) : [], o = hmSum(pts);
    const big = (l, v, c, sub) => `<div class="rounded-xl bg-ink-900/80 border border-ink-700 p-2"><div class="text-[10px] text-slate-400">${l}</div><div class="text-lg font-bold tabular-nums ${c}">${v}</div>${sub ? `<div class="text-[10px] text-slate-500">${sub}</div>` : ''}</div>`;
    return `<aside class="rounded-xl border ${f?.live ? 'border-red-500/60' : 'border-ink-700'} bg-ink-950/70 p-3 lg:sticky lg:top-2 self-start">
      <div class="flex items-center justify-between gap-2"><h3 class="font-display text-base text-gold-300">${f?.live ? '<span class="inline-block w-2 h-2 rounded-full bg-red-500 animate-pulse mr-1"></span><span>Kampf läuft</span>' : '📊 <span>Schlacht</span>'}</h3>
        <label class="flex items-center gap-1 text-[11px] text-slate-400" title="Lädt jede Minute neue Kampfberichte nach"><input type="checkbox" data-hmlive ${h.live ? 'checked' : ''} class="accent-red-500"> <span>🔴 Live</span></label></div>
      ${!f ? '<div class="text-xs text-slate-500 mt-2">Noch keine Schlacht in diesem KvK. Sobald du kämpfst, erscheinen hier deine Werte.</div>' : `
      <div class="text-xs text-slate-200 mt-0.5 font-semibold" translate="no">⚔️ ${esc(f.name)}</div>
      <div class="text-[10px] text-slate-500 mb-2">${hmWhen(f.a)} – ${new Date(S.cur != null ? Math.min(S.cur, f.b) : f.b).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })} · ${fmt(o.n)} <span>Kämpfe</span>${h.lastLive ? ` · <span>aktualisiert</span> ${new Date(h.lastLive).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}` : ''}</div>
      <div class="grid grid-cols-2 gap-1.5">${big('🏆 Kill Points', short(o.kp), 'text-gold-200', '<span>wie im Profil</span>')}${big('🏟️ LK-Punkte', short(o.lk), 'text-amber-200', '<span>T4 = 1 · T5 = 5</span>')}
        ${big('💀 Deads', short(o.dead), 'text-red-300', `${short(o.sev)} <span>schwer verw.</span>`)}${big('⚖️ Trade', hmTradeTxt(o.trade), o.trade >= 1 ? 'text-emerald-300' : 'text-red-300', '<span>Gegner-Verluste ÷ deine</span>')}
        ${big('🎖️ Verdienst', o.acc ? short(o.acc) : '–', 'text-sky-200', o.acc ? '' : '<span>kommt mit dem neuen Uploader</span>')}${big('💚 Heilung', short(o.heal), 'text-emerald-200', '<span>im Kampf (Skills)</span>')}</div>
      <div class="mt-2 text-[10px] uppercase tracking-wider text-slate-500">Märsche</div>${hmMarchTable(hmMarches(pts, 'pvp'), 'pvp', true)}`}
      <div class="mt-2 pt-2 border-t border-ink-700 flex items-center justify-between gap-2 text-[11px]"><span class="text-slate-400">Sichtbarkeit</span>
        <button type="button" data-hmshare class="px-2 py-1 rounded-lg border ${hmShare ? 'border-emerald-500/60 text-emerald-300' : 'border-ink-600 text-slate-300'}">${hmShare == null ? '…' : hmShare ? '👁️ <span>Für Freunde &amp; Königreich sichtbar</span>' : '🔒 <span>Privat</span>'}</button></div>
    </aside>`;
  }
  function hmIdBar(st) {   // welche Accounts gezeigt werden (Profil-ID + verknüpfte IDs, z. B. dein 2. Account)
    const pidP = kbProfileId(), links = (st.linkIds || []).map(String), names = new Map((kbRows || []).map(r => [String(r.player_id), r.self_name]));
    const chip = (id, own) => `<span class="inline-flex items-center gap-1 rounded-lg border ${own ? 'border-gold-500/60 bg-gold-500/10 text-gold-200' : 'border-ink-600 text-slate-300'} px-2 py-0.5" translate="no">${own ? '👤' : '🔗'} ${esc(names.get(id) || '')} <span class="tabular-nums text-slate-400">${esc(id)}</span>${own ? ' <span class="text-[10px] text-slate-500">Profil</span>' : `<button type="button" data-kbunlink="${esc(id)}" class="text-slate-500 hover:text-red-300" title="Verknüpfung lösen">✕</button>`}</span>`;
    return `<div class="flex flex-wrap items-center gap-1.5 mb-2 text-[11px]"><span class="text-slate-400">🆔 <span>Meine Accounts</span>:</span>${pidP ? chip(pidP, true) : '<span class="text-amber-300">Keine Governor-ID im Profil</span>'}${links.filter(x => x !== pidP).map(x => chip(x, false)).join('')}
      <input data-kblinkid inputmode="numeric" placeholder="+ ID des 2. Accounts" maxlength="12" class="bg-ink-950 border border-ink-600 rounded-lg px-2 py-0.5 text-[11px] w-36 text-slate-100 focus:outline-none focus:border-gold-500"></div>`;
  }
  function hmHtml(st, filters) {
    const S = hmState(st), { h, m, kvk, fights, all, dots, t0, t1, cur, zs, zsAll } = S;
    if (h.fr && !hmMates && !hmMatesLoading) hmLoadMates();
    const seg = (attr, k, l, on) => `<button type="button" ${attr}="${k}" aria-pressed="${on}" class="seg-btn rounded-lg px-2 py-1 text-xs font-semibold transition">${l}</button>`;
    const sel = 'bg-ink-950 border border-ink-600 rounded-lg px-2 py-1 text-xs text-slate-100 focus:outline-none focus:border-gold-500';
    const kvks = hmKvks(), start = hmStart(h), mineAll = (kbRows || []).filter(r => kbMine(r.player_id)), inst = mineAll.filter(r => r.is_pvp && ((r.map_role && r.map_role !== 'gsmp') || kbIsAoo(r))).length, noPos = mineAll.filter(r => r.pos_x == null).length, city = hmCity();
    const kvkBar = `<div class="flex flex-wrap items-center gap-2 mb-2 text-xs"><span class="text-slate-400">🏁 KvK</span>
      ${kvks.length ? `<select data-hmkvkid class="${sel}">${kvks.map(k => `<option value="${k.id}" ${kvk?.id === k.id ? 'selected' : ''}>${esc(hmKvkName(h, k))}${h.kv[k.id]?.name ? ' · ' + k.id : ''}${k.isProfile ? ' · Profil' : ''} (${fmt(k.n)})</option>`).join('')}</select>
        <button type="button" data-hmkvkren class="px-2 py-1 rounded-lg border border-ink-600 hover:border-gold-500/60" title="KvK benennen">✏️</button>` : '<span class="text-slate-500">Noch kein KvK-Kampf auf der Weltkarte</span>'}
      <span class="text-slate-500">· <span>Start</span>:</span>${kvk && !kvk.isProfile ? `<input type="date" data-hmkvkstart value="${esc(start)}" class="${sel}">` : `<b class="text-slate-200">${start ? new Date(start + 'T00:00:00Z').toLocaleDateString('de-DE') : '–'}</b> <span class="text-slate-500">(<span>aus deinem Profil-KvK</span>)</span>`}
      ${!start ? '<span class="text-amber-300">Trag im KvK-Rechner (Profil) das KvK-Startdatum ein.</span>' : ''}</div>`;
    const fightSel = h.src === 'pvp' ? `<select data-hmfight class="${sel} max-w-[24rem]"><option value="">🎞️ Komplette Timeline</option>${fights.map(f => `<option value="${f.id}" ${h.fight === f.id ? 'selected' : ''}>⚔️ ${esc(f.name)} · ${hmWhen(f.a)}–${new Date(f.b).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })} · ${short(f.kp)} KP</option>`).join('')}</select>
      ${h.fight ? '<button type="button" data-hmfren title="Schlacht umbenennen" class="px-2 py-1 rounded-lg border border-ink-600 hover:border-gold-500/60">✏️</button>' : ''}<span class="text-[10px] text-slate-500">${fights.length} <span>Schlachten automatisch erkannt</span></span>` : '';
    const zoneSel = `<select data-hmzsel class="${sel}"><option value="">🗺️ Alle Zonen</option>${zsAll.slice().sort((a, b) => hmZName(h, m, a.z).localeCompare(hmZName(h, m, b.z))).map(o => `<option value="${o.z}" ${h.iso === o.z ? 'selected' : ''}>${esc(hmZName(h, m, o.z))} – ${h.src === 'pvp' ? '🏆 ' + short(o.kp) : (h.src === 'barb' ? '🪓 ' : '🏰 ') + fmt(o.n)}</option>`).join('')}</select>`;
    const matesBar = h.fr ? `<div class="flex flex-wrap items-center gap-1.5 text-[11px] mb-1">${hmMatesLoading ? '<span class="text-slate-500">Lade Freunde und Königreich …</span>' : !hmMates?.length ? '<span class="text-slate-500">Niemand sichtbar – Freunde und Königreich-Mitglieder erscheinen, wenn sie „sichtbar“ eingeschaltet haben.</span>'
      : hmMates.map((f, i) => `<span class="inline-flex items-center gap-1 rounded-md border border-ink-600 px-1.5 py-0.5"><span class="w-2 h-2 rounded-full" style="background:${HM_COL[i % HM_COL.length]}"></span><span translate="no">${esc(f.name)}</span><span class="text-slate-500">${f.kind === 'k' ? '👑' : '🤝'}</span></span>`).join('')}</div>` : '';
    const zoneCards = zs.map(o => `<div class="rounded-xl border ${h.pop === o.z ? 'border-amber-400' : 'border-ink-700'} bg-ink-950/60 p-2">
        <button type="button" data-hmzone="${o.z}" class="w-full text-left"><div class="flex items-center justify-between text-xs"><span class="font-semibold text-slate-100">📍 <span translate="no">${esc(hmZName(h, m, o.z))}</span></span><span class="text-gold-300 font-semibold tabular-nums">${h.src === 'pvp' ? '🏆 ' + short(o.kp) : (h.src === 'barb' ? '🪓 ' : '🏰 ') + fmt(o.n)}</span></div>
        <div class="text-[10px] text-slate-500">${h.src === 'pvp' ? '<span>erste KP</span>' : '<span>erster Kill</span>'} ${hmWhen(o.first)}${h.src === 'pvp' ? ` · ⚖️ ${hmTradeTxt(o.trade)} · 💀 ${short(o.dead)}${o.acc ? ' · 🎖️ ' + short(o.acc) : ''}` : ''}${o.whoSum.size > 1 ? ` · 👥 ${o.whoSum.size}` : ''}</div></button>
        ${hmMarchTable(hmMarches(o.mine, h.src), h.src, false)}</div>`).join('');
    return `<style>#battlesView:fullscreen{overflow-y:auto;padding:12px;background:#07090f}#battlesView:fullscreen #hmBox{width:min(100%,calc(100vh - 170px));margin:0 auto}</style>
      <section class="panel rounded-2xl p-4 sm:p-5 mt-4"><h2 class="font-display text-lg text-gold-300">🔥 <span>Heatmap</span> <span class="ml-1 align-middle text-[10px] px-1.5 py-0.5 rounded bg-amber-500/15 border border-amber-500/40 text-amber-300">TEST</span></h2>
      <p class="text-xs text-slate-400 mb-3">Wo du kämpfst – jeder Kampf an dem Ort, an dem er stattfand (unabhängig davon, wo deine Stadt gerade steht). Ark of Osiris ist ausgeblendet.</p>
      ${kvkBar}${hmIdBar(st)}
      <div class="flex flex-wrap items-center gap-2 mb-2 text-xs">
        <div class="flex flex-wrap gap-1 p-1 rounded-xl bg-ink-950 border border-ink-700">${HM_SRC.map(([k, l, c]) => seg('data-hmsrc', k, `<span class="inline-block w-2 h-2 rounded-full mr-1" style="background:${c}"></span>${l}`, h.src === k)).join('')}</div>
        <div class="flex flex-wrap gap-1 p-1 rounded-xl bg-ink-950 border border-ink-700">${HM_T.map(([k, l]) => seg('data-hmt', k, l, !h.fight && h.t === k)).join('')}</div>
      </div>
      ${!h.fight && h.t === 'custom' ? `<div class="flex flex-wrap items-center gap-2 mb-2 text-xs"><span class="text-slate-400">Von</span><input type="datetime-local" data-hmfrom value="${esc(h.from || (start ? start + 'T00:00' : ''))}" class="${sel}"><span class="text-slate-400">bis</span><input type="datetime-local" data-hmto value="${esc(h.to || '')}" class="${sel}"><span class="text-slate-500">(leer = bis jetzt)</span></div>` : ''}
      ${hmDays(h)}
      ${filters}
      <div class="flex flex-wrap items-center gap-2 mb-2 text-xs">
        <label class="flex items-center gap-1 text-slate-400"><input type="checkbox" data-hmzm ${h.zm ? 'checked' : ''} class="accent-amber-400"> <span>Zonen-Marker</span></label>
        <label class="flex items-center gap-1 text-slate-400"><input type="checkbox" data-hmfr ${h.fr ? 'checked' : ''} class="accent-amber-400"> <span>👥 Freunde &amp; Königreich</span></label>
        ${zoneSel}
        <label class="flex items-center gap-1 text-slate-400"><span>Glühen</span> <input type="range" min="1" max="8" value="${h.rad}" data-hmrad class="accent-amber-400 w-20"></label>
        <span class="ml-auto flex flex-wrap items-center gap-1 text-slate-500"><span class="flex gap-1 p-0.5 rounded-lg bg-ink-950 border border-ink-700">${HM_MAPS.map(x => `<button type="button" data-hmmap="${x.k}" aria-pressed="${h.map === x.k}" class="seg-btn rounded-md px-2 py-0.5 text-[11px] font-semibold" translate="no">🗺️ ${esc(x.n)}</button>`).join('')}</span>
          <button type="button" data-hmcal class="px-2 py-1 rounded-lg border ${hmCalMode ? 'border-emerald-400 text-emerald-300' : 'border-ink-600'} hover:border-gold-500/60" title="Auf die Stelle klicken, an der deine Stadt im Spiel wirklich steht">📍 <span>${hmCalMode ? 'Jetzt auf deine Stadt klicken …' : 'Stadt kalibrieren'}</span></button>
          ${h.ux ? '<button type="button" data-hmcalx class="px-2 py-1 rounded-lg border border-ink-600 hover:border-gold-500/60" title="Kalibrierung zurücksetzen">↺</button>' : ''}</span>
      </div>
      ${matesBar}
      <div class="grid lg:grid-cols-[minmax(0,1fr)_19rem] gap-3 items-start mt-2"><div id="hmWrap" class="bg-ink-950 rounded-xl">
        ${h.iso != null ? `<div class="flex items-center gap-2 mb-1 text-xs"><span class="text-amber-300 font-semibold">🔍 <span>Nur</span> <span translate="no">${esc(hmZName(h, m, h.iso))}</span></span><button type="button" data-hmiso="${h.iso}" class="px-2 py-0.5 rounded-lg border border-ink-600 hover:border-gold-500/60">✕ <span>Alle Zonen</span></button></div>` : ''}
        <div id="hmBox" class="relative w-full aspect-square rounded-xl overflow-hidden border border-ink-700 bg-ink-950 ${hmCalMode ? 'cursor-crosshair' : 'cursor-grab'} touch-none select-none">
          <div id="hmStage" class="absolute inset-0 origin-top-left">
            <img src="${esc(m.img)}" alt="" class="absolute inset-0 w-full h-full select-none pointer-events-none" draggable="false" decoding="async" onerror="this.style.display='none';document.getElementById('hmNoImg')?.classList.remove('hidden')">
            <canvas id="hmCanvas" width="1600" height="1600" class="absolute inset-0 w-full h-full pointer-events-none"></canvas>
          </div>
          <canvas id="hmDots" class="absolute inset-0 w-full h-full pointer-events-none"></canvas>
          <div id="hmMarks" class="absolute inset-0 pointer-events-none overflow-hidden"></div>
          <div id="hmNoImg" class="hidden absolute inset-0 grid place-items-center text-sm text-slate-500 p-6 text-center">Kartenbild fehlt: ${esc(m.img)}</div>
          <div class="absolute top-2 right-2 flex flex-col gap-1 z-40">
            ${[['in', '＋', 'Hineinzoomen'], ['out', '－', 'Herauszoomen'], ['fit', '🎯', 'Auf Kämpfe zoomen'], ['reset', '⤢', 'Ganze Karte'], ['full', '⛶', 'Vollbild'], ['png', '📷', 'Als Bild speichern']].map(([k, i, t]) => `<button type="button" data-hmz="${k}" title="${t}" class="w-9 h-9 rounded-lg bg-ink-950/85 border border-ink-600 hover:border-gold-500/60 text-base">${i}</button>`).join('')}
          </div>
          <div id="hmTip" class="hidden absolute z-50 pointer-events-none rounded-lg border border-ink-600 bg-ink-950/95 px-2 py-1 text-[11px] text-slate-200 whitespace-nowrap"></div>
        </div>
        <div class="mt-2 rounded-xl border border-ink-700 bg-ink-950/70 p-2">
          <div class="flex flex-wrap items-center gap-2 text-xs mb-1">${fightSel}</div>
          <div class="flex flex-wrap items-center gap-2 text-xs">
            <button type="button" data-hmplay class="px-3 py-1 rounded-lg border border-gold-500/50 text-gold-200 hover:bg-gold-500/10 font-semibold">${hmPlay ? '⏸ Pause' : '▶ Abspielen'}</button>
            <span class="flex gap-0.5">${[1, 4, 16].map(x => seg('data-hmspeed', x, '×' + x, h.speed === x)).join('')}</span>
            <span class="font-semibold text-slate-200 tabular-nums" id="hmTlLabel">${cur == null ? '<span>Alles</span>' : hmWhen(cur)}</span>
            <span class="text-slate-500">· <span>Spur</span>:</span>${HM_TRAIL.map(([k, l]) => seg('data-hmtrail', k, l, +h.trail === k)).join('')}
            <label class="ml-auto flex items-center gap-1 text-slate-400"><input type="checkbox" data-hmpngmk ${h.pngMk ? 'checked' : ''} class="accent-amber-400"> <span>📷 Marker ins Bild</span></label>
            ${cur != null ? '<button type="button" data-hmtlx class="px-2 py-1 rounded-lg border border-ink-600 hover:border-gold-500/60">✕ <span>Timeline aus</span></button>' : ''}
          </div>
          <input type="range" data-hmtl min="${t0}" max="${t1}" step="60000" value="${cur == null ? t1 : cur}" class="w-full accent-amber-400 mt-1" ${all.length < 2 ? 'disabled' : ''}>
          <div class="flex justify-between text-[10px] text-slate-500 tabular-nums"><span>${all.length ? hmWhen(t0) : ''}</span><span>⏪ <span>Regler ziehen zum Zurückspulen – Marker zeigen den Stand zu diesem Zeitpunkt</span></span><span>${all.length ? hmWhen(t1) : ''}</span></div>
        </div>
      </div>${hmLivePanel(S)}</div>
      <div class="mt-2 text-[11px] text-slate-500 flex flex-wrap gap-x-3 gap-y-1">
        <span><span class="inline-block w-2.5 h-2.5 rounded-full align-middle" style="background:${HM_SRC.find(x => x[0] === h.src)[2]}"></span> ${fmt(dots.filter(p => p.mine).length)} ${h.src === 'pvp' ? '<span>Kämpfe</span>' : h.src === 'barb' ? '<span>Barbaren</span>' : '<span>Forts</span>'}${h.fr ? ` · ${fmt(dots.filter(p => !p.mine).length)} <span>von Freunden/Königreich</span>` : ''}</span>
        <span><span class="inline-block w-2.5 h-2.5 rounded-full align-middle bg-emerald-400"></span> <span>Deine Stadt (zuletzt)</span>${city ? ` X ${Math.round(hmTile(city.city_x, 'x'))} · Y ${Math.round(hmTile(city.city_y, 'y'))}` : ''}</span>
        ${h.ux ? '<span class="text-emerald-300">✓ <span>kalibriert</span></span>' : ''}
        ${inst ? `<span>${fmt(inst)} <span>PvP-Kämpfe in Ark of Osiris / Instanzen (eigene Karte, hier nicht gezeigt)</span></span>` : ''}
        ${noPos ? `<span>${fmt(noPos)} <span>ohne Ort (ältere Uploads)</span></span>` : ''}
        ${!kbPosCols ? '<span class="text-amber-300">SQL für die Heatmap fehlt noch in Supabase.</span>' : ''}
      </div>
      <h3 class="font-display text-base text-gold-300 mt-4 mb-2">📍 <span>Zonen</span> <span class="text-[11px] text-slate-500 font-sans">– <span>jeder Marsch mit KP, Verdienst und Trade · anklicken: hineinzoomen</span></span></h3>
      <div class="grid sm:grid-cols-2 xl:grid-cols-3 gap-2">${zoneCards || '<div class="text-xs text-slate-500">Noch keine Kämpfe mit Ort im Filter.</div>'}</div>
      </section>`;
  }
  function hmDays(h) {   // KvK-Tage zum Anklicken (Tag 1 = KvK-Start aus dem Profil)
    const kv = hmStart(h); if (!kv) return ''; const a = Date.parse(kv + 'T00:00:00Z'), end = hmEnd(h) || Date.now(), n = Math.min(90, Math.floor((Math.min(Date.now(), end) - a) / 864e5) + 1); if (n < 1) return '';
    const out = []; for (let i = 0; i < n; i++) { const d = new Date(a + i * 864e5), k = d.toISOString().slice(0, 10), on = !h.fight && h.t === 'day' && h.day === k;
      out.push(`<button type="button" data-hmday="${k}" aria-pressed="${on}" title="${d.toLocaleDateString('de-DE')}" class="seg-btn rounded-md px-1.5 py-0.5 text-[10px] font-semibold tabular-nums">${i + 1}</button>`); }
    return `<div class="flex flex-wrap items-center gap-1 mb-2"><span class="text-[11px] text-slate-500 mr-1">KvK-Tag:</span>${out.join('')}</div>`;
  }
  // ---------- Zeichnen ----------
  function hmHeat(S) {
    if (hmLast && hmLast.S === S && hmLast.heat) return hmLast.heat;
    const { h, dots } = S, mine = dots.filter(p => p.mine), N = 300, grid = new Float32Array(N * N);
    mine.forEach(p => { const gx = Math.floor(p.u * N), gy = Math.floor(p.v * N); if (gx >= 0 && gy >= 0 && gx < N && gy < N) grid[gy * N + gx] += h.src === 'pvp' ? Math.max(1, hmKP(p.r) / 1e4) : 1; });
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
    for (let i = 0; i < d.w * d.w; i++) if (d.d.charCodeAt(i) - 97 !== h.iso) { im.data[i * 4] = 7; im.data[i * 4 + 1] = 9; im.data[i * 4 + 2] = 15; im.data[i * 4 + 3] = 215; }
    g.putImageData(im, 0, 0); hmMaskC = { key, c }; return c; }
  // Punkte + Städte: scharf, in Bildschirm-Auflösung (nicht mitvergrößert)
  function hmPaintDots(ctx, W, S, map) {   // map(u, v) → [x, y] in Pixeln
    const { h, m, dots } = S, col = HM_SRC.find(x => x[0] === h.src)[2], dpr = W / 1000 * 1.6;
    dots.forEach(p => { const [x, y] = map(p.u, p.v); if (x < -10 || y < -10 || x > W + 10 || y > W + 10) return; const fresh = S.cur != null && S.cur - p.t < 5 * 6e4;
      ctx.beginPath(); ctx.arc(x, y, (p.mine ? 3.2 : 2.8) * dpr, 0, 7); ctx.fillStyle = p.mine ? col : HM_COL[p.fi % HM_COL.length]; ctx.fill();
      ctx.lineWidth = (fresh ? 2 : 1) * dpr; ctx.strokeStyle = fresh ? '#fde047' : 'rgba(0,0,0,.7)'; ctx.stroke(); });
    const dot = (c, color, r) => { if (!c) return; const [u, v] = hmXY(+c.city_x, +c.city_y, h, m), [x, y] = map(u, v); ctx.beginPath(); ctx.arc(x, y, (r + 5) * dpr, 0, 7); ctx.fillStyle = color + '44'; ctx.fill();
      ctx.beginPath(); ctx.arc(x, y, r * dpr, 0, 7); ctx.fillStyle = color; ctx.fill(); ctx.lineWidth = 2 * dpr; ctx.strokeStyle = '#052e16'; ctx.stroke(); };
    dot(hmCity(), '#22c55e', 6); if (h.fr && hmMates) hmMates.forEach((f, i) => dot(hmCity(f.gid), HM_COL[i % HM_COL.length], 4.5));
  }
  function hmApplyView() {
    const st = $('hmStage'), box = $('hmBox'); if (!st || !box) return; const W = box.clientWidth;
    hmView.s = Math.min(10, Math.max(1, hmView.s)); const max = W * (hmView.s - 1); hmView.x = Math.min(0, Math.max(-max, hmView.x)); hmView.y = Math.min(0, Math.max(-max, hmView.y));
    st.style.transform = `translate(${hmView.x}px,${hmView.y}px) scale(${hmView.s})`;
    const map = (u, v) => [hmView.x + u * W * hmView.s, hmView.y + v * W * hmView.s];
    document.querySelectorAll('#hmMarks [data-hmmark]').forEach(e => { const [x, y] = map(+e.dataset.u, +e.dataset.v); e.style.left = x + 'px'; e.style.top = y + 'px'; });
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
      box.innerHTML = !h.zm ? '' : zs.map(o => `<div data-hmmark data-hmzone="${o.z}" data-u="${o.mu}" data-v="${o.mv}" class="absolute pointer-events-auto cursor-pointer ${h.pop === o.z ? 'z-30' : 'z-10'}" style="transform:translate(10px,-50%)">
          <span class="absolute -left-[13px] top-1/2 -translate-y-1/2 w-2 h-2 rotate-45 bg-amber-400/80"></span>${hmMarkCard(S, o)}</div>`).join('');
      box.querySelectorAll('[data-hmmark]').forEach(e => e.onclick = (ev) => { ev.stopPropagation(); if (ev.target.closest('[data-hmpop]')) return; hmPickZone(st, +e.dataset.hmzone, false); });
      box.querySelectorAll('[data-hmpop]').forEach(e => { e.addEventListener('pointerdown', ev => ev.stopPropagation()); e.addEventListener('wheel', ev => ev.stopPropagation(), { passive: true }); });
      box.querySelectorAll('[data-hmiso]').forEach(b => b.onclick = (ev) => { ev.stopPropagation(); hmIso(st, +b.dataset.hmiso); });
      box.querySelectorAll('[data-hmzren]').forEach(b => b.onclick = (ev) => { ev.stopPropagation(); hmRename(st, +b.dataset.hmzren); });
    }
    hmApplyView();
  }
  function hmIso(st, z) { const h = hmCfg(st), m = hmMap(h); h.iso = h.iso === z || z == null || isNaN(z) ? null : z; h.tl = null; savePassive(); renderKampf();
    if (h.iso != null) hmZoomTo(...hmZoneBox(m, h.iso)); else { hmView = { s: 1, x: 0, y: 0 }; hmApplyView(); } }
  function hmRename(st, z) { const h = hmCfg(st), m = hmMap(h), cur = (h.zn2[m.k] || {})[z] || '';
    hmAsk('Zone umbenennen', cur, (v) => { h.zn2[m.k] = h.zn2[m.k] || {}; if (v) h.zn2[m.k][z] = v.slice(0, 30); else delete h.zn2[m.k][z]; savePassive(); renderKampf(); }, 'Standard: ' + m.zones.n[z] + ' – leer lassen für Standard', 'z. B. Zone 4, Altar, Kingsland'); }
  function hmPickZone(st, z, zoom) { const h = hmCfg(st), m = hmMap(h); h.pop = h.pop === z ? null : z; savePassive(); renderKampf(); if (zoom && h.pop != null) hmZoomTo(...hmZoneBox(m, z)); }
  function hmBind(el, st) {
    const h = hmCfg(st), m = hmMap(h), re = () => { savePassive(); renderKampf(); };
    el.querySelectorAll('[data-hmsrc]').forEach(b => b.onclick = () => { h.src = b.dataset.hmsrc; h.pop = null; h.fight = null; re(); });
    el.querySelectorAll('[data-hmt]').forEach(b => b.onclick = () => { h.t = b.dataset.hmt; h.tl = null; h.fight = null; re(); });
    el.querySelectorAll('[data-hmday]').forEach(b => b.onclick = () => { if (!h.fight && h.t === 'day' && h.day === b.dataset.hmday) h.t = 'kvk'; else { h.t = 'day'; h.day = b.dataset.hmday; } h.tl = null; h.fight = null; re(); });
    el.querySelector('[data-hmkvkid]')?.addEventListener('change', (ev) => { h.kvkId = ev.target.value; h.fight = null; h.tl = null; h.pop = null; h.iso = null; const mp = h.kv[h.kvkId]?.map; if (mp) h.map = mp; hmView = { s: 1, x: 0, y: 0 }; re(); });
    el.querySelector('[data-hmkvkren]')?.addEventListener('click', () => { const k = hmKvkCur(h); if (!k) return; hmAsk('KvK benennen', h.kv[k.id]?.name || '', (v) => { h.kv[k.id] = { ...(h.kv[k.id] || {}), name: v || undefined }; re(); }, k.id + ' – z. B. „KvK 3 Main“ oder „C16144 Farm“', k.id); });
    el.querySelector('[data-hmkvkstart]')?.addEventListener('change', (ev) => { const k = hmKvkCur(h); if (!k) return; h.kv[k.id] = { ...(h.kv[k.id] || {}), start: ev.target.value }; re(); });
    el.querySelector('[data-hmfrom]')?.addEventListener('change', (ev) => { h.from = ev.target.value; re(); });
    el.querySelector('[data-hmto]')?.addEventListener('change', (ev) => { h.to = ev.target.value; re(); });
    el.querySelector('[data-hmrad]')?.addEventListener('input', (ev) => { h.rad = +ev.target.value; hmLast = null; hmDraw(st); });
    el.querySelector('[data-hmrad]')?.addEventListener('change', () => savePassive());
    el.querySelector('[data-hmzm]')?.addEventListener('change', (ev) => { h.zm = ev.target.checked; savePassive(); hmDraw(st); });
    el.querySelector('[data-hmfr]')?.addEventListener('change', (ev) => { h.fr = ev.target.checked; re(); });
    el.querySelector('[data-hmzsel]')?.addEventListener('change', (ev) => hmIso(st, ev.target.value === '' ? null : +ev.target.value));
    el.querySelector('[data-hmpngmk]')?.addEventListener('change', (ev) => { h.pngMk = ev.target.checked; savePassive(); });
    el.querySelectorAll('[data-hmmap]').forEach(b => b.onclick = () => { h.map = b.dataset.hmmap; const k = hmKvkCur(h); if (k) h.kv[k.id] = { ...(h.kv[k.id] || {}), map: h.map }; h.pop = null; h.iso = null; h.fight = null; hmView = { s: 1, x: 0, y: 0 }; re(); });
    el.querySelectorAll('#hmWrap > div > [data-hmiso]').forEach(b => b.onclick = () => hmIso(st, null));
    el.querySelectorAll('[data-hmzone]:not([data-hmmark])').forEach(b => b.onclick = () => hmPickZone(st, +b.dataset.hmzone, true));
    el.querySelector('[data-hmshare]')?.addEventListener('click', () => { if (hmShare != null) hmSetShare(!hmShare); });
    if (hmShare == null) hmLoadShare();
    const liveTick = async () => { const s2 = kbSt(), h2 = hmCfg(s2); if (R.view !== 'battles' || s2.page !== 'heat' || !h2.live) { clearInterval(hmLiveT); hmLiveT = null; return; }
      const n = await kbLoadNew(); h2.lastLive = Date.now(); if (n) renderKampf(); };
    el.querySelector('[data-hmlive]')?.addEventListener('change', (ev) => { h.live = ev.target.checked; savePassive(); if (h.live) liveTick(); else { clearInterval(hmLiveT); hmLiveT = null; } renderKampf(); });
    if (h.live && !hmLiveT) hmLiveT = setInterval(liveTick, 60000);
    el.querySelector('[data-hmfight]')?.addEventListener('change', (ev) => { h.fight = ev.target.value || null; h.tl = null; h.pop = null; re();
      const f = h.fight && hmFights(st).find(x => x.id === h.fight); if (f) hmZoomTo(f.u0, f.v0, f.u1, f.v1); else { hmView = { s: 1, x: 0, y: 0 }; hmApplyView(); } });
    el.querySelector('[data-hmfren]')?.addEventListener('click', () => { const f = hmFights(st).find(x => x.id === h.fight); if (!f) return; hmAsk('Schlacht benennen', h.fn[f.id] || '', (v) => { if (v) h.fn[f.id] = v.slice(0, 40); else delete h.fn[f.id]; re(); }, 'Automatisch: ' + f.auto + ' – leer lassen für automatisch', 'z. B. Pass 7, Zone 4, Altar, Kingsland'); });
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
      const near = (hmLast?.S || hmState(st)).dots.filter(p => Math.hypot(p.u - u, p.v - v) < .012 / Math.sqrt(hmView.s));
      if (!near.length) { tip.classList.add('hidden'); return; }
      const kp = near.reduce((s, p) => s + hmKP(p.r), 0), en = [...new Set(near.map(p => p.r.enemy_name).filter(Boolean))].slice(0, 3), who = [...new Set(near.map(p => p.mine ? 'Du' : hmMates?.[p.fi]?.name).filter(Boolean))];
      tip.innerHTML = `${h.src === 'pvp' ? `⚔️ ${near.length} · 🏆 ${short(kp)}` : (h.src === 'barb' ? '🪓 ' : '🏰 ') + near.length}<br><span class="text-slate-400">X ${Math.round(hmTile(near[0].r.pos_x, 'x'))} · Y ${Math.round(hmTile(near[0].r.pos_y, 'y'))} · ${hmWhen(near[near.length - 1].t)}</span>${en.length ? `<br><span class="text-red-200" translate="no">${en.map(esc).join(', ')}</span>` : ''}${who.length > 1 || who[0] !== 'Du' ? `<br><span class="text-cyan-200" translate="no">${who.map(esc).join(', ')}</span>` : ''}`;
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
  async function kdOpen(mail, opp) {
    kdCur = { mail, opp };
    const key = mail + '|' + opp, row = (kbRows || []).find(r => String(r.mail_id) === mail && String(r.opponent_id) === opp) || {};
    kdRender(row, kdCache[key], !kdCache[key]);
    if (kdCache[key] !== undefined) return;
    try { const db = RokAuth?.db?.(); if (!db) throw new Error('offline');
      const { data, error } = await db.from('rok_battles').select('detail').eq('mail_id', mail).eq('opponent_id', opp).maybeSingle();
      if (error) throw error;
      kdCache[key] = data?.detail || null;
    } catch (e) { kdCache[key] = { err: /detail/i.test(e?.message || '') ? 'col' : (e?.message || String(e)) }; }
    if (kdCur && kdCur.mail === mail && kdCur.opp === opp) kdRender(row, kdCache[key], false);
  }
  function kdClose() { kdCur = null; try { kdChart?.destroy(); } catch {} kdChart = null; $('kdModal')?.remove(); document.body.style.overflow = ''; }
  window.addEventListener('langchange', () => { if (kdCur) kdOpen(kdCur.mail, kdCur.opp); });
  function kdBuffSum(arm) {   // alle Rüstungswerte zusammengezählt
    const m = new Map();
    (arm || []).forEach(a => (a[5] || []).forEach(b => { const o = m.get(b[0]) || { v: 0, en: b[2], de: b[3] }; o.v += +b[1] || 0; m.set(b[0], o); }));
    return [...m.entries()].sort((a, b) => b[1].v - a[1].v);
  }
  function kdHero(h, main) {
    if (!h) return '';
    const sk = (h.sk || []).map(s => `<span class="inline-flex items-center gap-1 rounded-md border ${s[1] >= 5 ? 'border-gold-500/50 text-gold-200' : 'border-ink-600 text-slate-300'} px-1.5 py-0.5 text-[10px]" title="Skill ${esc(s[0])}"><b class="tabular-nums">${esc(s[1])}</b> <span translate="no">${kdNm(s[2], s[3], 'Skill ' + s[0])}</span></span>`).join(' ');
    return `<div class="rounded-xl border border-ink-700 bg-ink-950/60 p-3 mb-2">
      <div class="flex items-center justify-between gap-2"><div class="font-semibold text-slate-100"><span>${main ? 'Hauptkommandant' : 'Nebenkommandant'}</span>: <span translate="no" class="text-gold-200">${kdNm(h.n?.[0], h.n?.[1], '#' + h.id)}</span></div>
      <div class="text-[11px] text-slate-400 whitespace-nowrap"><span>Lv</span> ${esc(h.lv ?? '–')} · ${'★'.repeat(Math.min(+h.st || 0, 6))}${h.aw ? ' · <span class="text-sky-300">erweckt</span>' : ''}</div></div>
      <div class="mt-2 flex flex-wrap gap-1">${sk || '<span class="text-[11px] text-slate-500">Keine Skills im Bericht.</span>'}</div></div>`;
  }
  function kdSide(sd, title, col) {
    if (!sd) return `<div class="text-sm text-slate-500">Keine Daten.</div>`;
    const gear = (sd.gear || []).map(g => `<div class="flex items-center gap-2 py-1 border-b border-ink-800/60 last:border-0"><span class="w-6 text-center">${KD_SLOT_ICON[g[0]] || '•'}</span><span class="text-[10px] text-slate-500 w-20 shrink-0">${esc(KD_SLOTS[g[0]] || g[0])}</span><span translate="no" class="text-slate-100 flex-1">${kdNm(g[3], g[4], '#' + g[1])}</span>${g[2] ? `<span class="text-[10px] tabular-nums rounded px-1 border border-ink-600 text-slate-400" title="Zusatzwert aus dem Bericht (vermutlich kritische Werte / Erweckung)">${esc(g[2])}</span>` : ''}</div>`).join('');
    const arm = (sd.arm || []).map(a => `<div class="py-1.5 border-b border-ink-800/60 last:border-0"><div class="flex flex-wrap items-center gap-1"><span translate="no" class="text-slate-100 font-medium">${kdNm(a[2], a[3], '#' + a[1])}</span>${(a[4] || []).map(x => `<span translate="no" class="rounded-md bg-violet-500/15 border border-violet-500/40 text-violet-200 px-1.5 py-0.5 text-[10px]">${kdNm(x[1], x[2], '#' + x[0])}</span>`).join('')}</div>
      <div class="text-[11px] text-slate-400 mt-0.5">${(a[5] || []).map(b => `<span translate="no">${kdNm(b[2], b[3], '#' + b[0])}</span> <b class="text-emerald-300 tabular-nums">+${dec((+b[1] || 0) * 100, 1)} %</b>`).join(' · ')}</div></div>`).join('');
    const sum = kdBuffSum(sd.arm).map(([id, o]) => `<span class="inline-flex gap-1 rounded-md border border-ink-600 px-1.5 py-0.5 text-[10px]"><span translate="no">${kdNm(o.en, o.de, '#' + id)}</span> <b class="text-emerald-300 tabular-nums">+${dec(o.v * 100, 1)} %</b></span>`).join(' ');
    return `<div class="min-w-0">
      <div class="flex items-baseline gap-2 mb-2"><h3 class="font-display text-lg" style="color:${col}">${title}</h3><span class="text-sm text-slate-200" translate="no">${sd.abbr ? `[${esc(sd.abbr)}] ` : ''}${esc(sd.name || '–')}</span>${sd.city ? `<span class="text-[11px] text-slate-500"><span>Rathaus</span> ${esc(sd.city)}</span>` : ''}</div>
      ${kdHero(sd.h1, true)}${kdHero(sd.h2, false)}
      <div class="rounded-xl border border-ink-700 bg-ink-950/60 p-3 mb-2"><div class="text-[11px] uppercase tracking-wider text-slate-400 mb-1">Ausrüstung</div>${gear || '<div class="text-[11px] text-slate-500">Keine Ausrüstung im Bericht.</div>'}</div>
      <div class="rounded-xl border border-ink-700 bg-ink-950/60 p-3"><div class="text-[11px] uppercase tracking-wider text-slate-400 mb-1">Rüstung &amp; Inschriften</div>${arm || '<div class="text-[11px] text-slate-500">Keine Rüstung im Bericht.</div>'}
        ${sum ? `<div class="mt-2 pt-2 border-t border-ink-700"><div class="text-[10px] text-slate-500 mb-1">Rüstung gesamt</div><div class="flex flex-wrap gap-1">${sum}</div></div>` : ''}</div></div>`;
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
  function kdRender(row, d, loading) {
    let m = $('kdModal');
    if (!m) { m = document.createElement('div'); m.id = 'kdModal'; m.className = 'fixed inset-0 z-[80] bg-black/70 backdrop-blur-sm overflow-y-auto p-2 sm:p-6'; document.body.appendChild(m); document.body.style.overflow = 'hidden';
      m.addEventListener('click', (ev) => { if (ev.target === m || ev.target.closest('[data-kdclose]')) kdClose(); });
      document.addEventListener('keydown', function esc_(ev) { if (ev.key === 'Escape') { kdClose(); document.removeEventListener('keydown', esc_); } }); }
    const t = row.battle_start ? new Date(row.battle_start).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' }) : '';
    let body;
    if (loading) body = '<div class="py-10 text-center text-sm text-slate-400">Lade Details …</div>';
    else if (d && d.err === 'col') body = '<div class="py-8 text-center text-sm text-amber-200">Die Spalte „detail“ fehlt noch in Supabase. Bitte zuerst das neue SQL ausführen.</div>';
    else if (d && d.err) body = `<div class="py-8 text-center text-sm text-red-300">${esc(d.err)}</div>`;
    else if (!d) body = '<div class="py-8 text-center text-sm text-slate-400">Für diesen Kampf gibt es noch keine Details. Der neue Uploader liest alle Berichte auf dem PC einmal neu ein – danach sind sie da.</div>';
    else body = `<div class="grid lg:grid-cols-2 gap-4 mb-4">${kdSide(d.self, 'Du', '#f5c542')}${kdSide(d.enemy, 'Gegner', '#f87171')}</div>
      <h3 class="font-display text-lg text-gold-300 mb-2">📊 Kampfwerte</h3>${kdStats(d, row)}
      ${(d.samples || []).length > 2 ? `<h3 class="font-display text-lg text-gold-300 mt-4 mb-1">📉 Deine Truppen im Kampfverlauf</h3><div class="text-[11px] text-slate-500 mb-2">${d.fights > 1 ? `<span>Ganzer Bericht mit</span> ${fmt(d.fights)} <span>Gegnern</span> · ` : ''}<span>Rote Punkte = Zeit gegen diesen Gegner.</span></div><div class="h-48"><canvas id="kdChart"></canvas></div>` : ''}`;
    m.innerHTML = `<div class="panel rounded-2xl p-4 sm:p-6 max-w-6xl mx-auto">
      <div class="flex items-start justify-between gap-3 mb-4"><div><h2 class="font-display text-xl text-gold-300">⚔️ Kampfdetails</h2>
        <div class="text-xs text-slate-400 mt-0.5"><span translate="no">${esc(row.self_name || '')}</span> <span>gegen</span> <span translate="no" class="text-red-200">${row.enemy_alliance ? `[${esc(row.enemy_alliance)}] ` : ''}${esc(row.enemy_name || '')}</span>${t ? ' · ' + esc(t) : ''}</div></div>
        <button type="button" data-kdclose class="px-3 py-1.5 rounded-lg border border-ink-600 hover:border-gold-500/60 text-sm">✕ <span>Schließen</span></button></div>${body}</div>`;
    try { kdChart?.destroy(); } catch {} kdChart = null;
    const c = $('kdChart');
    if (c && window.Chart && d?.samples) {
      const t0 = d.t0, t1 = d.t0 != null && d.ticks != null ? d.t0 + d.ticks : null;
      kdChart = new Chart(c, { type: 'line', data: { labels: d.samples.map(s => s[0] - d.samples[0][0] + ' s'), datasets: [
        { label: 'Truppen', data: d.samples.map(s => s[1]), borderColor: '#f5c542', backgroundColor: '#f5c54222', fill: true, tension: .25, pointRadius: d.samples.map(s => t0 != null && s[0] >= t0 && s[0] <= t1 ? 3 : 0), pointBackgroundColor: '#f87171', borderWidth: 2 }] },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: { callbacks: { label: (x) => fmt(x.raw) } } },
          scales: { y: { ticks: { callback: (v) => short(v), color: '#64748b' }, grid: { color: 'rgba(148,163,184,.08)' } }, x: { ticks: { maxTicksLimit: 10, color: '#64748b' }, grid: { display: false } } } } });
    }
  }
  R.viewHooks.battles = () => renderKampf();
  if (R.view === 'battles') renderKampf();
};
