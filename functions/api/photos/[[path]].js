/*
 * Photo & video sharing API for /photos — runs as a Cloudflare Pages Function.
 * Storage: the R2 bucket bound as PHOTOS.  Private page: the secret in ADMIN_KEY.
 *
 *   orig/<id>.<ext>   the original file, untouched (details kept as metadata on the file)
 *   thumb/<id>.jpg    small preview made in the guest's browser
 *   meta/settings.json   { uploadsOpen, galleryOpen }
 *
 * Guests upload in pieces ("parts") so large videos work and a dropped connection only repeats one piece.
 */

const PART_SIZE = 10 * 1024 * 1024;            // 10 MB pieces
const MAX_FILE = 2 * 1024 ** 3;                // 2 GB per file
const MAX_TOTAL = 60 * 1024 ** 3;              // 60 GB for everything — safety cap against surprise bills
const MAX_THUMB = 600 * 1024;
const IMAGE_EXT = ["jpg", "jpeg", "png", "heic", "heif", "webp", "gif", "avif"];
const VIDEO_EXT = ["mp4", "mov", "m4v", "webm", "3gp", "avi", "mkv"];
// The stored type always comes from this list, never from the uploader, so nothing can pose as a web page.
const MIME = {
  jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", heic: "image/heic", heif: "image/heif", webp: "image/webp",
  gif: "image/gif", avif: "image/avif", mp4: "video/mp4", mov: "video/quicktime", m4v: "video/x-m4v", webm: "video/webm",
  "3gp": "video/3gpp", avi: "video/x-msvideo", mkv: "video/x-matroska"
};
const KEY_RE = /^orig\/[a-z0-9]{8,40}\.[a-z0-9]{2,5}$/;
const ID_RE = /^[a-z0-9]{8,40}$/;
const DEFAULT_SETTINGS = { uploadsOpen: true, galleryOpen: false };

const json = (data, status = 200) => new Response(JSON.stringify(data), {
  status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" }
});
const fail = (status, error, message) => json({ error, message }, status);
const enc = (s, max) => encodeURIComponent(String(s == null ? "" : s).slice(0, max));
const dec = (s) => { try { return decodeURIComponent(s || ""); } catch (e) { return s || ""; } };

async function getSettings(env) {
  const obj = await env.PHOTOS.get("meta/settings.json");
  if (!obj) return { ...DEFAULT_SETTINGS };
  try { return { ...DEFAULT_SETTINGS, ...(await obj.json()) }; } catch (e) { return { ...DEFAULT_SETTINGS }; }
}

async function listAll(env, prefix, withMeta) {
  const out = []; let cursor;
  do {
    const page = await env.PHOTOS.list({ prefix, cursor, limit: 1000, include: withMeta ? ["customMetadata", "httpMetadata"] : undefined });
    out.push(...page.objects);
    cursor = page.truncated ? page.cursor : undefined;
  } while (cursor);
  return out;
}

function isAdmin(request, env, url) {
  const want = env.ADMIN_KEY;
  if (!want || want.length < 8) return false;
  const got = request.headers.get("x-admin-key") || url.searchParams.get("k") || "";
  if (got.length !== want.length) return false;
  let diff = 0;
  for (let i = 0; i < want.length; i++) diff |= want.charCodeAt(i) ^ got.charCodeAt(i);
  return diff === 0;
}

function describe(o) {
  const m = o.customMetadata || {};
  const id = o.key.slice(5).replace(/\.[^.]+$/, "");
  return {
    id, key: o.key, size: o.size, uploaded: o.uploaded,
    kind: m.kind || "image", name: dec(m.name), uploader: dec(m.uploader),
    taken: +m.taken || 0, w: +m.w || 0, h: +m.h || 0, dur: +m.dur || 0,
    type: (o.httpMetadata && o.httpMetadata.contentType) || ""
  };
}

// "bytes=100-199", "bytes=100-" or "bytes=-500" → { offset, length } within a file of `size` bytes
function parseRange(header, size) {
  const m = /^bytes=(\d*)-(\d*)$/.exec((header || "").trim());
  if (!m || (m[1] === "" && m[2] === "")) return null;
  let start, end;
  if (m[1] === "") { start = Math.max(0, size - +m[2]); end = size - 1; }
  else { start = +m[1]; end = m[2] === "" ? size - 1 : Math.min(+m[2], size - 1); }
  if (!(start <= end) || start >= size) return "unsatisfiable";
  return { offset: start, length: end - start + 1 };
}

async function serveFile(request, env, key, downloadName) {
  const head = await env.PHOTOS.head(key);
  if (!head) return fail(404, "not-found", "File not found.");
  const h = new Headers();
  head.writeHttpMetadata(h);
  h.set("etag", head.httpEtag);
  h.set("accept-ranges", "bytes");
  h.set("x-content-type-options", "nosniff");
  h.set("content-security-policy", "default-src 'none'; sandbox");
  h.set("cache-control", "private, max-age=3600");
  if (downloadName) h.set("content-disposition", "attachment; filename*=UTF-8''" + encodeURIComponent(downloadName));
  if (request.headers.get("if-none-match") === head.httpEtag) return new Response(null, { status: 304, headers: h });

  const range = parseRange(request.headers.get("range"), head.size);
  if (range === "unsatisfiable") {
    h.set("content-range", "bytes */" + head.size);
    return new Response(null, { status: 416, headers: h });
  }
  const obj = await env.PHOTOS.get(key, range ? { range } : undefined);
  if (!obj) return fail(404, "not-found", "File not found.");
  if (range) {
    h.set("content-range", "bytes " + range.offset + "-" + (range.offset + range.length - 1) + "/" + head.size);
    h.set("content-length", String(range.length));
    return new Response(obj.body, { status: 206, headers: h });
  }
  h.set("content-length", String(head.size));
  return new Response(obj.body, { status: 200, headers: h });
}

export async function onRequest({ request, env, params }) {
  const url = new URL(request.url);
  const route = [].concat(params.path || []).join("/");
  const method = request.method;
  if (!env.PHOTOS) return fail(503, "storage-not-connected", "Photo storage is not connected yet.");

  try {
    /* ───────── public: state of the page ───────── */
    if (route === "status" && method === "GET") {
      const s = await getSettings(env);
      return json({ uploadsOpen: !!s.uploadsOpen, galleryOpen: !!s.galleryOpen, partSize: PART_SIZE, maxFile: MAX_FILE });
    }

    /* ───────── public: uploading ───────── */
    if (route === "start" && method === "POST") {
      const s = await getSettings(env);
      if (!s.uploadsOpen) return fail(403, "closed", "Uploads are closed.");
      const b = await request.json().catch(() => null);
      if (!b || typeof b.name !== "string") return fail(400, "bad-request", "Missing file details.");
      const size = +b.size;
      if (!(size > 0)) return fail(400, "empty", "This file is empty.");
      if (size > MAX_FILE) return fail(413, "too-big", "This file is larger than 2 GB.");
      const ext = (b.name.split(".").pop() || "").toLowerCase().replace(/[^a-z0-9]/g, "");
      const type = String(b.type || "").toLowerCase();
      const kind = type.indexOf("video/") === 0 || VIDEO_EXT.indexOf(ext) !== -1 ? "video"
                 : type.indexOf("image/") === 0 || IMAGE_EXT.indexOf(ext) !== -1 ? "image" : null;
      if (!kind) return fail(415, "not-media", "Only photos and videos can be shared here.");
      const safeExt = (kind === "video" ? VIDEO_EXT : IMAGE_EXT).indexOf(ext) !== -1 ? ext : (kind === "video" ? "mp4" : "jpg");

      const used = (await listAll(env, "orig/", false)).reduce((n, o) => n + o.size, 0);
      if (used + size > MAX_TOTAL) return fail(507, "full", "The shared album is full. Please tell the couple.");

      const rand = [...crypto.getRandomValues(new Uint8Array(6))].map((v) => (v % 36).toString(36)).join("");
      const id = Date.now().toString(36) + rand;
      const key = "orig/" + id + "." + safeExt;
      const mpu = await env.PHOTOS.createMultipartUpload(key, {
        httpMetadata: { contentType: MIME[safeExt] },
        customMetadata: {
          kind, name: enc(b.name, 120), uploader: enc(b.uploader, 60),
          taken: String(+b.taken || 0), w: String(+b.w || 0), h: String(+b.h || 0), dur: String(+b.dur || 0)
        }
      });
      return json({ id, key, uploadId: mpu.uploadId, partSize: PART_SIZE });
    }

    if (route === "part" && method === "PUT") {
      const key = url.searchParams.get("key") || "", uploadId = url.searchParams.get("uploadId") || "";
      const n = +url.searchParams.get("n");
      if (!KEY_RE.test(key) || !uploadId || !(n >= 1 && n <= 400)) return fail(400, "bad-request", "Bad upload piece.");
      const len = +request.headers.get("content-length");
      if (!(len > 0) || len > PART_SIZE + 1024) return fail(413, "bad-size", "Upload piece has the wrong size.");
      const mpu = env.PHOTOS.resumeMultipartUpload(key, uploadId);
      try {
        const part = await mpu.uploadPart(n, request.body);
        return json({ partNumber: part.partNumber, etag: part.etag });
      } catch (e) {
        return fail(409, "upload-gone", "This upload has expired; it will restart.");
      }
    }

    if (route === "complete" && method === "POST") {
      const b = await request.json().catch(() => null);
      if (!b || !KEY_RE.test(b.key || "") || !b.uploadId || !Array.isArray(b.parts) || !b.parts.length) return fail(400, "bad-request", "Bad request.");
      const parts = b.parts.map((p) => ({ partNumber: +p.partNumber, etag: String(p.etag) })).sort((a, c) => a.partNumber - c.partNumber);
      const mpu = env.PHOTOS.resumeMultipartUpload(b.key, b.uploadId);
      try {
        const obj = await mpu.complete(parts);
        return json({ ok: true, size: obj.size });
      } catch (e) {
        const head = await env.PHOTOS.head(b.key);          // already completed by an earlier try?
        if (head) return json({ ok: true, size: head.size });
        return fail(409, "upload-gone", "This upload has expired; it will restart.");
      }
    }

    if (route === "abort" && method === "POST") {
      const b = await request.json().catch(() => null);
      if (b && KEY_RE.test(b.key || "") && b.uploadId) {
        try { await env.PHOTOS.resumeMultipartUpload(b.key, b.uploadId).abort(); } catch (e) {}
      }
      return json({ ok: true });
    }

    if (route === "thumb" && method === "PUT") {
      const id = url.searchParams.get("id") || "";
      if (!ID_RE.test(id)) return fail(400, "bad-request", "Bad request.");
      const len = +request.headers.get("content-length");
      if (!(len > 0) || len > MAX_THUMB) return fail(413, "bad-size", "Preview is too large.");
      const exists = (await listAll(env, "orig/" + id + ".", false)).length;
      if (!exists) return fail(404, "not-found", "Upload the file first.");
      await env.PHOTOS.put("thumb/" + id + ".jpg", request.body, { httpMetadata: { contentType: "image/jpeg" } });
      return json({ ok: true });
    }

    /* ───────── private page (needs the secret key) ───────── */
    if (route.indexOf("admin/") === 0) {
      if (!env.ADMIN_KEY) return fail(503, "no-admin-key", "The private page is not set up yet.");
      if (!isAdmin(request, env, url)) return fail(401, "unauthorized", "Wrong key.");
      const sub = route.slice(6);

      if (sub === "list" && method === "GET") {
        const [objs, thumbs, settings] = await Promise.all([listAll(env, "orig/", true), listAll(env, "thumb/", false), getSettings(env)]);
        const hasThumb = new Set(thumbs.map((t) => t.key.slice(6, -4)));
        const items = objs.map(describe).map((it) => ({ ...it, thumb: hasThumb.has(it.id) }))
          .sort((a, b) => new Date(b.uploaded) - new Date(a.uploaded));
        const used = items.reduce((n, it) => n + it.size, 0) + thumbs.reduce((n, t) => n + t.size, 0);
        return json({ items, used, maxTotal: MAX_TOTAL, settings });
      }

      if (sub === "file" && method === "GET") {
        const key = url.searchParams.get("key") || "";
        if (!KEY_RE.test(key) && !/^thumb\/[a-z0-9]{8,40}\.jpg$/.test(key)) return fail(400, "bad-request", "Bad request.");
        return serveFile(request, env, key, url.searchParams.get("dl") ? (url.searchParams.get("name") || key.split("/").pop()) : null);
      }

      if (sub === "delete" && method === "POST") {
        const b = await request.json().catch(() => null);
        const keys = (b && Array.isArray(b.keys) ? b.keys : []).filter((k) => KEY_RE.test(k));
        if (!keys.length) return fail(400, "bad-request", "Nothing to delete.");
        const all = keys.concat(keys.map((k) => "thumb/" + k.slice(5).replace(/\.[^.]+$/, "") + ".jpg"));
        await env.PHOTOS.delete(all);
        return json({ ok: true, deleted: keys.length });
      }

      if (sub === "settings" && method === "POST") {
        const b = (await request.json().catch(() => null)) || {};
        const cur = await getSettings(env);
        const next = {
          uploadsOpen: typeof b.uploadsOpen === "boolean" ? b.uploadsOpen : cur.uploadsOpen,
          galleryOpen: typeof b.galleryOpen === "boolean" ? b.galleryOpen : cur.galleryOpen
        };
        await env.PHOTOS.put("meta/settings.json", JSON.stringify(next), { httpMetadata: { contentType: "application/json" } });
        return json({ ok: true, settings: next });
      }
    }

    return fail(404, "not-found", "Not found.");
  } catch (e) {
    return fail(500, "server", String((e && e.message) || e));
  }
}
