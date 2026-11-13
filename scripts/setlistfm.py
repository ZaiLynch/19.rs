#!/usr/bin/env python3
"""Look up setlists on setlist.fm for every artist/date in data/concerts.json.

Slow and resumable: one request every --delay seconds (default 3), at most --max
requests per run (default 300), and data/setlists.json is saved after every
request. Keys already in that file are skipped, so an aborted run just continues.

Needs a free API key (https://www.setlist.fm/settings/api) in SETLISTFM_API_KEY.

Status per "YYYY-MM-DD|Artist" key:
  found      exactly one matching setlist with songs (stored)
  empty      matching setlist page exists but has no songs (url only)
  ambiguous  several candidates, or the artist name differs; check by hand
  none       nothing on setlist.fm for that artist/date near that venue
  error      request failed; retried on the next run

Usage:
  setlistfm.py [--delay S] [--max N] [--recheck none|empty|ambiguous] [--refetch KEY ...]

To fix a match by hand, set "status": "found" and "id": "<setlist id>" on the
entry and run with --refetch "<key>".
"""
import argparse
import datetime
import difflib
import json
import math
import os
import re
import sys
import time
import unicodedata
import urllib.error
import urllib.parse
import urllib.request

from datafile import CONCERTS, SETLISTS, VENUES, load, save_setlists

API = "https://api.setlist.fm/rest/1.0"
UA = "19.rs-concert-map/1.0 (https://19.rs)"
MAX_KM = 30
DONE = {"found", "empty", "ambiguous", "none"}

ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
ap.add_argument("--delay", type=float, default=3.0, help="seconds between requests (default 3)")
ap.add_argument("--max", type=int, default=300, help="max requests this run (default 300)")
ap.add_argument("--recheck", action="append", default=[], choices=["none", "empty", "ambiguous"],
                help="look these statuses up again")
ap.add_argument("--refetch", action="append", default=[], metavar="KEY",
                help="re-download the setlist with the id stored on KEY")
args = ap.parse_args()

key = os.environ.get("SETLISTFM_API_KEY")
if not key:
    sys.exit("SETLISTFM_API_KEY is not set (get one at https://www.setlist.fm/settings/api)")


class Abort(Exception):
    pass


requests_made = 0
last_request = 0.0


def get(path, params=None):
    """GET with pacing and backoff. Returns parsed JSON, or None on 404."""
    global requests_made, last_request
    url = API + path + ("?" + urllib.parse.urlencode(params) if params else "")
    req = urllib.request.Request(url, headers={"x-api-key": key, "Accept": "application/json", "User-Agent": UA})
    for backoff in (30, 60, 120, None):
        wait = last_request + args.delay - time.monotonic()
        if wait > 0:
            time.sleep(wait)
        last_request = time.monotonic()
        requests_made += 1
        try:
            with urllib.request.urlopen(req, timeout=30) as r:
                return json.load(r)
        except urllib.error.HTTPError as e:
            if e.code == 404:
                return None
            if e.code in (401, 403):
                raise Abort(f"HTTP {e.code}: API key rejected")
            if e.code not in (429, 500, 502, 503, 504) or backoff is None:
                raise
            ra = e.headers.get("Retry-After")
            pause = int(ra) if ra and ra.isdigit() else backoff
            print(f"  HTTP {e.code}, waiting {pause}s", flush=True)
            time.sleep(pause)
        except (urllib.error.URLError, TimeoutError) as e:
            if backoff is None:
                raise
            print(f"  {e}, waiting {backoff}s", flush=True)
            time.sleep(backoff)


def norm(s):
    s = s.casefold().replace("ß", "ss").replace("&", " and ").replace("+", " and ")
    s = "".join(ch for ch in unicodedata.normalize("NFKD", s) if not unicodedata.combining(ch))
    s = re.sub(r"[^a-z0-9 ]", " ", s)
    s = re.sub(r"^the ", "", " ".join(s.split()))
    return s


def same_artist(a, b):
    a, b = norm(a), norm(b)
    return a == b or a.startswith(b + " ") or b.startswith(a + " ") or difflib.SequenceMatcher(None, a, b).ratio() >= 0.85


def km(a, b):
    dlat, dlon = math.radians(b[0] - a[0]), math.radians(b[1] - a[1])
    h = math.sin(dlat / 2) ** 2 + math.cos(math.radians(a[0])) * math.cos(math.radians(b[0])) * math.sin(dlon / 2) ** 2
    return 12742 * math.asin(math.sqrt(h))


def same_place(sl, venue):
    city = (sl.get("venue") or {}).get("city") or {}
    coords = city.get("coords") or {}
    if "lat" in venue and coords.get("lat") is not None:
        if km((venue["lat"], venue["lon"]), (coords["lat"], coords["long"])) <= MAX_KM:
            return True
    a, b = norm(city.get("name", "")), norm(venue["city"])
    return bool(a and b) and (a.startswith(b) or b.startswith(a))


def sets_of(sl):
    out = []
    for s in (sl.get("sets") or {}).get("set") or []:
        songs = [x["name"] for x in s.get("song") or [] if x.get("name") and not x.get("tape")]
        if songs:
            out.append({"name": s.get("name", ""), "encore": s.get("encore", 0), "songs": songs})
    return out


def entry_for(sl, status=None):
    sets = sets_of(sl)
    e = {"status": status or ("found" if sets else "empty"), "checked": today, "id": sl["id"], "url": sl["url"],
         "artist": sl["artist"]["name"], "venue": f'{sl["venue"]["name"]}, {sl["venue"]["city"]["name"]}'}
    if sets and e["status"] == "found":
        e["sets"] = sets
    return e


def lookup(date, artist, venue):
    y, m, d = date.split("-")
    res = get("/search/setlists", {"artistName": artist, "date": f"{d}-{m}-{y}"})
    hits = [sl for sl in (res or {}).get("setlist", []) if same_place(sl, venue)]
    if not hits:
        return {"status": "none", "checked": today}
    named = [sl for sl in hits if same_artist(sl["artist"]["name"], artist)]
    if len(named) == 1:
        return entry_for(named[0])
    return {"status": "ambiguous", "checked": today,
            "candidates": [{"id": sl["id"], "url": sl["url"], "artist": sl["artist"]["name"],
                            "venue": sl["venue"]["name"], "songs": sum(len(s["songs"]) for s in sets_of(sl))}
                           for sl in (named or hits)]}


today = datetime.date.today().isoformat()
concerts = load(CONCERTS)
venues = load(VENUES)
log = load(SETLISTS) if SETLISTS.exists() else {}

todo = []
for c in concerts:  # newest first
    if c["date"] > today:
        continue
    for a in c["artists"]:
        k = f'{c["date"]}|{a}'
        st = log.get(k, {}).get("status")
        if st in DONE and st not in args.recheck:
            continue
        if k not in (t[0] for t in todo):
            todo.append((k, c["date"], a, venues[c["venue"]]))

try:
    for k in args.refetch:
        e = log.get(k)
        if not e or not e.get("id"):
            print("no id stored for", k)
            continue
        sl = get(f'/setlist/{e["id"]}')
        log[k] = entry_for(sl, "found" if sets_of(sl) else "empty") if sl else {"status": "error", "checked": today}
        save_setlists(log)
        print(f'refetch {k}: {log[k]["status"]}')

    fails = 0
    for k, date, artist, venue in todo:
        if requests_made >= args.max:
            print(f"--max {args.max} reached")
            break
        try:
            log[k] = lookup(date, artist, venue)
            fails = 0
        except Abort:
            raise
        except Exception as e:
            log[k] = {"status": "error", "checked": today, "error": str(e)[:200]}
            fails += 1
        save_setlists(log)
        e = log[k]
        extra = e.get("url") or " ".join(x["url"] for x in e.get("candidates", [])) or e.get("error", "")
        print(f'{k}: {e["status"]} {extra}', flush=True)
        if fails >= 3:
            print("3 failures in a row, stopping")
            break
except Abort as e:
    print(e)
except KeyboardInterrupt:
    print("\ninterrupted; progress is saved")

counts = {}
for e in log.values():
    counts[e["status"]] = counts.get(e["status"], 0) + 1
remaining = sum(1 for k, *_ in todo if log.get(k, {}).get("status") not in DONE)
print(" · ".join(f"{s} {n}" for s, n in sorted(counts.items())), f"· remaining {remaining} · requests {requests_made}")
