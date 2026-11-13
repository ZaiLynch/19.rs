When interpreted as JavaScript, it triggers the `alert(1)`, `alert(document.domain)` and `prompt(1)` calls, useful in xss games.

This page is hosted on `19.rs`. Some Browsers allow this to be written as `⑲.₨` or even `⒚₨`.

## Concert map

`map.html` shows every concert venue on an OpenStreetMap map (Leaflet + Leaflet.markercluster, vendored in `vendor/`).

The data lives in two hand-editable JSON files, one record per line:

- `data/venues.json`: venues by id, e.g.
  `"substage-karlsruhe": {"name": "Substage", "city": "Karlsruhe", "country": "DE", "lat": 49.01, "lon": 8.39}`.
  `"approx": true` marks coordinates that are only a guess (shown with a dashed pin).
- `data/concerts.json`: one entry per show, newest first, e.g.
  `{"date": "2022-06-10", "artists": ["Muse", "IDLES"], "venue": "tempelhofer-feld-berlin", "event": "Tempelhof Sounds"}`.
  Optional: `event`, `note`.

`concerts.txt` is generated from the JSON; don't edit it by hand:

```sh
python3 scripts/geocode.py      # fills lat/lon for new venues (Nominatim)
python3 scripts/build_txt.py    # regenerates concerts.txt
```

`stats.html` (`stats.js`, `stats.css`) shows charts and statistics computed from the same data: concerts per year, top artists/venues/cities, countries, month and weekday distribution, new artists per year and a few fun facts. No chart library; everything is plain HTML/CSS.

`data.js` loads and indexes the data and can be reused by other pages. To view locally, serve the folder (e.g. `python3 -m http.server`) and open http://localhost:8000/map.html.

## Setlists

`data/setlists.json` holds setlists from [setlist.fm](https://www.setlist.fm), keyed by `"YYYY-MM-DD|Artist"`. On `map.html`, concerts with a setlist get a `♫ 18` badge, both in the artist view and in venue popups. Clicking the badge opens the songs in a card next to the panel, and the URL hash (`setlist=…`) links straight to it. The pages also work without this file.

The file doubles as the lookup log. Each entry has a `status`:
`found` (songs stored), `empty` (setlist.fm page without songs; linked only), `ambiguous` (candidates listed for manual review), `none`, `error` (retried next run).

```sh
export SETLISTFM_API_KEY=…            # free key: https://www.setlist.fm/settings/api
python3 scripts/setlistfm.py          # 1 request / 3 s, max 300 per run, resumable
python3 scripts/setlistfm.py --recheck none     # retry shows that had no setlist yet
```

The script saves after every request and skips keys that are already logged, so it can be interrupted at any time. To fix a match by hand, set `"status": "found", "id": "<setlist id>"` on the entry and run `--refetch "<key>"`.
