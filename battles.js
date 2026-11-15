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
  const savePassive = () => { clearTimeout(savePassive._t); savePassive._t = setTimeout(() => { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch {} }, 300); };
  if (!$('battlesView')) return;

  var kbRows = null, kbErr = '', kbLoading = false, kbProg = 0, kbShow = 50, kbNpcCols = true;
  var KB_COLS = 'mail_id,opponent_id,account,player_id,battle_start,battle_end,is_pvp,self_name,self_alliance,self_hero1,self_hero2,self_troops_start,self_wounded,self_severe,self_dead,self_healing,self_power_lost,enemy_name,enemy_alliance,enemy_hero1,enemy_hero2,enemy_troops_start,enemy_wounded,enemy_severe,enemy_dead,enemy_power_lost,kill_points';
  async function loadBattles(force) {
    if (kbLoading || (kbRows && !force)) return; kbLoading = true; kbProg = 0; kbErr = '';
    try { const db = RokAuth.db?.(); if (!db) throw new Error('offline');
      const all = [];
      for (let from = 0; from < 100000; from += 1000) {
        let q = await db.from('rok_battles').select(KB_COLS + (kbNpcCols ? ',npc_btype,npc_level,group_size' : '')).order('battle_start', { ascending: false }).order('mail_id').order('opponent_id').range(from, from + 999);
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
  function kxRallyRows(pvp) {
    const st = kbSt();
    return (kxRally || []).filter(r => (!st.acc || String(r.player_id) === st.acc) && kxInRange(r.battle_start) && (pvp ? !!r.is_pvp : !r.is_pvp))
      .map(r => ({ mail_id: r.mail_id, opponent_id: 'rally', battle_start: r.battle_start, player_id: r.player_id, npc_btype: r.npc_btype, npc_level: r.npc_level, group_size: Math.max(2, +r.members || 2), is_pvp: !!r.is_pvp, joined: true }));
  }
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
    const st = kbSt(), rows = kbRows || [];
    let from = null, to = null;
    if (st.days === 'custom') { from = st.from ? new Date(st.from + 'T00:00:00').getTime() : null; to = st.to ? new Date(st.to + 'T23:59:59').getTime() : null; }
    else if (+st.days > 0) from = Date.now() - st.days * 86400000;
    return rows.filter(r => { if (st.acc && String(r.player_id) !== st.acc) return false;
      if (st.type === 'pvp' && !kbIsPvp(r)) return false; if (st.type === 'pve' && r.is_pvp) return false;
      if (st.type === 'pve' && kbCatOf(r.npc_btype, r.group_size) === 'skip') return false;   // Karuak ohne Belohnung
      if (st.type === 'pve' && st.cat && kbCatOf(r.npc_btype, r.group_size) !== st.cat) return false;
      if (!skipMarch && st.march && kbMarchOf(r) !== st.march) return false;
      if (st.type === 'pvp' && st.enemy && kbEnemyOf(r) !== st.enemy) return false;
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
      try { kxRally = await kxLoadAll(db, 'rok_rallies', 'account,mail_id,player_id,battle_start,leader_name,leader_alliance,members,my_hero1,my_hero2,group_kill_points,group_severe,group_dead,enemy_kill_points,opponents,enemy_names,enemy_alliances,is_pvp,npc_btype,npc_level', 'battle_start'); } catch { try { kxRally = await kxLoadAll(db, 'rok_rallies', 'account,mail_id,player_id,battle_start,leader_name,leader_alliance,members,my_hero1,my_hero2,group_kill_points,group_severe,group_dead,enemy_kill_points,opponents,enemy_names,enemy_alliances,is_pvp', 'battle_start'); } catch { kxRally = []; } }
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
    const accOk = r => !st.acc || String(r.player_id) === st.acc;
    // Beute
    const isLoot = mode === 'loot', pve = isLoot || st.type === 'pve', cat = isLoot ? (st.lootCat || '') : (pve ? st.cat || '' : '');
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
    if (!kbRows && !kbLoading) loadBattles();
    kbCharts.forEach(c => { try { c.destroy(); } catch {} }); kbCharts = [];
    const st = kbSt(); let tab = st.tab || 'march'; let cards = (st.cards = st.cards || { kp: true, eLoss: true, sDead: true, sSev: true });
    const segBtn = (attr, k, l, on, cls) => `<button type="button" ${attr}="${k}" aria-pressed="${on}" class="seg-btn rounded-lg ${cls || 'px-2 py-1'} text-xs font-semibold transition">${l}</button>`;
    const inp = 'bg-ink-950 border border-ink-600 rounded-lg px-2 py-1 text-xs focus:outline-none focus:border-gold-500';
    const head = (txt) => `<section id="kampfBox" class="panel rounded-2xl p-5"><h2 class="font-display text-lg text-gold-300">⚔️ Battles</h2>
      <p class="text-xs text-slate-400 mb-3">Deine Kampfberichte aus dem Mailcache des Spiels – der Uploader auf deinem PC lädt sie automatisch hoch. Nur Berichte, die noch im Postfach sind, kommen an.</p>${txt}`;
    let msg = '';
    if (kbLoading && !kbRows) msg = `<div class="py-8 text-center text-sm text-slate-400">Lade Kampfberichte … <span id="kbProg" class="tabular-nums">${fmt(kbProg)}</span></div>`;
    if (msg) { el.innerHTML = head(msg + (!kbLoading ? '<button type="button" id="kbReload" class="mt-2 px-3 py-1 rounded-lg border border-ink-600 hover:border-gold-500/60 text-xs">↻ Neu laden</button>' : '')) + '</section>'; kbBind(el); return; }

    // Ohne Daten sieht die Seite genauso aus – nur leer (für Spieler ohne Uploader)
    if (!kbRows) kbRows = [];
    const note = kbErr && kbErr !== 'missing' ? `<div class="mb-3 text-[11px] text-red-400">Laden hat nicht geklappt: ${esc(kbErr)}</div>`
      : !kbRows.length ? '<div class="mb-3 text-[11px] text-slate-500">Noch keine Kampfberichte – sie kommen automatisch, sobald der Kampf-Uploader auf dem PC läuft.</div>' : '';
    const accs = [...new Map(kbRows.filter(r => r.player_id != null).map(r => [String(r.player_id), `${r.self_name || 'Spieler'}${r.account ? ` (${r.account})` : ''}`])).entries()];
    const accsRes = [...new Map([...accs, ...(rsRows || []).filter(r => r.pid != null).map(r => [String(r.pid), r.acc || ('Spieler ' + r.pid)])]).entries()];   // + Farmen (nur Ressourcen)
    if (st.acc && !accsRes.some(([k]) => k === st.acc)) st.acc = '';
    const pvp = st.type === 'pvp';
    if (!pvp) cards = { ...cards, kp: false };   // PvE bringt keine Kill Points
    const allMarches = [...new Set(kbFiltered(true).map(kbMarchOf))].sort();
    if (st.march && !allMarches.includes(st.march)) st.march = '';
    const rows = kbFiltered(), A = kbAgg(rows), R0 = kbRange(rows);
    // Große Auswahl PvP / PvE
    if (!kxLoot && !kxLoading) loadKampfExtra();
    const rallyPvp = kxRallyRows(true), rallyPve = kxRallyRows(false).filter(r => kbCatOf(r.npc_btype, r.group_size) !== 'skip');
    const nPvp = new Set(kbRows.filter(kbIsPvp).map(r => r.mail_id).concat(rallyPvp.map(r => r.mail_id))).size, nPve = new Set(kbRows.filter(r => !r.is_pvp && kbCatOf(r.npc_btype, r.group_size) !== 'skip').map(r => r.mail_id)).size;
    const bigBtn = (k, icon, l, sub, n) => `<button type="button" data-kbtype="${k}" aria-pressed="${st.type === k}" class="seg-btn rounded-xl px-5 py-4 text-left transition">
        <div class="flex items-center gap-3"><span class="text-3xl leading-none">${icon}</span><span><span class="block font-display text-xl tracking-wide">${l}</span><span class="block text-[11px] opacity-80">${sub}</span></span><span class="ml-auto text-sm tabular-nums opacity-80">${fmt(n)}</span></div></button>`;
    const typeSel = `<div class="grid grid-cols-2 gap-2 p-1.5 rounded-2xl bg-ink-950 border border-ink-700 mb-3">
        ${bigBtn('pvp', '⚔️', 'PvP', 'Kämpfe gegen Spieler mit Kill Points', nPvp)}${bigBtn('pve', '🪓', 'PvE', 'Barbaren, Forts, Baulurs, Raid-Boss und Belohnungen', nPve)}</div>`;
    // PvE: Kategorie-Auswahl
    const pveAll = kbRows.filter(r => !r.is_pvp && (!st.acc || String(r.player_id) === st.acc) && kxInRange(r.battle_start)).concat(rallyPve);
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
    const filters = typeSel + catSel + timeRow(marchSel + enemyChip);
    // Unterseiten: Battles · Loot · Ressourcen
    const page = st.page || 'battles';
    const subTabs = `<div class="grid grid-cols-3 gap-1 p-1 rounded-xl bg-ink-950 border border-ink-700 mb-4 max-w-xl">${[['battles', '⚔️ Battles'], ['loot', '🎁 Loot'], ['res', '🌾 Ressourcen']].map(([k, l]) => segBtn('data-kbpage', k, l, page === k, 'py-2 text-sm')).join('')}</div>`;
    const pageHead = (icon, t, sub) => `<section class="panel rounded-2xl p-5"><h2 class="font-display text-lg text-gold-300">${icon} ${t}</h2><p class="text-xs text-slate-400 mb-3">${sub}</p>`;
    if (page === 'loot') {
      if (!kxLoot && !kxLoading) loadKampfExtra();
      const lc = st.lootCat || '';
      const lootCats = `<div class="flex flex-wrap gap-1 p-1 rounded-xl bg-ink-950 border border-ink-700 mb-1">${segBtn('data-kblootcat', '', 'Alle', !lc, 'px-3 py-1.5')}${KB_CATS.map(([k, l]) => segBtn('data-kblootcat', k, l, lc === k, 'px-3 py-1.5')).join('')}</div>`;
      el.innerHTML = subTabs + pageHead('🎁', 'Loot', 'Alles, was du aus PvE bekommen hast – aus den Kampfberichten und aus den eigenen Belohnungs-Mails.') + timeRow('') + lootCats + '</section>'
        + (kxLoot ? kxSections('loot') : '<section class="panel rounded-2xl p-6 text-center text-sm text-slate-400">Lade Loot …</section>');
      ['kxLootBox'].forEach(id => $(id) && makeFold($(id), id)); kbBind(el); return;
    }
    if (page === 'res') {
      if (!rsRows && !rsLoading) loadRes();
      el.innerHTML = subTabs + pageHead('🌾', 'Ressourcen', 'Was deine Sammeltrupps auf der Karte gefarmt haben – aus den Sammel-Mails im Postfach, auch von den Farmen aus MuMu.') + timeRow('', accsRes) + '</section>' + rsHtml();
      kbBind(el); rsDraw(); return;
    }
    const last = kbRows[0]?.battle_start ? new Date(kbRows[0].battle_start) : null;
    const nJoin = new Set((pvp ? rallyPvp : rallyPve).map(r => r.mail_id)).size;
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
        pvp ? tradeCol : null, ...lossCols].filter(Boolean), one, { k: 't', dir: 'desc' }, lim);
    }
    const tabs = !pvp ? '<h2 class="font-display text-lg text-gold-300 mb-2">📜 Alle Kämpfe</h2>' : `<div class="grid grid-cols-2 sm:grid-cols-4 gap-1 p-1 rounded-xl bg-ink-950 border border-ink-700 mb-3 max-w-2xl">${[['march', '🛡️ Märsche'], ['day', '📅 Pro Tag'], ['enemy', pvp ? '🎯 Gegner' : '🪓 Ziele'], ['list', '📜 Alle Kämpfe']].map(([k, l]) => segBtn('data-kbtab', k, l, tab === k, 'py-1.5')).join('')}</div>`;
    const more = lim && T.n > lim && tab !== 'march' ? `<button type="button" id="kbMore" class="mt-3 px-3 py-1.5 rounded-lg border border-ink-600 hover:border-gold-500/60 text-xs">Mehr anzeigen (${fmt(T.n - lim)} weitere)</button>` : '';
    el.innerHTML = subTabs + head(filters + info + topBar + cardsBox) + `</section>${extraBox}${trend}${pvp ? analysis + kxSections() : ''}
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
  var RS_TYPES = { 1: ['🌽', 'Nahrung', '#fbbf24'], 2: ['🪵', 'Holz', '#a16207'], 3: ['🪨', 'Stein', '#94a3b8'], 4: ['🪙', 'Gold', '#f5c542'], 5: ['💎', 'Edelsteine', '#60a5fa'] };
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
  function rsFiltered() { const st = kbSt(); return (rsRows || []).filter(r => (!st.acc || String(r.pid) === st.acc) && kxInRange(r.t)); }
  function rsHtml() {
    if (!rsRows) return '<section class="panel rounded-2xl p-6 text-center text-sm text-slate-400">Lade Sammel-Mails …</section>';
    const rows = rsFiltered(), by = {};
    rows.forEach(r => { const o = by[r.type] || (by[r.type] = { val: 0, n: 0, talent: 0 }); o.val += r.val; o.n++; o.talent += r.talent; });
    const types = Object.keys(by).map(Number).sort((a, b) => a - b), tot = rows.reduce((a, r) => a + r.val, 0), cry = rows.reduce((a, r) => a + r.crystal, 0);
    const tile = (icon, l, v, sub, c) => `<div class="rounded-xl border border-ink-700 bg-ink-950/70 p-4"><div class="flex items-center gap-2 text-xs text-slate-400"><span class="text-lg leading-none">${icon}</span><span>${l}</span></div><div class="font-display text-2xl tabular-nums" style="color:${c}">${short(v)}</div><div class="text-[11px] text-slate-500">${sub}</div></div>`;
    const tiles = `<div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
        ${tile('📦', 'Gesamt', tot, `${fmt(rows.length)}× <span>gesammelt</span>`, '#ffffff')}
        ${(types.length ? types : [1, 2, 3, 4]).map(t => { const [i, l, c] = rsType(t), o = by[t] || { val: 0, n: 0, talent: 0 }; return tile(i, l, o.val, `${fmt(o.n)}× · <span>Talent</span> +${short(o.talent)}`, c); }).join('')}
        ${cry ? tile('🔷', 'Kristalle', cry, '<span>aus Kristallminen</span>', '#38bdf8') : ''}</div>`;
    const err = rsErr ? `<div class="mb-2 text-[11px] text-red-400">Laden hat nicht geklappt: ${esc(rsErr)}</div>` : '';
    const list = rows.slice(0, 100);
    const td = 'py-1 px-2 text-right tabular-nums';
    // Pro Account (jede Farm unter ihrer Spieler-ID) + Summe
    const st = kbSt(), accRows = (rsRows || []).filter(r => kxInRange(r.t)), per = new Map();
    accRows.forEach(r => { const k = String(r.pid); const o = per.get(k) || { pid: k, acc: r.acc, n: 0, v: {}, tot: 0, last: 0 }; o.n++; o.v[r.type] = (o.v[r.type] || 0) + r.val; o.tot += r.val; o.last = Math.max(o.last, Date.parse(r.t || 0) || 0); per.set(k, o); });
    const accs = [...per.values()].sort((a, b) => b.tot - a.tot), cols = [1, 2, 3, 4, ...[...new Set(accRows.map(r => r.type))].filter(t => t > 4).sort()];
    const sum = { n: 0, v: {}, tot: 0 }; accs.forEach(o => { sum.n += o.n; sum.tot += o.tot; cols.forEach(t => sum.v[t] = (sum.v[t] || 0) + (o.v[t] || 0)); });
    const perBox = `<section id="rsAccBox" class="panel rounded-2xl p-5"><h2 class="font-display text-lg text-gold-300 mb-1">👥 Pro Account</h2>
      <p class="text-xs text-slate-400 mb-3">Jede Farm einzeln (Spieler-ID) und unten alle zusammen. Antippen, um nur diesen Account zu sehen.</p>
      ${accs.length ? `<div class="overflow-x-auto rounded-lg border border-ink-700"><table class="w-full text-xs"><thead class="text-[10px] uppercase tracking-wider text-slate-400"><tr class="border-b border-ink-700">
        <th class="py-2 px-2 text-left font-medium">Account</th><th class="py-2 px-2 text-right font-medium">ID</th><th class="py-2 px-2 text-right font-medium">Sammelzüge</th>${cols.map(t => { const [i, l] = rsType(t); return `<th class="py-2 px-2 text-right font-medium">${i} <span>${l}</span></th>`; }).join('')}<th class="py-2 px-2 text-right font-medium">Gesamt</th><th class="py-2 px-2 text-right font-medium">Zuletzt</th></tr></thead>
        <tbody>${accs.map(o => `<tr class="border-b border-ink-800/60 hover:bg-ink-800/40 cursor-pointer ${st.acc === o.pid ? 'bg-gold-500/10' : ''}" data-kbaccpick="${esc(o.pid)}"><td class="py-1.5 px-2 text-slate-100" translate="no">${esc(o.acc || '–')}</td><td class="${td} text-slate-500">${esc(o.pid)}</td><td class="${td}">${fmt(o.n)}</td>${cols.map(t => `<td class="${td}">${o.v[t] ? short(o.v[t]) : '–'}</td>`).join('')}<td class="${td} text-gold-300 font-semibold">${short(o.tot)}</td><td class="${td} text-slate-400">${o.last ? new Date(o.last).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '–'}</td></tr>`).join('')}
          <tr class="bg-ink-900/70 font-semibold"><td class="py-2 px-2 text-gold-300">Σ <span>Alle zusammen</span></td><td class="${td} text-slate-500">${fmt(accs.length)}</td><td class="${td}">${fmt(sum.n)}</td>${cols.map(t => `<td class="${td}">${short(sum.v[t] || 0)}</td>`).join('')}<td class="${td} text-gold-300">${short(sum.tot)}</td><td></td></tr></tbody></table></div>`
        : '<div class="text-sm text-slate-500">Noch keine Sammel-Mails.</div>'}</section>`;
    return `<section class="panel rounded-2xl p-5">${err}${tiles}</section>${perBox}
      <section id="rsTrendBox" class="panel rounded-2xl p-5"><h2 class="font-display text-lg text-gold-300 mb-2">Gesammelt pro Tag</h2><div class="h-64"><canvas id="rsChart"></canvas></div></section>
      <section class="panel rounded-2xl p-5"><h2 class="font-display text-lg text-gold-300 mb-2">📜 Letzte Sammel-Mails</h2>
        ${list.length ? `<div class="overflow-x-auto rounded-lg border border-ink-700"><table class="w-full text-xs"><thead class="text-[10px] uppercase tracking-wider text-slate-400"><tr class="border-b border-ink-700">
          <th class="py-2 px-2 text-left font-medium">Datum</th><th class="py-2 px-2 text-left font-medium">Account</th><th class="py-2 px-2 text-left font-medium">Ressource</th><th class="py-2 px-2 text-right font-medium">Level</th><th class="py-2 px-2 text-right font-medium">Menge</th><th class="py-2 px-2 text-right font-medium">davon Talent</th></tr></thead>
          <tbody>${list.map(r => { const [i, l] = rsType(r.type); return `<tr class="border-b border-ink-800/60"><td class="py-1 px-2 whitespace-nowrap text-slate-400">${r.t ? new Date(r.t).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' }) : '–'}</td><td class="py-1 px-2" translate="no">${esc(r.acc || r.pid || '–')}</td><td class="py-1 px-2">${i} <span>${l}</span></td><td class="${td}">${r.lvl || '–'}</td><td class="${td} text-gold-300">${fmt(r.val)}</td><td class="${td} text-slate-400">${r.talent ? fmt(r.talent) : '–'}</td></tr>`; }).join('')}</tbody></table></div>
          ${rows.length > 100 ? '<div class="mt-2 text-[11px] text-slate-500">Nur die letzten 100.</div>' : ''}` : '<div class="text-sm text-slate-500">Keine Sammel-Mails in diesem Zeitraum.</div>'}</section>`;
  }
  function rsDraw() {
    const c = $('rsChart'); if (!c || !window.Chart || !rsRows) return;
    const rows = rsFiltered(), R0 = kbRange(rows.map(r => ({ battle_start: r.t })));
    const n = Math.min(R0.n, 400), from = new Date(R0.from.getTime() + (R0.n - n) * 86400000), keys = [], labels = [];
    for (let i = 0; i < n; i++) { const d = new Date(from.getTime() + i * 86400000); keys.push(isoDay(d)); labels.push(d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' })); }
    const idx = new Map(keys.map((k, i) => [k, i])), types = [...new Set(rows.map(r => r.type))].sort((a, b) => a - b), data = {};
    types.forEach(t => data[t] = keys.map(() => 0));
    rows.forEach(r => { if (!r.t) return; const i = idx.get(isoDay(new Date(r.t))); if (i != null) data[r.type][i] += r.val; });
    kbCharts.push(new Chart(c, { type: 'bar', data: { labels, datasets: types.map(t => { const [, l, col] = rsType(t); return { label: l, data: data[t], backgroundColor: col + 'dd', borderRadius: 3, maxBarThickness: 22 }; }) },
      options: { responsive: true, maintainAspectRatio: false, interaction: { mode: 'index', intersect: false }, plugins: { legend: { labels: { boxWidth: 10, color: '#94a3b8', font: { size: 11 } } }, tooltip: { callbacks: { label: (x) => `${x.dataset.label}: ${fmt(x.raw)}` } } },
        scales: { x: { stacked: true, ticks: { maxTicksLimit: 10, color: '#64748b' }, grid: { display: false } }, y: { stacked: true, beginAtZero: true, suggestedMax: 1, ticks: { callback: (v) => short(v), color: '#64748b' }, grid: { color: 'rgba(148,163,184,.08)' } } } } }));
  }
  function kbBind(el) {
    const st = kbSt(), re = () => { kbShow = 50; savePassive(); renderKampf(); };
    $('kbReload')?.addEventListener('click', () => { loadBattles(true); loadKampfExtra(true); if (st.page === 'res') loadRes(true); renderKampf(); });
    el.querySelector('[data-kbacc]')?.addEventListener('change', (ev) => { st.acc = ev.target.value; re(); });
    el.querySelectorAll('[data-kbtype]').forEach(b => b.onclick = () => { st.type = b.dataset.kbtype; st.march = ''; st.enemy = ''; re(); });
    el.querySelectorAll('[data-kbaccpick]').forEach(b => b.onclick = () => { const v = b.dataset.kbaccpick; st.acc = st.acc === v ? '' : v; re(); });
    el.querySelectorAll('[data-kbpage]').forEach(b => b.onclick = () => { st.page = b.dataset.kbpage; re(); });
    el.querySelectorAll('[data-kblootcat]').forEach(b => b.onclick = () => { st.lootCat = b.dataset.kblootcat; re(); });
    el.querySelectorAll('[data-kbheal]').forEach(b => b.onclick = () => { st.healType = b.dataset.kbheal; re(); });
    el.querySelectorAll('[data-kbkvk]').forEach(b => b.onclick = () => { const k = (st.kvks || [])[+b.dataset.kbkvk]; if (!k) return; st.days = 'custom'; st.from = k.from; st.to = k.to; re(); });
    el.querySelectorAll('[data-kbkvkdel]').forEach(b => b.onclick = () => { (st.kvks || []).splice(+b.dataset.kbkvkdel, 1); re(); });
    el.querySelector('[data-kbkvksave]')?.addEventListener('click', () => { const n = (el.querySelector('[data-kbkvkname]')?.value || '').trim() || 'KvK';
      (st.kvks = st.kvks || []).push({ n, from: st.from, to: st.to }); st.kvks.sort((a, b) => a.from.localeCompare(b.from)); re(); });
    el.querySelectorAll('[data-kbcat]').forEach(b => b.onclick = () => { st.cat = b.dataset.kbcat; re(); });
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
  }
  R.viewHooks.battles = () => renderKampf();
  if (R.view === 'battles') renderKampf();
};
