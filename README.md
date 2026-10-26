When interpreted as HTML, the index.html redirects the user [to my main page](https://z.ai).

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
