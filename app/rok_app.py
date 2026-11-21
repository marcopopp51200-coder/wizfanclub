# -*- coding: utf-8 -*-
"""
Wiz fan Club App (Testversion 0.4)
----------------------------------
* Verbinden: Code von der Website (uploader.html) eingeben -> App ist mit deinem Account gekoppelt.
* Accounts: erkennt die Governor-IDs aus dem Mailcache und bindet sie an deinen Website-Account.
* Overlay: kleines, verschiebbares Fenster ueber dem Spiel mit frei waehlbaren Werten (KP, Trades, Tote ...).
* Hochladen (optional, fuer Freunde): Kampfberichte der gebundenen IDs ueber die Website-API – ohne Service-Key.

Liest nur Dateien im Ordner <Spiel>\\save\\mailcache. Veraendert nichts am Spiel, liest keinen Netzwerkverkehr.
Braucht nur Python 3 (tkinter ist dabei). Start ohne Konsolenfenster: pythonw rok_app.py
"""
import glob, json, os, platform, struct, sys, threading, time, traceback
import urllib.request, urllib.error
from datetime import datetime, date
import tkinter as tk
from tkinter import messagebox, filedialog
import tkinter.font as tkfont

APP_VERSION = "0.4-test"
FROZEN = getattr(sys, "frozen", False)          # als .exe gebaut (PyInstaller)
HERE = os.path.dirname(os.path.abspath(sys.executable if FROZEN else __file__))
DATA = os.path.join(os.environ.get("APPDATA", HERE), "WizFanClub") if FROZEN else HERE   # Einstellungen/Cache der .exe
os.makedirs(DATA, exist_ok=True)
CFG_FILE = os.path.join(DATA, "app_config.json")
CACHE_FILE = os.path.join(DATA, "app_cache.json")
LOG_FILE = os.path.join(DATA, "app_log.txt")
RES = getattr(sys, "_MEIPASS", HERE)            # mitgelieferte Dateien (Icon)
CACHE_VER = 2          # 2: + Marker-Mails (einmal alles neu einlesen)

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
        "r_session": "Session", "r_today": "Heute", "r_24h": "Letzte 24 Std.", "r_7d": "Letzte 7 Tage", "r_since": "Seit Datum (z. B. KvK-Start)", "r_all": "Alles",
        "m_kp": "KP", "m_kp_all": "KP gesamt (alles)", "m_kp_last": "KP letzter Kampf", "m_kp_trade": "KP-Trade", "m_loss_trade": "Verlust-Trade",
        "m_power_trade": "Power-Trade", "m_dead": "Eigene Tote", "m_severe": "Eigene Schwerverw.", "m_wounded": "Eigene Leichtverw.",
        "m_enemy_out": "Gegner ausgeschaltet", "m_enemy_dead": "Gegner tot", "m_pvp": "PvP-Kämpfe", "m_pve": "PvE-Kämpfe", "m_kph": "KP pro Stunde",
        "m_last_enemy": "Letzter Gegner",
        "folders": "Spielordner (mit save\\mailcache)", "add": "Hinzufügen…", "remove": "Entfernen", "detect": "Automatisch suchen",
        "upload": "Kampfberichte der gebundenen IDs hochladen", "upload_days": "Beim ersten Mal nur die letzten Tage",
        "upload_hint": "Nicht nötig, wenn der alte Uploader (rok_kampf_upload.py) schon läuft.", "upload_off": "Hochladen geht nur, wenn rok_kampf_upload.py im selben Ordner liegt.",
        "autostart": "Mit Windows starten", "start_min": "Minimiert starten", "lang": "Sprache", "save": "Speichern",
        "status_scan": "Lese Mailcache… {n} Dateien", "status_ok": "{b} Kampfberichte · zuletzt {t}", "status_nofolder": "Kein Spielordner gefunden – unter Einstellungen hinzufügen.",
        "uploaded": "{n} Kämpfe hochgeladen", "err": "Fehler", "menu_values": "Werte", "menu_range": "Zeitraum", "menu_hide": "Ausblenden", "menu_main": "App öffnen",
        "no_data": "noch keine Kämpfe",
    },
    "en": {
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
        "r_session": "Session", "r_today": "Today", "r_24h": "Last 24 h", "r_7d": "Last 7 days", "r_since": "Since date (e.g. KvK start)", "r_all": "All",
        "m_kp": "KP", "m_kp_all": "Total KP (all)", "m_kp_last": "KP last battle", "m_kp_trade": "KP trade", "m_loss_trade": "Loss trade",
        "m_power_trade": "Power trade", "m_dead": "Own dead", "m_severe": "Own severely wounded", "m_wounded": "Own slightly wounded",
        "m_enemy_out": "Enemies taken out", "m_enemy_dead": "Enemies dead", "m_pvp": "PvP battles", "m_pve": "PvE battles", "m_kph": "KP per hour",
        "m_last_enemy": "Last enemy",
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
           "m_enemy_out", "m_enemy_dead", "m_pvp", "m_pve", "m_kph", "m_last_enemy"]
RANGES = ["r_session", "r_today", "r_24h", "r_7d", "r_since", "r_all"]

DEFAULT_CFG = {
    "api_base": "https://rok-scanner.vercel.app", "token": "", "user_name": "", "lang": "de",
    "game_folders": [], "links": [],
    "overlay": {"show": True, "x": 60, "y": 60, "alpha": 0.85, "locked": False, "size": 11,
                "metrics": ["m_kp", "m_kp_trade", "m_loss_trade", "m_dead", "m_kp_last"],
                "range": "r_session", "since": "", "pvp_only": True, "count_pilot": False},
    "upload": False, "upload_days": 14, "start_min": False,
    "markers": {"filter": "all", "sort": "new", "words": "ball, garrison, garni, stack, def, rally", "sound": True, "overlay": True,
                "alarm_all": False, "show_min": 10},
}


def load_cfg():
    cfg = json.loads(json.dumps(DEFAULT_CFG))
    try:
        with open(CFG_FILE, encoding="utf-8") as f:
            user = json.load(f)
        ov = user.pop("overlay", {})
        mk = user.pop("markers", {})
        cfg.update(user); cfg["overlay"].update(ov); cfg["markers"].update(mk)
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


def read_mail(path):
    with open(path, "rb") as f:
        b = f.read()
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
    out = {"id": str(mail.get("id")), "pid": pid, "name": me.get("PName"), "t": int(t or 0), "arch": mail.get("box") == "Archive", "fights": []}
    for a in (c.get("Attacks") or {}).values():
        if not isinstance(a, dict):
            continue
        en = a.get("CIdt") or {}
        own, opp = a.get("Damage") or {}, a.get("Kill") or {}
        pvp = isinstance(en.get("PId"), int) and en.get("PId") > 0 and bool(en.get("PName"))
        out["fights"].append([1 if pvp else 0, _n(own, "KillScore"), _n(opp, "KillScore"), _n(own, "Death"), _n(own, "BadHurt"),
                              _n(own, "Hurt"), _n(opp, "Death"), _n(opp, "BadHurt"), _n(own, "Power"), _n(opp, "Power"),
                              (en.get("PName") or "") if pvp else ""])
    return out


def owner_of(mail):
    rc = str((mail or {}).get("receiver") or "")
    if rc.startswith("player_") and rc[7:].isdigit():
        return int(rc[7:])
    return None


# ---------------------------------------------------------------- Marker-Mails (Koalitions-/Allianz-Marker)
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
    return {"id": str(mail.get("id")), "t": int(t or 0), "x": p[0], "y": p[1], "by": author[:40], "text": comment[:200],
            "title": title[:80], "srv": mail.get("serverId")}


def is_ball(mk, words):
    txt = ("%s %s" % (mk.get("text", ""), mk.get("title", ""))).lower()
    return any(w and w in txt for w in words)


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
                self.owners = {int(k): v for k, v in d.get("owners", {}).items()}
                self.uploaded = set(d.get("uploaded", []))
        except Exception:
            pass

    def save(self):
        with self.lock:
            d = {"v": CACHE_VER, "seen": self.seen, "battles": self.battles, "markers": self.markers, "owners": self.owners, "uploaded": sorted(self.uploaded)}
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
                    todo.append((key, sig, e.path))
            for i, (key, sig, path) in enumerate(todo):
                if i % 200 == 0 and len(todo) > 200:
                    self.status = T("status_scan", n="%d/%d" % (i, len(todo)))
                try:
                    m = read_mail(path)
                except Exception:
                    m = None
                s = summarize(m)
                own = owner_of(m)
                mk = None if s else marker_of(m)
                if not s and isinstance(m, dict):
                    self.samples.append(path)
                if mk:
                    mkey = "%d_%d_%s" % (mk["x"], mk["y"], mk["text"][:30])   # gleicher Marker bei Main + Filler nur einmal
                    with self.lock:
                        old = self.markers.get(mkey)
                        if not old or mk["t"] > old["t"] + 600:              # neu oder spaeter erneut gesetzt
                            self.markers[mkey] = mk
                            if self.app.started and mk["t"] >= self.app.started - 300:
                                self.new_markers.append(mk)
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
                        if s["id"] not in self.battles:
                            new += 1
                        self.battles[s["id"]] = s
                if i and i % 2000 == 0:          # beim ersten grossen Einlesen zwischendurch sichern
                    self.save()
        if new:
            self.last_new = time.time()
        with self.lock:
            nb = len(self.battles)
        self.status = T("status_ok", b=nb, t=time.strftime("%H:%M:%S"))
        return new

    def loop(self):
        while True:
            try:
                n = self.scan_once()
                if n:
                    self.save()
                if self.app.cfg.get("upload") and self.app.cfg.get("token"):
                    self.upload_new()
            except Exception:
                log("scan:\n" + traceback.format_exc())
            time.sleep(5)

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
                    and not b.get("arch") and b["t"] >= cutoff and any(f[0] for f in b["fights"])]
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
    last_kp, last_enemy, last_t = None, "", 0
    for b in battles:
        if ids is not None and b["pid"] not in ids:
            continue
        if b.get("arch"):
            continue
        in_r = b["t"] >= since_ts
        for f in b["fights"]:
            pvp, kp, ekp, dead, sev, wnd, edead, esev, pw, epw, en = f
            if pvp:
                tot["kp_all"] += kp
            if not in_r:
                continue
            if pvp:
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
        if b["t"] > last_t and any(f[0] for f in b["fights"]):
            last_t = b["t"]
            last_kp = sum(f[1] for f in b["fights"] if f[0])
            last_enemy = next((f[10] for f in b["fights"] if f[0] and f[10]), "")
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
    "tab_mk": "Marker", "sub_mk": "Koalitions- und Allianz-Marker aus deinen Mails.", "mk_all": "Alle", "mk_ball": "Nur Ball", "mk_sort_new": "Neueste zuerst", "mk_sort_ball": "Ball zuerst",
    "mk_none": "Noch keine Marker-Mails gefunden. Falls doch welche im Spiel sind: unten „Beispiel speichern“ und mir die Datei schicken.",
    "mk_copy": "Kopieren", "mk_copied": "Koordinaten kopiert", "mk_ago_m": "vor {n} Min.", "mk_ago_h": "vor {n} Std.", "mk_ago_d": "vor {n} Tg.",
    "mk_words": "Ball-Wörter (mit Komma)", "mk_sound": "Ton bei neuem Ball-Marker", "mk_overlay": "Neuen Ball-Marker im Overlay zeigen",
    "mk_export": "Beispiel speichern", "mk_exported": "Gespeichert: {p}", "mk_by": "von {n}", "mk_new_ball": "NEUER BALL", "mk_new": "Neuer Marker",
    "mk_all_alarm": "Alarm auch bei normalen Markern",
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
    "tab_mk": "Markers", "sub_mk": "Coalition and alliance markers from your mails.", "mk_all": "All", "mk_ball": "Ball only", "mk_sort_new": "Newest first", "mk_sort_ball": "Ball first",
    "mk_none": "No marker mails found yet. If there are some in the game: click “Save example” below and send me the file.",
    "mk_copy": "Copy", "mk_copied": "Coordinates copied", "mk_ago_m": "{n} min ago", "mk_ago_h": "{n} h ago", "mk_ago_d": "{n} d ago",
    "mk_words": "Ball words (comma separated)", "mk_sound": "Sound on new ball marker", "mk_overlay": "Show new ball marker in overlay",
    "mk_export": "Save example", "mk_exported": "Saved: {p}", "mk_by": "by {n}", "mk_new_ball": "NEW BALL", "mk_new": "New marker",
    "mk_all_alarm": "Alert for normal markers too",
    "kinds_info": "Main = the ID from your website profile · Alt = also yours (filler, farm) · Pilot = someone else's account that you play",
})


def pick_font(root, *names):
    try:
        fams = {f.lower() for f in tkfont.families(root)}
    except Exception:
        fams = set()
    for n in names:
        if n.lower() in fams:
            return n
    return names[-1]


class Btn(tk.Label):
    """Flacher Button mit Hover (gold / ghost / danger)."""
    STY = {"gold": (C["gold"], "#0b0e16", "#fde68a"), "ghost": (C["card2"], C["text"], C["line2"]), "danger": (C["card2"], C["bad"], "#3b1d24")}

    def __init__(self, parent, text, cmd, kind="gold", small=False, **kw):
        bg, fg, hov = self.STY[kind]
        f = (FONT, 9 if small else 10, "bold")
        super().__init__(parent, text=text, bg=bg, fg=fg, font=f, padx=10 if small else 16, pady=3 if small else 7, cursor="hand2", **kw)
        self._c, self._cmd, self._on = (bg, fg, hov), cmd, True
        self.bind("<Enter>", lambda e: self._on and self.configure(bg=hov))
        self.bind("<Leave>", lambda e: self.configure(bg=bg if self._on else C["line"]))
        self.bind("<Button-1>", lambda e: self._on and self._cmd and self._cmd())

    def enable(self, on=True):
        self._on = on
        bg, fg, _ = self._c
        self.configure(bg=bg if on else C["line"], fg=fg if on else C["dim"], cursor="hand2" if on else "arrow")


class Toggle(tk.Frame):
    """Schalter (Pill) mit Text."""

    def __init__(self, parent, text, var, cmd=None, bg=None):
        bg = bg or C["card"]
        super().__init__(parent, bg=bg, cursor="hand2")
        self.var, self.cmd = var, cmd
        self.cv = tk.Canvas(self, width=38, height=20, bg=bg, highlightthickness=0)
        self.cv.pack(side="left")
        self.lb = tk.Label(self, text=text, bg=bg, fg=C["text"], font=(FONT, 10))
        self.lb.pack(side="left", padx=8)
        for w in (self, self.cv, self.lb):
            w.bind("<Button-1>", self._click)
        self.draw()

    def _click(self, _e=None):
        self.var.set(not self.var.get()); self.draw()
        if self.cmd:
            self.cmd()

    def draw(self):
        on = bool(self.var.get())
        cv = self.cv; cv.delete("all")
        col = C["gold"] if on else C["line2"]
        cv.create_oval(1, 1, 19, 19, fill=col, outline=col); cv.create_oval(19, 1, 37, 19, fill=col, outline=col)
        cv.create_rectangle(10, 1, 28, 19, fill=col, outline=col)
        x = 28 if on else 10
        cv.create_oval(x - 7, 3, x + 7, 17, fill="#0b0e16" if on else C["muted"], outline="")


class Chip(tk.Label):
    def __init__(self, parent, text, active, cmd, bg=None):
        super().__init__(parent, text=text, font=(FONT, 9, "bold"), padx=10, pady=4, cursor="hand2", bd=0)
        self.cmd = cmd
        self.bind("<Button-1>", lambda e: self.cmd())
        self.set(active)

    def set(self, active):
        self.active = active
        self.configure(bg=C["gold_dim"] if active else C["input"], fg=C["gold"] if active else C["muted"],
                       highlightthickness=1, highlightbackground=C["gold2"] if active else C["line2"])


def entry(parent, var, width=30, big=False, center=False):
    e = tk.Entry(parent, textvariable=var, width=width, bg=C["input"], fg=C["gold"] if big else C["text"], insertbackground=C["gold"],
                 relief="flat", font=(MONO, 20, "bold") if big else (FONT, 10), justify="center" if center else "left",
                 highlightthickness=1, highlightbackground=C["line2"], highlightcolor=C["gold2"])
    return e


def card(parent, title=None):
    outer = tk.Frame(parent, bg=C["card"], highlightthickness=1, highlightbackground=C["line"])
    if title:
        tk.Label(outer, text=title.upper(), bg=C["card"], fg=C["gold"], font=(FONT, 8, "bold")).pack(anchor="w", padx=14, pady=(10, 0))
    inner = tk.Frame(outer, bg=C["card"])
    inner.pack(fill="both", expand=True, padx=14, pady=(6, 12))
    return outer, inner


class Scroll(tk.Frame):
    """Scrollbarer Bereich (Mausrad)."""

    def __init__(self, parent, bg):
        super().__init__(parent, bg=bg)
        self.cv = tk.Canvas(self, bg=bg, highlightthickness=0)
        self.inner = tk.Frame(self.cv, bg=bg)
        self.win = self.cv.create_window(0, 0, window=self.inner, anchor="nw")
        self.cv.pack(fill="both", expand=True)
        self.inner.bind("<Configure>", lambda e: self.cv.configure(scrollregion=self.cv.bbox("all")))
        self.cv.bind("<Configure>", lambda e: self.cv.itemconfigure(self.win, width=e.width))
        self.cv.bind_all("<MouseWheel>", self._wheel, add="+")

    def _wheel(self, e):
        try:
            w = self.winfo_containing(e.x_root, e.y_root)
            if w is not None and str(w).startswith(str(self.cv)) and self.inner.winfo_height() > self.cv.winfo_height():
                self.cv.yview_scroll(int(-e.delta / 120), "units")
        except Exception:
            pass


# ---------------------------------------------------------------- Overlay-Fenster
class Overlay:
    PAD = 12

    def __init__(self, app):
        self.app = app
        self.win = None
        self.vals = {}
        self.flash_until = 0
        self.alert = None           # (marker, ball, bis)

    def build(self):
        ov = self.app.cfg["overlay"]
        w = self.win = tk.Toplevel(self.app.root)
        w.overrideredirect(True)
        w.attributes("-topmost", True)
        w.attributes("-alpha", float(ov.get("alpha", 0.85)))
        bg = C["key"] if IS_WIN else C["side"]
        w.configure(bg=bg)
        if IS_WIN:
            try:
                w.attributes("-transparentcolor", C["key"])      # runde Ecken
            except tk.TclError:
                pass
        self.cv = tk.Canvas(w, bg=bg, highlightthickness=0, bd=0)
        self.cv.pack()
        w.geometry("+%d+%d" % (int(ov.get("x", 60)), int(ov.get("y", 60))))
        self.cv.bind("<ButtonPress-1>", self._start)
        self.cv.bind("<B1-Motion>", self._move)
        self.cv.bind("<ButtonRelease-1>", self._stop)
        self.cv.bind("<Button-3>", self._menu)
        self.cv.bind("<Double-Button-1>", lambda e: self.alert and self.app.copy_xy(self.alert[0]))
        self.draw()

    def rebuild_rows(self):
        self.draw()

    @staticmethod
    def _round(cv, x1, y1, x2, y2, r, **kw):
        pts = [x1 + r, y1, x2 - r, y1, x2, y1, x2, y1 + r, x2, y2 - r, x2, y2, x2 - r, y2, x1 + r, y2, x1, y2, x1, y2 - r, x1, y1 + r, x1, y1]
        return cv.create_polygon(pts, smooth=True, **kw)

    def draw(self):
        if not self.win:
            return
        ov, T = self.app.cfg["overlay"], self.app.t
        fs = int(ov.get("size", 11))
        f_lab, f_val, f_head = (FONT, fs), (FONT, fs, "bold"), (FONT, max(7, fs - 3), "bold")
        fl, fv, fh = tkfont.Font(font=f_lab), tkfont.Font(font=f_val), tkfont.Font(font=f_head)
        rng = T(ov.get("range", "r_session"))
        if ov.get("range") == "r_since" and ov.get("since"):
            rng = "%s %s" % ("seit" if self.app.cfg["lang"] == "de" else "since", ov["since"])
        head = "⚔  " + rng.upper()
        rows = [(T(k), self.vals.get(k, "–"), k) for k in ov.get("metrics", [])]
        lw = max([fl.measure(a) for a, _, _ in rows] + [0])
        vw = max([fv.measure(b) for _, b, _ in rows] + [fv.measure("0.000")])
        P, gap, lh = self.PAD, 18, fl.metrics("linespace") + 4
        width = max(P * 2 + lw + gap + vw, fh.measure(head) + P * 2 + 50, 150)
        hh = fh.metrics("linespace") + P + 4
        al = self.alert if self.alert and time.time() < self.alert[2] else None
        ah = 0
        if al:
            mk, ball = al[0], al[1]
            a1 = "%s  X %d · Y %d" % ("🎯 " + T("mk_new_ball") if ball else "📍 " + T("mk_new"), mk["x"], mk["y"])
            a2 = (mk.get("text") or "")[:48] + ("  · " + self.app.ago(mk["t"]))
            width = max(width, fv.measure(a1) + P * 2 + 12, fl.measure(a2) + P * 2 + 12)
            ah = lh * 2 + 12
        height = hh + ah + len(rows) * lh + P - 2 + (6 if rows else 0)
        cv = self.cv
        cv.delete("all")
        cv.configure(width=width + 1, height=height + 1)
        self._round(cv, 0, 0, width, height, 12, fill=C["side"], outline=C["gold2"], width=1)
        cv.create_line(P, hh - 2, width - P, hh - 2, fill=C["line2"])
        cv.create_text(P, P - 2, text=head, anchor="nw", fill=C["gold"], font=f_head)
        flashing = time.time() < self.flash_until
        dot = C["gold"] if flashing else (C["good"] if self.app.scanner.status and "…" not in self.app.scanner.status else C["dim"])
        cv.create_oval(width - P - 8, P + 1, width - P - 1, P + 8, fill=dot, outline="")
        cv.create_text(width - P - 12, P - 2, text=T("live"), anchor="ne", fill=C["dim"], font=f_head)
        tone = self.vals.get("_tone", {})
        y = hh + 4
        if al:
            blink = int(time.time()) % 2 == 0 and ball
            self._round(cv, P - 4, y - 2, width - P + 4, y + ah - 8, 8, fill="#3b1d24" if ball else C["gold_dim"],
                        outline=(C["bad"] if blink else "#7f1d1d") if ball else C["gold2"])
            cv.create_text(P + 4, y + 2, text=a1, anchor="nw", fill=C["bad"] if ball else C["gold"], font=f_val)
            cv.create_text(P + 4, y + 2 + lh, text=a2, anchor="nw", fill=C["text"], font=f_lab)
            y += ah
        for lab, val, k in rows:
            col = C["good"] if tone.get(k) == "good" else C["bad"] if tone.get(k) == "bad" else (C["gold"] if flashing and k in ("m_kp", "m_kp_last") else C["text"])
            cv.create_text(P, y, text=lab, anchor="nw", fill=C["muted"], font=f_lab)
            cv.create_text(width - P, y, text=val, anchor="ne", fill=col, font=f_val)
            y += lh
        if not rows:
            pass

    def update(self, vals):
        if not self.win:
            return
        if self.vals and vals.get("_n", 0) > self.vals.get("_n", 0):
            self.flash_until = time.time() + 4               # neuer Kampf: kurz golden
        self.vals = vals
        self.draw()
        try:
            self.win.attributes("-topmost", True)
            self.win.lift()
        except tk.TclError:
            pass

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
        m.add_command(label=T("ov_reset"), command=self.app.reset_session)
        if self.alert:
            m.add_command(label="📋 X %d Y %d" % (self.alert[0]["x"], self.alert[0]["y"]), command=lambda: self.app.copy_xy(self.alert[0]))
            m.add_command(label="✕ " + T("mk_new"), command=lambda: (setattr(self, "alert", None), self.draw()))
        lv = tk.BooleanVar(value=ov.get("locked", False)); self._vars.append(lv)
        m.add_checkbutton(label=T("ov_lock"), variable=lv, command=lambda: self.app.set_opt("locked", lv.get()))
        m.add_separator()
        m.add_command(label=T("menu_main"), command=self.app.show_main)
        m.add_command(label=T("menu_hide"), command=lambda: self.app.set_opt("show", False))
        m.tk_popup(e.x_root, e.y_root)


# ---------------------------------------------------------------- Hauptfenster
PAGES = [("conn", "🔗", "tab_conn", "sub_conn"), ("acc", "👤", "tab_acc", "sub_acc"), ("mk", "📍", "tab_mk", "sub_mk"),
         ("ov", "🪟", "tab_ov", "sub_ov"), ("set", "⚙", "tab_set", "sub_set")]


class App:
    def __init__(self):
        global FONT, MONO, TITLE
        self.cfg = load_cfg()
        self.session_start = time.time()
        self.root = tk.Tk()
        FONT = pick_font(self.root, "Segoe UI", "Inter", "Helvetica")
        MONO = pick_font(self.root, "Consolas", "DejaVu Sans Mono", "Courier")
        TITLE = pick_font(self.root, "Cinzel", "Trajan Pro", "Georgia", "Times")
        self.root.title("Wiz fan Club App")
        self.root.geometry("940x620")
        self.root.minsize(880, 580)
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
        self.page = "conn" if not self.cfg.get("token") else "ov"
        self.started = time.time()
        self.scanner = Scanner(self)
        self.overlay = Overlay(self)
        self._flash = ("", 0)
        self.build_ui()
        threading.Thread(target=self.scanner.loop, daemon=True).start()
        if self.cfg.get("token"):
            threading.Thread(target=self.refresh_me, daemon=True).start()
        self.overlay.show(self.cfg["overlay"].get("show", True))
        if self.cfg.get("start_min"):
            self.root.iconify()
        self.tick()

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
            except Exception:
                msg = None
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
        side = tk.Frame(self.root, bg=C["side"], width=200)
        side.pack(side="left", fill="y"); side.pack_propagate(False)
        tk.Frame(self.root, bg=C["line"], width=1).pack(side="left", fill="y")
        tk.Label(side, text="WIZ FAN CLUB", bg=C["side"], fg=C["gold"], font=(TITLE, 15, "bold")).pack(anchor="w", padx=18, pady=(20, 0))
        tk.Label(side, text="Battle App · v" + APP_VERSION, bg=C["side"], fg=C["dim"], font=(FONT, 8)).pack(anchor="w", padx=18, pady=(0, 18))
        self.nav = {}
        for key, ico, lab, _sub in PAGES:
            row = tk.Frame(side, bg=C["side"], cursor="hand2")
            row.pack(fill="x", pady=1)
            bar = tk.Frame(row, bg=C["side"], width=3); bar.pack(side="left", fill="y")
            l = tk.Label(row, text="%s   %s" % (ico, T(lab)), bg=C["side"], fg=C["muted"], font=(FONT, 10, "bold"), anchor="w", padx=14, pady=9)
            l.pack(side="left", fill="x", expand=True)
            for w in (row, l):
                w.bind("<Button-1>", lambda e, k=key: self.go(k))
                w.bind("<Enter>", lambda e, k=key: self._hover(k, True))
                w.bind("<Leave>", lambda e, k=key: self._hover(k, False))
            self.nav[key] = (row, bar, l)
        foot = tk.Frame(side, bg=C["side"]); foot.pack(side="bottom", fill="x", padx=16, pady=14)
        self.side_user = tk.Label(foot, text="", bg=C["side"], fg=C["text"], font=(FONT, 9, "bold"), anchor="w", justify="left", wraplength=170)
        self.side_user.pack(anchor="w")
        self.status = tk.Label(foot, text="", bg=C["side"], fg=C["dim"], font=(FONT, 8), anchor="w", justify="left", wraplength=170)
        self.status.pack(anchor="w", pady=(4, 0))
        self.main = tk.Frame(self.root, bg=C["bg"])
        self.main.pack(side="left", fill="both", expand=True)
        self.render()

    def _hover(self, k, on):
        row, bar, l = self.nav[k]
        if k != self.page:
            for w in (row, l):
                w.configure(bg=C["card"] if on else C["side"])

    def go(self, page):
        self.page = page
        self.render()

    def render(self):
        if not hasattr(self, "main"):
            return
        for k, (row, bar, l) in self.nav.items():
            act = k == self.page
            row.configure(bg=C["card2"] if act else C["side"]); l.configure(bg=C["card2"] if act else C["side"], fg=C["gold"] if act else C["muted"])
            bar.configure(bg=C["gold"] if act else C["side"])
        if self.cfg.get("token"):
            self.side_user.configure(text="● " + (self.cfg.get("user_name") or "?"), fg=C["good"])
        else:
            self.side_user.configure(text="○ " + self.t("not_conn").split(".")[0], fg=C["muted"])
        for c in self.main.winfo_children():
            c.destroy()
        key, ico, lab, sub = next(p for p in PAGES if p[0] == self.page)
        hd = tk.Frame(self.main, bg=C["bg"]); hd.pack(fill="x", padx=26, pady=(22, 12))
        tk.Label(hd, text=self.t(lab), bg=C["bg"], fg=C["text"], font=(FONT, 18, "bold")).pack(anchor="w")
        tk.Label(hd, text=self.t(sub), bg=C["bg"], fg=C["muted"], font=(FONT, 10)).pack(anchor="w")
        body = tk.Frame(self.main, bg=C["bg"]); body.pack(fill="both", expand=True, padx=26, pady=(0, 20))
        getattr(self, "page_" + key)(body)

    # ---------- Seiten ----------
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
        tk.Label(left, text=T("steps"), bg=C["card"], fg=C["text"], font=(FONT, 10), justify="left").pack(anchor="w")
        tk.Label(left, text=T("site"), bg=C["card"], fg=C["muted"], font=(FONT, 8, "bold")).pack(anchor="w", pady=(14, 2))
        self.v_site = tk.StringVar(value=self.cfg["api_base"])
        r = tk.Frame(left, bg=C["card"]); r.pack(anchor="w")
        entry(r, self.v_site, 30).pack(side="left", ipady=5)
        Btn(r, T("open_page") + " ↗", self.open_page, "ghost", small=True).pack(side="left", padx=8)
        right = tk.Frame(c, bg=C["card"]); right.pack(side="right", padx=(20, 0))
        tk.Label(right, text=T("code").upper(), bg=C["card"], fg=C["muted"], font=(FONT, 8, "bold")).pack(anchor="w")
        self.v_code = tk.StringVar()
        e = entry(right, self.v_code, 8, big=True, center=True); e.pack(ipady=6, pady=4)
        e.bind("<Return>", lambda _e: self.pair())
        self.v_code.trace_add("write", lambda *_: self.v_code.get() != self.v_code.get().upper()[:6] and self.v_code.set(self.v_code.get().upper()[:6]))
        self.btn_pair = Btn(right, T("pair"), self.pair); self.btn_pair.pack(fill="x", pady=(4, 0))

    def page_acc(self, body):
        T = self.t
        tk.Label(body, text=T("acc_info"), bg=C["bg"], fg=C["muted"], font=(FONT, 10), wraplength=640, justify="left").pack(anchor="w")
        tk.Label(body, text=T("kinds_info"), bg=C["bg"], fg=C["dim"], font=(FONT, 8), wraplength=640, justify="left").pack(anchor="w", pady=(2, 0))
        prof = str(self.cfg.get("profile_gov") or "")
        if self.cfg.get("token"):
            tk.Label(body, text=T("prof_id", id=prof) if prof else T("prof_none"), bg=C["bg"], fg=C["gold"] if prof else C["bad"],
                     font=(FONT, 9, "bold"), wraplength=640, justify="left").pack(anchor="w", pady=(6, 0))
        sc = Scroll(body, C["bg"]); sc.pack(fill="both", expand=True, pady=(10, 0))
        links = {str(x["governor_id"]): x for x in self.cfg.get("links", [])}
        with self.scanner.lock:
            owners = dict(self.scanner.owners)
        if not owners:
            tk.Label(sc.inner, text=T("no_acc"), bg=C["bg"], fg=C["dim"], font=(FONT, 10), wraplength=560, justify="left").pack(anchor="w", pady=20)
        kcol = {"main": C["gold"], "alt": "#7dd3fc", "pilot": "#c4b5fd"}
        for pid, o in sorted(owners.items(), key=lambda kv: (str(kv[0]) != prof, -kv[1].get("last", 0))):
            ln = links.get(str(pid))
            kind = (ln or {}).get("kind") or ("alt" if ln else None)
            row = tk.Frame(sc.inner, bg=C["card"], highlightthickness=1, highlightbackground=kcol.get(kind, C["line"]) if ln else C["line"])
            row.pack(fill="x", pady=4, padx=(0, 6))
            name = o.get("name") or "?"
            av = tk.Canvas(row, width=40, height=40, bg=C["card"], highlightthickness=0); av.pack(side="left", padx=12, pady=10)
            col = kcol.get(kind, C["muted"]) if ln else C["muted"]
            av.create_oval(2, 2, 38, 38, fill=C["card2"], outline=col)
            av.create_text(20, 20, text=name[:1].upper(), fill=col, font=(FONT, 13, "bold"))
            info = tk.Frame(row, bg=C["card"]); info.pack(side="left", fill="x", expand=True)
            top = tk.Frame(info, bg=C["card"]); top.pack(anchor="w")
            tk.Label(top, text=name, bg=C["card"], fg=C["text"], font=(FONT, 11, "bold")).pack(side="left")
            if ln:
                tk.Label(top, text=T("k_" + kind), bg=C["card2"], fg=kcol[kind], font=(FONT, 8, "bold"), padx=6).pack(side="left", padx=8)
                if ln.get("status") == "pending":
                    tk.Label(top, text="⏳ " + T("pending"), bg=C["card"], fg="#fbbf24", font=(FONT, 8, "bold")).pack(side="left")
            last = datetime.fromtimestamp(o["last"]).strftime("%d.%m.%Y %H:%M") if o.get("last") else "–"
            tk.Label(info, text="ID %s  ·  %s" % (pid, T("reports", n=o.get("mails", 0), t=last)), bg=C["card"], fg=C["dim"], font=(FONT, 9)).pack(anchor="w")
            if ln and ln.get("status") == "pending":
                tk.Label(info, text=T("pending_info"), bg=C["card"], fg=C["dim"], font=(FONT, 8)).pack(anchor="w")
            btns = tk.Frame(row, bg=C["card"]); btns.pack(side="right", padx=12)
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

    def copy_xy(self, mk):
        self.root.clipboard_clear()
        self.root.clipboard_append("X:%d Y:%d" % (mk["x"], mk["y"]))
        self.flash(self.t("mk_copied") + " – X:%d Y:%d" % (mk["x"], mk["y"]))

    def ball_words(self):
        return [w.strip().lower() for w in str(self.cfg["markers"].get("words", "")).split(",") if w.strip()]

    def page_mk(self, body):
        T, mc = self.t, self.cfg["markers"]
        bar = tk.Frame(body, bg=C["bg"]); bar.pack(fill="x", pady=(0, 8))
        for key, lab in (("all", "mk_all"), ("ball", "mk_ball")):
            Chip(bar, T(lab), mc.get("filter") == key, lambda key=key: (self.set_mk("filter", key), self.render())).pack(side="left", padx=(0, 6))
        tk.Frame(bar, bg=C["bg"], width=16).pack(side="left")
        for key, lab in (("new", "mk_sort_new"), ("ball", "mk_sort_ball")):
            Chip(bar, T(lab), mc.get("sort") == key, lambda key=key: (self.set_mk("sort", key), self.render())).pack(side="left", padx=(0, 6))
        Btn(bar, "💾 " + T("mk_export"), self.export_samples, "ghost", small=True).pack(side="right")
        words = self.ball_words()
        with self.scanner.lock:
            mks = list(self.scanner.markers.values())
        for m in mks:
            m["_ball"] = is_ball(m, words)
        if mc.get("filter") == "ball":
            mks = [m for m in mks if m["_ball"]]
        mks.sort(key=lambda m: ((not m["_ball"]) if mc.get("sort") == "ball" else 0, -m["t"]))
        sc = Scroll(body, C["bg"]); sc.pack(fill="both", expand=True)
        if not mks:
            tk.Label(sc.inner, text=T("mk_none"), bg=C["bg"], fg=C["dim"], font=(FONT, 10), wraplength=600, justify="left").pack(anchor="w", pady=20)
        for m in mks[:150]:
            ball = m["_ball"]
            fresh = time.time() - m["t"] < 1800
            row = tk.Frame(sc.inner, bg=C["card"], highlightthickness=1, highlightbackground=C["bad"] if ball else C["line"])
            row.pack(fill="x", pady=3, padx=(0, 6))
            left = tk.Frame(row, bg=C["card"]); left.pack(side="left", padx=12, pady=8)
            tk.Label(left, text="🎯" if ball else "📍", bg=C["card"], fg=C["text"], font=(FONT, 16)).pack()
            info = tk.Frame(row, bg=C["card"]); info.pack(side="left", fill="x", expand=True, pady=6)
            top = tk.Frame(info, bg=C["card"]); top.pack(anchor="w")
            tk.Label(top, text="X %d · Y %d" % (m["x"], m["y"]), bg=C["card"], fg=C["gold"], font=(FONT, 11, "bold")).pack(side="left")
            if ball:
                tk.Label(top, text="BALL", bg=C["bad"], fg="#0b0e16", font=(FONT, 8, "bold"), padx=6).pack(side="left", padx=8)
            tk.Label(top, text=self.ago(m["t"]), bg=C["card"], fg=C["good"] if fresh else C["dim"], font=(FONT, 9, "bold" if fresh else "normal")).pack(side="left", padx=8)
            if m.get("text"):
                tk.Label(info, text=m["text"], bg=C["card"], fg=C["text"], font=(FONT, 10), wraplength=520, justify="left").pack(anchor="w")
            meta = " · ".join(x for x in (T("mk_by", n=m["by"]) if m.get("by") else "", datetime.fromtimestamp(m["t"]).strftime("%d.%m. %H:%M") if m.get("t") else "", m.get("title", "")) if x)
            tk.Label(info, text=meta, bg=C["card"], fg=C["dim"], font=(FONT, 8)).pack(anchor="w")
            Btn(row, "📋 " + T("mk_copy"), lambda m=m: self.copy_xy(m), "ghost", small=True).pack(side="right", padx=12)
        o, c = card(body, None); o.pack(fill="x", pady=(10, 0))
        r = tk.Frame(c, bg=C["card"]); r.pack(fill="x")
        tk.Label(r, text=T("mk_words"), bg=C["card"], fg=C["muted"], font=(FONT, 9)).pack(side="left")
        self.v_words = tk.StringVar(value=mc.get("words", ""))
        e = entry(r, self.v_words, 34); e.pack(side="left", padx=8, ipady=3)
        e.bind("<FocusOut>", lambda _e: self.set_mk("words", self.v_words.get())); e.bind("<Return>", lambda _e: (self.set_mk("words", self.v_words.get()), self.render()))
        r = tk.Frame(c, bg=C["card"]); r.pack(fill="x", pady=(8, 0))
        for i, (key, lab) in enumerate((("sound", "mk_sound"), ("overlay", "mk_overlay"), ("alarm_all", "mk_all_alarm"))):
            v = tk.BooleanVar(value=mc.get(key, False))
            Toggle(r, T(lab), v, lambda key=key, v=v: self.set_mk(key, v.get())).grid(row=i // 2, column=i % 2, sticky="w", padx=(0, 20), pady=2)

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

    def alarm(self, mk, ball):
        mc = self.cfg["markers"]
        if mc.get("overlay", True):
            self.overlay.alert = (mk, ball, time.time() + 60 * int(mc.get("show_min", 10)))
            self.overlay.draw()
        if mc.get("sound", True):
            try:
                import winsound
                winsound.MessageBeep(winsound.MB_ICONEXCLAMATION if ball else winsound.MB_OK)
            except Exception:
                self.root.bell()
        if self.page == "mk":
            self.render()

    def page_ov(self, body):
        T, ov = self.t, self.cfg["overlay"]
        top = tk.Frame(body, bg=C["bg"]); top.pack(fill="x")
        o, c = card(top, T("card_view")); o.pack(side="left", fill="both", expand=True, padx=(0, 7))
        for key, lab in (("show", "ov_show"), ("locked", "ov_lock"), ("pvp_only", "ov_pvp_only"), ("count_pilot", "ov_pilot")):
            v = tk.BooleanVar(value=ov.get(key, key in ("show", "pvp_only")))
            Toggle(c, T(lab), v, lambda k=key, v=v: self.set_opt(k, v.get())).pack(anchor="w", pady=3)
        r = tk.Frame(c, bg=C["card"]); r.pack(fill="x", pady=(8, 0))
        tk.Label(r, text=T("ov_alpha"), bg=C["card"], fg=C["muted"], font=(FONT, 9)).pack(side="left", padx=(0, 6))
        self.alpha_chips = {}
        for a in (0.5, 0.7, 0.85, 1.0):
            ch = Chip(r, "%d%%" % round(a * 100), abs(float(ov.get("alpha", 0.85)) - a) < 0.01, lambda a=a: self.set_alpha(a))
            ch.pack(side="left", padx=(0, 4)); self.alpha_chips[a] = ch
        r = tk.Frame(c, bg=C["card"]); r.pack(fill="x", pady=(8, 0))
        tk.Label(r, text=T("ov_size"), bg=C["card"], fg=C["muted"], font=(FONT, 9)).pack(side="left", padx=(8, 4))
        sz = tk.Label(r, text=str(ov.get("size", 11)), bg=C["card"], fg=C["text"], font=(FONT, 10, "bold"), width=3)
        def step(d):
            n = max(8, min(22, int(self.cfg["overlay"].get("size", 11)) + d)); sz.configure(text=str(n)); self.set_opt("size", n)
        Btn(r, "−", lambda: step(-1), "ghost", small=True).pack(side="left"); sz.pack(side="left"); Btn(r, "+", lambda: step(1), "ghost", small=True).pack(side="left")

        o, c = card(top, T("card_range")); o.pack(side="left", fill="both", expand=True, padx=(7, 0))
        chips = tk.Frame(c, bg=C["card"]); chips.pack(anchor="w")
        self.range_chips = {}
        for i, rk in enumerate(RANGES):
            ch = Chip(chips, T(rk).split(" (")[0], ov.get("range") == rk, lambda rk=rk: self.set_range(rk))
            ch.grid(row=i // 2, column=i % 2, padx=(0, 6), pady=3, sticky="we"); self.range_chips[rk] = ch
        r = tk.Frame(c, bg=C["card"]); r.pack(anchor="w", pady=(8, 0))
        tk.Label(r, text=T("ov_since"), bg=C["card"], fg=C["muted"], font=(FONT, 9)).pack(side="left")
        self.v_since = tk.StringVar(value=ov.get("since", ""))
        es = entry(r, self.v_since, 11); es.pack(side="left", padx=6, ipady=3)
        es.bind("<Return>", lambda _e: self.set_since()); es.bind("<FocusOut>", lambda _e: self.set_since())
        Btn(c, "↺  " + T("ov_reset"), self.reset_session, "ghost", small=True).pack(anchor="w", pady=(10, 0))

        o, c = card(body, T("card_values")); o.pack(fill="both", expand=True, pady=(14, 0))
        grid = tk.Frame(c, bg=C["card"]); grid.pack(anchor="w")
        self.metric_chips = {}
        for i, k in enumerate(METRICS):
            ch = Chip(grid, T(k), k in ov["metrics"], lambda k=k: self.toggle_metric(k))
            ch.grid(row=i // 3, column=i % 3, padx=(0, 6), pady=3, sticky="we"); self.metric_chips[k] = ch
        tk.Label(c, text=T("ov_hint"), bg=C["card"], fg=C["dim"], font=(FONT, 8), wraplength=600, justify="left").pack(anchor="w", pady=(10, 0))

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
        o, c = card(row, T("card_upload")); o.pack(side="left", fill="both", expand=True, padx=(0, 7))
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

        o, c = card(row, T("card_start")); o.pack(side="left", fill="both", expand=True, padx=(7, 0))
        Btn(c, "🪟  " + T("autostart"), self.autostart, "ghost", small=True).pack(anchor="w")
        v2 = tk.BooleanVar(value=self.cfg.get("start_min", False))
        Toggle(c, T("start_min"), v2, lambda: self.set_cfg("start_min", v2.get())).pack(anchor="w", pady=8)
        r = tk.Frame(c, bg=C["card"]); r.pack(anchor="w")
        for code, lab in (("de", "Deutsch"), ("en", "English")):
            Chip(r, lab, self.cfg.get("lang", "de") == code, lambda code=code: self.set_lang(code)).pack(side="left", padx=(0, 6))

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
        self.run_bg(lambda: self.api("pair", {"code": code, "device_name": platform.node() or "PC"}, auth=False), done)

    def disconnect(self):
        if messagebox.askyesno("Wiz fan Club", self.t("disconnect") + "?"):
            self.cfg["token"] = ""; self.cfg["user_name"] = ""; self.cfg["links"] = []; self.cfg["profile_gov"] = ""
            save_cfg(self.cfg); self.render()

    def open_page(self):
        import webbrowser
        self.cfg["api_base"] = self.v_site.get().strip().rstrip("/") or DEFAULT_CFG["api_base"]
        save_cfg(self.cfg)
        webbrowser.open(self.cfg["api_base"] + "/uploader.html")

    def bind_acc(self, pid, on, kind="alt"):
        if not self.cfg.get("token"):
            messagebox.showinfo("Wiz fan Club", self.t("need_conn")); self.go("conn"); return
        name = (self.scanner.owners.get(int(pid)) or {}).get("name", "")

        def done(d, err):
            if err:
                messagebox.showerror(self.t("err"), str(err)); return
            self.cfg["links"] = d.get("links", []); save_cfg(self.cfg); self.render()
        self.run_bg(lambda: self.api("link" if on else "unlink", {"governor_id": str(pid), "gov_name": name, "kind": kind}), done)

    def set_opt(self, key, val):
        self.cfg["overlay"][key] = val
        save_cfg(self.cfg)
        if key == "show":
            self.overlay.show(val)
            if self.page == "ov":
                self.render()
        elif key == "alpha" and self.overlay.win:
            self.overlay.win.attributes("-alpha", val)
        elif key == "size":
            self.overlay.draw()

    def set_alpha(self, a):
        self.set_opt("alpha", a)
        for k, ch in getattr(self, "alpha_chips", {}).items():
            try:
                ch.set(k == a)
            except tk.TclError:
                pass

    def set_cfg(self, key, val):
        self.cfg[key] = val; save_cfg(self.cfg)

    def toggle_metric(self, k):
        ms = self.cfg["overlay"]["metrics"]
        if k in ms:
            ms.remove(k)
        else:
            ms.append(k)
        self.cfg["overlay"]["metrics"] = [m for m in METRICS if m in ms]
        save_cfg(self.cfg)
        if getattr(self, "metric_chips", None) and self.page == "ov":
            try:
                self.metric_chips[k].set(k in ms)
            except tk.TclError:
                pass
        self.overlay.draw()

    def set_range(self, rk):
        self.cfg["overlay"]["range"] = rk; save_cfg(self.cfg)
        if self.page == "ov":
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
            elif rng == "r_24h":
                since = now - 86400
            elif rng == "r_7d":
                since = now - 7 * 86400
            elif rng == "r_since" and ov.get("since"):
                since = datetime.strptime(ov["since"], "%Y-%m-%d").timestamp()
            else:
                since = 0
            links = [x for x in self.cfg.get("links", []) if x.get("status", "ok") == "ok"
                     and (x.get("kind") != "pilot" or ov.get("count_pilot"))]
            ids = {int(x["governor_id"]) for x in links} if self.cfg.get("links") else None    # None = alle Accounts
            with self.scanner.lock:
                bs = list(self.scanner.battles.values())
            with self.scanner.lock:
                nm, self.scanner.new_markers = self.scanner.new_markers, []
            words = self.ball_words()
            for mk in sorted(nm, key=lambda m: m["t"]):
                ball = is_ball(mk, words)
                if ball or self.cfg["markers"].get("alarm_all"):
                    self.alarm(mk, ball)
                elif self.page == "mk":
                    self.render()
            vals = compute(bs, ids, rng, since, ov.get("pvp_only", True), self.cfg.get("lang", "de"))
            self.overlay.update(vals)
            msg, ts = self._flash
            self.status.configure(text=msg if msg and now - ts < 8 else self.scanner.status)
            self._ticks = getattr(self, "_ticks", 0) + 1
            if self._ticks % 10 == 0 and self.page == "acc":
                n = sum(o.get("mails", 0) for o in self.scanner.owners.values())
                if n != getattr(self, "_owners_n", -1):
                    self._owners_n = n; self.render()
        except Exception:
            log("tick:\n" + traceback.format_exc())
        self.root.after(1000, self.tick)

    def quit(self):
        self.overlay._save_pos(); save_cfg(self.cfg); self.scanner.save()
        self.root.destroy()


FONT, MONO, TITLE = "Segoe UI", "Consolas", "Georgia"

if __name__ == "__main__":
    try:
        App().root.mainloop()
    except Exception:
        log("FEHLER:\n" + traceback.format_exc())
        raise
