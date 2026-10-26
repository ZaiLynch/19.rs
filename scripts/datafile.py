"""Load/save data/*.json with one record per line, so the files stay easy to edit and diff."""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CONCERTS = ROOT / "data" / "concerts.json"
VENUES = ROOT / "data" / "venues.json"


def load(path):
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def _dump(obj):
    return json.dumps(obj, ensure_ascii=False)


def save_concerts(concerts):
    lines = ",\n".join("  " + _dump(c) for c in concerts)
    CONCERTS.write_text("[\n" + lines + "\n]\n", encoding="utf-8")


def save_venues(venues):
    lines = ",\n".join(f"  {_dump(k)}: {_dump(v)}" for k, v in sorted(venues.items()))
    VENUES.write_text("{\n" + lines + "\n}\n", encoding="utf-8")
