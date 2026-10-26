(function () {
  "use strict";

  var MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  var WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  var DAY = 864e5;

  var $ = function (id) { return document.getElementById(id); };
  var main = $("main"), tip = $("tip");

  // ---------- helpers ----------

  function el(tag, attrs, children) {
    var e = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) {
      if (k === "text") e.textContent = attrs[k];
      else if (k === "class") e.className = attrs[k];
      else if (k.slice(0, 2) === "on") e.addEventListener(k.slice(2), attrs[k]);
      else e.setAttribute(k, attrs[k]);
    });
    (children || []).forEach(function (c) { if (c != null) e.append(c); });
    return e;
  }

  function fmtDate(d) { return d.split("-").reverse().join("."); }

  function plural(n, word) { return n + " " + word + (n === 1 ? "" : "s"); }

  function days(a, b) { return Math.round((Date.parse(b) - Date.parse(a)) / DAY); }

  // Counts items by key, returns [[key, n], ...] sorted by n desc, then key
  function tally(items, key) {
    var m = new Map();
    items.forEach(function (x) { var k = key(x); m.set(k, (m.get(k) || 0) + 1); });
    return Array.from(m).sort(function (a, b) { return b[1] - a[1] || String(a[0]).localeCompare(String(b[0])); });
  }

  function km(a, b) {
    var r = Math.PI / 180, dlat = (b.lat - a.lat) * r, dlon = (b.lon - a.lon) * r;
    var h = Math.pow(Math.sin(dlat / 2), 2) + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.pow(Math.sin(dlon / 2), 2);
    return 12742 * Math.asin(Math.sqrt(h));
  }

  function flag(cc) {
    return cc.toUpperCase().replace(/./g, function (ch) { return String.fromCodePoint(127397 + ch.charCodeAt(0)); });
  }

  var countryName = (function () {
    try {
      var dn = new Intl.DisplayNames(["en"], { type: "region" });
      return function (cc) { return dn.of(cc) || cc; };
    } catch (e) {
      return function (cc) { return cc; };
    }
  })();

  function mapLink(params) {
    return "map.html#" + new URLSearchParams(params).toString();
  }

  // ---------- building blocks ----------

  function card(title, sub, body, wide) {
    return el("section", { class: "card" + (wide ? " wide" : "") }, [
      el("h2", { text: title }),
      sub ? el("p", { class: "sub", text: sub }) : null,
      body
    ]);
  }

  // Vertical bars. rows: [{label, value, tip}], opts.every: show every n-th axis label
  function columns(rows, opts) {
    opts = opts || {};
    var max = Math.max.apply(null, rows.map(function (r) { return r.value; })) || 1;
    var every = opts.every || 1;
    var chart = el("div", { class: "columns", role: "img", "aria-label": opts.label || "" },
      rows.map(function (r) {
        var pct = r.value / max * 100;
        var col = el("div", { class: "col" + (r.value === max ? " peak" : ""), "data-tip": r.tip }, [
          el("i", { style: "height:" + pct + "%" })
        ]);
        if (r.value === max) {
          col.append(el("span", { class: "val", style: "bottom:calc(" + pct + "% + 4px)", text: r.value }));
        }
        return col;
      }));
    var axis = el("div", { class: "axis", "aria-hidden": "true" }, rows.map(function (r, i) {
      return el("span", { text: i % every === 0 ? r.label : "" });
    }));
    return el("div", {}, [chart, axis, table(rows)]);
  }

  // Screen-reader fallback for the column charts
  function table(rows) {
    return el("table", { class: "visually-hidden" }, rows.map(function (r) {
      return el("tr", {}, [el("th", { text: r.label }), el("td", { text: r.value })]);
    }));
  }

  // Horizontal bar list. rows: [{name, href?, sub?, value}]
  function bars(rows) {
    var max = rows.length ? rows[0].value : 1;
    return el("ol", { class: "bars" }, rows.map(function (r) {
      var name = el(r.href ? "a" : "span", r.href ? { class: "name", href: r.href } : { class: "name" }, [
        r.name, r.sub ? el("small", { text: " · " + r.sub }) : null
      ]);
      return el("li", {}, [
        el("div", { class: "row" }, [name, el("span", { class: "num", text: r.value })]),
        el("div", { class: "track" }, [el("i", { style: "width:" + (r.value / max * 100) + "%" })])
      ]);
    }));
  }

  function venueName(v) { return v.name || "Unknown venue"; }

  function where(c) { return fmtDate(c.date) + " · " + (c.venueData.name ? c.venueData.name + ", " : "") + c.venueData.city; }

  function fact(label, value, note) {
    return el("div", { class: "fact" }, [el("span", { text: label }), el("b", { text: value }), note ? el("p", { text: note }) : null]);
  }

  // ---------- tooltip (hover on desktop, tap on touch) ----------

  var tipFor = null;

  function showTip(col) {
    if (tipFor) tipFor.classList.remove("active");
    tipFor = col;
    col.classList.add("active");
    tip.innerHTML = col.dataset.tip;
    tip.hidden = false;
    var r = col.getBoundingClientRect();
    var bar = col.firstChild.getBoundingClientRect();
    var w = tip.offsetWidth / 2 + 8;
    var x = Math.min(Math.max(r.left + r.width / 2, w), window.innerWidth - w);
    tip.style.left = x + "px";
    tip.style.top = Math.min(bar.top, r.bottom - 8) + "px";
  }

  function hideTip() {
    if (tipFor) tipFor.classList.remove("active");
    tipFor = null;
    tip.hidden = true;
  }

  document.addEventListener("pointerover", function (e) {
    if (e.pointerType === "mouse") {
      var col = e.target.closest(".col");
      col ? showTip(col) : hideTip();
    }
  });
  document.addEventListener("pointerdown", function (e) {
    if (e.pointerType === "mouse") return;
    var col = e.target.closest(".col");
    col && col !== tipFor ? showTip(col) : hideTip();
  });
  window.addEventListener("scroll", hideTip, { passive: true });

  // ---------- stats ----------

  function render(data) {
    var all = data.concerts; // newest first
    var asc = all.slice().reverse();
    var venueOf = function (c) { return c.venueData; };

    var artists = Array.from(data.byArtist.keys());
    var cities = tally(all, function (c) { return venueOf(c).city; });
    var countries = tally(all, function (c) { return venueOf(c).country; });
    var first = asc[0], last = all[0];
    var y0 = first.year, y1 = last.year;

    // Per year, incl. years without concerts; first-time artists per year
    var years = [], seen = new Set();
    for (var y = y0; y <= y1; y++) years.push({ year: y, n: 0, fresh: 0 });
    asc.forEach(function (c) {
      var row = years[c.year - y0];
      row.n++;
      c.artists.forEach(function (a) { if (!seen.has(a)) { seen.add(a); row.fresh++; } });
    });

    var months = MONTHS.map(function () { return 0; });
    var weekdays = WEEKDAYS.map(function () { return 0; });
    all.forEach(function (c) {
      months[+c.date.slice(5, 7) - 1]++;
      weekdays[(new Date(c.date + "T00:00:00Z").getUTCDay() + 6) % 7]++;
    });

    var topArtists = tally(all.flatMap(function (c) { return c.artists; }), function (a) { return a; }).slice(0, 10);
    var topVenues = Object.keys(data.venues)
      .map(function (id) { return [id, data.byVenue.get(id).length]; })
      .sort(function (a, b) { return b[1] - a[1] || venueName(data.venues[a[0]]).localeCompare(venueName(data.venues[b[0]])); })
      .slice(0, 10);

    // Facts
    var gap = { d: 0 };
    asc.forEach(function (c, i) {
      if (i && days(asc[i - 1].date, c.date) > gap.d) gap = { d: days(asc[i - 1].date, c.date), from: asc[i - 1], to: c };
    });

    var busiestMonth = tally(all, function (c) { return c.date.slice(0, 7); })[0];

    var loyal = artists.map(function (a) {
      var list = data.byArtist.get(a); // newest first
      return { name: a, span: list[0].year - list[list.length - 1].year, from: list[list.length - 1].year, to: list[0].year, n: list.length };
    }).sort(function (a, b) { return b.span - a.span || b.n - a.n; })[0];

    var oneTimers = artists.filter(function (a) { return data.byArtist.get(a).length === 1; }).length;

    var doubleDays = tally(all, function (c) { return c.date; }).filter(function (d) { return d[1] > 1; }).length;

    var biggest = all.reduce(function (b, c) { return c.artists.length > b.artists.length ? c : b; });

    var events = new Set(all.filter(function (c) { return c.event; }).map(function (c) { return c.event; }));

    // "Home" = the most-visited venue in the most-visited city
    var homeCity = cities[0][0];
    var home = data.venues[topVenues.filter(function (v) { return data.venues[v[0]].city === homeCity; })[0][0]];
    var furthest = Object.values(data.venues).reduce(function (f, v) {
      var d = km(home, v);
      return d > f.d ? { d: d, v: v } : f;
    }, { d: 0 });

    var thisYear = new Date().getFullYear();
    var perYear = all.length / years.length;

    // ---------- page ----------

    main.replaceChildren(
      el("div", { class: "tiles" }, [
        tile(all.length, "concerts"),
        tile(artists.length, "artists"),
        tile(Object.keys(data.venues).length, "venues"),
        tile(cities.length, "cities"),
        tile(countries.length, "countries"),
        tile(years.length, "years since " + y0)
      ]),

      el("div", { class: "grid" }, [
        card("Concerts per year", "≈ " + perYear.toFixed(1) + " per year on average" + (y1 === thisYear ? ", " + thisYear + " still running" : ""),
          columns(years.map(function (r) {
            return { label: years.length > 12 ? "’" + String(r.year).slice(2) : r.year, value: r.n,
              tip: r.year + ": <b>" + plural(r.n, "concert") + "</b>" };
          }), { every: years.length > 12 ? 5 : 1, label: "Concerts per year" }), true)
      ]),

      el("div", { class: "grid" }, [
        card("Top artists", "Most seen live", bars(topArtists.map(function (a) {
          return { name: a[0], value: a[1], href: mapLink({ artist: a[0] }) };
        }))),
        card("Top venues", plural(Object.keys(data.venues).length, "venue") + " in total", bars(topVenues.map(function (v) {
          var venue = data.venues[v[0]];
          return { name: venueName(venue), sub: venue.city, value: v[1], href: mapLink({ venue: v[0] }) };
        }))),
        card("Top cities", cities.length + " cities in total", bars(cities.slice(0, 10).map(function (c) {
          return { name: c[0], value: c[1] };
        })))
      ]),

      el("div", { class: "grid" }, [
        card("By month", "Busiest: " + MONTHS[months.indexOf(Math.max.apply(null, months))],
          columns(months.map(function (n, i) {
            return { label: MONTHS[i].charAt(0), value: n, tip: MONTHS[i] + ": <b>" + plural(n, "concert") + "</b>" };
          }), { label: "Concerts by month" })),
        card("By weekday", "Busiest: " + WEEKDAYS[weekdays.indexOf(Math.max.apply(null, weekdays))],
          columns(weekdays.map(function (n, i) {
            return { label: WEEKDAYS[i], value: n, tip: WEEKDAYS[i] + ": <b>" + plural(n, "concert") + "</b>" };
          }), { label: "Concerts by weekday" })),
        card("Countries", (all.length - countries[0][1]) + " concerts outside " + countryName(countries[0][0]), bars(countries.map(function (c) {
          return { name: flag(c[0]) + "  " + countryName(c[0]), value: c[1] };
        })))
      ]),

      el("div", { class: "facts" }, [
        fact("First concert", first.artists.join(", "), where(first)),
        fact("Latest concert", last.artists.join(", "), where(last)),
        fact("Most loyal", loyal.name, plural(loyal.n, "concert") + " over " + loyal.span + " years (" + loyal.from + "–" + loyal.to + ")"),
        fact("Seen only once", oneTimers + " of " + artists.length + " artists", Math.round(oneTimers / artists.length * 100) + "% never seen twice"),
        fact("Longest break", plural(gap.d, "day"), fmtDate(gap.from.date) + " → " + fmtDate(gap.to.date)),
        fact("Busiest month", MONTHS[+busiestMonth[0].slice(5) - 1] + " " + busiestMonth[0].slice(0, 4), plural(busiestMonth[1], "concert")),
        fact("Biggest bill", plural(biggest.artists.length, "artist"), fmtDate(biggest.date) + " · " + (biggest.event || venueName(venueOf(biggest)))),
        fact("Double features", plural(doubleDays, "day"), "with two concerts on the same day"),
        fact("Festivals & events", String(events.size), plural(all.filter(function (c) { return c.event; }).length, "show") + " at a festival or event"),
        fact("Furthest away", furthest.v.name || furthest.v.city, Math.round(furthest.d).toLocaleString("en") + " km from " + home.name + ", " + homeCity)
      ]),

      el("div", { class: "grid" }, [
        card("New artists per year", "Artists seen live for the first time",
          columns(years.map(function (r) {
            return { label: years.length > 12 ? "’" + String(r.year).slice(2) : r.year, value: r.fresh,
              tip: r.year + ": <b>" + r.fresh + " new</b> of " + plural(r.n, "concert") };
          }), { every: years.length > 12 ? 5 : 1, label: "New artists per year" }), true)
      ]),

      el("footer", {}, [el("a", { href: "concerts.txt", text: "concerts.txt" }), " · ", el("a", { href: "map.html", text: "map" })])
    );
  }

  function tile(value, label) {
    return el("div", { class: "tile" }, [el("b", { text: value.toLocaleString("en") }), el("span", { text: label })]);
  }

  ConcertData.load().then(render).catch(function (err) {
    console.error(err);
    $("status").textContent = location.protocol === "file:"
      ? "Could not load data: open this page through a web server (e.g. python3 -m http.server), not as a file."
      : "Could not load data.";
  });
})();
