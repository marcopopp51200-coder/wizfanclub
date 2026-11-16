// Wiz fan Club – Memory (Jahresrückblick im Stil von Spotify Wrapped)
// Haupt-Reiter neben My Data und Rangliste. Daten: AnniversaryMemory aus dem Spiel (sonst nur im Jubiläums-Popup).
// Supabase: rok_memory (user_id, year, data jsonb) – jeder sieht und bearbeitet nur seine eigenen Jahre.
// Eigenständig: hängt sich nach dem Start von scanner.js (window.RokApp) selbst ein – scanner.js muss nicht geändert werden.
(function () {
  'use strict';

  // ---------- Englische Texte (werden in i18n.js eingehängt, damit nichts Deutsches in der EN-Ansicht bleibt) ----------
  const EN = {
    '🎁 Memory': '🎁 Memory', 'Memory': 'Memory', 'Dein Jahresrückblick': 'Your year in review', 'Dein Jahr': 'Your year',
    'in Rise of Kingdoms': 'in Rise of Kingdoms', 'Antippen: rechts weiter, links zurück': 'Tap: right for next, left for back',
    'Los geht’s': 'Let’s go', 'Königreich': 'Kingdom',
    'Du warst online': 'You were online', 'Stunden': 'hours', 'Tage am Stück im Spiel': 'days in the game non-stop',
    'Stunden pro Tag': 'hours per day', 'Login-Tage': 'login days', 'Kein einziger Tag ausgelassen.': 'Not a single day missed.',
    'Du hast gekämpft': 'You fought', 'PvP-Kämpfe': 'PvP battles', 'Siege': 'Wins', 'Siegquote': 'Win rate', 'Kill-Differenz': 'Kill difference',
    'Kämpfe pro Tag': 'battles per day',
    'Dein Partner auf dem Schlachtfeld': 'Your partner on the battlefield', 'Dein häufigster PvP-Kommandant': 'Your most used PvP commander', 'Kommandant': 'Commander',
    'Barbaren erledigt': 'barbarians defeated', 'Höchstes Level': 'Highest level', 'Barbarenfestungen': 'Barbarian forts', 'Festungen': 'Forts', 'Pro Tag': 'Per day',
    'Die Barbaren zittern': 'The barbarians tremble',
    'Ressourcen gesammelt': 'resources gathered', 'pro Tag – jeden Tag, das ganze Jahr': 'per day – every day, all year', 'Deine Sammeltrupps waren fleißig': 'Your gatherers were busy',
    'Truppen ausgebildet': 'troops trained', 'Deine Lieblingstruppe': 'Your favourite troop type', 'davon': 'of them', 'Die Kasernen liefen heiß': 'The barracks ran hot',
    'Infanterie': 'Infantry', 'Kavallerie': 'Cavalry', 'Bogenschützen': 'Archers', 'Belagerung': 'Siege',
    'Ark-of-Osiris-Spiele': 'Ark of Osiris games', 'Bestwert': 'Best score', 'Punkte': 'points', 'Um die Arche gekämpft': 'Fought for the Ark',
    'Geben und Nehmen': 'Give and take', 'Meiste Ressourcen geschickt an': 'Sent the most resources to', 'Meiste Ressourcen bekommen von': 'Received the most resources from',
    'Ressourcen': 'resources',
    'Chatnachrichten': 'chat messages', 'Du hattest viel zu sagen': 'You had a lot to say', 'Nachrichten pro Tag': 'messages per day', 'VIP-Stufe': 'VIP level',
    'Dein stärkster Tag': 'Your strongest day', 'Macht an einem Tag': 'power in one day', 'Account angelegt am': 'Account created on', 'Tage dabei': 'days in the game',
    'Dein Spielertyp': 'Your player type', 'Dein Jahr in Zahlen': 'Your year in numbers',
    '⚔️ Der Kriegsherr': '⚔️ The Warlord', 'Kämpft lieber, als zu warten – das Schlachtfeld ist dein Zuhause.': 'Would rather fight than wait – the battlefield is your home.',
    '🪓 Der Barbarenjäger': '🪓 The Barbarian Hunter', 'Kein Barbar ist vor dir sicher.': 'No barbarian is safe from you.',
    '🌾 Der Ressourcen-Magnat': '🌾 The Resource Tycoon', 'Deine Lager sind nie leer.': 'Your storehouses are never empty.',
    '🛡️ Der Allrounder': '🛡️ The All-Rounder', 'Kämpfen, farmen, sammeln – du machst alles.': 'Fight, farm, gather – you do it all.',
    'Online': 'Online', 'Ausgebildet': 'Trained', 'Gesammelt': 'Gathered', 'Barbaren': 'Barbarians', 'PvP': 'PvP', 'Ark': 'Ark', 'Chat': 'Chat',
    'Stärkster Tag': 'Strongest day',
    '⏸ Pause': '⏸ Pause', '▶ Weiter': '▶ Play', '↺ Von vorn': '↺ Restart', '🖼️ Als Bild speichern': '🖼️ Save as image',
    '📋 Alle Werte': '📋 All values', '✏️ Werte bearbeiten': '✏️ Edit values', 'Jahr': 'Year', '+ Neues Jahr': '+ New year',
    '💾 Speichern': '💾 Save', 'Abbrechen': 'Cancel', '✓ Gespeichert': '✓ Saved', 'Speichern hat nicht geklappt:': 'Saving failed:',
    '📥 JSON einfügen': '📥 Paste JSON', '📤 JSON kopieren': '📤 Copy JSON', '✓ Kopiert': '✓ Copied', 'Übernehmen': 'Apply',
    'Das JSON ist ungültig.': 'The JSON is invalid.',
    'Noch kein Jahresrückblick': 'No year in review yet',
    'Trag deine Werte aus dem Jubiläums-Popup (AnniversaryMemory) ein – dann entsteht hier dein Rückblick.': 'Enter your values from the anniversary popup (AnniversaryMemory) – then your review appears here.',
    'Lade Memory …': 'Loading Memory …',
    'Die Tabelle rok_memory fehlt noch in Supabase – bitte zuerst das SQL ausführen. Bis dahin wird nur in diesem Browser gespeichert.': 'The table rok_memory is still missing in Supabase – please run the SQL first. Until then it is only saved in this browser.',
    'Nur du siehst deinen Rückblick.': 'Only you can see your review.',
    'PvP-Kämpfe gesamt': 'PvP battles total', 'davon gewonnen': 'of them won', 'Barbaren getötet': 'Barbarians killed', 'Höchstes Barbaren-Level': 'Highest barbarian level',
    'Truppen gesamt': 'Troops total', 'Meiste Truppenart': 'Most trained troop type', 'davon ausgebildet': 'of it trained', 'Stunden online': 'Hours online',
    'Häufigster PvP-Kommandant (ID)': 'Most used PvP commander (ID)', 'Name des Kommandanten (optional)': 'Commander name (optional)',
    'Ark-Spiele': 'Ark games', 'Ark-Siege': 'Ark wins', 'Ark-Bestwert': 'Ark best score', 'Bekommene Menge': 'Amount received',
    'Macht-Zuwachs am stärksten Tag': 'Power gain on the strongest day', 'Kampf': 'Combat', 'PvE': 'PvE', 'Wirtschaft': 'Economy', 'Aktivität': 'Activity', 'Freunde': 'Friends', 'Meilensteine': 'Milestones',
    '— wählen —': '— choose —',
    'Deine Reise begann am': 'Your journey began on', 'Start-Kultur': 'Starting civilization', 'Start-Königreich': 'Starting kingdom', 'Migrationen': 'Migrations', 'Kulturwechsel': 'Civilization changes',
    'aller Statthalter': 'of all governors', 'Sammelzüge': 'Gathering trips', 'Meiste Ressource': 'Most gathered resource', 'Edelsteine erhalten': 'Gems received', 'Sammeln': 'Gathering',
    'Nahrung': 'Food', 'Holz': 'Wood', 'Stein': 'Stone', 'Gold': 'Gold', 'Edelsteine': 'Gems',
    'Raid-Boss Siege': 'Raid boss wins', 'Gelehrter-Teilnahmen': 'Lyceum participations', 'Raid-Boss Teilnahmen': 'Raid boss participations', 'Unvergleichlicher Gelehrter': 'Lyceum of Wisdom', 'Ark-Durchschnitt': 'Ark average',
    'Deine Allianz': 'Your alliance', 'Tage Seite an Seite': 'days side by side', 'Zeit für andere gespart': 'Time saved for others', 'Hilfe bekommen': 'Help received',
    'Allianz mit den meisten Tagen': 'Alliance with the most days', 'Tage in der Allianz': 'Days in the alliance', 'Durch deine Hilfe gespart (Sek.)': 'Saved through your help (sec.)', 'Durch Hilfe bekommen (Sek.)': 'Received through help (sec.)',
    'Geschickte Menge': 'Amount sent', 'Tägliche Aufgaben': 'Daily quests', 'Tägliche Aufgaben (Ø)': 'Daily quests (avg)', 'Ressourcen in Macht gesteckt': 'Resources invested in power', 'davon gesammelt': 'of it gathered',
    'Du gehörst zu den Besten': 'You are among the best', 'Ranglisten': 'Rankings', 'Top % Kill-Differenz': 'Top % kill difference', 'Top % Sammeln': 'Top % gathering', 'Top % Edelsteine': 'Top % gems', 'Top % Chat': 'Top % chat', 'Top % Tägliche Aufgaben': 'Top % daily quests',
    'z. B. 0,027': 'e.g. 0.027', 'Start-Königreich': 'Starting kingdom', 'Typ': 'Type', 'Mrd.': 'B', 'Mio.': 'M', 'Tsd.': 'K', 'seit': 'since',
  };
  function hookI18n() { try { const t = window.I18N?.translations?.en?.texts; if (t) Object.keys(EN).forEach(k => { if (t[k] == null) t[k] = EN[k]; }); } catch {} }
  hookI18n();
  const tr = (s) => { try { return window.I18N?.tr ? window.I18N.tr(s) : s; } catch { return s; } };

  // ---------- Felder (Pfad im JSON, Beschriftung, Art, Gruppe) ----------
  const FIELDS = [
    ['pvp.battles', 'PvP-Kämpfe gesamt', 'int', 'Kampf'], ['pvp.wins', 'davon gewonnen', 'int', 'Kampf'], ['pvp.killDiff', 'Kill-Differenz', 'int', 'Kampf'],
    ['cmd.id', 'Häufigster PvP-Kommandant (ID)', 'text', 'Kampf'], ['cmd.name', 'Name des Kommandanten (optional)', 'text', 'Kampf'],
    ['barb.kills', 'Barbaren getötet', 'int', 'PvE'], ['barb.maxLevel', 'Höchstes Barbaren-Level', 'int', 'PvE'], ['barb.forts', 'Barbarenfestungen', 'int', 'PvE'],
    ['ark.games', 'Ark-Spiele', 'int', 'PvE'], ['ark.wins', 'Ark-Siege', 'int', 'PvE'], ['ark.best', 'Ark-Bestwert', 'int', 'PvE'], ['ark.avg', 'Ark-Durchschnitt', 'int', 'PvE'],
    ['raid.joined', 'Raid-Boss Teilnahmen', 'int', 'PvE'], ['raid.won', 'Raid-Boss Siege', 'int', 'PvE'], ['scholar.joined', 'Unvergleichlicher Gelehrter', 'int', 'PvE'],
    ['res.gathered', 'Ressourcen gesammelt', 'int', 'Wirtschaft'], ['res.trips', 'Sammelzüge', 'int', 'Wirtschaft'], ['res.topType', 'Meiste Ressource', 'res', 'Wirtschaft'], ['res.topSum', 'davon gesammelt', 'int', 'Wirtschaft'],
    ['res.gems', 'Edelsteine erhalten', 'int', 'Wirtschaft'], ['res.powerInvest', 'Ressourcen in Macht gesteckt', 'int', 'Wirtschaft'], ['troops.trained', 'Truppen gesamt', 'int', 'Wirtschaft'],
    ['troops.topType', 'Meiste Truppenart', 'type', 'Wirtschaft'], ['troops.topCount', 'davon ausgebildet', 'int', 'Wirtschaft'],
    ['online.hours', 'Stunden online', 'int', 'Aktivität'], ['online.days', 'Login-Tage', 'int', 'Aktivität'], ['online.chat', 'Chatnachrichten', 'int', 'Aktivität'], ['online.vip', 'VIP-Stufe', 'int', 'Aktivität'], ['online.quests', 'Tägliche Aufgaben (Ø)', 'int', 'Aktivität'],
    ['alliance.name', 'Allianz mit den meisten Tagen', 'text', 'Freunde'], ['alliance.days', 'Tage in der Allianz', 'int', 'Freunde'],
    ['help.givenSec', 'Durch deine Hilfe gespart (Sek.)', 'int', 'Freunde'], ['help.gotSec', 'Durch Hilfe bekommen (Sek.)', 'int', 'Freunde'],
    ['give.sentTo', 'Meiste Ressourcen geschickt an', 'text', 'Freunde'], ['give.sentAmount', 'Geschickte Menge', 'int', 'Freunde'], ['give.fromName', 'Meiste Ressourcen bekommen von', 'text', 'Freunde'], ['give.fromAmount', 'Bekommene Menge', 'int', 'Freunde'],
    ['acc.created', 'Account angelegt am', 'date', 'Meilensteine'], ['acc.civ', 'Start-Kultur', 'text', 'Meilensteine'], ['acc.civChanges', 'Kulturwechsel', 'int', 'Meilensteine'],
    ['acc.kingdomStart', 'Start-Königreich', 'int', 'Meilensteine'], ['acc.migrations', 'Migrationen', 'int', 'Meilensteine'], ['acc.bestDay', 'Stärkster Tag', 'date', 'Meilensteine'], ['acc.bestGain', 'Macht-Zuwachs am stärksten Tag', 'int', 'Meilensteine'],
    ['top.killDiff', 'Top % Kill-Differenz', 'top', 'Ranglisten'], ['top.gather', 'Top % Sammeln', 'top', 'Ranglisten'], ['top.gems', 'Top % Edelsteine', 'top', 'Ranglisten'],
    ['top.chat', 'Top % Chat', 'top', 'Ranglisten'], ['top.quests', 'Top % Tägliche Aufgaben', 'top', 'Ranglisten'],
  ];
  const RES = { food: ['🌽', 'Nahrung'], wood: ['🪵', 'Holz'], stone: ['🪨', 'Stein'], gold: ['🪙', 'Gold'], gems: ['💎', 'Edelsteine'] };
  const TROOP = { 1: ['🛡️', 'Infanterie'], 2: ['🐎', 'Kavallerie'], 3: ['🏹', 'Bogenschützen'], 4: ['🪨', 'Belagerung'] };

  // ---------- Helfer ----------
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const num = (v) => { const n = Number(String(v ?? '').replace(/[^\d.-]/g, '')); return isFinite(n) ? n : 0; };
  const get = (o, p) => p.split('.').reduce((a, k) => (a == null ? undefined : a[k]), o);
  const set = (o, p, v) => { const ks = p.split('.'); let a = o; ks.slice(0, -1).forEach(k => { if (!a[k] || typeof a[k] !== 'object') a[k] = {}; a = a[k]; }); a[ks[ks.length - 1]] = v; };
  const de = (n, f = 0) => (Number(n) || 0).toLocaleString('de-DE', { maximumFractionDigits: f, minimumFractionDigits: 0 });
  const shortParts = (n) => { n = Number(n) || 0; const a = Math.abs(n);
    if (a >= 1e9) return [de(n / 1e9, 2), 'Mrd.']; if (a >= 1e6) return [de(n / 1e6, 2), 'Mio.']; if (a >= 1e4) return [de(n / 1e3, 1), 'Tsd.']; return [de(n), '']; };
  const shortTxt = (n) => { const [a, b] = shortParts(n); return b ? `${a} ${tr(b)}` : a; };
  const dateDe = (iso) => { const m = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})/); return m ? `${m[3]}.${m[2]}.${m[1]}` : String(iso || ''); };
  const dateIso = (s) => { s = String(s || '').trim(); let m = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/); if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`; m = s.match(/^(\d{4})-(\d{2})-(\d{2})/); return m ? m[0] : s; };
  const numDec = (v) => { const n = parseFloat(String(v ?? '').replace(/\s/g, '').replace(',', '.')); return isFinite(n) ? n : 0; };
  // Anteil der besseren Statthalter (0,00027) → „Top 0,027 %“
  const topTxt = (v) => { const p = Number(v) * 100; return 'Top ' + de(p, p < 0.1 ? 3 : p < 1 ? 2 : 1) + ' %'; };
  const hrs = (sec) => de(num(sec) / 3600);
  const enOr = (de_, en_) => { try { return window.I18N?.lang?.() === 'en' && en_ ? en_ : de_; } catch { return de_; } };
  const has = (v) => v != null && v !== '' && !(typeof v === 'number' && !isFinite(v));
  const daysOfYear = (d) => Math.max(1, num(d?.online?.days) || 365);

  // ---------- Stil (einmal) ----------
  function css() {
    if (document.getElementById('mwStyle')) return;
    const st = document.createElement('style'); st.id = 'mwStyle';
    st.textContent = `
      #mwStory { position:relative; width:100%; max-width:410px; aspect-ratio:9/16; max-height:80vh; min-height:540px; margin:0 auto; border-radius:1.6rem; overflow:hidden; user-select:none; -webkit-user-select:none;
                 box-shadow:0 30px 60px -25px rgba(0,0,0,.9), 0 0 0 1px rgba(255,255,255,.08); cursor:pointer; touch-action:manipulation; }
      #mwStory .mw-slide { position:absolute; inset:0; display:flex; flex-direction:column; justify-content:center; padding:3.6rem 1.6rem 2.2rem; color:#fff; transition:background .5s; }
      #mwStory .mw-bars { position:absolute; top:.8rem; left:.8rem; right:.8rem; display:flex; gap:4px; z-index:5; }
      #mwStory .mw-bar { flex:1; height:3px; border-radius:3px; background:rgba(255,255,255,.28); overflow:hidden; }
      #mwStory .mw-bar > i { display:block; height:100%; width:0; background:#fff; }
      #mwStory .mw-head { position:absolute; top:1.45rem; left:1rem; right:1rem; display:flex; justify-content:space-between; align-items:center; z-index:5; font-size:.72rem; font-weight:700; letter-spacing:.08em; text-transform:uppercase; opacity:.85; }
      #mwStory .mw-in { opacity:0; transform:translateY(18px); animation:mwIn .7s cubic-bezier(.2,.8,.2,1) forwards; }
      @keyframes mwIn { to { opacity:1; transform:none; } }
      #mwStory .mw-pop { opacity:0; transform:scale(.6) rotate(-6deg); animation:mwPop .8s cubic-bezier(.2,1.4,.3,1) forwards; }
      @keyframes mwPop { to { opacity:1; transform:none; } }
      #mwStory .mw-big { font-family:Inter,system-ui,sans-serif; font-weight:900; line-height:.95; letter-spacing:-.04em; font-size:clamp(3rem,15vw,4.6rem); }
      #mwStory .mw-kick { font-size:1.05rem; font-weight:700; opacity:.92; }
      #mwStory .mw-sub { font-size:1.15rem; font-weight:700; }
      #mwStory .mw-note { font-size:.92rem; opacity:.85; }
      #mwStory .mw-chip { display:flex; flex-direction:column; gap:.1rem; padding:.7rem .8rem; border-radius:1rem; background:rgba(0,0,0,.22); backdrop-filter:blur(4px); }
      #mwStory .mw-chip b { font-size:1.35rem; font-weight:900; letter-spacing:-.02em; }
      #mwStory .mw-chip > span { overflow-wrap:anywhere; font-size:.72rem; font-weight:600; opacity:.8; text-transform:uppercase; letter-spacing:.04em; }
      #mwStory .mw-emoji { position:absolute; font-size:9rem; opacity:.16; right:-1.2rem; bottom:-1rem; transform:rotate(-12deg); pointer-events:none; animation:mwFloat 6s ease-in-out infinite; }
      @keyframes mwFloat { 50% { transform:rotate(-6deg) translateY(-10px); } }
      #mwStory .mw-blob { position:absolute; border-radius:50%; filter:blur(40px); opacity:.55; pointer-events:none; animation:mwBlob 9s ease-in-out infinite alternate; }
      @keyframes mwBlob { to { transform:translate(30px,-40px) scale(1.25); } }
      #mwStory .mw-hint { position:absolute; bottom:.8rem; left:0; right:0; text-align:center; font-size:.7rem; opacity:.6; z-index:5; }
      .mw-tile { border-radius:1rem; padding:.9rem 1rem; background:linear-gradient(160deg, rgba(255,255,255,.06), rgba(255,255,255,.015)); border:1px solid rgba(255,255,255,.08); }
      .mw-tile b { display:block; font-size:1.25rem; font-weight:800; color:#fff; letter-spacing:-.01em; }
      .mw-tile > span { font-size:.72rem; color:#94a3b8; text-transform:uppercase; letter-spacing:.05em; font-weight:600; }
      @media (prefers-reduced-motion: reduce) { #mwStory .mw-in, #mwStory .mw-pop { animation:none; opacity:1; transform:none; } #mwStory .mw-emoji, #mwStory .mw-blob { animation:none; } }
    `;
    document.head.appendChild(st);
  }

  // ---------- Spielertyp (wie die „Persönlichkeit“ bei Wrapped) ----------
  function archetype(d) {
    const days = daysOfYear(d);
    const sc = [
      ['⚔️ Der Kriegsherr', 'Kämpft lieber, als zu warten – das Schlachtfeld ist dein Zuhause.', num(d?.pvp?.battles) / days / 40],
      ['🪓 Der Barbarenjäger', 'Kein Barbar ist vor dir sicher.', num(d?.barb?.kills) / days / 60],
      ['🌾 Der Ressourcen-Magnat', 'Deine Lager sind nie leer.', num(d?.res?.gathered) / days / 12e6],
    ].sort((a, b) => b[2] - a[2]);
    if (!sc[0][2]) return null;
    if (sc[1][2] > sc[0][2] * 0.85) return ['🛡️ Der Allrounder', 'Kämpfen, farmen, sammeln – du machst alles.'];
    return sc[0];
  }

  // ---------- Folien ----------
  const BG = [
    'linear-gradient(160deg,#1e1b4b 0%,#6d28d9 55%,#f59e0b 120%)',
    'linear-gradient(160deg,#0f766e 0%,#14b8a6 50%,#a3e635 110%)',
    'linear-gradient(160deg,#7f1d1d 0%,#dc2626 50%,#f97316 105%)',
    'linear-gradient(160deg,#111827 0%,#b45309 60%,#fde68a 120%)',
    'linear-gradient(160deg,#14532d 0%,#16a34a 55%,#facc15 115%)',
    'linear-gradient(160deg,#713f12 0%,#ca8a04 50%,#fef08a 110%)',
    'linear-gradient(160deg,#172554 0%,#2563eb 55%,#22d3ee 110%)',
    'linear-gradient(160deg,#3b0764 0%,#9333ea 50%,#f472b6 110%)',
    'linear-gradient(160deg,#831843 0%,#db2777 50%,#fb923c 110%)',
    'linear-gradient(160deg,#0c4a6e 0%,#0284c7 50%,#a5f3fc 115%)',
    'linear-gradient(160deg,#1c1917 0%,#e0a91b 70%,#fff7d1 130%)',
    'linear-gradient(160deg,#07090f 0%,#1e1b4b 45%,#6d28d9 80%,#f59e0b 130%)',
  ];
  const blobs = (a, b) => `<div class="mw-blob" style="width:220px;height:220px;background:${a};top:-60px;left:-70px"></div><div class="mw-blob" style="width:260px;height:260px;background:${b};bottom:-90px;right:-80px;animation-delay:-4s"></div>`;
  const dl = (i) => `style="animation-delay:${(0.15 + i * 0.22).toFixed(2)}s"`;
  // Zahl mit Hochzähl-Animation · Einheit (Mio./Mrd.) als eigener Text → wird übersetzt
  const cnt = (n, mode = 'int') => {
    if (mode === 'short') { const [a, u] = shortParts(n); return `<span class="mw-count" data-to="${Number(n) || 0}" data-mode="short">${a}</span>${u ? ` <span>${u}</span>` : ''}`; }
    return `<span class="mw-count" data-to="${Number(n) || 0}" data-mode="int">${de(n)}</span>`;
  };
  const chip = (val, label, i) => `<div class="mw-chip mw-in" ${dl(i)}><b>${val}</b><span>${label}</span></div>`;

  function slides(d, meta) {
    const S = [], days = daysOfYear(d), year = d.__year || '';
    const push = (bg, emoji, body) => S.push({ bg, html: `${blobs('rgba(255,255,255,.35)', 'rgba(0,0,0,.35)')}<div class="mw-emoji">${emoji}</div><div class="relative">${body}</div>` });
    // 1 · Intro
    push(BG[0], '👑', `
      <div class="mw-kick mw-in" ${dl(0)}>Wiz fan Club · Memory</div>
      <div class="mw-big mw-pop mt-3" ${dl(1)}><span>Dein Jahr</span><br><span style="color:#fde68a">${esc(year)}</span></div>
      <div class="mw-sub mw-in mt-4" ${dl(2)}><span>in Rise of Kingdoms</span></div>
      <div class="mw-note mw-in mt-6" ${dl(3)}><span translate="no">${esc(meta.name || '')}</span>${meta.kingdom ? ` · <span>Königreich</span> <span translate="no">#${esc(meta.kingdom)}</span>` : ''}</div>
      <div class="mw-note mw-in mt-10" ${dl(4)}><span>Antippen: rechts weiter, links zurück</span></div>`);
    // Reise: Start, Kultur, Königreich
    if (has(d.acc?.created) || has(d.acc?.civ) || has(d.acc?.kingdomStart)) {
      const since = has(d.acc?.created) ? Math.floor((Date.now() - new Date(dateIso(d.acc.created) + 'T00:00:00').getTime()) / 864e5) : 0;
      push(BG[10], '🧭', `
        <div class="mw-kick mw-in" ${dl(0)}><span>Deine Reise begann am</span></div>
        <div class="mw-big mw-pop mt-2" style="animation-delay:0.37s;font-size:clamp(2rem,10vw,3.1rem)">${esc(dateDe(dateIso(d.acc?.created)))}</div>
        ${since > 0 ? `<div class="mw-sub mw-in mt-3" ${dl(2)}><b>${de(since)}</b> <span>Tage dabei</span></div>` : ''}
        <div class="grid grid-cols-2 gap-2 mt-6">
          ${has(d.acc?.civ) ? chip(`<span translate="no">${esc(enOr(d.acc.civ, d.acc.civ_en))}</span>`, 'Start-Kultur', 3) : ''}
          ${has(d.acc?.kingdomStart) ? chip('#' + esc(d.acc.kingdomStart), 'Start-Königreich', 4) : ''}
          ${has(d.acc?.migrations) ? chip(de(d.acc.migrations), 'Migrationen', 5) : ''}
          ${has(d.acc?.civChanges) ? chip(de(d.acc.civChanges), 'Kulturwechsel', 6) : ''}
        </div>`);
    }
    // 2 · Online
    if (has(d.online?.hours)) {
      const h = num(d.online.hours);
      push(BG[1], '⏳', `
        <div class="mw-kick mw-in" ${dl(0)}><span>Du warst online</span></div>
        <div class="mw-big mw-pop mt-2" ${dl(1)}>${cnt(h)}</div>
        <div class="mw-sub mw-in" ${dl(1)}><span>Stunden</span></div>
        <div class="mw-note mw-in mt-5" ${dl(2)}><b>≈ ${de(h / 24)}</b> <span>Tage am Stück im Spiel</span></div>
        <div class="grid grid-cols-2 gap-2 mt-5">
          ${chip(de(h / days, 1), 'Stunden pro Tag', 3)}
          ${has(d.online?.days) ? chip(de(d.online.days), 'Login-Tage', 4) : ''}
        </div>
        ${num(d.online?.days) >= 365 ? `<div class="mw-note mw-in mt-4" ${dl(5)}>🔥 <span>Kein einziger Tag ausgelassen.</span></div>` : ''}`);
    }
    // 3 · PvP
    if (has(d.pvp?.battles)) {
      const b = num(d.pvp.battles), w = num(d.pvp.wins);
      push(BG[2], '⚔️', `
        <div class="mw-kick mw-in" ${dl(0)}><span>Du hast gekämpft</span></div>
        <div class="mw-big mw-pop mt-2" ${dl(1)}>${cnt(b)}</div>
        <div class="mw-sub mw-in" ${dl(1)}><span>PvP-Kämpfe</span></div>
        <div class="mw-note mw-in mt-2" ${dl(2)}><b>≈ ${de(b / days)}</b> <span>Kämpfe pro Tag</span></div>
        <div class="grid grid-cols-2 gap-2 mt-5">
          ${has(d.pvp?.wins) ? chip(de(w), 'Siege', 3) : ''}
          ${has(d.pvp?.wins) && b ? chip(de(w / b * 100, 1) + ' %', 'Siegquote', 4) : ''}
          ${has(d.pvp?.killDiff) ? `<div class="${has(d.top?.killDiff) ? '' : 'col-span-2'}">${chip('+' + shortTxt(d.pvp.killDiff), 'Kill-Differenz', 5)}</div>` : ''}
          ${has(d.top?.killDiff) ? chip(topTxt(d.top.killDiff), 'aller Statthalter', 6) : ''}
        </div>`);
    }
    // 4 · Kommandant
    if (has(d.cmd?.id) || has(d.cmd?.name)) {
      push(BG[3], '🗡️', `
        <div class="mw-kick mw-in" ${dl(0)}><span>Dein Partner auf dem Schlachtfeld</span></div>
        <div class="mw-big mw-pop mt-4" translate="no" style="animation-delay:${(0.15 + 1 * 0.22).toFixed(2)}s;font-size:clamp(2.4rem,11vw,3.6rem)">${has(d.cmd?.name) ? esc(enOr(d.cmd.name, d.cmd.name_en)) : '#' + esc(d.cmd.id)}</div>
        <div class="mw-sub mw-in mt-4" ${dl(2)}><span>Dein häufigster PvP-Kommandant</span></div>
        ${has(d.cmd?.name) && has(d.cmd?.id) ? `<div class="mw-note mw-in mt-2" ${dl(3)}><span>Kommandant</span> <span translate="no">ID ${esc(d.cmd.id)}</span></div>` : ''}`);
    }
    // 5 · Barbaren
    if (has(d.barb?.kills)) {
      const k = num(d.barb.kills);
      push(BG[4], '🪓', `
        <div class="mw-kick mw-in" ${dl(0)}><span>Die Barbaren zittern</span></div>
        <div class="mw-big mw-pop mt-2" ${dl(1)}>${cnt(k)}</div>
        <div class="mw-sub mw-in" ${dl(1)}><span>Barbaren erledigt</span></div>
        <div class="grid grid-cols-3 gap-2 mt-6">
          ${has(d.barb?.maxLevel) ? chip('Lv ' + de(d.barb.maxLevel), 'Höchstes Level', 2) : ''}
          ${has(d.barb?.forts) ? chip(de(d.barb.forts), 'Festungen', 3) : ''}
          ${chip('≈ ' + de(k / days), 'Pro Tag', 4)}
        </div>`);
    }
    // 6 · Ressourcen
    if (has(d.res?.gathered)) {
      const g = num(d.res.gathered);
      push(BG[5], '🌾', `
        <div class="mw-kick mw-in" ${dl(0)}><span>Deine Sammeltrupps waren fleißig</span></div>
        <div class="mw-big mw-pop mt-2" ${dl(1)}>${cnt(g, 'short')}</div>
        <div class="mw-sub mw-in" ${dl(1)}><span>Ressourcen gesammelt</span></div>
        <div class="mw-note mw-in mt-3" ${dl(2)}><b>≈ ${shortTxt(g / days)}</b> <span>pro Tag – jeden Tag, das ganze Jahr</span></div>
        <div class="grid grid-cols-2 gap-2 mt-5">
          ${has(d.res?.trips) ? chip(de(d.res.trips), 'Sammelzüge', 3) : ''}
          ${RES[d.res?.topType] ? chip(`${RES[d.res.topType][0]} <span>${RES[d.res.topType][1]}</span>`, 'Meiste Ressource', 4) : ''}
          ${has(d.res?.gems) ? chip(shortTxt(d.res.gems), 'Edelsteine erhalten', 5) : ''}
          ${has(d.top?.gather) ? chip(topTxt(d.top.gather), 'Sammeln', 6) : ''}
        </div>`);
    }
    // 7 · Truppen
    if (has(d.troops?.trained)) {
      const t = TROOP[num(d.troops?.topType)];
      push(BG[6], t ? t[0] : '🛡️', `
        <div class="mw-kick mw-in" ${dl(0)}><span>Die Kasernen liefen heiß</span></div>
        <div class="mw-big mw-pop mt-2" ${dl(1)}>${cnt(d.troops.trained, 'short')}</div>
        <div class="mw-sub mw-in" ${dl(1)}><span>Truppen ausgebildet</span></div>
        ${t ? `<div class="mw-chip mw-in mt-6" ${dl(2)}><span>Deine Lieblingstruppe</span><b>${t[0]} <span style="font-size:1.35rem;text-transform:none;letter-spacing:0;opacity:1;font-weight:900">${t[1]}</span></b>
          ${has(d.troops?.topCount) ? `<span style="text-transform:none"><b style="font-size:.9rem;display:inline">${shortTxt(d.troops.topCount)}</b> <span>davon</span>${num(d.troops.trained) ? ` · ${de(num(d.troops.topCount) / num(d.troops.trained) * 100, 0)} %` : ''}</span>` : ''}</div>` : ''}`);
    }
    // 8 · Ark
    if (has(d.ark?.games)) {
      const g = num(d.ark.games), w = num(d.ark.wins);
      push(BG[7], '🏛️', `
        <div class="mw-kick mw-in" ${dl(0)}><span>Um die Arche gekämpft</span></div>
        <div class="mw-big mw-pop mt-2" ${dl(1)}>${cnt(g)}</div>
        <div class="mw-sub mw-in" ${dl(1)}><span>Ark-of-Osiris-Spiele</span></div>
        <div class="grid grid-cols-2 gap-2 mt-6">
          ${has(d.ark?.wins) ? chip(de(w) + (g ? ` · ${de(w / g * 100)} %` : ''), 'Siege', 2) : ''}
          ${has(d.ark?.best) ? chip(de(d.ark.best), 'Bestwert', 3) : ''}
          ${has(d.raid?.joined) ? chip(`${de(d.raid.won || 0)} / ${de(d.raid.joined)}`, 'Raid-Boss Siege', 4) : ''}
          ${has(d.scholar?.joined) ? chip(de(d.scholar.joined), 'Gelehrter-Teilnahmen', 5) : ''}
        </div>`);
    }
    // Allianz & Hilfe
    if (has(d.alliance?.name) || has(d.help?.givenSec)) {
      push(BG[6], '🛡️', `
        <div class="mw-kick mw-in" ${dl(0)}><span>Deine Allianz</span></div>
        ${has(d.alliance?.name) ? `<div class="mw-big mw-pop mt-3" translate="no" style="animation-delay:0.37s;font-size:clamp(1.9rem,9vw,2.8rem)">${esc(d.alliance.name)}</div>` : ''}
        ${has(d.alliance?.days) ? `<div class="mw-sub mw-in mt-3" ${dl(2)}><b>${de(d.alliance.days)}</b> <span>Tage Seite an Seite</span></div>` : ''}
        <div class="grid grid-cols-2 gap-2 mt-6">
          ${has(d.help?.givenSec) ? chip(hrs(d.help.givenSec) + ' h', 'Zeit für andere gespart', 3) : ''}
          ${has(d.help?.gotSec) ? chip(hrs(d.help.gotSec) + ' h', 'Hilfe bekommen', 4) : ''}
        </div>`);
    }
    // 9 · Geben und Nehmen
    if (has(d.give?.sentTo) || has(d.give?.fromName)) {
      push(BG[8], '🤝', `
        <div class="mw-big mw-pop" style="animation-delay:${(0.15 + 0 * 0.22).toFixed(2)}s;font-size:clamp(2.2rem,10vw,3.2rem)"><span>Geben und Nehmen</span></div>
        ${has(d.give?.sentTo) ? `<div class="mw-chip mw-in mt-6" ${dl(1)}><span>Meiste Ressourcen geschickt an</span><b translate="no">${esc(d.give.sentTo)}</b>
          ${has(d.give?.sentAmount) ? `<span style="text-transform:none;font-size:.95rem;opacity:1"><b style="display:inline;font-size:1.1rem">${shortTxt(d.give.sentAmount)}</b> <span style="font-size:.95rem;text-transform:none">Ressourcen</span></span>` : ''}</div>` : ''}
        ${has(d.give?.fromName) ? `<div class="mw-chip mw-in mt-3" ${dl(2)}><span>Meiste Ressourcen bekommen von</span><b translate="no">${esc(d.give.fromName)}</b>
          ${has(d.give?.fromAmount) ? `<span style="text-transform:none;font-size:.95rem;opacity:1"><b style="display:inline;font-size:1.1rem">${shortTxt(d.give.fromAmount)}</b> <span style="font-size:.95rem;text-transform:none">Ressourcen</span></span>` : ''}</div>` : ''}`);
    }
    // 10 · Chat & VIP
    if (has(d.online?.chat)) {
      const c = num(d.online.chat);
      push(BG[9], '💬', `
        <div class="mw-kick mw-in" ${dl(0)}><span>Du hattest viel zu sagen</span></div>
        <div class="mw-big mw-pop mt-2" ${dl(1)}>${cnt(c)}</div>
        <div class="mw-sub mw-in" ${dl(1)}><span>Chatnachrichten</span></div>
        <div class="grid grid-cols-2 gap-2 mt-6">
          ${chip('≈ ' + de(c / days), 'Nachrichten pro Tag', 2)}
          ${has(d.online?.vip) ? chip('VIP ' + de(d.online.vip), 'VIP-Stufe', 3) : ''}
          ${has(d.online?.quests) ? chip('Ø ' + de(d.online.quests), 'Tägliche Aufgaben', 4) : ''}
          ${has(d.top?.chat) ? chip(topTxt(d.top.chat), 'Chat', 5) : ''}
        </div>`);
    }
    // 11 · Stärkster Tag + Account-Alter
    if (has(d.acc?.bestDay)) {
      push(BG[10], '📈', `
        ${has(d.acc?.bestDay) ? `<div class="mw-kick mw-in" ${dl(0)}><span>Dein stärkster Tag</span></div>
        <div class="mw-big mw-pop mt-2" style="animation-delay:${(0.15 + 1 * 0.22).toFixed(2)}s;font-size:clamp(2rem,10vw,3.1rem)">${esc(dateDe(dateIso(d.acc.bestDay)))}</div>
        ${has(d.acc?.bestGain) ? `<div class="mw-sub mw-in mt-3" ${dl(2)}><b>+${shortTxt(d.acc.bestGain)}</b> <span>Macht an einem Tag</span></div>` : ''}` : ''}
        ${has(d.res?.powerInvest) ? `<div class="grid grid-cols-1 gap-2 mt-8">${chip(shortTxt(d.res.powerInvest), 'Ressourcen in Macht gesteckt', 3)}</div>` : ''}`);
    }
    // Ranglisten: Top x % aller Statthalter
    const tops = [['killDiff', '⚔️', 'Kill-Differenz'], ['gather', '🌾', 'Sammeln'], ['gems', '💎', 'Edelsteine'], ['quests', '📜', 'Tägliche Aufgaben'], ['chat', '💬', 'Chat']].filter(t => has(d.top?.[t[0]]));
    if (tops.length) {
      push(BG[0], '🏅', `
        <div class="mw-kick mw-in" ${dl(0)}><span>Du gehörst zu den Besten</span></div>
        <div class="mw-big mw-pop mt-2" style="animation-delay:0.37s;font-size:clamp(2.2rem,10vw,3.2rem)">${topTxt(Math.min(...tops.map(t => d.top[t[0]])))}</div>
        <div class="mw-sub mw-in" ${dl(1)}><span>aller Statthalter</span></div>
        <div class="space-y-2 mt-5">${tops.map((t, i) => `<div class="mw-chip mw-in" ${dl(i + 2)} style="flex-direction:row;justify-content:space-between;align-items:center"><span style="font-size:.85rem">${t[1]} ${t[2]}</span><b style="font-size:1.1rem">${topTxt(d.top[t[0]])}</b></div>`).join('')}</div>`);
    }
    // 12 · Zusammenfassung
    const ar = archetype(d);
    const tiles = [
      has(d.online?.hours) && [de(d.online.hours) + ' h', 'Online'],
      has(d.pvp?.battles) && [de(d.pvp.battles), 'PvP'],
      has(d.pvp?.killDiff) && ['+' + shortTxt(d.pvp.killDiff), 'Kill-Differenz'],
      has(d.barb?.kills) && [de(d.barb.kills), 'Barbaren'],
      has(d.res?.gathered) && [shortTxt(d.res.gathered), 'Gesammelt'],
      has(d.troops?.trained) && [shortTxt(d.troops.trained), 'Ausgebildet'],
      has(d.ark?.games) && [`${de(d.ark.wins || 0)}/${de(d.ark.games)}`, 'Ark'],
      has(d.online?.chat) && [de(d.online.chat), 'Chat'],
    ].filter(Boolean).slice(0, 8);
    S.push({ bg: BG[11], summary: true, html: `${blobs('rgba(245,197,66,.45)', 'rgba(147,51,234,.5)')}
      <div class="relative">
        <div class="mw-kick mw-in" ${dl(0)}><span>Dein Jahr in Zahlen</span> <span translate="no">${esc(year)}</span></div>
        ${ar ? `<div class="mw-in mt-3" ${dl(1)}><div style="font-size:.72rem;font-weight:700;text-transform:uppercase;letter-spacing:.08em;opacity:.75"><span>Dein Spielertyp</span></div>
          <div class="mw-pop" style="animation-delay:${(0.15 + 1 * 0.22).toFixed(2)}s;font-size:1.75rem;font-weight:900;line-height:1.1;margin-top:.2rem;color:#fde68a"><span>${ar[0]}</span></div>
          <div class="mw-note mt-1"><span>${ar[1]}</span></div></div>` : ''}
        <div class="grid grid-cols-2 gap-2 mt-5">${tiles.map((t, i) => chip(t[0], t[1], i + 2)).join('')}</div>
        <div class="mw-note mw-in mt-5 text-center" ${dl(tiles.length + 2)} style="font-size:.75rem"><span translate="no">${esc(meta.name || '')}${meta.kingdom ? ' · #' + esc(meta.kingdom) : ''} · Wiz fan Club</span></div>
      </div>` });
    return S;
  }

  // ---------- Bild (1080 × 1920) der Zusammenfassung ----------
  async function saveImage(d, meta) {
    try { await document.fonts?.ready; } catch {}
    const W = 1080, H = 1920, c = document.createElement('canvas'); c.width = W; c.height = H; const x = c.getContext('2d');
    const g = x.createLinearGradient(0, 0, W * 0.4, H); g.addColorStop(0, '#07090f'); g.addColorStop(0.4, '#1e1b4b'); g.addColorStop(0.75, '#6d28d9'); g.addColorStop(1, '#f59e0b'); x.fillStyle = g; x.fillRect(0, 0, W, H);
    const blob = (cx, cy, r, col) => { const rg = x.createRadialGradient(cx, cy, 0, cx, cy, r); rg.addColorStop(0, col); rg.addColorStop(1, 'rgba(0,0,0,0)'); x.fillStyle = rg; x.fillRect(0, 0, W, H); };
    blob(120, 160, 520, 'rgba(245,197,66,.35)'); blob(980, 1750, 640, 'rgba(147,51,234,.45)');
    x.fillStyle = '#fff'; x.textBaseline = 'top';
    x.font = '700 34px Inter, system-ui, sans-serif'; x.globalAlpha = .8; x.fillText('WIZ FAN CLUB · MEMORY', 90, 110); x.globalAlpha = 1;
    x.font = '900 120px Inter, system-ui, sans-serif'; x.fillText(tr('Dein Jahr'), 90, 180);
    x.fillStyle = '#fde68a'; x.fillText(String(d.__year || ''), 90, 310); x.fillStyle = '#fff';
    let y = 490; const ar = archetype(d);
    if (ar) { x.font = '700 30px Inter, sans-serif'; x.globalAlpha = .75; x.fillText(tr('Dein Spielertyp').toUpperCase(), 90, y); x.globalAlpha = 1;
      x.font = '900 70px Inter, sans-serif'; x.fillStyle = '#fde68a'; x.fillText(tr(ar[0]), 90, y + 44); x.fillStyle = '#fff';
      x.font = '500 34px Inter, sans-serif'; x.globalAlpha = .85;
      let line = '', ly = y + 130; tr(ar[1]).split(' ').forEach(w => { const t = line ? line + ' ' + w : w; if (x.measureText(t).width > W - 180 && line) { x.fillText(line, 90, ly); ly += 46; line = w; } else line = t; }); if (line) x.fillText(line, 90, ly);
      x.globalAlpha = 1; y = ly + 90; }
    const tiles = [
      has(d.online?.hours) && [de(d.online.hours) + ' h', 'Online'], has(d.pvp?.battles) && [de(d.pvp.battles), 'PvP-Kämpfe'],
      has(d.pvp?.killDiff) && ['+' + shortTxt(d.pvp.killDiff), 'Kill-Differenz'], has(d.barb?.kills) && [de(d.barb.kills), 'Barbaren'],
      has(d.res?.gathered) && [shortTxt(d.res.gathered), 'Gesammelt'], has(d.troops?.trained) && [shortTxt(d.troops.trained), 'Ausgebildet'],
      has(d.ark?.games) && [`${de(d.ark.wins || 0)} / ${de(d.ark.games)}`, 'Ark'], has(d.online?.chat) && [de(d.online.chat), 'Chatnachrichten'],
      has(d.acc?.bestGain) && ['+' + shortTxt(d.acc.bestGain), 'Stärkster Tag'], has(d.online?.vip) && ['VIP ' + de(d.online.vip), 'VIP-Stufe'],
    ].filter(Boolean).slice(0, 10);
    const cw = 435, ch = 168, gap = 24;
    tiles.forEach((t, i) => {
      const cx = 90 + (i % 2) * (cw + gap), cy = y + Math.floor(i / 2) * (ch + gap);
      x.fillStyle = 'rgba(0,0,0,.28)'; x.beginPath(); (x.roundRect ? x.roundRect(cx, cy, cw, ch, 32) : x.rect(cx, cy, cw, ch)); x.fill();
      x.fillStyle = '#fff'; x.font = '900 62px Inter, sans-serif'; x.fillText(tr(t[0]), cx + 32, cy + 30, cw - 60);
      x.font = '700 26px Inter, sans-serif'; x.globalAlpha = .75; x.fillText(tr(t[1]).toUpperCase(), cx + 32, cy + 112, cw - 60); x.globalAlpha = 1;
    });
    x.font = '600 32px Inter, sans-serif'; x.globalAlpha = .8; x.textAlign = 'center';
    x.fillText(`${meta.name || ''}${meta.kingdom ? ' · #' + meta.kingdom : ''} · Wiz fan Club`, W / 2, H - 90); x.globalAlpha = 1;
    const a = document.createElement('a'); a.download = `memory-${d.__year || 'rok'}.png`; a.href = c.toDataURL('image/png'); document.body.appendChild(a); a.click(); a.remove();
  }

  // ---------- Modul ----------
  function init(R) {
    if (!R || R.__memoryInit) return; R.__memoryInit = true;
    const view = document.getElementById('memoryView'); if (!view) return;
    hookI18n(); css();
    R.VIEW_EL.memory = 'memoryView';
    if (!R.MAIN_VIEWS.includes('memory')) R.MAIN_VIEWS.push('memory');
    const RokAuth = window.RokAuth;
    const uid = () => RokAuth?.userId?.() || R.PROFILE?.id || 'x';
    const LKEY = () => 'rok_memory_' + uid();
    const meta = () => { const m = RokAuth?.ownMeta?.() || {}; return { name: R.PROFILE?.name || RokAuth?.current?.()?.name || '', kingdom: String(m.kingdom || '').replace(/^#/, '') }; };

    let rows = null, year = null, loading = false, missing = false, editing = false, msg = '';
    let idx = 0, timer = null, t0 = 0, paused = false, elapsed = 0; const DUR = 6500;
    let S = [];

    const readLocal = () => { try { return JSON.parse(localStorage.getItem(LKEY()) || '{}') || {}; } catch { return {}; } };
    const writeLocal = () => { try { const o = {}; (rows || []).forEach(r => { o[r.year] = r.data; }); localStorage.setItem(LKEY(), JSON.stringify(o)); } catch {} };

    async function load() {
      if (loading) return; loading = true; render();
      const local = readLocal(); let list = Object.keys(local).map(y => ({ year: +y, data: local[y] }));
      try {
        const db = RokAuth?.db?.(); if (!db || !RokAuth?.userId?.()) throw new Error('offline');
        const { data, error } = await db.from('rok_memory').select('year,data').eq('user_id', RokAuth.userId()).order('year', { ascending: false });
        if (error) { if (/rok_memory|relation|schema cache|does not exist/i.test(error.message || '')) missing = true; else throw error; }
        else { missing = false; const map = new Map(list.map(r => [r.year, r])); (data || []).forEach(r => map.set(+r.year, { year: +r.year, data: r.data || {} })); list = [...map.values()]; }
      } catch (e) { console.warn('Memory laden', e); }
      rows = list.sort((a, b) => b.year - a.year);
      if (year == null || !rows.some(r => r.year === year)) year = rows[0]?.year ?? null;
      writeLocal(); loading = false; idx = 0; elapsed = 0; render();
    }
    async function save(y, data) {
      const r = rows.find(x => x.year === y); if (r) r.data = data; else rows.push({ year: y, data }); rows.sort((a, b) => b.year - a.year); year = y; writeLocal();
      if (missing) return true;
      const db = RokAuth?.db?.(); if (!db || !RokAuth?.userId?.()) return true;
      const { error } = await db.from('rok_memory').upsert({ user_id: RokAuth.userId(), year: y, data, updated_at: new Date().toISOString() });
      if (error) { if (/rok_memory|relation|schema cache|does not exist/i.test(error.message || '')) { missing = true; return true; } throw error; }
      return true;
    }
    const cur = () => { const r = rows?.find(x => x.year === year); return r ? { ...r.data, __year: r.year } : null; };

    // --- Abspielen ---
    function stop() { cancelAnimationFrame(timer); timer = null; }
    function tick() {
      if (R.view !== 'memory' || paused || !S.length) { timer = null; return; }
      const now = performance.now(), p = Math.min(1, (elapsed + now - t0) / DUR);
      const bar = view.querySelector(`.mw-bar[data-i="${idx}"] > i`); if (bar) bar.style.width = (p * 100) + '%';
      if (p >= 1) { if (idx < S.length - 1) { go(idx + 1); return; } paused = true; syncBtns(); timer = null; return; }
      timer = requestAnimationFrame(tick);
    }
    function play() { stop(); t0 = performance.now(); timer = requestAnimationFrame(tick); }
    function countUp(root) {
      root.querySelectorAll('.mw-count').forEach((el) => {
        const to = +el.dataset.to || 0, mode = el.dataset.mode, start = performance.now(), dur = 1300;
        const fmtv = (v) => mode === 'short' ? shortParts(to)[1] ? de(v / (Math.abs(to) >= 1e9 ? 1e9 : Math.abs(to) >= 1e6 ? 1e6 : 1e3), 2) : de(v) : de(v);
        if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
        const step = (now) => { const p = Math.min(1, (now - start) / dur), e = 1 - Math.pow(1 - p, 3); el.textContent = fmtv(p >= 1 ? to : to * e); if (p < 1 && el.isConnected) requestAnimationFrame(step); };
        requestAnimationFrame(step);
      });
    }
    function go(i) {
      idx = Math.max(0, Math.min(S.length - 1, i)); elapsed = 0;
      const st = view.querySelector('#mwStory'); if (!st) return;
      st.querySelectorAll('.mw-bar').forEach((b) => { const k = +b.dataset.i; b.firstElementChild.style.width = k < idx ? '100%' : '0%'; });
      const sl = st.querySelector('.mw-slide'); sl.style.background = S[idx].bg; sl.innerHTML = S[idx].html; countUp(sl);
      st.querySelector('.mw-pos').textContent = `${idx + 1} / ${S.length}`;
      if (!paused) play();
    }
    function syncBtns() { const b = view.querySelector('#mwPause'); if (b) b.textContent = paused ? '▶ Weiter' : '⏸ Pause'; }
    function togglePause() {
      if (paused) { paused = false; if (idx === S.length - 1 && elapsed >= DUR) go(0); else play(); }
      else { elapsed += performance.now() - t0; paused = true; stop(); }
      syncBtns();
    }

    // --- Darstellung ---
    function render() {
      stop();
      if (!rows) { view.innerHTML = `<div class="panel rounded-2xl p-8 text-center text-slate-400">${loading ? '<span>Lade Memory …</span>' : ''}</div>`; return; }
      const d = cur();
      const head = `
        <div class="flex flex-wrap items-end justify-between gap-3">
          <div><h2 class="font-display text-2xl gold-text">🎁 Memory</h2><p class="text-sm text-slate-400 mt-1"><span>Dein Jahresrückblick</span> · <span>Nur du siehst deinen Rückblick.</span></p></div>
          <div class="flex flex-wrap items-center gap-2">
            ${rows.length ? `<label class="text-xs text-slate-400"><span>Jahr</span> <select id="mwYear" class="ml-1 rounded-lg bg-ink-900 border border-ink-600 px-2 py-1.5 text-sm text-slate-100">${rows.map(r => `<option value="${r.year}" ${r.year === year ? 'selected' : ''}>${r.year}</option>`).join('')}</select></label>` : ''}
            <button id="mwEdit" class="px-3 py-1.5 rounded-lg border border-ink-600 hover:border-gold-500/60 hover:text-gold-300 text-sm">✏️ Werte bearbeiten</button>
            <button id="mwNew" class="px-3 py-1.5 rounded-lg border border-ink-600 hover:border-gold-500/60 hover:text-gold-300 text-sm">+ Neues Jahr</button>
          </div>
        </div>
        ${missing ? `<div class="rounded-xl border border-amber-500/40 bg-amber-500/10 text-amber-200 text-sm px-4 py-3"><span>Die Tabelle rok_memory fehlt noch in Supabase – bitte zuerst das SQL ausführen. Bis dahin wird nur in diesem Browser gespeichert.</span></div>` : ''}
        ${msg ? `<div class="text-sm text-emerald-300">${esc(msg)}</div>` : ''}`;

      if (editing || !d) {
        view.innerHTML = head + (editing ? editorHtml(d) : `
          <div class="panel rounded-2xl p-10 text-center">
            <div class="text-5xl mb-3">🎁</div>
            <div class="font-display text-xl gold-text"><span>Noch kein Jahresrückblick</span></div>
            <p class="text-slate-400 text-sm mt-2 max-w-md mx-auto"><span>Trag deine Werte aus dem Jubiläums-Popup (AnniversaryMemory) ein – dann entsteht hier dein Rückblick.</span></p>
            <button id="mwStart" class="mt-5 px-4 py-2 rounded-lg bg-gold-500 text-ink-950 font-bold hover:bg-gold-400">✏️ Werte bearbeiten</button>
          </div>`);
        bindHead(); if (editing) bindEditor(d); else view.querySelector('#mwStart').onclick = () => { editing = true; if (year == null) year = new Date().getFullYear(); render(); };
        return;
      }

      S = slides(d, meta()); if (idx >= S.length) idx = 0;
      view.innerHTML = head + `
        <div class="grid lg:grid-cols-[minmax(0,430px)_1fr] gap-6 items-start">
          <div>
            <div id="mwStory">
              <div class="mw-bars">${S.map((_, i) => `<div class="mw-bar" data-i="${i}"><i></i></div>`).join('')}</div>
              <div class="mw-head"><span>🎁 Memory <span translate="no">${esc(d.__year)}</span></span><span class="mw-pos" translate="no"></span></div>
              <div class="mw-slide"></div>
            </div>
            <div class="flex flex-wrap justify-center gap-2 mt-4">
              <button id="mwPrev" class="px-3 py-2 rounded-lg border border-ink-600 hover:border-gold-500/60 text-sm" aria-label="Zurück">◀</button>
              <button id="mwPause" class="px-3 py-2 rounded-lg border border-ink-600 hover:border-gold-500/60 text-sm min-w-[6.5rem]">${paused ? '▶ Weiter' : '⏸ Pause'}</button>
              <button id="mwNext" class="px-3 py-2 rounded-lg border border-ink-600 hover:border-gold-500/60 text-sm" aria-label="Weiter">▶</button>
              <button id="mwRestart" class="px-3 py-2 rounded-lg border border-ink-600 hover:border-gold-500/60 text-sm">↺ Von vorn</button>
              <button id="mwImg" class="px-3 py-2 rounded-lg bg-gold-500 text-ink-950 font-bold hover:bg-gold-400 text-sm">🖼️ Als Bild speichern</button>
            </div>
          </div>
          <section class="panel rounded-2xl p-5">
            <h3 class="font-display text-lg gold-text mb-3">📋 Alle Werte</h3>
            ${allValuesHtml(d)}
          </section>
        </div>`;
      bindHead();
      const st = view.querySelector('#mwStory');
      st.onclick = (ev) => { const r = st.getBoundingClientRect(); if (ev.clientX - r.left < r.width * 0.33) go(idx - 1); else go(idx + 1); };
      view.querySelector('#mwPrev').onclick = () => go(idx - 1);
      view.querySelector('#mwNext').onclick = () => go(idx + 1);
      view.querySelector('#mwPause').onclick = togglePause;
      view.querySelector('#mwRestart').onclick = () => { paused = false; syncBtns(); go(0); };
      view.querySelector('#mwImg').onclick = () => saveImage(d, meta()).catch(e => console.warn(e));
      go(idx);
    }

    function allValuesHtml(d) {
      const groups = {}; FIELDS.forEach(f => { (groups[f[3]] = groups[f[3]] || []).push(f); });
      return Object.entries(groups).map(([g, fs]) => {
        const items = fs.map(([p, label, kind]) => { const v = get(d, p); if (!has(v)) return '';
          let out = kind === 'int' ? de(v) : kind === 'date' ? esc(dateDe(dateIso(v))) : kind === 'type' ? (TROOP[num(v)] ? `${TROOP[num(v)][0]} <span>${TROOP[num(v)][1]}</span>` : '<span>Typ</span> ' + esc(v)) : kind === 'res' ? (RES[v] ? `${RES[v][0]} <span>${RES[v][1]}</span>` : esc(v)) : kind === 'top' ? topTxt(v) : `<span translate="no">${esc(v)}</span>`;
          return `<div class="mw-tile"><b>${out}</b><span>${label}</span></div>`; }).join('');
        return items ? `<div class="mb-4"><div class="text-xs font-bold uppercase tracking-wider text-gold-300/80 mb-2"><span>${g}</span></div><div class="grid grid-cols-2 sm:grid-cols-3 gap-2">${items}</div></div>` : '';
      }).join('');
    }

    function editorHtml(d) {
      const data = d || {};
      const groups = {}; FIELDS.forEach(f => { (groups[f[3]] = groups[f[3]] || []).push(f); });
      const inp = 'w-full rounded-lg bg-ink-900 border border-ink-600 px-3 py-2 text-sm text-slate-100 focus:border-gold-500 outline-none';
      return `<section class="panel rounded-2xl p-5 space-y-5">
        <div class="flex flex-wrap items-end gap-3">
          <label class="text-sm"><span class="block text-xs text-slate-400 mb-1">Jahr</span><input id="mwfYear" type="number" class="${inp} w-28" value="${esc(year ?? new Date().getFullYear())}"></label>
          <div class="flex-1"></div>
          <button id="mwJsonIn" class="px-3 py-2 rounded-lg border border-ink-600 hover:border-gold-500/60 text-sm">📥 JSON einfügen</button>
          <button id="mwJsonOut" class="px-3 py-2 rounded-lg border border-ink-600 hover:border-gold-500/60 text-sm">📤 JSON kopieren</button>
        </div>
        <div id="mwJsonBox" class="hidden space-y-2"><textarea id="mwJsonTxt" rows="8" class="${inp} font-mono text-xs" placeholder='{"pvp":{"battles":34045}}'></textarea>
          <button id="mwJsonApply" class="px-3 py-2 rounded-lg border border-gold-500/60 text-gold-300 text-sm">Übernehmen</button> <span id="mwJsonErr" class="text-sm text-red-300"></span></div>
        ${Object.entries(groups).map(([g, fs]) => `<div><div class="text-xs font-bold uppercase tracking-wider text-gold-300/80 mb-2"><span>${g}</span></div>
          <div class="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">${fs.map(([p, label, kind]) => { const v = get(data, p);
            const val = kind === 'date' ? dateIso(v ?? '') : (v ?? '');
            const opts = kind === 'type' ? TROOP : kind === 'res' ? RES : null;
            const field = opts ? `<select data-p="${p}" data-k="${kind}" class="${inp}"><option value="">— wählen —</option>${Object.entries(opts).map(([k, t]) => `<option value="${k}" ${String(v) === k ? 'selected' : ''}>${t[0]} ${t[1]}</option>`).join('')}</select>`
              : kind === 'top' ? `<input data-p="${p}" data-k="top" type="text" inputmode="decimal" class="${inp}" placeholder="z. B. 0,027" value="${has(v) ? esc(de(Number(v) * 100, 4)) : ''}">`
              : kind === 'type' ? `<select data-p="${p}" data-k="${kind}" class="${inp}"><option value="">— wählen —</option>${Object.entries(TROOP).map(([k, t]) => `<option value="${k}" ${String(v) === k ? 'selected' : ''}>${t[0]} ${t[1]}</option>`).join('')}</select>`
              : `<input data-p="${p}" data-k="${kind}" type="${kind === 'date' ? 'date' : 'text'}" ${kind === 'int' ? 'inputmode="numeric"' : ''} class="${inp}" value="${esc(kind === 'int' && has(val) ? de(val) : val)}">`;
            return `<label class="text-sm"><span class="block text-xs text-slate-400 mb-1">${label}</span>${field}</label>`; }).join('')}</div></div>`).join('')}
        <div class="flex flex-wrap gap-2 items-center">
          <button id="mwSave" class="px-4 py-2 rounded-lg bg-gold-500 text-ink-950 font-bold hover:bg-gold-400">💾 Speichern</button>
          ${d ? '<button id="mwCancel" class="px-4 py-2 rounded-lg border border-ink-600 hover:border-gold-500/60">Abbrechen</button>' : ''}
          <span id="mwSaveMsg" class="text-sm"></span>
        </div>
      </section>`;
    }
    function readForm() {
      const o = {};
      view.querySelectorAll('[data-p]').forEach((el) => { const v = String(el.value || '').trim(); if (!v) return; const k = el.dataset.k;
        set(o, el.dataset.p, k === 'int' || k === 'type' ? num(v) : k === 'top' ? numDec(v) / 100 : k === 'date' ? dateIso(v) : v); });
      return o;
    }
    function fillForm(o) {
      view.querySelectorAll('[data-p]').forEach((el) => { const v = get(o, el.dataset.p), k = el.dataset.k;
        el.value = !has(v) ? '' : k === 'int' ? de(num(v)) : k === 'top' ? de(Number(v) * 100, 4) : k === 'date' ? dateIso(v) : String(v); });
    }
    function bindEditor(d) {
      const box = view.querySelector('#mwJsonBox'), txt = view.querySelector('#mwJsonTxt');
      view.querySelector('#mwJsonIn').onclick = () => box.classList.toggle('hidden');
      view.querySelector('#mwJsonOut').onclick = async (ev) => { const j = JSON.stringify(readForm(), null, 2); try { await navigator.clipboard.writeText(j); ev.target.textContent = '✓ Kopiert'; setTimeout(() => { ev.target.textContent = '📤 JSON kopieren'; }, 1500); } catch { box.classList.remove('hidden'); txt.value = j; } };
      view.querySelector('#mwJsonApply').onclick = () => {
        const err = view.querySelector('#mwJsonErr'); err.textContent = '';
        try { const o = JSON.parse(txt.value); if (!o || typeof o !== 'object') throw 0; if (o.year && !o.pvp && o.data) { fillForm(o.data); view.querySelector('#mwfYear').value = o.year; } else { if (o.year) view.querySelector('#mwfYear').value = o.year; fillForm(o); } }
        catch { err.textContent = 'Das JSON ist ungültig.'; }
      };
      const c = view.querySelector('#mwCancel'); if (c) c.onclick = () => { editing = false; render(); };
      view.querySelector('#mwSave').onclick = async () => {
        const y = Math.round(num(view.querySelector('#mwfYear').value)) || new Date().getFullYear();
        const m = view.querySelector('#mwSaveMsg'); m.className = 'text-sm text-slate-400'; m.textContent = '…';
        const keep = (cur() && cur().__year === y) ? cur() : {}; const merged = { ...keep, ...readForm() }; delete merged.__year;
        ['cmd', 'acc'].forEach(k => { if (keep[k]) merged[k] = { ...keep[k], ...(merged[k] || {}) }; });
        try { await save(y, merged); editing = false; idx = 0; paused = false; msg = tr('✓ Gespeichert'); render(); setTimeout(() => { msg = ''; }, 2500); }
        catch (e) { m.className = 'text-sm text-red-300'; m.textContent = tr('Speichern hat nicht geklappt:') + ' ' + (e?.message || e); }
      };
    }
    function bindHead() {
      const ys = view.querySelector('#mwYear'); if (ys) ys.onchange = () => { year = +ys.value; idx = 0; paused = false; editing = false; render(); };
      view.querySelector('#mwEdit').onclick = () => { editing = !editing || !cur(); if (year == null) year = new Date().getFullYear(); render(); };
      view.querySelector('#mwNew').onclick = () => { const used = new Set((rows || []).map(r => r.year)); let y = new Date().getFullYear(); while (used.has(y)) y++; year = y; editing = true; render(); };
    }

    // Tastatur: ← → Leertaste
    document.addEventListener('keydown', (ev) => {
      if (R.view !== 'memory' || editing || !S.length || /INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName || '')) return;
      if (ev.key === 'ArrowRight') { go(idx + 1); ev.preventDefault(); } else if (ev.key === 'ArrowLeft') { go(idx - 1); ev.preventDefault(); } else if (ev.key === ' ') { togglePause(); ev.preventDefault(); }
    });
    // Seite verlassen → anhalten; Sprache gewechselt → neu zeichnen
    document.addEventListener('rok:view', (ev) => { if (ev.detail !== 'memory') stop(); });
    window.addEventListener('langchange', () => { if (R.view === 'memory' && !editing) render(); });
    R.viewHooks.memory = () => { if (!rows) load(); else render(); };

    if (R.view === 'memory') R.viewHooks.memory();
  }

  // ---------- Einhängen: nach dem Start von scanner.js (RokApp) ----------
  const tryInit = () => { if (window.Rok && window.Rok.VIEW_EL && window.Rok.viewHooks) { try { init(window.Rok); } catch (e) { console.error('Modul memory', e); } return true; } return false; };
  if (!tryInit()) {
    const orig = window.RokApp;
    if (typeof orig === 'function') window.RokApp = function () { const r = orig.apply(this, arguments); tryInit(); return r; };
    document.addEventListener('rok:view', function once() { if (tryInit()) document.removeEventListener('rok:view', once); });
  }
})();
