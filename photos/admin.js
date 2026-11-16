/* Private page: see everything uploaded, open or close uploads, delete files. Needs the secret key (?k=…). */
(function () {
  "use strict";
  var API = "/api/photos/admin/";
  var $ = function (id) { return document.getElementById(id); };
  var key = "", items = [], picked = {}, settings = {}, last = null;

  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function fmt(b) {
    if (b >= 1073741824) return (b / 1073741824).toFixed(1) + " GB";
    if (b >= 1048576) return (b / 1048576).toFixed(b >= 104857600 ? 0 : 1) + " MB";
    return Math.max(1, Math.round(b / 1024)) + " KB";
  }
  function api(path, opts) {
    opts = opts || {}; opts.headers = Object.assign({ "x-admin-key": key }, opts.headers || {});
    return fetch(API + path, opts).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (d) {
        if (!r.ok) { var e = new Error(d.message || "Something went wrong."); e.code = d.error; throw e; }
        return d;
      });
    });
  }
  function fileUrl(k, extra) { return API + "file?key=" + encodeURIComponent(k) + "&k=" + encodeURIComponent(key) + (extra || ""); }

  function render(data) {
    last = data; items = data.items; settings = data.settings;
    var photos = items.filter(function (i) { return i.kind === "image"; }).length;
    var people = {}; items.forEach(function (i) { people[(i.uploader || "").trim().toLowerCase() || "?"] = 1; });
    $("a-count").textContent = items.length; $("a-photos").textContent = photos; $("a-videos").textContent = items.length - photos;
    var named = Object.keys(people).filter(function (n) { return n !== "?"; }).length;
    $("a-people-wrap").innerHTML = "<b>" + named + "</b> named " + (named === 1 ? "person" : "people");
    $("a-used").textContent = fmt(data.used); $("a-max").textContent = fmt(data.maxTotal);
    $("a-fill").style.width = Math.min(100, 100 * data.used / data.maxTotal).toFixed(1) + "%";
    var up = $("a-uploads");
    up.textContent = settings.uploadsOpen ? "Uploads are open · tap to close" : "Uploads are closed · tap to open";
    up.className = "a-btn" + (settings.uploadsOpen ? " is-on" : "");
    $("a-empty").hidden = items.length > 0;

    $("a-grid").innerHTML = items.map(function (it, i) {
      var pic = it.thumb
        ? '<img class="a-pic" loading="lazy" alt="" data-i="' + i + '" src="' + fileUrl("thumb/" + it.id + ".jpg") + '">'
        : '<button type="button" class="a-pic is-blank" data-i="' + i + '">no preview</button>';
      var when = new Date(it.uploaded).toLocaleString(undefined, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
      return '<div class="a-card' + (picked[it.key] ? " is-picked" : "") + '">' + pic +
        (it.kind === "video" ? '<span class="a-tag">Video</span>' : "") +
        '<input type="checkbox" class="a-check" aria-label="Select" data-k="' + esc(it.key) + '"' + (picked[it.key] ? " checked" : "") + ">" +
        '<div class="a-cap"><b>' + esc(it.uploader || "No name") + "</b><span>" + fmt(it.size) + " · " + esc(when) + "</span></div></div>";
    }).join("");
    paintDelete();
  }

  function paintDelete() {
    var n = Object.keys(picked).length, b = $("a-delete");
    b.disabled = !n; b.textContent = n ? "Delete " + n + " selected" : "Delete selected";
  }

  function load() {
    return api("list").then(function (data) { $("a-state").hidden = true; $("a-body").hidden = false; render(data); });
  }

  function view(it) {
    var box = document.createElement("div");
    box.className = "a-view";
    var src = fileUrl(it.key);
    box.innerHTML = (it.kind === "video" ? '<video controls autoplay playsinline src="' + src + '"></video>' : '<img alt="" src="' + src + '">') +
      '<button type="button" class="a-view-close" aria-label="Close">✕</button>' +
      '<a class="a-view-dl" href="' + fileUrl(it.key, "&dl=1&name=" + encodeURIComponent(it.name || "")) + '">Download original · ' + fmt(it.size) + "</a>";
    var close = function () { if (box.parentNode) box.parentNode.removeChild(box); document.removeEventListener("keydown", onKey); };
    var onKey = function (e) { if (e.key === "Escape") close(); };
    box.onclick = function (e) { if (e.target === box || e.target.className === "a-view-close") close(); };
    document.addEventListener("keydown", onKey);
    document.body.appendChild(box);
  }

  $("a-grid").addEventListener("click", function (e) {
    var t = e.target;
    if (t.classList.contains("a-check")) {
      var k = t.getAttribute("data-k");
      if (t.checked) picked[k] = 1; else delete picked[k];
      t.parentNode.classList.toggle("is-picked", t.checked); paintDelete(); return;
    }
    if (t.classList.contains("a-pic")) view(items[+t.getAttribute("data-i")]);
  });
  $("a-refresh").onclick = function () { load(); };
  $("a-selectall").onclick = function () {
    var all = Object.keys(picked).length === items.length; picked = {};
    if (!all) items.forEach(function (i) { picked[i.key] = 1; });
    render(last);
  };
  $("a-uploads").onclick = function () {
    api("settings", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ uploadsOpen: !settings.uploadsOpen }) }).then(load);
  };
  $("a-delete").onclick = function () {
    var keys = Object.keys(picked); if (!keys.length) return;
    if (!window.confirm("Delete " + keys.length + " file" + (keys.length === 1 ? "" : "s") + " for good? This can’t be undone.")) return;
    api("delete", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ keys: keys }) })
      .then(function () { picked = {}; return load(); });
  };

  // key: from the link (?k=…), remembered for this browser tab only
  try {
    var q = new URLSearchParams(location.search).get("k");
    if (q) { sessionStorage.setItem("rm-admin", q); history.replaceState(null, "", location.pathname); }
    key = sessionStorage.getItem("rm-admin") || "";
  } catch (e) {}
  if (!key) key = window.prompt("Private key:") || "";
  try { if (key) sessionStorage.setItem("rm-admin", key); } catch (e) {}

  load().catch(function (err) {
    try { sessionStorage.removeItem("rm-admin"); } catch (e) {}
    $("a-state").textContent = err.code === "unauthorized" ? "That key isn’t right. Open the private link again."
      : err.code === "no-admin-key" ? "The private page isn’t set up yet (no key has been set in Cloudflare)."
      : err.code === "storage-not-connected" ? "Photo storage isn’t connected yet."
      : "Couldn’t load. Check your connection and refresh.";
  });
})();
