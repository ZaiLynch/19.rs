#!/usr/bin/env python3
"""Fill missing lat/lon in data/venues.json via OSM Nominatim (1 request/s).

A venue hit further than 25 km from the city centre is rejected. Venues that
can't be found get the city centre and "approx": true, to be fixed by hand.

Usage: geocode.py [cache.json]
"""
import json
import math
import sys
import time
import urllib.parse
import urllib.request

from datafile import VENUES, load, save_venues

UA = "19.rs-concert-map/1.0 (https://19.rs)"
cache_path = sys.argv[1] if len(sys.argv) > 1 else None
try:
    cache = json.load(open(cache_path)) if cache_path else {}
except FileNotFoundError:
    cache = {}


def search(q, cc):
    key = f"{q}|{cc}"
    if key not in cache:
        url = "https://nominatim.openstreetmap.org/search?" + urllib.parse.urlencode(
            {"q": q, "countrycodes": cc.lower(), "format": "jsonv2", "limit": 1})
        with urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": UA})) as r:
            res = json.load(r)
        cache[key] = [float(res[0]["lat"]), float(res[0]["lon"])] if res else None
        time.sleep(1.1)
        if cache_path:
            json.dump(cache, open(cache_path, "w"), ensure_ascii=False)
    return cache[key]


def km(a, b):
    dlat, dlon = math.radians(b[0] - a[0]), math.radians(b[1] - a[1])
    h = math.sin(dlat / 2) ** 2 + math.cos(math.radians(a[0])) * math.cos(math.radians(b[0])) * math.sin(dlon / 2) ** 2
    return 12742 * math.asin(math.sqrt(h))


venues = load(VENUES)
for vid, v in venues.items():
    if "lat" in v:
        continue
    centre = search(v["city"], v["country"])
    hit = search(f'{v["name"]}, {v["city"]}', v["country"]) if v["name"] else None
    if hit and centre and km(hit, centre) <= 25:
        v["lat"], v["lon"] = round(hit[0], 5), round(hit[1], 5)
        v.pop("approx", None)
    elif centre:
        v["lat"], v["lon"], v["approx"] = round(centre[0], 5), round(centre[1], 5), True
        print("APPROX", vid, "(hit too far)" if hit else "")
    else:
        print("MISSING", vid)
    save_venues(venues)
