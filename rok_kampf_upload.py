# -*- coding: utf-8 -*-
"""
RoK Kampfbericht-Uploader
-------------------------
Liest die Kampfberichte, die Rise of Kingdoms lokal im Ordner (Version 11: + Verdienst/Acclaim pro Kampf; Version 10: + Jahresrueckblick AnniversaryMemory -> rok_memory; Version 9: + Kampfort/Stadt fuer die Heatmap; Version 8: + Ausruestung/Skills/Ruestung pro Kampf; Version 7: + Farmen aus MuMu Player, nur Sammel-Mails, Account-Wechsel, alle 10 Min.)
  <Spielordner>\\save\\mailcache\\Persistent.Mail.*
zwischenspeichert, und laedt neue Kaempfe in die Supabase-Tabelle "rok_battles".

* Liest nur – veraendert keine Spieldateien.
* Merkt sich, welche Dateien schon verarbeitet wurden (uploader_state.json).
* Braucht nur Python 3 (keine Zusatzpakete).
"""
import json, os, re, struct, sys, zipfile, time, glob, traceback, subprocess
import urllib.request, urllib.error

HERE = os.path.dirname(os.path.abspath(__file__))
CONFIG_FILE = os.path.join(HERE, "config.json")
STATE_FILE = os.path.join(HERE, "uploader_state.json")
LOG_FILE = os.path.join(HERE, "uploader_log.txt")
BATCH = 300


def log(msg):
    line = time.strftime("%Y-%m-%d %H:%M:%S ") + msg
    print(line)
    try:
        with open(LOG_FILE, "a", encoding="utf-8") as f:
            f.write(line + "\n")
        if os.path.getsize(LOG_FILE) > 2_000_000:  # Log klein halten
            with open(LOG_FILE, "r", encoding="utf-8") as f:
                rest = f.readlines()[-2000:]
            with open(LOG_FILE, "w", encoding="utf-8") as f:
                f.writelines(rest)
    except OSError:
        pass


# ---------- Kampfbericht-Format (serialisierte Lua-Tabelle) ----------
def _rd(b, i):
    if i >= len(b):
        return None, i
    t = b[i]; i += 1
    if t == 4:                                   # String
        n = struct.unpack_from("<I", b, i)[0]; i += 4
        return b[i:i + n].decode("utf-8", "replace"), i + n
    if t == 3:                                   # Zahl (double, big endian)
        return struct.unpack_from(">d", b, i)[0], i + 8
    if t == 1:                                   # bool
        return bool(b[i]), i + 1
    if t == 2:                                   # nil
        return None, i
    if t == 5:                                   # Tabelle, Ende = 0xFF
        d = {}
        while i < len(b) and b[i] != 0xFF:      # unvollstaendige Dateien tolerieren
            k, i = _rd(b, i)
            v, i = _rd(b, i)
            if isinstance(v, float) and v.is_integer():
                v = int(v)
            if isinstance(k, float):
                k = int(k)
            d[str(k)] = v
        return d, i + 1
    raise ValueError("unbekannter Typ %d an Position %d" % (t, i - 1))


def read_mail(path):
    with open(path, "rb") as f:
        b = f.read()
    start = b.find(b"\x05\x04")           # Beginn der Tabelle suchen
    while 0 <= start <= 32:
        n = struct.unpack_from("<I", b, start + 2)[0] if start + 6 <= len(b) else 0
        if 0 < n < 64:                      # plausibler erster Schluessel
            v, _ = _rd(b, start)
            return v
        start = b.find(b"\x05\x04", start + 1)
    return None


# ---------- Kommandantennamen aus lc_hero.dat ----------
def _lc_parse(raw):
    k = raw[3]
    b = bytes(x ^ k for x in raw)
    i, out = 2, []
    while i + 2 <= len(b):
        n = int.from_bytes(b[i:i + 2], "little"); i += 2
        out.append(b[i:i + n].decode("utf-8", "replace")); i += n
    return out


def load_hero_names(game_dir, lang):
    p = os.path.join(game_dir, "MASS_Data", "StreamingAssets", "lc_hero.dat")
    try:
        with zipfile.ZipFile(p) as z:
            names = z.namelist()
            idx = [n for n in names if n.endswith(".idx")][0]
            binf = [n for n in names if n.endswith("_%s.bin" % lang)] or \
                   [n for n in names if n.endswith("_en.bin")]
            keys = _lc_parse(z.read(idx))
            vals = _lc_parse(z.read(binf[0]))
        d = dict(zip(keys, vals))
        return {int(k[5:]): v for k, v in d.items() if k.startswith("NAME_") and k[5:].isdigit()}
    except Exception as e:
        log("Hinweis: Kommandantennamen nicht lesbar (%s) – es werden nur IDs gespeichert" % e)
        return {}


# ---------- Namen fuer die Detailansicht (Ausruestung, Skills, Ruestung) ----------
def load_lc(game_dir, fname, lang):
    p = os.path.join(game_dir, "MASS_Data", "StreamingAssets", fname)
    try:
        with zipfile.ZipFile(p) as z:
            names = z.namelist()
            idx = [n for n in names if n.endswith(".idx")][0]
            binf = [n for n in names if n.endswith("_%s.bin" % lang)]
            if not binf:
                return {}
            return dict(zip(_lc_parse(z.read(idx)), _lc_parse(z.read(binf[0]))))
    except Exception:
        return {}


def load_detail_names(game_dir):
    """{'en': {...}, 'de': {...}} mit Kommandanten-, Skill-, Ausruestungs-, Ruestungs- und Wert-Namen."""
    out = {}
    for lang in ("en", "de"):
        d = {}
        for f in ("lc_hero.dat", "lc_equipment.dat", "lc_formation.dat", "lc_common.dat"):
            src = load_lc(game_dir, f, lang)
            for k, v in src.items():
                if k.startswith(("NAME_", "SKILL_NAME_", "N_", "ARMORY_NAME_", "EFFECT_ATTR_")) or (k.startswith("AFFIX_") and k.endswith("_NAME")):
                    d[f[:-4] + ":" + k] = v
        out[lang] = d
    return out


_HEQ = None
def _gear(heq, NM):
    """'{1:20003_142:2,...}' -> [[platz, item_id, zusatzwert, en, de], ...]"""
    import re
    global _HEQ
    _HEQ = _HEQ or re.compile(r"(\d+):(\d+)_\d+:(\d+)")
    out = []
    for slot, iid, x in _HEQ.findall(heq if isinstance(heq, str) else ""):
        iid = int(iid)
        out.append([int(slot), iid, int(x)] + NM("lc_equipment:N_%d" % (iid - 20000)))
    return sorted(out)


def _skills(hss, NM):
    out = []
    for k, v in sorted((hss or {}).items(), key=lambda kv: int(kv[0]) if str(kv[0]).isdigit() else 99) if isinstance(hss, dict) else []:
        if isinstance(v, dict) and isinstance(v.get("SkillId"), int):
            out.append([v["SkillId"], v.get("SkillLevel")] + NM("lc_hero:SKILL_NAME_%d" % v["SkillId"]))
    return out


def _armory(hwbs, NM):
    """Ruestungsteile: [[platz, id, en, de, [[inschrift, en, de]], [[wert_id, wert, en, de]]], ...]"""
    out = []
    for slot, v in (hwbs or {}).items() if isinstance(hwbs, dict) else []:
        if not isinstance(v, dict):
            continue
        aid = str(v.get("Id") or "").split("_")[0]
        key = "lc_formation:ARMORY_NAME_73%s000" % aid[2:5] if len(aid) >= 5 else ""
        aff = [[int(a)] + NM("lc_hero:AFFIX_%s_NAME" % a) for a in str(v.get("Affix") or "").split(";") if a.strip().isdigit()]
        buffs = []
        for b in str(v.get("Buffs") or "").split(";"):
            if "_" in b:
                bid, val = b.split("_", 1)
                try:
                    buffs.append([int(bid), round(float(val), 4)] + NM("lc_common:EFFECT_ATTR_%s" % bid))
                except ValueError:
                    pass
        out.append([int(slot) if str(slot).isdigit() else slot, int(aid) if aid.isdigit() else aid] + NM(key) + [aff, buffs])
    return sorted(out, key=lambda x: str(x[0]))


def _side(ch, NM):
    if not isinstance(ch, dict):
        return None
    def hero(sfx):
        hid = ch.get("HId" + sfx)
        if not isinstance(hid, int) or hid <= 0:
            return None
        return {"id": hid, "n": NM("lc_hero:NAME_%d" % hid), "lv": ch.get("HLv" + sfx), "st": ch.get("HSt" + sfx),
                "aw": bool(ch.get("HAw" + sfx)), "sk": _skills(ch.get("HSS" + sfx), NM)}
    return {"pid": ch.get("PId"), "name": ch.get("PName"), "abbr": ch.get("Abbr"), "city": ch.get("CastleLevel"),
            "h1": hero(""), "h2": hero("2"), "gear": _gear(ch.get("HEq"), NM), "arm": _armory(ch.get("HWBs"), NM)}


def _loss(d):
    d = d or {}
    keys = ("InitMax", "Max", "Cnt", "Hurt", "BadHurt", "Death", "Healing", "Power", "SkillPower", "AtkPower", "KillScore", "HurtCntEnd", "AddCnt")
    return {k: d.get(k) for k in keys if isinstance(d.get(k), (int, float))}


def battle_detail(c, a, NM):
    """Alles fuer die Detailansicht eines Kampfes (eigene Seite + Gegner)."""
    samples = []
    for v in (c.get("Samples") or {}).values():
        if isinstance(v, dict) and isinstance(v.get("T"), (int, float)):
            samples.append([v["T"], v.get("Cnt")])
    samples.sort()
    return {"v": 1, "self": _side(c.get("SelfChar"), NM), "enemy": _side(a.get("CIdt"), NM),
            "own": _loss(a.get("Damage")), "opp": _loss(a.get("Kill")),
            "t0": a.get("TickStart"), "ticks": a.get("Tick"), "samples": samples[:120],
            "sov": _loss(c.get("SOv")), "oov": _loss(c.get("OOv")), "fights": len(c.get("Attacks") or {})}


# ---------- Kampfbericht -> Tabellenzeilen ----------
def _num(d, k):
    v = (d or {}).get(k)
    return v if isinstance(v, (int, float)) else None


def _xy(p, k):
    v = p.get(k) if isinstance(p, dict) else None
    return round(float(v), 1) if isinstance(v, (int, float)) else None


def battle_rows(mail, account_label, heroes, names=None):
    if not isinstance(mail, dict) or mail.get("type") != "Battle":
        return []
    c = (mail.get("body") or {}).get("content") or {}
    me = c.get("SelfChar") or {}
    attacks = c.get("Attacks") or {}
    rows = []
    hn = lambda i: heroes.get(i) if isinstance(i, int) else None
    names = names or {}
    NM = lambda k: [(names.get("en") or {}).get(k), (names.get("de") or {}).get(k)]
    for opp_id, a in attacks.items():
        en = a.get("CIdt") or {}
        own = a.get("Damage") or {}       # eigene Truppen
        opp = a.get("Kill") or {}         # Gegner-Truppen
        rows.append({
            "mail_id": str(mail.get("id")),
            "opponent_id": str(opp_id),
            "account": account_label,
            "player_id": me.get("PId"),
            "server_id": c.get("GsId") or mail.get("serverId"),
            "battle_start": _ts(c.get("Bts")),
            "battle_end": _ts(c.get("Ets")),
            "is_pvp": isinstance(en.get("PId"), int) and en.get("PId") > 0 and bool(en.get("PName")),
            "self_name": me.get("PName"),
            "self_alliance": me.get("Abbr"),
            "self_hero1_id": me.get("HId"), "self_hero1": hn(me.get("HId")),
            "self_hero2_id": me.get("HId2"), "self_hero2": hn(me.get("HId2")),
            "self_formation": me.get("HFMs") if isinstance(me.get("HFMs"), int) else None,     # v20: Ruestungs-Formation (Pincer/Wedge/Delta/V -> Truppentyp)
            "self_troops_start": _num(own, "InitMax"),
            "self_remaining": _num(own, "Cnt"),
            "self_wounded": _num(own, "Hurt"),
            "self_severe": _num(own, "BadHurt"),
            "self_dead": _num(own, "Death"),
            "self_healing": _num(own, "Healing"),
            "self_power_lost": _num(own, "Power"),
            "enemy_player_id": en.get("PId"),
            "enemy_name": en.get("PName"),
            "enemy_alliance": en.get("Abbr"),
            "enemy_alliance_name": en.get("AName"),
            "enemy_kingdom": en.get("COSId"),          # v19: Herkunfts-Koenigreich des Gegners
            "enemy_hero1_id": en.get("HId"), "enemy_hero1": hn(en.get("HId")),
            "enemy_hero2_id": en.get("HId2"), "enemy_hero2": hn(en.get("HId2")),
            "enemy_formation": en.get("HFMs") if isinstance(en.get("HFMs"), int) else None,
            "enemy_troops_start": _num(opp, "InitMax"),
            "enemy_wounded": _num(opp, "Hurt"),
            "enemy_severe": _num(opp, "BadHurt"),
            "enemy_dead": _num(opp, "Death"),
            "enemy_power_lost": _num(opp, "Power"),
            "kill_points": _num(own, "KillScore"),      # eigene Killpunkte (v2-Fix)
            "enemy_kill_points": _num(opp, "KillScore"),
            "loot": a.get("NpcKillLoot") or None,
            "npc_btype": en.get("NpcBType") if isinstance(en.get("NpcBType"), int) else None,   # v4: Art des NPC (1 = Barbar ...)
            "npc_type": en.get("NpcType") if isinstance(en.get("NpcType"), int) else None,
            "npc_level": en.get("HLv") if not (isinstance(en.get("PId"), int) and en.get("PId") > 0) else None,
            "group_size": len(c.get("STs") or {}) or 1,
            "pos_x": _xy(a.get("Pos"), "X"), "pos_y": _xy(a.get("Pos"), "Y"),                 # v9: Kampfort fuer die Heatmap
            "city_x": _xy(me.get("CastlePos"), "X"), "city_y": _xy(me.get("CastlePos"), "Y"),
            "map_role": c.get("Role"),
            "acclaim": _num(a.get("Damage") or {}, "Contribute") or _num(a.get("Damage") or {}, "WarExploits") or 0,   # v14: Verdienst (Acclaim) = Damage.Contribute
            "room_id": (int(c.get("RoomId")) if str(c.get("RoomId") or "").isdigit() and int(c.get("RoomId")) > 0 else None),                 # gsmp = Weltkarte, dungeon = Instanz/Event-Karte
            "detail": battle_detail(c, a, NM) if (isinstance(en.get("PId"), int) and en.get("PId") > 0 and len(c.get("STs") or {}) > 1) else None,   # v17: Details (Gear, Skills, Ruestung) nur bei Rally/Garnison
            "parent_id": str(mail.get("parentId") or mail.get("id") or ""),   # v17: Battle Streak (Hauptbericht) fuer „Flex“
        })
    return rows


def _items(loot):
    """{"1": {"Type":2,"SubType":142,"Value":176}, ...} -> Liste (typ, id, menge)"""
    out = []
    for v in (loot or {}).values() if isinstance(loot, dict) else []:
        if isinstance(v, dict) and isinstance(v.get("Value"), (int, float)):
            out.append((v.get("Type"), v.get("SubType"), v.get("Value")))
    return out


def loot_rows(mail, accs):
    """Beute: aus NPC-Kampfberichten (NpcKillLoot) und Event-Beute-Mails (pro Mitglied)."""
    if not isinstance(mail, dict):
        return []
    mid, out = str(mail.get("id")), []
    body = mail.get("body") or {}
    c = body.get("content") if isinstance(body, dict) else None
    t = mail.get("time")
    t = t / 1e6 if isinstance(t, (int, float)) and t > 1e14 else t
    def add(pid, src, ev, key, items, when, btype=None, lvl=None):
        if str(pid) not in accs:
            return
        for n, (typ, iid, val) in enumerate(items):
            out.append({"account": accs[str(pid)], "mail_id": mid, "idx": "%s_%d" % (key, n),
                        "player_id": pid, "got_at": _ts(when), "source": src, "event_name": ev,
                        "item_type": typ, "item_id": iid, "amount": val, "npc_btype": btype, "npc_level": lvl})
    if mail.get("type") == "Battle" and isinstance(c, dict):
        pid = (c.get("SelfChar") or {}).get("PId")
        for oid, a in (c.get("Attacks") or {}).items():
            en = a.get("CIdt") or {}
            add(pid, "npc", None, "b%s" % oid, _items(a.get("NpcKillLoot")), c.get("Bts") or t,
                en.get("NpcBType") if isinstance(en.get("NpcBType"), int) else None, en.get("HLv"))
    elif isinstance(c, dict) and isinstance(c.get("infos"), dict):
        for k, inf in c["infos"].items():
            if isinstance(inf, dict):
                items = _items(inf.get("loots")) + _items(inf.get("extLoots"))
                add(inf.get("playerId"), "event", c.get("EventName") or c.get("title") or mail.get("type"), "e%s" % k, items, t, None, None)   # v5: Belohnungs-Mail-Art (z. B. KillRaidBossReport)
    return out


def rally_rows(mail, accs, heroes):
    """Gruppenkaempfe (Rally/Garnison), in denen ein eigener Account nur Teilnehmer ist."""
    if not isinstance(mail, dict) or mail.get("type") != "Battle":
        return []
    c = (mail.get("body") or {}).get("content") or {}
    me = c.get("SelfChar") or {}
    if str(me.get("PId")) in accs:
        return []                                     # eigener Kampf -> steht in rok_battles
    members = [v for v in (c.get("STs") or {}).values() if isinstance(v, dict)]
    mine = [v for v in members if str(v.get("PId")) in accs]
    if not mine:
        return []
    att = c.get("Attacks") or {}
    sov = c.get("SOv") or {}
    kp = sov.get("KillScore") if isinstance(sov, dict) and sov else sum(_num(a.get("Damage"), "KillScore") or 0 for a in att.values())
    enemies = sorted({(a.get("CIdt") or {}).get("PName") or "NPC" for a in att.values()})
    ally = sorted({(a.get("CIdt") or {}).get("Abbr") or "" for a in att.values()} - {""})
    rows, seen_acc = [], set()
    for v in mine:
        if str(v.get("PId")) in seen_acc:                # mehrere Marschzuege desselben Accounts
            continue
        seen_acc.add(str(v.get("PId")))
        rows.append({"account": accs[str(v.get("PId"))], "mail_id": str(mail.get("id")), "player_id": v.get("PId"),
                     "battle_start": _ts(c.get("Bts")), "leader_name": me.get("PName"), "leader_alliance": me.get("Abbr"),
                     "members": len(members), "my_hero1": heroes.get(v.get("HId")), "my_hero2": heroes.get(v.get("HId2")),
                     "group_kill_points": kp,
                     "group_severe": sov.get("BadHurt") if sov else sum(_num(a.get("Damage"), "BadHurt") or 0 for a in att.values()),
                     "group_dead": sov.get("Dead") if sov else sum(_num(a.get("Damage"), "Death") or 0 for a in att.values()),
                     "enemy_kill_points": (c.get("OOv") or {}).get("KillScore") if c.get("OOv") else sum(_num(a.get("Kill"), "KillScore") or 0 for a in att.values()),
                     "opponents": len(att), "enemy_names": ", ".join(enemies)[:500], "enemy_alliances": ", ".join(ally)[:200],
                     "is_pvp": any(isinstance((a.get("CIdt") or {}).get("PId"), int) and (a.get("CIdt") or {}).get("PId") > 0 for a in att.values()),
                     "npc_btype": next((x.get("NpcBType") for x in ((a.get("CIdt") or {}) for a in att.values()) if isinstance(x.get("NpcBType"), int)), None),
                     "npc_level": next((x.get("HLv") for x in ((a.get("CIdt") or {}) for a in att.values()) if isinstance(x.get("NpcBType"), int)), None),
                     "pos_x": next((_xy(a.get("Pos"), "X") for a in att.values() if isinstance(a.get("Pos"), dict)), None),     # v9: Ort fuer die Heatmap
                     "pos_y": next((_xy(a.get("Pos"), "Y") for a in att.values() if isinstance(a.get("Pos"), dict)), None),
                     "map_role": c.get("Role")})
    return rows


MAX_CONTENT = 60000   # Zeichen; groessere Inhalte werden nicht mitgeschickt


def mail_player_id(mail):
    """Spieler-ID des Accounts, dem die Mail gehoert (Main oder Farm)."""
    rc = str(mail.get("receiver") or "")
    if rc.startswith("player_") and rc[7:].isdigit():
        return int(rc[7:])
    me = (((mail.get("body") or {}).get("content") or {}).get("SelfChar") or {})
    pid = me.get("PId")
    return pid if isinstance(pid, int) else None


def account_name(cfg, pid, default):
    """Name aus config "accounts" (z. B. Main/Farm 1); None = Account nicht hochladen."""
    accs = cfg.get("accounts") or {}
    if not accs:
        return default
    return accs.get(str(pid))


def mail_row(mail, account_label):
    """Eine Zeile pro Mail (alle Arten) fuer die Tabelle rok_mails."""
    if not isinstance(mail, dict) or not mail.get("id"):
        return None
    body = mail.get("body") or {}
    content = None
    if mail.get("type") != "Battle":              # Kaempfe stehen schon in rok_battles
        txt = json.dumps(body, ensure_ascii=False)
        if len(txt) <= MAX_CONTENT:
            content = body
    t = mail.get("time")
    if isinstance(t, (int, float)) and t > 1e14:  # Mikrosekunden
        t = t / 1e6
    if mail.get("type") == "Rss" and isinstance(t, (int, float)) and t < time.time() - 7 * 86400:
        return None                               # v17: alte Sammel-Mails bleiben weg (werden nach 7 Tagen zusammengefasst)
    return {
        "mail_id": str(mail.get("id")),
        "account": account_label,
        "player_id": mail_player_id(mail),
        "server_id": mail.get("serverId"),
        "mail_type": mail.get("type"),
        "box": mail.get("box"),
        "sender": mail.get("sender"),
        "sender_name": (mail.get("senderInfo") or {}).get("Name"),
        "sender_alliance": (mail.get("senderInfo") or {}).get("Abbr"),
        "parent_id": mail.get("parentId"),
        "sent_at": _ts(t),
        "content": content,
    }


def _ts(v):
    if isinstance(v, (int, float)) and v > 1_000_000_000:
        return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(v))
    return None


# ---------- Supabase ----------
def upload(cfg, rows, table="rok_battles", conflict="mail_id,opponent_id", batch=BATCH):
    base = cfg["supabase_url"].strip().rstrip("/")
    if base.endswith("/rest/v1"):              # haeufiger Fehler: Adresse inkl. /rest/v1 eingetragen
        base = base[:-len("/rest/v1")]
    url = base + "/rest/v1/%s?on_conflict=%s" % (table, conflict)
    key = cfg["supabase_key"]
    for i in range(0, len(rows), batch):
        chunk = rows[i:i + batch]
        headers = {"apikey": key, "Content-Type": "application/json",
                   "Prefer": "resolution=merge-duplicates,return=minimal"}
        if not key.startswith("sb_"):          # alte JWT-Schluessel brauchen zusaetzlich Authorization
            headers["Authorization"] = "Bearer " + key
        req = urllib.request.Request(url, data=json.dumps(chunk).encode("utf-8"), method="POST", headers=headers)
        try:
            urllib.request.urlopen(req, timeout=60).read()
        except urllib.error.HTTPError as e:
            raise RuntimeError("Supabase-Fehler %s: %s" % (e.code, e.read().decode("utf-8", "replace")[:500]))


# ---------- Jahresrueckblick (AnniversaryMemory_<Spieler-ID>_<Jahr> im save-Ordner) ----------
CIV_KEYS = {1: "ROMAN", 2: "GERMANY", 3: "BRITONS", 4: "FRANCE", 5: "SPANISH", 6: "CHINA", 7: "JAPANESE", 8: "KOREANS",
            9: "ARAB", 10: "OTTOMAN", 11: "BYZANTINES", 12: "VIKING", 13: "MAYA", 14: "EGYPT", 15: "GREECE"}
RES_TYPES = {1: "food", 2: "wood", 3: "stone", 4: "gold", 5: "gems"}


def read_memory(path):
    with open(path, "rb") as f:
        b = f.read()
    s = b.find(b"\x05\x04")
    while 0 <= s <= 64:
        try:
            v, _ = _rd(b, s)
            if isinstance(v, dict) and isinstance(v.get("Data"), dict):
                return v
        except Exception:
            pass
        s = b.find(b"\x05\x04", s + 1)
    return None


def memory_data(raw, year, game_dir, lang):
    """Rohdaten aus dem Spiel -> Format fuer memory.js (Namen fuer Kommandant und Kultur werden ergaenzt)."""
    d = raw or {}
    g = lambda k: d.get(k)
    names = {}
    for lg in ("de", "en"):
        h = load_lc(game_dir, "lc_hero.dat", lg)
        c = load_lc(game_dir, "lc_common.dat", lg)
        names[lg] = (h, c)
    def hero(i, lg):
        return (names[lg][0] or {}).get("NAME_%s" % i) if i is not None else None
    def civ(i, lg):
        k = CIV_KEYS.get(i)
        return (names[lg][1] or {}).get(k) if k else None
    hid, cid = g("pvp_most_hero"), g("civ_start")
    lang = lang if lang in ("de", "en") else "de"
    out = {
        "pvp": {"battles": g("pvp_battle_cnt"), "wins": g("pvp_win_cnt"), "killDiff": g("kill_diff")},
        "cmd": {"id": str(hid) if hid is not None else None, "name": hero(hid, lang) or hero(hid, "en"), "name_en": hero(hid, "en")},
        "barb": {"kills": g("pve_bar_win_cnt"), "maxLevel": g("pve_bar_win_maxlvl"), "forts": g("pve_gd_win_cnt")},
        "ark": {"games": g("gvg_join_cnt"), "wins": g("gvg_win_cnt"), "best": g("gvg_personal_score_max"), "avg": g("gvg_personal_score_avg")},
        "raid": {"joined": g("raidboss_join_cnt"), "won": g("raidboss_win_cnt")},
        "scholar": {"joined": g("contest_join_cnt")},
        "res": {"gathered": g("gather_resnum_sum"), "trips": g("gather_time_cnt"), "topType": RES_TYPES.get(g("gather_max_type")),
                "topSum": g("gather_max_sum"), "gems": g("res_gem_in_sum"), "powerInvest": g("res_diy_powerup_out")},
        "troops": {"trained": g("training_all_sum"), "topType": g("training_most_type"), "topCount": g("training_most_num")},
        "online": {"hours": g("online_hour_cnt"), "days": g("login_dt_cnt"), "chat": g("im_msg_send"), "vip": g("vip_level"), "quests": g("questdaily_cnt_avg")},
        "give": {"sentTo": g("ressend_out_role"), "sentAmount": g("ressend_out_max"), "fromName": g("ressend_in_role"), "fromAmount": g("ressend_in_max")},
        "help": {"givenSec": g("speedup_byhelp_out_sum"), "gotSec": g("speedup_byhelp_in_sum")},
        "alliance": {"name": g("alliance_dt_max"), "days": g("alliance_dt_cnt")},
        "acc": {"created": g("reg_dt"), "bestDay": g("dt_powerup_max"), "bestGain": g("daily_powerup_max"),
                "kingdomStart": g("svr_start"), "migrations": g("svr_change_cnt"),
                "civId": cid, "civ": civ(cid, lang) or civ(cid, "en"), "civ_en": civ(cid, "en"), "civChanges": g("civ_change_cnt")},
        # Anteil der Statthalter, die besser sind (kleiner = besser) -> „Top x %“
        "top": {"killDiff": g("ratio_killdiff"), "gather": g("ratio_gathercnt"), "gems": g("ratio_resgemin"), "chat": g("ratio_imsend"), "quests": g("ratio_questdailyavg")},
        "src": "uploader",
        "raw": d,
    }
    return out


def _sb_get(cfg, path):
    base = cfg["supabase_url"].strip().rstrip("/")
    if base.endswith("/rest/v1"):
        base = base[:-len("/rest/v1")]
    key = cfg["supabase_key"]
    headers = {"apikey": key}
    if not key.startswith("sb_"):
        headers["Authorization"] = "Bearer " + key
    req = urllib.request.Request(base + "/rest/v1/" + path, headers=headers)
    return json.loads(urllib.request.urlopen(req, timeout=60).read().decode("utf-8"))


def process_memory(cfg, state, gdir, label):
    """Sucht AnniversaryMemory-Dateien und laedt sie nach rok_memory (Website-Konto ueber die Governor-ID im Profil)."""
    seen = state.setdefault("_memory", {})
    n = 0
    for p in glob.glob(os.path.join(gdir, "save", "AnniversaryMemory_*_*")):
        name = os.path.basename(p)
        parts = name.split("_")
        if len(parts) < 3 or not parts[1].isdigit() or not parts[2][:4].isdigit():
            continue
        gid, year = parts[1], int(parts[2][:4])
        try:
            st = os.stat(p)
        except OSError:
            continue
        sig = "%d_%d" % (st.st_size, int(st.st_mtime))
        if seen.get(name) == sig:
            continue
        m = read_memory(p)
        if not m:
            log("Jahresrueckblick %s nicht lesbar" % name); continue
        year = int(m.get("Year") or year)
        try:
            users = _sb_get(cfg, "leaderboard?select=user_id&governor_id=eq.%s" % gid)
        except Exception as e:
            log("Jahresrueckblick: Konto zu Governor-ID %s nicht abfragbar (%s)" % (gid, e)); continue
        if not users:
            log("Jahresrueckblick %s: kein Website-Konto mit Governor-ID %s im Profil – wird beim naechsten Lauf erneut versucht" % (year, gid)); continue
        data = memory_data(m.get("Data"), year, gdir, cfg.get("language", "de"))
        rows = [{"user_id": u["user_id"], "year": year, "governor_id": int(gid), "data": data,
                 "updated_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())} for u in users if u.get("user_id")]
        try:
            upload(cfg, rows, "rok_memory", "user_id,year", 10)
        except RuntimeError as e:
            if "governor_id" in str(e):                 # SQL-Spalte noch nicht da -> ohne hochladen
                for r in rows:
                    r.pop("governor_id", None)
                upload(cfg, rows, "rok_memory", "user_id,year", 10)
            else:
                raise
        seen[name] = sig; n += 1
        log("%s: Jahresrueckblick %d (Governor %s) hochgeladen" % (label, year, gid))
    return n


# ---------- MuMu Player (Farmen): Sammel-Mails per ADB holen ----------
MUMU_DIR = "/sdcard/Android/data/com.lilithgame.roc.gp/files/GLGData/com_lilithgame_roc_gp/doc/mailcache"
NOWIN = 0x08000000 if os.name == "nt" else 0          # kein schwarzes Fenster bei pythonw


def _adb(adb, *args, timeout=600):
    r = subprocess.run([adb] + list(args), capture_output=True, timeout=timeout, creationflags=NOWIN)
    return r.returncode, r.stdout.decode("utf-8", "replace")


def find_adb(cfg):
    a = (cfg.get("mumu") or {}).get("adb")
    if a and os.path.exists(a):
        return a
    for base in [r"C:\Program Files\Netease\MuMuPlayer", r"C:\Program Files\Netease\MuMuPlayer-12.0", r"D:\Program Files\Netease\MuMuPlayer"]:
        hits = glob.glob(os.path.join(base, "**", "adb.exe"), recursive=True)
        if hits:
            return sorted(hits)[0]
    return None


def mumu_sync(cfg):
    """Spiegelt den mailcache jeder laufenden MuMu-Instanz nach mumu/<port>/ (nur neue/geaenderte Dateien)."""
    mc = cfg.get("mumu") or {}
    if mc.get("enabled") is False:
        return []
    if os.name == "nt":   # v15: MuMu laeuft gar nicht -> sofort weiter (spart ~30 s adb-Suche pro Lauf)
        try:
            tl = subprocess.run(["tasklist", "/FO", "CSV", "/NH"], capture_output=True, timeout=15, creationflags=NOWIN).stdout.decode("utf-8", "ignore").lower()
            if "mumu" not in tl and "nemu" not in tl:
                return []
        except Exception:
            pass
    adb = find_adb(cfg)
    if not adb:
        log("MuMu: adb.exe nicht gefunden – Farmen werden uebersprungen"); return []
    ports = mc.get("ports") or [16384 + 32 * i for i in range(16)]
    out = []
    for port in ports:
        dev = "127.0.0.1:%d" % port
        try:
            _adb(adb, "connect", dev, timeout=15)
            rc, st = _adb(adb, "-s", dev, "get-state", timeout=15)
            if rc != 0 or "device" not in st:
                continue
            rc, txt = _adb(adb, "-s", dev, "shell", "find %s -name 'Persistent.Mail.*' -exec stat -c '%%n|%%s' {} +" % MUMU_DIR, timeout=300)
            if rc != 0:
                log("MuMu %d: Mailordner nicht lesbar" % port); continue
            local = os.path.join(HERE, "mumu", str(port), "mailcache")
            os.makedirs(local, exist_ok=True)
            need = []
            for line in txt.splitlines():
                if "|" not in line:
                    continue
                path, size = line.rsplit("|", 1)
                name = path.rsplit("/", 1)[-1]
                lp = os.path.join(local, name)
                if not os.path.exists(lp) or str(os.path.getsize(lp)) != size.strip():
                    need.append(path)
            if len(need) > 300:              # erster Lauf: ganzen Ordner auf einmal holen
                _adb(adb, "-s", dev, "pull", MUMU_DIR, os.path.dirname(local), timeout=3600)
            else:
                for i in range(0, len(need), 100):
                    _adb(adb, "-s", dev, "pull", *need[i:i + 100], local, timeout=600)
            log("MuMu %d: %d Mails, %d neu geholt" % (port, len(txt.splitlines()), len(need)))
            out.append((port, local))
        except Exception as e:
            log("MuMu %d: %s" % (port, e))
    return out


def process_mumu(cfg, state, port, mdir, idx):
    """Farm-Instanz aus MuMu: nur Sammel-Mails (Rss) hochladen – Kaempfe der Farmen bleiben draussen.
    In einer Instanz koennen mehrere Accounts gewechselt werden: jede Mail wird ihrem Account (Spieler-ID) zugeordnet."""
    key = "mumu_%d" % port
    seen = state.setdefault(key, {})
    names = state.setdefault("_mumu_names", {})               # Spieler-ID -> Spielername
    fixed = {str(k): v for k, v in ((cfg.get("mumu") or {}).get("names") or {}).items()}
    mails, done = [], []
    for p in glob.glob(os.path.join(mdir, "Persistent.Mail.*")):
        name = os.path.basename(p)
        try:
            st = os.stat(p)
        except OSError:
            continue
        sig = str(st.st_size)
        if seen.get(name) == sig:
            continue
        try:
            m = read_mail(p)
        except Exception:
            m = None
        done.append((name, sig))
        if not isinstance(m, dict):
            continue
        pid = str(mail_player_id(m))
        if m.get("type") == "Battle" and pid not in names:      # Spielername aus einem eigenen Kampfbericht
            me = ((m.get("body") or {}).get("content") or {}).get("SelfChar") or {}
            if str(me.get("PId")) == pid and me.get("PName"):
                names[pid] = me.get("PName")
        if m.get("type") == "Rss":
            mails.append((pid, m))
    rows = []
    for pid, m in mails:
        label = fixed.get(pid) or names.get(pid) or "Farm %s" % pid
        r = mail_row(m, label)
        if r:
            rows.append(r)
    if rows:
        upload(cfg, rows, "rok_mails", "account,mail_id", 100)
    for name, sig in done:
        seen[name] = sig
    accs = sorted({r["account"] for r in rows})
    log("MuMu %d: %d neue Mails, %d Sammel-Mails hochgeladen%s" % (port, len(done), len(rows), (" (" + ", ".join(accs) + ")") if accs else ""))
    return len(rows)


# ---------- Hauptablauf ----------
def _dur(sec):
    sec = int(max(0, sec)) // 60
    return ("%d h %02d min" % (sec // 60, sec % 60)) if sec >= 60 else ("%d min" % sec)


def discord_notify(cfg, state, rows, mails=None):
    """v19: Nachricht in einen Discord-Kanal (config "discord_webhook"): City-Rally auf dich und Kampfbeginn.
    v21: + Gebaeude-Mails der Allianz/Koalition (z. B. "Lvl 7 Pass Occupied") mit Position.
    v22: schoene Discord-Embeds (gruen = erobert, rot = gefallen, Haltedauer, Discord-Zeitstempel)."""
    url = (cfg.get("discord_webhook") or "").strip()
    if not url or not (rows or mails):
        return
    rows = rows or []
    import datetime as _dt
    ds = state.setdefault("_discord", {"sent": [], "last": {}})
    sent, last, held, now, emb = set(ds.get("sent") or []), ds.get("last") or {}, ds.get("held") or {}, time.time(), []
    iso = lambda t: _dt.datetime.fromtimestamp(t, _dt.timezone.utc).isoformat()
    foot = {"text": cfg.get("discord_footer") or "Wiz fan Club · RoK Uploader"}
    def ts(r):
        try:
            return _dt.datetime.fromisoformat(str(r.get("battle_start")).replace("Z", "+00:00")).timestamp()
        except Exception:
            return 0
    fresh = sorted([r for r in rows if r.get("is_pvp") and now - ts(r) < 30 * 60], key=ts)   # nur Kaempfe der letzten 30 min (kein Spam beim Neu-Einlesen)
    for r in fresh:
        pid, t = str(r.get("player_id")), ts(r)
        cx, cy, px, py = r.get("city_x"), r.get("city_y"), r.get("pos_x"), r.get("pos_y")
        key = "%s|%s" % (r.get("mail_id"), pid)
        who = r.get("self_name") or pid
        if cfg.get("discord_city", False) and None not in (cx, cy, px, py) and ((px - cx) ** 2 + (py - cy) ** 2) ** 0.5 <= 30 and key not in sent:   # v23: City-Rally aus (nur geschaetzt)
            sent.add(key)
            emb.append({"title": "\U0001F3EF City-Rally auf %s!" % who, "color": 0xDC2626, "timestamp": iso(t), "footer": foot,
                        "description": "Gegner: **[%s] %s**" % (r.get("enemy_alliance") or "?", r.get("enemy_name") or "?"),
                        "fields": [{"name": "\U0001F4CD Stadt", "value": "X %d · Y %d" % (int(cx / 6), int(cy / 6)), "inline": True},
                                   {"name": "\U0001F552 Zeit", "value": "<t:%d:t> (<t:%d:R>)" % (t, t), "inline": True}]})
        if t - float(last.get(pid, 0)) > 45 * 60:
            emb.append({"title": "⚔️ %s kämpft gerade" % who, "color": 0xF59E0B, "timestamp": iso(t), "footer": foot,
                        "fields": [{"name": "\U0001F4CD Position", "value": "X %d · Y %d" % (int((px or 0) / 6), int((py or 0) / 6)), "inline": True},
                                   {"name": "\U0001F552 Start", "value": "<t:%d:t> (<t:%d:R>)" % (t, t), "inline": True}]})
        last[pid] = max(float(last.get(pid, 0)), t)
    if cfg.get("discord_buildings", True):
        for mr in sorted(mails or [], key=lambda x: str(x.get("sent_at") or "")):
            b = mr.get("content") if isinstance(mr.get("content"), dict) else {}
            kv = b.get("kvs") if isinstance(b.get("kvs"), dict) else {}
            pos = kv.get("stronghold_pos") if isinstance(kv.get("stronghold_pos"), dict) else None
            if mr.get("mail_type") != "Alliance" or not pos:
                continue
            try:
                t = _dt.datetime.fromisoformat(str(mr.get("sent_at")).replace("Z", "+00:00")).timestamp()
            except Exception:
                continue
            title, sub = str(b.get("title") or "Gebäude"), str(b.get("subTitle") or "")
            flt = [x.strip().lower() for x in str(cfg.get("discord_buildings_filter", "7 Pass")).split(",") if x.strip()]
            if flt and not any(x in (title + " " + sub).lower() for x in flt):
                continue                          # v23: nur Pass 7 (config "discord_buildings_filter", z. B. "7 Pass, Altar")
            sid = str(kv.get("stronghold_id") or "%s_%s" % (pos.get("X"), pos.get("Y")))
            key = "b|%s|%s|%s|%d" % (b.get("type"), kv.get("stronghold_id"), title, int(t // 60))   # gleiche Mail auf mehreren Accounts nur einmal
            if key in sent:
                continue
            ours = "our coalition" in sub.lower() or "our alliance" in sub.lower()
            lost = title.lower().startswith("fall of")
            name = title[8:] if lost else (title[:-9] if title.endswith(" Occupied") else title)
            ally = kv.get("legion_abbr") or ""
            h0 = held.get(sid) or {}
            if now - t > float(cfg.get("discord_max_age_min") or 30) * 60:   # zu alt: nicht posten, aber Haltezeit merken
                sent.add(key); held[sid] = {"t": t, "ours": ours}
                continue
            sent.add(key)
            extra = []
            if lost and h0.get("ours") and t > h0.get("t", 0):
                extra.append({"name": "⏱️ Gehalten", "value": _dur(t - h0["t"]), "inline": True})
            if ours and h0 and not h0.get("ours") and t > h0.get("t", 0):
                extra.append({"name": "⏱️ Zurückerobert nach", "value": _dur(t - h0["t"]), "inline": True})
            held[sid] = {"t": t, "ours": ours}
            if ours:
                head, col, desc = "\U0001F3F0 %s erobert!" % name, 0x22C55E, "Unsere Koalition hat **%s** eingenommen%s" % (name, (" · **[%s]**" % ally) if ally else "")
            elif lost:
                head, col, desc = "\U0001F4A5 %s gefallen" % name, 0xEF4444, "Eingenommen von **[%s]**" % (ally or "?")
            else:
                head, col, desc = "\U0001F3F0 %s" % title, 0x3B82F6, sub
            emb.append({"title": head, "color": col, "description": desc, "timestamp": iso(t), "footer": foot,
                        "fields": [{"name": "\U0001F4CD Position", "value": "X %d · Y %d" % (int(float(pos.get("X") or 0) / 6), int(float(pos.get("Y") or 0) / 6)), "inline": True},
                                   {"name": "\U0001F552 Zeit", "value": "<t:%d:t> (<t:%d:R>)" % (t, t), "inline": True}] + extra})
    # v26: Buff abgelaufen (System-Mail "Buff Ended"): Army Expansion, Angriff, Verteidigung (Schild nur mit "discord_buff_shield": true)
    bemb = []
    kinds = [("army expansion", "\U0001FA96", "Army Expansion", 0xF97316), ("attack", "\u2694\ufe0f", "Angriffs-Buff", 0xEF4444), ("defen", "\U0001F6E1\ufe0f", "Verteidigungs-Buff", 0x3B82F6)]
    if cfg.get("discord_buff_shield"):
        kinds.insert(0, ("peace shield", "\U0001F54A\ufe0f", "Friedensschild", 0xA3A3A3))
    accs = {str(k): v for k, v in (cfg.get("accounts") or {}).items()}
    for mr in sorted(mails or [], key=lambda x: str(x.get("sent_at") or "")):
        b = mr.get("content") if isinstance(mr.get("content"), dict) else {}
        if mr.get("mail_type") != "System" or not (b.get("title") == "Buff Ended" or str(b.get("subType")) == "340"):
            continue
        sub = str(b.get("subTitle") or b.get("content") or "")
        k = next((x for x in kinds if x[0] in sub.lower()), None)
        if not k:
            continue
        try:
            t = _dt.datetime.fromisoformat(str(mr.get("sent_at")).replace("Z", "+00:00")).timestamp()
        except Exception:
            continue
        key = "buff|%s|%s|%d" % (mr.get("player_id"), k[2], int(t // 60))
        if key in sent or now - t > float(cfg.get("discord_max_age_min") or 30) * 60:
            sent.add(key); continue
        sent.add(key)
        who = accs.get(str(mr.get("player_id"))) or mr.get("account") or str(mr.get("player_id"))
        bemb.append({"title": "%s %s: %s abgelaufen!" % (k[1], who, k[2]), "color": k[3], "description": sub, "timestamp": iso(t), "footer": foot,
                     "fields": [{"name": "\U0001F552 Zeit", "value": "<t:%d:t> (<t:%d:R>)" % (t, t), "inline": True}]})
    burl = (cfg.get("discord_webhook_buffs") or "").strip()
    if bemb and burl and burl != url:
        _webhook(burl, bemb[:20])
    else:
        emb.extend(bemb)
    ds["sent"], ds["last"], ds["held"] = list(sent)[-500:], last, dict(list(held.items())[-200:])
    for i in range(0, min(len(emb), 30), 10):   # max. 10 Embeds pro Nachricht
        try:
            req = urllib.request.Request(url, data=json.dumps({"embeds": emb[i:i + 10]}).encode("utf-8"), headers={"Content-Type": "application/json", "User-Agent": "RoK-Uploader"})
            urllib.request.urlopen(req, timeout=15).read()
        except Exception as e:
            log("Discord: %s" % e)


def _low_priority():
    """v15: Uploader laeuft mit niedriger Prioritaet, damit das Spiel immer Vorrang hat."""
    if os.name != "nt":
        return
    try:
        import ctypes
        k = ctypes.windll.kernel32
        k.SetPriorityClass(k.GetCurrentProcess(), 0x00000040)        # IDLE_PRIORITY_CLASS
        k.SetPriorityClass(k.GetCurrentProcess(), 0x00100000)        # PROCESS_MODE_BACKGROUND_BEGIN (auch Festplatte niedrig)
    except Exception:
        pass


# ---------- v24: Meilensteine -> eigener Discord-Kanal (config "discord_webhook_milestones") ----------
MS_KP = [1e8, 3e8, 5e8, 7e8, 1e9, 1.5e9, 2e9, 2.5e9, 3e9, 4e9, 5e9, 7.5e9, 1e10]
MS_FIGHTS = [1e3, 1e4, 5e4, 1e5, 2.5e5, 5e5]


def _short(v):
    v = float(v)
    for d, u in ((1e9, " Mrd"), (1e6, " M"), (1e3, " K")):
        if v >= d:
            x = v / d
            return (("%d" % x) if abs(x - round(x)) < 1e-9 else ("%.1f" % x).replace(".", ",")) + u
    return "%d" % v


def _ms_level(v, steps):
    return sum(1 for x in steps if v >= x)


def _webhook(url, emb):
    for i in range(0, len(emb), 10):
        try:
            req = urllib.request.Request(url, data=json.dumps({"embeds": emb[i:i + 10]}).encode("utf-8"), headers={"Content-Type": "application/json", "User-Agent": "RoK-Uploader"})
            urllib.request.urlopen(req, timeout=15).read()
        except Exception as e:
            log("Discord: %s" % e)


def milestones_notify(cfg, state):
    """Zaehlt pro Account KP, Verdienst und PvP-Kaempfe im aktuellen KvK (Start aus der Heatmap) und postet neue Meilensteine."""
    url = (cfg.get("discord_webhook_milestones") or "").strip()
    if not url:
        return
    ms = state.setdefault("_milestones", {})
    if time.time() - float(ms.get("_t", 0)) < 9 * 60:           # alle ~10 min reicht
        return
    ms["_t"] = time.time()
    base = cfg["supabase_url"].strip().rstrip("/")
    if base.endswith("/rest/v1"):
        base = base[:-len("/rest/v1")]
    key = cfg["supabase_key"]
    headers = {"apikey": key, "Content-Type": "application/json"}
    if not key.startswith("sb_"):
        headers["Authorization"] = "Bearer " + key
    try:
        req = urllib.request.Request(base + "/rest/v1/rpc/rok_milestone_totals", data=b"{}", method="POST", headers=headers)
        data = json.loads(urllib.request.urlopen(req, timeout=60).read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        log("Meilensteine: Supabase %s %s (SQL v24 ausgefuehrt?)" % (e.code, e.read().decode("utf-8", "replace")[:200])); return
    accs = {str(k): v for k, v in (cfg.get("accounts") or {}).items()}
    foot = {"text": cfg.get("discord_footer") or "Wiz fan Club \u00b7 RoK Uploader"}
    emb = []
    for d in data or []:
        pid = str(d.get("player_id"))
        if accs and pid not in accs:
            continue                                                # nur deine Accounts aus der config
        k = "%s|%s|%s" % (pid, d.get("kvk"), d.get("kvk_start"))
        kp, ac, nf = float(d.get("kp") or 0), float(d.get("acclaim") or 0), float(d.get("fights") or 0)
        lv = {"kp": _ms_level(kp, MS_KP), "ac": int(ac // 5e5), "f": _ms_level(nf, MS_FIGHTS)}
        old = ms.get(k)
        ms[k] = lv
        if old is None and not cfg.get("discord_milestones_initial"):
            continue                                                # erster Lauf: nur merken, nichts nachposten
        old = old or {"kp": 0, "ac": 0, "f": 0}
        who = d.get("name") or accs.get(pid) or pid
        sub = "KvK %s \u00b7 seit %s" % (d.get("kvk") or "", str(d.get("kvk_start") or "")[:10])
        def card(icon, txt, col, val, nxt, unit):
            f = [{"name": "\U0001F4CA Stand", "value": "%s %s" % (_short(val), unit), "inline": True}]
            if nxt:
                f.append({"name": "\U0001F3AF N\u00e4chstes Ziel", "value": "%s (noch %s)" % (_short(nxt), _short(nxt - val)), "inline": True})
            emb.append({"title": "%s %s: %s!" % (icon, who, txt), "color": col, "description": sub, "fields": f, "footer": foot})
        if lv["kp"] > old.get("kp", 0):
            x = MS_KP[lv["kp"] - 1]; card("\U0001F3C6", "%s Kill Points" % _short(x), 0xF5C542, kp, next((y for y in MS_KP if y > kp), None), "KP")
        if lv["ac"] > old.get("ac", 0):
            card("\U0001F396\ufe0f", "%s Verdienst" % _short(lv["ac"] * 5e5), 0x7DD3FC, ac, (lv["ac"] + 1) * 5e5, "Verdienst")
        if lv["f"] > old.get("f", 0):
            x = MS_FIGHTS[lv["f"] - 1]; card("\u2694\ufe0f", "%s K\u00e4mpfe" % _short(x), 0xF87171, nf, next((y for y in MS_FIGHTS if y > nf), None), "K\u00e4mpfe")
    if emb:
        _webhook(url, emb[:30])
        log("Meilensteine: %d gepostet" % len(emb))


# ---------- v24: Online-Zeit aus dem Spiel-Log (save/log.txt, log.1-3.txt) -> rok_play ----------
_LOG_TS = re.compile(r"^\[(\d{4}-\d\d-\d\d \d\d:\d\d:\d\d)")
_LOG_ROLE = re.compile(r'"2":"(\d+)","E":"role_login","t":"\d+","1":"(\d+)"')


def play_sessions(gdir, gap_min=10):
    files = [os.path.join(gdir, "save", n) for n in ("log.3.txt", "log.2.txt", "log.1.txt", "log.txt")]
    files = [f for f in files if os.path.exists(f)]
    out, cur, first = [], None, True
    for fp in files:
        with open(fp, encoding="utf-8", errors="replace") as fh:
            for line in fh:
                m = _LOG_TS.match(line)
                if not m:
                    continue
                try:
                    t = time.mktime(time.strptime(m.group(1), "%Y-%m-%d %H:%M:%S"))   # Log = Ortszeit des PCs
                except Exception:
                    continue
                rl = _LOG_ROLE.search(line) if "role_login" in line else None
                if cur and (t - cur["b"] > gap_min * 60 or (rl and rl.group(1) != cur["pid"] and rl.group(1) != "0")):
                    out.append(cur); cur = None
                if cur is None:
                    cur = {"a": t, "b": t, "pid": out[-1]["pid"] if out else None, "srv": out[-1]["srv"] if out else None, "n": 0, "cut": first}
                first = False
                cur["b"] = t
                if rl and rl.group(1) != "0":
                    cur["pid"], cur["srv"] = rl.group(1), int(rl.group(2))
                if '"E":"SendTroopConfirm"' in line:
                    cur["n"] += 1
    if cur:
        out.append(cur)
    iso = lambda t: time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(t))
    return [{"player_id": int(s["pid"]), "start_at": iso(s["a"]), "end_at": iso(s["b"]), "minutes": int(round((s["b"] - s["a"]) / 60)),
             "marches": s["n"], "server_id": s["srv"]} for s in out if s["pid"] and not s["cut"] and s["b"] - s["a"] >= 60]


def process_play(cfg, state, gdir, label):
    if not cfg.get("online_time", True):
        return
    ps = state.setdefault("_play", {})
    if time.time() - float(ps.get(label, 0)) < 9 * 60:
        return
    ps[label] = time.time()
    rows = play_sessions(gdir)
    for r in rows:
        r["source"] = label
    if rows:
        try:
            upload(cfg, rows, "rok_play", "player_id,start_at", 200)
        except RuntimeError as e:
            log("Online-Zeit: %s (SQL v24 ausgefuehrt?)" % str(e)[:200]); return
        log("%s: %d Spiel-Sitzungen (Online-Zeit) aktualisiert" % (label, len(rows)))


# ---------- v25: Mail-Archiv auf dem PC (Sicherung, weil das Spiel alte Mails loescht) ----------
def archive_mails(cfg, gdir, label):
    """Kopiert jede Mail aus dem Mailcache einmal in archiv/<Ordner>/<JJJJ-MM>.zip (Monat = Dateidatum).
    Die Dateien sind schon gepackt -> ZIP ohne erneutes Packen. Abschalten: config "archive": false."""
    if not cfg.get("archive", True):
        return 0
    mdir = os.path.join(gdir, "save", "mailcache")
    adir = cfg.get("archive_folder") or os.path.join(HERE, "archiv")
    adir = os.path.join(adir, re.sub(r'[\\/:*?"<>|]', "_", label))
    os.makedirs(adir, exist_ok=True)
    have = set()
    for zp in glob.glob(os.path.join(adir, "*.zip")):
        try:
            with zipfile.ZipFile(zp) as z:
                have.update(z.namelist())
        except zipfile.BadZipFile:
            os.replace(zp, zp + ".kaputt")                 # beschaedigte Datei beiseitelegen, Mails kommen neu
    todo = {}
    for p in glob.glob(os.path.join(mdir, "Persistent.Mail.*")):
        n = os.path.basename(p)
        if n in have:
            continue
        try:
            mt = os.path.getmtime(p)
        except OSError:
            continue
        todo.setdefault(time.strftime("%Y-%m", time.localtime(mt)), []).append((p, n, mt))
    added = 0
    for month, lst in sorted(todo.items()):
        zp = os.path.join(adir, month + ".zip")
        with zipfile.ZipFile(zp, "a", compression=zipfile.ZIP_STORED) as z:
            for p, n, mt in lst:
                try:
                    with open(p, "rb") as fh:
                        data = fh.read()
                except OSError:
                    continue                                 # gerade vom Spiel geloescht
                zi = zipfile.ZipInfo(n, date_time=time.localtime(mt)[:6])
                z.writestr(zi, data)
                added += 1
    if added:
        log("%s: %d Mails ins Archiv gelegt (%s)" % (label, added, adir))
    return added


def main():
    _low_priority()
    if not os.path.exists(CONFIG_FILE):
        log("config.json fehlt."); return 1
    with open(CONFIG_FILE, encoding="utf-8") as f:
        cfg = json.load(f)
    if "DEIN" in cfg.get("supabase_url", "") or "DEIN" in cfg.get("supabase_key", ""):
        log("Bitte zuerst supabase_url und supabase_key in config.json eintragen."); return 1
    state = {}
    if os.path.exists(STATE_FILE):
        try:
            with open(STATE_FILE, encoding="utf-8") as f:
                state = json.load(f)
        except Exception:
            state = {}
    if state.get("_version") != 5:          # v5: alles neu einlesen (Belohnungs-Mails mit Art)
        state = {"_version": 5}
    if state.get("_detail") != 3:           # v8/v9: Kampfberichte des PCs einmal neu einlesen (Details, Kampfort); MuMu bleibt
        for g in cfg.get("game_folders", []):
            state.pop(g.get("name", g["path"]), None)
        state["_detail"] = 3
    acc_sig = "all-v20"   # v20: alles neu einlesen (Formation -> Truppentyp)
    if state.get("_accs") != acc_sig:       # v12: neuer Account in der config -> Berichte nochmal durchsehen
        for g in cfg.get("game_folders", []):
            state.pop(g.get("name", g["path"]), None)
        state["_accs"] = acc_sig
    total_rows = total_new = total_mails = 0
    for g in cfg.get("game_folders", []):
        gdir, label = g["path"], g.get("name", g["path"])
        mdir = os.path.join(gdir, "save", "mailcache")
        if not os.path.isdir(mdir):
            log("Ordner nicht gefunden: %s" % mdir); continue
        heroes = load_hero_names(gdir, cfg.get("language", "en"))
        dnames = load_detail_names(gdir)
        seen = state.setdefault(label, {})
        rows, mails, loots, rallies, done = [], [], [], [], []
        skip_archive = cfg.get("skip_favorites", True)
        for p in glob.glob(os.path.join(mdir, "Persistent.Mail.*")):
            name = os.path.basename(p)
            try:
                st = os.stat(p)
            except OSError:
                continue
            sig = "%d_%d" % (st.st_size, int(st.st_mtime))
            if seen.get(name) == sig:
                continue
            try:
                m = read_mail(p)
                if skip_archive and isinstance(m, dict) and m.get("box") == "Archive":
                    done.append((name, sig)); continue          # Favoriten (alte gespeicherte Berichte) weglassen
                # v13: JEDE ID hochladen – Namen aus config "accounts", sonst die ID selbst. Auf der Website zeigt nur, was du dort verknuepfst.
                accs = {str(k): v for k, v in (cfg.get("accounts") or {}).items()}
                owner = mail_player_id(m) if isinstance(m, dict) else None
                if owner and str(owner) not in accs:
                    accs[str(owner)] = str(owner)
                loots.extend(loot_rows(m, accs))
                rallies.extend(rally_rows(m, {str(owner): accs[str(owner)]} if owner else accs, heroes))   # v18: nur fuer den Account, dem die Mail gehoert (sonst doppelt)
                acc = accs.get(str(owner)) if owner else label
                r = battle_rows(m, acc, heroes, dnames)
                r = [x for x in r if str(x.get("player_id")) in accs]
                for x in r:
                    x["account"] = accs[str(x["player_id"])]
                mr = mail_row(m, acc)
            except Exception as e:
                log("Konnte %s nicht lesen: %s" % (name, e)); r = []; mr = None
            rows.extend(r); done.append((name, sig))
            if mr:
                mails.append(mr)
        total_new += len(done)
        if rows:
            upload(cfg, rows)
            total_rows += len(rows)
        if mails:
            upload(cfg, mails, "rok_mails", "account,mail_id", 50)
            total_mails += len(mails)
        if loots:
            upload(cfg, loots, "rok_loot", "account,mail_id,idx", 500)
        if rallies:
            upload(cfg, rallies, "rok_rallies", "account,mail_id", 300)
        try:
            discord_notify(cfg, state, rows, mails)
        except Exception as e:
            log("Discord: Fehler %s" % e)
        for name, sig in done:        # erst nach erfolgreichem Upload merken
            seen[name] = sig
        log("%s: %d neue/geaenderte Mails, %d Kampfzeilen, %d Mails, %d Beute-Eintraege, %d Gruppenkaempfe hochgeladen" % (label, len(done), len(rows), len(mails), len(loots), len(rallies)))
        try:
            archive_mails(cfg, gdir, label)
        except Exception as e:
            log("Archiv: Fehler %s" % e)
        try:
            process_play(cfg, state, gdir, label)
        except Exception as e:
            log("Online-Zeit: Fehler %s" % e)
        try:
            process_memory(cfg, state, gdir, label)
        except Exception as e:
            log("Jahresrueckblick: Fehler %s" % e)
    try:
        milestones_notify(cfg, state)
    except Exception as e:
        log("Meilensteine: Fehler %s" % e)
    # Farmen aus MuMu Player (nur Ressourcen)
    for i, (port, mdir) in enumerate(mumu_sync(cfg), 1):
        try:
            total_mails += process_mumu(cfg, state, port, mdir, i)
        except Exception as e:
            log("MuMu %d: Fehler %s" % (port, e))
    with open(STATE_FILE, "w", encoding="utf-8") as f:
        json.dump(state, f)
    log("Fertig: %d Kampfzeilen und %d Mails insgesamt." % (total_rows, total_mails))
    return 0


LOCK_FILE = os.path.join(HERE, "uploader.lock")


if __name__ == "__main__":
    # Laeuft schon ein Durchgang (z. B. der erste lange MuMu-Abgleich)? Dann diesen Start auslassen.
    try:
        if os.path.exists(LOCK_FILE) and time.time() - os.path.getmtime(LOCK_FILE) < 2 * 3600:
            sys.exit(0)
        with open(LOCK_FILE, "w") as f:
            f.write(str(os.getpid()))
    except Exception:
        pass
    code = 1
    try:
        code = main()
    except Exception:
        log("FEHLER:\n" + traceback.format_exc())
    finally:
        try:
            os.remove(LOCK_FILE)
        except Exception:
            pass
    sys.exit(code)
