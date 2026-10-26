#!/usr/bin/env python3
"""Regenerate concerts.txt from data/concerts.json + data/venues.json.

Line format: YYYY-MM-DD Artist (Event) (Note), Venue, City
Several artists are written as "(A, B, C)".
"""
from datafile import CONCERTS, ROOT, VENUES, load

concerts, venues = load(CONCERTS), load(VENUES)
lines = []
for c in sorted(concerts, key=lambda c: c["date"], reverse=True):
    v = venues[c["venue"]]
    who = c["artists"][0] if len(c["artists"]) == 1 else "(" + ", ".join(c["artists"]) + ")"
    for extra in (c.get("event"), c.get("note")):
        if extra:
            who += f" ({extra})"
    fields = [who, v["name"], v["city"]] if v["name"] else [who, v["city"]]
    lines.append(f'{c["date"]} {", ".join(fields)}')

(ROOT / "concerts.txt").write_text("\n".join(lines) + "\n", encoding="utf-8")
print(f"wrote {len(lines)} concerts")
