/* Find-your-table app. No libraries, no server: reads guests.csv and searches it in the browser. */
(function () {
  "use strict";

  var CFG = window.WEDDING || {};
  var MAX_LIST = 8;          // how many matches to list before asking for more letters
  var MIN_CHARS = 2;         // letters needed before searching

  var $ = function (id) { return document.getElementById(id); };
  var input = $("q"), statusEl = $("status"), resultsEl = $("results"), clearBtn = $("clear");

  var guests = [];
  var loaded = false;
  var lastMatches = [];
  var debounceTimer = null;

  /* ───────────── Text helpers ───────────── */

  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  // "  José O'Brien-Müller " → "jose obrien muller"
  function norm(s) {
    return String(s || "")
      .normalize("NFKD").replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/ß/g, "ss").replace(/æ/g, "ae").replace(/œ/g, "oe")
      .replace(/ø/g, "o").replace(/ł/g, "l").replace(/đ/g, "d").replace(/ı/g, "i")
      .replace(/['’‘`´ʼ.]/g, "")
      .replace(/[^\p{L}\p{N}]+/gu, " ")
      .trim();
  }
  function tokens(s) { var n = norm(s); return n ? n.split(" ") : []; }
  function compact(s) { return norm(s).replace(/ /g, ""); }

  // Rough sound-alike key for transliterated names:
  // Mohamed / Muhammad / Mohammed → "mhmd", Youssef / Yusuf → "ysf", Ahmed / Ahmad → "ahmd"
  function skeleton(t) {
    if (!t) return "";
    var s = t.replace(/ph/g, "f").replace(/ck/g, "k").replace(/q/g, "k").replace(/z/g, "s")
             .replace(/(.)\1+/g, "$1");
    return s[0] + s.slice(1).replace(/[aeiouy]/g, "").replace(/(.)\1+/g, "$1");
  }

  // Edit distance with swapped-letter support (Damerau / OSA)
  function dist(a, b) {
    if (a === b) return 0;
    var al = a.length, bl = b.length;
    if (!al) return bl; if (!bl) return al;
    var d = [];
    for (var i = 0; i <= al; i++) { d[i] = [i]; }
    for (var j = 1; j <= bl; j++) { d[0][j] = j; }
    for (i = 1; i <= al; i++) {
      for (j = 1; j <= bl; j++) {
        var cost = a[i - 1] === b[j - 1] ? 0 : 1;
        d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
        if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
          d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
        }
      }
    }
    return d[al][bl];
  }
  function allowedTypos(len) { return len <= 4 ? 1 : len <= 7 ? 2 : 3; }

  /* ───────────── CSV loading ───────────── */

  function parseCSV(text) {
    text = text.replace(/^﻿/, "").replace(/\r\n?/g, "\n");
    var firstLine = text.split("\n", 1)[0];
    var count = function (ch) { return firstLine.split(ch).length - 1; };
    // Excel in Germany saves with ";" — detect it
    var delim = [",", ";", "\t"].sort(function (a, b) { return count(b) - count(a); })[0];

    var rows = [], row = [], field = "", q = false;
    for (var i = 0; i < text.length; i++) {
      var c = text[i];
      if (q) {
        if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else q = false; }
        else field += c;
      } else if (c === '"') q = true;
      else if (c === delim) { row.push(field); field = ""; }
      else if (c === "\n") { row.push(field); rows.push(row); row = []; field = ""; }
      else field += c;
    }
    if (field !== "" || row.length) { row.push(field); rows.push(row); }
    return rows;
  }

  function pickCol(header, names) {
    for (var i = 0; i < header.length; i++) {
      if (names.indexOf(header[i]) !== -1) return i;
    }
    return -1;
  }

  function buildGuests(rows) {
    if (!rows.length) return [];
    var header = rows[0].map(function (h) { return norm(h).replace(/ /g, "_"); });
    var cFirst = pickCol(header, ["first", "first_name", "firstname", "vorname", "given_name"]);
    var cLast  = pickCol(header, ["last", "last_name", "lastname", "surname", "nachname", "family_name"]);
    var cName  = pickCol(header, ["name", "full_name", "guest"]);
    var cTable = pickCol(header, ["table", "table_number", "table_no", "tisch", "seat"]);
    var cAlias = pickCol(header, ["aliases", "alias", "nicknames", "nickname", "other_names"]);
    var cNote  = pickCol(header, ["note", "notes", "hint"]);
    if (cTable === -1 || (cFirst === -1 && cLast === -1 && cName === -1)) {
      throw new Error("guests.csv needs a 'table' column and name columns (first_name / last_name).");
    }

    var out = [];
    for (var r = 1; r < rows.length; r++) {
      var row = rows[r];
      var get = function (c) { return c === -1 ? "" : String(row[c] || "").trim(); };
      var first = get(cFirst), last = get(cLast);
      if (!first && !last && cName !== -1) {
        var parts = get(cName).split(/\s+/);
        last = parts.length > 1 ? parts.pop() : "";
        first = parts.join(" ");
      }
      if (!first && !last) continue;                 // empty line
      if (first.charAt(0) === "#") continue;          // commented-out line
      var display = (first + " " + last).replace(/\s+/g, " ").trim();
      var aliases = get(cAlias).split(/[|\/]/).map(function (a) { return a.trim(); }).filter(Boolean);
      var nameTokens = tokens(display);
      var aliasTokens = [];
      aliases.forEach(function (a) { aliasTokens = aliasTokens.concat(tokens(a)); });
      // Müller → also findable as "mueller", Groß → "gross" (already), Søren → "soeren"
      var umlaut = display.toLowerCase().replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ø/g, "oe");
      if (umlaut !== display.toLowerCase()) aliasTokens = aliasTokens.concat(tokens(umlaut));
      out.push({
        display: display,
        table: get(cTable).replace(/^(table|tisch)\s*/i, ""),
        note: get(cNote),
        aliases: aliases,
        nameTokens: nameTokens,
        aliasTokens: aliasTokens,
        compacts: [compact(display)].concat(aliases.map(compact), umlaut !== display.toLowerCase() ? [compact(umlaut)] : []),
        sortKey: norm(last + " " + first)
      });
    }
    return out;
  }

  function load() {
    statusEl.textContent = "Loading the guest list…";
    fetch("guests.csv", { cache: "no-cache" })
      .then(function (r) { if (!r.ok) throw new Error("HTTP " + r.status); return r.text(); })
      .then(function (text) {
        guests = buildGuests(parseCSV(text));
        loaded = true;
        if (input.value.trim()) run(); else setIdle();
      })
      .catch(function (err) {
        console.error(err);
        statusEl.textContent = "";
        resultsEl.innerHTML =
          '<div class="notfound"><p class="notfound-title">We couldn’t load the guest list</p>' +
          "<p>This is usually a weak signal. Please try again, or ask " + esc(CFG.helpContact || "the welcome desk") + ".</p>" +
          '<div class="seat-actions"><button class="link-btn" type="button" id="retry">Try again</button></div></div>';
        $("retry").onclick = function () { resultsEl.innerHTML = ""; load(); };
      });
  }

  /* ───────────── Search ───────────── */

  function tokenScore(qt, list) {
    var best = 0;
    for (var i = 0; i < list.length; i++) {
      var t = list[i];
      if (t === qt) return 3;
      if (t.indexOf(qt) === 0) best = Math.max(best, 2);
      else if (qt.length >= 3 && t.indexOf(qt) > 0) best = Math.max(best, 1);
    }
    return best;
  }

  function search(q) {
    var qts = tokens(q), qc = compact(q);
    var matches = [];
    guests.forEach(function (g) {
      var score = 0, exactAll = true, ok = true;
      for (var i = 0; i < qts.length; i++) {
        var s = tokenScore(qts[i], g.nameTokens);
        var sa = tokenScore(qts[i], g.aliasTokens) - 0.5;
        var best = Math.max(s, sa);
        if (best <= 0) { ok = false; break; }
        if (s !== 3) exactAll = false;
        score += best;
      }
      // "marcorossi", "abdelaziz", "elsayed" → compare without spaces
      if (!ok && qc.length >= 4) {
        ok = g.compacts.some(function (c) { return c.indexOf(qc) !== -1; });
        score = 1; exactAll = false;
      }
      if (ok) matches.push({ g: g, score: score, exact: exactAll });
    });
    matches.sort(function (a, b) {
      return b.score - a.score || a.g.sortKey.localeCompare(b.g.sortKey);
    });
    return matches;
  }

  function suggest(q) {
    var qts = tokens(q);
    if (!qts.length) return [];
    var scored = [];
    guests.forEach(function (g) {
      var all = g.nameTokens.concat(g.aliasTokens);
      var total = 0;
      for (var i = 0; i < qts.length; i++) {
        var qt = qts[i], best = Infinity, qs = skeleton(qt);
        for (var j = 0; j < all.length; j++) {
          var t = all[j];
          var d = Math.min(dist(qt, t), dist(qt, t.slice(0, qt.length)) + 0.3);
          if (qs.length >= 3 && qs === skeleton(t)) d = Math.min(d, 0.5 + 0.05 * dist(qt, t));
          if (d < best) best = d;
        }
        if (best > allowedTypos(qt.length)) return;
        total += best;
      }
      scored.push({ g: g, d: total });
    });
    scored.sort(function (a, b) { return a.d - b.d || a.g.sortKey.localeCompare(b.g.sortKey); });
    if (!scored.length) return [];
    var cutoff = scored[0].d + 1;          // only offer the closest few
    return scored.filter(function (s) { return s.d <= cutoff; }).slice(0, 4).map(function (s) { return s.g; });
  }

  /* ───────────── Rendering ───────────── */

  function tableInfo(g) {
    var t = g.table;
    var name = (CFG.tableNames && CFG.tableNames[t]) || "";
    return { value: t, isNumber: /^\d{1,3}$/.test(t), name: name };
  }

  function highlight(display, q) {
    var qts = tokens(q);
    return display.split(/(\s+|-)/).map(function (part) {
      var n = norm(part);
      var hit = n && qts.some(function (qt) { return n.indexOf(qt) === 0 || (qt.length >= 3 && n.indexOf(qt) !== -1); });
      return hit ? "<mark>" + esc(part) + "</mark>" : esc(part);
    }).join("");
  }

  function setIdle() {
    resultsEl.innerHTML = "";
    statusEl.textContent = "Even part of your name works.";
  }

  function showSeat(g, fromList) {
    var t = tableInfo(g);
    var html = '<div class="seat" tabindex="-1" id="seat">' +
      '<p class="seat-hello">Welcome,</p>' +
      '<p class="seat-name">' + esc(g.display) + "</p>";
    if (!t.value) {
      html += '<p class="seat-label">Your table</p>' +
        '<p class="seat-number is-text">Being finalised</p>' +
        "<p>Please ask " + esc(CFG.helpContact || "the welcome desk") + " and we’ll seat you.</p>";
    } else {
      html += '<p class="seat-label">' + (t.isNumber ? "Your " + esc(CFG.tableWord || "Table") : "You are seated at") + "</p>" +
        (t.isNumber
          ? '<p class="seat-number">' + esc(t.value) + "</p>"
          : '<p class="seat-number is-text">' + esc(t.value) + "</p>") +
        (t.name ? '<p class="seat-tablename">' + esc(t.name) + "</p>" : "");
    }
    html += '<div class="seat-actions">' +
      (fromList ? '<button type="button" class="link-btn" id="back">Not you? Back to the list</button>' : "") +
      '<button type="button" class="link-btn" id="again">Search another name</button></div></div>';
    resultsEl.innerHTML = html;
    statusEl.textContent = "";
    if (fromList) $("back").onclick = function () { renderList(lastMatches, input.value); };
    $("again").onclick = function () { clearSearch(true); };
    var seat = $("seat");
    if (fromList && seat.scrollIntoView) seat.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  function renderList(matches, q) {
    var shown = matches.slice(0, MAX_LIST);
    statusEl.textContent = matches.length + " guests match — tap your name.";
    var html = '<ul class="result-list">' + shown.map(function (m, i) {
      var t = tableInfo(m.g);
      // explain *why* it matched when the typed name was one of the aliases ("Yusuf" → Youssef)
      var qts = tokens(q);
      var viaAlias = m.g.aliases.length &&
        qts.some(function (qt) { return tokenScore(qt, m.g.nameTokens) === 0 && tokenScore(qt, tokens(m.g.aliases.join(" "))) > 0; });
      var sub = m.g.note ? '<span class="result-alias">' + esc(m.g.note) + "</span>"
              : (viaAlias ? '<span class="result-alias">also: ' + esc(m.g.aliases.join(", ")) + "</span>" : "");
      return '<li><button type="button" class="result" data-i="' + i + '">' +
        '<span class="result-name">' + highlight(m.g.display, q) + sub + "</span>" +
        '<span class="result-table"><small>' + esc(CFG.tableWord || "Table") + "</small>" +
        '<b class="' + (t.isNumber || !t.value ? "" : "is-text") + '">' + esc(t.value || "—") + "</b></span>" +
        "</button></li>";
    }).join("") + "</ul>";
    if (matches.length > MAX_LIST) {
      html += '<p class="more-note">…and ' + (matches.length - MAX_LIST) +
        " more. Add a few more letters or your last name.</p>";
    }
    resultsEl.innerHTML = html;
    Array.prototype.forEach.call(resultsEl.querySelectorAll(".result"), function (btn) {
      btn.onclick = function () { showSeat(shown[+btn.getAttribute("data-i")].g, true); };
    });
  }

  function renderNotFound(q) {
    var help = esc(CFG.helpContact || "the welcome desk");
    var sugg = suggest(q);
    var html = '<div class="notfound">';
    if (sugg.length) {
      html += '<p class="notfound-title">Did you mean…</p>' +
        '<ul class="suggestions">' + sugg.map(function (g, i) {
          return '<li><button type="button" class="suggestion" data-i="' + i + '">' + esc(g.display) +
            (g.note ? "<small>" + esc(g.note) + "</small>" : "") + "</button></li>";
        }).join("") + "</ul>" +
        "<p>Not you? Try your first or last name on its own.</p>";
    } else {
      html += '<p class="notfound-title">We couldn’t find “' + esc(q.trim()) + "”</p>" +
        '<ul class="tips">' +
        "<li>Check the spelling, or try fewer letters</li>" +
        "<li>Try only your first name, or only your last name</li>" +
        "<li>Use the name on your invitation</li>" +
        "</ul>" +
        "<p>Still nothing? Please ask " + help + ". We have a seat for you.</p>";
    }
    html += "</div>";
    resultsEl.innerHTML = html;
    statusEl.textContent = "";
    Array.prototype.forEach.call(resultsEl.querySelectorAll(".suggestion"), function (btn) {
      btn.onclick = function () { showSeat(sugg[+btn.getAttribute("data-i")], false); };
    });
  }

  function run() {
    var raw = input.value;
    clearBtn.hidden = !raw;
    if (!loaded) return;                            // will run once the list arrives
    var q = raw.trim();
    if (!q) { setIdle(); return; }

    if (/[؀-ۿ]/.test(q)) {
      resultsEl.innerHTML = "";
      statusEl.textContent = "Please type your name in English (Latin) letters.";
      return;
    }
    if (/^\s*(table|tisch)?\s*#?\d+\s*$/i.test(q)) {
      resultsEl.innerHTML = "";
      statusEl.textContent = "Type your name and we’ll show you your table.";
      return;
    }
    var n = norm(q);
    if (!n) {
      resultsEl.innerHTML = "";
      statusEl.textContent = "Please type the letters of your name.";
      return;
    }
    if (n.replace(/ /g, "").length < MIN_CHARS) {
      resultsEl.innerHTML = "";
      statusEl.textContent = "Keep typing…";
      return;
    }

    var matches = search(q);
    lastMatches = matches;
    var exact = matches.filter(function (m) { return m.exact; });

    if (!matches.length) renderNotFound(q);
    else if (matches.length === 1) showSeat(matches[0].g, false);
    // full name typed ("marco rossi") and exactly one person has it → go straight to the seat
    else if (tokens(q).length >= 2 && exact.length === 1 &&
             tokens(q).indexOf(exact[0].g.nameTokens[0]) !== -1) showSeat(exact[0].g, false);
    else renderList(matches, q);
  }

  function clearSearch(focus) {
    input.value = "";
    clearBtn.hidden = true;
    setIdle();
    if (focus) input.focus();
  }

  /* ───────────── Static content from config.js ───────────── */

  function fillContent() {
    if (CFG.couple) { $("couple").textContent = CFG.couple; }
    if (CFG.dateLabel) $("date").textContent = CFG.dateLabel;
    if (CFG.venue) { $("venue").textContent = CFG.venue; $("venue").hidden = false; }

    var w = CFG.welcome;
    if (w && w.show) {
      $("welcome-title").textContent = w.title || "Welcome";
      $("welcome-text").innerHTML = String(w.text || "").split(/\n\s*\n/).map(function (p) {
        return "<p>" + esc(p.trim()) + "</p>";
      }).join("");
      $("welcome-signature").textContent = w.signature || "";
      var chips = [];
      if (w.hashtag) chips.push("Share your photos: <b>" + esc(w.hashtag) + "</b>");
      if (w.wifi && w.wifi.network) {
        chips.push("Wi-Fi: <b>" + esc(w.wifi.network) + "</b>" +
          (w.wifi.password ? " · Password: <b>" + esc(w.wifi.password) + "</b>" : ""));
      }
      $("welcome-extras").innerHTML = chips.map(function (c) { return "<li>" + c + "</li>"; }).join("");
      $("welcome").hidden = false;
    }

    var s = CFG.schedule;
    if (s && s.show && s.items && s.items.length) {
      $("schedule-title").textContent = s.title || "The Evening";
      var now = new Date();
      var today = now.getFullYear() + "-" + String(now.getMonth() + 1).padStart(2, "0") + "-" + String(now.getDate()).padStart(2, "0");
      var nowMin = now.getHours() * 60 + now.getMinutes();
      var current = -1;
      // minutes since wedding-day midnight; "12:00 am" after evening items counts as next day
      var prev = -1;
      var mins = s.items.map(function (it) {
        var m = /^(\d{1,2})(?::(\d{2}))?\s*([ap])?\.?m?\.?/i.exec(String(it.time || "").trim());
        if (!m) return null;
        var h = +m[1] % (m[3] ? 12 : 24), mm = +(m[2] || 0);
        if (m[3] && m[3].toLowerCase() === "p") h += 12;
        var v = h * 60 + mm;
        while (prev >= 0 && v < prev) v += 1440;
        prev = v;
        return v;
      });
      var wedding = new Date(CFG.date + "T00:00:00");
      var sinceStart = (now - wedding) / 60000;
      if (sinceStart >= 0 && sinceStart < 2 * 1440) {
        mins.forEach(function (v, i) { if (v !== null && v <= sinceStart) current = i; });
      }
      $("timeline").innerHTML = s.items.map(function (it, i) {
        var icons = window.TIMELINE_ICONS || {};
        var svg = icons[it.icon]
          ? '<svg class="t-icon" viewBox="0 0 64 64" aria-hidden="true">' + icons[it.icon] + "</svg>"
          : '<span class="t-icon t-dot" aria-hidden="true"></span>';
        return '<li class="' + (i === current ? "is-now" : "") + '">' + svg +
          '<span class="t-body"><time>' + esc(it.time || "") + "</time>" +
          (i === current ? '<span class="t-now">Now</span>' : "") +
          '<span class="t-title">' + esc(it.title || "") + "</span>" +
          (it.note ? '<span class="t-note">' + esc(it.note) + "</span>" : "") + "</span></li>";
      }).join("");
      $("schedule").hidden = false;
    }
  }

  /* ───────────── Wire up ───────────── */

  input.addEventListener("input", function () {
    clearBtn.hidden = !input.value;
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(run, 120);
  });
  input.addEventListener("keydown", function (e) {
    if (e.key === "Enter") { e.preventDefault(); clearTimeout(debounceTimer); run(); input.blur(); }
    if (e.key === "Escape") clearSearch(true);
  });
  clearBtn.addEventListener("click", function () { clearSearch(true); });

  // Optional: ?name=Rossi in the URL pre-fills the search
  try {
    var pre = new URLSearchParams(location.search).get("name");
    if (pre) { input.value = pre.slice(0, 60); clearBtn.hidden = false; }
  } catch (e) {}

  fillContent();
  load();
})();
