(function () {
  "use strict";

  var TILES = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
  var ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

  var $ = function (id) { return document.getElementById(id); };
  var panel = $("panel"), search = $("search");
  var mobile = window.matchMedia("(max-width: 720px)");

  var data, markers = {}, cluster, state = {}, tab = "artists";
  var navigating = false; // set while popups open/close programmatically

  // ---------- helpers ----------

  function el(tag, attrs, children) {
    var e = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) {
      if (k === "text") e.textContent = attrs[k];
      else if (k === "class") e.className = attrs[k];
      else if (k.slice(0, 2) === "on") e.addEventListener(k.slice(2), attrs[k]);
      else e.setAttribute(k, attrs[k]);
    });
    (children || []).forEach(function (c) { if (c) e.append(c); });
    return e;
  }

  function fmtDate(d) { return d.split("-").reverse().join("."); }

  function plural(n, word) { return n + " " + word + (n === 1 ? "" : "s"); }

  function norm(s) {
    return s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
      .replace(/ß/g, "ss").replace(/ae/g, "a").replace(/oe/g, "o").replace(/ue/g, "u");
  }

  // Keep fitted content clear of the panel (left on desktop, bottom sheet on mobile)
  function padding() {
    var r = panel.getBoundingClientRect();
    return mobile.matches
      ? { paddingTopLeft: [24, 24], paddingBottomRight: [24, window.innerHeight - r.top + 24] }
      : { paddingTopLeft: [r.right + 24, 24], paddingBottomRight: [24, 24] };
  }

  // ---------- map ----------

  var map = L.map("map", { zoomControl: false, worldCopyJump: true }).setView([50.5, 9], 6);
  L.control.zoom({ position: "topright" }).addTo(map);
  L.tileLayer(TILES, { attribution: ATTRIBUTION, maxZoom: 19 }).addTo(map);

  cluster = L.markerClusterGroup({
    showCoverageOnHover: false,
    maxClusterRadius: 50,
    spiderfyDistanceMultiplier: 1.6,
    iconCreateFunction: function (cl) {
      var n = cl.getAllChildMarkers().reduce(function (s, m) { return s + m.options.count; }, 0);
      var size = n < 10 ? 34 : n < 50 ? 42 : n < 150 ? 50 : 58;
      return L.divIcon({ html: "<span>" + n + "</span>", className: "cluster", iconSize: [size, size] });
    }
  });
  map.addLayer(cluster);

  function popupContent(venue) {
    var list = data.byVenue.get(venue.id);
    return el("div", { class: "popup" }, [
      el("h3", { text: venue.name || "Unknown venue" }),
      el("p", { class: "sub", text: venue.city + " · " + plural(list.length, "concert") }),
      el("ol", {}, list.map(function (c) {
        var hit = state.artist && c.artists.indexOf(state.artist) !== -1;
        var names = el("div", {}, []);
        c.artists.forEach(function (a, i) {
          if (i) names.append(", ");
          names.append(el("button", { class: "artist", type: "button", text: a,
            onclick: function () { go({ artist: a }); } }));
        });
        var extra = [c.event, c.note].filter(Boolean).join(" · ");
        if (extra) names.append(el("small", { text: extra }));
        return el("li", { class: hit ? "hit" : "" }, [el("time", { datetime: c.date, text: fmtDate(c.date) }), names]);
      })),
      venue.approx ? el("p", { class: "approx-note", text: "Location is approximate." }) : null
    ]);
  }

  function buildMarkers() {
    Object.keys(data.venues).forEach(function (id) {
      var v = data.venues[id];
      if (v.lat == null || v.lon == null) return console.warn("venue without coordinates:", id);
      var m = L.marker([v.lat, v.lon], {
        count: data.byVenue.get(id).length,
        title: (v.name || "Unknown venue") + ", " + v.city,
        icon: L.divIcon({ className: "pin" + (v.approx ? " approx" : ""), iconSize: [16, 16] })
      });
      m.bindPopup(function () { return popupContent(v); }, { maxWidth: 320, autoPanPaddingTopLeft: padding().paddingTopLeft, autoPanPaddingBottomRight: padding().paddingBottomRight });
      markers[id] = m;
    });
  }

  function showMarkers(ids) {
    cluster.clearLayers();
    cluster.addLayers(ids.map(function (id) { return markers[id]; }).filter(Boolean));
  }

  function fitTo(ids) {
    var pts = ids.map(function (id) { return markers[id]; }).filter(Boolean).map(function (m) { return m.getLatLng(); });
    if (!pts.length) return;
    var opts = Object.assign({ maxZoom: 13 }, padding());
    map.flyToBounds(L.latLngBounds(pts), Object.assign(opts, { duration: 0.8 }));
  }

  // Map centre that puts latlng in the middle of the area not covered by the panel
  function centreFor(latlng, zoom) {
    var p = padding();
    var offset = L.point(p.paddingTopLeft).subtract(L.point(p.paddingBottomRight)).divideBy(2);
    return map.unproject(map.project(latlng, zoom).subtract(offset), zoom);
  }

  function openVenue(id) {
    var m = markers[id];
    if (!m) return;
    var zoom = Math.max(map.getZoom(), 15);
    var open = function () {
      cluster.zoomToShowLayer(m, function () {
        navigating = true;
        m.openPopup();
        navigating = false;
      });
    };
    map.once("moveend", open);
    map.flyTo(centreFor(m.getLatLng(), zoom), zoom, { duration: 0.8 });
  }

  // ---------- panel ----------

  function artistItem(name) {
    var n = data.byArtist.get(name).length;
    return el("li", {}, [el("button", { class: "item", type: "button", onclick: function () { go({ artist: name }); } }, [
      el("span", { text: name }), el("span", { class: "count", text: n })
    ])]);
  }

  function venueItem(v) {
    return el("button", { class: "item", type: "button", onclick: function () { go({ venue: v.id }); } }, [
      el("span", { text: v.name || "Unknown venue" }), el("span", { class: "count", text: data.byVenue.get(v.id).length })
    ]);
  }

  function renderLists() {
    var q = norm(search.value.trim());
    var artists = Array.from(data.byArtist.keys())
      .filter(function (a) { return !q || norm(a).indexOf(q) !== -1; })
      .sort(function (a, b) { return a.localeCompare(b, "de", { sensitivity: "base" }); });
    var venues = Object.values(data.venues)
      .filter(function (v) { return !q || norm((v.name || "") + " " + v.city).indexOf(q) !== -1; })
      .sort(function (a, b) {
        return a.city.localeCompare(b.city, "de") || (a.name || "").localeCompare(b.name || "", "de");
      });

    $("count-artists").textContent = artists.length;
    $("count-venues").textContent = venues.length;
    $("list-artists").replaceChildren.apply($("list-artists"), artists.map(artistItem));

    var groups = [], city = null;
    venues.forEach(function (v) {
      if (v.city !== city) { city = v.city; groups.push(el("h3", { class: "city", text: city })); }
      groups.push(venueItem(v));
    });
    $("list-venues").replaceChildren.apply($("list-venues"), groups);

    var shown = tab === "artists" ? artists.length : venues.length;
    $("empty").hidden = !!state.artist || shown > 0;
  }

  function setTab(name) {
    tab = name;
    document.querySelectorAll(".tab").forEach(function (t) {
      t.setAttribute("aria-selected", t.dataset.tab === name ? "true" : "false");
    });
    renderPanel();
  }

  function renderPanel() {
    var detail = !!state.artist;
    $("detail").hidden = !detail;
    document.querySelector(".tabs").hidden = detail;
    $("list-artists").hidden = detail || tab !== "artists";
    $("list-venues").hidden = detail || tab !== "venues";
    if (detail) renderArtist(state.artist);
    renderLists();
  }

  function renderArtist(name) {
    var list = data.byArtist.get(name);
    var venues = new Set(list.map(function (c) { return c.venue; }));
    var years = list.map(function (c) { return c.year; });
    var lo = Math.min.apply(null, years), hi = Math.max.apply(null, years);
    $("detail-title").textContent = name;
    $("detail-sub").textContent = plural(list.length, "concert") + " · " + plural(venues.size, "venue") +
      " · " + (lo === hi ? lo : lo + "–" + hi);
    $("detail-list").replaceChildren.apply($("detail-list"), list.map(function (c) {
      var v = c.venueData;
      var others = c.artists.filter(function (a) { return a !== name; });
      var sub = [v.city, c.event, c.note, others.length ? "with " + others.join(", ") : ""].filter(Boolean).join(" · ");
      return el("li", {}, [el("button", { class: "item", type: "button",
        onclick: function () { go({ artist: name, venue: c.venue }); } }, [
        el("time", { datetime: c.date, text: fmtDate(c.date) }),
        el("span", {}, [document.createTextNode(v.name || "Unknown venue"), el("small", { text: sub })])
      ])]);
    }));
  }

  function setSheet(open) {
    panel.classList.toggle("open", open);
    $("sheet-toggle").setAttribute("aria-expanded", open ? "true" : "false");
  }

  // ---------- state / URL hash ----------

  function readHash() {
    var p = new URLSearchParams(location.hash.slice(1));
    var s = {};
    if (p.get("artist") && data.byArtist.has(p.get("artist"))) s.artist = p.get("artist");
    if (p.get("venue") && data.venues[p.get("venue")]) s.venue = p.get("venue");
    return s;
  }

  function writeHash(s) {
    var p = new URLSearchParams();
    if (s.artist) p.set("artist", s.artist);
    if (s.venue) p.set("venue", s.venue);
    var h = p.toString();
    history.pushState(null, "", h ? "#" + h : location.pathname + location.search);
  }

  function apply(s, initial) {
    navigating = true;
    var artistChanged = s.artist !== state.artist;
    state = s;
    if (artistChanged || initial) {
      var ids = s.artist
        ? Array.from(new Set(data.byArtist.get(s.artist).map(function (c) { return c.venue; })))
        : Object.keys(markers);
      showMarkers(ids);
      if (s.artist && !s.venue) fitTo(ids);
      if (s.artist) $("panel-body").scrollTop = 0;
      renderPanel();
    }
    if (!s.venue) map.closePopup();
    navigating = false;
    if (s.venue) openVenue(s.venue);
    if (!s.artist && !s.venue && !initial) fitTo(Object.keys(markers));
  }

  function go(s) {
    writeHash(s);
    if (mobile.matches) setSheet(false);
    apply(s);
  }

  // ---------- init ----------

  ConcertData.load().then(function (d) {
    data = d;
    var years = d.concerts.map(function (c) { return c.year; });
    $("stats").textContent = d.concerts.length + " shows · " + Object.keys(d.venues).length + " venues · " +
      Math.min.apply(null, years) + "–" + Math.max.apply(null, years);

    buildMarkers();
    var s = readHash();
    apply(s, true);
    if (!s.artist && !s.venue) fitTo(Object.keys(markers).filter(function (id) {
      return data.venues[id].country !== "US"; // keep the initial view on Europe
    }));

    search.addEventListener("input", function () {
      if (state.artist && search.value) go({});
      renderLists();
    });
    search.addEventListener("focus", function () { if (mobile.matches) setSheet(true); });
    document.querySelectorAll(".tab").forEach(function (t) {
      t.addEventListener("click", function () { setTab(t.dataset.tab); });
    });
    $("back").addEventListener("click", function () { go({}); });
    $("sheet-toggle").addEventListener("click", function () { setSheet(!panel.classList.contains("open")); });
    new ResizeObserver(function () {
      document.documentElement.style.setProperty("--sheet-h", panel.offsetHeight + "px");
    }).observe(panel);
    window.addEventListener("popstate", function () { apply(readHash()); });
    map.on("popupclose", function (e) {
      // Closing a popup by hand drops the venue from the URL
      if (!navigating && state.venue && markers[state.venue] === e.popup._source) {
        state = { artist: state.artist };
        history.replaceState(null, "", state.artist ? "#" + new URLSearchParams({ artist: state.artist }) : location.pathname);
      }
    });
  }).catch(function (err) {
    $("stats").textContent = location.protocol === "file:"
      ? "Could not load data: open this page through a web server (e.g. python3 -m http.server), not as a file."
      : "Could not load data.";
    console.error(err);
  });
})();
