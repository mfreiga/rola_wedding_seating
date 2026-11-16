/* Photo & video upload page. No libraries. Talks to /api/photos (Cloudflare Pages Function + R2). */
(function () {
  "use strict";

  var API = "/api/photos/";
  var STORE_KEY = "rm-photos-v1";
  var FILES_AT_ONCE = 3;        // files uploading in parallel
  var PIECES_AT_ONCE = 4;       // upload pieces in flight across all files
  var RETRY_WAITS = [1, 2, 4, 8, 15, 30];   // seconds between retries of one piece

  var $ = function (id) { return document.getElementById(id); };
  var picker = $("picker"), pick = $("pick"), queueEl = $("queue"), who = $("who");
  var partSize = 10 * 1024 * 1024, maxFile = 2 * 1024 * 1024 * 1024;
  var items = [], running = 0, piecesBusy = 0, pieceWaiters = [], wakeLock = null;

  var ICON = {
    image: '<svg viewBox="0 0 24 24"><rect x="3.5" y="5" width="17" height="14" rx="2"/><circle cx="9" cy="10" r="1.6"/><path d="M4 17l5-4.5 3.5 3 3-2.5 4.5 4"/></svg>',
    video: '<svg viewBox="0 0 24 24"><rect x="3.5" y="6" width="12" height="12" rx="2"/><path d="M15.5 10.5l5-3v9l-5-3z"/></svg>',
    done: '<svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
    wait: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8"/><path d="M12 8v4.5l3 1.8"/></svg>',
    fail: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8"/><path d="M12 8v5M12 16v.2"/></svg>'
  };

  /* ───────────── small helpers ───────────── */

  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function fmt(b) {
    if (b >= 1073741824) return (b / 1073741824).toFixed(b >= 10737418240 ? 0 : 1) + " GB";
    if (b >= 1048576) return (b / 1048576).toFixed(b >= 104857600 ? 0 : 1) + " MB";
    return Math.max(1, Math.round(b / 1024)) + " KB";
  }
  function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  function plural(n, one, many) { return n + " " + (n === 1 ? one : many); }

  var VIDEO_EXT = /\.(mp4|mov|m4v|webm|3gp|avi|mkv)$/i, IMAGE_EXT = /\.(jpe?g|png|heic|heif|webp|gif|avif)$/i;
  function kindOf(f) {
    if (/^video\//.test(f.type) || VIDEO_EXT.test(f.name)) return "video";
    if (/^image\//.test(f.type) || IMAGE_EXT.test(f.name)) return "image";
    return null;
  }

  // What this phone has already uploaded, or was in the middle of — survives a refresh or a closed tab.
  function loadStore() {
    try {
      var s = JSON.parse(localStorage.getItem(STORE_KEY) || "{}"), now = Date.now(), changed = false;
      Object.keys(s).forEach(function (k) {       // unfinished uploads expire on the server after a week
        if (!s[k].done && now - (s[k].at || 0) > 6 * 86400000) { delete s[k]; changed = true; }
      });
      if (changed) localStorage.setItem(STORE_KEY, JSON.stringify(s));
      return s;
    } catch (e) { return {}; }
  }
  var store = loadStore();
  function saveStore() { try { localStorage.setItem(STORE_KEY, JSON.stringify(store)); } catch (e) {} }

  function api(path, opts) {
    return fetch(API + path, opts).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (data) {
        if (!r.ok) { var e = new Error(data.message || "Something went wrong."); e.code = data.error || "http"; e.status = r.status; throw e; }
        return data;
      });
    }, function () { var e = new Error("No connection."); e.code = "network"; throw e; });
  }

  // One piece of a file, with upload progress (fetch can't report that, so this uses XMLHttpRequest).
  function putPiece(url, blob, onProgress) {
    return new Promise(function (resolve, reject) {
      var x = new XMLHttpRequest();
      x.open("PUT", url);
      x.timeout = 5 * 60 * 1000;
      x.upload.onprogress = function (e) { if (e.lengthComputable) onProgress(e.loaded); };
      x.onload = function () {
        var data = {}; try { data = JSON.parse(x.responseText); } catch (e) {}
        if (x.status >= 200 && x.status < 300) return resolve(data);
        var err = new Error(data.message || "Upload failed."); err.code = data.error || "http"; err.status = x.status; reject(err);
      };
      x.onerror = x.ontimeout = x.onabort = function () { var err = new Error("No connection."); err.code = "network"; reject(err); };
      x.send(blob);
    });
  }

  function retryable(err) { return err.code === "network" || err.status === 408 || err.status === 429 || err.status >= 500; }
  function waitOnline() {
    if (navigator.onLine !== false) return Promise.resolve();
    return new Promise(function (r) { window.addEventListener("online", function on() { window.removeEventListener("online", on); r(); }); setTimeout(r, 120000); });
  }
  async function withRetry(fn) {
    for (var i = 0; ; i++) {
      try { return await fn(); }
      catch (err) {
        if (!retryable(err) || i >= RETRY_WAITS.length) throw err;
        await sleep(RETRY_WAITS[i] * 1000);
        await waitOnline();
      }
    }
  }

  function takePiece() {
    if (piecesBusy < PIECES_AT_ONCE) { piecesBusy++; return Promise.resolve(); }
    return new Promise(function (r) { pieceWaiters.push(r); });
  }
  function releasePiece() { var next = pieceWaiters.shift(); if (next) next(); else piecesBusy--; }

  /* ───────────── small preview image (made on the phone, so the gallery loads fast later) ───────────── */

  function drawThumb(source, w, h) {
    var max = 720, scale = Math.min(1, max / Math.max(w, h));
    var c = document.createElement("canvas");
    c.width = Math.max(1, Math.round(w * scale)); c.height = Math.max(1, Math.round(h * scale));
    c.getContext("2d").drawImage(source, 0, 0, c.width, c.height);
    return new Promise(function (r) { c.toBlob(function (b) { r(b); }, "image/jpeg", 0.8); });
  }

  function imageThumb(file) {
    var viaBitmap = window.createImageBitmap
      ? createImageBitmap(file).then(function (bmp) {
          return drawThumb(bmp, bmp.width, bmp.height).then(function (blob) {
            var out = { blob: blob, w: bmp.width, h: bmp.height }; if (bmp.close) bmp.close(); return out;
          });
        })
      : Promise.reject();
    return viaBitmap.catch(function () {
      return new Promise(function (resolve) {
        var url = URL.createObjectURL(file), img = new Image();
        img.onload = function () {
          drawThumb(img, img.naturalWidth, img.naturalHeight).then(function (blob) {
            URL.revokeObjectURL(url); resolve({ blob: blob, w: img.naturalWidth, h: img.naturalHeight });
          });
        };
        img.onerror = function () { URL.revokeObjectURL(url); resolve({}); };
        img.src = url;
      });
    });
  }

  function videoThumb(file) {
    return new Promise(function (resolve) {
      var url = URL.createObjectURL(file), v = document.createElement("video"), settled = false;
      var finish = function (out) { if (settled) return; settled = true; clearTimeout(timer); v.removeAttribute("src"); try { v.load(); } catch (e) {} URL.revokeObjectURL(url); resolve(out || {}); };
      var timer = setTimeout(function () { finish({}); }, 12000);
      v.muted = true; v.playsInline = true; v.preload = "auto";
      v.onloadeddata = function () { try { v.currentTime = Math.min(1, (v.duration || 2) / 2); } catch (e) { finish({}); } };
      v.onseeked = function () {
        if (!v.videoWidth) return finish({});
        drawThumb(v, v.videoWidth, v.videoHeight).then(function (blob) {
          finish({ blob: blob, w: v.videoWidth, h: v.videoHeight, dur: Math.round(v.duration || 0) });
        }, function () { finish({}); });
      };
      v.onerror = function () { finish({}); };
      v.src = url;
    });
  }

  /* ───────────── the list on screen ───────────── */

  function addRow(it) {
    var li = document.createElement("li");
    li.className = "q-item is-wait";
    li.innerHTML = '<span class="q-thumb' + (it.kind === "video" ? " is-video" : "") + '">' + (ICON[it.kind] || ICON.image) + "</span>" +
      '<span class="q-main"><span class="q-name">' + esc(it.file.name) + '</span><span class="q-sub"></span>' +
      '<span class="q-bar"><span></span></span></span><span class="q-state"></span>';
    it.el = li; it.subEl = li.querySelector(".q-sub"); it.barEl = li.querySelector(".q-bar span");
    it.stateEl = li.querySelector(".q-state"); it.thumbEl = li.querySelector(".q-thumb");
    queueEl.appendChild(li);
    paint(it);
  }

  function paint(it) {
    var li = it.el, size = fmt(it.file.size);
    li.className = "q-item is-" + it.status;
    if (it.status === "wait") { it.subEl.textContent = size + " · waiting"; it.stateEl.innerHTML = ICON.wait; }
    else if (it.status === "up") {
      var pct = it.file.size ? Math.min(100, Math.round(100 * it.sent / it.file.size)) : 0;
      it.subEl.textContent = size + " · " + (it.note || pct + "%");
      it.barEl.style.width = pct + "%";
      if (!it.stateEl.querySelector(".q-spin")) it.stateEl.innerHTML = '<span class="q-spin"></span>';
    }
    else if (it.status === "done") { it.subEl.textContent = size + " · uploaded"; it.stateEl.innerHTML = ICON.done; }
    else if (it.status === "skip") { it.subEl.textContent = size + " · already uploaded"; it.stateEl.innerHTML = ICON.done; }
    else if (it.status === "fail") {
      it.subEl.textContent = it.error || "Couldn’t upload";
      it.stateEl.innerHTML = it.canRetry ? '<button type="button" class="q-retry">Retry</button>' : ICON.fail;
      var btn = it.stateEl.querySelector(".q-retry");
      if (btn) btn.onclick = function () { it.status = "wait"; it.error = ""; it.sent = sentSoFar(it); paint(it); pump(); };
    }
  }

  function sentSoFar(it) {
    var rec = store[it.fp]; if (!rec || !rec.parts) return 0;
    return Math.min(it.file.size, Object.keys(rec.parts).length * (rec.partSize || partSize));
  }

  function paintSummary() {
    var rejected = items.filter(function (it) { return it.status === "fail" && !it.canRetry; }).length;   // not a photo/video, too big…
    var mine = items.filter(function (it) { return it.status !== "skip" && !(it.status === "fail" && !it.canRetry); });
    var done = mine.filter(function (it) { return it.status === "done"; }).length;
    var failed = mine.filter(function (it) { return it.status === "fail"; }).length;
    var active = mine.filter(function (it) { return it.status === "wait" || it.status === "up"; }).length;
    var total = mine.reduce(function (n, it) { return n + it.file.size; }, 0);
    var sent = mine.reduce(function (n, it) { return n + (it.status === "done" ? it.file.size : Math.min(it.sent || 0, it.file.size)); }, 0);
    var box = $("summary");
    if (!items.length) { box.hidden = true; return; }
    box.hidden = false;
    $("summary-fill").style.width = (total ? Math.round(100 * sent / total) : 100) + "%";
    var text = active
      ? done + " of " + mine.length + " uploaded · " + fmt(sent) + " of " + fmt(total)
      : (mine.length ? done + " of " + mine.length + " uploaded" : "These were already uploaded from this phone.");
    if (failed) text += " · " + failed + " didn’t go through";
    if (rejected) text += " · " + rejected + " couldn’t be added";
    $("summary-text").textContent = text;

    var fine = $("fine");
    if (active) { fine.textContent = "Uploading… please keep this page open and your screen on."; fine.className = "fine is-warn"; }
    else { fine.textContent = "Pick as many as you like. Please keep this page open until everything shows a tick."; fine.className = "fine"; }

    var thanks = $("thanks");
    var finished = !active && items.some(function (it) { return it.status === "done" || it.status === "skip"; });
    if (finished) {
      var ok = items.filter(function (it) { return it.status === "done" || it.status === "skip"; });
      var p = ok.filter(function (it) { return it.kind === "image"; }).length, v = ok.length - p, bits = [];
      if (p) bits.push(plural(p, "photo", "photos")); if (v) bits.push(plural(v, "video", "videos"));
      $("thanks-text").textContent = bits.join(" and ") + " shared" + (failed ? ". Tap Retry on the ones that didn’t go through." : ". You can add more any time.");
      thanks.hidden = false;
      $("pick-label").textContent = "Add more";
      pick.classList.add("is-quiet");
    } else {
      thanks.hidden = true;
    }
  }

  /* ───────────── uploading one file ───────────── */

  async function uploadOne(it) {
    it.status = "up"; it.note = "preparing…"; it.sent = sentSoFar(it); paint(it);

    var thumb = await (it.kind === "video" ? videoThumb(it.file) : imageThumb(it.file)).catch(function () { return {}; });
    if (thumb.blob) {
      it.thumbUrl = URL.createObjectURL(thumb.blob);
      it.thumbEl.style.backgroundImage = 'url("' + it.thumbUrl + '")';
      it.thumbEl.classList.add("has-img");
    }

    for (var attempt = 0; attempt < 2; attempt++) {
      try {
        var rec = store[it.fp];
        if (!rec || rec.done) {
          var started = await withRetry(function () {
            return api("start", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({
              name: it.file.name, size: it.file.size, type: it.file.type, uploader: who.value.trim(),
              taken: it.file.lastModified || 0, w: thumb.w || 0, h: thumb.h || 0, dur: thumb.dur || 0 }) });
          });
          rec = store[it.fp] = { id: started.id, key: started.key, uploadId: started.uploadId, partSize: started.partSize, parts: {}, at: Date.now() };
          saveStore();
        }
        it.note = ""; paint(it);
        await sendPieces(it, rec);
        await withRetry(function () {
          return api("complete", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({
            key: rec.key, uploadId: rec.uploadId,
            parts: Object.keys(rec.parts).map(function (n) { return { partNumber: +n, etag: rec.parts[n] }; }) }) });
        });
        store[it.fp] = { done: true, id: rec.id, at: Date.now() }; saveStore();
        if (thumb.blob) {       // the preview is a nice-to-have: never fail the upload over it
          try { await withRetry(function () { return api("thumb?id=" + rec.id, { method: "PUT", body: thumb.blob }); }); } catch (e) {}
        }
        it.status = "done"; it.sent = it.file.size; paint(it);
        return;
      } catch (err) {
        if (err.code === "upload-gone" && attempt === 0) { delete store[it.fp]; saveStore(); it.sent = 0; continue; }   // start this file again
        it.status = "fail";
        it.canRetry = ["closed", "full", "too-big", "not-media", "empty"].indexOf(err.code) === -1;
        it.error = err.code === "network" ? "No connection. Tap Retry when you’re back online." : (err.message || "Couldn’t upload");
        paint(it);
        return;
      }
    }
  }

  function sendPieces(it, rec) {
    var size = it.file.size, ps = rec.partSize, count = Math.max(1, Math.ceil(size / ps));
    var todo = [], inFlight = {};
    for (var n = 1; n <= count; n++) if (!rec.parts[n]) todo.push(n);
    var base = (count - todo.length) * ps;
    var report = function () {
      var extra = 0; Object.keys(inFlight).forEach(function (k) { extra += inFlight[k]; });
      it.sent = Math.min(size, base + extra); paint(it); paintSummary();
    };
    var failed = null;
    async function worker() {
      while (todo.length && !failed) {
        var n = todo.shift(), blob = it.file.slice((n - 1) * ps, Math.min(size, n * ps));
        await takePiece();
        try {
          var res = await withRetry(function () {
            inFlight[n] = 0;
            return putPiece(API + "part?key=" + encodeURIComponent(rec.key) + "&uploadId=" + encodeURIComponent(rec.uploadId) + "&n=" + n, blob,
              function (loaded) { inFlight[n] = loaded; report(); });
          });
          rec.parts[n] = res.etag; rec.at = Date.now(); saveStore();
          delete inFlight[n]; base += blob.size; report();
        } catch (err) { failed = err; delete inFlight[n]; }
        finally { releasePiece(); }
      }
    }
    var workers = [];
    for (var w = 0; w < Math.min(3, todo.length); w++) workers.push(worker());
    return Promise.all(workers).then(function () { if (failed) throw failed; });
  }

  /* ───────────── the queue ───────────── */

  function pump() {
    paintSummary();
    while (running < FILES_AT_ONCE) {
      var next = items.filter(function (it) { return it.status === "wait"; })[0];
      if (!next) break;
      running++;
      next.status = "up";
      (function (it) {
        uploadOne(it).catch(function () { it.status = "fail"; it.canRetry = true; it.error = "Couldn’t upload"; paint(it); })
          .then(function () { running--; pump(); });
      })(next);
    }
    var busy = items.some(function (it) { return it.status === "wait" || it.status === "up"; });
    keepAwake(busy);
    window.onbeforeunload = busy ? function (e) { e.preventDefault(); e.returnValue = ""; return ""; } : null;
  }

  function addFiles(list) {
    var files = Array.prototype.slice.call(list || []);
    if (!files.length) return;
    try { localStorage.setItem("rm-photos-name", who.value.trim()); } catch (e) {}
    files.forEach(function (f) {
      var fp = f.name + "|" + f.size + "|" + (f.lastModified || 0);
      if (items.some(function (it) { return it.fp === fp && it.status !== "fail"; })) return;      // picked twice
      var it = { file: f, fp: fp, kind: kindOf(f), status: "wait", sent: 0, canRetry: true };
      if (!it.kind) { it.kind = "image"; it.status = "fail"; it.canRetry = false; it.error = "Not a photo or video"; }
      else if (f.size > maxFile) { it.status = "fail"; it.canRetry = false; it.error = "Larger than " + fmt(maxFile) + " — too big to upload here"; }
      else if (!f.size) { it.status = "fail"; it.canRetry = false; it.error = "This file is empty"; }
      else if (store[fp] && store[fp].done) it.status = "skip";
      items.push(it); addRow(it);
    });
    pump();
    var first = items.filter(function (it) { return it.status === "wait" || it.status === "up"; })[0];
    if (first && first.el.scrollIntoView) $("summary").scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  function keepAwake(on) {
    if (!("wakeLock" in navigator)) return;
    if (on && !wakeLock) navigator.wakeLock.request("screen").then(function (l) { wakeLock = l; l.addEventListener("release", function () { wakeLock = null; }); }).catch(function () {});
    if (!on && wakeLock) { wakeLock.release().catch(function () {}); wakeLock = null; }
  }
  document.addEventListener("visibilitychange", function () {
    if (document.visibilityState === "visible" && items.some(function (it) { return it.status === "up" || it.status === "wait"; })) keepAwake(true);
  });

  /* ───────────── start ───────────── */

  picker.addEventListener("change", function () { addFiles(picker.files); picker.value = ""; });
  ["dragenter", "dragover"].forEach(function (ev) { pick.addEventListener(ev, function (e) { e.preventDefault(); pick.classList.add("is-drop"); }); });
  ["dragleave", "drop"].forEach(function (ev) { pick.addEventListener(ev, function (e) { e.preventDefault(); pick.classList.remove("is-drop"); }); });
  pick.addEventListener("drop", function (e) { if (e.dataTransfer) addFiles(e.dataTransfer.files); });
  try { who.value = localStorage.getItem("rm-photos-name") || ""; } catch (e) {}

  function boot() {
    var state = $("state");
    state.textContent = "One moment…";
    api("status").then(function (s) {
      partSize = s.partSize || partSize; maxFile = s.maxFile || maxFile;
      if (s.galleryOpen) $("soon").innerHTML = 'The gallery is open. <a href="/photos/gallery">See all the photos</a>';
      if (!s.uploadsOpen) { state.textContent = "Uploads are now closed. Thank you to everyone who shared their photos!"; return; }
      state.hidden = true; $("uploader").hidden = false;
    }).catch(function (err) {
      if (err.code === "storage-not-connected") { state.textContent = "Photo sharing isn’t open yet. Please check back soon."; return; }
      state.innerHTML = 'Couldn’t connect. <button type="button" class="link-btn" id="again">Try again</button>';
      $("again").onclick = boot;
    });
  }
  boot();
})();
