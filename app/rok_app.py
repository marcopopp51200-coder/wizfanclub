# -*- coding: utf-8 -*-
"""
Wiz fan Club App (Testversion 0.11)
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

APP_VERSION = "0.11-test"
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
        "tab_home": "Übersicht", "sub_home": "Deine Werte und die neuesten Ball-Marker auf einen Blick.", "h_last": "Letzter Kampf & Zeitraum",
    "h_noball": "Noch kein Ball-Marker. Neue erscheinen hier und im Overlay.", "off": "Aus",
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
        "tab_home": "Overview", "sub_home": "Your stats and the latest ball markers at a glance.", "h_last": "Last battle & period",
    "h_noball": "No ball marker yet. New ones appear here and in the overlay.", "off": "Off",
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
                "range": "r_session", "since": "", "pvp_only": True, "count_pilot": False, "ball_n": 3, "style": "tiles", "source": "web"},
    "upload": False, "upload_days": 14, "start_min": False,
    "markers": {"filter": "all", "sort": "new", "keep_ball": 5, "words": "ball, garrison, garni, stack, def, rally", "sound": True, "overlay": True,
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


# ---------------------------------------------------------------- Ein-Klick-Verbindung von der Website (wizfanclub://pair?c=CODE&s=ADRESSE)
import socket
from urllib.parse import urlparse, parse_qs

PROTO = "wizfanclub"
IPC_PORT = 47851                     # nur lokal (127.0.0.1): uebergibt Links an die schon laufende App
# Nur diese Websites duerfen die App verbinden (Schutz vor gefaelschten Links)
SITE_OK = re.compile(r"^https://(rok-scanner[a-z0-9-]*\.vercel\.app|([a-z0-9-]+\.)*wizfanclub\.[a-z]+)$", re.I)


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
            c.sendall((arg or "show").encode("utf-8")[:2000])
        return True
    except OSError:
        return False


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
                for k, m in self.markers.items():
                    m["key"] = k
                self.owners = {int(k): v for k, v in d.get("owners", {}).items()}
                self.uploaded = set(d.get("uploaded", []))
        except Exception:
            pass

    def add_marker(self, mk):
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
        with self.lock:
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
            d = {"v": CACHE_VER, "seen": self.seen, "battles": self.battles, "markers": self.markers, "deleted": sorted(self.deleted)[-500:], "owners": self.owners, "uploaded": sorted(self.uploaded)}
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
                if len(todo) > 50 and i % 20 == 0:
                    time.sleep(0.004)            # beim grossen Einlesen Luft lassen -> Fenster und Spiel ruckeln nicht
                if i % 200 == 0 and len(todo) > 200:
                    self.status = T("status_scan", n="%d/%d" % (i, len(todo)))
                m = s = mk = None
                try:
                    with open(path, "rb") as f:
                        raw = f.read()
                except OSError:
                    raw = b""
                is_battle = b"Battle" in raw
                is_mark = not is_battle and _MARK_RE.search(raw) is not None
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
            try:
                n = self.scan_once()
                if (n or self.dirty) and time.time() - self.saved_at > 30:     # hoechstens alle 30 s auf die Platte
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
    return fmt_totals(tot, t_first, t_last, last_kp, last_enemy, lang)


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
    "mk_none": "Noch keine Marker-Mails gefunden. Falls doch welche im Spiel sind: unten „Beispiel speichern“ und mir die Datei schicken.",
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
    "mk_none": "No marker mails found yet. If there are some in the game: click “Save example” below and send me the file.",
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
    for k in ("m_kp_last", "m_last_enemy"):
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
        self.font = tkfont.Font(family=FONT, size=9 if small else 10, weight="bold")
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


class Chip(tk.Canvas):
    """Runde Auswahl-Pille (an/aus)."""

    def __init__(self, parent, text, active, cmd):
        self.font = tkfont.Font(family=FONT, size=9, weight="bold")
        super().__init__(parent, width=self.font.measure(text) + px(26), height=px(28), bg=bg_of(parent), highlightthickness=0, bd=0, cursor="hand2")
        self.text, self.cmd, self._hover = text, cmd, False
        self.bind("<ButtonRelease-1>", lambda e: self.cmd())
        self.bind("<Enter>", lambda e: (setattr(self, "_hover", True), self.draw()))
        self.bind("<Leave>", lambda e: (setattr(self, "_hover", False), self.draw()))
        self.bind("<Configure>", lambda e: self.draw())
        self.set(active)

    def set(self, active):
        self.active = active; self.draw()

    def draw(self):
        self.delete("all")
        w, h = max(int(self["width"]), self.winfo_width()), int(self["height"])
        a = self.active
        rrect(self, 1, 1, w - 1, h - 1, h / 2, fill=C["gold_dim"] if a else (C["card2"] if self._hover else C["input"]),
              outline=C["gold2"] if a else C["line2"])
        self.create_text(w / 2, h / 2, text=self.text, fill=C["gold"] if a else C["muted"], font=self.font)


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
        self.f = tkfont.Font(family=MONO if big else FONT, size=20 if big else 10, weight="bold" if big else "normal")
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
        w = tkfont.Font(font=f).measure(label) + px(22)
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
            if ball:
                rrect(self, bx, y0 + px(13), bx + px(44), y0 + px(31), px(9), fill=C["bad"], outline="")
                self.create_text(bx + px(22), y0 + px(22), text="BALL", fill="#0b0e16", font=(FONT, 8, "bold"))
                bx += px(54)
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
         "m_pve": "🐗", "m_kph": "⏱", "m_last_enemy": "👤"}
OV_STYLES = ["tiles", "list", "bar"]


class Overlay:
    PAD = 12

    def __init__(self, app):
        self.app = app
        self.win = None
        self.vals = {}
        self.flash_until = 0
        self.alert = None           # (marker, ball, bis)
        self._drawn = None
        self.hwnd = None

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
        x, y = self._on_screen(int(ov.get("x", 60)), int(ov.get("y", 60)))
        w.geometry("+%d+%d" % (x, y))
        self.cv.bind("<ButtonPress-1>", self._start)
        self.cv.bind("<B1-Motion>", self._move)
        self.cv.bind("<ButtonRelease-1>", self._stop)
        self.cv.bind("<Button-3>", self._menu)
        self.cv.bind("<Double-Button-1>", lambda e: self.alert and self.app.copy_xy(self.alert[0]))
        self._drawn = None
        self.draw()
        if IS_WIN:
            w.after(200, self._win_style)

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
        """Werkzeugfenster: kein Taskleisten-Eintrag, klaut dem Spiel nicht den Fokus, bleibt ganz oben."""
        try:
            import ctypes
            u = ctypes.windll.user32
            self.hwnd = u.GetParent(self.win.winfo_id()) or self.win.winfo_id()
            GWL_EXSTYLE, WS_EX_TOOLWINDOW, WS_EX_NOACTIVATE, WS_EX_TOPMOST, WS_EX_APPWINDOW = -20, 0x80, 0x08000000, 0x8, 0x40000
            st = u.GetWindowLongW(self.hwnd, GWL_EXSTYLE)
            u.SetWindowLongW(self.hwnd, GWL_EXSTYLE, (st | WS_EX_TOOLWINDOW | WS_EX_NOACTIVATE | WS_EX_TOPMOST) & ~WS_EX_APPWINDOW)
            self.keep_top()
        except Exception as e:
            log("overlay style: %s" % e)

    def keep_top(self):
        if not self.win:
            return
        try:
            if IS_WIN and self.hwnd:
                import ctypes
                # HWND_TOPMOST, ohne Verschieben/Groesse/Fokus -> kein Flackern
                ctypes.windll.user32.SetWindowPos(self.hwnd, -1, 0, 0, 0, 0, 0x0001 | 0x0002 | 0x0010 | 0x0040)
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

    def ball_list(self):
        """Neueste Ball-Marker fuers Overlay (ohne den, der gerade als Alarm oben steht)."""
        n = int(self.app.cfg["overlay"].get("ball_n", 3))
        if n <= 0:
            return []
        words = self.app.ball_words()
        skip = self.alert[0].get("key") if self.alert and time.time() < self.alert[2] else None
        with self.app.scanner.lock:
            ms = [m for m in self.app.scanner.markers.values() if m.get("key") != skip and is_ball(m, words)]
        ms.sort(key=lambda m: -m["t"])
        return ms[:n]

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
        M = {k: tkfont.Font(font=v) for k, v in F.items()}
        rng = T(ov.get("range", "r_session"))
        if ov.get("range") == "r_since" and ov.get("since"):
            rng = "%s %s" % ("seit" if self.app.cfg["lang"] == "de" else "since", ov["since"])
        keys = ov.get("metrics", [])
        tone = self.vals.get("_tone", {})
        flashing = now < self.flash_until
        al = self.alert if self.alert and now < self.alert[2] else None
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
        if ok and int(now) % 2 == 0:
            cv.create_oval(x + w - 2 * r - px(3), y + lg / 2 - r - px(3), x + w + px(3), y + lg / 2 + r + px(3), outline=dot, width=1)
        cv.create_text(x + w - 2 * r - px(8), y + lg / 2, text=self.app.t("live").upper(), anchor="e", fill=C["dim"], font=F["tiny"])
        return lg

    def _alert_box(self, cv, F, M, x, y, w, al, now):
        mk, ball = al[0], al[1]
        T = self.app.t
        a1 = "%s  X %d · Y %d" % ("🎯 " + T("mk_new_ball") if ball else "📍 " + T("mk_new"), mk["x"], mk["y"])
        a2 = (mk.get("text") or "")[:44] + ("  · " + self.app.ago(mk["t"]))
        lh = M["lab"].metrics("linespace") + px(4)
        h = lh * 2 + px(14)
        blink = int(now) % 2 == 0 and ball
        rrect(cv, x, y, x + w, y + h, px(10), fill="#3b1d24" if ball else C["gold_dim"], outline=(C["bad"] if blink else "#7f1d1d") if ball else C["gold2"])
        cv.create_text(x + px(10), y + px(7), text=a1, anchor="nw", fill=C["bad"] if ball else C["gold"], font=F["val"])
        cv.create_text(x + px(10), y + px(7) + lh, text=a2, anchor="nw", fill=C["text"], font=F["lab"])
        return h

    def _draw_card(self, cv, F, M, rng, keys, vcol, al, balls, now, style):
        T, P = self.app.t, px(self.PAD)
        lh = M["lab"].metrics("linespace") + px(7)
        cols = 2 if len(keys) > 1 else 1
        # Breite bestimmen
        if style == "tiles":
            tw = max([max(M["tiny"].measure(ICONS.get(k, "") + "  " + T(k).upper()), M["big"].measure(self.vals.get(k, "–"))) for k in keys] + [px(70)]) + px(22)
            inner = cols * tw + (cols - 1) * px(8)
        else:
            lw = max([M["lab"].measure(ICONS.get(k, "") + "  " + T(k)) for k in keys] + [0])
            vw = max([M["val"].measure(self.vals.get(k, "–")) for k in keys] + [M["val"].measure("0.000")])
            inner = lw + px(24) + vw
        bl = [("X %d · Y %d" % (m["x"], m["y"]), self.app.ago(m["t"]), m) for m in balls]
        inner = max(inner, max([M["val"].measure(a) + M["small"].measure(b) + px(46) for a, b, _ in bl] + [0]),
                    M["head"].measure(rng.upper()) + px(90), px(180))
        if al:
            inner = max(inner, M["val"].measure("🎯 " + T("mk_new_ball") + "  X 0000 · Y 0000") + px(24))
        W = inner + 2 * P
        # Hoehe vorab berechnen (zeichnen in zwei Durchgaengen waere teurer)
        y = P
        hh = px(18) + px(12)
        tile_h = M["tiny"].metrics("linespace") + M["big"].metrics("linespace") + px(18)
        rows_h = (((len(keys) + cols - 1) // cols) * (tile_h + px(8))) if style == "tiles" else len(keys) * lh
        al_h = (M["lab"].metrics("linespace") + px(4)) * 2 + px(14) + px(8) if al else 0
        b_h = (M["tiny"].metrics("linespace") + px(8) + len(bl) * lh + px(6)) if bl else 0
        H = P + hh + al_h + b_h + rows_h + P - (px(8) if style == "tiles" and keys else 0)
        cv.configure(width=W + 1, height=H + 1)
        rrect(cv, 0, 0, W, H, px(18), fill="#090c13", outline="#4a3a10")
        rrect(cv, 1, 1, W - 1, P + hh - px(2), px(17), fill="#101522", outline="")
        cv.create_rectangle(1, P + hh - px(16), W - 1, P + hh - px(2), fill="#101522", outline="")
        cv.create_line(P, P + hh - px(2), W - P, P + hh - px(2), fill=C["gold2"])
        self._head(cv, F, M, P, y, inner, rng, now)
        y = P + hh + px(6)
        if al:
            y += self._alert_box(cv, F, M, P, y, inner, al, now) + px(8)
        if bl:
            cv.create_text(P, y, text="🎯 " + T("ov_balls").upper(), anchor="nw", fill=C["bad"], font=F["tiny"])
            y += M["tiny"].metrics("linespace") + px(8)
            for i, (xy, ago, m) in enumerate(bl):
                fresh = now - m["t"] < 600
                cy = y + lh / 2 - px(2)
                cv.create_oval(P + px(1), cy - px(4), P + px(9), cy + px(4), fill=C["bad"] if fresh else "#5b1a1a", outline="")
                cv.create_text(P + px(17), y, text=xy, anchor="nw", fill="#fecaca" if fresh else C["text"], font=F["val"])
                cv.create_text(W - P, y + px(2), text=ago, anchor="ne", fill=C["bad"] if fresh else C["dim"], font=F["small"])
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
                cv.create_text(x0 + px(10), y0 + px(8), text=ICONS.get(k, "") + "  " + T(k).upper(), anchor="nw", fill=C["muted"], font=F["tiny"])
                cv.create_text(x0 + px(10), y0 + tile_h - px(7), text=self.vals.get(k, "–"), anchor="sw", fill=vcol(k), font=F["big"])
        else:
            for i, k in enumerate(keys):
                if i:
                    cv.create_line(P, y - px(3), W - P, y - px(3), fill="#151b29")
                cv.create_text(P, y, text=ICONS.get(k, "") + "  " + T(k), anchor="nw", fill=C["muted"], font=F["lab"])
                cv.create_text(W - P, y, text=self.vals.get(k, "–"), anchor="ne", fill=vcol(k), font=F["val"])
                y += lh

    def _draw_bar(self, cv, F, M, rng, keys, vcol, al, balls, now):
        """Schmale Leiste: alle Werte nebeneinander."""
        P = px(10)
        parts = [(ICONS.get(k, ""), self.vals.get(k, "–"), vcol(k)) for k in keys]
        if al:
            parts.insert(0, ("🎯" if al[1] else "📍", "X %d Y %d" % (al[0]["x"], al[0]["y"]), C["bad"] if al[1] else C["gold"]))
        for m in balls[:2]:
            parts.append(("🎯", "X %d Y %d · %s" % (m["x"], m["y"], self.app.ago(m["t"])), C["bad"] if now - m["t"] < 600 else "#fca5a5"))
        h = M["val"].metrics("linespace") + px(16)
        widths = [M["lab"].measure(i + " ") + M["val"].measure(v) for i, v, _ in parts]
        W = px(30) + sum(widths) + px(22) * max(0, len(parts)) + P
        cv.configure(width=W + 1, height=h + 1)
        blink = al and al[1] and int(now) % 2 == 0
        rrect(cv, 0, 0, W, h, h / 2, fill="#090c13", outline=C["bad"] if blink else "#4a3a10")
        ok = self.app.scanner.status and "…" not in self.app.scanner.status
        r = px(4)
        cv.create_oval(P + px(4), h / 2 - r, P + px(4) + 2 * r, h / 2 + r, fill=C["good"] if ok else C["dim"], outline="")
        x = px(30)
        for (ico, val, col), w in zip(parts, widths):
            t1 = cv.create_text(x, h / 2, text=ico + " ", anchor="w", fill=C["muted"], font=F["lab"])
            cv.create_text(cv.bbox(t1)[2], h / 2, text=val, anchor="w", fill=col, font=F["val"])
            x += w + px(11)
            cv.create_line(x, px(8), x, h - px(8), fill=C["line2"])
            x += px(11)

    def update(self, vals):
        if not self.win:
            return
        now = time.time()
        if self.vals and vals.get("_n", 0) > self.vals.get("_n", 0):
            self.flash_until = now + 4                        # neuer Kampf: kurz golden
        al = self.alert and now < self.alert[2]
        bsig = (len(self.app.scanner.markers), int(now // 30)) if self.app.cfg["overlay"].get("ball_n", 3) else 0
        key = (id(vals), now < self.flash_until, bool(al), int(now) % 2, int(now // 60) if al else 0, bsig)
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
PAGES = [("home", "🏠", "tab_home", "sub_home"), ("conn", "🔗", "tab_conn", "sub_conn"), ("acc", "👤", "tab_acc", "sub_acc"), ("mk", "📍", "tab_mk", "sub_mk"),
         ("ov", "🪟", "tab_ov", "sub_ov"), ("set", "⚙", "tab_set", "sub_set")]


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
        self.page = "conn" if not self.cfg.get("token") else "home"
        self.started = time.time()
        self.scanner = Scanner(self)
        self.overlay = Overlay(self)
        self._flash = ("", 0)
        self.build_ui()
        threading.Thread(target=self.scanner.loop, daemon=True).start()
        if self.cfg.get("token"):
            threading.Thread(target=self.refresh_me, daemon=True).start()
        self.overlay.show(self.cfg["overlay"].get("show", True))
        if self.cfg.get("start_min") and not START_LINK:
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
        for c in self.main.winfo_children():
            c.destroy()
        key, ico, lab, sub = next(p for p in PAGES if p[0] == self.page)
        hd = tk.Frame(self.main, bg=C["bg"]); hd.pack(fill="x", padx=px(30), pady=(px(26), px(14)))
        tk.Label(hd, text=self.t(lab), bg=C["bg"], fg=C["text"], font=(FONT, 20, "bold")).pack(anchor="w")
        tk.Label(hd, text=self.t(sub), bg=C["bg"], fg=C["muted"], font=(FONT, 10)).pack(anchor="w", pady=(px(2), 0))
        tk.Frame(hd, bg=C["gold2"], height=2, width=px(48)).pack(anchor="w", pady=(px(10), 0))
        body = tk.Frame(self.main, bg=C["bg"]); body.pack(fill="both", expand=True, padx=px(30), pady=(0, px(22)))
        getattr(self, "page_" + key)(body)
        self._owners_keys = tuple(sorted(self.scanner.owners))

    # ---------- Seiten ----------
    def page_home(self, body):
        T, ov = self.t, self.cfg["overlay"]
        bar = tk.Frame(body, bg=C["bg"]); bar.pack(fill="x", pady=(0, px(12)))
        tk.Label(bar, text=T("ov_range") + ":", bg=C["bg"], fg=C["muted"], font=(FONT, 9)).pack(side="left", padx=(0, px(8)))
        self.range_chips = {}
        for rk in RANGES:
            if rk == "r_since" and not ov.get("since"):
                continue
            ch = Chip(bar, T(rk).split(" (")[0], ov.get("range") == rk, lambda rk=rk: self.set_range(rk))
            ch.pack(side="left", padx=(0, px(5))); self.range_chips[rk] = ch
        self.home = {}
        tiles = tk.Frame(body, bg=C["bg"]); tiles.pack(fill="x")
        for i, (k, ico) in enumerate((("m_kp", "⚔"), ("m_kp_trade", "⚖"), ("m_loss_trade", "🩸"), ("m_dead", "💀"))):
            c = Card(tiles, pad=14, radius=16)
            c.grid(row=0, column=i, sticky="nsew", padx=(0 if i == 0 else px(6), 0))
            tiles.columnconfigure(i, weight=1, uniform="t")
            tk.Label(c.body, text="%s  %s" % (ico, T(k).upper()), bg=C["card"], fg=C["muted"], font=(FONT, 8, "bold")).pack(anchor="w")
            v = tk.Label(c.body, text="–", bg=C["card"], fg=C["text"], font=(FONT, 22, "bold")); v.pack(anchor="w", pady=(px(4), 0))
            self.home[k] = v
        row = tk.Frame(body, bg=C["bg"]); row.pack(fill="both", expand=True, pady=(px(12), 0))
        row.columnconfigure(0, weight=1, uniform="r"); row.columnconfigure(1, weight=1, uniform="r")
        c = Card(row, T("h_last")); c.grid(row=0, column=0, sticky="nsew", padx=(0, px(6)))
        for k in ("m_kp_last", "m_last_enemy", "m_kph", "m_pvp", "m_pve", "m_enemy_out"):
            r = tk.Frame(c.body, bg=C["card"]); r.pack(fill="x", pady=px(2))
            tk.Label(r, text=T(k), bg=C["card"], fg=C["muted"], font=(FONT, 10)).pack(side="left")
            v = tk.Label(r, text="–", bg=C["card"], fg=C["text"], font=(FONT, 10, "bold")); v.pack(side="right")
            self.home[k] = v
        c = Card(row, "🎯 " + T("ov_balls")); c.grid(row=0, column=1, sticky="nsew", padx=(px(6), 0))
        self.home_balls = tk.Frame(c.body, bg=C["card"]); self.home_balls.pack(fill="both", expand=True)
        self._home_bsig = None
        self.update_home()

    def update_home(self):
        if self.page != "home" or not getattr(self, "home", None):
            return
        vals = getattr(self, "_vals", {}) or {}
        tone = vals.get("_tone", {})
        try:
            for k, lb in self.home.items():
                col = C["good"] if tone.get(k) == "good" else C["bad"] if tone.get(k) == "bad" else (C["gold"] if k == "m_kp" else C["text"])
                txt = vals.get(k, "–")
                if lb.cget("text") != txt or lb.cget("fg") != col:
                    lb.configure(text=txt, fg=col)
            words = self.ball_words()
            with self.scanner.lock:
                ms = sorted([m for m in self.scanner.markers.values() if is_ball(m, words)], key=lambda m: -m["t"])[:4]
            sig = tuple((m.get("key"), int((time.time() - m["t"]) // 60)) for m in ms)
            if sig != self._home_bsig:
                self._home_bsig = sig
                for w in self.home_balls.winfo_children():
                    w.destroy()
                if not ms:
                    tk.Label(self.home_balls, text=self.t("h_noball"), bg=C["card"], fg=C["dim"], font=(FONT, 9), wraplength=px(300), justify="left").pack(anchor="w")
                for m in ms:
                    r = tk.Frame(self.home_balls, bg=C["card"]); r.pack(fill="x", pady=px(3))
                    fresh = time.time() - m["t"] < 600
                    tk.Label(r, text="●", bg=C["card"], fg=C["bad"] if fresh else "#7f1d1d", font=(FONT, 9)).pack(side="left")
                    tk.Label(r, text="X %d · Y %d" % (m["x"], m["y"]), bg=C["card"], fg=C["gold"], font=(FONT, 10, "bold")).pack(side="left", padx=px(6))
                    tk.Label(r, text=self.ago(m["t"]), bg=C["card"], fg=C["bad"] if fresh else C["dim"], font=(FONT, 9)).pack(side="left")
                    Btn(r, "📋", lambda m=m: self.copy_xy(m), "ghost", small=True).pack(side="right")
        except tk.TclError:
            pass

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
            if ln:
                tk.Label(top, text=T("k_" + kind), bg=C["card2"], fg=kcol[kind], font=(FONT, 8, "bold"), padx=6).pack(side="left", padx=8)
                if ln.get("status") == "pending":
                    tk.Label(top, text="⏳ " + T("pending"), bg=C["card"], fg="#fbbf24", font=(FONT, 8, "bold")).pack(side="left")
            last = datetime.fromtimestamp(o["last"]).strftime("%d.%m.%Y %H:%M") if o.get("last") else "–"
            tk.Label(info, text="ID %s  ·  %s" % (pid, T("reports", n=o.get("mails", 0), t=last)), bg=C["card"], fg=C["dim"], font=(FONT, 9)).pack(anchor="w")
            if ln and ln.get("status") == "pending":
                tk.Label(info, text=T("pending_info"), bg=C["card"], fg=C["dim"], font=(FONT, 8)).pack(anchor="w")
            btns = tk.Frame(row, bg=C["card"]); btns.pack(side="right", padx=px(4))
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
        bar = tk.Frame(body, bg=C["bg"]); bar.pack(fill="x", pady=(0, px(10)))
        for key, lab in (("all", "mk_all"), ("ball", "mk_ball")):
            Chip(bar, T(lab), mc.get("filter") == key, lambda key=key: (self.set_mk("filter", key), self.refresh_markers(True))).pack(side="left", padx=(0, px(6)))
        tk.Frame(bar, bg=C["bg"], width=px(14)).pack(side="left")
        for key, lab in (("new", "mk_sort_new"), ("ball", "mk_sort_ball")):
            Chip(bar, T(lab), mc.get("sort") == key, lambda key=key: (self.set_mk("sort", key), self.refresh_markers(True))).pack(side="left", padx=(0, px(6)))
        Btn(bar, "💾 " + T("mk_export"), self.export_samples, "ghost", small=True).pack(side="right")
        Btn(bar, "🗑 " + T("mk_clear"), self.clear_markers, "danger", small=True).pack(side="right", padx=px(6))
        o, c = card(body, None); o.pack(side="bottom", fill="x", pady=(px(10), 0))
        r = tk.Frame(c, bg=C["card"]); r.pack(fill="x")
        tk.Label(r, text=T("mk_words"), bg=C["card"], fg=C["muted"], font=(FONT, 9)).pack(side="left")
        self.v_words = tk.StringVar(value=mc.get("words", ""))
        e = entry(r, self.v_words, 30); e.pack(side="left", padx=px(8))
        e.bind("<FocusOut>", lambda _e: self.set_words()); e.bind("<Return>", lambda _e: self.set_words())
        tk.Label(r, text=T("mk_keep"), bg=C["card"], fg=C["muted"], font=(FONT, 9)).pack(side="left", padx=(px(10), px(4)))
        kl = tk.Label(r, text=str(mc.get("keep_ball", 5)), bg=C["card"], fg=C["text"], font=(FONT, 10, "bold"), width=3)
        def kstep(d):
            n = max(1, min(20, int(self.cfg["markers"].get("keep_ball", 5)) + d)); kl.configure(text=str(n))
            self.set_mk("keep_ball", n); self.scanner.prune_markers(); self.refresh_markers(True)
        Btn(r, "−", lambda: kstep(-1), "ghost", small=True).pack(side="left"); kl.pack(side="left"); Btn(r, "+", lambda: kstep(1), "ghost", small=True).pack(side="left")
        r = tk.Frame(c, bg=C["card"]); r.pack(fill="x", pady=(px(8), 0))
        for i, (key, lab) in enumerate((("sound", "mk_sound"), ("overlay", "mk_overlay"), ("alarm_all", "mk_all_alarm"))):
            v = tk.BooleanVar(value=mc.get(key, False))
            Toggle(r, T(lab), v, lambda key=key, v=v: self.set_mk(key, v.get())).grid(row=i // 2, column=i % 2, sticky="w", padx=(0, px(18)), pady=px(2))
        self.mk_list = MarkerList(body, self)
        self.mk_list.pack(fill="both", expand=True)
        self._mk_sig = None
        self.refresh_markers(True)

    def marker_items(self):
        mc, words = self.cfg["markers"], self.ball_words()
        with self.scanner.lock:
            mks = list(self.scanner.markers.values())
        for m in mks:
            m["_ball"] = is_ball(m, words)
        if mc.get("filter") == "ball":
            mks = [m for m in mks if m["_ball"]]
        mks.sort(key=lambda m: ((not m["_ball"]) if mc.get("sort") == "ball" else 0, -m["t"]))
        return mks[:80]

    def refresh_markers(self, force=False):
        if self.page != "mk" or not getattr(self, "mk_list", None):
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
        self.scanner.delete_marker(key); self.refresh_markers(True); self.overlay.draw()

    def clear_markers(self):
        if messagebox.askyesno("Wiz fan Club", self.t("mk_clear") + "?"):
            with self.scanner.lock:
                keys = list(self.scanner.markers)
            for k in keys:
                self.scanner.delete_marker(k)
            self.overlay.alert = None
            self.refresh_markers(True); self.overlay.draw()

    def set_words(self):
        self.set_mk("words", self.v_words.get()); self.refresh_markers(True); self.overlay.draw()

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
        self.refresh_markers(True)

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
        tk.Label(r, text="🎯 " + T("ov_ball_n"), bg=C["card"], fg=C["muted"], font=(FONT, 9)).pack(side="left", padx=(0, px(6)))
        self.balln_chips = {}
        for n in range(0, 6):
            ch = Chip(r, T("off") if n == 0 else str(n), int(ov.get("ball_n", 3)) == n, lambda n=n: self.set_ball_n(n))
            ch.pack(side="left", padx=(0, px(4))); self.balln_chips[n] = ch

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
        self._sig = None
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
        self.cfg["overlay"]["metrics"] = [m for m in METRICS if m in ms]
        save_cfg(self.cfg)
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
                nm, self.scanner.new_markers = self.scanner.new_markers, []
                nb = len(self.scanner.battles)
            sig = (nb, rng, since if rng != "r_24h" and rng != "r_7d" else int(since // 60), ov.get("pvp_only", True),
                   tuple(sorted(ids)) if ids is not None else None, self.cfg.get("lang"), int(now // 30))
            if sig != getattr(self, "_sig", None):
                self._sig = sig
                with self.scanner.lock:
                    bs = list(self.scanner.battles.values())
                self._local = compute(bs, ids, rng, since, ov.get("pvp_only", True), self.cfg.get("lang", "de"))
                self._vals = self._local
            web = ov.get("source", "web") == "web" and self.cfg.get("token")
            q = "stats&since=%d&pvp=%d&pilot=%d" % (int(since) // 60 * 60, 1 if ov.get("pvp_only", True) else 0, 1 if ov.get("count_pilot") else 0)
            if web and getattr(self, "_web_q", None) == q and getattr(self, "_web_stats", None) and self._vals.get("_src") != "web":
                self._vals = web_vals(self._web_stats, self._local, self.cfg.get("lang", "de"))     # letzte Website-Zahlen behalten
            if web and getattr(self, "_web_q", None) != q:
                self._web_due = 0                                   # Zeitraum/Filter geaendert -> sofort fragen
            if web and now >= getattr(self, "_web_due", 0) and not getattr(self, "_web_busy", False):
                self._web_due = now + 30                            # alle 30 s
                self._web_busy = True
                lang = self.cfg.get("lang", "de")

                def got(d, err, q=q):
                    self._web_busy = False
                    if err or not d or not d.get("stats"):
                        self._web_err = str(err) if err else ""
                        if getattr(self, "_web_q", None) != q:
                            self._web_q, self._web_stats = q, None       # nicht jede Sekunde neu versuchen
                        return
                    self._web_err, self._web_q, self._web_stats = "", q, d["stats"]
                    self._vals = web_vals(d["stats"], getattr(self, "_local", {}), lang)
                self.run_bg(lambda: self.api(q), got)
            if ov.get("source", "web") != "web" and getattr(self, "_vals", {}).get("_src") == "web":
                self._vals = getattr(self, "_local", {})
            words = self.ball_words()
            for mk in sorted(nm, key=lambda m: m["t"]):
                ball = is_ball(mk, words)
                if ball or self.cfg["markers"].get("alarm_all"):
                    self.alarm(mk, ball)
            if nm:
                self.refresh_markers(True); self.overlay.draw()
            self.overlay.update(self._vals)
            msg, ts = self._flash
            st = msg if msg and now - ts < 8 else self.scanner.status
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
