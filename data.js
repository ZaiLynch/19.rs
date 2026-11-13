/* Loads data/concerts.json + data/venues.json and builds lookup indexes.
   Shared by map.js (and later pages such as statistics). */
(function () {
  "use strict";

  function getJSON(url) {
    return fetch(url).then(function (r) {
      if (!r.ok) throw new Error(url + ": " + r.status);
      return r.json();
    });
  }

  function load(base) {
    base = base || "data/";
    // setlists.json is optional: without it the pages just show no setlists
    var setlists = getJSON(base + "setlists.json").catch(function () { return {}; });
    return Promise.all([getJSON(base + "concerts.json"), getJSON(base + "venues.json"), setlists]).then(function (res) {
      var concerts = res[0], venues = {}, sl = res[2];
      var byArtist = new Map(), byVenue = new Map();

      Object.keys(res[1]).forEach(function (id) {
        venues[id] = Object.assign({ id: id }, res[1][id]);
        byVenue.set(id, []);
      });

      concerts.sort(function (a, b) { return a.date < b.date ? 1 : a.date > b.date ? -1 : 0; });
      concerts.forEach(function (c) {
        c.venueData = venues[c.venue];
        if (!c.venueData) throw new Error("unknown venue id: " + c.venue);
        c.year = +c.date.slice(0, 4);
        c.setlists = {}; // artist -> setlist.fm entry ("found" with songs, or "empty" with url only)
        byVenue.get(c.venue).push(c);
        c.artists.forEach(function (a) {
          var e = sl[c.date + "|" + a];
          if (e && (e.status === "found" || e.status === "empty")) c.setlists[a] = Object.assign({ key: c.date + "|" + a }, e);
          if (!byArtist.has(a)) byArtist.set(a, []);
          byArtist.get(a).push(c);
        });
      });

      return { concerts: concerts, venues: venues, byArtist: byArtist, byVenue: byVenue, setlists: sl };
    });
  }

  window.ConcertData = { load: load };
})();
