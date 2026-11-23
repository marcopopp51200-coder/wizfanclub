# -*- coding: utf-8 -*-
"""
Wiz fan Club App (Testversion 0.19)
----------------------------------
* Verbinden: Code von der Website (uploader.html) eingeben -> App ist mit deinem Account gekoppelt.
* Accounts: erkennt die Governor-IDs aus dem Mailcache und bindet sie an deinen Website-Account.
* Overlay: kleines, verschiebbares Fenster ueber dem Spiel mit frei waehlbaren Werten (KP, Trades, Tote ...).
* Hochladen (optional, fuer Freunde): Kampfberichte der gebundenen IDs ueber die Website-API – ohne Service-Key.

Liest nur Dateien im Ordner <Spiel>\\save\\mailcache. Veraendert nichts am Spiel, liest keinen Netzwerkverkehr.
Braucht nur Python 3 (tkinter ist dabei). Start ohne Konsolenfenster: pythonw rok_app.py
"""
import glob, json, os, re, struct, sys, threading, time, traceback
import urllib.request, urllib.error
from datetime import datetime, date
import tkinter as tk
from tkinter import messagebox, filedialog
import tkinter.font as tkfont

APP_VERSION = "0.40-test"
FROZEN = getattr(sys, "frozen", False)          # als .exe gebaut (PyInstaller)
HERE = os.path.dirname(os.path.abspath(sys.executable if FROZEN else __file__))
DATA = os.path.join(os.environ.get("APPDATA", HERE), "WizFanClub") if FROZEN else HERE   # Einstellungen/Cache der .exe
os.makedirs(DATA, exist_ok=True)
CFG_FILE = os.path.join(DATA, "app_config.json")
CACHE_FILE = os.path.join(DATA, "app_cache.json")
LOG_FILE = os.path.join(DATA, "app_log.txt")
RES = getattr(sys, "_MEIPASS", HERE)            # mitgelieferte Dateien (Icon)
MARKER_TTL = 3600       # Ball-Marker loeschen sich nach 1 Stunde selbst
MARKER_TTL_OTHER = 1800 # alle anderen Marker nach 30 Minuten
CACHE_VER = 8          # 2: + Marker-Mails (einmal alles neu einlesen)

try:                                    # vorhandener Uploader (v16) im selben Ordner -> fuer Hochladen
    sys.path.insert(0, HERE)
    import rok_kampf_upload as UP
except Exception:
    UP = None


def log(msg):
    try:
        with open(LOG_FILE, "a", encoding="utf-8") as f:
            f.write(time.strftime("%Y-%m-%d %H:%M:%S ") + msg + "\n")
        if os.path.getsize(LOG_FILE) > 1_000_000:
            with open(LOG_FILE, "r", encoding="utf-8") as f:
                rest = f.readlines()[-1000:]
            with open(LOG_FILE, "w", encoding="utf-8") as f:
                f.writelines(rest)
    except OSError:
        pass


# ---------------------------------------------------------------- Texte DE / EN
TXT = {
    "de": {
        "tab_al": "Alarme", "sub_al": "Marker, abgelaufene Buffs und Gebäude – mit Ton und im Overlay.", "al_tab_list": "📍 Marker", "al_tab_set": "⚙ Einstellungen & Test",
    "mk_ttl": "Ball-Marker löschen sich nach 1 Stunde, alle anderen nach 30 Minuten automatisch.", "al_rules": "Marker-Arten", "al_rules_info": "Trag ein, welche Wörter eure Leader in Markern benutzen. Die erste Art ist „Ball“ (rot, blinkt). Jede Art hat ihren eigenen Ton.",
    "al_words": "Wörter:", "al_other": "Andere Marker:", "al_buffs": "Buff abgelaufen", "al_buffs_info": "Kommt die Spiel-Mail „Buff Ended“, blinkt das Overlay rot und der Ton spielt.",
    "bf_army": "Army Expansion", "bf_attack": "Angriffs-Buff", "bf_def": "Verteidigungs-Buff", "bf_shield": "Friedensschild", "bf_ended": "{b} abgelaufen!",
    "al_bld": "Gebäude & Flaggen", "al_bld_on": "Meldung bei erobert / verloren", "al_bld_filter": "Nur diese (leer = alle, z. B. 7 Pass, Altar):",
    "bld_won": "{n} erobert!", "bld_lost": "{n} gefallen!", "al_test": "Lautstärke, Anzeigedauer & Test", "al_volume": "Lautstärke", "al_show": "Im Overlay für",
    "t_ball": "Test Ball", "t_marker": "Test Marker", "t_buff": "Test Buff", "t_bld": "Test Gebäude", "mk_export_info": "falls Marker nicht erkannt werden – Datei an Claude schicken",
    "snd_alarm": "Alarm", "snd_sirene": "Sirene", "snd_doppel": "Doppel", "snd_glocke": "Glocke", "snd_ding": "Ding", "snd_tief": "Tief", "snd_aus": "Aus",
    "al_close": "Alarme schließen", "ov_mk_mode": "Marker im Overlay", "mm_off": "Aus", "mm_ball": "Nur Ball", "mm_all": "Alle",
    "since_acc": "Stats ab", "since_now": "Ab jetzt", "since_enter": "Zeitpunkt eingeben …", "since_ask": "Ab wann zählen? (TT.MM.JJJJ HH:MM)", "since_none": "alles", "since_hint": "z. B. ab wann du pilotierst",
    "al_tab_lead": "✍ Leadership", "lead_title": "Schnell-Texte für Marker", "lead_info": "Trag ein, was du als Leader oft in Marker schreibst. Ein Klick auf „Kopieren“, im Spiel einfügen (Strg+V) – fertig. Enter im Feld kopiert auch.",
    "lead_add": "Text hinzufügen", "al_names": "Dein Name im Marker", "al_names_info": "Steht einer dieser Namen in einem Marker (z. B. „Mirox Rally“), blinkt es orange in Overlay und App und der Ton spielt. Fantasie-Schrift wie „Mıʀøx“ wird erkannt – trag deinen Namen trotzdem zusätzlich in normaler Schrift ein (mit Komma).",
    "al_names_auto": "Wird gesucht: {n}", "mention_title": "Du wurdest im Marker genannt!", "t_name": "Test Name", "bld_all": "Alle",
    "opt_icons": "Symbole im Overlay", "opt_coords": "Koordinaten bei Markern", "opt_march_icons": "Bilder in der Marsch-Leiste", "opt_spacing": "Abstand Overlay",
    "al_tab_runes": "🔷 Runen", "rn_active": "Runen aktiv", "rn_newest": "Neueste", "rn_overlay": "Runen im Overlay (blau)", "rn_n": "Anzahl im Overlay",
    "rn_rune": "Rune", "rn_empty": "Noch keine Runen-Marker. Sobald ein Marker mit „Rune“ (oder deinen Wörtern unter Einstellungen → Runen) kommt, steht er hier als Kachel.",
    "pos_title": "Position", "pos_info": "Fenster wählen und per Knopf setzen – klappt auch, wenn „Durchklick“ an ist und du nicht ziehen kannst. Die Position bleibt gespeichert.",
    "pos_ov": "Overlay", "pos_march": "Marsch-Leiste", "pos_feed": "Kampf-Feed", "pos_quick": "Schnell-Platz", "pos_fine": "Feinjustieren",
    "pos_step": "Schritt", "pos_exact": "Genau eingeben", "pos_set": "Setzen",
    "march_reset": "Marsch-Werte", "mr_last": "Last Report", "mr_sum": "Total",
    "last_info": "Aktuellster Bericht: Die Leiste zeigt den neuesten Bericht des Marsches so wie im Spiel unter „Data Summary“ – alle Teil-Kämpfe (Battle Streak) zusammengerechnet. Läuft der Kampf weiter, wächst die Zahl mit. Kommt ein komplett neuer Bericht, fängt der Marsch wieder bei 0 an. Barbaren/Späher ändern nichts, solange „nur PvP“ an ist.",
    "fight_gap": "Neues Gefecht nach", "fight_info": "Gefecht: Alle Berichte eines Marsches, die dichter als die eingestellte Pause beieinander liegen, werden zusammengerechnet. Erst nach der Pause startet der Marsch wieder bei 0. Pop-up kommt nur einmal pro Gefecht.",
    "ovt_view": "Anzeige", "ovt_mods": "Module & Märsche", "ovt_pos": "Position", "ovt_vals": "Werte",
    "slot_info": "Leg fest, welcher Marsch auf welchem Platz der Leiste steht (Platz 1 = unten, wie im Spiel). „Automatisch“ nimmt die zuletzt benutzten. Rechtsklick auf die Leiste im Spiel geht auch.",
    "march_auto_s": "Automatisch", "slot_choose": "Marsch wählen ▾", "slot_all_auto": "Alle automatisch", "slot_fix_now": "Aktuelle festhalten", "slot_fixed": "Märsche festgehalten",
    "md_title": "Details zu diesem Marsch", "md_fight": "Aktueller Bericht", "md_today": "Heute", "md_all": "Alle Berichte", "md_reports": "Berichte",
    "md_info": "Jede Zeile = ein Kampfbericht dieses Marsches (neueste oben). Gleiche Nummer = ein Bericht im Spiel (Battle Streak: Hauptbericht + Teil-Berichte werden zusammengerechnet). Hell hinterlegt = der aktuellste Bericht, den die Marsch-Leiste zeigt.",
    "md_time": "Zeit", "md_kp_all": "KP inkl. NPC", "md_n": "Kämpfe", "md_enemy": "Gegner", "md_copy": "Liste kopieren (für Claude)",
    "feed_marches": "Märsche", "ms_scout": "Du wurdest gespäht!", "ms_rank": "Lost Kingdom: Rang {t}", "ms_hosp": "Lazarett {p} % voll",
    "ms_banner85": "Achtung: Lazarett {p} % voll – heilen!", "ms_dead": "Truppen im Lazarett gestorben!", "ms_died": "gestorben",
    "ms_banner_dead": "Lazarett voll – {n} Truppen gestorben!", "t_army": "Army-Buff", "t_scout": "Gespäht", "t_battle": "Kampf-Pop-up",
    "t_rank": "Lost Kingdom S+", "t_hosp70": "Lazarett 70 %", "t_hosp85": "Lazarett 85 %", "t_hospdead": "Truppen gestorben", "t_all": "Alles nacheinander testen",
    "al_msgs": "Nachrichten", "al_msgs_info": "Gespäht = rot blinkend wie ein Buff · Lost Kingdom A+/S/S+ = Pop-up wie nach einem Kampf · Lazarett 70 % = rot blinkend · 85 % = zusätzlich Warnung oben am Bildschirm · Truppen gestorben = alles + lila Rahmen um den Bildschirm.",
    "msg_scout": "Gespäht worden", "msg_rank": "Lost Kingdom Rang", "msg_hosp70": "Lazarett 70 %", "msg_hosp85": "Lazarett 85 %", "msg_hospdead": "Truppen gestorben",
    "ms_hosp_s": "Lazarett", "chain_avg": "Ø Kette", "chain": "Kette", "today_s": "heute", "goal_acc": "Acclaim-Ziel heute",
    "feed_settle": "Feed erst nach", "live": "Live (alle 5 s)", "feed_merge": "Gleicher Gegner = eine Schlacht (z. B. 4 Märsche zusammen)",
    "calc_every": "Neu rechnen alle", "calc_info": "Im großen Kampf ändern sich ständig Berichte. Die App liest laufende Berichte und rechnet nur alle X Sekunden neu – Marker kommen trotzdem sofort. Höher = weniger Last.",
    "march_kind": "Leiste zeigt", "mk_auto": "Automatisch", "mk_pvp": "Nur PvP", "mk_pve": "Nur Barbaren", "chain_gap": "Kette endet nach",
    "all_on": "Overlay (alles)", "all_on_info": "An: Overlay, Marsch-Leiste, Feed und Pop-ups laufen (je nach Einstellung im Reiter Overlay).",
    "all_off_info": "Aus: Alle Overlay-Fenster und Pop-ups sind aus. Strg+Alt+O schaltet wieder an.", "ov_settings": "Overlay einstellen",
    "icon_px": "Bildgröße", "hero_one": "Nur den ersten Kommandanten zeigen", "trade_fmt": "Trade anzeigen als", "tf_pct": "184 %", "tf_ratio": "1,84:1",
    "al_main": "Overlay", "al_toast": "Pop-ups",
    "al_dur_army": "Army Expansion anzeigen", "al_dur_other": "Alle anderen anzeigen", "buff_popup": "Zusätzlich als Pop-up",
    "toast_place": "Pop-up-Position einstellen", "toast_drag": "Zieh mich dahin, wo Pop-ups erscheinen sollen", "toast_drag2": "Dann auf „Fertig“ – danach kommt ein Test-Pop-up.", "done": "Fertig",
    "exp_title": "50 % Army Expansion (aus deinen Kampfberichten)", "exp_info": "Mit 50 % Expansion startet ein Marsch mit über 400K Truppen. Die App schaut in den neuesten Bericht (letzte 3 Std.) und zeigt im Overlay, ob deine 50 % noch aktiv ist.",
    "exp_show": "Im Overlay anzeigen", "exp_alert": "Melden, wenn die 50 % weg ist", "exp_limit": "Ab wie vielen Truppen = 50 %:", "exp_on": "50 % aktiv", "exp_off": "ohne 50 %",
    "exp_gone": "50 % Expansion weg!", "exp_troops": "Marsch nur noch {n} Truppen", "exp_now_on": "Gerade: aktiv (%s)", "exp_now_off": "Gerade: nicht aktiv (%s)", "exp_none": "Noch kein Bericht in den letzten 3 Std.",
    "rok_only": "Nur mit Rise of Kingdoms öffnen", "rok_only_info": "Zusammen mit „Mit Windows starten“: Die App wartet unsichtbar und öffnet sich erst, wenn RoK läuft. Schließt du RoK, verschwinden App und Overlay wieder.",
    "rok_now_on": "RoK läuft gerade ✓", "rok_now_off": "RoK läuft gerade nicht",
    "order_title": "Reihenfolge im Overlay", "order_info": "Mit ▲ ▼ verschieben – z. B. Acclaim über KP-Trade. Neue Werte kommen unten dazu.",
    "hk_title": "Tastenkürzel", "hk_set_info": "Ins Feld klicken und die neue Kombination drücken (z. B. Strg+Umschalt+F2). Funktioniert auch im Spiel. ✖ = von einem anderen Programm belegt.",
    "hk_overlay_l": "Overlay an/aus", "hk_reset_l": "Session neu", "hk_click_l": "Durchklick an/aus", "hk_busy": "belegt", "hk_reset_all": "Standard (Strg+Alt+O/R/D)",
    "hk_need_mod": "Bitte mit Strg, Alt oder Shift kombinieren",
    "pp_title": "Pop-ups", "pp_info": "Wähle, was zusätzlich als Pop-up (wie nach einem Kampf) erscheinen soll. Mehrere kommen nacheinander. Die Position stellst du mit dem Knopf unten ein.",
    "pp_battle": "Kampf", "pp_ball": "Neuer Ball-Marker", "pp_marker": "Andere Marker", "pp_mention": "Dein Name im Marker", "pp_army": "Army Expansion abgelaufen",
    "pp_buff": "Andere Buffs abgelaufen", "pp_exp": "50 % Expansion weg", "pp_scout": "Gespäht", "pp_hosp": "Lazarett", "pp_rank": "Lost Kingdom Rang", "pp_bld": "Gebäude / Flaggen",
    "pp_test": "Alle eingeschalteten testen",
    "ovt_march": "Marsch-Leiste", "ovt_feed": "Feed & Leistung", "look_title": "Aussehen", "goals_title": "Tagesziele", "march_show": "Marsch-Leiste anzeigen",
    "perf_title": "Leistung", "perf_tips": "Flüssig bleiben: Deckkraft 100 % (Durchsichtigkeit kostet Windows am meisten) · nur die Fenster an, die du brauchst · RoK im Fenster-/randlosen Modus · „Neu rechnen alle“ im großen Kampf auf 10 s.",
    "as_marker": "Marker", "as_buffs": "Buffs & 50 %", "as_msgs": "Nachrichten", "as_bld": "Gebäude", "as_popups": "Pop-ups", "as_test": "Ton & Test",
    "pp_color": "Farbe (A = Standard)",
    "streak_gap": "Battle Streak bis", "streak_info": "Nur falls das Spiel keine Hauptbericht-Nummer mitschickt: Berichte desselben Marsches, die dichter als diese Zeit kommen, zählen als EINE Battle Streak (wie im Spiel „Battle Streak: 5“).",
    "md_export": "Berichte als Datei für Claude",
    "md_parts": "Aktuelle Battle Streak: {h} von {n} Teilen im Mail-Ordner.", "md_parts_miss": "Es fehlen Teile – öffne den Bericht einmal im Spiel, dann lädt RoK sie nach und die Zahl stimmt.",
    "tab_marches": "Märsche", "sub_marches": "Wie gut jeder deiner Märsche ist – kurz und knapp.", "r_30d": "30 Tage",
    "mt_pair": "Marsch", "mt_n": "Kämpfe", "mt_kp": "Kill Points", "mt_kills": "Kills", "mt_acc": "Acclaim", "mt_dead": "Tote", "mt_trade": "Trade",
    "mt_total_kp": "Kill Points gesamt", "mt_meta_kp": "{n} Kämpfe · {m} Märsche", "mt_ratio": "Tote-Ratio", "mt_trade_l": "Trade", "mt_per_fight": "KP pro Kampf",
    "mt_hint": "Spalte anklicken = sortieren · Kills = Gegner tot + schwer verwundet", "march_vals": "Werte",
    "mv_kp": "KP", "mv_kills": "Kills", "mv_acc": "Acclaim", "mv_trade": "Trade", "mv_dead": "Tote", "mv_n": "Kämpfe",
    "tab_start": "Start", "sub_start": "Status, Overlay und Link zu deinen Daten.", "open_site": "Alle Details auf der Website", "h_quick": "Overlay schnell schalten",
    "h_active": "Gerade aktiv: {n}", "h_uploaded": "Zuletzt hochgeladen {t} ({n} Zeilen)", "h_upload_none": "Noch nichts hochgeladen", "h_upload_off": "Hochladen ist aus (Einstellungen)",
    "card_modules": "Module", "mod_feed": "Kampf-Feed (letzte Kämpfe)", "mod_toast": "Pop-up nach jedem Kampf", "mod_march": "Marsch-Leiste (neben den Märschen)",
    "mod_click": "Durchklick (Maus geht ins Spiel)", "mod_feed_pve": "Feed auch mit Barbaren/NPC", "feed_n": "Feed-Kämpfe", "march_n": "Märsche",
    "march_gap": "Zeilenabstand", "goal_today": "Ziel heute", "victory": "Sieg", "defeat": "Niederlage", "kill_count": "Kill Count", "trade": "Trade",
    "feed_empty": "Noch kein Kampf", "march_empty": "Noch keine Märsche", "march_auto": "Automatisch (zuletzt benutzt)",
    "march_info": "Marsch-Leiste: links neben die Marsch-Liste im Spiel schieben, Zeilenabstand anpassen. Rechtsklick auf eine Zeile = Marsch festlegen.",
    "hk_info": "Tastenkürzel (auch im Spiel): Strg+Alt+O Overlay an/aus · Strg+Alt+R Session neu · Strg+Alt+D Durchklick an/aus",
    "ct_on": "Durchklick AN – Strg+Alt+D zum Ausschalten", "ct_off": "Durchklick aus – Overlay ist wieder verschiebbar",
    "tab_home": "Übersicht", "sub_home": "Deine Werte und die neuesten Ball-Marker auf einen Blick.", "h_last": "Letzter Kampf & Zeitraum",
    "h_nomarch": "Noch kein PvP-Gegner – nach dem nächsten Kampf siehst du hier seine Märsche.", "h_march_info": "{e}: {n} verschiedene Märsche in den letzten 7 Tagen",
    "h_noball": "Noch kein Ball-Marker. Neue erscheinen hier und im Overlay.", "off": "Aus",
    "now_active": "gerade aktiv", "acc_focus": "Account:", "f_auto": "Automatisch", "f_all": "Alle", "add_id": "ID hinzufügen (z. B. neuer Pilot-Account)", "add_btn": "Als Pilot binden", "add_alt": "Als Zweitaccount",
    "ov_source": "Zahlen von", "src_web": "Website", "src_local": "nur PC", "ov_style": "Stil", "st_tiles": "Kacheln", "st_list": "Liste", "st_bar": "Leiste",
    "ov_balls": "Ball-Marker", "ov_ball_n": "Ball-Marker im Overlay", "mk_clear": "Alle löschen", "mk_keep": "Ball-Marker behalten",
    "title": "Wiz fan Club App", "tab_conn": "Verbinden", "tab_acc": "Accounts", "tab_ov": "Overlay", "tab_set": "Einstellungen",
        "site": "Website-Adresse", "code": "Code von der Website", "pair": "Verbinden", "connected": "Verbunden als {n}",
        "not_conn": "Nicht verbunden. Öffne auf der Website die Seite „App verbinden“ (/uploader.html), erzeuge einen Code und gib ihn hier ein.",
        "disconnect": "Trennen", "open_page": "Seite öffnen",
        "acc_info": "Diese Accounts wurden in deinem Mailcache gefunden. Binde die, die dir gehören – nur deren Kämpfe zählen.",
        "c_id": "Governor-ID", "c_name": "Name", "c_mails": "Berichte", "c_last": "Zuletzt", "c_state": "Status",
        "bind": "Binden", "unbind": "Lösen", "bound": "gebunden ✔", "free": "–", "refresh": "Aktualisieren",
        "need_conn": "Bitte zuerst verbinden.", "pick_acc": "Bitte einen Account in der Liste auswählen.",
        "ov_show": "Overlay anzeigen", "ov_lock": "Position sperren", "ov_alpha": "Deckkraft", "ov_range": "Zeitraum",
        "ov_since": "Seit (JJJJ-MM-TT)", "ov_values": "Angezeigte Werte", "ov_reset": "Session neu starten", "ov_size": "Größe",
        "ov_pvp_only": "KP und Trades nur aus PvP", "ov_hint": "Overlay mit der Maus verschieben. Rechtsklick = Menü. Das Spiel im Fenster- oder randlosen Modus laufen lassen, sonst liegt es über dem Overlay.",
        "r_session": "Session", "r_today": "Heute", "r_24h": "24 Std.", "r_2d": "2 Tage", "r_3d": "3 Tage", "r_4d": "4 Tage", "r_5d": "5 Tage", "r_6d": "6 Tage", "r_7d": "7 Tage", "r_since": "Seit Datum (z. B. KvK-Start)", "r_all": "Alles",
        "m_kp": "KP", "m_kp_all": "KP gesamt (alles)", "m_kp_last": "KP letzter Kampf", "m_kp_trade": "KP-Trade", "m_loss_trade": "Verlust-Trade",
        "m_power_trade": "Power-Trade", "m_dead": "Eigene Tote", "m_severe": "Eigene Schwerverw.", "m_wounded": "Eigene Leichtverw.",
        "m_enemy_out": "Gegner ausgeschaltet", "m_enemy_dead": "Gegner tot", "m_pvp": "PvP-Kämpfe", "m_pve": "PvE-Kämpfe", "m_kph": "KP pro Stunde",
        "m_last_enemy": "Letzter Gegner", "m_enemy_marches": "Märsche des Gegners", "m_last_marches": "Gegner-Märsche im letzten Kampf",
        "m_barb": "Barbaren getötet", "m_barb_hits": "Barbaren-Kämpfe", "m_barb_lvl": "Höchstes Barbaren-Level", "m_forts": "Forts besiegt", "m_acclaim": "Acclaim",
        "folders": "Spielordner (mit save\\mailcache)", "add": "Hinzufügen…", "remove": "Entfernen", "detect": "Automatisch suchen",
        "upload": "Kampfberichte der gebundenen IDs hochladen", "upload_days": "Beim ersten Mal nur die letzten Tage",
        "upload_hint": "Nicht nötig, wenn der alte Uploader (rok_kampf_upload.py) schon läuft.", "upload_off": "Hochladen geht nur, wenn rok_kampf_upload.py im selben Ordner liegt.",
        "autostart": "Mit Windows starten", "start_min": "Minimiert starten", "lang": "Sprache", "save": "Speichern",
        "status_scan": "Lese Mailcache… {n} Dateien", "status_ok": "{b} Kampfberichte · zuletzt {t}", "status_nofolder": "Kein Spielordner gefunden – unter Einstellungen hinzufügen.",
        "uploaded": "{n} Kämpfe hochgeladen", "err": "Fehler", "menu_values": "Werte", "menu_range": "Zeitraum", "menu_hide": "Ausblenden", "menu_main": "App öffnen",
        "no_data": "noch keine Kämpfe",
    },
    "en": {
        "tab_al": "Alerts", "sub_al": "Markers, expired buffs and buildings – with sound and in the overlay.", "al_tab_list": "📍 Markers", "al_tab_set": "⚙ Settings & test",
    "mk_ttl": "Ball markers delete themselves after 1 hour, all others after 30 minutes.", "al_rules": "Marker types", "al_rules_info": "Enter the words your leaders use in markers. The first type is “Ball” (red, blinking). Each type has its own sound.",
    "al_words": "Words:", "al_other": "Other markers:", "al_buffs": "Buff expired", "al_buffs_info": "When the game mail “Buff Ended” arrives, the overlay blinks red and the sound plays.",
    "bf_army": "Army Expansion", "bf_attack": "Attack buff", "bf_def": "Defense buff", "bf_shield": "Peace shield", "bf_ended": "{b} expired!",
    "al_bld": "Buildings & flags", "al_bld_on": "Alert when taken / lost", "al_bld_filter": "Only these (empty = all, e.g. 7 Pass, Altar):",
    "bld_won": "{n} taken!", "bld_lost": "{n} lost!", "al_test": "Volume, duration & test", "al_volume": "Volume", "al_show": "Show in overlay for",
    "t_ball": "Test ball", "t_marker": "Test marker", "t_buff": "Test buff", "t_bld": "Test building", "mk_export_info": "if markers are not detected – send the file to Claude",
    "snd_alarm": "Alarm", "snd_sirene": "Siren", "snd_doppel": "Double", "snd_glocke": "Bell", "snd_ding": "Ding", "snd_tief": "Low", "snd_aus": "Off",
    "al_close": "Close alerts", "ov_mk_mode": "Markers in overlay", "mm_off": "Off", "mm_ball": "Ball only", "mm_all": "All",
    "since_acc": "Stats from", "since_now": "From now", "since_enter": "Enter date/time …", "since_ask": "Count from when? (DD.MM.YYYY HH:MM)", "since_none": "all", "since_hint": "e.g. when you started piloting",
    "al_tab_lead": "✍ Leadership", "lead_title": "Quick texts for markers", "lead_info": "Enter what you often write in markers as a leader. Click “Copy”, paste in game (Ctrl+V) – done. Enter in the field copies too.",
    "lead_add": "Add text", "al_names": "Your name in a marker", "al_names_info": "If one of these names is in a marker (e.g. “Mirox Rally”), the overlay and app blink orange and the sound plays. Fancy fonts like “Mıʀøx” are detected – still add your name in plain letters (comma separated).",
    "al_names_auto": "Searching for: {n}", "mention_title": "You were named in a marker!", "t_name": "Test name", "bld_all": "All",
    "opt_icons": "Symbols in overlay", "opt_coords": "Coordinates for markers", "opt_march_icons": "Pictures in march bar", "opt_spacing": "Overlay spacing",
    "al_tab_runes": "🔷 Runes", "rn_active": "Active runes", "rn_newest": "Newest", "rn_overlay": "Runes in overlay (blue)", "rn_n": "Count in overlay",
    "rn_rune": "Rune", "rn_empty": "No rune markers yet. As soon as a marker with “rune” (or your words under Settings → Runes) arrives, it shows up here as a tile.",
    "pos_title": "Position", "pos_info": "Pick a window and place it with the buttons – works even when click-through is on and you can't drag. Position is saved.",
    "pos_ov": "Overlay", "pos_march": "March bar", "pos_feed": "Battle feed", "pos_quick": "Quick spot", "pos_fine": "Fine tune",
    "pos_step": "Step", "pos_exact": "Exact", "pos_set": "Set",
    "march_reset": "March values", "mr_last": "Last Report", "mr_sum": "Total",
    "last_info": "Latest report: the bar always shows the newest battle report of the march. While the battle goes on, the number grows. A completely new report starts the march at 0 again.",
    "fight_gap": "New engagement after", "fight_info": "Engagement: all reports of a march closer together than the set pause are summed up. Only after the pause the march starts at 0 again. Pop-up comes once per engagement.",
    "ovt_view": "Display", "ovt_mods": "Modules & marches", "ovt_pos": "Position", "ovt_vals": "Values",
    "slot_info": "Choose which march sits on which spot of the bar (spot 1 = bottom, like in game). “Automatic” uses the last used ones. Right-click on the bar in game works too.",
    "march_auto_s": "Automatic", "slot_choose": "Choose march ▾", "slot_all_auto": "All automatic", "slot_fix_now": "Pin current", "slot_fixed": "Marches pinned",
    "md_title": "Details for this march", "md_fight": "Current report", "md_today": "Today", "md_all": "All reports", "md_reports": "Reports",
    "md_info": "Each line = one battle report of this march (newest on top). Highlighted = the latest report shown in the march bar.",
    "md_time": "Time", "md_kp_all": "KP incl. NPC", "md_n": "Fights", "md_enemy": "Enemy", "md_copy": "Copy list",
    "feed_marches": "marches", "ms_scout": "You were scouted!", "ms_rank": "Lost Kingdom: rank {t}", "ms_hosp": "Hospital {p} % full",
    "ms_banner85": "Warning: hospital {p} % full – heal!", "ms_dead": "Troops died in hospital!", "ms_died": "died",
    "ms_banner_dead": "Hospital full – {n} troops died!", "t_army": "Army buff", "t_scout": "Scouted", "t_battle": "Battle pop-up",
    "t_rank": "Lost Kingdom S+", "t_hosp70": "Hospital 70 %", "t_hosp85": "Hospital 85 %", "t_hospdead": "Troops died", "t_all": "Test everything in a row",
    "al_msgs": "Messages", "al_msgs_info": "Scouted = red blinking like a buff · Lost Kingdom A+/S/S+ = pop-up like after a battle · Hospital 70 % = red blinking · 85 % = plus warning at the top of the screen · Troops died = all + purple border around the screen.",
    "msg_scout": "Scouted", "msg_rank": "Lost Kingdom rank", "msg_hosp70": "Hospital 70 %", "msg_hosp85": "Hospital 85 %", "msg_hospdead": "Troops died",
    "ms_hosp_s": "Hospital", "chain_avg": "Ø chain", "chain": "Chain", "today_s": "today", "goal_acc": "Acclaim goal today",
    "feed_settle": "Feed only after", "live": "Live (every 5 s)", "feed_merge": "Same enemy = one battle (e.g. 4 marches together)",
    "calc_every": "Recalculate every", "calc_info": "In big fights reports change all the time. The app re-reads running reports and recalculates only every X seconds – markers still come instantly. Higher = less load.",
    "march_kind": "Bar shows", "mk_auto": "Automatic", "mk_pvp": "PvP only", "mk_pve": "Barbarians only", "chain_gap": "Chain ends after",
    "all_on": "Overlay (everything)", "all_on_info": "On: overlay, march bar, feed and pop-ups run (as set in the Overlay tab).",
    "all_off_info": "Off: all overlay windows and pop-ups are off. Ctrl+Alt+O turns them back on.", "ov_settings": "Overlay settings",
    "icon_px": "Picture size", "hero_one": "Show only the first commander", "trade_fmt": "Show trade as", "tf_pct": "184 %", "tf_ratio": "1.84:1",
    "al_main": "Overlay", "al_toast": "Pop-ups",
    "al_dur_army": "Show army expansion", "al_dur_other": "Show all others", "buff_popup": "Also as pop-up",
    "toast_place": "Set pop-up position", "toast_drag": "Drag me where pop-ups should appear", "toast_drag2": "Then click “Done” – a test pop-up follows.", "done": "Done",
    "exp_title": "50 % army expansion (from your battle reports)", "exp_info": "With 50 % expansion a march starts with more than 400K troops. The app checks the newest report (last 3 h) and shows in the overlay whether your 50 % is still active.",
    "exp_show": "Show in overlay", "exp_alert": "Alert when the 50 % is gone", "exp_limit": "From how many troops = 50 %:", "exp_on": "50 % active", "exp_off": "without 50 %",
    "exp_gone": "50 % expansion gone!", "exp_troops": "March only {n} troops", "exp_now_on": "Now: active (%s)", "exp_now_off": "Now: not active (%s)", "exp_none": "No report in the last 3 h yet.",
    "rok_only": "Only open with Rise of Kingdoms", "rok_only_info": "Together with “Start with Windows”: the app waits invisibly and only opens when RoK runs. Close RoK and app + overlay disappear again.",
    "rok_now_on": "RoK is running ✓", "rok_now_off": "RoK is not running",
    "order_title": "Order in overlay", "order_info": "Move with ▲ ▼ – e.g. acclaim above KP trade. New values are added at the bottom.",
    "hk_title": "Hotkeys", "hk_set_info": "Click into the field and press the new combination (e.g. Ctrl+Shift+F2). Works in game too. ✖ = used by another program.",
    "hk_overlay_l": "Overlay on/off", "hk_reset_l": "New session", "hk_click_l": "Click-through on/off", "hk_busy": "in use", "hk_reset_all": "Default (Ctrl+Alt+O/R/D)",
    "hk_need_mod": "Please combine with Ctrl, Alt or Shift",
    "pp_title": "Pop-ups", "pp_info": "Choose what should also appear as a pop-up (like after a battle). Several come one after another. Set the position with the button below.",
    "pp_battle": "Battle", "pp_ball": "New ball marker", "pp_marker": "Other markers", "pp_mention": "Your name in a marker", "pp_army": "Army expansion ended",
    "pp_buff": "Other buffs ended", "pp_exp": "50 % expansion gone", "pp_scout": "Scouted", "pp_hosp": "Hospital", "pp_rank": "Lost Kingdom rank", "pp_bld": "Buildings / flags",
    "pp_test": "Test all enabled",
    "ovt_march": "March bar", "ovt_feed": "Feed & performance", "look_title": "Look", "goals_title": "Daily goals", "march_show": "Show march bar",
    "perf_title": "Performance", "perf_tips": "Stay smooth: opacity 100 % (transparency costs Windows the most) · only the windows you need · RoK in windowed/borderless mode · set “Recalculate every” to 10 s in big fights.",
    "as_marker": "Markers", "as_buffs": "Buffs & 50 %", "as_msgs": "Messages", "as_bld": "Buildings", "as_popups": "Pop-ups", "as_test": "Sound & test",
    "pp_color": "Colour (A = default)",
    "streak_gap": "Battle streak up to", "streak_info": "Only if the game sends no main-report number: reports of the same march closer than this count as ONE battle streak (like “Battle Streak: 5” in game).",
    "md_export": "Export reports for Claude",
    "md_parts": "Current battle streak: {h} of {n} parts in the mail folder.", "md_parts_miss": "Parts are missing – open the report once in game, then RoK downloads them and the number is right.",
    "tab_marches": "Marches", "sub_marches": "How good each of your marches is – short and simple.", "r_30d": "30 days",
    "mt_pair": "March", "mt_n": "Fights", "mt_kp": "Kill points", "mt_kills": "Kills", "mt_acc": "Acclaim", "mt_dead": "Dead", "mt_trade": "Trade",
    "mt_total_kp": "Total kill points", "mt_meta_kp": "{n} fights · {m} marches", "mt_ratio": "dead ratio", "mt_trade_l": "trade", "mt_per_fight": "KP per fight",
    "mt_hint": "Click a column = sort · Kills = enemy dead + severely wounded", "march_vals": "Values",
    "mv_kp": "KP", "mv_kills": "Kills", "mv_acc": "Acclaim", "mv_trade": "Trade", "mv_dead": "Dead", "mv_n": "Fights",
    "tab_start": "Start", "sub_start": "Status, overlay and link to your data.", "open_site": "All details on the website", "h_quick": "Quick overlay switches",
    "h_active": "Active now: {n}", "h_uploaded": "Last upload {t} ({n} rows)", "h_upload_none": "Nothing uploaded yet", "h_upload_off": "Uploading is off (settings)",
    "card_modules": "Modules", "mod_feed": "Battle feed (last battles)", "mod_toast": "Pop-up after every battle", "mod_march": "March bar (next to marches)",
    "mod_click": "Click-through (mouse goes to game)", "mod_feed_pve": "Feed also with barbarians/NPC", "feed_n": "Feed battles", "march_n": "Marches",
    "march_gap": "Row spacing", "goal_today": "Goal today", "victory": "Victory", "defeat": "Defeat", "kill_count": "Kill Count", "trade": "Trade",
    "feed_empty": "No battle yet", "march_empty": "No marches yet", "march_auto": "Automatic (last used)",
    "march_info": "March bar: drag it left of the march list in the game, adjust row spacing. Right-click a row = choose march.",
    "hk_info": "Hotkeys (also in game): Ctrl+Alt+O overlay on/off · Ctrl+Alt+R new session · Ctrl+Alt+D click-through on/off",
    "ct_on": "Click-through ON – Ctrl+Alt+D to turn off", "ct_off": "Click-through off – overlay can be moved again",
    "tab_home": "Overview", "sub_home": "Your stats and the latest ball markers at a glance.", "h_last": "Last battle & period",
    "h_nomarch": "No PvP enemy yet – after your next battle you see their marches here.", "h_march_info": "{e}: {n} different marches in the last 7 days",
    "h_noball": "No ball marker yet. New ones appear here and in the overlay.", "off": "Off",
    "now_active": "active now", "acc_focus": "Account:", "f_auto": "Automatic", "f_all": "All", "add_id": "Add ID (e.g. new pilot account)", "add_btn": "Link as pilot", "add_alt": "As alt account",
    "ov_source": "Numbers from", "src_web": "Website", "src_local": "PC only", "ov_style": "Style", "st_tiles": "Tiles", "st_list": "List", "st_bar": "Bar",
    "ov_balls": "Ball markers", "ov_ball_n": "Ball markers in overlay", "mk_clear": "Delete all", "mk_keep": "Keep ball markers",
    "title": "Wiz fan Club App", "tab_conn": "Connect", "tab_acc": "Accounts", "tab_ov": "Overlay", "tab_set": "Settings",
        "site": "Website address", "code": "Code from the website", "pair": "Connect", "connected": "Connected as {n}",
        "not_conn": "Not connected. On the website open “Connect the app” (/uploader.html), create a code and enter it here.",
        "disconnect": "Disconnect", "open_page": "Open page",
        "acc_info": "These accounts were found in your mailcache. Link the ones you own – only their battles count.",
        "c_id": "Governor ID", "c_name": "Name", "c_mails": "Reports", "c_last": "Last", "c_state": "Status",
        "bind": "Link", "unbind": "Unlink", "bound": "linked ✔", "free": "–", "refresh": "Refresh",
        "need_conn": "Please connect first.", "pick_acc": "Please select an account in the list.",
        "ov_show": "Show overlay", "ov_lock": "Lock position", "ov_alpha": "Opacity", "ov_range": "Time range",
        "ov_since": "Since (YYYY-MM-DD)", "ov_values": "Shown values", "ov_reset": "Restart session", "ov_size": "Size",
        "ov_pvp_only": "KP and trades from PvP only", "ov_hint": "Drag the overlay with the mouse. Right-click = menu. Run the game in windowed or borderless mode, otherwise it covers the overlay.",
        "r_session": "Session", "r_today": "Today", "r_24h": "24 h", "r_2d": "2 days", "r_3d": "3 days", "r_4d": "4 days", "r_5d": "5 days", "r_6d": "6 days", "r_7d": "7 days", "r_since": "Since date (e.g. KvK start)", "r_all": "All",
        "m_kp": "KP", "m_kp_all": "Total KP (all)", "m_kp_last": "KP last battle", "m_kp_trade": "KP trade", "m_loss_trade": "Loss trade",
        "m_power_trade": "Power trade", "m_dead": "Own dead", "m_severe": "Own severely wounded", "m_wounded": "Own slightly wounded",
        "m_enemy_out": "Enemies taken out", "m_enemy_dead": "Enemies dead", "m_pvp": "PvP battles", "m_pve": "PvE battles", "m_kph": "KP per hour",
        "m_last_enemy": "Last enemy", "m_enemy_marches": "Enemy's marches", "m_last_marches": "Enemy marches in last battle",
        "m_barb": "Barbarians killed", "m_barb_hits": "Barbarian battles", "m_barb_lvl": "Highest barbarian level", "m_forts": "Forts defeated", "m_acclaim": "Acclaim",
        "folders": "Game folders (containing save\\mailcache)", "add": "Add…", "remove": "Remove", "detect": "Search automatically",
        "upload": "Upload battle reports of linked IDs", "upload_days": "First time only the last days",
        "upload_hint": "Not needed if the old uploader (rok_kampf_upload.py) is already running.", "upload_off": "Uploading needs rok_kampf_upload.py in the same folder.",
        "autostart": "Start with Windows", "start_min": "Start minimized", "lang": "Language", "save": "Save",
        "status_scan": "Reading mailcache… {n} files", "status_ok": "{b} battle reports · last {t}", "status_nofolder": "No game folder found – add one under Settings.",
        "uploaded": "{n} battles uploaded", "err": "Error", "menu_values": "Values", "menu_range": "Time range", "menu_hide": "Hide", "menu_main": "Open app",
        "no_data": "no battles yet",
    },
}
METRICS = ["m_kp", "m_kp_all", "m_kp_last", "m_kp_trade", "m_loss_trade", "m_power_trade", "m_dead", "m_severe", "m_wounded",
           "m_enemy_out", "m_enemy_dead", "m_pvp", "m_pve", "m_kph", "m_last_enemy", "m_enemy_marches", "m_last_marches", "m_barb", "m_barb_hits", "m_barb_lvl", "m_forts", "m_acclaim"]
RANGES = ["r_session", "r_today", "r_24h", "r_2d", "r_3d", "r_4d", "r_5d", "r_6d", "r_7d", "r_since", "r_all"]


def range_days(rng):
    """r_24h -> 1, r_2d -> 2 ... r_7d -> 7, sonst None"""
    if rng == "r_24h":
        return 1
    m = re.match(r"r_(\d+)d$", str(rng))
    return int(m.group(1)) if m and int(m.group(1)) <= 7 else None

DEFAULT_CFG = {
    "api_base": "https://wiz-fanclub.vercel.app", "token": "", "user_name": "", "lang": "de",
    "game_folders": [], "links": [],
    "overlay": {"show": True, "x": 60, "y": 60, "alpha": 0.85, "locked": False, "size": 11,
                "metrics": ["m_kp", "m_kp_trade", "m_loss_trade", "m_dead", "m_kp_last"],
                "range": "r_session", "since": "", "pvp_only": True, "count_pilot": False, "ball_n": 3, "style": "tiles", "source": "web", "focus": "auto", "mk_mode": "ball",
                "feed": True, "feed_n": 4, "feed_pve": False, "toast": True, "march": False, "march_n": 4, "march_gap": 96,
                "march_slots": [None] * 7, "march_vals": ["kp", "trade"], "march_reset": "last", "goal_kp": 0, "icons": True, "spacing": 7, "mk_coords": True, "clickthrough": False},
    "upload": None, "upload_days": 14, "start_min": False,
    "alerts": {"buff_army": True, "buff_attack": True, "buff_def": True, "buff_shield": False, "buff_sound": "sirene",
               "bld": True, "bld_filter": "", "bld_sound": "glocke", "show_min": 10, "overlay": True, "volume": 80,
               "msg_scout": True, "msg_rank": True, "msg_hosp70": True, "msg_hosp85": True, "msg_hospdead": True,
               "scout_sound": "doppel", "rank_sound": "glocke", "hosp_sound": "sirene"},
    "markers": {"filter": "all", "sort": "new", "keep_ball": 5, "words": "ball, garrison, garni, stack, def, rally", "sound": True, "overlay": True,
                "rules": [{"name": "Ball", "words": "ball, stack, ballen", "sound": "alarm"},
                          {"name": "Rally", "words": "rally, ralli, hit, angriff, attack", "sound": "doppel"},
                          {"name": "Garnison", "words": "garrison, garni, gar, def, verteidig", "sound": "glocke"},
                          {"name": "Runen", "words": "rune, runes, runen, rn", "sound": "ding"}],
                "my_names": "", "mention_sound": "sirene", "snippets": ["BALL HERE", "RALLY 1", "GARNI PASS 7", "ALL TO ALTAR"],
                "other_sound": "ding",
                "alarm_all": False, "show_min": 10},
}


def load_cfg():
    cfg = json.loads(json.dumps(DEFAULT_CFG))
    try:
        with open(CFG_FILE, encoding="utf-8") as f:
            user = json.load(f)
        ov = user.pop("overlay", {})
        mk = user.pop("markers", {})
        al = user.pop("alerts", {})
        cfg.update(user); cfg["overlay"].update(ov); cfg["markers"].update(mk); cfg["alerts"].update(al)
        rl = cfg["markers"].get("rules") or []
        if len(rl) == 3:                                             # v0.20: 4. Art Runen
            rl.append({"name": "Runen", "words": "rune, runes, runen, rn", "sound": "ding"})
        if cfg.get("api_base", "").rstrip("/") == "https://rok-scanner.vercel.app":   # v0.30: alte Standard-Adresse gibt es nicht
            cfg["api_base"] = "https://wiz-fanclub.vercel.app"
        if cfg["overlay"].get("march_reset") == "fight":              # v0.28: Gefecht-Modus entfernt -> aktuellster Bericht
            cfg["overlay"]["march_reset"] = "last"
        if len(rl) >= 3 and rl[2].get("name") == "Sammeln":          # v0.19: 3. Art ist jetzt Garnison
            rl[2] = {"name": "Garnison", "words": "garrison, garni, gar, def, verteidig", "sound": "glocke"}
    except Exception:
        pass
    if not cfg["game_folders"]:                         # alte config.json des Uploaders uebernehmen
        try:
            with open(os.path.join(HERE, "config.json"), encoding="utf-8") as f:
                old = json.load(f)
            cfg["game_folders"] = [g["path"] for g in old.get("game_folders", []) if g.get("path")]
        except Exception:
            pass
    if not cfg["game_folders"]:
        cfg["game_folders"] = detect_folders()
    if not cfg.get("upload_v16"):          # v0.16: sofort selbst hochladen (auch wenn der Uploader laeuft) -> Website ist gleich aktuell
        cfg["upload"], cfg["upload_v16"] = True, True
    if cfg.get("upload") is None:          # erster Start: eigener Uploader da (config.json mit Schluessel)? Dann macht der das.
        own = False
        try:
            with open(os.path.join(HERE, "config.json"), encoding="utf-8") as f:
                own = bool(json.load(f).get("supabase_key"))
        except Exception:
            pass
        cfg["upload"] = not own
    return cfg


def save_cfg(cfg):
    try:
        with open(CFG_FILE, "w", encoding="utf-8") as f:
            json.dump(cfg, f, ensure_ascii=False, indent=1)
    except OSError as e:
        log("config speichern: %s" % e)


def detect_folders():
    found = []
    subs = ["Rise of Kingdoms Game", r"Spiele\Rise of Kingdoms Game", r"Games\Rise of Kingdoms Game", r"ROK Viet\Rise of Kingdoms Game",
            r"Program Files (x86)\Rise of Kingdoms\Rise of Kingdoms Game", r"Program Files\Rise of Kingdoms\Rise of Kingdoms Game",
            r"Program Files (x86)\Rise of Kingdoms Game", r"Spieleplattformen\Rise of Kingdoms Game",
            r"Program Files (x86)\Steam\steamapps\common\Rise of Kingdoms", r"SteamLibrary\steamapps\common\Rise of Kingdoms"]
    for d in "CDEFGH":
        for s in subs:
            p = "%s:\\%s" % (d, s)
            if os.path.isdir(os.path.join(p, "save", "mailcache")) and p not in found:
                found.append(p)
    return found


# ---------------------------------------------------------------- Mailcache lesen (gleiches Format wie der Uploader)
def _rd(b, i):
    if i >= len(b):
        return None, i
    t = b[i]; i += 1
    if t == 4:
        n = struct.unpack_from("<I", b, i)[0]; i += 4
        return b[i:i + n].decode("utf-8", "replace"), i + n
    if t == 3:
        return struct.unpack_from(">d", b, i)[0], i + 8
    if t == 1:
        return bool(b[i]), i + 1
    if t == 2:
        return None, i
    if t == 5:
        d = {}
        while i < len(b) and b[i] != 0xFF:
            k, i = _rd(b, i)
            v, i = _rd(b, i)
            if isinstance(v, float) and v.is_integer():
                v = int(v)
            if isinstance(k, float):
                k = int(k)
            d[str(k)] = v
        return d, i + 1
    raise ValueError("Typ %d" % t)


_OWNER_RE = re.compile(rb"player_(\d{5,12})")
_MARK_RE = re.compile(rb"(?i)mark|sign|flag")


def read_mail(path):
    with open(path, "rb") as f:
        return read_mail_bytes(f.read())


def read_mail_bytes(b):
    start = b.find(b"\x05\x04")
    while 0 <= start <= 32:
        n = struct.unpack_from("<I", b, start + 2)[0] if start + 6 <= len(b) else 0
        if 0 < n < 64:
            return _rd(b, start)[0]
        start = b.find(b"\x05\x04", start + 1)
    return None


def _n(d, k):
    v = (d or {}).get(k) if isinstance(d, dict) else None
    return v if isinstance(v, (int, float)) else 0


def _parent_of(mail, content):
    """ID des Hauptberichts (Battle Streak) – Feldname im Spiel nicht sicher, daher alle Kandidaten."""
    for d in (mail, mail.get("body") or {}, content or {}):
        if not isinstance(d, dict):
            continue
        for k, v in d.items():
            kl = str(k).lower()
            if ("parent" in kl or "streak" in kl or kl in ("pid_mail", "groupid", "gid")) and v not in (None, "", 0, "0") \
                    and not isinstance(v, (dict, list)):
                return v
    return None


def summarize(mail):
    """Kleine Zusammenfassung eines Kampfberichts fuer das Overlay (oder None)."""
    if not isinstance(mail, dict) or mail.get("type") != "Battle":
        return None
    c = (mail.get("body") or {}).get("content") or {}
    me = c.get("SelfChar") or {}
    pid = me.get("PId")
    if not isinstance(pid, int):
        return None
    t = c.get("Bts") or mail.get("time") or 0
    if isinstance(t, (int, float)) and t > 1e14:
        t = t / 1e6
    out = {"id": str(mail.get("id")), "pid": pid, "name": me.get("PName"), "t": int(t or 0), "arch": mail.get("box") == "Archive", "fights": [],
           "par": str(_parent_of(mail, c) or mail.get("id")),       # Battle Streak: alle Teil-Berichte haengen am Hauptbericht
           "cno": int(mail.get("childNo") or 0),                      # Teil-Nr. in der Streak (1, 2, 3 …)
           "h": [me.get("HId") or 0, me.get("HId2") or 0]}                      # eigene Kommandanten (= welcher Marsch)
    for a in (c.get("Attacks") or {}).values():
        if not isinstance(a, dict):
            continue
        en = a.get("CIdt") or {}
        own, opp = a.get("Damage") or {}, a.get("Kill") or {}
        pvp = isinstance(en.get("PId"), int) and en.get("PId") > 0 and bool(en.get("PName"))
        out["fights"].append([1 if pvp else 0, _n(own, "KillScore"), _n(opp, "KillScore"), _n(own, "Death"), _n(own, "BadHurt"),
                              _n(own, "Hurt"), _n(opp, "Death"), _n(opp, "BadHurt"), _n(own, "Power"), _n(opp, "Power"),
                              (en.get("PName") or "") if pvp else "",
                              en.get("PId") if pvp else 0, en.get("HId") or 0, en.get("HId2") or 0,   # Gegner + seine 2 Kommandanten = ein Marsch
                              en.get("NpcBType") if isinstance(en.get("NpcBType"), int) else 0,          # NPC-Art (1 = Barbar, 41 = Fort ...)
                              en.get("HLv") if (not pvp and isinstance(en.get("HLv"), int)) else 0,       # NPC-Level
                              1 if a.get("NpcKillLoot") else 0,                                          # Beute bekommen = besiegt
                              _n(own, "Cnt"), _n(opp, "Cnt"),                                            # Resttruppen (Sieg/Niederlage)
                              _n(own, "Contribute") or _n(own, "WarExploits")])                          # Acclaim (Verdienst), wie im Uploader
        out["init"] = max(out.get("init", 0), _n(own, "InitMax"))
    sov = c.get("SOv") if isinstance(c.get("SOv"), dict) else {}
    oov = c.get("OOv") if isinstance(c.get("OOv"), dict) else {}
    out["init"] = max(out.get("init", 0), _n(sov, "InitMax"), _n(sov, "Max"))       # Truppen beim Start (50 % Expansion -> 400K+)
    if sov and ("Cnt" in sov or "Remain" in sov):
        out["rem"] = _n(sov, "Cnt") or _n(sov, "Remain")                              # "Remaining" aus Data Summary
    if sov and out["fights"]:
        # Die Runden (19-1, 18-1 …) sind im Spiel oft nur die letzten paar. Die HAUPTZAHL steht in "Data Summary".
        # -> Unterschied als eine Ausgleichs-Zeile anhaengen, damit alle Summen genau die Hauptzahl ergeben.
        fs = out["fights"]
        tot = lambda i: sum(f[i] for f in fs)
        want = {1: _n(sov, "KillScore"), 2: _n(oov, "KillScore"), 3: _n(sov, "Death") or _n(sov, "Dead"), 4: _n(sov, "BadHurt"),
                5: _n(sov, "Hurt"), 6: _n(oov, "Death") or _n(oov, "Dead"), 7: _n(oov, "BadHurt"),
                19: _n(sov, "Contribute") or _n(sov, "WarExploits")}
        fix = [1 if any(f[0] for f in fs) else 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, "", 0, 0, 0, 0, 0, 0, 0, 0, 0]
        changed = False
        for i, v in want.items():
            if v and v > tot(i):
                fix[i] = v - tot(i); changed = True
        if changed:
            fix.append("sum")                            # Markierung: keine eigene Runde, nur Ausgleich zur Hauptzahl
            fs.append(fix)
        out["sum_kp"] = want[1] or tot(1)
    return out


def dedupe_streaks(battles):
    """Battle Streak: Hat der Hauptbericht schon die Summe aller Teil-Berichte, die Teil-Berichte nicht nochmal zaehlen."""
    by_par = {}
    for b in battles:
        p = b.get("par")
        if p and p != b["id"]:
            by_par.setdefault(p, []).append(b)
    if not by_par:
        return list(battles)
    skip = set()
    ids = {b["id"]: b for b in battles}
    for p, kids in by_par.items():
        par = ids.get(p)
        if not par:
            continue
        pk = sum(f[1] for f in par["fights"])
        ck = sum(f[1] for k in kids for f in k["fights"])
        if pk and pk >= ck * 0.95:                       # Hauptbericht enthaelt die Teil-Berichte schon
            skip.update(k["id"] for k in kids)
    return [b for b in battles if b["id"] not in skip]


def owner_of(mail):
    rc = str((mail or {}).get("receiver") or "")
    if rc.startswith("player_") and rc[7:].isdigit():
        return int(rc[7:])
    return None


# ---------------------------------------------------------------- Toene (werden beim Start erzeugt, keine Dateien noetig)
import math, wave, io as _io
SOUNDS = ["alarm", "sirene", "doppel", "glocke", "ding", "tief", "aus"]
_SND = {}


def _tone(parts, vol=0.8, rate=22050):
    """parts: [(freq_start, freq_end, sekunden), ...]  freq 0 = Pause"""
    frames = bytearray()
    for f1, f2, dur in parts:
        n = int(rate * dur)
        ph = 0.0
        for i in range(n):
            f = f1 + (f2 - f1) * i / max(1, n)
            env = min(1.0, i / (rate * 0.01), (n - i) / (rate * 0.02))       # weich ein/aus
            v = 0 if f <= 0 else math.sin(ph) * env * vol
            ph += 2 * math.pi * f / rate
            frames += struct.pack("<h", int(v * 30000))
    b = _io.BytesIO()
    with wave.open(b, "wb") as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(rate); w.writeframes(bytes(frames))
    return b.getvalue()


def sound_bytes(name, vol=0.8):
    k = (name, round(vol, 2))
    if k not in _SND:
        P = {"alarm": [(880, 880, .14), (0, 0, .05), (660, 660, .14), (0, 0, .05)] * 3,
             "sirene": [(500, 1100, .35), (1100, 500, .35)] * 2,
             "doppel": [(1046, 1046, .12), (0, 0, .07), (1046, 1046, .12)],
             "glocke": [(1318, 1318, .5)],
             "ding": [(1568, 1568, .18)],
             "tief": [(330, 330, .25), (0, 0, .08), (262, 262, .3)]}.get(name)
        if not P:
            return None
        _SND[k] = _tone(P, vol)
    return _SND[k]


def play_sound(name, vol=80):
    """Spielt einen Ton im Hintergrund (blockiert nichts)."""
    if not name or name == "aus":
        return
    def run():
        try:
            data = sound_bytes(name, max(0.05, min(1.0, vol / 100.0)))
            if data and IS_WIN:
                import winsound
                winsound.PlaySound(data, winsound.SND_MEMORY)
        except Exception as e:
            log("sound: %s" % e)
    threading.Thread(target=run, daemon=True).start()


# ---------------------------------------------------------------- Marker-Mails (Koalitions-/Allianz-Marker)
import re
import re as _re
from collections import deque

_TXT_KEYS = ("desc", "content", "comment", "text", "msg", "remark", "note", "info", "word", "sign")


def _walk(o, key=""):
    if isinstance(o, dict):
        for k, v in o.items():
            yield k, v
            yield from _walk(v, k)
    elif isinstance(o, list):
        for v in o:
            yield from _walk(v, key)


def _pos(o):
    """Erste Koordinate (X/Y) irgendwo in der Mail."""
    for _k, v in _walk(o):
        if isinstance(v, dict):
            low = {str(k).lower(): x for k, x in v.items()}
            x, y = low.get("x", low.get("posx")), low.get("y", low.get("posy"))
            if isinstance(x, (int, float)) and isinstance(y, (int, float)) and (x or y):
                return round(float(x)), round(float(y))
    return None


_FANCY = str.maketrans({"ı": "i", "ʀ": "r", "ø": "o", "ɪ": "i", "ʟ": "l", "ᴍ": "m", "ɴ": "n", "ᴀ": "a", "ʙ": "b", "ᴄ": "c", "ᴅ": "d",
                        "ᴇ": "e", "ꜰ": "f", "ɢ": "g", "ʜ": "h", "ᴊ": "j", "ᴋ": "k", "ᴏ": "o", "ᴘ": "p", "ꞯ": "q", "ꜱ": "s", "ᴛ": "t",
                        "ᴜ": "u", "ᴠ": "v", "ᴡ": "w", "ʏ": "y", "ᴢ": "z", "ł": "l", "đ": "d", "ß": "ss", "æ": "ae", "œ": "oe", "ð": "d", "þ": "th"})


def norm_name(t):
    """'Mıʀøx' -> 'mirox': Fantasie-Schriften, Akzente, Zeichen weg – damit Namen in Markern sicher erkannt werden."""
    import unicodedata
    t = unicodedata.normalize("NFKD", str(t or "").lower().translate(_FANCY))
    t = "".join(ch for ch in t if not unicodedata.combining(ch))
    return re.sub(r"[^a-z0-9]", "", t)


def _marker_num(body):
    """Marker-Nummer aus der Mail (Feldname mit index/num/seq …, Wert 1–50)."""
    for k, v in _walk(body):
        kl = str(k).lower()
        if isinstance(v, (int, float)) and float(v).is_integer() and 1 <= v <= 50 and \
                any(t in kl for t in ("index", "idx", "num", "seq", "slot", "order", "markid", "signid", "markno", "no")):
            return int(v)
    return None


def marker_of(mail):
    """Marker aus einer Mail lesen (oder None). Erkennung bewusst grosszuegig – genaue Felder siehe Beispiel-Export."""
    if not isinstance(mail, dict) or mail.get("type") == "Battle":
        return None
    body = mail.get("body") or {}
    blob = json.dumps(body, ensure_ascii=False)
    if not _re.search(r"mark|sign|flag|标记|Markierung", blob, _re.I):
        return None
    p = _pos(body)
    if not p:
        return None
    title = str(body.get("title") or body.get("subTitle") or body.get("type") or "")
    author, comment = "", ""
    for k, v in _walk(body):
        kl = str(k).lower()
        if not isinstance(v, str) or not v.strip():
            continue
        if not author and ("name" in kl) and "alliance" not in kl and "aname" != kl:
            author = v.strip()
        if any(t in kl for t in _TXT_KEYS) and len(v.strip()) > len(comment) and v.strip() != title:
            comment = v.strip()
    si = mail.get("senderInfo") or {}
    author = author or si.get("Name") or ""
    t = mail.get("time") or 0
    if isinstance(t, (int, float)) and t > 1e14:
        t = t / 1e6
    x, y = p
    if x > 1300 or y > 1300:              # Weltkoordinaten (x6) -> Spielkoordinaten
        x, y = int(x / 6), int(y / 6)
    return {"id": str(mail.get("id")), "t": int(t or 0), "x": x, "y": y, "by": author[:40], "text": comment[:200], "num": _marker_num(body),
            "title": title[:80], "srv": mail.get("serverId")}


RUNE_COL = "#38bdf8"


def rune_idx(rules):
    """Index der Runen-Art (Name beginnt mit „Rune“), sonst -1."""
    return next((i for i, r in enumerate(rules or []) if str(r.get("name", "")).strip().lower().startswith("rune")), -1)


def marker_rule(mk, rules):
    """Index der ersten passenden Regel (0 = Ball) oder -1."""
    txt = ("%s %s" % (mk.get("text", ""), mk.get("title", ""))).lower()
    for i, r in enumerate(rules or []):
        if any(w.strip() and w.strip().lower() in txt for w in str(r.get("words", "")).split(",")):
            return i
    return -1


_MSG_RE = re.compile(rb"Hospital|Treatment|Lost Kingdom|[Ss]couted|[Ss]couting")


def _mail_text(b):
    parts = []
    for k in ("title", "subTitle", "content", "text", "desc"):
        v = b.get(k)
        if isinstance(v, (dict, list)):
            v = json.dumps(v, ensure_ascii=False)
        if v:
            parts.append(str(v))
    return " · ".join(parts)


def msg_event(mail, own, t):
    """System-Nachrichten: gespaeht, Lost-Kingdom-Rang (A+/S/S+), Lazarett 70 % / 85 % / Truppen gestorben."""
    if mail.get("type") == "Battle":
        return None
    b = mail.get("body") or {}
    txt = _mail_text(b)
    lo = txt.lower()
    ev = lambda kind, text, **kw: dict({"id": str(mail.get("id")), "ev": "msg", "kind": kind, "t": t, "pid": own, "text": text[:160]}, **kw)
    if "lack of treatment" in lo or ("hospital" in lo and "died" in lo):
        m = re.search(r"(\d{3,})\D{0,40}units? died|while\D{0,10}(\d{3,})", txt)
        n = int(next(g for g in m.groups() if g)) if m else 0
        return ev("hospdead", txt, n=n)
    if "hospital" in lo and ("capacity" in lo or "almost full" in lo):
        m = re.search(r"(\d{2,3})\s*%", txt)
        pct = int(m.group(1)) if m else 0
        return ev("hosp85" if pct >= 85 else "hosp70", txt, pct=pct)
    if "lost kingdom" in lo and ("rank" in lo or "tier" in lo):
        m = re.search(r"reached\s+([A-S][+]?)\s*tier", txt, re.I)
        return ev("rank", txt, tier=(m.group(1).upper() if m else ""))
    if re.search(r"scouted by|been scouted|were scouted|was scouted|is scouting you|scouting you", lo):
        return ev("scout", txt)
    return None


def event_of(mail, own):
    """Buff abgelaufen / Gebaeude erobert oder verloren – gleiche Regeln wie im Uploader."""
    if not isinstance(mail, dict):
        return None
    b = mail.get("body") or {}
    t = mail.get("time") or 0
    if isinstance(t, (int, float)) and t > 1e14:
        t = t / 1e6
    t = int(t or 0)
    me = msg_event(mail, own, t)
    if me:
        return me
    if mail.get("type") == "System" and (b.get("title") == "Buff Ended" or str(b.get("subType")) in ("340", "340.0")):
        sub = str(b.get("subTitle") or b.get("content") or "")
        for key, kind in (("peace shield", "shield"), ("army expansion", "army"), ("attack", "attack"), ("defen", "def")):
            if key in sub.lower():
                return {"id": str(mail.get("id")), "ev": "buff", "kind": kind, "t": t, "pid": own, "text": sub[:120]}
        return None
    kv = b.get("kvs") if isinstance(b.get("kvs"), dict) else {}
    pos = kv.get("stronghold_pos") if isinstance(kv.get("stronghold_pos"), dict) else None
    if mail.get("type") == "Alliance" and pos:
        title, sub = str(b.get("title") or ""), str(b.get("subTitle") or "")
        lost = title.lower().startswith("fall of")
        name = title[8:] if lost else (title[:-9] if title.endswith(" Occupied") else title)
        ours = "our coalition" in sub.lower() or "our alliance" in sub.lower()
        return {"id": str(mail.get("id")), "ev": "bld", "t": t, "pid": own, "name": name[:60], "ours": ours, "lost": lost,
                "ally": kv.get("legion_abbr") or "", "x": int(float(pos.get("X") or 0) / 6), "y": int(float(pos.get("Y") or 0) / 6),
                "text": (title + " · " + sub)[:140]}
    return None


def is_ball(mk, words):
    txt = ("%s %s" % (mk.get("text", ""), mk.get("title", ""))).lower()
    return any(w and w in txt for w in words)


# ---------------------------------------------------------------- Ein-Klick-Verbindung von der Website (wizfanclub://pair?c=CODE&s=ADRESSE)
import socket
from urllib.parse import urlparse, parse_qs

PROTO = "wizfanclub"
IPC_PORT = 47851                     # nur lokal (127.0.0.1): uebergibt Links an die schon laufende App
# Nur diese Websites duerfen die App verbinden (Schutz vor gefaelschten Links)
SITE_OK = re.compile(r"^https://((rok-scanner|wiz-fanclub)[a-z0-9-]*\.vercel\.app|([a-z0-9-]+\.)*wiz-?fanclub\.[a-z]+)$", re.I)


def register_protocol():
    """Meldet wizfanclub:// bei Windows an (nur fuer den eigenen Benutzer, keine Admin-Rechte)."""
    if not IS_WIN:
        return
    try:
        import winreg
        if FROZEN:
            cmd = '"%s" "%%1"' % sys.executable
        else:
            cmd = '"%s" "%s" "%%1"' % (sys.executable.replace("python.exe", "pythonw.exe"), os.path.abspath(__file__))
        base = r"Software\Classes\%s" % PROTO
        with winreg.CreateKey(winreg.HKEY_CURRENT_USER, base) as k:
            winreg.SetValueEx(k, "", 0, winreg.REG_SZ, "URL:Wiz fan Club App")
            winreg.SetValueEx(k, "URL Protocol", 0, winreg.REG_SZ, "")
        with winreg.CreateKey(winreg.HKEY_CURRENT_USER, base + r"\DefaultIcon") as k:
            winreg.SetValueEx(k, "", 0, winreg.REG_SZ, sys.executable if FROZEN else "")
        with winreg.CreateKey(winreg.HKEY_CURRENT_USER, base + r"\shell\open\command") as k:
            winreg.SetValueEx(k, "", 0, winreg.REG_SZ, cmd)
    except Exception as e:
        log("Protokoll: %s" % e)


def parse_link(url):
    """wizfanclub://pair?c=ABC123&s=https://... -> (code, site) oder None."""
    try:
        u = urlparse(str(url).strip())
        if u.scheme.lower() != PROTO:
            return None
        q = parse_qs(u.query)
        code = re.sub(r"[^A-Z0-9]", "", (q.get("c") or [""])[0].upper())
        site = (q.get("s") or [""])[0].strip().rstrip("/")
        if len(code) != 6 or not SITE_OK.match(site):
            return None
        return code, site
    except Exception:
        return None


def hand_over(arg):
    """Laeuft die App schon? Dann Link uebergeben und True zurueck (diese zweite Kopie beendet sich)."""
    try:
        with socket.create_connection(("127.0.0.1", IPC_PORT), timeout=1.5) as c:
            c.sendall(("ver:%s|%s" % (APP_VERSION, arg or "show")).encode("utf-8")[:2000])
            try:
                c.settimeout(2)
                reply = c.recv(100)
            except OSError:
                reply = b""
    except OSError:
        return False
    if reply == b"quit":                 # alte Version laeuft noch -> sie beendet sich, diese neue startet
        for _ in range(40):
            time.sleep(0.25)
            try:
                socket.create_connection(("127.0.0.1", IPC_PORT), timeout=0.3).close()
            except OSError:
                return False
        return False
    return True


class Scanner:
    """Liest neue/geaenderte Mails im Hintergrund, merkt sich Zusammenfassungen in app_cache.json."""

    def __init__(self, app):
        self.app = app
        self.lock = threading.Lock()
        self.seen = {}        # datei -> signatur
        self.battles = {}     # mail_id -> summary
        self.markers = {}     # schluessel -> marker
        self.samples = deque(maxlen=12)   # Pfade der letzten Nicht-Kampf-Mails (fuer Beispiel-Export)
        self.new_markers = []             # waehrend die App laeuft neu dazugekommen
        self.deleted = set()              # vom Nutzer geloeschte Marker (kommen nicht wieder)
        self.dirty, self.saved_at = False, 0.0
        self.active = (None, 0)           # (Governor-ID, Zeit) des gerade gespielten Accounts
        self.events = {}                  # Buff abgelaufen / Gebaeude (letzte 24 h)
        self.new_events = []
        self.ver = 0                 # steigt bei jedem neuen/aktualisierten Kampfbericht -> App rechnet neu
        self._bl = (None, [])
        self.parsed_at = {}          # Datei -> wann zuletzt entschluesselt
        self.calc_every = 5          # laufende Berichte hoechstens alle X s neu lesen (grosser Kampf = viele Aenderungen)
        self.owners = {}      # pid -> {"name", "mails", "last"}
        self.uploaded = set()
        self.status = ""
        self.last_new = None
        self._load()

    def _load(self):
        try:
            with open(CACHE_FILE, encoding="utf-8") as f:
                d = json.load(f)
            if d.get("v") == CACHE_VER:
                self.seen, self.battles = d.get("seen", {}), d.get("battles", {})
                self.markers = d.get("markers", {})
                self.deleted = set(d.get("deleted", []))
                self.events = d.get("events", {})
                a = d.get("active") or [None, 0]
                self.active = (a[0], a[1])
                for k, m in self.markers.items():
                    m["key"] = k
                self.owners = {int(k): v for k, v in d.get("owners", {}).items()}
                self.uploaded = set(d.get("uploaded", []))
                for b in self.battles.values():          # v0.29: Hauptbericht (parentId) fehlt -> diese Datei neu lesen
                    if "par" not in b and b.get("file") and b.get("dir"):
                        self.seen.pop(b["dir"] + "|" + os.path.basename(b["file"]), None)
        except Exception:
            pass

    def add_event(self, ev):
        """Buff-/Gebaeude-Meldung merken (gleiche Mail auf mehreren Accounts nur einmal bei Gebaeuden)."""
        if time.time() - ev["t"] > 86400:
            return
        if ev["ev"] == "buff":
            key = "b|%s|%s|%d" % (ev["pid"], ev["kind"], ev["t"] // 60)
        elif ev["ev"] == "msg":
            key = "m|%s|%s|%d" % (ev["pid"], ev["kind"], ev["t"] // 60)
        else:
            key = "g|%s|%d" % (ev["name"], ev["t"] // 60)
        with self.lock:
            if key in self.events:
                return
            ev["key"] = key
            self.events[key] = ev
            if len(self.events) > 60:
                for k in sorted(self.events, key=lambda k: self.events[k]["t"])[:len(self.events) - 60]:
                    del self.events[k]
            if self.app.started and ev["t"] >= self.app.started - 300:
                self.new_events.append(ev)

    def battle_list(self):
        """Alle Berichte, Battle-Streak-Teile bereinigt (zwischengespeichert, bis sich etwas aendert)."""
        with self.lock:
            if self._bl[0] == self.ver and self._bl[1]:
                return self._bl[1]
            bs = list(self.battles.values())
            v = self.ver
        res = dedupe_streaks(bs)
        self._bl = (v, res)
        return res

    def ttl(self, mk):
        """Ball-Marker 1 Stunde, alle anderen 30 Minuten."""
        return MARKER_TTL if marker_rule(mk, self.app.cfg["markers"].get("rules", [])) == 0 else MARKER_TTL_OTHER

    def add_marker(self, mk):
        if time.time() - mk["t"] > self.ttl(mk):      # zu alt: gar nicht erst aufnehmen
            return
        if mk.get("num"):                              # Marker Nr. 2 neu gesetzt -> ersetzt den alten Nr. 2 (Zeit faengt neu an)
            mkey = "num%d" % mk["num"]
            with self.lock:
                old = self.markers.get(mkey)
            if old and (old["x"], old["y"], old.get("text")) != (mk["x"], mk["y"], mk.get("text")) and mk["t"] >= old["t"]:
                with self.lock:
                    self.markers.pop(mkey, None)
        else:
            mkey = "%d_%d_%s" % (mk["x"], mk["y"], mk["text"][:30])   # gleicher Marker bei Main + Filler nur einmal
        with self.lock:
            if mkey in self.deleted:
                return
            old = self.markers.get(mkey)
            if old and mk["t"] <= old["t"] + 600:                  # schon bekannt
                return
            mk["key"] = mkey
            self.markers[mkey] = mk
            self.dirty = True
            if self.app.started and mk["t"] >= self.app.started - 300:
                self.new_markers.append(mk)
        self.prune_markers()

    def prune_markers(self):
        """Nur die neuesten Ball-Marker (Standard 5) und 60 normale behalten – aeltere loeschen sich selbst."""
        keep_b = max(1, int(self.app.cfg["markers"].get("keep_ball", 5)))
        words = self.app.ball_words()
        now = time.time()
        with self.lock:
            for k in [k for k, m in self.markers.items() if now - m["t"] > self.ttl(m)]:   # Ball 1 h, andere 30 min
                del self.markers[k]
            items = sorted(self.markers.items(), key=lambda kv: -kv[1]["t"])
            nb = nn = 0
            for k, m in items:
                if is_ball(m, words):
                    nb += 1
                    if nb > keep_b:
                        del self.markers[k]
                else:
                    nn += 1
                    if nn > 60:
                        del self.markers[k]

    def delete_marker(self, key):
        with self.lock:
            self.markers.pop(key, None)
            self.deleted.add(key)
            self.dirty = True

    def save(self):
        self.saved_at = time.time(); self.dirty = False
        with self.lock:
            d = {"v": CACHE_VER, "seen": self.seen, "battles": self.battles, "markers": self.markers, "events": self.events, "active": list(self.active), "deleted": sorted(self.deleted)[-500:], "owners": self.owners, "uploaded": sorted(self.uploaded)}
        try:
            tmp = CACHE_FILE + ".tmp"
            with open(tmp, "w", encoding="utf-8") as f:
                json.dump(d, f, separators=(",", ":"))
            os.replace(tmp, CACHE_FILE)
        except OSError as e:
            log("cache: %s" % e)

    def scan_once(self):
        T = self.app.t
        folders = [g for g in self.app.cfg["game_folders"] if os.path.isdir(os.path.join(g, "save", "mailcache"))]
        if not folders:
            self.status = T("status_nofolder"); return 0
        new = 0
        for g in folders:
            mdir = os.path.join(g, "save", "mailcache")
            try:
                entries = [e for e in os.scandir(mdir) if e.name.startswith("Persistent.Mail.")]
            except OSError:
                continue
            todo = []
            for e in entries:
                try:
                    st = e.stat()
                except OSError:
                    continue
                key = g + "|" + e.name
                sig = "%d_%d" % (st.st_size, int(st.st_mtime))
                if self.seen.get(key) != sig:
                    todo.append((key, sig, e.path, st.st_mtime))
            for i, (key, sig, path, mt) in enumerate(todo):
                if len(todo) > 50 and i % 20 == 0:
                    time.sleep(0.004)            # beim grossen Einlesen Luft lassen -> Fenster und Spiel ruckeln nicht
                if i % 200 == 0 and len(todo) > 200:
                    self.status = T("status_scan", n="%d/%d" % (i, len(todo)))
                m = s = mk = None
                try:
                    with open(path, "rb") as f:
                        raw = f.read()
                    if os.path.getsize(path) != len(raw):      # Spiel schreibt gerade noch -> beim naechsten Durchgang
                        continue
                except OSError:
                    raw = b""
                is_battle = b"Battle" in raw
                if is_battle and key in self.seen and time.time() - self.parsed_at.get(key, 0) < self.calc_every:
                    continue                            # laeuft noch -> spaeter in einem Rutsch neu lesen (weniger Last im grossen Kampf)
                if is_battle:
                    self.parsed_at[key] = time.time()
                    if len(self.parsed_at) > 4000:
                        self.parsed_at.clear()
                is_mark = not is_battle and _MARK_RE.search(raw) is not None
                is_ev = not is_battle and (b"Buff" in raw or b"stronghold_pos" in raw or _MSG_RE.search(raw) is not None)
                if is_ev and not is_mark:
                    try:
                        m = read_mail_bytes(raw)
                    except Exception:
                        m = None
                if is_battle or is_mark:            # nur diese Mails komplett entschluesseln (spart ~90 % Rechenzeit)
                    try:
                        m = read_mail_bytes(raw)
                    except Exception:
                        m = None
                    s = summarize(m) if is_battle else None
                    mk = None if s else marker_of(m)
                if is_mark or (b"Alliance" in raw and not is_battle):
                    self.samples.append(path)
                own = owner_of(m) if m else None
                if own is None:
                    om = _OWNER_RE.search(raw[:4000])
                    own = int(om.group(1)) if om else None
                if mk:
                    self.add_marker(mk)
                elif is_ev and m:
                    ev = event_of(m, own if own is not None else owner_of(m))
                    if ev:
                        self.add_event(ev)
                if own and mt >= self.active[1]:            # neueste Mail -> dieser Account ist gerade eingeloggt
                    alli = is_mark or b"Alliance" in raw
                    if own == self.active[0] or not self.active[0] or (s is not None) or (not alli and mt > self.active[1] + 60):
                        self.active = (own, mt)                # Wechsel nur bei Kampfbericht oder deutlich neuerer eigener Mail
                with self.lock:
                    self.seen[key] = sig
                    if own:
                        o = self.owners.setdefault(own, {"name": "", "mails": 0, "last": 0})
                        o["mails"] += 1
                        if s and s["pid"] == own and s.get("name"):
                            o["name"] = s["name"]
                        if s:
                            o["last"] = max(o["last"], s["t"])
                    if s:
                        s["dir"] = g
                        s["file"] = path
                        s["mt"] = int(mt)
                        old = self.battles.get(s["id"])
                        if old is None:
                            new += 1
                            self.ver += 1
                            self.battles[s["id"]] = s
                        elif len(s["fights"]) >= len(old["fights"]):   # gleicher Bericht, nur weitergeschrieben -> aktualisieren
                            if s["fights"] != old["fights"]:
                                self.changed_at = time.time()
                                self.ver += 1
                            self.battles[s["id"]] = s
                        # weniger Kaempfe als vorher = halb gelesen -> alten Stand behalten (kein Sprung auf 0)
                if i and i % 3000 == 0:          # beim ersten grossen Einlesen zwischendurch sichern
                    self.save()
        if new:
            self.last_new = time.time()
        with self.lock:
            nb = len(self.battles)
        self.status = T("status_ok", b=nb, t=time.strftime("%H:%M:%S"))
        return new

    def loop(self):
        if IS_WIN:                                # Hintergrund-Thread mit niedriger Prioritaet (Spiel hat Vorrang)
            try:
                import ctypes
                ctypes.windll.kernel32.SetThreadPriority(ctypes.windll.kernel32.GetCurrentThread(), -2)
            except Exception:
                pass
        while True:
            gap = time.time() - getattr(self, "_last_scan", 0)
            if gap < 1.5:                            # hoechstens alle 1,5 s den Ordner durchgehen (Spiel schreibt oft mehrmals hintereinander)
                time.sleep(1.5 - gap)
            self._last_scan = time.time()
            try:
                n = self.scan_once()
                if (n or self.dirty) and time.time() - self.saved_at > 120:    # hoechstens alle 2 Min auf die Platte (Rest beim Beenden)
                    self.save()
                if self.app.cfg.get("upload") and self.app.cfg.get("token"):
                    self.upload_new()
            except Exception:
                log("scan:\n" + traceback.format_exc())
            self.wait_change(5)

    # ---------- sofort reagieren, sobald das Spiel eine neue Mail speichert ----------
    def wait_change(self, timeout):
        """Wartet, bis Windows meldet, dass sich im mailcache etwas getan hat (max. timeout Sekunden).
        So kommen neue Marker und Kaempfe sofort – statt nur alle paar Sekunden nachzuschauen."""
        if not IS_WIN:
            time.sleep(2); return
        try:
            import ctypes
            from ctypes import wintypes
            k = ctypes.windll.kernel32
            k.FindFirstChangeNotificationW.restype = wintypes.HANDLE
            dirs = tuple(os.path.join(g, "save", "mailcache") for g in self.app.cfg["game_folders"]
                         if os.path.isdir(os.path.join(g, "save", "mailcache")))
            if dirs != getattr(self, "_w_dirs", None):            # Ordner geaendert -> Beobachter neu anlegen
                for h in getattr(self, "_w_handles", []):
                    k.FindCloseChangeNotification(h)
                self._w_handles = []
                for d in dirs:
                    h = k.FindFirstChangeNotificationW(d, False, 0x1 | 0x10)   # neue Datei / Datei geschrieben
                    if h and h != wintypes.HANDLE(-1).value:
                        self._w_handles.append(h)
                self._w_dirs = dirs
            hs = self._w_handles
            if not hs:
                time.sleep(timeout); return
            arr = (wintypes.HANDLE * len(hs))(*hs)
            r = k.WaitForMultipleObjects(len(hs), arr, False, int(timeout * 1000))
            if 0 <= r < len(hs):
                k.FindNextChangeNotification(hs[r])
                time.sleep(0.25)          # kurz warten, bis das Spiel die Datei fertig geschrieben hat
        except Exception as e:
            log("watch: %s" % e)
            time.sleep(timeout)

    # ---------- Hochladen ueber die Website-API (fuer Freunde) ----------
    def upload_new(self):
        if UP is None:
            return
        ids = {str(x["governor_id"]) for x in self.app.cfg.get("links", []) if x.get("status", "ok") == "ok"}
        if not ids:
            return
        cutoff = time.time() - 86400 * max(1, int(self.app.cfg.get("upload_days") or 14))
        with self.lock:
            todo = [b for b in self.battles.values() if str(b["pid"]) in ids and b["id"] not in self.uploaded
                    and not b.get("arch") and b["t"] >= cutoff]                     # PvP und PvE (Barbaren, Forts …)
        if not todo:
            return
        heroes = {}
        rows, done = [], []
        for b in todo[:300]:
            try:
                if b["dir"] not in heroes:
                    try:
                        heroes[b["dir"]] = UP.load_hero_names(b["dir"], "en")
                    except Exception:
                        heroes[b["dir"]] = {}
                m = read_mail(b["file"])
                r = UP.battle_rows(m, "App", heroes[b["dir"]])
                rows.extend(x for x in r if str(x.get("player_id")) in ids)
                done.append(b["id"])
            except Exception as e:
                log("upload lesen %s: %s" % (b["id"], e)); done.append(b["id"])
        for i in range(0, len(rows), 200):
            self.app.api("upload", {"rows": rows[i:i + 200]})
        with self.lock:
            self.uploaded.update(done)
        self.save()
        log("hochgeladen: %d Zeilen aus %d Berichten" % (len(rows), len(done)))
        self.app.flash(self.app.t("uploaded", n=len(rows)))
        self.app._last_upload = (time.time(), len(rows))
        self.app._web_due = 0                       # Overlay gleich mit den neuen Website-Zahlen auffrischen


# ---------------------------------------------------------------- Werte berechnen
def fmt_num(v, lang):
    v = float(v or 0)
    a = abs(v)
    if a >= 1e9:
        s, u = v / 1e9, (" Mrd." if lang == "de" else "B")
    elif a >= 1e6:
        s, u = v / 1e6, (" Mio." if lang == "de" else "M")
    elif a >= 1e4:
        s, u = v / 1e3, ("K")
    else:
        s = int(round(v)); return ("{:,}".format(s)).replace(",", "." if lang == "de" else ",")
    txt = ("%.2f" % s) if abs(s) < 100 else ("%.1f" % s)
    if lang == "de":
        txt = txt.replace(".", ",")
    return txt + u


def ratio(a, b, lang):
    if not b:
        return "–" if not a else "∞"
    r = ("%.2f" % (a / b))
    return (r.replace(".", ",") if lang == "de" else r) + ":1"


def compute(battles, ids, rng, since_ts, pvp_only, lang):
    tot = dict(kp=0, ekp=0, dead=0, sev=0, wnd=0, edead=0, esev=0, pw=0, epw=0, pvp=0, pve=0, kp_all=0)
    t_first = t_last = None
    last_kp, last_enemy, last_t, last_b = None, "", 0, None
    for b in battles:
        if ids is not None and b["pid"] not in ids:
            continue
        if b.get("arch"):
            continue
        in_r = b["t"] >= since_ts
        for f in b["fights"]:
            pvp, kp, ekp, dead, sev, wnd, edead, esev, pw, epw, en = f[:11]
            if pvp:
                tot["kp_all"] += kp
            if not in_r:
                continue
            if len(f) > 20 and f[20] == "sum":
                pass                                     # Ausgleich zur Hauptzahl: zaehlt in den Summen, ist aber kein eigener Kampf
            elif pvp:
                tot["pvp"] += 1
            else:
                tot["pve"] += 1
            if pvp_only and not pvp:
                continue
            tot["kp"] += kp; tot["ekp"] += ekp; tot["dead"] += dead; tot["sev"] += sev; tot["wnd"] += wnd
            tot["edead"] += edead; tot["esev"] += esev; tot["pw"] += pw; tot["epw"] += epw
        if in_r:
            t_first = b["t"] if t_first is None else min(t_first, b["t"])
            t_last = b["t"] if t_last is None else max(t_last, b["t"])
    # "Letzter Kampf" = der ganze Bericht wie im Spiel (alle Teile der Battle Streak zusammen), nie nur der letzte Teil
    for g in reports(battles, ids, True):
        if (g["t0"], g["t"]) > (last_t, 0) or last_b is None:
            last_t, last_b = g["t0"], g
    if last_b is not None:
        last_kp = sum(f[1] for f in last_b["fights"] if f[0])
        last_enemy = next((f[10] for f in last_b["fights"] if f[0] and f[10]), "")
    out = fmt_totals(tot, t_first, t_last, last_kp, last_enemy, lang)
    out.update(enemy_marches(battles, ids, last_b, lang))
    out.update(npc_counts(battles, ids, since_ts, lang))
    acc = sum(f[19] for b in battles if b["t"] >= since_ts and not b.get("arch") and (ids is None or b["pid"] in ids)
              for f in b["fights"] if len(f) > 19)
    out["m_acclaim"] = fmt_num(acc, lang)
    return out


def npc_counts(battles, ids, since_ts, lang):
    """Barbaren & Forts im Zeitraum: besiegt = der Bericht enthaelt Beute (wie auf der Website unter Loot)."""
    barb = fort = hits = 0
    mx = 0
    for b in battles:
        if b["t"] < since_ts or b.get("arch") or (ids is not None and b["pid"] not in ids):
            continue
        for f in b["fights"]:
            if len(f) < 17 or f[0]:
                continue
            bt, lv, won = f[14], f[15], f[16]
            if bt == 1:
                hits += 1
                if won:
                    barb += 1
                    mx = max(mx, lv or 0)
            elif bt == 41 and won:
                fort += 1
    F = lambda v: fmt_num(v, lang)
    return {"m_barb": F(barb), "m_barb_hits": F(hits), "m_barb_lvl": str(mx) if mx else "–", "m_forts": F(fort)}


def battle_card(b):
    """Ein Kampf als Kurzinfo (Feed / Pop-up): Sieg?, KP, Trade %, Kommandanten, Gegner."""
    fs = [f for f in b["fights"] if len(f) > 18]
    if not fs:
        return None
    pvp = any(f[0] for f in fs)
    kp = sum(f[1] for f in fs)
    own_l = sum(f[3] + f[4] for f in fs); en_l = sum(f[6] + f[7] for f in fs)
    own_rem = b["rem"] if "rem" in b else sum(f[17] for f in fs)
    en_rem = sum(f[18] for f in fs)
    if own_rem <= 0:
        win = False
    elif en_rem <= 0:
        win = True
    else:
        win = en_l >= own_l
    enemy = next((f[10] for f in fs if f[10]), "") or ("NPC" if not pvp else "")
    lvl = next((f[15] for f in fs if f[15]), 0)
    return {"t": b["t"], "win": win, "kp": kp, "trade": (en_l / own_l) if own_l else (None if not en_l else float("inf")),
            "h": list(b.get("h") or [0, 0]), "enemy": enemy, "pvp": pvp, "lvl": lvl, "id": b["id"], "n": sum(1 for f in fs if not (len(f) > 20 and f[20] == "sum")),
            "parts": (b.get("nrep", 1), b.get("cmax", 0)), "dead_march": own_rem <= 0, "ol": own_l, "el": en_l, "acc": sum(f[19] for f in fs if len(f) > 19), "kills": sum(f[6] + f[7] for f in fs)}


STREAK_GAP = {"v": 90}     # s: Berichte desselben Marsches dichter als das = eine Battle Streak (nur wenn die Mail keine Hauptbericht-ID hat)


def streak_ids(battles):
    """Fuer Berichte OHNE Hauptbericht-ID: aufeinanderfolgende Berichte desselben Marsches (Abstand <= STREAK_GAP) zusammenfassen."""
    gap = STREAK_GAP["v"]
    res = {}
    if not gap:
        return res
    per = {}
    for b in battles:
        if (b.get("par") or b["id"]) == b["id"] and b.get("h") and b["h"][0]:
            per.setdefault((b["pid"], b["h"][0], b["h"][1]), []).append(b)
    for lst in per.values():
        lst.sort(key=lambda b: b["t"])
        gid, prev = None, None
        for b in lst:
            if prev is None or b["t"] - prev > gap:
                gid = b["id"]
            res[b["id"]] = gid
            prev = b["t"]
    return res


def reports(battles, ids, pvp_only):
    """Ein Bericht wie im Spiel: Hauptbericht + alle Teil-Berichte (Battle Streak, gleiche parentId) zusammengerechnet.
    Waechst, solange der Kampf weiterlaeuft; ein neuer Hauptbericht = neuer Bericht (faengt bei 0 an)."""
    per = {}
    sid = streak_ids(battles)
    for b in battles:
        if (ids is not None and b["pid"] not in ids) or b.get("arch"):
            continue
        k = (b["pid"], sid.get(b["id"]) or b.get("par") or b["id"])
        g = per.get(k)
        if g is None:
            g = per[k] = {"id": k[1], "pid": b["pid"], "h": list(b.get("h") or (0, 0)), "t0": b["t"], "t": b["t"], "mt": b.get("mt", 0),
                          "fights": [], "nrep": 0, "cmax": 0}
        g["fights"].extend(b["fights"])          # (vorher jedes Mal neue Liste -> im grossen Kampf sehr langsam)
        g["cmax"] = max(g["cmax"], b.get("cno") or 0)          # hoechste Teil-Nr. = so viele Teile hat die Streak mindestens
        g["nrep"] += 1
        if "rem" in b and (b["t"], b.get("mt", 0)) >= (g.get("_rt", 0), 0):
            g["rem"], g["_rt"] = b["rem"], b["t"]          # Resttruppen aus dem neuesten Teil
        g["t0"] = min(g["t0"], b["t"]); g["t"] = max(g["t"], b["t"]); g["mt"] = max(g["mt"], b.get("mt", 0))
        if b["id"] == k[1] and b.get("h") and b["h"][0]:                # (bei Notfall-Gruppe = erster Bericht)
            g["h"] = list(b["h"])                       # Kommandanten vom Hauptbericht
    out = list(per.values())
    if pvp_only:
        out = [g for g in out if any(f[0] for f in g["fights"])]
    return out


def pvp_last(battles, ids):
    """Wann hat jeder Marsch zuletzt gegen SPIELER gekaempft? (ein Durchlauf fuer alle)"""
    res = {}
    for b in battles:
        h = b.get("h")
        if h and (ids is None or b["pid"] in ids) and b["t"] > res.get((h[0], h[1]), 0) and any(f[0] for f in b["fights"]):
            res[(h[0], h[1])] = b["t"]
    return res


def acc_since(battles, ids, since_ts):
    return sum(f[19] for b in battles if b["t"] >= since_ts and not b.get("arch") and (ids is None or b["pid"] in ids)
               for f in b["fights"] if len(f) > 19 and f[0])


def pve_stats(battles, ids, gap=0, day_ts=0):
    """Barbaren je Marsch wie auf der Website: Kette = Anzahl Barbaren in EINEM Bericht (2 Barbaren = 2er-Kette).
    Liefert ({marsch: {lvl, chain, hits, today, last}}, Durchschnitt Kette heute)."""
    per = {}
    for g in reports(battles, ids, False):
        k = tuple(g["h"])
        if not k[0]:
            continue
        barbs = [f for f in g["fights"] if len(f) > 16 and not f[0] and f[14] == 1]
        if barbs:
            per.setdefault(k, []).append((g["t"], barbs))
    res, chains_today = {}, []
    for k, lst in per.items():
        lst.sort(key=lambda x: x[0])
        for t, bb in lst:
            if t >= day_ts:
                chains_today.append(len(bb))
        t, last = lst[-1]
        lv = [f[15] for f in last if f[15]]
        res[k] = {"lvl": max(set(lv), key=lv.count) if lv else 0, "chain": len(last), "hits": len(last),
                  "today": sum(sum(1 for f in bb if f[16]) for tt, bb in lst if tt >= day_ts), "last": t}
    avg = (sum(chains_today) / len(chains_today)) if chains_today else 0
    return res, avg


def recent_cards(battles, ids, n, pvp_only, settle=0, merge=True, now=None):
    """Feed/Pop-up: ein Eintrag je Bericht wie im Spiel. settle: Bericht erst zeigen, wenn er X s nicht mehr waechst (= End-Bericht).
    merge: Berichte gegen denselben Gegner innerhalb von 3 Min = EINE Schlacht (z. B. 4 Maersche auf denselben Gegner)."""
    now = now or time.time()
    bs = sorted(reports(battles, ids, False), key=lambda b: (-b["t0"], -b["mt"]))
    cards = []
    recent_cards.pending = False
    for b in bs:
        if settle and b.get("mt") and now - b["mt"] < settle:
            recent_cards.pending = True
            continue                                   # Kampf laeuft noch -> erst den fertigen Bericht zeigen
        c = battle_card(b)
        if c and (c["pvp"] or not pvp_only):
            cards.append(c)
        if len(cards) >= n * 6:
            break
    out = []
    for c in cards:
        g = None
        if merge and c["pvp"] and c["enemy"]:
            g = next((o for o in out if o["pvp"] and o["enemy"] == c["enemy"] and abs(o["t"] - c["t"]) <= 180), None)
        if g:
            g["kp"] += c["kp"]; g["ol"] += c["ol"]; g["el"] += c["el"]; g["acc"] += c["acc"]; g["kills"] += c["kills"]
            g["marches"] += 1; g["win"] = g["win"] or c["win"]
            g["trade"] = (g["el"] / g["ol"]) if g["ol"] else (None if not g["el"] else float("inf"))
            if c["h"] not in g["hs"]:
                g["hs"].append(c["h"])
        else:
            c = dict(c, marches=1, hs=[c["h"]])
            out.append(c)
        if len(out) > n:
            break
    return out[:n]


def march_stats(battles, ids, since_ts, last_only=False, pvp_only=True):
    """Pro eigenem Marsch (Kommandanten-Paar): KP, Kills, Acclaim, Tote, Verluste, Trade, Anzahl Berichte, zuletzt benutzt.
    last_only: nur der NEUESTE Bericht je Marsch zaehlt – jeder neue Bericht setzt die Werte zurueck."""
    res = {}
    if last_only:                                        # aktuellster Bericht je Marsch (Hauptbericht + Teil-Berichte)
        newest = {}
        for g in reports(battles, ids, pvp_only):
            k = tuple(g["h"])
            if not k[0]:
                continue
            if k not in newest or (g["t0"], g["mt"]) > (newest[k]["t0"], newest[k]["mt"]):
                newest[k] = g
        battles, since_ts = list(newest.values()), 0
    for b in battles:
        if (ids is not None and b["pid"] not in ids) or b.get("arch") or not b.get("h") or not b["h"][0]:
            continue
        k = (b["h"][0], b["h"][1])
        r = res.setdefault(k, {"kp": 0, "own": 0, "en": 0, "last": 0, "n": 0, "kills": 0, "acc": 0, "dead": 0, "sev": 0, "edead": 0, "esev": 0})
        r["last"] = max(r["last"], b["t"])
        if b["t"] < since_ts:
            continue
        pv = False
        for f in b["fights"]:
            if len(f) > 19:
                r["acc"] += f[19]
            if f[0]:
                pv = True
                r["kp"] += f[1]; r["own"] += f[3] + f[4]; r["en"] += f[6] + f[7]
                r["kills"] += f[6] + f[7]; r["dead"] += f[3]; r["sev"] += f[4]; r["edead"] += f[6]; r["esev"] += f[7]
        if pv:
            r["n"] += 1
    return res


def kp_since(battles, ids, since_ts):
    return sum(f[1] for b in battles if b["t"] >= since_ts and (ids is None or b["pid"] in ids) and not b.get("arch")
               for f in b["fights"] if f[0])


TRADE_FMT = {"v": "pct"}          # "pct" = 184 %  ·  "ratio" = 1,84:1 (von der App gesetzt)


def fmt_trade(tr, mode=None):
    if tr is None:
        return "–"
    if tr == float("inf"):
        return "∞"
    if (mode or TRADE_FMT["v"]) == "ratio":
        return ("%.2f:1" % tr).replace(".", ",") if TRADE_FMT.get("lang") == "de" else "%.2f:1" % tr
    return "%d %%" % round(tr * 100)


def enemy_marches(battles, ids, last_b, lang):
    """Wie viele Maersche hat der Gegner? = verschiedene Kommandanten-Paare, mit denen er dir in den letzten 7 Tagen begegnet ist."""
    res = {"m_enemy_marches": "–", "m_last_marches": "–", "_marches": [], "_enemy": ""}
    if not last_b:
        return res
    pf = [f for f in last_b["fights"] if f[0] and len(f) > 13 and f[11]]
    if not pf:
        return res
    res["m_last_marches"] = str(len({(f[11], f[12], f[13]) for f in pf}))       # Gegner-Maersche im letzten Kampf
    epid, name = pf[0][11], pf[0][10]
    since = last_b["t"] - 7 * 86400
    seen = {}
    for b in battles:
        if b["t"] < since or (ids is not None and b["pid"] not in ids):
            continue
        for f in b["fights"]:
            if len(f) > 13 and f[0] and f[11] == epid and f[12]:
                k = (f[12], f[13])
                seen[k] = max(seen.get(k, 0), b["t"])
    if seen:
        n = len(seen)
        res["m_enemy_marches"] = "%d · %s" % (n, name) if name else str(n)
        res["_marches"] = sorted(seen.items(), key=lambda kv: -kv[1])
        res["_enemy"] = name
    return res


def fmt_totals(tot, t_first, t_last, last_kp, last_enemy, lang):
    span = (t_last - t_first) if t_first and t_last else 0
    hours = span / 3600 if span >= 600 else 0            # erst ab 10 Min. Kampfzeit sinnvoll
    F = lambda v: fmt_num(v, lang)
    tone = {}
    for k, a, b in (("m_kp_trade", tot["kp"], tot["ekp"]), ("m_loss_trade", tot["edead"] + tot["esev"], tot["dead"] + tot["sev"]),
                    ("m_power_trade", tot["epw"], tot["pw"])):
        if a or b:
            tone[k] = "good" if (not b or a / b >= 1) else "bad"
    return {"_tone": tone, "_n": tot["pvp"] + tot["pve"],
        "m_kp": F(tot["kp"]), "m_kp_all": F(tot["kp_all"]), "m_kp_last": F(last_kp) if last_kp is not None else "–",
        "m_kp_trade": ratio(tot["kp"], tot["ekp"], lang),
        "m_loss_trade": ratio(tot["edead"] + tot["esev"], tot["dead"] + tot["sev"], lang),
        "m_power_trade": ratio(tot["epw"], tot["pw"], lang),
        "m_dead": F(tot["dead"]), "m_severe": F(tot["sev"]), "m_wounded": F(tot["wnd"]),
        "m_enemy_out": F(tot["edead"] + tot["esev"]), "m_enemy_dead": F(tot["edead"]),
        "m_pvp": F(tot["pvp"]), "m_pve": F(tot["pve"]),
        "m_kph": F(tot["kp"] / hours) if tot["kp"] and hours else "–",
        "m_last_enemy": last_enemy or "–",
    }




# ---------------------------------------------------------------- Design (wie die Website: dunkel + Gold)
C = {"bg": "#07090f", "side": "#0b0e16", "card": "#111725", "card2": "#161e2f", "line": "#212b40", "line2": "#2e3a55",
     "gold": "#f5c542", "gold2": "#e0a91b", "gold_dim": "#3a2f12", "text": "#e2e8f0", "muted": "#94a3b8", "dim": "#64748b",
     "good": "#4ade80", "bad": "#f87171", "input": "#0c1019", "key": "#010203"}
IS_WIN = sys.platform.startswith("win")

TXT["de"].update({
    "sub_conn": "Koppel die App mit deinem Website-Account.", "sub_acc": "Wähle, welche Accounts dir gehören.",
    "sub_ov": "Dein Live-Fenster über dem Spiel.", "sub_set": "Spielordner, Hochladen und Start.",
    "card_status": "Status", "card_new": "Neu verbinden", "steps": "1.  Auf der Website „App verbinden“ öffnen\n2.  „Code erzeugen“ klicken\n3.  Code hier eingeben",
    "no_acc": "Noch keine Accounts gefunden. Starte das Spiel einmal oder prüfe unter Einstellungen den Spielordner.",
    "reports": "{n} Berichte · zuletzt {t}", "card_view": "Anzeige", "card_range": "Zeitraum", "card_values": "Werte (Klick = an/aus)",
    "card_folders": "Spielordner", "card_upload": "Hochladen", "card_start": "Start & Sprache", "auto_found": "automatisch gefunden",
    "live": "live", "unlinked_hint": "Ohne gebundene IDs zählt das Overlay alle Accounts aus dem Mailcache.",
    "b_main": "Als Main binden", "b_alt": "Mein Zweitaccount", "b_pilot": "Ich pilotiere ihn",
    "k_main": "Main", "k_alt": "Zweitaccount", "k_pilot": "Pilot", "pending": "wartet auf Besitzer",
    "prof_id": "Governor-ID in deinem Website-Profil: {id}", "prof_none": "In deinem Website-Profil ist noch keine Governor-ID eingetragen – trag sie dort ein, dann kannst du deinen Main binden.",
    "pending_info": "Der Besitzer muss das auf der Website unter „App verbinden“ erlauben.", "ov_pilot": "Pilot-Accounts mitzählen",
    "err_protected": "Diese Website-Version ist bei Vercel geschützt (nur für dich im Browser sichtbar). Die App kann sie nicht erreichen – verbinde die App mit deiner normalen Website.",
    "link_bad": "Dieser Verbindungs-Link ist ungültig oder kommt nicht von der Wiz-fan-Club-Website.", "link_busy": "Verbinde mit der Website …",
    "link_ok": "✔ Verbunden als {n}", "link_ask": "Mit dieser Website verbinden?\n\n{s}", "steps1": "Am einfachsten: Auf der Website „🚀 Mit App verbinden“ klicken – fertig.",
    "err_404": "Unter {u} gibt es die App-Verbindung (noch) nicht.\n\nTrag bei „Website-Adresse“ genau die Adresse ein, auf der du den Code erzeugt hast – sie steht auf der Seite „App verbinden“ zum Kopieren.",
    "dev_name": "Name für diesen PC", "tab_mk": "Marker", "sub_mk": "Koalitions- und Allianz-Marker aus deinen Mails.", "mk_all": "Alle", "mk_ball": "Nur Ball", "mk_sort_new": "Neueste zuerst", "mk_sort_ball": "Ball zuerst",
    "mk_none": "Gerade keine Marker (älter als 1 Stunde werden gelöscht). Werden deine Marker nie erkannt: unter „⚙ Einstellungen & Test“ → „Beispiel speichern“ und mir die Datei schicken.",
    "mk_copy": "Kopieren", "mk_copied": "Koordinaten kopiert", "mk_ago_m": "vor {n} Min.", "mk_ago_h": "vor {n} Std.", "mk_ago_d": "vor {n} Tg.",
    "mk_words": "Ball-Wörter (mit Komma)", "mk_sound": "Ton bei neuem Ball-Marker", "mk_overlay": "Neuen Ball-Marker im Overlay zeigen",
    "mk_export": "Beispiel speichern", "mk_exported": "Gespeichert: {p}", "mk_by": "von {n}", "mk_new_ball": "NEUER BALL", "mk_new": "Neuer Marker",
    "mk_all_alarm": "Alarm auch bei normalen Markern", "mk_clear": "Alle löschen", "mk_keep": "Ball-Marker behalten",
    "kinds_info": "Main = die ID aus deinem Website-Profil · Zweitaccount = gehört auch dir (Filler, Farm) · Pilot = Account eines anderen, den du spielst",
})
TXT["en"].update({
    "sub_conn": "Pair the app with your website account.", "sub_acc": "Choose which accounts are yours.",
    "sub_ov": "Your live window on top of the game.", "sub_set": "Game folders, uploading and startup.",
    "card_status": "Status", "card_new": "Connect again", "steps": "1.  Open “Connect the app” on the website\n2.  Click “Create code”\n3.  Enter the code here",
    "no_acc": "No accounts found yet. Start the game once or check the game folder under Settings.",
    "reports": "{n} reports · last {t}", "card_view": "Display", "card_range": "Time range", "card_values": "Values (click = on/off)",
    "card_folders": "Game folders", "card_upload": "Uploading", "card_start": "Startup & language", "auto_found": "found automatically",
    "live": "live", "unlinked_hint": "Without linked IDs the overlay counts all accounts from the mailcache.",
    "b_main": "Link as main", "b_alt": "My alt account", "b_pilot": "I pilot it",
    "k_main": "Main", "k_alt": "Alt account", "k_pilot": "Pilot", "pending": "waiting for owner",
    "prof_id": "Governor ID in your website profile: {id}", "prof_none": "There is no governor ID in your website profile yet – add it there, then you can link your main.",
    "pending_info": "The owner has to allow this on the website under “Connect the app”.", "ov_pilot": "Count pilot accounts",
    "err_protected": "This website version is protected by Vercel (only visible to you in the browser). The app cannot reach it – connect the app to your normal website.",
    "link_bad": "This connection link is invalid or does not come from the Wiz fan Club website.", "link_busy": "Connecting to the website …",
    "link_ok": "✔ Connected as {n}", "link_ask": "Connect with this website?\n\n{s}", "steps1": "Easiest: click “🚀 Connect with app” on the website – done.",
    "err_404": "There is no app connection at {u} (yet).\n\nUnder “Website address” enter exactly the address where you created the code – it is shown on the “Connect the app” page for copying.",
    "dev_name": "Name for this PC", "tab_mk": "Markers", "sub_mk": "Coalition and alliance markers from your mails.", "mk_all": "All", "mk_ball": "Ball only", "mk_sort_new": "Newest first", "mk_sort_ball": "Ball first",
    "mk_none": "No markers right now (older than 1 hour are deleted). If your markers are never detected: “⚙ Settings & test” → “Save example” and send me the file.",
    "mk_copy": "Copy", "mk_copied": "Coordinates copied", "mk_ago_m": "{n} min ago", "mk_ago_h": "{n} h ago", "mk_ago_d": "{n} d ago",
    "mk_words": "Ball words (comma separated)", "mk_sound": "Sound on new ball marker", "mk_overlay": "Show new ball marker in overlay",
    "mk_export": "Save example", "mk_exported": "Saved: {p}", "mk_by": "by {n}", "mk_new_ball": "NEW BALL", "mk_new": "New marker",
    "mk_all_alarm": "Alert for normal markers too", "mk_clear": "Delete all", "mk_keep": "Keep ball markers",
    "kinds_info": "Main = the ID from your website profile · Alt = also yours (filler, farm) · Pilot = someone else's account that you play",
})


def web_vals(st, local, lang):
    """Summen von der Website + 'letzter Kampf' vom PC (der ist lokal immer am aktuellsten)."""
    tot = {k: float(st.get(k) or 0) for k in ("kp", "ekp", "dead", "sev", "wnd", "edead", "esev", "pw", "epw", "pvp", "pve", "kp_all")}
    v = fmt_totals(tot, st.get("first"), st.get("last"), None, "", lang)
    for k in ("m_kp_last", "m_last_enemy", "m_enemy_marches", "m_last_marches", "_marches", "_enemy",
              "m_barb", "m_barb_hits", "m_barb_lvl", "m_forts", "m_acclaim"):
        v[k] = local.get(k, "–")
    v["_n"] = local.get("_n", 0)
    v["_src"] = "web"
    return v


# ---------------------------------------------------------------- Design-Bausteine (rund, scharf auf hochaufloesenden Bildschirmen)
SCALE = 1.0          # wird beim Start aus der Bildschirm-DPI gesetzt


def px(n):
    return int(round(n * SCALE))


def pick_font(root, *names):
    try:
        fams = {f.lower() for f in tkfont.families(root)}
    except Exception:
        fams = set()
    for n in names:
        if n.lower() in fams:
            return n
    return names[-1]


def rrect(cv, x1, y1, x2, y2, r, **kw):
    """Abgerundetes Rechteck auf einem Canvas."""
    r = max(1, min(r, (x2 - x1) / 2, (y2 - y1) / 2))
    pts = [x1 + r, y1, x2 - r, y1, x2, y1, x2, y1 + r, x2, y2 - r, x2, y2, x2 - r, y2, x1 + r, y2, x1, y2, x1, y2 - r, x1, y1 + r, x1, y1]
    return cv.create_polygon(pts, smooth=True, **kw)


def bg_of(w):
    try:
        return w.cget("bg")
    except tk.TclError:
        return C["bg"]


class Btn(tk.Canvas):
    """Runder Button mit Hover (gold / ghost / danger)."""
    STY = {"gold": (C["gold"], "#0b0e16", "#fde68a", C["gold"]), "ghost": (C["card2"], C["text"], C["line2"], C["line2"]),
           "danger": (C["card2"], C["bad"], "#3b1d24", "#5b2530")}

    def __init__(self, parent, text, cmd, kind="gold", small=False, width=None, **kw):
        self.fill, self.fg, self.hov, self.out = self.STY[kind]
        self.font = fnt(FONT, 9 if small else 10, "bold")
        tw = self.font.measure(text)
        h = px(28 if small else 36)
        w = width or (tw + px(24 if small else 34))
        super().__init__(parent, width=w, height=h, bg=bg_of(parent), highlightthickness=0, bd=0, cursor="hand2", **kw)
        self.text, self._cmd, self._on, self._hover = text, cmd, True, False
        self.bind("<Configure>", lambda e: self.draw())
        self.bind("<Enter>", lambda e: self._h(True))
        self.bind("<Leave>", lambda e: self._h(False))
        self.bind("<ButtonRelease-1>", lambda e: self._on and self._cmd and self._cmd())
        self.draw()

    def _h(self, on):
        self._hover = on; self.draw()

    def draw(self):
        self.delete("all")
        w, h = int(self.winfo_width()) if self.winfo_width() > 1 else int(self["width"]), int(self["height"])
        fill = (self.hov if self._hover else self.fill) if self._on else C["line"]
        rrect(self, 1, 1, w - 1, h - 1, h / 2.4, fill=fill, outline=self.out if self._on else C["line"])
        self.create_text(w / 2, h / 2, text=self.text, fill=self.fg if self._on else C["dim"], font=self.font)

    def enable(self, on=True):
        self._on = on; self.configure(cursor="hand2" if on else "arrow"); self.draw()


_FONTS, _MEAS = {}, {}


def fnt(family=None, size=10, weight="normal", font=None):
    """Schrift nur EINMAL anlegen und wiederverwenden (jedes tkfont.Font kostet Zeit und Speicher)."""
    key = font if font is not None else (family, size, weight)
    f = _FONTS.get(key)
    if f is None:
        f = _FONTS[key] = tkfont.Font(font=font) if font is not None else tkfont.Font(family=family, size=size, weight=weight)
    return f


def measure(f, text):
    k = (str(f), text)
    v = _MEAS.get(k)
    if v is None:
        if len(_MEAS) > 5000:
            _MEAS.clear()
        v = _MEAS[k] = f.measure(text)
    return v


class Chip(tk.Canvas):
    """Runde Auswahl-Pille (an/aus)."""

    def __init__(self, parent, text, active, cmd):
        self.font = fnt(FONT, 9, "bold")
        super().__init__(parent, width=measure(self.font, text) + px(26), height=px(28), bg=bg_of(parent), highlightthickness=0, bd=0, cursor="hand2")
        self.text, self.cmd, self._hover = text, cmd, False
        self.bind("<ButtonRelease-1>", lambda e: self.cmd())
        self.bind("<Enter>", lambda e: (setattr(self, "_hover", True), self.draw()))
        self.bind("<Leave>", lambda e: (setattr(self, "_hover", False), self.draw()))
        self.bind("<Configure>", lambda e: self.draw())
        self.set(active)

    def set(self, active):
        self.active = active; self.draw()

    def draw(self):
        w, h = max(int(self["width"]), self.winfo_width()), int(self["height"])
        a = self.active
        st = (w, h, a, self._hover)
        if st == getattr(self, "_st", None):
            return
        self._st = st
        self.delete("all")
        rrect(self, 1, 1, w - 1, h - 1, h / 2, fill=C["gold_dim"] if a else (C["card2"] if self._hover else C["input"]),
              outline=C["gold2"] if a else C["line2"])
        self.create_text(w / 2, h / 2, text=self.text, fill=C["gold"] if a else C["muted"], font=self.font)


POP_COLORS = [("", None), ("rot", "#f87171"), ("orange", "#fb923c"), ("gold", "#f5c542"), ("gruen", "#4ade80"), ("blau", "#38bdf8"),
              ("lila", "#c084fc"), ("weiss", "#e5e7eb")]


class ColorDots(tk.Canvas):
    """Kleine Farbpunkte zum Anklicken (erster = Standard)."""
    def __init__(self, parent, cur, on_pick):
        n = len(POP_COLORS)
        super().__init__(parent, width=px(20) * n + px(4), height=px(22), bg=parent["bg"], highlightthickness=0, bd=0, cursor="hand2")
        self.cur, self.on_pick = cur or "", on_pick
        self.bind("<Button-1>", self._click)
        self.draw()

    def draw(self):
        self.delete("all")
        for i, (name, col) in enumerate(POP_COLORS):
            x, y, r = px(11) + i * px(20), px(11), px(7)
            if col:
                self.create_oval(x - r, y - r, x + r, y + r, fill=col, outline="")
            else:                                          # Standard
                self.create_oval(x - r, y - r, x + r, y + r, fill="", outline=C["dim"], width=1)
                self.create_text(x, y, text="A", fill=C["dim"], font=(FONT, 7, "bold"))
            if (col or "") == self.cur:
                self.create_oval(x - r - px(3), y - r - px(3), x + r + px(3), y + r + px(3), outline=C["text"], width=2)

    def _click(self, e):
        i = int((e.x - px(1)) // px(20))
        if 0 <= i < len(POP_COLORS):
            self.cur = POP_COLORS[i][1] or ""
            self.draw(); self.on_pick(self.cur)


class Slider(tk.Canvas):
    """Schieberegler (gold) – zum Ziehen oder Klicken. on_move: live, on_done: beim Loslassen."""
    def __init__(self, parent, value, lo, hi, on_move=None, on_done=None, width=220, fmt=lambda v: "%d %%" % round(v * 100)):
        bg = parent["bg"]
        super().__init__(parent, width=px(width), height=px(26), bg=bg, highlightthickness=0, bd=0, cursor="hand2")
        self.v, self.lo, self.hi, self.on_move, self.on_done, self.fmt = float(value), lo, hi, on_move, on_done, fmt
        self.W = px(width) - px(56)
        self.bind("<ButtonPress-1>", self._set); self.bind("<B1-Motion>", self._set)
        self.bind("<ButtonRelease-1>", lambda e: self.on_done and self.on_done(self.v))
        self.draw()

    def _set(self, e):
        f = max(0.0, min(1.0, (e.x - px(8)) / max(1, self.W)))
        v = round(self.lo + f * (self.hi - self.lo), 2)
        if v != self.v:
            self.v = v; self.draw()
            if self.on_move:
                self.on_move(v)

    def draw(self):
        self.delete("all")
        y, x0 = px(13), px(8)
        f = (self.v - self.lo) / ((self.hi - self.lo) or 1)
        rrect(self, x0, y - px(3), x0 + self.W, y + px(3), px(3), fill="#1a2234", outline="")
        rrect(self, x0, y - px(3), x0 + self.W * f, y + px(3), px(3), fill=C["gold"], outline="")
        kx = x0 + self.W * f
        self.create_oval(kx - px(8), y - px(8), kx + px(8), y + px(8), fill=C["gold"], outline="#7a5a10", width=2)
        self.create_text(x0 + self.W + px(10), y, text=self.fmt(self.v), anchor="w", fill=C["text"], font=(FONT, 9, "bold"))


class Toggle(tk.Frame):
    """Schalter (Pill) mit Text."""

    def __init__(self, parent, text, var, cmd=None, bg=None):
        bg = bg or bg_of(parent)
        super().__init__(parent, bg=bg, cursor="hand2")
        self.var, self.cmd = var, cmd
        self.W, self.H = px(40), px(22)
        self.cv = tk.Canvas(self, width=self.W, height=self.H, bg=bg, highlightthickness=0)
        self.cv.pack(side="left")
        self.lb = tk.Label(self, text=text, bg=bg, fg=C["text"], font=(FONT, 10))
        self.lb.pack(side="left", padx=px(8))
        for w in (self, self.cv, self.lb):
            w.bind("<ButtonRelease-1>", self._click)
        self.draw()

    def _click(self, _e=None):
        self.var.set(not self.var.get()); self.draw()
        if self.cmd:
            self.cmd()

    def draw(self):
        on, W, H, cv = bool(self.var.get()), self.W, self.H, self.cv
        cv.delete("all")
        rrect(cv, 1, 1, W - 1, H - 1, H / 2, fill=C["gold"] if on else C["line2"], outline="")
        r = H / 2 - px(3)
        x = W - H / 2 if on else H / 2
        cv.create_oval(x - r, H / 2 - r, x + r, H / 2 + r, fill="#0b0e16" if on else C["muted"], outline="")


class EntryBox(tk.Canvas):
    """Rundes Eingabefeld; .bind() geht an das Feld selbst."""

    def __init__(self, parent, var, width=30, big=False, center=False):
        self.f = fnt(MONO if big else FONT, 20 if big else 10, "bold" if big else "normal")
        h = px(54 if big else 34)
        w = self.f.measure("0") * width + px(24)
        super().__init__(parent, width=w, height=h, bg=bg_of(parent), highlightthickness=0, bd=0)
        self.e = tk.Entry(self, textvariable=var, bg=C["input"], fg=C["gold"] if big else C["text"], insertbackground=C["gold"],
                          relief="flat", bd=0, font=self.f, justify="center" if center else "left", highlightthickness=0)
        self.win = self.create_window(px(12), h / 2, window=self.e, anchor="w")
        self.focus = False
        self.e.bind("<FocusIn>", lambda e: (setattr(self, "focus", True), self.draw()))
        self.e.bind("<FocusOut>", lambda e: (setattr(self, "focus", False), self.draw()), add="+")
        super().bind("<Configure>", lambda e: self.draw())
        self.draw()

    def bind(self, seq=None, fn=None, add=None):
        return self.e.bind(seq, fn, add="+")

    def draw(self):
        self.delete("bgr")
        w, h = max(self.winfo_width(), int(self["width"])), int(self["height"])
        rrect(self, 1, 1, w - 1, h - 1, px(10), fill=C["input"], outline=C["gold2"] if self.focus else C["line2"], tags="bgr")
        self.tag_lower("bgr")
        self.itemconfigure(self.win, width=w - px(24))


def entry(parent, var, width=30, big=False, center=False):
    return EntryBox(parent, var, width, big, center)


class Card(tk.Canvas):
    """Runde Karte; Inhalt kommt in .body. Hoehe passt sich dem Inhalt an."""

    def __init__(self, parent, title=None, pad=16, fill=None, border=None, radius=16):
        self.fill, self.border, self.rad, self.pad = fill or C["card"], border or C["line"], px(radius), px(pad)
        super().__init__(parent, bg=bg_of(parent), highlightthickness=0, bd=0, height=px(40), width=px(200))
        self.inner = tk.Frame(self, bg=self.fill)
        if title:
            tk.Label(self.inner, text=title.upper(), bg=self.fill, fg=C["gold"], font=(FONT, 8, "bold")).pack(anchor="w", pady=(0, px(6)))
        self.body = tk.Frame(self.inner, bg=self.fill)
        self.body.pack(fill="both", expand=True)
        self.win = self.create_window(self.pad, self.pad, window=self.inner, anchor="nw")
        self.bind("<Configure>", lambda e: self.redraw())
        self.inner.bind("<Configure>", lambda e: self.fit())

    def fit(self):
        h = self.inner.winfo_reqheight() + 2 * self.pad
        if abs(int(self["height"]) - h) > 1:
            self.configure(height=h)

    def set_border(self, col):
        self.border = col; self.redraw()

    def redraw(self):
        w, h = self.winfo_width(), self.winfo_height()
        if w < 4:
            return
        self.delete("bgr")
        rrect(self, 1, 1, w - 1, h - 1, self.rad, fill=self.fill, outline=self.border, tags="bgr")
        self.tag_lower("bgr")
        self.itemconfigure(self.win, width=max(10, w - 2 * self.pad))


def card(parent, title=None):
    c = Card(parent, title)
    return c, c.body


def responsive(frame, items, cols_wide, bp, gap=8):
    """Karten nebeneinander, bei schmalem Fenster untereinander (bzw. weniger Spalten)."""
    state = {"c": None}

    def lay(_e=None):
        w = frame.winfo_width()
        if w < 20:
            return
        c = cols_wide if w >= px(bp) else max(1, cols_wide // 2 if cols_wide >= 4 else 1)
        if c == state["c"]:
            return
        state["c"] = c
        for i in range(max(cols_wide, 1)):
            frame.columnconfigure(i, weight=1 if i < c else 0, uniform="rsp" if i < c else "")
        for i, w_ in enumerate(items):
            r, k = divmod(i, c)
            w_.grid(row=r, column=k, sticky="nsew", padx=(0 if k == 0 else px(gap), 0), pady=(0 if r == 0 else px(gap), 0))
    frame.bind("<Configure>", lay, add="+")
    for i, w_ in enumerate(items):
        w_.grid(row=0, column=i, sticky="nsew", padx=(0 if i == 0 else px(gap), 0))
        frame.columnconfigure(i, weight=1, uniform="rsp")


class Scroll(tk.Frame):
    """Scrollbarer Bereich (Mausrad)."""

    def __init__(self, parent, bg):
        super().__init__(parent, bg=bg)
        self.cv = tk.Canvas(self, bg=bg, highlightthickness=0)
        self.inner = tk.Frame(self.cv, bg=bg)
        self.win = self.cv.create_window(0, 0, window=self.inner, anchor="nw")
        self.bar = tk.Canvas(self, width=px(6), bg=bg, highlightthickness=0)
        self.bar.pack(side="right", fill="y", padx=(px(4), 0))
        self.cv.pack(fill="both", expand=True)
        self.cv.configure(yscrollcommand=self._bar)
        self.inner.bind("<Configure>", lambda e: self.cv.configure(scrollregion=self.cv.bbox("all")))
        self.cv.bind("<Configure>", lambda e: self.cv.itemconfigure(self.win, width=e.width))
        Scroll._live.append(self)
        if not Scroll._bound:
            self.cv.bind_all("<MouseWheel>", Scroll._wheel_all, add="+")
            Scroll._bound = True

    _live, _bound = [], False

    @staticmethod
    def _wheel_all(e):
        alive = []
        for sc in Scroll._live:
            try:
                if sc.winfo_exists():
                    alive.append(sc)
            except tk.TclError:
                pass
        Scroll._live = alive
        for sc in alive[::-1]:
            sc._wheel(e)

    def _bar(self, a, b):
        """Schmaler goldener Scrollbalken (nur sichtbar, wenn es etwas zu scrollen gibt)."""
        a, b = float(a), float(b)
        if (a, b) == getattr(self, "_ab", None):
            return
        self._ab = (a, b)
        self.bar.delete("all")
        h = self.bar.winfo_height()
        if b - a < 0.999 and h > 10:
            rrect(self.bar, 0, a * h, px(6), b * h, px(3), fill=C["line2"], outline="")

    def _wheel(self, e):
        try:
            w = self.winfo_containing(e.x_root, e.y_root)
            if w is not None and str(w).startswith(str(self.cv)) and self.inner.winfo_height() > self.cv.winfo_height():
                self.cv.yview_scroll(int(-e.delta / 120), "units")
        except Exception:
            pass


def load_private_fonts():
    """Mitgelieferte Schriften (Cinzel = Website-Titel) nur fuer diese App laden – nichts wird installiert."""
    if not IS_WIN:
        return
    try:
        import ctypes
        for d in (RES, HERE, os.path.join(HERE, "fonts")):
            for f in glob.glob(os.path.join(d, "*.ttf")):
                ctypes.windll.gdi32.AddFontResourceExW(f, 0x10, 0)
    except Exception:
        pass


def enable_dpi():
    """Scharfe Schrift auf Bildschirmen mit Skalierung (125 %, 150 % …)."""
    if not IS_WIN:
        return
    try:
        import ctypes
        try:
            ctypes.windll.shcore.SetProcessDpiAwareness(1)
        except Exception:
            ctypes.windll.user32.SetProcessDPIAware()
    except Exception:
        pass


def draw_logo(cv, size):
    """W-Emblem wie das App-Icon."""
    s = size
    rrect(cv, 2, 2, s - 2, s - 2, s * 0.22, fill="#0b0e16", outline=C["gold2"], width=max(2, px(2)))
    cv.create_text(s / 2, s / 2 + 1, text="W", fill=C["gold"], font=(TITLE, int(s / SCALE * 0.42), "bold"))


class Seg(tk.Canvas):
    """Moderne Umschalter-Gruppe (eine Pille, aktiver Teil hervorgehoben) – statt vieler einzelner Knoepfe."""

    def __init__(self, parent, options, value, cb, small=False):
        self.opts, self.value, self.cb = options, value, cb
        self.font = fnt(FONT, 9 if small else 10, "bold")
        self.pad = px(14 if small else 18)
        self.ws = [self.font.measure(lab) + 2 * self.pad for _k, lab in options]
        h = px(30 if small else 34)
        super().__init__(parent, width=sum(self.ws) + px(8), height=h, bg=bg_of(parent), highlightthickness=0, bd=0, cursor="hand2")
        self.hover = None
        self.bind("<Motion>", lambda e: self._hov(self._at(e.x)))
        self.bind("<Leave>", lambda e: self._hov(None))
        self.bind("<ButtonRelease-1>", self._click)
        self.draw()

    def _at(self, x):
        xx = px(4)
        for i, w in enumerate(self.ws):
            if xx <= x < xx + w:
                return i
            xx += w
        return None

    def _hov(self, i):
        if i != self.hover:
            self.hover = i; self.draw()

    def _click(self, e):
        i = self._at(e.x)
        if i is not None:
            self.value = self.opts[i][0]; self.draw(); self.cb(self.value)

    def set(self, v):
        self.value = v; self.draw()

    def draw(self):
        self.delete("all")
        W, H = int(self["width"]), int(self["height"])
        rrect(self, 1, 1, W - 1, H - 1, H / 2, fill="#0b0f19", outline=C["line2"])
        x = px(4)
        for i, ((k, lab), w) in enumerate(zip(self.opts, self.ws)):
            act = k == self.value
            if act:
                rrect(self, x, px(4), x + w, H - px(4), (H - px(8)) / 2, fill=C["gold"], outline="")
            elif i == self.hover:
                rrect(self, x, px(4), x + w, H - px(4), (H - px(8)) / 2, fill=C["card2"], outline="")
            self.create_text(x + w / 2, H / 2, text=lab, fill="#0b0e16" if act else (C["text"] if i == self.hover else C["muted"]), font=self.font)
            x += w


def kpi(parent, label, value, meta="", meta_col=None, value_col=None):
    """Kennzahl-Karte: kleine Ueberschrift, rechts ein Hinweis, darunter die grosse Zahl."""
    c = Card(parent, pad=14, radius=16)
    top = tk.Frame(c.body, bg=C["card"]); top.pack(fill="x")
    tk.Label(top, text=label, bg=C["card"], fg=C["muted"], font=(FONT, 9)).pack(side="left")
    m = tk.Label(top, text=meta, bg=C["card"], fg=meta_col or C["dim"], font=(FONT, 8)); m.pack(side="right")
    v = tk.Label(c.body, text=value, bg=C["card"], fg=value_col or C["text"], font=(FONT, 20, "bold")); v.pack(anchor="w", pady=(px(4), 0))
    c.val, c.meta = v, m
    return c


class MarchTable(tk.Canvas):
    """Maersche als Tabelle (eine Zeichenflaeche = fluessig), Spalten sortierbar per Klick."""
    COLS = [("pair", 0), ("n", 60), ("kp", 110), ("kills", 92), ("acc", 92), ("dead", 86), ("trade", 70)]

    def __init__(self, parent, app):
        super().__init__(parent, bg=C["bg"], highlightthickness=0, bd=0)
        self.app, self.rows, self.sort = app, [], "kp"
        self.bind("<Configure>", lambda e: self.draw())
        self.bind("<MouseWheel>", lambda e: self.yview_scroll(int(-e.delta / 120) * 2, "units"))
        self.configure(yscrollincrement=px(20))

    def set(self, rows):
        self.rows = rows; self.draw()

    def draw(self):
        self.delete("all"); self._imgs = []
        W = self.winfo_width()
        if W < 100:
            return
        T, lang, app = self.app.t, self.app.cfg["lang"], self.app
        rh, hh = px(54), px(38)
        fixed = sum(px(w) for _k, w in self.COLS[1:])
        avail = W - px(34)
        sc = min(1.0, (avail - px(190)) / fixed) if fixed else 1.0     # schmales Fenster: Spalten etwas enger
        self._cw = {k: int(px(w) * sc) for k, w in self.COLS[1:]}
        pw = max(px(190), avail - sum(self._cw.values()))
        xs, x = [], px(16)
        for k, w in self.COLS:
            xs.append(x); x += pw if k == "pair" else self._cw[k]
        H = hh + max(1, len(self.rows)) * rh + px(8)
        rrect(self, 1, 1, W - px(8), H, px(16), fill=C["card"], outline=C["line"])
        self.create_rectangle(2, hh, W - px(9), hh + 1, fill=C["line"], outline="")
        heads = {"pair": T("mt_pair"), "n": T("mt_n"), "kp": T("mt_kp"), "kills": T("mt_kills"), "acc": T("mt_acc"), "dead": T("mt_dead"), "trade": T("mt_trade")}
        for (k, w), x0 in zip(self.COLS, xs):
            act = k == self.sort
            anchor, tx = ("w", x0) if k == "pair" else ("e", x0 + self._cw[k] - px(10))
            tid = self.create_text(tx, hh / 2, text=heads[k].upper() + (" ▾" if act else ""), anchor=anchor,
                                   fill=C["gold"] if act else C["dim"], font=(FONT, 8, "bold"), tags=("h_" + k,))
            if k != "pair":
                self.tag_bind("h_" + k, "<ButtonRelease-1>", lambda e, k=k: self.resort(k))
                self.tag_bind("h_" + k, "<Enter>", lambda e: self.configure(cursor="hand2"))
                self.tag_bind("h_" + k, "<Leave>", lambda e: self.configure(cursor=""))
        if not self.rows:
            self.create_text(W / 2, hh + rh / 2, text=T("march_empty"), fill=C["dim"], font=(FONT, 10))
            self.configure(scrollregion=(0, 0, W, H)); return
        mx = max((r["kp"] for r in self.rows), default=1) or 1
        for i, r in enumerate(self.rows):
            y = hh + i * rh
            if i:
                self.create_line(px(14), y, W - px(22), y, fill="#18202f")
            cy = y + rh / 2
            hero_badge(self, app, xs[0], cy - px(16), r["k"][0], True)
            if r["k"][1]:
                hero_badge(self, app, xs[0] + px(20), cy - px(12), r["k"][1], True)
            self.create_text(xs[0] + px(62), cy - px(8), text=app.hero_name(r["k"][0]) + " /", anchor="w", fill=C["text"], font=(FONT, 10, "bold"))
            self.create_text(xs[0] + px(62), cy + px(9), text=app.hero_name(r["k"][1]) if r["k"][1] else "", anchor="w", fill=C["text"], font=(FONT, 10, "bold"))
            tr = (r["en"] / r["own"]) if r["own"] else (float("inf") if r["en"] else None)
            vals = {"n": (str(r["n"]), C["text"]), "kp": (fmt_num(r["kp"], lang), C["gold"]), "kills": (fmt_num(r["kills"], lang), C["text"]),
                    "acc": (fmt_num(r["acc"], lang), C["text"]), "dead": (fmt_num(r["dead"], lang), C["text"]),
                    "trade": ("∞" if tr == float("inf") else ("%.2f" % tr).replace(".", "," if lang == "de" else ".") if tr is not None else "–",
                              C["good"] if (tr is not None and tr >= 1) else C["bad"] if tr is not None else C["dim"])}
            for (k, w), x0 in zip(self.COLS[1:], xs[1:]):
                v, col = vals[k]
                cw = self._cw[k]
                self.create_text(x0 + cw - px(10), cy - (px(6) if k == "kp" else 0), text=v, anchor="e", fill=col, font=(FONT, 10, "bold"))
                if k == "kp":                                    # kleiner Balken unter den KP (Anteil am besten Marsch)
                    bw = cw - px(20)
                    rrect(self, x0 + px(10), cy + px(10), x0 + px(10) + bw, cy + px(14), px(2), fill="#1a2234", outline="")
                    rrect(self, x0 + px(10), cy + px(10), x0 + px(10) + max(px(3), bw * r["kp"] / mx), cy + px(14), px(2), fill=C["gold2"], outline="")
        self.configure(scrollregion=(0, 0, W, H + px(10)))

    def resort(self, k):
        self.sort = k
        key = {"trade": lambda r: (r["en"] / r["own"]) if r["own"] else (1e9 if r["en"] else -1)}.get(k, lambda r: r[k])
        self.rows.sort(key=key, reverse=True)
        self.draw()



class MarkerList(tk.Canvas):
    """Alle Marker auf EINER Zeichenflaeche – auch bei vielen Eintraegen fluessig."""
    ROW = 78

    def __init__(self, parent, app):
        super().__init__(parent, bg=C["bg"], highlightthickness=0, bd=0)
        self.app, self.items = app, []
        self.bind("<Configure>", lambda e: self.draw())
        self.bind("<MouseWheel>", lambda e: self.yview_scroll(int(-e.delta / 120) * 2, "units"))
        self.bind("<Button-4>", lambda e: self.yview_scroll(-2, "units"))
        self.bind("<Button-5>", lambda e: self.yview_scroll(2, "units"))
        self.configure(yscrollincrement=px(20))

    def set(self, items):
        self.items = items; self.draw()

    def _btn(self, x2, y, label, tag, col, cmd):
        f = (FONT, 9, "bold")
        w = measure(fnt(font=f), label) + px(22)
        x1 = x2 - w
        rrect(self, x1, y - px(14), x2, y + px(14), px(12), fill=C["card2"], outline=C["line2"], tags=(tag, tag + "b"))
        self.create_text((x1 + x2) / 2, y, text=label, fill=col, font=f, tags=(tag,))
        self.tag_bind(tag, "<ButtonRelease-1>", lambda e: cmd())
        self.tag_bind(tag, "<Enter>", lambda e: (self.itemconfigure(tag + "b", fill=C["line2"]), self.configure(cursor="hand2")))
        self.tag_bind(tag, "<Leave>", lambda e: (self.itemconfigure(tag + "b", fill=C["card2"]), self.configure(cursor="")))
        return x1

    def draw(self):
        self.delete("all")
        W = self.winfo_width()
        if W < 50:
            return
        T, R, gap = self.app.t, px(self.ROW), px(8)
        if not self.items:
            self.create_text(px(4), px(20), text=T("mk_none"), anchor="nw", fill=C["dim"], font=(FONT, 10), width=W - px(20))
            self.configure(scrollregion=(0, 0, W, px(80)))
            return
        now = time.time()
        for i, m in enumerate(self.items):
            y0 = i * (R + gap)
            ball, fresh = m.get("_ball"), now - m["t"] < 1800
            rrect(self, 1, y0 + 1, W - px(8), y0 + R, px(14), fill=C["card"], outline=C["bad"] if ball else C["line"])
            if ball:
                rrect(self, 1, y0 + 1, px(6), y0 + R, px(3), fill=C["bad"], outline="")
            cy = y0 + R / 2
            self.create_text(px(26), cy, text="🎯" if ball else "📍", font=(FONT, 16), fill=C["text"])
            x = px(52)
            t1 = self.create_text(x, y0 + px(12), text="X %d · Y %d" % (m["x"], m["y"]), anchor="nw", fill=C["gold"], font=(FONT, 11, "bold"))
            bx = self.bbox(t1)[2] + px(10)
            rn = (m.get("_rname") or "").upper()[:12]
            if rn:
                tw = measure(fnt(FONT, 8, "bold"), rn) + px(16)
                rrect(self, bx, y0 + px(13), bx + tw, y0 + px(31), px(9), fill=C["bad"] if ball else C["gold2"], outline="")
                self.create_text(bx + tw / 2, y0 + px(22), text=rn, fill="#0b0e16", font=(FONT, 8, "bold"))
                bx += tw + px(10)
            self.create_text(bx, y0 + px(14), text=self.app.ago(m["t"]), anchor="nw", fill=C["good"] if fresh else C["dim"],
                             font=(FONT, 9, "bold" if fresh else "normal"))
            txt = (m.get("text") or "").replace("\n", " ")
            bx2 = W - px(20)
            k = m.get("key", "")
            bx2 = self._btn(bx2, cy, "✕", "del%d" % i, C["muted"], lambda k=k: self.app.del_marker(k)) - px(6)
            bx2 = self._btn(bx2, cy, "📋 " + T("mk_copy"), "cp%d" % i, C["text"], lambda m=m: self.app.copy_xy(m))
            self.create_text(x, y0 + px(36), text=txt[:90] + ("…" if len(txt) > 90 else ""), anchor="nw", fill=C["text"], font=(FONT, 10),
                             width=bx2 - x - px(12))
            meta = " · ".join(v for v in (T("mk_by", n=m["by"]) if m.get("by") else "",
                                           datetime.fromtimestamp(m["t"]).strftime("%d.%m. %H:%M") if m.get("t") else "") if v)
            self.create_text(x, y0 + R - px(10), text=meta, anchor="sw", fill=C["dim"], font=(FONT, 8))
        self.configure(scrollregion=(0, 0, W, len(self.items) * (R + gap)))


# ---------------------------------------------------------------- Overlay-Fenster
ICONS = {"m_kp": "⚔", "m_kp_all": "Σ", "m_kp_last": "⚡", "m_kp_trade": "⚖", "m_loss_trade": "🩸", "m_power_trade": "💪",
         "m_dead": "💀", "m_severe": "✚", "m_wounded": "🩹", "m_enemy_out": "☠", "m_enemy_dead": "✝", "m_pvp": "🗡",
         "m_pve": "🐗", "m_kph": "⏱", "m_last_enemy": "👤", "m_enemy_marches": "🛡", "m_last_marches": "⚑",
         "m_barb": "🪓", "m_barb_hits": "🪓", "m_barb_lvl": "⭐", "m_forts": "🏯", "m_acclaim": "★"}
OV_STYLES = ["tiles", "list", "bar"]
_ICON_ON = True


def ico(k):
    """Symbol vor einem Wert – oder nichts, wenn Symbole im Overlay ausgeschaltet sind."""
    return ICONS.get(k, "") if _ICON_ON else ""


def age_col(sec):
    """Ball-Marker: gruen (neu) -> nach 1 Min. orange -> nach 2 Min. rot (liegt schon laenger)."""
    return C["good"] if sec < 60 else ("#fb923c" if sec < 120 else C["bad"])


TONE = {"bad": ("#3b1d24", "#f87171", "#7f1d1d"), "gold": ("#3a2f12", "#f5c542", "#b7830f"),
        "orange": ("#3b2412", "#fb923c", "#7c3a12"), "blue": ("#122338", "#60a5fa", "#1e3a5f"), "green": ("#12321f", "#4ade80", "#166534")}

class Overlay:
    PAD = 12

    def __init__(self, app):
        self.app = app
        self.win = None
        self.vals = {}
        self.flash_until = 0
        self.alerts = []            # aktive Alarme (Marker, Buff abgelaufen, Gebaeude …)
        self._drawn = None
        self.hwnd = None

    def build(self):
        ov = self.app.cfg["overlay"]
        w = self.win = tk.Toplevel(self.app.root)
        w.overrideredirect(True)
        w.attributes("-topmost", True)
        w.attributes("-alpha", 0.0)                             # erst fertig zeichnen, dann einblenden (kein Aufblitzen)
        bg = C["key"] if IS_WIN else C["side"]
        w.configure(bg=bg)
        if IS_WIN:
            try:
                w.attributes("-transparentcolor", C["key"])      # runde Ecken
            except tk.TclError:
                pass
        self.cv = tk.Canvas(w, bg=bg, highlightthickness=0, bd=0)
        self.cv.pack()
        x, y = self._on_screen(int(ov.get("x", 60)), int(ov.get("y", 60)))
        w.geometry("+%d+%d" % (x, y))
        self.cv.bind("<ButtonPress-1>", self._start)
        self.cv.bind("<B1-Motion>", self._move)
        self.cv.bind("<ButtonRelease-1>", self._stop)
        self.cv.bind("<Button-3>", self._menu)
        self.cv.bind("<Double-Button-1>", lambda e: self.copy_alert())
        self._drawn = None
        self.draw()
        if IS_WIN:
            w.update_idletasks(); self._win_style()
        w.after(40, lambda: self.win is w and w.attributes("-alpha", float(ov.get("alpha", 0.85))))

    # ---------- immer sichtbar bleiben ----------
    def _on_screen(self, x, y):
        """Position zurueck auf den Bildschirm holen (z. B. nach Wechsel von 2 auf 1 Monitor)."""
        r = self.app.root
        try:
            if IS_WIN:
                import ctypes
                u = ctypes.windll.user32
                vx, vy, vw, vh = u.GetSystemMetrics(76), u.GetSystemMetrics(77), u.GetSystemMetrics(78), u.GetSystemMetrics(79)
            else:
                vx, vy, vw, vh = 0, 0, r.winfo_screenwidth(), r.winfo_screenheight()
            x = min(max(x, vx), vx + vw - px(120)); y = min(max(y, vy), vy + vh - px(60))
        except Exception:
            pass
        return x, y

    def _win_style(self):
        """Werkzeugfenster: kein Taskleisten-Eintrag, klaut dem Spiel nicht den Fokus, bleibt ganz oben (+ Durchklick)."""
        self.hwnd = win_exstyle(self.win, self.app.cfg["overlay"].get("clickthrough", False))
        self.keep_top()

    def keep_top(self):
        if not self.win:
            return
        try:
            if IS_WIN and self.hwnd:
                import ctypes
                u = ctypes.windll.user32
                if not u.IsWindow(self.hwnd):                 # Fenster von Windows weggenommen -> neu bauen
                    old, self.win = self.win, None
                    try:
                        old.destroy()
                    except tk.TclError:
                        pass
                    self.show(True); return
                if not u.IsWindowVisible(self.hwnd):
                    u.ShowWindow(self.hwnd, 4)                 # SW_SHOWNOACTIVATE
                # HWND_TOPMOST, ohne Verschieben/Groesse/Fokus -> kein Flackern
                u.SetWindowPos(self.hwnd, -1, 0, 0, 0, 0, 0x0001 | 0x0002 | 0x0010 | 0x0040)
            else:
                self.win.attributes("-topmost", True); self.win.lift()
            if not self.win.winfo_viewable():           # verschwunden (z. B. nach Minimieren) -> wieder zeigen
                self.win.deiconify()
        except tk.TclError:
            pass

    def rebuild_rows(self):
        self._drawn = None; self.draw()

    @staticmethod
    def _round(cv, x1, y1, x2, y2, r, **kw):
        return rrect(cv, x1, y1, x2, y2, r, **kw)

    # ---------- Alarme ----------
    def add_alert(self, a):
        a.setdefault("until", time.time() + 60 * int(self.app.cfg["alerts"].get("show_min", 10)))
        a.setdefault("id", "%s%.3f" % (a.get("icon", ""), time.time()))
        a.setdefault("born", time.time())
        self.alerts = [x for x in self.alerts if x["until"] > time.time()][-4:] + [a]
        self._drawn = None
        if not self.win and self.app.cfg["overlay"].get("show", True) and self.app.ov_on():
            self.show(True)
        self.draw()

    def active(self):
        now = time.time()
        self.alerts = [x for x in self.alerts if x["until"] > now]
        for x in self.alerts:                    # nur 1 Minute blinken, danach ruhig stehen (spart viel Neuzeichnen)
            if x.get("blink") and now - x.get("born", now) > 60:
                x["blink"] = False
        return self.alerts[-2:][::-1]            # neuester oben, max. 2

    def copy_alert(self):
        for a in self.active():
            if a.get("xy"):
                self.app.copy_xy({"x": a["xy"][0], "y": a["xy"][1]}); return

    def ball_list(self):
        """Marker fuers Overlay: nur Ball (Standard) oder alle – ohne die, die gerade als Alarm oben stehen."""
        ov = self.app.cfg["overlay"]
        n = int(ov.get("ball_n", 3))
        mode = ov.get("mk_mode", "ball")
        if mode == "off":
            return []
        rules = self.app.cfg["markers"].get("rules", [])
        skip = {a.get("key") for a in self.active()}
        with self.app.scanner.lock:
            ms = [m for m in self.app.scanner.markers.values() if m.get("key") not in skip]
        for m in ms:
            m["_rule"] = marker_rule(m, rules)
        ri = rune_idx(rules)
        runes = sorted([m for m in ms if ri >= 0 and m["_rule"] == ri], key=lambda m: -m["t"])
        if mode != "all":
            ms = [m for m in ms if m["_rule"] == 0] if n > 0 else []
        else:
            ms = [m for m in ms if not (ri >= 0 and m["_rule"] == ri)]
        ms.sort(key=lambda m: -m["t"])
        rn = int(ov.get("rune_n", 3)) if ov.get("runes", True) else 0
        return ms[:n] + runes[:rn]

    # ---------- Zeichnen ----------
    def draw(self):
        if not self.win:
            return
        ov, T = self.app.cfg["overlay"], self.app.t
        style = ov.get("style", "tiles")
        now = time.time()
        fs = int(ov.get("size", 11))
        F = {"lab": (FONT, fs), "val": (FONT, fs, "bold"), "big": (FONT, fs + 4, "bold"), "head": (FONT, max(7, fs - 3), "bold"),
             "small": (FONT, max(7, fs - 2)), "tiny": (FONT, max(7, fs - 3), "bold")}
        M = {k: fnt(font=v) for k, v in F.items()}
        rng = T(ov.get("range", "r_session"))
        if ov.get("range") == "r_since" and ov.get("since"):
            rng = "%s %s" % ("seit" if self.app.cfg["lang"] == "de" else "since", ov["since"])
        fg = self.app.focus_id()
        if fg:
            asn = (self.app.cfg.get("acc_since") or {}).get(str(fg))
            if asn:
                rng = "%s %s" % ("ab" if self.app.cfg["lang"] == "de" else "from", datetime.fromtimestamp(asn).strftime("%d.%m. %H:%M"))
            rng = "%s · %s" % (self.app.acc_name(fg), rng)
        keys = ov.get("metrics", [])
        tone = self.vals.get("_tone", {})
        global _ICON_ON
        _ICON_ON = ov.get("icons", True)
        flashing = now < self.flash_until
        al = self.active()
        balls = self.ball_list()

        def vcol(k):
            if tone.get(k) == "good":
                return C["good"]
            if tone.get(k) == "bad":
                return C["bad"]
            return C["gold"] if (k in ("m_kp", "m_kp_last") and (flashing or k == "m_kp")) else C["text"]

        cv = self.cv
        cv.delete("all")
        if style == "bar":
            self._draw_bar(cv, F, M, rng, keys, vcol, al, balls, now)
        else:
            self._draw_card(cv, F, M, rng, keys, vcol, al, balls, now, style)

    def _head(self, cv, F, M, x, y, w, rng, now):
        P = px(self.PAD)
        lg = px(18)
        rrect(cv, x, y, x + lg, y + lg, px(5), fill="#0b0e16", outline=C["gold2"])
        cv.create_text(x + lg / 2, y + lg / 2 + 1, text="W", fill=C["gold"], font=(TITLE, max(7, int(lg / SCALE * 0.5)), "bold"))
        cv.create_text(x + lg + px(8), y + lg / 2, text=rng.upper(), anchor="w", fill=C["gold"], font=F["head"])
        ok = self.app.scanner.status and "…" not in self.app.scanner.status
        dot = C["gold"] if now < self.flash_until else (C["good"] if ok else C["dim"])
        r = px(4)
        cv.create_oval(x + w - 2 * r, y + lg / 2 - r, x + w, y + lg / 2 + r, fill=dot, outline="")
        cv.create_text(x + w - 2 * r - px(8), y + lg / 2, text=self.app.t("live").upper(), anchor="e", fill=C["dim"], font=F["tiny"])
        return lg

    def _alert_box(self, cv, F, M, x, y, w, a, now):
        fill, col, out = TONE.get(a.get("tone", "gold"), TONE["gold"])
        lh = M["lab"].metrics("linespace") + px(4)
        h = lh * 2 + px(14)
        blink = a.get("blink") and int(now * 2) % 2 == 0
        rrect(cv, x, y, x + w, y + h, px(10), fill=col if blink else fill, outline=col)
        cv.create_text(x + px(10), y + px(7), text="%s  %s" % (a.get("icon", ""), a.get("title", "")), anchor="nw",
                       fill="#0b0e16" if blink else col, font=F["val"])
        sub = (a.get("sub") or "")[:52]
        cv.create_text(x + px(10), y + px(7) + lh, text=sub, anchor="nw", fill="#0b0e16" if blink else C["text"], font=F["lab"])
        return h

    def _draw_card(self, cv, F, M, rng, keys, vcol, al, balls, now, style):
        T, P = self.app.t, px(self.PAD)
        lh = M["lab"].metrics("linespace") + px(int(self.app.cfg["overlay"].get("spacing", 7)))
        cols = 2 if len(keys) > 1 else 1
        # Breite bestimmen
        if style == "tiles":
            tw = max([max(M["tiny"].measure((ico(k) + "  " if _ICON_ON else "") + T(k).upper()), M["big"].measure(self.vals.get(k, "–"))) for k in keys] + [px(70)]) + px(22)
            inner = cols * tw + (cols - 1) * px(8)
        else:
            lw = max([M["lab"].measure((ico(k) + "  " if _ICON_ON else "") + T(k)) for k in keys] + [0])
            vw = max([M["val"].measure(self.vals.get(k, "–")) for k in keys] + [M["val"].measure("0.000")])
            inner = lw + px(24) + vw
        rules = self.app.cfg["markers"].get("rules", [])
        coords = self.app.cfg["overlay"].get("mk_coords", True)

        ri_ = rune_idx(rules)

        def mk_label(m):
            r = m.get("_rule", -1)
            nm = (rules[r].get("name") if 0 <= r < len(rules) else "Marker") or "Marker"
            if r == ri_ and r >= 0:
                nm = T("rn_rune")
            return "%s%s" % (nm, (" %d" % m["num"]) if m.get("num") else "")

        def mk_right(m):
            sec = int(time.time() - m["t"])
            age = ("<1 Min" if sec < 60 else "%d Min" % (sec // 60)) if sec < 3600 else self.app.ago(m["t"])
            return ("X %d · Y %d   " % (m["x"], m["y"]) if coords else "") + age
        bl = [(mk_label(m), mk_right(m), m) for m in balls]
        inner = max(inner, max([M["val"].measure(a) + M["small"].measure(b) + px(46) for a, b, _ in bl] + [0]),
                    M["head"].measure(rng.upper()) + px(90), px(180))
        for a in al:
            inner = max(inner, M["val"].measure("%s  %s" % (a.get("icon", ""), a.get("title", ""))) + px(28),
                        min(px(380), M["lab"].measure((a.get("sub") or "")[:52]) + px(28)))
        W = inner + 2 * P
        # Hoehe vorab berechnen (zeichnen in zwei Durchgaengen waere teurer)
        y = P
        hh = px(18) + px(12)
        tile_h = M["tiny"].metrics("linespace") + M["big"].metrics("linespace") + px(18)
        rows_h = (((len(keys) + cols - 1) // cols) * (tile_h + px(8))) if style == "tiles" else len(keys) * lh
        al_h = len(al) * ((M["lab"].metrics("linespace") + px(4)) * 2 + px(14) + px(8))
        b_h = (M["tiny"].metrics("linespace") + px(8) + len(bl) * lh + px(6)) if bl else 0
        goal = int(self.app.cfg["overlay"].get("goal_kp", 0) or 0)
        goal_a = int(self.app.cfg["overlay"].get("goal_acc", 0) or 0)
        g_h = (M["tiny"].metrics("linespace") * 2 + px(18)) * ((1 if goal else 0) + (1 if goal_a else 0))
        exp_on = self.app.cfg["alerts"].get("exp_show", True) and getattr(self.app, "_exp", None)
        exp_h = M["tiny"].metrics("linespace") + px(8)
        g_h += exp_h if exp_on else 0
        H = P + hh + g_h + al_h + b_h + rows_h + P - (px(8) if style == "tiles" and keys else 0)
        cv.configure(width=W + 1, height=H + 1)
        rrect(cv, 0, 0, W, H, px(18), fill="#090c13", outline="#4a3a10")
        rrect(cv, 1, 1, W - 1, P + hh - px(2), px(17), fill="#101522", outline="")
        cv.create_rectangle(1, P + hh - px(16), W - 1, P + hh - px(2), fill="#101522", outline="")
        cv.create_line(P, P + hh - px(2), W - P, P + hh - px(2), fill=C["gold2"])
        self._head(cv, F, M, P, y, inner, rng, now)
        y = P + hh + px(6)
        one_h = M["tiny"].metrics("linespace") * 2 + px(18)
        if exp_on:                                           # 50 % Army Expansion: gruen aktiv / rot nicht aktiv
            act, n_, _t = self.app._exp
            col = C["good"] if act else C["bad"]
            cv.create_text(P, y + px(2), text="🪖 " + (self.app.t("exp_on") if act else self.app.t("exp_off")).upper(), anchor="nw", fill=col, font=F["tiny"])
            cv.create_text(W - P, y + px(2), text=fmt_num(n_, self.app.cfg["lang"]), anchor="ne", fill=col, font=F["tiny"])
            y += exp_h
        for gval, have, lab, bar in ((goal, getattr(self.app, "_kp_today", 0), "🏁 " + T("goal_today"), C["gold"]),
                                     (goal_a, getattr(self.app, "_acc_today", 0), "★ " + T("goal_acc"), "#c084fc")):
            if not gval:                                     # Tagesziel als Balken (KP gold, Acclaim lila)
                continue
            frac = max(0.0, min(1.0, have / gval))
            lang = self.app.cfg["lang"]
            cv.create_text(P, y, text=lab.upper(), anchor="nw", fill=C["muted"], font=F["tiny"])
            cv.create_text(P, y + M["tiny"].metrics("linespace") + px(2), text="%s / %s  ·  %d %%" % (fmt_num(have, lang), fmt_num(gval, lang), round(frac * 100)),
                           anchor="nw", fill=C["good"] if frac >= 1 else bar, font=F["tiny"])
            by = y + M["tiny"].metrics("linespace") * 2 + px(6)
            rrect(cv, P, by, W - P, by + px(7), px(3), fill="#1a2234", outline="")
            if frac > 0.01:
                rrect(cv, P, by, P + max(px(8), (W - 2 * P) * frac), by + px(7), px(3), fill=C["good"] if frac >= 1 else bar, outline="")
            y += one_h
        for a in al:
            y += self._alert_box(cv, F, M, P, y, inner, a, now) + px(8)
        if bl:
            mode_all = self.app.cfg["overlay"].get("mk_mode", "ball") == "all"
            has_rn = any(m.get("_rule") == rune_idx(self.app.cfg["markers"].get("rules", [])) for _a, _b, m in bl)
            has_bl = any(m.get("_rule") == 0 for _a, _b, m in bl)
            head = ("📍 " + T("tab_mk")) if mode_all else ("🎯 " + T("ov_balls") + "  ·  🔷 " + T("al_tab_runes")[2:] if has_rn and has_bl
                                                         else ("🔷 " + T("al_tab_runes")[2:] if has_rn else "🎯 " + T("ov_balls")))
            cv.create_text(P, y, text=head.upper(), anchor="nw",
                           fill=C["gold"] if mode_all else C["bad"], font=F["tiny"])
            y += M["tiny"].metrics("linespace") + px(8)
            ri = rune_idx(self.app.cfg["markers"].get("rules", []))
            for i, (lab, right, m) in enumerate(bl):
                col = RUNE_COL if (ri >= 0 and m.get("_rule") == ri) else age_col(now - m["t"])
                cy = y + lh / 2 - px(2)
                cv.create_oval(P + px(1), cy - px(4), P + px(9), cy + px(4), fill=col, outline="")
                cv.create_text(P + px(17), y, text=lab.upper(), anchor="nw", fill=col, font=F["val"])
                cv.create_text(W - P, y + px(2), text=right, anchor="ne", fill=C["muted"], font=F["small"])
                y += lh
            y += px(2)
            cv.create_line(P, y, W - P, y, fill=C["line"])
            y += px(4)
        if style == "tiles":
            tw = (inner - (cols - 1) * px(8)) / cols
            for i, k in enumerate(keys):
                c, r = i % cols, i // cols
                x0 = P + c * (tw + px(8)); y0 = y + r * (tile_h + px(8))
                rrect(cv, x0, y0, x0 + tw, y0 + tile_h, px(10), fill="#111725", outline="#1c2436")
                cv.create_text(x0 + px(10), y0 + px(8), text=(ico(k) + "  " if _ICON_ON else "") + T(k).upper(), anchor="nw", fill=C["muted"], font=F["tiny"])
                cv.create_text(x0 + px(10), y0 + tile_h - px(7), text=self.vals.get(k, "–"), anchor="sw", fill=vcol(k), font=F["big"])
        else:
            for i, k in enumerate(keys):
                if i:
                    cv.create_line(P, y - px(3), W - P, y - px(3), fill="#151b29")
                cv.create_text(P, y, text=(ico(k) + "  " if _ICON_ON else "") + T(k), anchor="nw", fill=C["muted"], font=F["lab"])
                cv.create_text(W - P, y, text=self.vals.get(k, "–"), anchor="ne", fill=vcol(k), font=F["val"])
                y += lh

    def _draw_bar(self, cv, F, M, rng, keys, vcol, al, balls, now):
        """Schmale Leiste: alle Werte nebeneinander."""
        P = px(10)
        parts = [(ico(k), self.vals.get(k, "–"), vcol(k)) for k in keys]
        for a in al[::-1]:
            parts.insert(0, (a.get("icon", ""), a.get("title", ""), TONE.get(a.get("tone", "gold"), TONE["gold"])[1]))
        rules = self.app.cfg["markers"].get("rules", [])
        for m in balls[:5]:
            r = m.get("_rule", -1)
            nm = (rules[r].get("name") if 0 <= r < len(rules) else "Marker") or "Marker"
            if r >= 0 and r == rune_idx(rules):
                nm = self.app.t("rn_rune")
            parts.append(("●", "%s%s" % (nm.upper(), (" %d" % m["num"]) if m.get("num") else ""),
                          RUNE_COL if r == rune_idx(rules) and r >= 0 else age_col(now - m["t"])))
        h = M["val"].metrics("linespace") + px(16)
        widths = [M["lab"].measure(i + " ") + M["val"].measure(v) for i, v, _ in parts]
        W = px(30) + sum(widths) + px(22) * max(0, len(parts)) + P
        cv.configure(width=W + 1, height=h + 1)
        blink = any(a.get("blink") for a in al) and int(now * 2) % 2 == 0
        rrect(cv, 0, 0, W, h, h / 2, fill="#3b1d24" if blink else "#090c13", outline=C["bad"] if any(a.get("blink") for a in al) else "#4a3a10")
        ok = self.app.scanner.status and "…" not in self.app.scanner.status
        r = px(4)
        cv.create_oval(P + px(4), h / 2 - r, P + px(4) + 2 * r, h / 2 + r, fill=C["good"] if ok else C["dim"], outline="")
        x = px(30)
        for i, ((icon_, val, col), w) in enumerate(zip(parts, widths)):
            t1 = cv.create_text(x, h / 2, text=icon_ + " ", anchor="w", fill=C["muted"], font=F["lab"])
            cv.create_text(cv.bbox(t1)[2], h / 2, text=val, anchor="w", fill=col, font=F["val"])
            x += w + px(11)
            if i < len(parts) - 1:
                cv.create_line(x, px(8), x, h - px(8), fill=C["line2"])
            x += px(11)

    def update(self, vals):
        if not self.win:
            return
        now = time.time()
        if self.vals and vals.get("_n", 0) > self.vals.get("_n", 0):
            self.flash_until = now + 4                        # neuer Kampf: kurz golden
        al = self.active()
        blink = any(a.get("blink") for a in al)
        bsig = (len(self.app.scanner.markers), int(now // 5) if self.app.cfg["overlay"].get("mk_mode", "ball") != "off" and self.app.scanner.markers else 0)
        # nur neu zeichnen, wenn sich etwas aendert (kein Dauer-Pulsieren mehr -> weniger Last)
        key = (id(vals), now < self.flash_until, tuple(a["id"] for a in al), int(now * 2) % 2 if blink else 0,
               int(now // 60) if al else 0, bsig, self.app.focus_id(), self.app.cfg["overlay"].get("mk_mode"),
               getattr(self.app, "_kp_today", 0) if self.app.cfg["overlay"].get("goal_kp") else 0,
               getattr(self.app, "_acc_today", 0) if self.app.cfg["overlay"].get("goal_acc") else 0, self.app.cfg["overlay"].get("goal_acc"),
               getattr(self.app, "_exp", None) if self.app.cfg["alerts"].get("exp_show", True) else None)
        if key != self._drawn:                               # nur neu zeichnen, wenn sich etwas sichtbar aendert
            self._drawn = key
            self.vals = vals
            self.draw()
        self.keep_top()                                      # jede Sekunde: ganz nach oben (ohne Flackern)

    def show(self, on):
        if on and not self.win:
            self.build()
        elif not on and self.win:
            self._save_pos(); self.win.destroy(); self.win = None

    def _start(self, e):
        self._dx, self._dy = e.x_root - self.win.winfo_x(), e.y_root - self.win.winfo_y()

    def _move(self, e):
        if self.app.cfg["overlay"].get("locked"):
            return
        self.win.geometry("+%d+%d" % (e.x_root - self._dx, e.y_root - self._dy))

    def _stop(self, e):
        self._save_pos()

    def _save_pos(self):
        if self.win:
            self.app.cfg["overlay"]["x"], self.app.cfg["overlay"]["y"] = self.win.winfo_x(), self.win.winfo_y()
            save_cfg(self.app.cfg)

    def _menu(self, e):
        T, ov = self.app.t, self.app.cfg["overlay"]
        mk = lambda p: tk.Menu(p, tearoff=0, bg=C["card"], fg=C["text"], activebackground=C["gold_dim"], activeforeground=C["gold"], bd=0)
        m = mk(self.win)
        mv = mk(m)
        self._vars = []
        for k in METRICS:
            var = tk.BooleanVar(value=k in ov["metrics"]); self._vars.append(var)
            mv.add_checkbutton(label=T(k), variable=var, command=lambda k=k: self.app.toggle_metric(k))
        m.add_cascade(label=T("menu_values"), menu=mv)
        mr = mk(m)
        rv = tk.StringVar(value=ov.get("range", "r_session")); self._vars.append(rv)
        for r in RANGES:
            mr.add_radiobutton(label=T(r), value=r, variable=rv, command=lambda r=r: self.app.set_range(r))
        m.add_cascade(label=T("menu_range"), menu=mr)
        ms = mk(m)
        sv = tk.StringVar(value=ov.get("style", "tiles")); self._vars.append(sv)
        for st in OV_STYLES:
            ms.add_radiobutton(label=T("st_" + st), value=st, variable=sv, command=lambda st=st: self.app.set_style(st))
        m.add_cascade(label=T("ov_style"), menu=ms)
        m.add_command(label=T("ov_reset"), command=self.app.reset_session)
        al = self.active()
        xy = next((a["xy"] for a in al if a.get("xy")), None)
        if xy:
            m.add_command(label="📋 X %d Y %d" % xy, command=self.copy_alert)
        if al:
            m.add_command(label="✕ " + T("al_close"), command=lambda: (setattr(self, "alerts", []), setattr(self, "_drawn", None), self.draw()))
        lv = tk.BooleanVar(value=ov.get("locked", False)); self._vars.append(lv)
        m.add_checkbutton(label=T("ov_lock"), variable=lv, command=lambda: self.app.set_opt("locked", lv.get()))
        m.add_separator()
        m.add_command(label=T("menu_main"), command=self.app.show_main)
        m.add_command(label=T("menu_hide"), command=lambda: self.app.set_opt("show", False))
        m.tk_popup(e.x_root, e.y_root)


# ---------------------------------------------------------------- Kommandanten-Bilder (aus der Website, in die .exe gepackt)
class HeroIcons:
    def __init__(self, app):
        self.app, self.cache, self.map, self.files = app, {}, {}, {}
        for d in (os.path.join(RES, "heroicons"), os.path.join(HERE, "heroicons"), os.path.join(DATA, "heroicons")):
            if os.path.isdir(d):
                self.dir = d
                try:
                    self.map = {self.norm(k): v for k, v in json.load(open(os.path.join(d, "map.json"), encoding="utf-8")).items()}
                except Exception:
                    pass
                self.files = {os.path.splitext(f)[0]: os.path.join(d, f) for f in os.listdir(d) if f.endswith(".png")}
                break

    @staticmethod
    def norm(n):
        return re.sub(r"[^a-z0-9]", "", str(n or "").lower())

    def file_for(self, hid):
        name = self.app.hero_name(hid) if hid else ""
        if not name or name.startswith("#") or not self.files:
            return None
        n = self.norm(name)
        stem = self.map.get(n)
        if not stem:                                           # wie auf der Website: Praefix-Suche
            stem = next((f for f in sorted(self.files, key=len, reverse=True) if not f.startswith("x_") and len(f) >= 3 and n.startswith(f)), None)
        return self.files.get(str(stem or "").lower())

    def get(self, hid, small=False, size=None):
        """PhotoImage in size px (Quelle 64 px) oder None."""
        size = int(size or (32 if small else 64))
        k = (hid, size)
        if k not in self.cache:
            f = self.file_for(hid)
            img = None
            if f:
                try:
                    img = tk.PhotoImage(file=f)
                    if size != 64:
                        from fractions import Fraction
                        fr = Fraction(size, 64).limit_denominator(8)
                        if fr.numerator > 1:
                            img = img.zoom(fr.numerator)
                        if fr.denominator > 1:
                            img = img.subsample(fr.denominator)
                except tk.TclError:
                    img = None
            self.cache[k] = img
        return self.cache[k]


def hero_badge(cv, app, x, y, hid, small=True, size=None):
    """Kommandanten-Bild (rund) oder – falls keins da ist – Kreis mit Anfangsbuchstaben."""
    size = size or (32 if small else 48)
    img = app.icons.get(hid, size=px(size))
    d = px(size)
    if img:
        cv.create_image(x, y, image=img, anchor="nw")
        cv._imgs = getattr(cv, "_imgs", []) + [img]
        return
    nm = app.hero_name(hid) if hid else "?"
    cv.create_oval(x + 1, y + 1, x + d - 1, y + d - 1, fill="#1a2234", outline=C["gold2"], width=2)
    cv.create_text(x + d / 2, y + d / 2, text=(nm[:1] if not nm.startswith("#") else "?").upper(), fill=C["gold"], font=(FONT, max(10, size // 3), "bold"))


def hero_pair(cv, app, x, y, h, size, one=False):
    """Haupt- (vorne) und Zweit-Kommandant (leicht versetzt dahinter). Gibt die Breite zurueck."""
    d = px(size)
    if h and len(h) > 1 and h[1] and not one:
        hero_badge(cv, app, x + int(d * 0.75), y, h[1], size=size)
        hero_badge(cv, app, x, y, h[0], size=size)
        return d + int(d * 0.75)
    hero_badge(cv, app, x, y, h[0] if h else 0, size=size)
    return d


# ---------------------------------------------------------------- Schwebende Fenster (Feed, Marsch-Leiste, Pop-up)
_ROK_EXE = ("mass.exe", "rok.exe", "riseofkingdoms.exe", "rise of kingdoms.exe")


def rok_running(folders):
    """Laeuft Rise of Kingdoms (PC-Client)? Prueft nur Programmnamen/-pfade der laufenden Prozesse."""
    if not IS_WIN:
        return True
    try:
        import ctypes
        from ctypes import wintypes
        k32, ps = ctypes.windll.kernel32, ctypes.windll.psapi
        arr = (wintypes.DWORD * 4096)(); got = wintypes.DWORD()
        if not ps.EnumProcesses(arr, ctypes.sizeof(arr), ctypes.byref(got)):
            return True
        roots = []
        for g in folders or []:
            g = os.path.normcase(os.path.abspath(g))
            roots.append(g)                                             # nur das Spiel selbst, nicht der Launcher (laeuft oft weiter)
        buf = ctypes.create_unicode_buffer(1024)
        for pid in arr[:got.value // ctypes.sizeof(wintypes.DWORD)]:
            h = k32.OpenProcess(0x1000, False, pid)                    # PROCESS_QUERY_LIMITED_INFORMATION
            if not h:
                continue
            try:
                n = wintypes.DWORD(1024)
                if k32.QueryFullProcessImageNameW(h, 0, buf, ctypes.byref(n)):
                    p = os.path.normcase(buf.value)
                    if os.path.basename(p) in _ROK_EXE or any(r and p.startswith(r + os.sep) for r in roots):
                        return True
            finally:
                k32.CloseHandle(h)
        return False
    except Exception as e:
        log("rok_running: %s" % e)
        return True


def win_exstyle(win, click_through=False):
    """Werkzeugfenster ohne Taskleiste/Fokus, ganz oben; optional Durchklick (Maus geht ins Spiel)."""
    if not IS_WIN or not win:
        return None
    try:
        import ctypes
        u = ctypes.windll.user32
        hwnd = u.GetParent(win.winfo_id()) or win.winfo_id()
        st = u.GetWindowLongW(hwnd, -20)
        st = (st | 0x80 | 0x08000000 | 0x8 | 0x80000) & ~0x40000          # TOOLWINDOW | NOACTIVATE | TOPMOST | LAYERED
        st = (st | 0x20) if click_through else (st & ~0x20)               # TRANSPARENT = Durchklick
        u.SetWindowLongW(hwnd, -20, st)
        try:                                                              # kein "Besitzer" mehr: App minimieren nimmt das Overlay NICHT mit
            (getattr(u, "SetWindowLongPtrW", None) or u.SetWindowLongW)(hwnd, -8, 0)
        except Exception:
            pass
        u.SetWindowPos(hwnd, -1, 0, 0, 0, 0, 0x0001 | 0x0002 | 0x0010 | 0x0040)
        return hwnd
    except Exception as e:
        log("exstyle: %s" % e)
        return None


class Float:
    """Basis fuer kleine Overlay-Fenster: verschiebbar, immer oben, runde Ecken, Position wird gemerkt."""
    def __init__(self, app, key):
        self.app, self.key, self.win, self.cv, self.hwnd, self._drawn = app, key, None, None, None, None

    def pos(self):
        p = self.app.cfg["overlay"].get("pos_" + self.key) or [px(40), px(300)]
        return int(p[0]), int(p[1])

    def build(self):
        w = self.win = tk.Toplevel(self.app.root)
        w.overrideredirect(True)
        w.attributes("-topmost", True)
        ov = self.app.cfg["overlay"]
        w.attributes("-alpha", 0.0)
        w.after(60, lambda: self.win is w and w.attributes("-alpha", float(ov.get("alpha_" + self.key, ov.get("alpha", 0.9)))))
        bg = C["key"] if IS_WIN else C["side"]
        w.configure(bg=bg)
        if IS_WIN:
            try:
                w.attributes("-transparentcolor", C["key"])
            except tk.TclError:
                pass
        self.cv = tk.Canvas(w, bg=bg, highlightthickness=0, bd=0)
        self.cv.pack()
        x, y = self.app.overlay._on_screen(*self.pos())
        w.geometry("+%d+%d" % (x, y))
        self.cv.bind("<ButtonPress-1>", self._start)
        self.cv.bind("<B1-Motion>", self._move)
        self.cv.bind("<ButtonRelease-1>", self._stop)
        self.cv.bind("<Button-3>", self.menu)
        self._drawn = None
        if IS_WIN:
            w.after(200, self.style)

    def style(self):
        self.hwnd = win_exstyle(self.win, self.app.cfg["overlay"].get("clickthrough", False))

    def show(self, on):
        if on and not self.win:
            self.build(); self.draw()
        elif not on and self.win:
            self.win.destroy(); self.win = None

    def keep_top(self):
        if not self.win:
            return
        try:
            if IS_WIN and self.hwnd:
                import ctypes
                u = ctypes.windll.user32
                if not u.IsWindow(self.hwnd):
                    old, self.win = self.win, None
                    try:
                        old.destroy()
                    except tk.TclError:
                        pass
                    self.show(True); return
                if not u.IsWindowVisible(self.hwnd):
                    u.ShowWindow(self.hwnd, 4)
                u.SetWindowPos(self.hwnd, -1, 0, 0, 0, 0, 0x0001 | 0x0002 | 0x0010 | 0x0040)
            else:
                self.win.lift()
        except tk.TclError:
            pass

    def _start(self, e):
        self._dx, self._dy = e.x_root - self.win.winfo_x(), e.y_root - self.win.winfo_y()

    def _move(self, e):
        if not self.app.cfg["overlay"].get("locked"):
            self.win.geometry("+%d+%d" % (e.x_root - self._dx, e.y_root - self._dy))

    def _stop(self, e):
        self.app.cfg["overlay"]["pos_" + self.key] = [self.win.winfo_x(), self.win.winfo_y()]
        save_cfg(self.app.cfg)

    def menu(self, e):
        T = self.app.t
        m = tk.Menu(self.win, tearoff=0, bg=C["card"], fg=C["text"], activebackground=C["gold_dim"], activeforeground=C["gold"])
        m.add_command(label="✕ " + T("menu_hide"), command=lambda: self.app.set_module(self.key, False))
        m.add_command(label=T("menu_main"), command=self.app.show_main)
        m.tk_popup(e.x_root, e.y_root)

    def frame(self, W, H, r=16):
        cv = self.cv
        cv.delete("all"); cv._imgs = []
        cv.configure(width=W + 1, height=H + 1)
        rrect(cv, 0, 0, W, H, px(r), fill="#090c13", outline="#4a3a10")


class FeedWin(Float):
    """Kampf-Feed: die letzten Kaempfe als kleine Karten (wie in deinem Bild 1)."""
    def draw(self, force=False):
        if not self.win:
            return
        app, T = self.app, self.app.t
        cards = getattr(app, "_feed", [])
        ov = app.cfg["overlay"]
        isz, one = int(ov.get("icon_px", 32)), ov.get("hero_one", False)
        key = (tuple((c["id"], c["kp"], c.get("marches", 1), int(time.time() - c["t"]) // 60) for c in cards), app.cfg["lang"], isz, one, TRADE_FMT["v"])
        if key == self._drawn and not force:
            return
        self._drawn = key
        P, ch, gap = px(8), px(max(52, isz + 14)), px(6)
        pic_w = isz + (0 if one else int(isz * 0.75))
        W = px(190 + pic_w)
        H = P * 2 + max(1, len(cards)) * (ch + gap) - gap
        self.frame(W, H, 14)
        cv = self.cv
        if not cards:
            cv.create_text(W / 2, H / 2, text=T("feed_empty"), fill=C["dim"], font=(FONT, 9))
            return
        y = P
        for c in cards:
            col = C["bad"] if c.get("dead_march") else C["good"]          # gruen – rot nur, wenn der Marsch keine Truppen mehr hat
            rrect(cv, P, y, W - P, y + ch, px(10), fill="#111725", outline="#1c2436")
            rrect(cv, P, y, P + px(4), y + ch, px(2), fill=col, outline="")
            hero_pair(cv, app, P + px(10), y + (ch - px(isz)) / 2, c["h"], isz, one)
            x = P + px(pic_w + 18)
            res = T("defeat") if c.get("dead_march") else T("victory")
            if c.get("marches", 1) > 1:
                res += "  ×%d" % c["marches"]                # mehrere Maersche gegen denselben Gegner = eine Schlacht
            cv.create_text(x, y + px(5), text=res, anchor="nw", fill=col, font=(FONT, 10, "bold"))
            cv.create_text(W - P - px(8), y + px(6), text=app.ago(c["t"]), anchor="ne", fill=C["dim"], font=(FONT, 8))
            sub = "%s %s" % (T("kill_count"), "+" + fmt_num(c["kp"], app.cfg["lang"])) if c["pvp"] else \
                  "%s%s" % (c["enemy"] or "NPC", (" Lv %d" % c["lvl"]) if c["lvl"] else "")
            cv.create_text(x, y + px(22), text=sub, anchor="nw", fill=C["text"], font=(FONT, 9, "bold"))
            if c["pvp"]:
                have, need = c.get("parts", (1, 0))
                miss = ("  · %d/%d" % (have, need)) if need and have < need else ""
                cv.create_text(x, y + px(37), text="%s %s · %s%s" % (T("trade"), fmt_trade(c["trade"]), c["enemy"][:14], miss), anchor="nw",
                               fill=C["muted"], font=(FONT, 8))
            y += ch + gap


class MarchWin(Float):
    """Marsch-Leiste: Werte neben der Marsch-Liste im Spiel (wie in deinem Bild 2) – Werte frei waehlbar."""
    VALS = {"kp": ("⚔", "gold"), "kills": ("☠", "text"), "acc": ("★", "text"), "trade": ("⚖", None), "dead": ("💀", "text"), "n": ("#", "muted")}

    def draw(self, force=False):
        if not self.win:
            return
        app, T, ov = self.app, self.app.t, self.app.cfg["overlay"]
        rows = getattr(app, "_marches", [])
        vals = [v for v in (ov.get("march_vals") or ["kp", "trade"]) if v in self.VALS][:4]
        gapy = px(int(ov.get("march_gap", 96)))
        isz, one = int(ov.get("icon_px", 32)), ov.get("hero_one", False)
        key = (tuple((r["k"], r["kp"], r["own"], r["en"], r.get("acc"), r.get("kills"), r.get("dead"), r.get("n"), r.get("pve"), r.get("lvl"),
                      r.get("chain"), r.get("today")) for r in rows), gapy, tuple(vals), app.cfg["lang"],
               ov.get("march_icons", True), ov.get("icons", True), round(getattr(app, "_chain_avg", 0), 1), isz, one, TRADE_FMT["v"])
        if key == self._drawn and not force:
            return
        self._drawn = key
        lh = px(17)
        rh = max(px(isz + 12), px(10) + lh * max(len(vals), 3 if any(r.get("pve") for r in rows) else 1))
        pic_w = (isz + (0 if one else int(isz * 0.75))) if ov.get("march_icons", True) else 0
        W = px(pic_w + (124 if ov.get("march_icons", True) else 118))
        any_pve = any(r.get("pve") and r.get("k") for r in rows)
        top = px(26) if any_pve else 0                         # Kopf: Durchschnitts-Kette (nur wenn ein Marsch Barbaren macht)
        H = top + ((len(rows) - 1) * max(gapy, rh + px(4)) + rh if rows else rh)
        cv = self.cv
        cv.delete("all"); cv._imgs = []
        cv.configure(width=W + 1, height=H + 1)
        if not any(r["k"] for r in rows):
            rows = []
        if not rows:
            rrect(cv, 0, 0, W, rh, px(12), fill="#090c13", outline="#4a3a10")
            cv.create_text(W / 2, rh / 2, text=T("march_empty"), fill=C["dim"], font=(FONT, 8))
            return
        lang = app.cfg["lang"]
        if any_pve:
            rrect(cv, 0, 0, W, top - px(4), px(9), fill="#0d1320", outline="#1e3a52")
            cv.create_text(W / 2, (top - px(4)) / 2, text="🔗 %s %s" % (T("chain_avg"), ("%.1f" % app._chain_avg).replace(".", ",") if lang == "de" else "%.1f" % app._chain_avg),
                           fill="#7dd3fc", font=(FONT, 9, "bold"))
        for i, r in enumerate(rows):
            y = top + i * max(gapy, rh + px(4))
            if not r["k"]:                                 # leerer Platz: nur dezenter Rahmen
                rrect(cv, 0, y, W, y + rh, px(12), fill="#090c13", outline="#1c2436")
                cv.create_text(W / 2, y + rh / 2, text="–", fill=C["dim"], font=(FONT, 10, "bold"))
                cv.create_text(W - px(8), y + px(7), text=str(r["slot"]), anchor="ne", fill=C["dim"], font=(FONT, 8, "bold"))
                continue
            rrect(cv, 0, y, W, y + rh, px(12), fill="#090c13", outline="#4a3a10")
            tx0 = px(pic_w + 12)
            if ov.get("march_icons", True):                # beide Kommandanten: Haupt vorne, Zweit leicht dahinter
                hero_pair(cv, app, px(5), y + (rh - px(isz)) / 2, r["k"], isz, one)
            else:
                tx0 = px(12)
            tr = (r["en"] / r["own"]) if r["own"] else (float("inf") if r["en"] else None)
            if r.get("pve"):                                   # Barbaren-Marsch: Level, Kette, heute
                lines = [("⭐", "Lv %d" % r["lvl"] if r["lvl"] else "Lv –", "#7dd3fc", 10), ("🔗", "%s %d" % (T("chain"), r["chain"]), C["text"], 9),
                         ("🪓", "%s %s" % (fmt_num(r["today"], lang), T("today_s")), C["muted"], 9)]
                yy = y + (rh - lh * len(lines)) / 2
                for ico, txt, col, fs_ in lines:
                    cv.create_text(tx0, yy, text=("%s %s" % (ico, txt)) if ov.get("icons", True) else txt, anchor="nw", fill=col, font=(FONT, fs_, "bold"))
                    yy += lh
                cv.create_text(W - px(8), y + px(7), text=str(r["slot"]), anchor="ne", fill=C["dim"], font=(FONT, 8, "bold"))
                continue
            yy = y + (rh - lh * len(vals)) / 2
            for v in vals:
                ico, colk = self.VALS[v]
                if v == "trade":
                    txt, col = fmt_trade(tr), (C["good"] if (tr is not None and tr >= 1) else (C["bad"] if tr is not None else C["dim"]))
                elif v == "n":
                    txt, col = "%d %s" % (r.get("n", 0), T("mt_n")), C["muted"]
                else:
                    txt, col = fmt_num(r.get(v, 0), lang), C[colk]
                cv.create_text(tx0, yy, text=("%s %s" % (ico, txt)) if ov.get("icons", True) else txt, anchor="nw", fill=col,
                               font=(FONT, 10 if v == vals[0] else 9, "bold"))
                yy += lh
            cv.create_text(W - px(8), y + px(7), text=str(r["slot"]), anchor="ne", fill=C["dim"], font=(FONT, 8, "bold"))

    def menu(self, e):
        """Rechtsklick auf eine Zeile: festlegen, welcher Marsch dort steht."""
        app, T = self.app, self.app.t
        gapy = px(int(app.cfg["overlay"].get("march_gap", 96)))
        top = px(26) if any(r.get("pve") and r.get("k") for r in getattr(app, "_marches", [])) else 0
        idx = max(0, int((e.y - top) // max(gapy, px(44))))
        m = app.slot_menu(self.win, idx)
        m.add_separator()
        rows = getattr(app, "_marches", [])
        if idx < len(rows) and rows[idx].get("k"):
            m.add_command(label="🔍 " + T("md_title"), command=lambda k=rows[idx]["k"]: app.march_details(k))
        m.add_command(label="✕ " + T("menu_hide"), command=lambda: app.set_module("march", False))
        m.tk_popup(e.x_root, e.y_root)


class Toast:
    """Kurze Meldung nach jedem Kampf: gleitet rein, bleibt 3 s, blendet aus."""
    def __init__(self, app):
        self.app, self.win = app, None

    def show(self, c):
        T = self.app.t
        col = C["bad"] if c.get("dead_march") else self.app.popup_col("battle", C["good"])
        line1 = ("⚔ " + (T("defeat") if c.get("dead_march") else T("victory"))) if c["pvp"] else ("🪓 " + (c["enemy"] or "NPC") + ((" Lv %d" % c["lvl"]) if c["lvl"] else ""))
        line2 = ("+%s KP  ·  %s %s" % (fmt_num(c["kp"], self.app.cfg["lang"]), T("trade"), fmt_trade(c["trade"]))) if c["pvp"] else \
                (T("victory") if c["win"] else T("defeat"))
        if c.get("marches", 1) > 1:
            line2 += "  ·  %d %s" % (c["marches"], T("feed_marches"))
        self.pop(line1, line2, col, hero=c["h"][0])

    def _next(self):
        q = getattr(self, "queue", [])
        if q and not (self.win and time.time() - getattr(self, "_shown", 0) < 3.6):
            self.pop(*q.pop(0))

    def place_mode(self):
        """Pop-up-Position einstellen: Beispiel-Pop-up erscheint, mit der Maus ziehen, mit „Fertig“ speichern."""
        app, T = self.app, self.app.t
        if getattr(self, "_pw", None):
            try:
                self._pw.destroy()
            except tk.TclError:
                pass
        w = self._pw = tk.Toplevel(app.root)
        w.overrideredirect(True); w.attributes("-topmost", True); w.configure(bg="#0b0f19")
        f = tk.Frame(w, bg="#0b0f19", highlightthickness=2, highlightbackground=C["gold"], padx=px(14), pady=px(8)); f.pack()
        tk.Label(f, text="✥ " + T("toast_drag"), bg="#0b0f19", fg=C["gold"], font=(FONT, 13, "bold")).pack(anchor="w")
        tk.Label(f, text=T("toast_drag2"), bg="#0b0f19", fg=C["text"], font=(FONT, 10)).pack(anchor="w")
        Btn(f, "✔ " + T("done"), lambda: done(), small=True).pack(anchor="e", pady=(px(6), 0))
        sw = app.root.winfo_screenwidth()
        pos = app.cfg["overlay"].get("pos_toast") or [int((sw - px(320)) / 2), px(70)]
        w.geometry("+%d+%d" % (int(pos[0]), int(pos[1])))
        st = {}

        def start(e):
            st["d"] = (e.x_root - w.winfo_x(), e.y_root - w.winfo_y())

        def move(e):
            if "d" in st:
                w.geometry("+%d+%d" % (e.x_root - st["d"][0], e.y_root - st["d"][1]))

        def save(_e=None):
            w.update_idletasks()
            app.cfg["overlay"]["pos_toast"] = [w.winfo_rootx(), w.winfo_rooty()]; save_cfg(app.cfg)   # sofort gespeichert

        def done():
            save()
            w.destroy(); self._pw = None
            app.test_alert("battle")
        for wid in (w, f) + tuple(f.winfo_children()[:2]):
            wid.bind("<ButtonPress-1>", start); wid.bind("<B1-Motion>", move); wid.bind("<ButtonRelease-1>", save)

    def show_msg(self, icon, title, sub, col):
        """Gleiches Pop-up wie nach einem Kampf, fuer Nachrichten (z. B. Lost Kingdom S+)."""
        self.pop(title, sub, col, icon=icon)

    def pop(self, line1, line2, col, hero=None, icon=None):
        app, T = self.app, self.app.t
        if not app.ov_on():
            return
        if self.win and time.time() - getattr(self, "_shown", 0) < 3.6:      # laeuft noch eins -> danach zeigen
            q = self.__dict__.setdefault("queue", [])
            if len(q) < 4:
                q.append((line1, line2, col, hero, icon))
            app.root.after(int((3.7 - (time.time() - self._shown)) * 1000), self._next)
            return
        self._shown = time.time()
        if self.win:
            try:
                self.win.destroy()
            except tk.TclError:
                pass
        w = self.win = tk.Toplevel(app.root)
        w.overrideredirect(True); w.attributes("-topmost", True); w.attributes("-alpha", 0.0)
        bg = C["key"] if IS_WIN else C["side"]
        w.configure(bg=bg)
        if IS_WIN:
            try:
                w.attributes("-transparentcolor", C["key"])
            except tk.TclError:
                pass
        cv = tk.Canvas(w, bg=bg, highlightthickness=0); cv.pack()
        f1, f2 = fnt(FONT, 13, "bold"), fnt(FONT, 10, "bold")
        W = max(f1.measure(line1), f2.measure(line2)) + px(90)
        H = px(62)
        cv.configure(width=W + 1, height=H + 1)
        rrect(cv, 0, 0, W, H, px(18), fill="#0b0f19", outline=col, width=2)
        if hero:
            hero_badge(cv, app, px(12), (H - px(32)) / 2, hero, size=32)
        else:
            cv.create_oval(px(12), (H - px(34)) / 2, px(46), (H + px(34)) / 2, fill="#141a28", outline=col, width=2)
            cv.create_text(px(29), H / 2, text=icon or "!", fill=col, font=(FONT, 14, "bold"))
        cv.create_text(px(56), px(10), text=line1, anchor="nw", fill=col, font=f1)
        cv.create_text(px(56), px(34), text=line2, anchor="nw", fill=C["text"], font=f2)
        sw = app.root.winfo_screenwidth()
        x, y1 = int((sw - W) / 2), px(70)
        pos = app.cfg["overlay"].get("pos_toast")
        if pos:
            x, y1 = int(pos[0]), int(pos[1])
        w.geometry("+%d+%d" % (x, y1 - px(20)))
        if IS_WIN:
            w.after(50, lambda: win_exstyle(w, True))          # Pop-up ist immer durchklickbar
        a = float(app.cfg["overlay"].get("alpha_toast", app.cfg["overlay"].get("alpha", 0.9)))
        steps = 8

        def anim(i=0):
            try:
                if i <= steps:                                   # rein gleiten + einblenden
                    w.attributes("-alpha", a * i / steps); w.geometry("+%d+%d" % (x, y1 - px(20) + px(20) * i // steps))
                    w.after(25, lambda: anim(i + 1))
                elif i == steps + 1:
                    w.after(3000, lambda: anim(i + 1))
                elif i <= steps * 2 + 2:                         # ausblenden
                    w.attributes("-alpha", a * (steps * 2 + 2 - i) / steps)
                    w.after(35, lambda: anim(i + 1))
                else:
                    w.destroy()
                    if self.win is w:
                        self.win = None
            except tk.TclError:
                pass
        anim()


class Banner:
    """Warnung am oberen Bildschirmrand (z. B. Lazarett 85 %): breiter Balken, blinkt, verschwindet nach ein paar Sekunden."""
    def __init__(self, app):
        self.app, self.win = app, None

    def show(self, text, col="#f97316", secs=12):
        app = self.app
        self.hide()
        if not app.ov_on():
            return
        w = self.win = tk.Toplevel(app.root)
        w.overrideredirect(True); w.attributes("-topmost", True)
        sw = app.root.winfo_screenwidth()
        W, H = min(px(900), sw - px(40)), px(46)
        w.geometry("%dx%d+%d+%d" % (W, H, (sw - W) // 2, px(6)))
        cv = tk.Canvas(w, width=W, height=H, bg="#120a04", highlightthickness=0); cv.pack()
        cv.create_rectangle(1, 1, W - 2, H - 2, outline=col, width=3)
        tid = cv.create_text(W / 2, H / 2, text=text, fill=col, font=(FONT, 15, "bold"))
        if IS_WIN:
            w.after(50, lambda: win_exstyle(w, True))
        end = time.time() + secs

        def blink(i=0):
            try:
                if time.time() > end or self.win is not w:
                    if self.win is w:
                        self.hide()
                    return
                cv.itemconfigure(tid, fill=col if i % 2 == 0 else "#ffffff")
                w.attributes("-alpha", 0.95 if i % 2 == 0 else 0.75)
                w.after(450, lambda: blink(i + 1))
            except tk.TclError:
                pass
        blink()

    def hide(self):
        if self.win:
            try:
                self.win.destroy()
            except tk.TclError:
                pass
            self.win = None


class ScreenBorder:
    """Farbiger, blinkender Rahmen um den ganzen Bildschirm (z. B. lila, wenn Truppen im Lazarett gestorben sind). Durchklickbar."""
    def __init__(self, app):
        self.app, self.wins = app, []

    def show(self, col="#a855f7", secs=60, th=None):
        app = self.app
        self.hide()
        if not app.ov_on():
            return
        sw, sh = app.root.winfo_screenwidth(), app.root.winfo_screenheight()
        th = th or px(10)
        for g in ((sw, th, 0, 0), (sw, th, 0, sh - th), (th, sh, 0, 0), (th, sh, sw - th, 0)):
            w = tk.Toplevel(app.root)
            w.overrideredirect(True); w.attributes("-topmost", True); w.configure(bg=col)
            w.geometry("%dx%d+%d+%d" % g)
            if IS_WIN:
                w.after(50, lambda w=w: win_exstyle(w, True))
            self.wins.append(w)
        end = time.time() + secs

        def blink(i=0):
            if not self.wins:
                return
            if time.time() > end:
                self.hide(); return
            for w in self.wins:
                try:
                    w.attributes("-alpha", 0.9 if i % 2 == 0 else 0.35)
                except tk.TclError:
                    pass
            app.root.after(500, lambda: blink(i + 1))
        blink()

    def hide(self):
        for w in self.wins:
            try:
                w.destroy()
            except tk.TclError:
                pass
        self.wins = []


# ---------------------------------------------------------------- Tastenkuerzel (funktionieren auch im Spiel)
HOTKEYS = [("O", "hk_overlay"), ("R", "hk_reset"), ("D", "hk_click")]


_VK = {"F%d" % i: 0x6F + i for i in range(1, 13)}
_VK.update({"SPACE": 0x20, "TAB": 0x09, "INSERT": 0x2D, "DELETE": 0x2E, "HOME": 0x24, "END": 0x23, "PAGEUP": 0x21, "PAGEDOWN": 0x22,
            "NUM0": 0x60, "NUM1": 0x61, "NUM2": 0x62, "NUM3": 0x63, "NUM4": 0x64, "NUM5": 0x65, "NUM6": 0x66, "NUM7": 0x67, "NUM8": 0x68, "NUM9": 0x69})


def parse_hotkey(txt):
    """'Strg+Alt+O' / 'Ctrl+Shift+F5' -> (Modifier, Tastencode) oder None"""
    mods, vk = 0, None
    for p in [x.strip().upper() for x in str(txt).replace("-", "+").split("+") if x.strip()]:
        if p in ("STRG", "CTRL", "CONTROL"):
            mods |= 0x0002
        elif p == "ALT":
            mods |= 0x0001
        elif p in ("SHIFT", "UMSCHALT"):
            mods |= 0x0004
        elif p in ("WIN", "SUPER"):
            mods |= 0x0008
        elif len(p) == 1 and (p.isalnum()):
            vk = ord(p)
        elif p in _VK:
            vk = _VK[p]
        else:
            return None
    return (mods, vk) if vk else None


def hotkey_list(app):
    hk = app.cfg.get("hotkeys") or {}
    return [(hk.get(act) or "Strg+Alt+" + key, act) for key, act in HOTKEYS]


def hotkey_thread(app):
    if not IS_WIN:
        return
    try:
        import ctypes
        from ctypes import wintypes
        u, k32 = ctypes.windll.user32, ctypes.windll.kernel32
        app._hk_tid = k32.GetCurrentThreadId()
        lst = hotkey_list(app)
        ok = []
        for i, (combo, act) in enumerate(lst, start=1):
            p = parse_hotkey(combo)
            if p and u.RegisterHotKey(None, i, p[0] | 0x4000, p[1]):       # ohne Wiederholung
                ok.append(act)
        app._hotkeys_ok = ok
        msg = wintypes.MSG()
        while u.GetMessageW(ctypes.byref(msg), None, 0, 0) > 0:
            if msg.message == 0x0312 and 1 <= msg.wParam <= len(lst):        # WM_HOTKEY
                act = lst[msg.wParam - 1][1]
                app.root.after(0, lambda a=act: app.hotkey(a))
        for i in range(1, len(lst) + 1):
            u.UnregisterHotKey(None, i)
    except Exception as e:
        log("hotkeys: %s" % e)


def restart_hotkeys(app):
    """Neue Tasten aktiv machen: alten Thread beenden (WM_QUIT), neuen starten."""
    if IS_WIN and getattr(app, "_hk_tid", None):
        try:
            import ctypes
            ctypes.windll.user32.PostThreadMessageW(app._hk_tid, 0x0012, 0, 0)
        except Exception:
            pass
        time.sleep(0.1)
    threading.Thread(target=hotkey_thread, args=(app,), daemon=True).start()



# ---------------------------------------------------------------- Hauptfenster
PAGES = [("home", "🏠", "tab_start", "sub_start"), ("marches", "⚔", "tab_marches", "sub_marches"), ("ov", "🪟", "tab_ov", "sub_ov"), ("mk", "🔔", "tab_al", "sub_al"),
         ("acc", "👤", "tab_acc", "sub_acc"), ("set", "⚙", "tab_set", "sub_set"), ("conn", "🔗", "tab_conn", "sub_conn")]
NAV_HIDDEN = {"conn"}             # Verbinden erreicht man ueber die Startseite


class App:
    def __init__(self):
        global FONT, MONO, TITLE, SCALE
        self.cfg = load_cfg()
        self.session_start = time.time()
        enable_dpi(); load_private_fonts()
        self.root = tk.Tk()
        SCALE = max(1.0, self.root.winfo_fpixels("1i") / 96.0)
        FONT = pick_font(self.root, "Segoe UI Variable Text", "Segoe UI", "Inter", "Helvetica")
        MONO = pick_font(self.root, "Cascadia Mono", "Consolas", "DejaVu Sans Mono", "Courier")
        TITLE = pick_font(self.root, "Cinzel", "Trajan Pro", "Georgia", "Times")
        self.root.title("Wiz fan Club App")
        self.root.geometry("%dx%d" % (px(1000), px(660)))
        self.root.minsize(px(920), px(600))
        self.root.configure(bg=C["bg"])
        self.root.protocol("WM_DELETE_WINDOW", self.quit)
        try:
            self.root.iconbitmap(os.path.join(RES, "icon.ico"))
        except Exception:
            pass
        if IS_WIN:                                           # dunkle Titelleiste (Windows 10/11)
            try:
                import ctypes
                self.root.update()
                hwnd = ctypes.windll.user32.GetParent(self.root.winfo_id())
                v = ctypes.c_int(1)
                ctypes.windll.dwmapi.DwmSetWindowAttribute(hwnd, 20, ctypes.byref(v), ctypes.sizeof(v))
            except Exception:
                pass
        self.page = "home"
        self.started = time.time()
        self.scanner = Scanner(self)
        self.overlay = Overlay(self)
        self.icons = HeroIcons(self)
        self.feed = FeedWin(self, "feed")
        self.march = MarchWin(self, "march")
        self.toast = Toast(self)
        self.banner = Banner(self)
        self.border = ScreenBorder(self)
        self._feed, self._marches, self._march_all, self._kp_today = [], [], {}, 0
        self._flash = ("", 0)
        self.build_ui()
        threading.Thread(target=self.scanner.loop, daemon=True).start()
        if self.cfg.get("token"):
            threading.Thread(target=self.refresh_me, daemon=True).start()
        self._rok_up = rok_running(self.cfg.get("game_folders", [])) if self.cfg.get("rok_only") else True
        on = self.ov_on()
        self.overlay.show(on and self.cfg["overlay"].get("show", True))
        self.feed.show(on and self.cfg["overlay"].get("feed", True))
        self.march.show(on and self.cfg["overlay"].get("march", False))
        threading.Thread(target=hotkey_thread, args=(self,), daemon=True).start()
        if self.cfg.get("rok_only") and not self._rok_up and not START_LINK:
            self.root.withdraw()                           # wartet unsichtbar, bis Rise of Kingdoms startet
            self._hidden_for_rok = True
        elif self.cfg.get("start_min") and not START_LINK:
            self.root.iconify()
        register_protocol()
        threading.Thread(target=self.ipc_server, daemon=True).start()
        if START_LINK:
            self.root.after(800, lambda: self.handle_link(START_LINK))
        self.tick()

    # ---------- Ein-Klick-Verbindung ----------
    def ipc_server(self):
        try:
            srv = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            srv.bind(("127.0.0.1", IPC_PORT)); srv.listen(2)
        except OSError as e:
            log("ipc: %s" % e); return
        while True:
            try:
                c, _ = srv.accept()
                with c:
                    msg = c.recv(2000).decode("utf-8", "replace")
                    if msg.startswith("ver:"):
                        ver, _s, msg = msg[4:].partition("|")
                        if ver != APP_VERSION:          # andere (neuere) Version gestartet -> Platz machen
                            c.sendall(b"quit")
                            self.root.after(0, self.quit)
                            srv.close()
                            return
                        c.sendall(b"ok")
                self.root.after(0, lambda m=msg: self.handle_link(m))
            except Exception:
                time.sleep(0.5)

    def handle_link(self, msg):
        self.show_main()
        try:
            self.root.attributes("-topmost", True); self.root.after(300, lambda: self.root.attributes("-topmost", False))
        except tk.TclError:
            pass
        p = parse_link(msg)
        if not p:
            if str(msg).lower().startswith(PROTO + ":"):
                messagebox.showerror(self.t("err"), self.t("link_bad"))
            return
        code, site = p
        if not messagebox.askyesno("Wiz fan Club", self.t("link_ask", s=site)):
            return
        self.cfg["api_base"] = site
        dev = (self.cfg.get("device_name") or self.default_dev_name())[:40]
        self.cfg["device_name"] = dev; save_cfg(self.cfg)
        self.page = "conn"; self.render(); self.flash(self.t("link_busy"))

        def done(d, err):
            if err:
                messagebox.showerror(self.t("err"), str(err)); self.render(); return
            self.cfg["token"] = d["token"]; self.cfg["user_name"] = (d.get("user") or {}).get("name", "")
            save_cfg(self.cfg); self.page = "acc"
            self.flash(self.t("link_ok", n=self.cfg["user_name"] or "?"))
            self.run_bg(self.refresh_me)
        self.run_bg(lambda: self.api("pair", {"code": code, "device_name": dev}, auth=False), done)

    def auto_bind_main(self):
        """Profil-ID gefunden und noch nicht gebunden -> automatisch als Main binden."""
        prof = str(self.cfg.get("profile_gov") or "")
        if not prof or not prof.isdigit() or not self.cfg.get("token"):
            return
        if any(str(x["governor_id"]) == prof for x in self.cfg.get("links", [])):
            return
        if int(prof) not in self.scanner.owners:
            return
        name = (self.scanner.owners.get(int(prof)) or {}).get("name", "")
        try:
            d = self.api("link", {"governor_id": prof, "gov_name": name, "kind": "main"})
            self.cfg["links"] = d.get("links", []); save_cfg(self.cfg)
        except Exception as e:
            log("auto main: %s" % e)

    def t(self, k, **kw):
        s = TXT.get(self.cfg.get("lang", "de"), TXT["de"]).get(k, k)
        return s.format(**kw) if kw else s

    # ---------- API ----------
    def api(self, action, body=None, auth=True):
        url = self.cfg["api_base"].rstrip("/") + "/api/uploader?action=" + action
        data = json.dumps(body).encode("utf-8") if body is not None else None
        req = urllib.request.Request(url, data=data, method="POST" if data else "GET")
        req.add_header("Content-Type", "application/json")
        req.add_header("User-Agent", "WizFanClubApp/" + APP_VERSION)
        if auth and self.cfg.get("token"):
            req.add_header("X-Device-Token", self.cfg["token"])
        try:
            with urllib.request.urlopen(req, timeout=30) as r:
                return json.loads(r.read().decode("utf-8") or "{}")
        except urllib.error.HTTPError as e:
            try:
                msg = json.loads(e.read().decode("utf-8")).get("error")
                if isinstance(msg, dict):                    # Vercel-Fehler {"code":..., "message":...}
                    msg = msg.get("message") or str(msg)
            except Exception:
                msg = None
            if e.code == 401 and msg and "protected" in str(msg).lower():
                msg = self.t("err_protected")
            if e.code == 404 and not msg:
                msg = self.t("err_404", u=self.cfg["api_base"])
            raise RuntimeError(msg or "HTTP %d" % e.code)
        except urllib.error.URLError as e:
            raise RuntimeError(str(e.reason))

    def run_bg(self, fn, done=None):
        def w():
            try:
                res = fn()
                if done:
                    self.root.after(0, lambda: done(res, None))
            except Exception as e:
                log("api: %s" % e)
                if done:
                    self.root.after(0, lambda e=e: done(None, e))
        threading.Thread(target=w, daemon=True).start()

    def refresh_me(self):
        try:
            d = self.api("me")
            self.cfg["user_name"] = (d.get("user") or {}).get("name", "")
            self.cfg["profile_gov"] = str((d.get("user") or {}).get("profile_gov") or "")
            self.cfg["links"] = d.get("links", [])
            save_cfg(self.cfg)
            self.auto_bind_main()
        except Exception as e:
            log("me: %s" % e)
            if "neu koppeln" in str(e):
                self.cfg["token"] = ""; save_cfg(self.cfg)
        self.root.after(0, self.render)

    # ---------- Grundgeruest ----------
    def build_ui(self):
        for c in self.root.winfo_children():
            if not isinstance(c, tk.Toplevel):
                c.destroy()
        T = self.t
        side = tk.Frame(self.root, bg=C["side"], width=px(220))
        side.pack(side="left", fill="y"); side.pack_propagate(False)
        tk.Frame(self.root, bg=C["line"], width=1).pack(side="left", fill="y")
        head = tk.Frame(side, bg=C["side"]); head.pack(fill="x", padx=px(18), pady=(px(22), px(22)))
        lg = tk.Canvas(head, width=px(44), height=px(44), bg=C["side"], highlightthickness=0); lg.pack(side="left")
        draw_logo(lg, px(44))
        tt = tk.Frame(head, bg=C["side"]); tt.pack(side="left", padx=(px(10), 0))
        tk.Label(tt, text="WIZ FAN CLUB", bg=C["side"], fg=C["gold"], font=(TITLE, 13, "bold")).pack(anchor="w")
        tk.Label(tt, text="Battle App · v" + APP_VERSION, bg=C["side"], fg=C["dim"], font=(FONT, 8)).pack(anchor="w")
        self.nav = {}
        for key, ico, lab, _sub in PAGES:
            if key in NAV_HIDDEN:
                continue
            cv = tk.Canvas(side, height=px(40), bg=C["side"], highlightthickness=0, cursor="hand2")
            cv.pack(fill="x", padx=px(12), pady=px(2))
            cv.bind("<ButtonRelease-1>", lambda e, k=key: self.go(k))
            cv.bind("<Enter>", lambda e, k=key: self._hover(k, True))
            cv.bind("<Leave>", lambda e, k=key: self._hover(k, False))
            cv.bind("<Configure>", lambda e, k=key: self._draw_nav(k))
            self.nav[key] = {"cv": cv, "txt": "%s   %s" % (ico, T(lab)), "hover": False}
        foot = Card(side, pad=12, fill=C["card"], radius=14)
        foot.pack(side="bottom", fill="x", padx=px(12), pady=px(14))
        self.side_user = tk.Label(foot.body, text="", bg=C["card"], fg=C["text"], font=(FONT, 9, "bold"), anchor="w", justify="left", wraplength=px(170))
        self.side_user.pack(anchor="w")
        self.status = tk.Label(foot.body, text="", bg=C["card"], fg=C["dim"], font=(FONT, 8), anchor="w", justify="left", wraplength=px(170))
        self.status.pack(anchor="w", pady=(px(4), 0))
        self.main = tk.Frame(self.root, bg=C["bg"])
        self.main.pack(side="left", fill="both", expand=True)
        self.render()

    def _draw_nav(self, k):
        n = self.nav[k]; cv = n["cv"]
        w, h = cv.winfo_width(), int(cv["height"])
        if w < 4:
            return
        act = k == self.page
        cv.delete("all")
        if act or n["hover"]:
            rrect(cv, 1, 1, w - 1, h - 1, px(12), fill=C["gold_dim"] if act else C["card"], outline=C["gold2"] if act else "")
        cv.create_text(px(16), h / 2, text=n["txt"], anchor="w", fill=C["gold"] if act else (C["text"] if n["hover"] else C["muted"]), font=(FONT, 10, "bold"))

    def _hover(self, k, on):
        self.nav[k]["hover"] = on; self._draw_nav(k)

    def go(self, page):
        self.page = page
        self.render()

    def render(self):
        if not hasattr(self, "main"):
            return
        for k in self.nav:
            self._draw_nav(k)
        if self.cfg.get("token"):
            self.side_user.configure(text="● " + (self.cfg.get("user_name") or "?"), fg=C["good"])
        else:
            self.side_user.configure(text="○ " + self.t("not_conn").split(".")[0], fg=C["muted"])
        state = (self.page, getattr(self, "mk_sub", ""), getattr(self, "ov_sub", ""))
        keep = []
        if state == getattr(self, "_rstate", None):          # gleiche Seite neu gezeichnet -> nicht nach oben springen
            for sc in Scroll._live:
                try:
                    if sc.winfo_exists() and str(sc).startswith(str(self.main)):
                        keep.append(sc.cv.yview()[0])
                except tk.TclError:
                    pass
        self._rstate = state
        for c in self.main.winfo_children():
            c.destroy()
        key, ico, lab, sub = next(p for p in PAGES if p[0] == self.page)
        hd = tk.Frame(self.main, bg=C["bg"]); hd.pack(fill="x", padx=px(30), pady=(px(26), px(14)))
        tk.Label(hd, text=self.t(lab), bg=C["bg"], fg=C["text"], font=(FONT, 20, "bold")).pack(anchor="w")
        tk.Label(hd, text=self.t(sub), bg=C["bg"], fg=C["muted"], font=(FONT, 10)).pack(anchor="w", pady=(px(2), 0))
        tk.Frame(hd, bg=C["gold2"], height=2, width=px(48)).pack(anchor="w", pady=(px(10), 0))
        if key in ("acc", "mk", "marches"):           # diese Seiten scrollen selbst
            body = tk.Frame(self.main, bg=C["bg"]); body.pack(fill="both", expand=True, padx=px(30), pady=(0, px(22)))
        else:                                         # alle anderen: ganze Seite scrollbar, nichts wird abgeschnitten
            sc = Scroll(self.main, C["bg"]); sc.pack(fill="both", expand=True, padx=(px(30), px(8)), pady=(0, px(12)))
            body = tk.Frame(sc.inner, bg=C["bg"]); body.pack(fill="both", expand=True, padx=(0, px(22)), pady=(0, px(10)))
        getattr(self, "page_" + key)(body)
        self._owners_keys = tuple(sorted(self.scanner.owners))
        if keep and any(keep):
            def restore(keep=keep):
                scs = [sc for sc in Scroll._live if sc.winfo_exists() and str(sc).startswith(str(self.main))]
                self.main.update_idletasks()
                for sc, f in zip(scs, keep):
                    sc.cv.configure(scrollregion=sc.cv.bbox("all")); sc.cv.yview_moveto(f)
            restore()

    # ---------- Seiten ----------
    def page_home(self, body):
        T, ov = self.t, self.cfg["overlay"]
        if not self.cfg.get("token"):                    # noch nicht verbunden -> direkt das Verbinden zeigen
            self.page_conn(body); return
        # --- Status
        c = Card(body, T("card_status")); c.pack(fill="x")
        self.home_status = tk.Label(c.body, text="", bg=C["card"], fg=C["text"], font=(FONT, 10), justify="left", anchor="w")
        self.home_status.pack(anchor="w", fill="x")
        r = tk.Frame(c.body, bg=C["card"]); r.pack(fill="x", pady=(px(10), 0))
        Btn(r, "📊  " + T("open_site"), self.open_site).pack(side="left")
        Btn(r, "🔗 " + T("tab_conn"), lambda: self.go("conn"), "ghost", small=True).pack(side="left", padx=px(8))
        # --- 3 kurze Zahlen
        tiles = tk.Frame(body, bg=C["bg"]); tiles.pack(fill="x", pady=(px(12), 0)); tl = []
        self.home = {}
        for k, ico in (("m_kp", "⚔"), ("m_kp_trade", "⚖"), ("m_barb", "🪓")):
            cc = Card(tiles, pad=14, radius=16); tl.append(cc)
            tk.Label(cc.body, text="%s  %s" % (ico, T(k).upper()), bg=C["card"], fg=C["muted"], font=(FONT, 8, "bold")).pack(anchor="w")
            v = tk.Label(cc.body, text="–", bg=C["card"], fg=C["text"], font=(FONT, 20, "bold")); v.pack(anchor="w", pady=(px(2), 0))
            self.home[k] = v
        responsive(tiles, tl, 3, 600)
        # --- Overlay schnell schalten
        c = Card(body, "🪟 " + T("h_quick")); c.pack(fill="x", pady=(px(12), 0))
        g = tk.Frame(c.body, bg=C["card"]); g.pack(fill="x")
        on = ov.get("all_on", True)
        vm = tk.BooleanVar(value=on)
        Toggle(g, T("all_on"), vm, lambda: self.set_master(vm.get())).grid(row=0, column=0, sticky="w", padx=(0, px(24)), pady=px(3))
        vc = tk.BooleanVar(value=ov.get("clickthrough", False))
        Toggle(g, T("mod_click"), vc, lambda: self.set_clickthrough(vc.get())).grid(row=0, column=1, sticky="w", pady=px(3))
        tk.Label(c.body, text=T("all_on_info") if on else T("all_off_info"), bg=C["card"], fg=C["good"] if on else C["bad"],
                 font=(FONT, 9, "bold"), wraplength=px(640), justify="left").pack(anchor="w", pady=(px(6), 0))
        Btn(c.body, "🪟 " + T("ov_settings"), lambda: self.go("ov"), "ghost", small=True).pack(anchor="w", pady=(px(6), 0))
        tk.Label(c.body, text="⌨ " + "  ·  ".join("%s %s" % (cmb, T(a + "_l")) for cmb, a in hotkey_list(self)), bg=C["card"], fg=C["dim"],
                 font=(FONT, 8), justify="left").pack(anchor="w", pady=(px(8), 0))
        self.update_home()

    def update_home(self):
        if self.page != "home" or not getattr(self, "home", None) or not getattr(self, "home_status", None):
            return
        vals = getattr(self, "_vals", {}) or {}
        tone = vals.get("_tone", {})
        try:
            for k, lb in self.home.items():
                col = C["good"] if tone.get(k) == "good" else C["bad"] if tone.get(k) == "bad" else (C["gold"] if k == "m_kp" else C["text"])
                txt = vals.get(k, "–")
                if lb.cget("text") != txt or lb.cget("fg") != col:
                    lb.configure(text=txt, fg=col)
            T = self.t
            act = self.scanner.active[0]
            up = getattr(self, "_last_upload", None)
            lines = ["●  " + T("connected", n=self.cfg.get("user_name") or "?"),
                     "⚡  " + T("h_active", n=self.acc_name(act) if act else "–"),
                     "📤  " + (T("h_uploaded", t=self.ago(up[0]), n=up[1]) if up else T("h_upload_none" if self.cfg.get("upload") else "h_upload_off")),
                     "📨  " + (self.scanner.status or "…")]
            txt = "\n".join(lines)
            if self.home_status.cget("text") != txt:
                self.home_status.configure(text=txt)
        except tk.TclError:
            pass

    # ---------- Seite „Maersche“ ----------
    def range_since(self, rk):
        now = time.time()
        return {"r_session": self.session_start, "r_today": datetime.combine(date.today(), datetime.min.time()).timestamp(),
                "r_24h": now - 86400, "r_7d": now - 7 * 86400, "r_30d": now - 30 * 86400}.get(rk, 0)

    def page_marches(self, body):
        T, lang = self.t, self.cfg["lang"]
        rk = self.cfg.get("marches_range", "r_7d")
        top = tk.Frame(body, bg=C["bg"]); top.pack(fill="x", pady=(0, px(12)))
        Seg(top, [("r_session", T("r_session")), ("r_today", T("r_today")), ("r_7d", T("r_7d").replace("Letzte ", "").replace("Last ", "")),
                  ("r_30d", T("r_30d")), ("r_all", T("r_all"))], rk,
            lambda v: (self.cfg.__setitem__("marches_range", v), save_cfg(self.cfg), self.render())).pack(side="left")
        self.focus_bar(body, C["bg"]).pack(fill="x", pady=(0, px(12)))
        with self.scanner.lock:
            bs = list(self.scanner.battles.values())
        ids = getattr(self, "_ids_cur", None)
        since = self.range_since(rk)
        acc_since = (self.cfg.get("acc_since") or {}).get(str(self.focus_id())) if self.focus_id() else None
        if acc_since and acc_since > since:
            since = acc_since
        ms = march_stats(bs, ids, since)
        rows = [dict(v, k=k) for k, v in ms.items() if v["n"] > 0]
        rows.sort(key=lambda r: -r["kp"])
        tot = {k: sum(r[k] for r in rows) for k in ("kp", "kills", "acc", "dead", "sev", "edead", "esev", "own", "en", "n")}
        F = lambda v: fmt_num(v, lang)
        ratio = lambda a, b: ("%.2f" % (a / b)).replace(".", "," if lang == "de" else ".") if b else "–"
        kp_ = tk.Frame(body, bg=C["bg"]); kp_.pack(fill="x")
        cards = [kpi(kp_, T("mt_total_kp"), F(tot["kp"]), T("mt_meta_kp", n=tot["n"], m=len(rows)), value_col=C["gold"]),
                 kpi(kp_, T("mt_dead"), F(tot["dead"]), "%s %s" % (ratio(tot["edead"], tot["dead"]), T("mt_ratio")),
                     C["good"] if tot["edead"] >= tot["dead"] else C["bad"]),
                 kpi(kp_, T("mt_kills"), F(tot["kills"]), "%s %s" % (ratio(tot["en"], tot["own"]), T("mt_trade_l")),
                     C["good"] if tot["en"] >= tot["own"] else C["bad"]),
                 kpi(kp_, T("mt_acc"), F(tot["acc"]), "%s %s" % (F(tot["kp"] / tot["n"]) if tot["n"] else "–", T("mt_per_fight")))]
        responsive(kp_, cards, 4, 760)
        hd = tk.Frame(body, bg=C["bg"]); hd.pack(fill="x", pady=(px(16), px(8)))
        tk.Label(hd, text=T("tab_marches"), bg=C["bg"], fg=C["text"], font=(FONT, 13, "bold")).pack(side="left")
        tk.Label(hd, text=T("mt_hint"), bg=C["bg"], fg=C["dim"], font=(FONT, 8)).pack(side="right")
        self.mtab = MarchTable(body, self)
        self.mtab.pack(fill="both", expand=True)
        self.mtab.set(rows)

    def page_conn(self, body):
        T = self.t
        o, c = card(body, T("card_status")); o.pack(fill="x")
        if self.cfg.get("token"):
            tk.Label(c, text="● " + T("connected", n=self.cfg.get("user_name") or "?"), bg=C["card"], fg=C["good"], font=(FONT, 12, "bold")).pack(anchor="w")
            chips = tk.Frame(c, bg=C["card"]); chips.pack(anchor="w", pady=(8, 4))
            links = self.cfg.get("links", [])
            for x in links:
                tk.Label(chips, text="%s · %s · %s" % (self.t("k_" + (x.get("kind") or "alt")), x.get("gov_name") or "?", x["governor_id"]), bg=C["gold_dim"], fg=C["gold"],
                         font=(FONT, 9, "bold"), padx=8, pady=3).pack(side="left", padx=(0, 6))
            if not links:
                tk.Label(chips, text=T("unlinked_hint"), bg=C["card"], fg=C["muted"], font=(FONT, 9)).pack(side="left")
            Btn(c, T("disconnect"), self.disconnect, "danger", small=True).pack(anchor="w", pady=(8, 0))
        else:
            tk.Label(c, text="○ " + T("not_conn"), bg=C["card"], fg=C["muted"], font=(FONT, 10), wraplength=560, justify="left").pack(anchor="w")
        o, c = card(body, T("card_new")); o.pack(fill="x", pady=14)
        left = tk.Frame(c, bg=C["card"]); left.pack(side="left", fill="y")
        tk.Label(left, text=T("steps1"), bg=C["card"], fg=C["gold"], font=(FONT, 10, "bold"), justify="left", wraplength=px(430)).pack(anchor="w", pady=(0, px(8)))
        tk.Label(left, text=T("steps"), bg=C["card"], fg=C["muted"], font=(FONT, 9), justify="left").pack(anchor="w")
        tk.Label(left, text=T("site"), bg=C["card"], fg=C["muted"], font=(FONT, 8, "bold")).pack(anchor="w", pady=(14, 2))
        self.v_site = tk.StringVar(value=self.cfg["api_base"])
        r = tk.Frame(left, bg=C["card"]); r.pack(anchor="w")
        entry(r, self.v_site, 30).pack(side="left", ipady=5)
        Btn(r, T("open_page") + " ↗", self.open_page, "ghost", small=True).pack(side="left", padx=8)
        right = tk.Frame(c, bg=C["card"]); right.pack(side="right", padx=(20, 0))
        tk.Label(right, text=T("dev_name").upper(), bg=C["card"], fg=C["muted"], font=(FONT, 8, "bold")).pack(anchor="w")
        self.v_dev = tk.StringVar(value=self.cfg.get("device_name") or self.default_dev_name())
        entry(right, self.v_dev, 18).pack(fill="x", ipady=4, pady=(2, 8))
        tk.Label(right, text=T("code").upper(), bg=C["card"], fg=C["muted"], font=(FONT, 8, "bold")).pack(anchor="w")
        self.v_code = tk.StringVar()
        e = entry(right, self.v_code, 8, big=True, center=True); e.pack(ipady=6, pady=4)
        e.bind("<Return>", lambda _e: self.pair())
        self.v_code.trace_add("write", lambda *_: self.v_code.get() != self.v_code.get().upper()[:6] and self.v_code.set(self.v_code.get().upper()[:6]))
        self.btn_pair = Btn(right, T("pair"), self.pair, width=e.winfo_reqwidth()); self.btn_pair.pack(pady=(px(6), 0))

    def page_acc(self, body):
        T = self.t
        tk.Label(body, text=T("acc_info"), bg=C["bg"], fg=C["muted"], font=(FONT, 10), wraplength=640, justify="left").pack(anchor="w")
        tk.Label(body, text=T("kinds_info"), bg=C["bg"], fg=C["dim"], font=(FONT, 8), wraplength=640, justify="left").pack(anchor="w", pady=(2, 0))
        prof = str(self.cfg.get("profile_gov") or "")
        if self.cfg.get("token"):
            tk.Label(body, text=T("prof_id", id=prof) if prof else T("prof_none"), bg=C["bg"], fg=C["gold"] if prof else C["bad"],
                     font=(FONT, 9, "bold"), wraplength=640, justify="left").pack(anchor="w", pady=(6, 0))
        if self.cfg.get("token"):                     # neue ID von Hand (z. B. Pilot-Account, der noch keine Mails hat)
            ar = tk.Frame(body, bg=C["bg"]); ar.pack(fill="x", pady=(px(10), 0))
            tk.Label(ar, text=T("add_id"), bg=C["bg"], fg=C["muted"], font=(FONT, 9)).pack(side="left", padx=(0, px(8)))
            self.v_addid = tk.StringVar()
            entry(ar, self.v_addid, 12).pack(side="left")
            Btn(ar, T("add_btn"), lambda: self.add_id("pilot"), small=True).pack(side="left", padx=(px(8), 0))
            Btn(ar, T("add_alt"), lambda: self.add_id("alt"), "ghost", small=True).pack(side="left", padx=(px(6), 0))
        sc = Scroll(body, C["bg"]); sc.pack(fill="both", expand=True, pady=(px(10), 0))
        links = {str(x["governor_id"]): x for x in self.cfg.get("links", [])}
        act = self.scanner.active[0]
        with self.scanner.lock:
            owners = dict(self.scanner.owners)
        for gid, x in links.items():                 # gebunden, aber noch keine Mails auf diesem PC
            if gid.isdigit() and int(gid) not in owners:
                owners[int(gid)] = {"name": x.get("gov_name") or "", "mails": 0, "last": 0}
        if not owners:
            tk.Label(sc.inner, text=T("no_acc"), bg=C["bg"], fg=C["dim"], font=(FONT, 10), wraplength=560, justify="left").pack(anchor="w", pady=20)
        kcol = {"main": C["gold"], "alt": "#7dd3fc", "pilot": "#c4b5fd"}
        for pid, o in sorted(owners.items(), key=lambda kv: (str(kv[0]) != prof, -kv[1].get("last", 0))):
            ln = links.get(str(pid))
            kind = (ln or {}).get("kind") or ("alt" if ln else None)
            rc = Card(sc.inner, pad=10, border=kcol.get(kind, C["line"]) if ln else C["line"], radius=14)
            rc.pack(fill="x", pady=px(4), padx=(0, px(6)))
            row = rc.body
            name = o.get("name") or "?"
            A = px(42)
            av = tk.Canvas(row, width=A, height=A, bg=C["card"], highlightthickness=0); av.pack(side="left", padx=(px(4), px(12)))
            col = kcol.get(kind, C["muted"]) if ln else C["muted"]
            av.create_oval(2, 2, A - 2, A - 2, fill=C["card2"], outline=col, width=2)
            av.create_text(A / 2, A / 2, text=name[:1].upper(), fill=col, font=(FONT, 13, "bold"))
            info = tk.Frame(row, bg=C["card"]); info.pack(side="left", fill="x", expand=True)
            top = tk.Frame(info, bg=C["card"]); top.pack(anchor="w")
            tk.Label(top, text=name, bg=C["card"], fg=C["text"], font=(FONT, 11, "bold")).pack(side="left")
            if act and int(act) == int(pid):
                tk.Label(top, text="⚡ " + T("now_active"), bg=C["card"], fg=C["good"], font=(FONT, 8, "bold")).pack(side="left", padx=(px(8), 0))
            if ln:
                tk.Label(top, text=T("k_" + kind), bg=C["card2"], fg=kcol[kind], font=(FONT, 8, "bold"), padx=6).pack(side="left", padx=8)
                if ln.get("status") == "pending":
                    tk.Label(top, text="⏳ " + T("pending"), bg=C["card"], fg="#fbbf24", font=(FONT, 8, "bold")).pack(side="left")
            last = datetime.fromtimestamp(o["last"]).strftime("%d.%m.%Y %H:%M") if o.get("last") else "–"
            tk.Label(info, text="ID %s  ·  %s" % (pid, T("reports", n=o.get("mails", 0), t=last)), bg=C["card"], fg=C["dim"], font=(FONT, 9)).pack(anchor="w")
            if ln and ln.get("status") == "pending":
                tk.Label(info, text=T("pending_info"), bg=C["card"], fg=C["dim"], font=(FONT, 8)).pack(anchor="w")
            btns = tk.Frame(row, bg=C["card"]); btns.pack(side="right", padx=px(4))
            st_ = (self.cfg.get("acc_since") or {}).get(str(pid))
            lab = "⏱ %s %s" % (T("since_acc"), datetime.fromtimestamp(st_).strftime("%d.%m. %H:%M") if st_ else T("since_none"))
            sb = Btn(btns, lab, lambda p=pid: None, "ghost" if not st_ else "gold", small=True)
            sb.pack(side="right", padx=(px(6), 0))
            sb._cmd = lambda p=pid, w=sb: self.since_menu(p, w)
            if ln:
                Btn(btns, T("unbind"), lambda p=pid: self.bind_acc(p, False), "ghost", small=True).pack(side="right")
            elif prof and str(pid) == prof:
                Btn(btns, "★ " + T("b_main"), lambda p=pid: self.bind_acc(p, True, "main"), small=True).pack(side="right")
            else:
                Btn(btns, T("b_pilot"), lambda p=pid: self.bind_acc(p, True, "pilot"), "ghost", small=True).pack(side="right", padx=(6, 0))
                Btn(btns, T("b_alt"), lambda p=pid: self.bind_acc(p, True, "alt"), small=True).pack(side="right")

    def ago(self, t):
        d = max(0, time.time() - (t or 0))
        if d < 3600:
            return self.t("mk_ago_m", n=int(d // 60))
        if d < 86400:
            return self.t("mk_ago_h", n=int(d // 3600))
        return self.t("mk_ago_d", n=int(d // 86400))

    # ---------- Overlay-Module ----------
    def update_modules(self, ids, since, changed):
        bs = self.scanner.battle_list()
        ov = self.cfg["overlay"]
        mr = ov.get("march_reset", "last")
        gap = 0
        cards = recent_cards(bs, ids, int(ov.get("feed_n", 4)), not ov.get("feed_pve"), int(ov.get("feed_settle", 0)), ov.get("feed_merge", False))
        newest = cards[0] if cards else None
        old = self._feed[0]["id"] if self._feed else None
        self._feed = cards
        if newest and old and newest["id"] != old and newest["t"] >= self.started - 60 and self.popup_on("battle"):
            hk = tuple(newest.get("h") or ())                    # Pop-up nach jedem neuen Bericht (gleicher Marsch hoechstens 1x pro Minute)
            last = getattr(self, "_toast_last", {})
            if time.time() - last.get(hk, 0) > 60:
                last[hk] = time.time(); self._toast_last = last
                self.toast.show(newest)
        ms = march_stats(bs, ids, since, mr == "last", ov.get("pvp_only", True))
        if mr == "last":                       # "zuletzt benutzt" trotzdem aus allen Berichten (fuer die Auto-Reihenfolge)
            for k, v in pvp_last(bs, ids).items():
                if k in ms:
                    ms[k]["last"] = max(ms[k]["last"], v)
        self._march_all = ms
        day = datetime.combine(date.today(), datetime.min.time()).timestamp()
        pve, self._chain_avg = pve_stats(bs, ids, 0, day)
        pl = pvp_last(bs, ids)
        self._pve = pve
        kind = ov.get("march_kind", "auto")
        if kind == "pve":
            auto = [k for k, _v in sorted(pve.items(), key=lambda kv: -kv[1]["last"])]
        elif kind == "auto":
            lastp = dict(pl)
            for k, v in pve.items():
                lastp[k] = max(lastp.get(k, 0), v["last"])
            auto = [k for k, _v in sorted(lastp.items(), key=lambda kv: -kv[1])]
        else:
            auto = [k for k, _v in sorted(ms.items(), key=lambda kv: -kv[1]["last"])]
        slots = (ov.get("march_slots") or [None] * 7)
        rows, used = [], set()
        n = int(ov.get("march_n", 4))
        for i in range(n):
            k = tuple(slots[i]) if i < len(slots) and slots[i] else None
            if not k:
                k = next((a for a in auto if a not in used and tuple(a) not in [tuple(x) for x in slots if x]), None)
            if not k:
                rows.append({"k": None, "kp": 0, "own": 0, "en": 0, "kills": 0, "acc": 0, "dead": 0, "n": 0, "slot": n - i})
                continue                                   # leerer Platz bleibt stehen -> nichts rutscht hoch
            used.add(k)
            st = ms.get(tuple(k), {})
            pv = pve.get(tuple(k))
            is_pve = kind == "pve" or (kind == "auto" and pv and pv["last"] > pl.get(tuple(k), 0))
            rows.append({"k": tuple(k), "kp": st.get("kp", 0), "own": st.get("own", 0), "en": st.get("en", 0), "kills": st.get("kills", 0),
                         "acc": st.get("acc", 0), "dead": st.get("dead", 0), "n": st.get("n", 0), "slot": n - i,
                         "pve": bool(is_pve), "lvl": pv["lvl"] if pv else 0, "chain": pv["chain"] if pv else 0, "today": pv["today"] if pv else 0})
        self._marches = rows
        self.update_exp(bs, ids)
        self._kp_today = kp_since(bs, ids, day)
        self._acc_today = acc_since(bs, ids, day)

    def update_exp(self, bs, ids):
        """50 % Army Expansion erkennen: Truppen beim Start des neuesten Berichts (letzte 3 Std.) >= Grenze."""
        ac = self.cfg["alerts"]
        lim = int(ac.get("exp_limit", 400000))
        last = max((b for b in bs if b.get("init") and (ids is None or b["pid"] in ids) and time.time() - b["t"] < 3 * 3600),
                   key=lambda b: (b["t"], b.get("mt", 0)), default=None)
        old = getattr(self, "_exp", None)
        self._exp = (last["init"] >= lim, last["init"], last["t"]) if last else None
        if old and self._exp and old[0] and not self._exp[0] and ac.get("exp_alert", True) and self._exp[2] >= self.started:
            self.overlay.add_alert({"icon": "🪖", "title": self.t("exp_gone").upper(), "sub": self.t("exp_troops", n=fmt_num(self._exp[1], self.cfg["lang"])),
                                    "tone": "bad", "blink": True, "until": time.time() + 60 * float(ac.get("dur_army", ac.get("show_min", 10)))})
            play_sound(ac.get("buff_sound", "sirene"), ac.get("volume", 80))
            self.popup("exp", "🪖", self.t("exp_gone"), self.t("exp_troops", n=fmt_num(self._exp[1], self.cfg["lang"])))

    def set_module(self, key, on):
        self.cfg["overlay"][key] = on; save_cfg(self.cfg)
        {"feed": self.feed, "march": self.march}.get(key, self.overlay).show(on and self.ov_on())

    def set_march_slot(self, idx, k):
        sl = self.cfg["overlay"].setdefault("march_slots", [None] * 7)
        while len(sl) < 7:
            sl.append(None)
        if k:                                           # gleicher Marsch nicht auf zwei Plaetzen
            for j in range(len(sl)):
                if sl[j] and tuple(sl[j]) == tuple(k):
                    sl[j] = None
        sl[idx] = list(k) if k else None
        save_cfg(self.cfg); self._sig = None
        self.update_modules(getattr(self, "_ids_cur", None), getattr(self, "_since_cur", 0), True)
        self.march.draw(True)
        if self.page == "ov" and getattr(self, "ov_sub", "") == "march":
            self.render()

    def march_details(self, k):
        """Alle Berichte eines Marsches: Zeit, Gegner, KP, PvP?, und welches Gefecht. Zum Vergleichen mit dem Spiel."""
        T, ov, lang = self.t, self.cfg["overlay"], self.cfg["lang"]
        k = tuple(k)
        ids = getattr(self, "_ids_cur", None)
        with self.scanner.lock:
            bs = [b for b in self.scanner.battles.values() if tuple(b.get("h") or ()) == k and (ids is None or b["pid"] in ids) and not b.get("arch")]
        bs.sort(key=lambda b: (b["t"], b.get("mt", 0)))
        day = datetime.combine(date.today(), datetime.min.time()).timestamp()
        order = {}                                       # Hauptbericht -> Bericht-Nr. (wie im Spiel: Teil-Berichte gehoeren dazu)
        sid = streak_ids(bs)
        gk = lambda b: sid.get(b["id"]) or b.get("par") or b["id"]
        for b in bs:
            order.setdefault(gk(b), len(order) + 1)
        rows = []
        for b in bs:
            g = order[gk(b)]
            kp_all = sum(f[1] for f in b["fights"]); kp_pvp = sum(f[1] for f in b["fights"] if f[0])
            en = next((f[10] for f in b["fights"] if f[10]), "") or ("NPC" if b["fights"] else "–")
            rows.append((b, g, kp_all, kp_pvp, en))
        pvp_only = ov.get("pvp_only", True)
        rel = [r for r in rows if any(f[0] for f in r[0]["fights"]) or (not pvp_only and r[0]["fights"])]
        last_g = max((r[1] for r in rel), default=0)
        tot_g = sum(r[3] for r in rows if r[1] == last_g)
        tot_day = sum(r[3] for r in rows if r[0]["t"] >= day)
        tot_all = sum(r[3] for r in rows)
        w = tk.Toplevel(self.root); w.title("Wiz fan Club – " + self.pair_name(k)); w.configure(bg=C["bg"])
        w.geometry("%dx%d" % (px(900), px(580)))
        hd = tk.Frame(w, bg=C["bg"]); hd.pack(fill="x", padx=px(18), pady=(px(14), px(8)))
        tk.Label(hd, text="🔍 " + self.pair_name(k), bg=C["bg"], fg=C["text"], font=(FONT, 14, "bold")).pack(anchor="w")
        kr = tk.Frame(w, bg=C["bg"]); kr.pack(fill="x", padx=px(18))
        for lab, v, col in ((T("md_fight"), tot_g, C["gold"]), (T("md_today"), tot_day, None), (T("md_all"), tot_all, None), (T("md_reports"), len(rows), None)):
            kpi(kr, lab, fmt_num(v, lang) if lab != T("md_reports") else str(v), value_col=col).pack(side="left", padx=(0, px(8)))
        cur_parts = [r for r in rows if r[1] == last_g]
        cmax = max((r[0].get("cno") or 0 for r in cur_parts), default=0)
        if cmax:
            ok_ = len(cur_parts) >= cmax
            tk.Label(w, text=T("md_parts", h=len(cur_parts), n=cmax) + ("" if ok_ else "  " + T("md_parts_miss")), bg=C["bg"],
                     fg=C["good"] if ok_ else "#fb923c", font=(FONT, 9, "bold"), wraplength=px(680), justify="left").pack(anchor="w", padx=px(18), pady=(px(6), 0))
        tk.Label(w, text=T("md_info"), bg=C["bg"], fg=C["dim"], font=(FONT, 9), wraplength=px(680), justify="left").pack(anchor="w", padx=px(18), pady=(px(8), px(4)))
        sc = Scroll(w, C["bg"]); sc.pack(fill="both", expand=True, padx=(px(18), px(6)), pady=(0, px(6)))
        lines = ["%s | %s" % (self.pair_name(k), APP_VERSION), "Zeit | Gefecht | KP gesamt | KP PvP | Kaempfe | Gegner | ID"]
        hdr = tk.Frame(sc.inner, bg=C["bg"]); hdr.pack(fill="x")
        for txt, wd in ((T("md_time"), 14), ("#", 4), ("KP PvP", 12), (T("md_kp_all"), 12), (T("md_n"), 6), (T("md_enemy"), 18)):
            tk.Label(hdr, text=txt, bg=C["bg"], fg=C["muted"], font=(FONT, 9, "bold"), width=wd, anchor="w").pack(side="left")
        for b, gi, ka, kpv, en in rows[::-1][:200]:
            cur = gi == last_g
            r = tk.Frame(sc.inner, bg=C["card"] if cur else C["bg"]); r.pack(fill="x", pady=1)
            vals = (datetime.fromtimestamp(b["t"]).strftime("%d.%m. %H:%M:%S"), str(gi), fmt_num(kpv, lang), fmt_num(ka, lang), str(len(b["fights"])), en[:22])
            for (txt, wd), col in zip(zip(vals, (14, 4, 12, 12, 6, 18)), (C["text"], C["gold"] if cur else C["dim"], C["gold"], C["muted"], C["muted"], C["text"])):
                tk.Label(r, text=txt, bg=r["bg"], fg=col, font=(FONT, 9), width=wd, anchor="w").pack(side="left")
        for b, gi, ka, kpv, en in rows[::-1][:300]:
            lines.append("%s | %d | %d | %d | %d | %s | %s" % (datetime.fromtimestamp(b["t"]).strftime("%d.%m. %H:%M:%S"), gi, ka, kpv, len(b["fights"]), en, b["id"]))
        bt = tk.Frame(w, bg=C["bg"]); bt.pack(fill="x", padx=px(18), pady=(0, px(12)))
        Btn(bt, "📋 " + T("md_copy"), lambda: self.copy_text("\n".join(lines)), small=True).pack(side="left")
        Btn(bt, "📤 " + T("md_export"), lambda: self.export_reports(bs[-15:]), "ghost", small=True).pack(side="left", padx=(px(8), 0))

    def export_reports(self, bs):
        """Die neuesten Berichte dieses Marsches komplett (entschluesselt) als Datei – damit Claude die echten Felder sieht."""
        out = {"app": APP_VERSION, "mails": []}
        for b in bs:
            try:
                m = read_mail(b["file"])
                out["mails"].append({"file": os.path.basename(b["file"]), "summary": {k: b.get(k) for k in ("id", "par", "t", "mt", "h", "init", "rem")}, "mail": m})
            except Exception as e:
                out["mails"].append({"file": b.get("file"), "error": str(e)})
        fn = os.path.join(DATA, "bericht_export.json")
        with open(fn, "w", encoding="utf-8") as f:
            json.dump(out, f, ensure_ascii=False, indent=1, default=str)
        self.flash("📤 " + fn)
        try:
            if IS_WIN:
                os.startfile(DATA)
        except Exception:
            pass

    def pair_name(self, k):
        return "%s + %s" % (self.hero_name(k[0]), self.hero_name(k[1])) if k else "⚡ " + self.t("march_auto")

    def slot_menu(self, parent, idx):
        m = tk.Menu(parent, tearoff=0, bg=C["card"], fg=C["text"], activebackground=C["gold_dim"], activeforeground=C["gold"])
        m.add_command(label="⚡ " + self.t("march_auto"), command=lambda: self.set_march_slot(idx, None))
        m.add_separator()
        for k, st in sorted(getattr(self, "_march_all", {}).items(), key=lambda kv: -kv[1]["last"])[:15]:
            m.add_command(label="%s   (%s)" % (self.pair_name(k), self.ago(st["last"])), command=lambda k=k: self.set_march_slot(idx, k))
        return m

    def set_clickthrough(self, on):
        self.cfg["overlay"]["clickthrough"] = on; save_cfg(self.cfg)
        for f in (self.overlay, self.feed, self.march):
            if f.win:
                if f is self.overlay:
                    f._win_style()
                else:
                    f.style()
        self.flash(self.t("ct_on") if on else self.t("ct_off"))

    def hotkey(self, act):
        ov = self.cfg["overlay"]
        if act == "hk_overlay":
            self.set_master(not ov.get("all_on", True))
        elif act == "hk_reset":
            self.reset_session(); self.flash(self.t("ov_reset"))
        elif act == "hk_click":
            self.set_clickthrough(not ov.get("clickthrough", False))

    def open_site(self):
        import webbrowser
        webbrowser.open(self.cfg["api_base"].rstrip("/") + "/")

    def focus_id(self):
        """Welcher Account wird gezaehlt? auto = der gerade gespielte (neueste Mail), all = alle gebundenen, sonst feste ID."""
        f = str(self.cfg["overlay"].get("focus", "auto"))
        if f == "all":
            return None
        if f == "auto":
            a = self.scanner.active[0]
            return int(a) if a else None
        return int(f) if f.isdigit() else None

    def acc_name(self, gid):
        if not gid:
            return ""
        o = self.scanner.owners.get(int(gid)) or {}
        ln = next((x for x in self.cfg.get("links", []) if str(x["governor_id"]) == str(gid)), {})
        return o.get("name") or ln.get("gov_name") or str(gid)

    def set_focus(self, f):
        self.cfg["overlay"]["focus"] = f; save_cfg(self.cfg); self._sig = None; self._web_due = 0
        self.overlay._drawn = None
        if self.page in ("ov", "home"):
            self.render()

    def focus_bar(self, parent, bg):
        """Chips: Automatisch (aktiver Account) · Alle · einzelne Accounts."""
        T, f = self.t, str(self.cfg["overlay"].get("focus", "auto"))
        bar = tk.Frame(parent, bg=bg)
        tk.Label(bar, text=T("acc_focus"), bg=bg, fg=C["muted"], font=(FONT, 9)).pack(side="left", padx=(0, px(8)))
        act = self.scanner.active[0]
        Chip(bar, "⚡ " + T("f_auto") + (" · " + self.acc_name(act) if act else ""), f == "auto", lambda: self.set_focus("auto")).pack(side="left", padx=(0, px(5)))
        Chip(bar, T("f_all"), f == "all", lambda: self.set_focus("all")).pack(side="left", padx=(0, px(5)))
        ids = []
        for x in self.cfg.get("links", []):
            if str(x["governor_id"]) not in ids:
                ids.append(str(x["governor_id"]))
        for pid in sorted(self.scanner.owners, key=lambda p: -self.scanner.owners[p].get("last", 0)):
            if str(pid) not in ids:
                ids.append(str(pid))
        for gid in ids[:8]:
            Chip(bar, self.acc_name(gid), f == gid, lambda gid=gid: self.set_focus(gid)).pack(side="left", padx=(0, px(5)))
        return bar

    def hero_name(self, hid):
        """Kommandanten-Name aus den Spieldateien (einmal geladen)."""
        if not hid:
            return "–"
        if getattr(self, "_heroes", None) is None:
            self._heroes = {}
            if UP is not None:
                for g in self.cfg.get("game_folders", []):
                    try:
                        self._heroes = UP.load_hero_names(g, "de" if self.cfg.get("lang") == "de" else "en") or {}
                        if self._heroes:
                            break
                    except Exception:
                        pass
        return self._heroes.get(hid) or self._heroes.get(str(hid)) or "#%s" % hid

    def copy_xy(self, mk):
        self.root.clipboard_clear()
        self.root.clipboard_append("X:%d Y:%d" % (mk["x"], mk["y"]))
        self.flash(self.t("mk_copied") + " – X:%d Y:%d" % (mk["x"], mk["y"]))

    def ball_words(self):
        rules = self.cfg["markers"].get("rules") or []
        src = rules[0].get("words", "") if rules else self.cfg["markers"].get("words", "")
        return [w.strip().lower() for w in str(src).split(",") if w.strip()]

    # ---------- Seite „Alarme“: Marker-Liste | Einstellungen & Test ----------
    def page_mk(self, body):
        T, mc = self.t, self.cfg["markers"]
        sub = getattr(self, "mk_sub", "list")
        tabs = tk.Frame(body, bg=C["bg"]); tabs.pack(fill="x", pady=(0, px(10)))
        Seg(tabs, [("list", T("al_tab_list")), ("runes", T("al_tab_runes")), ("set", T("al_tab_set")), ("lead", T("al_tab_lead"))], sub,
            lambda v: (setattr(self, "mk_sub", v), self.render())).pack(side="left")
        if sub == "set":
            sc = Scroll(body, C["bg"]); sc.pack(fill="both", expand=True)
            self.page_alarm_settings(sc.inner)
            return
        if sub == "lead":
            sc = Scroll(body, C["bg"]); sc.pack(fill="both", expand=True)
            self.page_leadership(sc.inner)
            return
        if sub == "runes":
            sc = Scroll(body, C["bg"]); sc.pack(fill="both", expand=True)
            self.page_runes(sc.inner)
            return
        bar = tk.Frame(body, bg=C["bg"]); bar.pack(fill="x", pady=(0, px(10)))
        for key, lab in (("all", "mk_all"), ("ball", "mk_ball")):
            Chip(bar, T(lab), mc.get("filter") == key, lambda key=key: (self.set_mk("filter", key), self.refresh_markers(True))).pack(side="left", padx=(0, px(6)))
        tk.Frame(bar, bg=C["bg"], width=px(14)).pack(side="left")
        for key, lab in (("new", "mk_sort_new"), ("ball", "mk_sort_ball")):
            Chip(bar, T(lab), mc.get("sort") == key, lambda key=key: (self.set_mk("sort", key), self.refresh_markers(True))).pack(side="left", padx=(0, px(6)))
        Btn(bar, "🗑 " + T("mk_clear"), self.clear_markers, "danger", small=True).pack(side="right")
        tk.Label(body, text=T("mk_ttl"), bg=C["bg"], fg=C["dim"], font=(FONT, 8)).pack(anchor="w", pady=(0, px(6)))
        self.mk_list = MarkerList(body, self)
        self.mk_list.pack(fill="both", expand=True)
        self._mk_sig = None
        self.refresh_markers(True)

    def sound_chips(self, parent, cur, cb):
        """Ton-Auswahl als Chips + ▶ zum Anhoeren."""
        row = tk.Frame(parent, bg=C["card"])
        chips = {}

        def pick(n):
            for k, ch in chips.items():
                ch.set(k == n)
            cb(n); play_sound(n, self.cfg["alerts"].get("volume", 80))
        for n in SOUNDS:
            ch = Chip(row, self.t("snd_" + n), n == cur, lambda n=n: pick(n)); ch.pack(side="left", padx=(0, px(4)), pady=px(2))
            chips[n] = ch
        return row

    def page_alarm_settings(self, body):
        T, mc, ac = self.t, self.cfg["markers"], self.cfg["alerts"]
        rules = mc.setdefault("rules", [])
        sec = getattr(self, "al_sec", "marker")
        Seg(body, [("marker", "📍 " + T("as_marker")), ("buffs", "⏳ " + T("as_buffs")), ("msgs", "✉ " + T("as_msgs")), ("bld", "🏰 " + T("as_bld")),
                   ("popups", "💬 " + T("as_popups")), ("test", "🔊 " + T("as_test"))], sec,
            lambda v: (setattr(self, "al_sec", v), self.render())).pack(anchor="w", pady=(0, px(10)))
        if sec == "marker":
            # --- Marker-Regeln
            o, c = card(body, "📍 " + T("al_rules")); o.pack(fill="x")
            tk.Label(c, text=T("al_rules_info"), bg=C["card"], fg=C["dim"], font=(FONT, 9), wraplength=px(640), justify="left").pack(anchor="w", pady=(0, px(8)))
            self.rule_vars = []
            ri = rune_idx(rules)
            for i, r in enumerate(rules[:4]):
                box = tk.Frame(c, bg=C["card2"], padx=px(10), pady=px(8)); box.pack(fill="x", pady=px(4))
                top = tk.Frame(box, bg=C["card2"]); top.pack(fill="x")
                tk.Label(top, text="🎯" if i == 0 else ("🔷" if i == ri else "📍"), bg=C["card2"], fg=C["text"], font=(FONT, 12)).pack(side="left")
                vn, vw = tk.StringVar(value=r.get("name", "")), tk.StringVar(value=r.get("words", ""))
                en = entry(top, vn, 10); en.pack(side="left", padx=px(6))
                tk.Label(top, text=T("al_words"), bg=C["card2"], fg=C["muted"], font=(FONT, 9)).pack(side="left", padx=(px(6), px(4)))
                ew = entry(top, vw, 30); ew.pack(side="left", fill="x", expand=True)
                for e_ in (en, ew):
                    e_.bind("<FocusOut>", lambda _e, i=i, vn=vn, vw=vw: self.set_rule(i, name=vn.get(), words=vw.get()))
                    e_.bind("<Return>", lambda _e, i=i, vn=vn, vw=vw: self.set_rule(i, name=vn.get(), words=vw.get()))
                sr = tk.Frame(box, bg=C["card2"]); sr.pack(fill="x", pady=(px(6), 0))
                tk.Label(sr, text="🔊", bg=C["card2"], fg=C["muted"], font=(FONT, 10)).pack(side="left", padx=(0, px(6)))
                sc_ = self.sound_chips(sr, r.get("sound", "ding"), lambda n, i=i: self.set_rule(i, sound=n)); sc_.configure(bg=C["card2"]); sc_.pack(side="left")
            r = tk.Frame(c, bg=C["card"]); r.pack(fill="x", pady=(px(8), 0))
            tk.Label(r, text="📍 " + T("al_other"), bg=C["card"], fg=C["muted"], font=(FONT, 9)).pack(side="left", padx=(0, px(6)))
            self.sound_chips(r, mc.get("other_sound", "ding"), lambda n: self.set_mk("other_sound", n)).pack(side="left")
            r = tk.Frame(c, bg=C["card"]); r.pack(fill="x", pady=(px(8), 0))
            for i, (key, lab) in enumerate((("sound", "mk_sound"), ("overlay", "mk_overlay"), ("alarm_all", "mk_all_alarm"))):
                v = tk.BooleanVar(value=mc.get(key, False))
                Toggle(r, T(lab), v, lambda key=key, v=v: self.set_mk(key, v.get())).grid(row=i // 2, column=i % 2, sticky="w", padx=(0, px(18)), pady=px(2))
            r = tk.Frame(c, bg=C["card"]); r.pack(fill="x", pady=(px(8), 0))
            tk.Label(r, text=T("mk_keep"), bg=C["card"], fg=C["muted"], font=(FONT, 9)).pack(side="left", padx=(0, px(6)))
            kl = tk.Label(r, text=str(mc.get("keep_ball", 5)), bg=C["card"], fg=C["text"], font=(FONT, 10, "bold"), width=3)
            def kstep(d):
                n = max(1, min(20, int(self.cfg["markers"].get("keep_ball", 5)) + d)); kl.configure(text=str(n))
                self.set_mk("keep_ball", n); self.scanner.prune_markers()
            Btn(r, "−", lambda: kstep(-1), "ghost", small=True).pack(side="left"); kl.pack(side="left"); Btn(r, "+", lambda: kstep(1), "ghost", small=True).pack(side="left")
            tk.Label(r, text="  ·  " + T("mk_ttl"), bg=C["card"], fg=C["dim"], font=(FONT, 8)).pack(side="left")

        if sec == "marker":
            # --- Dein Name im Marker
            o, c = card(body, "📣 " + T("al_names")); o.pack(fill="x", pady=(px(12), 0))
            tk.Label(c, text=T("al_names_info"), bg=C["card"], fg=C["dim"], font=(FONT, 9), wraplength=px(640), justify="left").pack(anchor="w", pady=(0, px(6)))
            r = tk.Frame(c, bg=C["card"]); r.pack(fill="x")
            vn = tk.StringVar(value=mc.get("my_names", ""))
            en_ = entry(r, vn, 30); en_.pack(side="left")
            en_.bind("<FocusOut>", lambda _e: (self.set_mk("my_names", vn.get()), self.render()))
            en_.bind("<Return>", lambda _e: (self.set_mk("my_names", vn.get()), self.render()))
            tk.Label(c, text=T("al_names_auto", n=", ".join(self.my_names()) or "–"), bg=C["card"], fg=C["muted"], font=(FONT, 8),
                     wraplength=px(640), justify="left").pack(anchor="w", pady=(px(6), 0))
            r = tk.Frame(c, bg=C["card"]); r.pack(fill="x", pady=(px(6), 0))
            tk.Label(r, text="🔊", bg=C["card"], fg=C["muted"], font=(FONT, 10)).pack(side="left", padx=(0, px(6)))
            self.sound_chips(r, mc.get("mention_sound", "sirene"), lambda n: self.set_mk("mention_sound", n)).pack(side="left")

        if sec == "buffs":
            # --- Buffs
            o, c = card(body, "⏳ " + T("al_buffs")); o.pack(fill="x", pady=(px(12), 0))
            tk.Label(c, text=T("al_buffs_info"), bg=C["card"], fg=C["dim"], font=(FONT, 9), wraplength=px(640), justify="left").pack(anchor="w", pady=(0, px(6)))
            r = tk.Frame(c, bg=C["card"]); r.pack(fill="x")
            for i, (key, lab) in enumerate((("buff_army", "bf_army"), ("buff_attack", "bf_attack"), ("buff_def", "bf_def"), ("buff_shield", "bf_shield"))):
                v = tk.BooleanVar(value=ac.get(key, False))
                Toggle(r, T(lab), v, lambda key=key, v=v: self.set_al(key, v.get())).grid(row=i // 2, column=i % 2, sticky="w", padx=(0, px(18)), pady=px(2))
            r = tk.Frame(c, bg=C["card"]); r.pack(fill="x", pady=(px(8), 0))
            tk.Label(r, text="🔊", bg=C["card"], fg=C["muted"], font=(FONT, 10)).pack(side="left", padx=(0, px(6)))
            self.sound_chips(r, ac.get("buff_sound", "sirene"), lambda n: self.set_al("buff_sound", n)).pack(side="left")

            # 50 % Expansion aus den Kampfberichten
            tk.Label(c, text="🪖 " + T("exp_title"), bg=C["card"], fg=C["gold"], font=(FONT, 10, "bold")).pack(anchor="w", pady=(px(12), px(2)))
            tk.Label(c, text=T("exp_info"), bg=C["card"], fg=C["dim"], font=(FONT, 9), wraplength=px(640), justify="left").pack(anchor="w")
            r = tk.Frame(c, bg=C["card"]); r.pack(fill="x", pady=(px(4), 0))
            for i, (key, lab) in enumerate((("exp_show", "exp_show"), ("exp_alert", "exp_alert"))):
                v = tk.BooleanVar(value=ac.get(key, True))
                Toggle(r, T(lab), v, lambda key=key, v=v: (self.set_al(key, v.get()), setattr(self.overlay, "_drawn", None), self.overlay.draw())
                       ).grid(row=0, column=i, sticky="w", padx=(0, px(18)))
            r = tk.Frame(c, bg=C["card"]); r.pack(fill="x", pady=(px(6), 0))
            tk.Label(r, text=T("exp_limit"), bg=C["card"], fg=C["muted"], font=(FONT, 9)).pack(side="left", padx=(0, px(6)))
            ve = tk.StringVar(value=str(int(ac.get("exp_limit", 400000)) // 1000))
            ee = entry(r, ve, 6, center=True); ee.pack(side="left")
            tk.Label(r, text="K", bg=C["card"], fg=C["dim"], font=(FONT, 9)).pack(side="left", padx=(px(4), px(12)))

            def set_lim(_e=None):
                try:
                    self.set_al("exp_limit", int(float(ve.get().replace(",", ".")) * 1000))
                    self._sig = None
                except ValueError:
                    pass
            ee.bind("<Return>", set_lim); ee.bind("<FocusOut>", set_lim)
            ex = getattr(self, "_exp", None)
            tk.Label(r, text=(T("exp_now_on") if ex[0] else T("exp_now_off")) % fmt_num(ex[1], self.cfg["lang"]) if ex else T("exp_none"),
                     bg=C["card"], fg=(C["good"] if ex and ex[0] else C["bad"]) if ex else C["dim"], font=(FONT, 9, "bold")).pack(side="left")

        if sec == "popups":
            # --- Pop-ups: was soll als Pop-up kommen?
            o, c = card(body, "💬 " + T("pp_title")); o.pack(fill="x", pady=(px(12), 0))
            tk.Label(c, text=T("pp_info"), bg=C["card"], fg=C["dim"], font=(FONT, 9), wraplength=px(640), justify="left").pack(anchor="w", pady=(0, px(6)))
            g = tk.Frame(c, bg=C["card"]); g.pack(fill="x")
            tk.Label(g, text=T("pp_color"), bg=C["card"], fg=C["dim"], font=(FONT, 8)).grid(row=0, column=1, sticky="w")
            pc = self.cfg.get("popups_col") or {}
            for i, (k, icon, _d) in enumerate(self.POPUPS):
                v = tk.BooleanVar(value=self.popup_on(k))
                Toggle(g, "%s  %s" % (icon, T("pp_" + k)), v, lambda k=k, v=v: self.set_popup(k, v.get())).grid(row=i + 1, column=0, sticky="w", padx=(0, px(18)), pady=px(2))
                ColorDots(g, pc.get(k, ""), lambda col, k=k: self.set_popup_col(k, col)).grid(row=i + 1, column=1, sticky="w")
                Btn(g, "▶", lambda k=k: self.test_popups(only=k), "ghost", small=True).grid(row=i + 1, column=2, sticky="w", padx=(px(8), 0))
            r = tk.Frame(c, bg=C["card"]); r.pack(fill="x", pady=(px(8), 0))
            Btn(r, "✥ " + T("toast_place"), self.toast.place_mode, "ghost", small=True).pack(side="left")
            Btn(r, "▶ " + T("pp_test"), self.test_popups, "ghost", small=True).pack(side="left", padx=(px(8), 0))

        if sec == "msgs":
            # --- Nachrichten: gespaeht, Lost Kingdom, Lazarett
            o, c = card(body, "✉ " + T("al_msgs")); o.pack(fill="x", pady=(px(12), 0))
            tk.Label(c, text=T("al_msgs_info"), bg=C["card"], fg=C["dim"], font=(FONT, 9), wraplength=px(640), justify="left").pack(anchor="w", pady=(0, px(6)))
            r = tk.Frame(c, bg=C["card"]); r.pack(fill="x")
            for i, key in enumerate(("msg_scout", "msg_rank", "msg_hosp70", "msg_hosp85", "msg_hospdead")):
                v = tk.BooleanVar(value=ac.get(key, True))
                Toggle(r, T(key), v, lambda key=key, v=v: self.set_al(key, v.get())).grid(row=i // 2, column=i % 2, sticky="w", padx=(0, px(18)), pady=px(2))
            for key, lab, dflt in (("scout_sound", "msg_scout", "doppel"), ("rank_sound", "msg_rank", "glocke"), ("hosp_sound", "ms_hosp_s", "sirene")):
                r = tk.Frame(c, bg=C["card"]); r.pack(fill="x", pady=(px(6), 0))
                tk.Label(r, text="🔊 " + T(lab), bg=C["card"], fg=C["muted"], font=(FONT, 9), width=18, anchor="w").pack(side="left", padx=(0, px(6)))
                self.sound_chips(r, ac.get(key, dflt), lambda n, key=key: self.set_al(key, n)).pack(side="left")

        if sec == "bld":
            # --- Gebaeude / Flaggen
            o, c = card(body, "🏰 " + T("al_bld")); o.pack(fill="x", pady=(px(12), 0))
            v = tk.BooleanVar(value=ac.get("bld", True))
            Toggle(c, T("al_bld_on"), v, lambda: self.set_al("bld", v.get())).pack(anchor="w")
            r = tk.Frame(c, bg=C["card"]); r.pack(fill="x", pady=(px(6), 0))
            tk.Label(r, text=T("al_bld_filter"), bg=C["card"], fg=C["muted"], font=(FONT, 9)).pack(side="left", padx=(0, px(6)))
            vf = tk.StringVar(value=ac.get("bld_filter", ""))
            ef = entry(r, vf, 22); ef.pack(side="left")
            ef.bind("<FocusOut>", lambda _e: self.set_al("bld_filter", vf.get())); ef.bind("<Return>", lambda _e: self.set_al("bld_filter", vf.get()))
            r = tk.Frame(c, bg=C["card"]); r.pack(fill="x", pady=(px(6), 0))
            for lab, val in ((T("bld_all"), ""), ("Pass 7", "7 Pass"), ("Pass 7 + Altar", "7 Pass, Altar"), ("Kingsland", "Kingsland, Ziggurat")):
                Chip(r, lab, ac.get("bld_filter", "") == val, lambda val=val: (self.set_al("bld_filter", val), self.render())).pack(side="left", padx=(0, px(4)))
            r = tk.Frame(c, bg=C["card"]); r.pack(fill="x", pady=(px(6), 0))
            tk.Label(r, text="🔊", bg=C["card"], fg=C["muted"], font=(FONT, 10)).pack(side="left", padx=(0, px(6)))
            self.sound_chips(r, ac.get("bld_sound", "glocke"), lambda n: self.set_al("bld_sound", n)).pack(side="left")

        if sec == "test":
            # --- Allgemein + Test
            o, c = card(body, "🧪 " + T("al_test")); o.pack(fill="x", pady=(px(12), 0))
            r = tk.Frame(c, bg=C["card"]); r.pack(fill="x")
            tk.Label(r, text=T("al_volume"), bg=C["card"], fg=C["muted"], font=(FONT, 9)).pack(side="left", padx=(0, px(6)))
            self.vol_chips = {}
            for vv in (30, 60, 80, 100):
                ch = Chip(r, "%d%%" % vv, int(ac.get("volume", 80)) == vv, lambda vv=vv: self.set_volume(vv)); ch.pack(side="left", padx=(0, px(4)))
                self.vol_chips[vv] = ch
            self.show_chips = {}
            for key, lab in (("dur_army", "al_dur_army"), ("show_min", "al_dur_other")):
                r = tk.Frame(c, bg=C["card"]); r.pack(fill="x", pady=(px(8), 0))
                tk.Label(r, text="⏱ " + T(lab), bg=C["card"], fg=C["muted"], font=(FONT, 9), width=22, anchor="w").pack(side="left", padx=(0, px(6)))
                cur = int(ac.get(key, ac.get("show_min", 10)))
                chs = {}
                for mm in (1, 2, 3, 5, 10, 30):
                    ch = Chip(r, "%d min" % mm, cur == mm, lambda mm=mm, key=key, chs=chs: (self.set_al(key, mm), [x.set(k2 == mm) for k2, x in chs.items()]))
                    ch.pack(side="left", padx=(0, px(4))); chs[mm] = ch
            r = tk.Frame(c, bg=C["card"]); r.pack(fill="x", pady=(px(10), 0))
            Btn(r, "🎯 " + T("t_ball"), lambda: self.test_alert("ball"), small=True).pack(side="left", padx=(0, px(6)))
            Btn(r, "📍 " + T("t_marker"), lambda: self.test_alert("marker"), "ghost", small=True).pack(side="left", padx=(0, px(6)))
            Btn(r, "⏳ " + T("t_buff"), lambda: self.test_alert("buff"), "ghost", small=True).pack(side="left", padx=(0, px(6)))
            Btn(r, "🏰 " + T("t_bld"), lambda: self.test_alert("bld"), "ghost", small=True).pack(side="left", padx=(0, px(6)))
            Btn(r, "📣 " + T("t_name"), lambda: self.test_alert("name"), "ghost", small=True).pack(side="left", padx=(0, px(6)))
            for grp in ((("🪖", "army"), ("🔭", "scout"), ("⚔", "battle"), ("🏆", "rank")), (("🏥", "hosp70"), ("⚠", "hosp85"), ("💀", "hospdead"))):
                r = tk.Frame(c, bg=C["card"]); r.pack(fill="x", pady=(px(6), 0))
                for ico, k in grp:
                    Btn(r, ico + " " + T("t_" + k), lambda k=k: self.test_alert(k), "ghost", small=True).pack(side="left", padx=(0, px(6)))
            r = tk.Frame(c, bg=C["card"]); r.pack(fill="x", pady=(px(6), 0))
            Btn(r, "▶ " + T("t_all"), lambda: self.test_alert("all"), small=True).pack(side="left")
            r = tk.Frame(c, bg=C["card"]); r.pack(fill="x", pady=(px(10), 0))
            Btn(r, "💾 " + T("mk_export"), self.export_samples, "ghost", small=True).pack(side="left")
            tk.Label(r, text="  " + T("mk_export_info"), bg=C["card"], fg=C["dim"], font=(FONT, 8)).pack(side="left")

    def rune_markers(self):
        rules = self.cfg["markers"].get("rules", [])
        ri = rune_idx(rules)
        if ri < 0:
            return []
        with self.scanner.lock:
            ms = [m for m in self.scanner.markers.values() if marker_rule(m, rules) == ri]
        return sorted(ms, key=lambda m: (m.get("num") or 999, -m["t"]))

    def page_runes(self, body):
        """Runen-Uebersicht: alle Runen-Marker als Kacheln – Nummer, Koordinaten, Alter, Kopieren."""
        T = self.t
        ms = self.rune_markers()
        self._rune_sig = (len(ms), int(time.time() // 30))
        top = tk.Frame(body, bg=C["bg"]); top.pack(fill="x", pady=(0, px(10)))
        kpi(top, "🔷 " + T("rn_active"), str(len(ms)), value_col=RUNE_COL).pack(side="left", padx=(0, px(10)))
        newest = max((m["t"] for m in ms), default=0)
        kpi(top, T("rn_newest"), self.ago(newest) if newest else "–").pack(side="left", padx=(0, px(10)))
        ov = self.cfg["overlay"]
        tb = tk.Frame(body, bg=C["bg"]); tb.pack(fill="x", pady=(0, px(10)))
        v = tk.BooleanVar(value=ov.get("runes", True))
        Toggle(tb, T("rn_overlay"), v, lambda: (self.set_opt("runes", v.get()), setattr(self.overlay, "_drawn", None), self.overlay.draw()),
               bg=C["bg"]).pack(side="left", padx=(0, px(24)))
        cr = tk.Frame(tb, bg=C["bg"]); cr.pack(side="left")
        tk.Label(cr, text=T("rn_n"), bg=C["bg"], fg=C["muted"], font=(FONT, 9)).pack(side="left", padx=(0, px(6)))
        for n in (1, 2, 3, 4, 5, 8):
            Chip(cr, str(n), int(ov.get("rune_n", 3)) == n, lambda n=n: (self.set_opt("rune_n", n), setattr(self.overlay, "_drawn", None),
                                                                     self.overlay.draw(), self.render())).pack(side="left", padx=(0, px(4)))
        if not ms:
            o, c = card(body, "🔷 " + T("al_tab_runes")); o.pack(fill="x")
            tk.Label(c, text=T("rn_empty"), bg=C["card"], fg=C["dim"], font=(FONT, 10), wraplength=px(620), justify="left").pack(anchor="w")
            return
        grid = tk.Frame(body, bg=C["bg"]); grid.pack(fill="x")
        cols = 3
        for i, m in enumerate(ms):
            f = tk.Frame(grid, bg=C["card"], highlightthickness=1, highlightbackground="#1e3a52", padx=px(12), pady=px(10))
            f.grid(row=i // cols, column=i % cols, sticky="nsew", padx=(0, px(10)), pady=(0, px(10)))
            grid.columnconfigure(i % cols, weight=1, uniform="rn")
            h = tk.Frame(f, bg=C["card"]); h.pack(fill="x")
            tk.Label(h, text="🔷 " + (T("rn_rune") + (" %d" % m["num"] if m.get("num") else "")).upper(), bg=C["card"], fg=RUNE_COL,
                     font=(FONT, 11, "bold")).pack(side="left")
            tk.Label(h, text=self.ago(m["t"]), bg=C["card"], fg=C["dim"], font=(FONT, 8)).pack(side="right")
            tk.Label(f, text="X %d · Y %d" % (m["x"], m["y"]), bg=C["card"], fg=C["gold"], font=(FONT, 14, "bold")).pack(anchor="w", pady=(px(4), 0))
            tk.Label(f, text=(m.get("text") or "–")[:60], bg=C["card"], fg=C["text"], font=(FONT, 9), wraplength=px(220), justify="left").pack(anchor="w")
            b = tk.Frame(f, bg=C["card"]); b.pack(fill="x", pady=(px(8), 0))
            Btn(b, "📋 " + T("mk_copy"), lambda m=m: self.copy_xy(m), small=True).pack(side="left")
            Btn(b, "✕", lambda m=m: (self.del_marker(m.get("key")), self.render()), "ghost", small=True).pack(side="left", padx=(px(6), 0))

    def page_leadership(self, body):
        """Schnell-Texte fuer Marker: einmal eintragen, dann mit einem Klick kopieren und im Spiel einfuegen."""
        T, mc = self.t, self.cfg["markers"]
        o, c = card(body, "✍ " + T("lead_title")); o.pack(fill="x")
        tk.Label(c, text=T("lead_info"), bg=C["card"], fg=C["dim"], font=(FONT, 9), wraplength=px(640), justify="left").pack(anchor="w", pady=(0, px(8)))
        sn = mc.setdefault("snippets", [])
        for i, txt in enumerate(sn):
            r = tk.Frame(c, bg=C["card"]); r.pack(fill="x", pady=px(3))
            v = tk.StringVar(value=txt)
            e = entry(r, v, 36); e.pack(side="left", fill="x", expand=True)
            e.bind("<FocusOut>", lambda _e, i=i, v=v: self.set_snippet(i, v.get()))
            e.bind("<Return>", lambda _e, i=i, v=v: (self.set_snippet(i, v.get()), self.copy_text(v.get())))
            Btn(r, "📋 " + T("mk_copy"), lambda v=v, i=i: (self.set_snippet(i, v.get()), self.copy_text(v.get())), small=True).pack(side="left", padx=(px(8), 0))
            Btn(r, "✕", lambda i=i: self.del_snippet(i), "ghost", small=True).pack(side="left", padx=(px(6), 0))
        Btn(c, "+ " + T("lead_add"), self.add_snippet, "ghost", small=True).pack(anchor="w", pady=(px(8), 0))

    def copy_text(self, txt):
        self.root.clipboard_clear(); self.root.clipboard_append(txt)
        self.flash("📋 " + self.t("mk_copied") + ": " + txt[:30])

    def set_snippet(self, i, txt):
        sn = self.cfg["markers"].setdefault("snippets", [])
        if 0 <= i < len(sn) and sn[i] != txt:
            sn[i] = txt; save_cfg(self.cfg)

    def add_snippet(self):
        self.cfg["markers"].setdefault("snippets", []).append(""); save_cfg(self.cfg); self.render()

    def del_snippet(self, i):
        sn = self.cfg["markers"].setdefault("snippets", [])
        if 0 <= i < len(sn):
            sn.pop(i); save_cfg(self.cfg); self.render()

    def set_rule(self, i, **kw):
        rules = self.cfg["markers"].setdefault("rules", [])
        if 0 <= i < len(rules):
            rules[i].update(kw); save_cfg(self.cfg)
            self.overlay._drawn = None

    def set_popup(self, k, on):
        if k == "battle":
            self.cfg["overlay"]["toast"] = on
        else:
            self.cfg.setdefault("popups", {})[k] = on
        save_cfg(self.cfg)

    def set_popup_col(self, k, col):
        self.cfg.setdefault("popups_col", {})[k] = col; save_cfg(self.cfg)

    def test_popups(self, only=None):
        T = self.t
        demo = {"battle": None, "ball": ("🎯", "BALL 2  ·  X 612 · Y 845", "Pass 7", C["bad"]), "marker": ("📍", "RALLY  ·  X 540 · Y 700", "TEST", C["gold"]),
                "mention": ("📣", T("mention_title"), "Mirox Rally Pass 7", "#fb923c"), "army": ("🪖", T("bf_ended", b=T("bf_army")).upper(), "TEST", C["bad"]),
                "buff": ("⏳", T("bf_ended", b=T("bf_attack")).upper(), "TEST", C["bad"]), "exp": ("🪖", T("exp_gone"), T("exp_troops", n="276K"), C["bad"]),
                "scout": ("🔭", T("ms_scout"), "TEST [ABC]Spion", C["bad"]), "hosp": ("🏥", T("ms_hosp", p=85), "TEST", C["bad"]),
                "rank": ("🏆", T("ms_rank", t="S+"), "TEST", C["gold"]), "bld": ("🏰", T("bld_lost", n="Lvl 7 Pass"), "X 616 · Y 879", C["bad"])}
        for k, _i, _d in self.POPUPS:
            if (only == k) or (only is None and self.popup_on(k)):
                if k == "battle":
                    self.test_alert("battle")
                else:
                    ic, ti, su, co = demo[k]
                    self.toast.show_msg(ic, ti, su, self.popup_col(k, co))

    def set_al(self, key, val):
        self.cfg["alerts"][key] = val; save_cfg(self.cfg)

    def set_volume(self, v):
        self.set_al("volume", v)
        for k, ch in self.vol_chips.items():
            ch.set(k == v)
        play_sound("ding", v)

    def set_show_min(self, m):
        self.set_al("show_min", m)
        for k, ch in self.show_chips.items():
            ch.set(k == m)

    def marker_items(self):
        mc, rules = self.cfg["markers"], self.cfg["markers"].get("rules", [])
        with self.scanner.lock:
            mks = list(self.scanner.markers.values())
        for m in mks:
            m["_rule"] = marker_rule(m, rules)
            m["_ball"] = m["_rule"] == 0
            m["_rname"] = rules[m["_rule"]].get("name", "") if m["_rule"] >= 0 else ""
        if mc.get("filter") == "ball":
            mks = [m for m in mks if m["_ball"]]
        mks.sort(key=lambda m: ((not m["_ball"]) if mc.get("sort") == "ball" else 0, -m["t"]))
        return mks[:80]

    def refresh_markers(self, force=False):
        if self.page == "mk" and getattr(self, "mk_sub", "list") == "runes":
            ms = self.rune_markers()
            if force or (len(ms), int(time.time() // 30)) != getattr(self, "_rune_sig", None):
                self.render()
            return
        if self.page != "mk" or not getattr(self, "mk_list", None) or getattr(self, "mk_sub", "list") != "list":
            return
        with self.scanner.lock:
            sig = (len(self.scanner.markers), max((m["t"] for m in self.scanner.markers.values()), default=0), int(time.time() // 60))
        if force or sig != self._mk_sig:
            self._mk_sig = sig
            try:
                self.mk_list.set(self.marker_items())
            except tk.TclError:
                pass

    def del_marker(self, key):
        self.scanner.delete_marker(key); self.refresh_markers(True); self.overlay._drawn = None; self.overlay.draw()

    def clear_markers(self):
        if messagebox.askyesno("Wiz fan Club", self.t("mk_clear") + "?"):
            with self.scanner.lock:
                keys = list(self.scanner.markers)
            for k in keys:
                self.scanner.delete_marker(k)
            self.overlay.alerts = []
            self.refresh_markers(True); self.overlay._drawn = None; self.overlay.draw()

    def set_words(self):
        self.set_rule(0, words=self.v_words.get()); self.refresh_markers(True)

    def set_mk(self, key, val):
        self.cfg["markers"][key] = val; save_cfg(self.cfg)

    def export_samples(self):
        out = {"app": APP_VERSION, "mails": []}
        with self.scanner.lock:
            paths = list(self.scanner.samples)
        for p in paths:
            try:
                out["mails"].append(read_mail(p))
            except Exception:
                pass
        fn = os.path.join(DATA, "marker_beispiel.json")
        with open(fn, "w", encoding="utf-8") as f:
            json.dump(out, f, ensure_ascii=False, indent=1)
        self.flash(self.t("mk_exported", p=fn))
        try:
            os.startfile(DATA)                     # Ordner im Explorer oeffnen (nur Windows)
        except Exception:
            messagebox.showinfo("Wiz fan Club", self.t("mk_exported", p=fn))

    # ---------- Alarme ausloesen ----------
    def my_names(self):
        """Eigene Namen (Eingabe + Namen deiner Accounts), vereinfacht fuer die Suche."""
        raw = [x for x in str(self.cfg["markers"].get("my_names", "")).split(",")]
        raw += [x.get("gov_name") for x in self.cfg.get("links", [])]
        raw += [o.get("name") for o in self.scanner.owners.values()]
        return sorted({n for n in (norm_name(x) for x in raw if x) if len(n) >= 3})

    def mentioned(self, mk):
        txt = norm_name(mk.get("text", ""))
        return next((n for n in self.my_names() if n in txt), None)

    def mention_alarm(self, mk):
        """Dein Name steht im Marker (z. B. „Mirox Rally“): blinkt im Overlay UND in der App."""
        ac = self.cfg["alerts"]
        self.overlay.add_alert({"icon": "📣", "title": self.t("mention_title").upper(), "sub": (mk.get("text") or "")[:52],
                                "tone": "orange", "blink": True, "xy": (mk["x"], mk["y"]) if mk.get("x") else None, "key": mk.get("key")})
        play_sound(self.cfg["markers"].get("mention_sound", "sirene"), ac.get("volume", 80))
        self.popup("mention", "📣", self.t("mention_title"), (mk.get("text") or "")[:50], "#fb923c")
        self._mention_until = time.time() + 120
        self._mention_text = mk.get("text") or ""
        if IS_WIN:                                       # Taskleisten-Knopf der App blinkt
            try:
                import ctypes
                class FW(ctypes.Structure):
                    _fields_ = [("cbSize", ctypes.c_uint), ("hwnd", ctypes.c_void_p), ("dwFlags", ctypes.c_uint), ("uCount", ctypes.c_uint), ("dwTimeout", ctypes.c_uint)]
                hwnd = ctypes.windll.user32.GetParent(self.root.winfo_id())
                fw = FW(ctypes.sizeof(FW), hwnd, 0x3 | 0xC, 10, 0)
                ctypes.windll.user32.FlashWindowEx(ctypes.byref(fw))
            except Exception:
                pass

    def alarm(self, mk, rule=None):
        mc = self.cfg["markers"]
        rules = mc.get("rules", [])
        if rule is None:
            rule = marker_rule(mk, rules)
        if self.mentioned(mk):                  # dein Name steht drin -> dieser Alarm hat Vorrang
            self.mention_alarm(mk)
            self.refresh_markers(True)
            return
        if rule < 0 and not mc.get("alarm_all"):
            return
        name = rules[rule].get("name", "") if rule >= 0 else self.t("mk_new")
        ball = rule == 0
        # Ball-Marker stehen schlicht als farbiger Text in der Overlay-Liste (gruen -> orange -> rot),
        # nur wenn die Liste aus ist, kommt die grosse Meldung.
        ov_ = self.cfg["overlay"]
        quiet = ov_.get("mk_mode", "ball") != "off" and (
            (ball and int(ov_.get("ball_n", 3)) > 0) or (rule == rune_idx(rules) and ov_.get("runes", True)))
        if mc.get("overlay", True) and quiet:
            self.overlay._drawn = None; self.overlay.draw()
        elif mc.get("overlay", True):
            self.overlay.add_alert({"icon": "🎯" if ball else "📍", "title": "%s  X %d · Y %d" % ((name or "Marker").upper(), mk["x"], mk["y"]),
                                    "sub": ((mk.get("text") or "") + "  · " + self.ago(mk["t"])).strip(" ·"), "tone": "bad" if ball else "gold",
                                    "blink": ball, "xy": (mk["x"], mk["y"]), "key": mk.get("key")})
        if mc.get("sound", True):
            play_sound(rules[rule].get("sound", "ding") if rule >= 0 else mc.get("other_sound", "ding"), self.cfg["alerts"].get("volume", 80))
        self.popup("ball" if ball else "marker", "🎯" if ball else "📍",
                   "%s%s  ·  X %d · Y %d" % ((name or "Marker").upper(), (" %d" % mk["num"]) if mk.get("num") else "", mk["x"], mk["y"]),
                   (mk.get("text") or "")[:50], C["bad"] if ball else C["gold"])
        self.refresh_markers(True)

    def event_alarm(self, ev):
        ac = self.cfg["alerts"]
        who = self.acc_name(ev.get("pid")) if ev.get("pid") else ""
        if ev["ev"] == "msg":
            k, T, vol = ev["kind"], self.t, ac.get("volume", 80)
            if not ac.get("msg_" + k, True):
                return
            sub = "%s%s" % ((who + " · ") if who else "", self.ago(ev["t"]))
            if k == "scout":                                 # wie Army-Buff: rot blinkend im Overlay
                self.overlay.add_alert({"icon": "🔭", "title": T("ms_scout").upper(), "sub": (ev.get("text") or "")[:60] or sub, "tone": "bad", "blink": True})
                self.popup("scout", "🔭", T("ms_scout"), (ev.get("text") or "")[:50] or sub)
                play_sound(ac.get("scout_sound", "doppel"), vol)
            elif k == "rank":                                # Pop-up wie nach einem Kampf
                tier = ev.get("tier") or "?"
                self.popup("rank", "🏆", T("ms_rank", t=tier), sub, C["gold"])
                play_sound(ac.get("rank_sound", "glocke"), vol)
            if k.startswith("hosp"):
                self.popup("hosp", "💀" if k == "hospdead" else "🏥", T("ms_dead") if k == "hospdead" else T("ms_hosp", p=ev.get("pct") or 70), sub)
            if k == "hosp70":                              # wie Army-Buff
                self.overlay.add_alert({"icon": "🏥", "title": T("ms_hosp", p=ev.get("pct") or 70).upper(), "sub": sub, "tone": "bad", "blink": True})
                play_sound(ac.get("hosp_sound", "sirene"), vol)
            elif k == "hosp85":                              # + Warnung oben am Bildschirmrand
                self.overlay.add_alert({"icon": "🏥", "title": T("ms_hosp", p=ev.get("pct") or 85).upper(), "sub": sub, "tone": "bad", "blink": True})
                self.banner.show("⚠  " + T("ms_banner85", p=ev.get("pct") or 85).upper())
                play_sound(ac.get("hosp_sound", "sirene"), vol)
            elif k == "hospdead":                            # alles: Meldung + Warnung oben + lila Rahmen
                n = ev.get("n") or 0
                self.overlay.add_alert({"icon": "💀", "title": T("ms_dead").upper(), "sub": (fmt_num(n, self.cfg["lang"]) + " " + T("ms_died")) if n else sub,
                                        "tone": "bad", "blink": True})
                self.banner.show("☠  " + T("ms_banner_dead", n=fmt_num(n, self.cfg["lang"]) if n else "?").upper(), "#c084fc", 20)
                self.border.show("#a855f7", 60)
                play_sound(ac.get("hosp_sound", "sirene"), vol)
            return
        if ev["ev"] == "buff":
            if not ac.get({"army": "buff_army", "attack": "buff_attack", "def": "buff_def", "shield": "buff_shield"}[ev["kind"]]):
                return
            icon = {"army": "🪖", "attack": "⚔", "def": "🛡", "shield": "🕊"}[ev["kind"]]
            title = self.t("bf_ended", b=self.t("bf_" + ev["kind"])).upper()
            sub = "%s%s" % ((who + " · ") if who else "", self.ago(ev["t"]))
            a = {"icon": icon, "title": title, "sub": sub, "tone": "bad", "blink": True}
            if ev["kind"] == "army":
                a["until"] = time.time() + 60 * float(ac.get("dur_army", ac.get("show_min", 10)))
            self.overlay.add_alert(a)
            self.popup("army" if ev["kind"] == "army" else "buff", icon, title, sub)
            play_sound(ac.get("buff_sound", "sirene"), ac.get("volume", 80))
        elif ev["ev"] == "bld":
            if not ac.get("bld", True):
                return
            flt = [x.strip().lower() for x in str(ac.get("bld_filter", "")).split(",") if x.strip()]
            if flt and not any(x in (ev.get("text", "") + " " + ev.get("name", "")).lower() for x in flt):
                return
            if ev["ours"]:
                icon, title, tone = "🏰", self.t("bld_won", n=ev["name"]), "green"
            elif ev["lost"]:
                icon, title, tone = "💥", self.t("bld_lost", n=ev["name"]), "bad"
            else:
                icon, title, tone = "🏰", ev["name"], "blue"
            self.overlay.add_alert({"icon": icon, "title": title.upper(), "sub": "X %d · Y %d%s" % (ev["x"], ev["y"], ("  · [%s]" % ev["ally"]) if ev.get("ally") else ""),
                                    "tone": tone, "blink": ev["lost"], "xy": (ev["x"], ev["y"])})
            play_sound(ac.get("bld_sound", "glocke"), ac.get("volume", 80))
            self.popup("bld", icon, title, "X %d · Y %d" % (ev["x"], ev["y"]), C["bad"] if ev["lost"] else (C["good"] if ev["ours"] else C["gold"]))

    def test_alert(self, kind):
        now = int(time.time())
        rules = self.cfg["markers"].get("rules", [])
        if kind == "ball":
            w = (self.ball_words() or ["ball"])[0]
            self.alarm({"x": 612, "y": 845, "t": now, "text": "TEST %s Pass 7" % w, "key": None, "num": 2}, 0)
        elif kind == "marker":
            self.alarm({"x": 540, "y": 700, "t": now, "text": "TEST", "key": None}, 1 if len(rules) > 1 else -1)
        elif kind == "name":
            nm = (self.my_names() or ["mirox"])[0]
            self.mention_alarm({"x": 600, "y": 800, "t": now, "text": "%s Rally Pass 7 (TEST)" % nm.capitalize(), "key": None})
        elif kind == "buff":
            self.event_alarm({"ev": "buff", "kind": "attack", "t": now, "pid": self.scanner.active[0], "text": "TEST"})
        elif kind == "army":
            self.event_alarm({"ev": "buff", "kind": "army", "t": now, "pid": self.scanner.active[0], "text": "TEST"})
        elif kind in ("scout", "rank", "hosp70", "hosp85", "hospdead"):
            ac = self.cfg["alerts"]; was = ac.get("msg_" + kind, True); ac["msg_" + kind] = True
            self.event_alarm({"ev": "msg", "kind": kind, "t": now, "pid": self.scanner.active[0], "text": "TEST [ABC]Spion" if kind == "scout" else "TEST",
                              "tier": "S+", "pct": 85 if kind == "hosp85" else 70, "n": 1374555})
            ac["msg_" + kind] = was
        elif kind == "battle":
            h = next(iter(getattr(self, "_march_all", {}) or {}), (0, 0))
            self.toast.show({"win": True, "pvp": True, "kp": 1181930, "trade": 2.4, "h": list(h), "enemy": "TEST", "lvl": 0, "marches": 4})
        elif kind == "all":
            for i, k in enumerate(("ball", "name", "buff", "bld", "scout", "battle", "rank", "hosp70", "hosp85", "hospdead")):
                self.root.after(i * 2500, lambda k=k: self.test_alert(k))
        else:
            self.event_alarm({"ev": "bld", "t": now, "name": "Lvl 7 Pass", "ours": False, "lost": True, "ally": "TEST", "x": 616, "y": 879, "text": "Fall of Lvl 7 Pass"})

    # ---------- Position der Overlay-Fenster ----------
    def _pos_get(self, which):
        ov = self.cfg["overlay"]
        if which == "ov":                     # gespeicherte Position (wird beim Ziehen und per Knopf aktualisiert)
            return int(ov.get("x", 60)), int(ov.get("y", 60))
        return (self.feed if which == "feed" else self.march).pos()

    def _pos_size(self, which):
        w = self.overlay.win if which == "ov" else (self.feed if which == "feed" else self.march).win
        if w:
            w.update_idletasks()
            return w.winfo_width(), w.winfo_height()
        return px(260), px(300)

    def move_win(self, which, x=None, y=None, dx=0, dy=0, preset=None):
        """Fenster per Knopf verschieben (geht auch mit Durchklick an)."""
        cx, cy = self._pos_get(which)
        if preset:
            sw, sh = self.root.winfo_screenwidth(), self.root.winfo_screenheight()
            ww, wh = self._pos_size(which)
            m = px(12)
            col, row = preset
            x = {"l": m, "c": (sw - ww) // 2, "r": sw - ww - m}[col]
            y = {"t": m, "m": (sh - wh) // 2, "b": sh - wh - px(60)}[row]
        x = cx + dx if x is None else x
        y = cy + dy if y is None else y
        x, y = self.overlay._on_screen(int(x), int(y))
        ov = self.cfg["overlay"]
        if which == "ov":
            ov["x"], ov["y"] = x, y
            if self.overlay.win:
                self.overlay.win.geometry("+%d+%d" % (x, y))
        else:
            ov["pos_" + which] = [x, y]
            f = self.feed if which == "feed" else self.march
            if f.win:
                f.win.geometry("+%d+%d" % (x, y))
        save_cfg(self.cfg)
        pv = getattr(self, "_pos_vars", {}).get(which)
        if pv:
            pv[0].set(str(x)); pv[1].set(str(y))
        lab = getattr(self, "_pos_lab", {}).get(which)
        if lab:
            try:
                lab.configure(text="X %d · Y %d" % (x, y))
            except tk.TclError:
                pass

    def pos_card(self, body):
        T = self.t
        o, c = card(body, "📐 " + T("pos_title")); o.pack(fill="x", pady=(px(14), 0))
        tk.Label(c, text=T("pos_info"), bg=C["card"], fg=C["dim"], font=(FONT, 9), wraplength=px(640), justify="left").pack(anchor="w", pady=(0, px(8)))
        sub = getattr(self, "pos_which", "march")
        Seg(c, [("ov", T("pos_ov")), ("march", T("pos_march")), ("feed", T("pos_feed"))], sub,
            lambda v: (setattr(self, "pos_which", v), self.render())).pack(anchor="w", pady=(0, px(10)))
        row = tk.Frame(c, bg=C["card"]); row.pack(fill="x")
        # 3x3 Raster: Ecke / Mitte waehlen
        g = tk.Frame(row, bg=C["card"]); g.pack(side="left", padx=(0, px(24)))
        tk.Label(g, text=T("pos_quick"), bg=C["card"], fg=C["muted"], font=(FONT, 9)).grid(row=0, column=0, columnspan=3, sticky="w", pady=(0, px(4)))
        sym = {("l", "t"): "↖", ("c", "t"): "↑", ("r", "t"): "↗", ("l", "m"): "←", ("c", "m"): "•", ("r", "m"): "→",
               ("l", "b"): "↙", ("c", "b"): "↓", ("r", "b"): "↘"}
        for ri, rw in enumerate("tmb"):
            for ci, cl in enumerate("lcr"):
                Btn(g, sym[(cl, rw)], lambda p=(cl, rw): self.move_win(sub, preset=p), "ghost", small=True).grid(row=ri + 1, column=ci, padx=px(2), pady=px(2), sticky="we")
        # Feinjustieren
        f = tk.Frame(row, bg=C["card"]); f.pack(side="left", anchor="n")
        tk.Label(f, text=T("pos_fine"), bg=C["card"], fg=C["muted"], font=(FONT, 9)).grid(row=0, column=0, columnspan=3, sticky="w", pady=(0, px(4)))
        st = int(self.cfg["overlay"].get("pos_step", 10))
        Btn(f, "▲", lambda: self.move_win(sub, dy=-int(self.cfg["overlay"].get("pos_step", 10))), "ghost", small=True).grid(row=1, column=1, padx=px(2), pady=px(2))
        Btn(f, "◀", lambda: self.move_win(sub, dx=-int(self.cfg["overlay"].get("pos_step", 10))), "ghost", small=True).grid(row=2, column=0, padx=px(2), pady=px(2))
        Btn(f, "▶", lambda: self.move_win(sub, dx=int(self.cfg["overlay"].get("pos_step", 10))), "ghost", small=True).grid(row=2, column=2, padx=px(2), pady=px(2))
        Btn(f, "▼", lambda: self.move_win(sub, dy=int(self.cfg["overlay"].get("pos_step", 10))), "ghost", small=True).grid(row=3, column=1, padx=px(2), pady=px(2))
        x, y = self._pos_get(sub)
        self._pos_lab = {sub: tk.Label(f, text="X %d · Y %d" % (x, y), bg=C["card"], fg=C["gold"], font=(FONT, 10, "bold"))}
        self._pos_lab[sub].grid(row=2, column=1, padx=px(10))
        # Schrittweite + exakte Eingabe
        e = tk.Frame(row, bg=C["card"]); e.pack(side="left", anchor="n", padx=(px(24), 0))
        tk.Label(e, text=T("pos_step"), bg=C["card"], fg=C["muted"], font=(FONT, 9)).pack(anchor="w", pady=(0, px(4)))
        sr = tk.Frame(e, bg=C["card"]); sr.pack(anchor="w")
        for n in (1, 10, 50):
            Chip(sr, "%d px" % n, st == n, lambda n=n: (self.set_opt("pos_step", n), self.render())).pack(side="left", padx=(0, px(4)))
        tk.Label(e, text=T("pos_exact"), bg=C["card"], fg=C["muted"], font=(FONT, 9)).pack(anchor="w", pady=(px(10), px(4)))
        xr = tk.Frame(e, bg=C["card"]); xr.pack(anchor="w")
        vx, vy = tk.StringVar(value=str(x)), tk.StringVar(value=str(y))
        self._pos_vars = {sub: (vx, vy)}
        tk.Label(xr, text="X", bg=C["card"], fg=C["muted"], font=(FONT, 9)).pack(side="left")
        ex = entry(xr, vx, 6); ex.pack(side="left", padx=(px(4), px(8)))
        tk.Label(xr, text="Y", bg=C["card"], fg=C["muted"], font=(FONT, 9)).pack(side="left")
        ey = entry(xr, vy, 6); ey.pack(side="left", padx=(px(4), px(8)))

        def go_exact(_e=None):
            try:
                self.move_win(sub, x=int(vx.get()), y=int(vy.get()))
            except ValueError:
                pass
        for w_ in (ex, ey):
            w_.bind("<Return>", go_exact)
        Btn(xr, T("pos_set"), go_exact, small=True).pack(side="left")

    def page_ov(self, body):
        T = self.t
        self.focus_bar(body, C["bg"]).pack(fill="x", pady=(0, px(10)))
        sub = getattr(self, "ov_sub", "view")
        if sub == "mods":
            sub = self.ov_sub = "march"
        Seg(body, [("view", "👁 " + T("ovt_view")), ("vals", "📊 " + T("ovt_vals")), ("march", "⚔ " + T("ovt_march")),
                   ("feed", "📰 " + T("ovt_feed")), ("pos", "📐 " + T("ovt_pos"))],
            sub, lambda v: (setattr(self, "ov_sub", v), self.render())).pack(anchor="w", pady=(0, px(4)))
        {"view": self._ov_view, "march": self._ov_march, "feed": self._ov_modules, "pos": self.pos_card, "vals": self._ov_vals}.get(sub, self._ov_view)(body)

    def _ov_view_extra(self, body):
        T, ov = self.t, self.cfg["overlay"]
        o, c = card(body, "🎨 " + T("look_title")); o.pack(fill="x", pady=(px(14), 0))
        g = tk.Frame(c, bg=C["card"]); g.pack(fill="x")
        for i, (key, lab) in enumerate((("icons", "opt_icons"), ("mk_coords", "opt_coords"))):
            v = tk.BooleanVar(value=ov.get(key, True))
            Toggle(g, T(lab), v, lambda key=key, v=v: (self.set_opt(key, v.get()), setattr(self.overlay, "_drawn", None), self.overlay.draw(),
                                                       self.march.draw(True))).grid(row=0, column=i, sticky="w", padx=(0, px(24)))
        self.chips_row(c, T("opt_spacing"), "spacing", [3, 5, 7, 10, 14], lambda v: "%d px" % v,
                       lambda: (setattr(self.overlay, "_drawn", None), self.overlay.draw()), ("px", 1, 0, 40))

    def _ov_view(self, body):
        self._ov_view_main(body)
        self._ov_view_extra(body)

    def _ov_view_main(self, body):
        T, ov = self.t, self.cfg["overlay"]
        top = tk.Frame(body, bg=C["bg"]); top.pack(fill="x", pady=(px(10), 0))
        o, c = card(top, T("card_view")); ov_cards = [o]
        for key, lab in (("show", "ov_show"), ("locked", "ov_lock"), ("pvp_only", "ov_pvp_only"), ("count_pilot", "ov_pilot")):
            v = tk.BooleanVar(value=ov.get(key, key in ("show", "pvp_only")))
            Toggle(c, T(lab), v, lambda k=key, v=v: self.set_opt(k, v.get())).pack(anchor="w", pady=3)
        tk.Label(c, text=T("ov_alpha"), bg=C["card"], fg=C["muted"], font=(FONT, 9)).pack(anchor="w", pady=(8, 0))
        for key, lab in (("alpha", "al_main"), ("alpha_march", "pos_march"), ("alpha_feed", "pos_feed"), ("alpha_toast", "al_toast")):
            r = tk.Frame(c, bg=C["card"]); r.pack(fill="x", pady=(px(2), 0))
            tk.Label(r, text=T(lab), bg=C["card"], fg=C["text"], font=(FONT, 9), width=14, anchor="w").pack(side="left")
            cur = float(ov.get(key, ov.get("alpha", 0.85)))
            Slider(r, cur, 0.2, 1.0, lambda v, key=key: self.set_alpha_of(key, v, False),
                   lambda v, key=key: self.set_alpha_of(key, v, True)).pack(side="left")
        r = tk.Frame(c, bg=C["card"]); r.pack(fill="x", pady=(8, 0))
        tk.Label(r, text=T("ov_size"), bg=C["card"], fg=C["muted"], font=(FONT, 9)).pack(side="left", padx=(8, 4))
        sz = tk.Label(r, text=str(ov.get("size", 11)), bg=C["card"], fg=C["text"], font=(FONT, 10, "bold"), width=3)
        def step(d):
            n = max(8, min(22, int(self.cfg["overlay"].get("size", 11)) + d)); sz.configure(text=str(n)); self.set_opt("size", n)
        Btn(r, "−", lambda: step(-1), "ghost", small=True).pack(side="left"); sz.pack(side="left"); Btn(r, "+", lambda: step(1), "ghost", small=True).pack(side="left")
        r = tk.Frame(c, bg=C["card"]); r.pack(fill="x", pady=(px(8), 0))
        tk.Label(r, text=T("ov_source"), bg=C["card"], fg=C["muted"], font=(FONT, 9)).pack(side="left", padx=(0, px(6)))
        self.src_chips = {}
        for sv in ("web", "local"):
            ch = Chip(r, T("src_" + sv), ov.get("source", "web") == sv, lambda sv=sv: self.set_source(sv))
            ch.pack(side="left", padx=(0, px(4))); self.src_chips[sv] = ch
        r = tk.Frame(c, bg=C["card"]); r.pack(fill="x", pady=(px(8), 0))
        tk.Label(r, text=T("ov_style"), bg=C["card"], fg=C["muted"], font=(FONT, 9)).pack(side="left", padx=(0, px(6)))
        self.style_chips = {}
        for st in OV_STYLES:
            ch = Chip(r, T("st_" + st), ov.get("style", "tiles") == st, lambda st=st: self.set_style(st))
            ch.pack(side="left", padx=(0, px(4))); self.style_chips[st] = ch
        r = tk.Frame(c, bg=C["card"]); r.pack(fill="x", pady=(px(8), 0))
        tk.Label(r, text="📍 " + T("ov_mk_mode"), bg=C["card"], fg=C["muted"], font=(FONT, 9)).pack(anchor="w", pady=(0, px(4)))
        r = tk.Frame(c, bg=C["card"]); r.pack(fill="x")
        self.mm_chips = {}
        for mm in ("off", "ball", "all"):
            ch = Chip(r, T("mm_" + mm), ov.get("mk_mode", "ball") == mm, lambda mm=mm: self.set_mk_mode(mm))
            ch.pack(side="left", padx=(0, px(4))); self.mm_chips[mm] = ch
        r = tk.Frame(c, bg=C["card"]); r.pack(fill="x", pady=(px(6), 0))
        tk.Label(r, text="🎯 " + T("ov_ball_n"), bg=C["card"], fg=C["muted"], font=(FONT, 9)).pack(anchor="w", pady=(0, px(4)))
        r = tk.Frame(c, bg=C["card"]); r.pack(fill="x")
        self.balln_chips = {}
        for n in range(1, 6):
            ch = Chip(r, str(n), int(ov.get("ball_n", 3)) == n, lambda n=n: self.set_ball_n(n))
            ch.pack(side="left", padx=(0, px(4))); self.balln_chips[n] = ch

        o, c = card(top, T("card_range")); ov_cards.append(o); responsive(top, ov_cards, 2, 720)
        chips = tk.Frame(c, bg=C["card"]); chips.pack(anchor="w")
        self.range_chips = {}
        for i, rk in enumerate(RANGES):
            ch = Chip(chips, T(rk).split(" (")[0], ov.get("range") == rk, lambda rk=rk: self.set_range(rk))
            ch.grid(row=i // 3, column=i % 3, padx=(0, 6), pady=3, sticky="we"); self.range_chips[rk] = ch
        r = tk.Frame(c, bg=C["card"]); r.pack(anchor="w", pady=(8, 0))
        tk.Label(r, text=T("ov_since"), bg=C["card"], fg=C["muted"], font=(FONT, 9)).pack(side="left")
        self.v_since = tk.StringVar(value=ov.get("since", ""))
        es = entry(r, self.v_since, 11); es.pack(side="left", padx=6, ipady=3)
        es.bind("<Return>", lambda _e: self.set_since()); es.bind("<FocusOut>", lambda _e: self.set_since())
        Btn(c, "↺  " + T("ov_reset"), self.reset_session, "ghost", small=True).pack(anchor="w", pady=(10, 0))

    def chips_row(self, c, label, key, opts, fmt, after=None, custom=None):
        """Zeile mit Auswahl-Pillen. custom=(einheit, faktor, min, max): eigenes Feld fuer freie Zahl."""
        ov = self.cfg["overlay"]
        r = tk.Frame(c, bg=C["card"]); r.pack(fill="x", pady=(px(8), 0))
        tk.Label(r, text=label, bg=C["card"], fg=C["muted"], font=(FONT, 9), width=16, anchor="w").pack(side="left", padx=(0, px(6)))
        chs = {}
        vv = tk.StringVar()

        def pick(v, from_entry=False):
            self.cfg["overlay"][key] = v; save_cfg(self.cfg); self._sig = None
            for k2, ch in chs.items():
                ch.set(k2 == v)
            if custom and not from_entry:
                vv.set(self._fmt_custom(v, custom))
            if after:
                after()
        for v in opts:
            ch = Chip(r, fmt(v), ov.get(key) == v, lambda v=v: pick(v)); ch.pack(side="left", padx=(0, px(4))); chs[v] = ch
        if custom:
            unit, fac, lo, hi = custom
            vv.set(self._fmt_custom(ov.get(key, 0), custom))
            e = entry(r, vv, 6, center=True); e.pack(side="left", padx=(px(8), px(4)))
            tk.Label(r, text=unit, bg=C["card"], fg=C["dim"], font=(FONT, 9)).pack(side="left")

            def done(_e=None):
                try:
                    x = float(vv.get().replace(",", "."))
                except ValueError:
                    return
                v = int(round(min(hi, max(lo, x)) * fac))
                pick(v, True)
            e.bind("<Return>", done); e.bind("<FocusOut>", done)
        return r

    @staticmethod
    def _fmt_custom(v, custom):
        x = (v or 0) / custom[1]
        return ("%g" % round(x, 2)).replace(".", ",")

    def _ov_mods(self, body):
        self._ov_march(body)
        self._ov_modules(body)

    def _ov_modules(self, body):
        T, ov = self.t, self.cfg["overlay"]
        # --- Module
        o, c = card(body, "📰 " + T("ovt_feed")); o.pack(fill="x", pady=(px(14), 0))
        g = tk.Frame(c, bg=C["card"]); g.pack(fill="x")
        items = (("feed", "mod_feed"), ("feed_pve", "mod_feed_pve"), ("toast", "mod_toast"), ("clickthrough", "mod_click"))
        for i, (key, lab) in enumerate(items):
            v = tk.BooleanVar(value=ov.get(key, key in ("feed", "toast", "icons", "mk_coords", "march_icons")))
            if key == "clickthrough":
                cmd = lambda v=v: self.set_clickthrough(v.get())
            elif key in ("feed", "march"):
                cmd = lambda key=key, v=v: self.set_module(key, v.get())
            elif key in ("icons", "mk_coords", "march_icons"):
                cmd = lambda key=key, v=v: (self.set_opt(key, v.get()), setattr(self.overlay, "_drawn", None), self.overlay.draw(), self.march.draw(True))
            else:
                cmd = lambda key=key, v=v: (self.set_opt(key, v.get()), setattr(self, "_sig", None))
            Toggle(g, T(lab), v, cmd).grid(row=i // 2, column=i % 2, sticky="w", padx=(0, px(24)), pady=px(3))
        self.chips_row(c, T("feed_n"), "feed_n", [3, 4, 5, 6], str, lambda: self.feed.draw(True))
        self.chips_row(c, "⏱ " + T("feed_settle"), "feed_settle", [0, 10, 15, 30, 60], lambda v: T("live") if not v else "%d s" % v,
                       lambda: (self._sig_reset(), self.feed.draw(True)), ("s", 1, 0, 600))
        r = tk.Frame(c, bg=C["card"]); r.pack(fill="x", pady=(px(8), 0))
        vm = tk.BooleanVar(value=ov.get("feed_merge", False))
        Toggle(r, T("feed_merge"), vm, lambda: (self.set_opt("feed_merge", vm.get()), self._sig_reset(), self.feed.draw(True))).pack(anchor="w")
        # Leistung
        o, c = card(body, "⚙ " + T("perf_title")); o.pack(fill="x", pady=(px(14), 0))
        self.chips_row(c, T("calc_every"), "calc_every", [2, 5, 10], lambda v: "%d s" % v, None, ("s", 1, 1, 60))
        tk.Label(c, text=T("calc_info"), bg=C["card"], fg=C["dim"], font=(FONT, 8), wraplength=px(640), justify="left").pack(anchor="w", pady=(px(4), 0))
        tk.Label(c, text=T("perf_tips"), bg=C["card"], fg=C["muted"], font=(FONT, 9), wraplength=px(640), justify="left").pack(anchor="w", pady=(px(8), 0))

    def _ov_march(self, body):
        T, ov = self.t, self.cfg["overlay"]
        o, c = card(body, "⚔ " + T("mod_march")); o.pack(fill="x", pady=(px(14), 0))
        g = tk.Frame(c, bg=C["card"]); g.pack(fill="x", pady=(0, px(8)))
        vm_ = tk.BooleanVar(value=ov.get("march", False))
        Toggle(g, T("march_show"), vm_, lambda: self.set_module("march", vm_.get())).grid(row=0, column=0, sticky="w", padx=(0, px(24)))
        vi_ = tk.BooleanVar(value=ov.get("march_icons", True))
        Toggle(g, T("opt_march_icons"), vi_, lambda: (self.set_opt("march_icons", vi_.get()), self.march.draw(True))).grid(row=0, column=1, sticky="w")
        tk.Label(c, text=T("slot_info"), bg=C["card"], fg=C["dim"], font=(FONT, 9), wraplength=px(640), justify="left").pack(anchor="w", pady=(0, px(8)))
        n = int(ov.get("march_n", 4))
        sl = list(ov.get("march_slots") or []) + [None] * 7
        cur = {r["slot"]: r for r in getattr(self, "_marches", [])}
        grid = tk.Frame(c, bg=C["card"]); grid.pack(fill="x")
        for i in range(n):
            slot = n - i
            r = tk.Frame(grid, bg=C["card2"], padx=px(10), pady=px(6)); r.pack(fill="x", pady=px(2))
            tk.Label(r, text=str(slot), bg=C["card2"], fg=C["gold"], font=(FONT, 13, "bold"), width=2).pack(side="left")
            k = tuple(sl[i]) if sl[i] else None
            row = cur.get(slot) or {}
            shown = row.get("k")
            txt = self.pair_name(k) if k else "⚡ %s%s" % (T("march_auto_s"), (" → " + self.pair_name(shown)) if shown else "")
            tk.Label(r, text=txt, bg=C["card2"], fg=C["text"] if k else C["muted"], font=(FONT, 10, "bold" if k else "normal"),
                     anchor="w").pack(side="left", fill="x", expand=True, padx=(px(8), 0))
            if shown:
                tk.Label(r, text="⚔ %s" % fmt_num(row.get("kp", 0), self.cfg["lang"]), bg=C["card2"], fg=C["gold"], font=(FONT, 9, "bold")).pack(side="left", padx=px(8))
            b = Btn(r, T("slot_choose"), lambda: None, "ghost", small=True); b.pack(side="right")
            if shown:
                Btn(r, "🔍", lambda k=shown: self.march_details(k), "ghost", small=True).pack(side="right", padx=(0, px(6)))
            b._cmd = lambda i=i, b=b: self.slot_menu(self.root, i).tk_popup(b.winfo_rootx(), b.winfo_rooty() + b.winfo_height())
            if k:
                Btn(r, "✕", lambda i=i: self.set_march_slot(i, None), "ghost", small=True).pack(side="right", padx=(0, px(6)))
        rb = tk.Frame(c, bg=C["card"]); rb.pack(fill="x", pady=(px(6), 0))
        Btn(rb, "⚡ " + T("slot_all_auto"), self.slots_auto, "ghost", small=True).pack(side="left")
        Btn(rb, "📌 " + T("slot_fix_now"), self.slots_fix, "ghost", small=True).pack(side="left", padx=(px(6), 0))
        redraw_all = lambda: (TRADE_FMT.update(v=self.cfg["overlay"].get("trade_fmt", "pct")), self.march.draw(True), self.feed.draw(True))
        self.chips_row(c, "🖼 " + T("icon_px"), "icon_px", [32, 40, 48, 56], lambda v: "%d px" % v, redraw_all)
        r = tk.Frame(c, bg=C["card"]); r.pack(fill="x", pady=(px(8), 0))
        vo = tk.BooleanVar(value=ov.get("hero_one", False))
        Toggle(r, T("hero_one"), vo, lambda: (self.set_opt("hero_one", vo.get()), redraw_all())).pack(anchor="w")
        self.chips_row(c, "⚖ " + T("trade_fmt"), "trade_fmt", ["pct", "ratio"], lambda v: T("tf_" + v), redraw_all)
        self.chips_row(c, "🔗 " + T("streak_gap"), "streak_gap", [0, 60, 90, 120, 180], lambda v: T("off") if not v else "%d s" % v,
                       lambda: (STREAK_GAP.update(v=int(self.cfg["overlay"].get("streak_gap", 90))), self._sig_reset(), self.feed.draw(True)), ("s", 1, 0, 900))
        tk.Label(c, text=T("streak_info"), bg=C["card"], fg=C["dim"], font=(FONT, 8), wraplength=px(640), justify="left").pack(anchor="w", pady=(px(2), 0))
        self.chips_row(c, T("march_kind"), "march_kind", ["auto", "pvp", "pve"], lambda v: T("mk_" + v),
                       lambda: (self._sig_reset(), self.march.draw(True)))
        self.chips_row(c, T("march_n"), "march_n", [1, 2, 3, 4, 5, 6, 7], str, lambda: (self.march.draw(True), self._sig_reset(), self.render()))
        r = tk.Frame(c, bg=C["card"]); r.pack(fill="x", pady=(px(8), 0))
        tk.Label(r, text=T("march_vals"), bg=C["card"], fg=C["muted"], font=(FONT, 9), width=16, anchor="w").pack(side="left", padx=(0, px(6)))
        mv_chips = {}

        def mv_toggle(v):
            cur_ = list(self.cfg["overlay"].get("march_vals") or ["kp", "trade"])
            if v in cur_ and len(cur_) > 1:
                cur_.remove(v)
            elif v not in cur_ and len(cur_) < 4:
                cur_.append(v)
            self.cfg["overlay"]["march_vals"] = [x for x in MarchWin.VALS if x in cur_]; save_cfg(self.cfg)
            for k2, ch in mv_chips.items():
                ch.set(k2 in cur_)
            self.march.draw(True)
        for v in MarchWin.VALS:
            ch = Chip(r, MarchWin.VALS[v][0] + " " + T("mv_" + v), v in (ov.get("march_vals") or ["kp", "trade"]), lambda v=v: mv_toggle(v))
            ch.pack(side="left", padx=(0, px(4))); mv_chips[v] = ch
        self.chips_row(c, T("march_reset"), "march_reset", ["last", "sum"], lambda v: T("mr_" + v),
                       lambda: (self._sig_reset(), self.march.draw(True)))
        self.chips_row(c, T("march_gap"), "march_gap", [70, 84, 96, 110, 124], lambda v: "%d px" % v, lambda: self.march.draw(True), ("px", 1, 40, 250))
        tk.Label(c, text=T("last_info"), bg=C["card"], fg=C["dim"], font=(FONT, 8), wraplength=px(640), justify="left").pack(anchor="w", pady=(px(8), 0))
        tk.Label(c, text=T("march_info"), bg=C["card"], fg=C["dim"], font=(FONT, 8), wraplength=px(640), justify="left").pack(anchor="w", pady=(px(4), 0))

    def _sig_reset(self):
        self._sig = None
        self.update_modules(getattr(self, "_ids_cur", None), getattr(self, "_since_cur", 0), True)
        self.march.draw(True)

    def slots_auto(self):
        self.cfg["overlay"]["march_slots"] = [None] * 7; save_cfg(self.cfg)
        self._sig_reset(); self.render()

    def slots_fix(self):
        """Die gerade automatisch gezeigten Maersche fest auf ihre Plaetze legen."""
        sl = [None] * 7
        for i, r in enumerate(getattr(self, "_marches", [])[:7]):
            sl[i] = list(r["k"]) if r.get("k") else None
        self.cfg["overlay"]["march_slots"] = sl; save_cfg(self.cfg)
        self._sig_reset(); self.render(); self.flash("📌 " + self.t("slot_fixed"))

    def _ov_vals(self, body):
        self._ov_vals_main(body)
        T, ov = self.t, self.cfg["overlay"]
        redraw = lambda: (setattr(self.overlay, "_drawn", None), self.overlay.draw())
        o, c = card(body, "🏁 " + T("goals_title")); o.pack(fill="x", pady=(px(14), 0))
        self.chips_row(c, "🏁 " + T("goal_today"), "goal_kp", [0, 5000000, 10000000, 25000000, 50000000],
                       lambda v: T("off") if not v else fmt_num(v, self.cfg["lang"]), redraw, ("Mio.", 1000000, 0, 5000))
        self.chips_row(c, "★ " + T("goal_acc"), "goal_acc", [0, 50000, 100000, 250000, 500000],
                       lambda v: T("off") if not v else fmt_num(v, self.cfg["lang"]), redraw, ("Tsd.", 1000, 0, 100000))

    def _ov_vals_main(self, body):
        T, ov = self.t, self.cfg["overlay"]
        o, c = card(body, T("card_values")); o.pack(fill="both", expand=True, pady=(14, 0))
        grid = tk.Frame(c, bg=C["card"]); grid.pack(anchor="w")
        self.metric_chips = {}
        for i, k in enumerate(METRICS):
            ch = Chip(grid, T(k), k in ov["metrics"], lambda k=k: self.toggle_metric(k))
            ch.grid(row=i // 3, column=i % 3, padx=(0, 6), pady=3, sticky="we"); self.metric_chips[k] = ch
        tk.Label(c, text=T("ov_hint"), bg=C["card"], fg=C["dim"], font=(FONT, 8), wraplength=600, justify="left").pack(anchor="w", pady=(10, 0))
        # Reihenfolge
        o, c = card(body, "↕ " + T("order_title")); o.pack(fill="x", pady=(14, 0))
        tk.Label(c, text=T("order_info"), bg=C["card"], fg=C["dim"], font=(FONT, 9), wraplength=px(640), justify="left").pack(anchor="w", pady=(0, px(6)))
        ms = list(ov["metrics"])
        for i, k in enumerate(ms):
            r = tk.Frame(c, bg=C["card2"], padx=px(10), pady=px(4)); r.pack(fill="x", pady=px(2))
            tk.Label(r, text="%d" % (i + 1), bg=C["card2"], fg=C["gold"], font=(FONT, 11, "bold"), width=2).pack(side="left")
            tk.Label(r, text="%s  %s" % (ICONS.get(k, ""), T(k)), bg=C["card2"], fg=C["text"], font=(FONT, 10), anchor="w").pack(side="left", fill="x", expand=True)
            Btn(r, "✕", lambda k=k: self.toggle_metric(k), "ghost", small=True).pack(side="right")
            Btn(r, "▼", lambda i=i: self.move_metric(i, 1), "ghost", small=True).pack(side="right", padx=(0, px(4)))
            Btn(r, "▲", lambda i=i: self.move_metric(i, -1), "ghost", small=True).pack(side="right", padx=(0, px(4)))

    def move_metric(self, i, d):
        ms = self.cfg["overlay"]["metrics"]
        j = i + d
        if 0 <= j < len(ms):
            ms[i], ms[j] = ms[j], ms[i]
            save_cfg(self.cfg); self.overlay._drawn = None; self.overlay.draw(); self.render()

    def page_set(self, body):
        T = self.t
        o, c = card(body, T("card_folders")); o.pack(fill="x")
        for g in self.cfg["game_folders"]:
            r = tk.Frame(c, bg=C["card2"]); r.pack(fill="x", pady=2)
            ok = os.path.isdir(os.path.join(g, "save", "mailcache"))
            tk.Label(r, text=("✔ " if ok else "✖ ") + g, bg=C["card2"], fg=C["text"] if ok else C["bad"], font=(FONT, 9), anchor="w", padx=10, pady=6).pack(side="left", fill="x", expand=True)
            x = tk.Label(r, text="✕", bg=C["card2"], fg=C["dim"], font=(FONT, 10, "bold"), padx=10, cursor="hand2"); x.pack(side="right")
            x.bind("<Button-1>", lambda e, g=g: self.remove_folder(g))
        r = tk.Frame(c, bg=C["card"]); r.pack(anchor="w", pady=(8, 0))
        Btn(r, "+ " + T("add"), self.add_folder, "ghost", small=True).pack(side="left")
        Btn(r, "🔍 " + T("detect"), self.detect, "ghost", small=True).pack(side="left", padx=6)

        row = tk.Frame(body, bg=C["bg"]); row.pack(fill="x", pady=14)
        o, c = card(row, T("card_upload")); set_cards = [o]
        v = tk.BooleanVar(value=self.cfg.get("upload", False))
        tg = Toggle(c, T("upload"), v, lambda: self.set_cfg("upload", v.get())); tg.pack(anchor="w")
        if UP is None:
            tg.lb.configure(fg=C["dim"]); tg.unbind("<Button-1>"); tg.cv.unbind("<Button-1>"); tg.lb.unbind("<Button-1>")
            tk.Label(c, text=T("upload_off"), bg=C["card"], fg=C["bad"], font=(FONT, 8), wraplength=300, justify="left").pack(anchor="w", pady=(6, 0))
        else:
            tk.Label(c, text=T("upload_hint"), bg=C["card"], fg=C["dim"], font=(FONT, 8), wraplength=300, justify="left").pack(anchor="w", pady=(6, 0))
        r = tk.Frame(c, bg=C["card"]); r.pack(anchor="w", pady=(8, 0))
        tk.Label(r, text=T("upload_days"), bg=C["card"], fg=C["muted"], font=(FONT, 9)).pack(side="left")
        dl = tk.Label(r, text=str(self.cfg.get("upload_days", 14)), bg=C["card"], fg=C["text"], font=(FONT, 10, "bold"), width=4)
        def dstep(d):
            n = max(1, min(365, int(self.cfg.get("upload_days", 14)) + d)); dl.configure(text=str(n)); self.set_cfg("upload_days", n)
        Btn(r, "−", lambda: dstep(-7), "ghost", small=True).pack(side="left", padx=(6, 0)); dl.pack(side="left"); Btn(r, "+", lambda: dstep(7), "ghost", small=True).pack(side="left")

        o, c = card(body, "⌨ " + T("hk_title")); o.pack(fill="x", pady=(0, px(14)))
        tk.Label(c, text=T("hk_set_info"), bg=C["card"], fg=C["dim"], font=(FONT, 9), wraplength=px(640), justify="left").pack(anchor="w", pady=(0, px(6)))
        for combo, act in hotkey_list(self):
            r = tk.Frame(c, bg=C["card"]); r.pack(fill="x", pady=px(3))
            tk.Label(r, text=T(act + "_l"), bg=C["card"], fg=C["text"], font=(FONT, 10), width=22, anchor="w").pack(side="left")
            vv = tk.StringVar(value=combo)
            e = entry(r, vv, 18, center=True); e.pack(side="left")
            e.bind("<KeyPress>", lambda ev, vv=vv, act=act: self.capture_key(ev, vv, act))
            ok = act in (getattr(self, "_hotkeys_ok", None) or [])
            tk.Label(r, text=("✔" if ok else "✖ " + T("hk_busy")) if IS_WIN else "", bg=C["card"], fg=C["good"] if ok else C["bad"],
                     font=(FONT, 9, "bold")).pack(side="left", padx=px(8))
        Btn(c, "↺ " + T("hk_reset_all"), self.reset_hotkeys, "ghost", small=True).pack(anchor="w", pady=(px(6), 0))

        o, c = card(row, T("card_start")); set_cards.append(o); responsive(row, set_cards, 2, 720)
        Btn(c, "🪟  " + T("autostart"), self.autostart, "ghost", small=True).pack(anchor="w")
        v2 = tk.BooleanVar(value=self.cfg.get("start_min", False))
        Toggle(c, T("start_min"), v2, lambda: self.set_cfg("start_min", v2.get())).pack(anchor="w", pady=8)
        v3 = tk.BooleanVar(value=self.cfg.get("rok_only", False))
        Toggle(c, T("rok_only"), v3, lambda: (self.set_cfg("rok_only", v3.get()), self.check_rok(), self.render())).pack(anchor="w", pady=(0, 4))
        tk.Label(c, text=T("rok_only_info") + "  " + (T("rok_now_on") if rok_running(self.cfg.get("game_folders", [])) else T("rok_now_off")),
                 bg=C["card"], fg=C["dim"], font=(FONT, 8), wraplength=px(300), justify="left").pack(anchor="w", pady=(0, 8))
        r = tk.Frame(c, bg=C["card"]); r.pack(anchor="w")
        for code, lab in (("de", "Deutsch"), ("en", "English")):
            Chip(r, lab, self.cfg.get("lang", "de") == code, lambda code=code: self.set_lang(code)).pack(side="left", padx=(0, 6))

    def capture_key(self, ev, vv, act):
        """Ins Feld klicken und die gewuenschte Kombination druecken (z. B. Strg+Umschalt+F2)."""
        k = ev.keysym
        if k in ("Control_L", "Control_R", "Alt_L", "Alt_R", "Shift_L", "Shift_R", "Super_L", "Super_R", "Meta_L", "Meta_R"):
            return "break"
        if k in ("BackSpace", "Escape"):
            vv.set(""); return "break"
        parts = []
        if ev.state & 0x4:
            parts.append("Strg")
        if ev.state & 0x20000 or ev.state & 0x8:
            parts.append("Alt")
        if ev.state & 0x1:
            parts.append("Shift")
        key = k.upper() if len(k) == 1 else {"space": "SPACE", "Prior": "PAGEUP", "Next": "PAGEDOWN"}.get(k, k.upper())
        if key.startswith("KP_") and key[3:].isdigit():
            key = "NUM" + key[3:]
        combo = "+".join(parts + [key])
        if not parts or not parse_hotkey(combo):
            self.flash("⌨ " + self.t("hk_need_mod")); return "break"
        vv.set(combo)
        hk = self.cfg.setdefault("hotkeys", {}); hk[act] = combo; save_cfg(self.cfg)
        restart_hotkeys(self)
        self.root.after(400, self.render)
        return "break"

    def reset_hotkeys(self):
        self.cfg["hotkeys"] = {}; save_cfg(self.cfg); restart_hotkeys(self); self.root.after(400, self.render)

    # ---------- Aktionen ----------
    def pair(self):
        code = self.v_code.get().strip().upper().replace(" ", "")
        self.cfg["api_base"] = self.v_site.get().strip().rstrip("/") or DEFAULT_CFG["api_base"]
        if len(code) != 6:
            messagebox.showwarning("Wiz fan Club", self.t("code") + ": 6"); return
        self.btn_pair.enable(False)

        def done(d, err):
            if err:
                self.btn_pair.enable(True); messagebox.showerror(self.t("err"), str(err)); return
            self.cfg["token"] = d["token"]; self.cfg["user_name"] = (d.get("user") or {}).get("name", "")
            save_cfg(self.cfg); self.page = "acc"
            self.run_bg(self.refresh_me)
        dev = (self.v_dev.get().strip() or "PC")[:40]           # selbst gewaehlter Name – nie der Windows-Computername
        self.cfg["device_name"] = dev; save_cfg(self.cfg)
        self.run_bg(lambda: self.api("pair", {"code": code, "device_name": dev}, auth=False), done)

    def default_dev_name(self):
        """Vorschlag: In-Game-Name des zuletzt aktiven Accounts, sonst „PC“."""
        try:
            with self.scanner.lock:
                o = max(self.scanner.owners.values(), key=lambda x: x.get("last", 0), default=None)
            return ("%s PC" % o["name"])[:40] if o and o.get("name") else "PC"
        except Exception:
            return "PC"

    def disconnect(self):
        if messagebox.askyesno("Wiz fan Club", self.t("disconnect") + "?"):
            self.cfg["token"] = ""; self.cfg["user_name"] = ""; self.cfg["links"] = []; self.cfg["profile_gov"] = ""
            save_cfg(self.cfg); self.render()

    def open_page(self):
        import webbrowser
        self.cfg["api_base"] = self.v_site.get().strip().rstrip("/") or DEFAULT_CFG["api_base"]
        save_cfg(self.cfg)
        webbrowser.open(self.cfg["api_base"] + "/uploader.html")

    def since_menu(self, pid, w):
        """Ab wann zaehlen die Stats dieses Accounts? (z. B. Beginn des Pilotierens)"""
        T = self.t
        m = tk.Menu(self.root, tearoff=0, bg=C["card"], fg=C["text"], activebackground=C["gold_dim"], activeforeground=C["gold"])
        m.add_command(label="⏱ " + T("since_now"), command=lambda: self.set_since_acc(pid, time.time()))
        m.add_command(label="✎ " + T("since_enter"), command=lambda: self.ask_since(pid))
        m.add_command(label="✕ " + T("since_none"), command=lambda: self.set_since_acc(pid, None))
        m.tk_popup(w.winfo_rootx(), w.winfo_rooty() + w.winfo_height())

    def ask_since(self, pid):
        from tkinter import simpledialog
        v = simpledialog.askstring("Wiz fan Club", self.t("since_ask"), parent=self.root,
                                   initialvalue=datetime.now().strftime("%d.%m.%Y %H:%M"))
        if not v:
            return
        for fmt in ("%d.%m.%Y %H:%M", "%d.%m.%Y", "%d.%m. %H:%M", "%Y-%m-%d %H:%M", "%Y-%m-%d"):
            try:
                d = datetime.strptime(v.strip(), fmt)
                if d.year == 1900:
                    d = d.replace(year=datetime.now().year)
                self.set_since_acc(pid, d.timestamp()); return
            except ValueError:
                pass
        messagebox.showwarning("Wiz fan Club", self.t("since_ask"))

    def set_since_acc(self, pid, ts):
        d = self.cfg.setdefault("acc_since", {})
        if ts:
            d[str(pid)] = int(ts)
        else:
            d.pop(str(pid), None)
        save_cfg(self.cfg); self._sig = None; self._web_due = 0; self.overlay._drawn = None
        self.render()

    def add_id(self, kind):
        gid = "".join(ch for ch in self.v_addid.get() if ch.isdigit())
        if not (5 <= len(gid) <= 12):
            messagebox.showwarning("Wiz fan Club", self.t("c_id") + "?"); return
        self.bind_acc(int(gid), True, kind)

    def bind_acc(self, pid, on, kind="alt"):
        if not self.cfg.get("token"):
            messagebox.showinfo("Wiz fan Club", self.t("need_conn")); self.go("conn"); return
        name = (self.scanner.owners.get(int(pid)) or {}).get("name", "")

        def done(d, err):
            if err:
                messagebox.showerror(self.t("err"), str(err)); return
            self.cfg["links"] = d.get("links", []); save_cfg(self.cfg); self.render()
        self.run_bg(lambda: self.api("link" if on else "unlink", {"governor_id": str(pid), "gov_name": name, "kind": kind}), done)

    POPUPS = [("battle", "⚔", True), ("ball", "🎯", False), ("marker", "📍", False), ("mention", "📣", True), ("army", "🪖", False),
              ("buff", "⏳", False), ("exp", "🪖", False), ("scout", "🔭", False), ("hosp", "🏥", False), ("rank", "🏆", True), ("bld", "🏰", False)]

    def popup_on(self, kind):
        p = self.cfg.get("popups") or {}
        if kind == "battle":
            return self.cfg["overlay"].get("toast", True)
        if kind == "army" and "army" not in p and self.cfg["alerts"].get("buff_popup"):
            return True
        return p.get(kind, dict((k, d) for k, _i, d in self.POPUPS).get(kind, False))

    def popup_col(self, kind, dflt=None):
        return (self.cfg.get("popups_col") or {}).get(kind) or dflt

    def popup(self, kind, icon, title, sub, col=None):
        if self.popup_on(kind):
            self.toast.show_msg(icon, title, sub, self.popup_col(kind, col or C["bad"]))

    def ov_on(self):
        return self.cfg["overlay"].get("all_on", True) and (not self.cfg.get("rok_only") or getattr(self, "_rok_up", True))

    def check_rok(self):
        """Alle 5 s: laeuft Rise of Kingdoms? -> Overlay + App zeigen bzw. verstecken."""
        if not self.cfg.get("rok_only"):
            if not getattr(self, "_rok_up", True):
                self._rok_up = True; self.apply_windows()
            return
        up = rok_running(self.cfg.get("game_folders", []))
        if up == getattr(self, "_rok_up", None):
            return
        self._rok_up = up
        self.apply_windows()
        if up and getattr(self, "_hidden_for_rok", False):
            self._hidden_for_rok = False
            if self.cfg.get("start_min"):
                self.root.deiconify(); self.root.iconify()
            else:
                self.root.deiconify()
        elif not up and self.cfg.get("rok_hide_app", True):
            self._hidden_for_rok = True; self.root.withdraw()

    def apply_windows(self):
        on, ov = self.ov_on(), self.cfg["overlay"]
        self.overlay.show(on and ov.get("show", True))
        self.feed.show(on and ov.get("feed", True)); self.march.show(on and ov.get("march", False))
        if not on:
            self.banner.hide(); self.border.hide()

    def set_master(self, on):
        """Hauptschalter: ALLE Overlay-Fenster + Pop-ups an/aus (die einzelnen Einstellungen bleiben gespeichert)."""
        ov = self.cfg["overlay"]
        ov["all_on"] = on; save_cfg(self.cfg)
        self.apply_windows()
        if self.page == "home":
            self.render()

    def set_opt(self, key, val):
        self._sig = None
        self.cfg["overlay"][key] = val
        save_cfg(self.cfg)
        if key == "show":
            self.overlay.show(val and self.ov_on())
            if self.page == "ov":
                self.render()
        elif key == "alpha" and self.overlay.win:
            self.overlay.win.attributes("-alpha", val)
        elif key == "size":
            self.overlay.draw()

    def set_alpha_of(self, key, a, save):
        """Deckkraft eines einzelnen Fensters (live beim Schieben, gespeichert beim Loslassen)."""
        self.cfg["overlay"][key] = a
        w = {"alpha": self.overlay.win, "alpha_march": self.march.win, "alpha_feed": self.feed.win}.get(key)
        if w:
            try:
                w.attributes("-alpha", a)
            except tk.TclError:
                pass
        if save:
            save_cfg(self.cfg)
            if key == "alpha_toast":
                self.test_alert("battle")

    def set_alpha(self, a):
        self.set_opt("alpha", a)
        for k, ch in getattr(self, "alpha_chips", {}).items():
            try:
                ch.set(k == a)
            except tk.TclError:
                pass

    def set_source(self, sv):
        self.cfg["overlay"]["source"] = sv; save_cfg(self.cfg); self._sig = None; self._web_due = 0
        for k, ch in getattr(self, "src_chips", {}).items():
            try:
                ch.set(k == sv)
            except tk.TclError:
                pass

    def set_style(self, st):
        self.cfg["overlay"]["style"] = st; save_cfg(self.cfg)
        for k, ch in getattr(self, "style_chips", {}).items():
            try:
                ch.set(k == st)
            except tk.TclError:
                pass
        self.overlay._drawn = None; self.overlay.draw()

    def set_mk_mode(self, mm):
        self.cfg["overlay"]["mk_mode"] = mm; save_cfg(self.cfg)
        for k, ch in getattr(self, "mm_chips", {}).items():
            try:
                ch.set(k == mm)
            except tk.TclError:
                pass
        self.overlay._drawn = None; self.overlay.draw()

    def set_ball_n(self, n):
        self.cfg["overlay"]["ball_n"] = n; save_cfg(self.cfg)
        for k, ch in getattr(self, "balln_chips", {}).items():
            try:
                ch.set(k == n)
            except tk.TclError:
                pass
        self.overlay._drawn = None; self.overlay.draw()

    def set_cfg(self, key, val):
        self.cfg[key] = val; save_cfg(self.cfg)

    def toggle_metric(self, k):
        ms = self.cfg["overlay"]["metrics"]
        if k in ms:
            ms.remove(k)
        else:
            ms.append(k)
        self.cfg["overlay"]["metrics"] = [m for m in ms if m in METRICS]     # eigene Reihenfolge bleibt, neue kommen ans Ende
        save_cfg(self.cfg)
        if self.page == "ov" and getattr(self, "ov_sub", "") == "vals":
            self.render()
        if getattr(self, "metric_chips", None) and self.page == "ov":
            try:
                self.metric_chips[k].set(k in ms)
            except tk.TclError:
                pass
        self.overlay.draw()

    def set_range(self, rk):
        self._sig = None
        self.cfg["overlay"]["range"] = rk; save_cfg(self.cfg)
        if self.page in ("ov", "home"):
            for k, ch in self.range_chips.items():
                try:
                    ch.set(k == rk)
                except tk.TclError:
                    pass
        self.overlay.draw()

    def set_since(self):
        s = self.v_since.get().strip()
        try:
            if s:
                datetime.strptime(s, "%Y-%m-%d")
            self.cfg["overlay"]["since"] = s; save_cfg(self.cfg)
            if s:
                self.set_range("r_since")
        except ValueError:
            pass

    def reset_session(self):
        self._sig = None
        self.session_start = time.time()
        self.set_range("r_session")

    def add_folder(self):
        p = filedialog.askdirectory(title=self.t("folders"))
        if p:
            p = os.path.normpath(p)
            if os.path.basename(p).lower() == "mailcache":
                p = os.path.dirname(os.path.dirname(p))
            elif os.path.basename(p).lower() == "save":
                p = os.path.dirname(p)
            if p not in self.cfg["game_folders"]:
                self.cfg["game_folders"].append(p); save_cfg(self.cfg); self.render()

    def remove_folder(self, g):
        if g in self.cfg["game_folders"]:
            self.cfg["game_folders"].remove(g); save_cfg(self.cfg); self.render()

    def detect(self):
        for p in detect_folders():
            if p not in self.cfg["game_folders"]:
                self.cfg["game_folders"].append(p)
        save_cfg(self.cfg); self.render()

    def autostart(self):
        try:
            sdir = os.path.join(os.environ["APPDATA"], r"Microsoft\Windows\Start Menu\Programs\Startup")
            exe = sys.executable.replace("python.exe", "pythonw.exe")
            target = '"%s"' % sys.executable if FROZEN else '"%s" "%s"' % (exe, os.path.abspath(__file__))
            with open(os.path.join(sdir, "WizFanClubApp.cmd"), "w", encoding="utf-8") as f:
                f.write('@echo off\ncd /d "%s"\nstart "" %s\n' % (HERE, target))
            messagebox.showinfo("Wiz fan Club", "✔ " + self.t("autostart"))
        except Exception as e:
            messagebox.showerror(self.t("err"), str(e))

    def set_lang(self, code):
        self.cfg["lang"] = code; save_cfg(self.cfg)
        self.build_ui(); self.overlay.draw()

    def flash(self, msg):
        self._flash = (msg, time.time())

    def show_main(self):
        self.root.deiconify(); self.root.lift()

    # ---------- Takt ----------
    def tick(self):
        try:
            ov = self.cfg["overlay"]
            now = time.time()
            rng = ov.get("range", "r_session")
            if rng == "r_session":
                since = self.session_start
            elif rng == "r_today":
                since = datetime.combine(date.today(), datetime.min.time()).timestamp()
            elif range_days(rng):
                since = (now - range_days(rng) * 86400) // 600 * 600   # auf 10 Min gerundet -> Zahlen springen nicht
            elif rng == "r_since" and ov.get("since"):
                since = datetime.strptime(ov["since"], "%Y-%m-%d").timestamp()
            else:
                since = 0
            fgid = self.focus_id()
            acc_since = (self.cfg.get("acc_since") or {}).get(str(fgid)) if fgid else None
            if acc_since and acc_since > since:                      # z. B. Pilot erst ab heute 14:30
                since = acc_since
            if fgid:                                                # ein Account (automatisch der gerade gespielte, oder gewaehlt)
                ids = {fgid}
                self._ids_cur = ids
            else:
                links = [x for x in self.cfg.get("links", []) if x.get("status", "ok") == "ok"
                         and (x.get("kind") != "pilot" or ov.get("count_pilot"))]
                ids = {int(x["governor_id"]) for x in links} if self.cfg.get("links") else None    # None = alle Accounts
            self._ids_cur = ids
            self._since_cur = since
            with self.scanner.lock:
                nm, self.scanner.new_markers = self.scanner.new_markers, []
                ver = self.scanner.ver
            TRADE_FMT["v"], TRADE_FMT["lang"] = ov.get("trade_fmt", "pct"), self.cfg.get("lang", "de")
            STREAK_GAP["v"] = int(ov.get("streak_gap", 90))
            every = max(1, int(ov.get("calc_every", 5)))
            self.scanner.calc_every = every
            if ver != getattr(self, "_ver_used", None) and now - getattr(self, "_calc_at", 0) >= every:
                self._ver_used = ver                                   # im grossen Kampf hoechstens alle X s neu rechnen
            sig = (getattr(self, "_ver_used", 0), rng, since if not range_days(rng) else int(since // 60), ov.get("pvp_only", True),
                   tuple(sorted(ids)) if ids is not None else None, self.cfg.get("lang"), int(now // 30))
            sig_changed = sig != getattr(self, "_sig", None)
            if sig_changed:
                self._sig = sig
                self._calc_at = now
                bs = self.scanner.battle_list()
                self._local = compute(bs, ids, rng, since, ov.get("pvp_only", True), self.cfg.get("lang", "de"))
                if ov.get("source", "web") == "web" and getattr(self, "_web_stats", None) and self.cfg.get("token"):
                    self._vals = web_vals(self._web_stats, self._local, self.cfg.get("lang", "de"))   # bis neue Website-Zahlen da sind
                else:
                    self._vals = self._local
            web = ov.get("source", "web") == "web" and self.cfg.get("token")
            q = "stats&since=%d&pvp=%d&pilot=%d&only=%s" % (int(since) // 60 * 60, 1 if ov.get("pvp_only", True) else 0,
                                                             1 if ov.get("count_pilot") else 0, fgid or "")
            if web and getattr(self, "_web_q", None) == q and getattr(self, "_web_stats", None) and self._vals.get("_src") != "web":
                self._vals = web_vals(self._web_stats, self._local, self.cfg.get("lang", "de"))     # letzte Website-Zahlen behalten
            if web and getattr(self, "_web_q", None) != q:
                self._web_due = 0                                   # Zeitraum/Filter geaendert -> sofort fragen
            if web and now >= getattr(self, "_web_due", 0) and not getattr(self, "_web_busy", False):
                self._web_due = now + 15                            # alle 15 s
                self._web_busy = True
                lang = self.cfg.get("lang", "de")

                def got(d, err, q=q):
                    self._web_busy = False
                    if not err and d and d.get("empty"):                 # z. B. neuer Pilot-Account noch nicht bestaetigt -> PC-Zahlen
                        self._web_q, self._web_stats = q, None
                        self._vals = getattr(self, "_local", {})
                        return
                    if err or not d or not d.get("stats"):
                        self._web_err = str(err) if err else ""
                        if getattr(self, "_web_q", None) != q:
                            self._web_q = q                              # nicht jede Sekunde neu versuchen, letzte Zahlen bleiben stehen
                        return
                    self._web_err, self._web_q, self._web_stats = "", q, d["stats"]
                    self._vals = web_vals(d["stats"], getattr(self, "_local", {}), lang)
                self.run_bg(lambda: self.api(q), got)
            if ov.get("source", "web") != "web" and getattr(self, "_vals", {}).get("_src") == "web":
                self._vals = getattr(self, "_local", {})
            self._ticks = getattr(self, "_ticks", 0)
            for mk in sorted(nm, key=lambda m: m["t"]):
                self.alarm(mk)
            with self.scanner.lock:
                ne, self.scanner.new_events = self.scanner.new_events, []
            for ev in sorted(ne, key=lambda e: e["t"]):
                self.event_alarm(ev)
            if self._ticks % 60 == 0:
                self.scanner.prune_markers()                       # Marker aelter als 1 h verschwinden
            if nm:
                self.refresh_markers(True); self.overlay.draw()
            if sig_changed or (self._ticks % 5 == 0 and getattr(recent_cards, "pending", False)) or self._ticks % 30 == 0:
                self.update_modules(ids, since, sig_changed)          # neu, wenn Berichte fertig werden – sonst alle 30 s
            self.overlay.update(self._vals)
            self.feed.draw(); self.march.draw()
            if self._ticks % 2 == 0:
                self.feed.keep_top(); self.march.keep_top()
            if self._ticks % 5 == 0:
                self.check_rok()
            msg, ts = self._flash
            st = msg if msg and now - ts < 8 else self.scanner.status
            if now < getattr(self, "_mention_until", 0):                # genannt: roter, blinkender Hinweis in der App
                st = "📣 " + self.t("mention_title") + "\n" + getattr(self, "_mention_text", "")[:40]
                self.status.configure(fg=C["bad"] if int(now * 2) % 2 else "#fb923c")
            elif self.status.cget("fg") != C["dim"]:
                self.status.configure(fg=C["dim"])
            if self.status.cget("text") != st:
                self.status.configure(text=st)
            self._ticks = getattr(self, "_ticks", 0) + 1
            if self.page == "home":
                self.update_home()
            if self._ticks % 5 == 0 and self.page == "mk":
                self.refresh_markers()
            if self._ticks % 5 == 0 and self.page == "acc":           # nur neu zeichnen, wenn ein neuer Account auftaucht
                if tuple(sorted(self.scanner.owners)) != getattr(self, "_owners_keys", None):
                    self.render()
        except Exception:
            log("tick:\n" + traceback.format_exc())
        self.root.after(1000, self.tick)

    def quit(self):
        self.overlay._save_pos(); save_cfg(self.cfg); self.scanner.save()
        self.root.destroy()


FONT, MONO, TITLE = "Segoe UI", "Consolas", "Georgia"

START_LINK = next((a for a in sys.argv[1:] if a.lower().startswith(PROTO + ":")), "")

if __name__ == "__main__":
    if hand_over(START_LINK):        # App laeuft schon -> Link dorthin, diese Kopie endet
        sys.exit(0)
    try:
        App().root.mainloop()
    except Exception:
        log("FEHLER:\n" + traceback.format_exc())
        raise
