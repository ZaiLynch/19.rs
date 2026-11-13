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


SETLISTS = ROOT / "data" / "setlists.json"


def save_setlists(setlists):
    """Atomic write (temp file + rename) so an aborted run never leaves a broken file."""
    lines = ",\n".join(f"  {_dump(k)}: {_dump(v)}" for k, v in sorted(setlists.items(), reverse=True))
    tmp = SETLISTS.with_suffix(".json.tmp")
    tmp.write_text("{\n" + lines + "\n}\n" if lines else "{}\n", encoding="utf-8")
    tmp.replace(SETLISTS)
