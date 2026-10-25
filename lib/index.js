// src/host/config-store.ts
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

// src/shared/settings.ts
var DEFAULT_SETTINGS = {
  autoRead: false,
  engineUrl: "http://127.0.0.1:50021",
  allowRemote: false,
  speakerId: 2,
  speedScale: 1,
  pitchScale: 0,
  intonationScale: 1,
  volumeScale: 1,
  readCodeBlocks: false,
  showConnectionStatus: true
};
var RANGES = {
  speedScale: { min: 0.1, max: 5 },
  pitchScale: { min: -0.5, max: 0.5 },
  intonationScale: { min: 0, max: 3 },
  volumeScale: { min: 0, max: 3 }
};
var BOOLEAN_KEYS = ["autoRead", "allowRemote", "readCodeBlocks", "showConnectionStatus"];
var RANGE_KEYS = ["speedScale", "pitchScale", "intonationScale", "volumeScale"];
function validateSettings(input, base = DEFAULT_SETTINGS) {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    return { ok: false, errors: ["settings must be an object"] };
  }
  const src = input;
  const next = { ...base };
  const errors = [];
  for (const key of BOOLEAN_KEYS) {
    if (!(key in src)) continue;
    if (typeof src[key] !== "boolean") errors.push(`${key} must be a boolean`);
    else next[key] = src[key];
  }
  for (const key of RANGE_KEYS) {
    if (!(key in src)) continue;
    const v = src[key];
    const { min, max } = RANGES[key];
    if (typeof v !== "number" || !Number.isFinite(v) || v < min || v > max) {
      errors.push(`${key} must be a number between ${min} and ${max}`);
    } else next[key] = v;
  }
  if ("speakerId" in src) {
    const v = src["speakerId"];
    if (typeof v !== "number" || !Number.isInteger(v) || v < 0) errors.push("speakerId must be a non-negative integer");
    else next.speakerId = v;
  }
  if ("engineUrl" in src) {
    const v = src["engineUrl"];
    if (typeof v !== "string" || v.length === 0 || v.length > 2048) errors.push("engineUrl must be a non-empty string");
    else next.engineUrl = v.trim();
  }
  return errors.length > 0 ? { ok: false, errors } : { ok: true, value: next };
}

// src/host/config-store.ts
function resolveDshHome(env = process.env) {
  const configured = env["DSH_HOME"]?.trim();
  return configured ? configured : join(homedir(), ".dsh");
}
function settingsPath(home = resolveDshHome()) {
  return join(home, "dsh-voicevox-tts", "settings.json");
}
var ConfigStore = class {
  constructor(file = settingsPath()) {
    this.file = file;
  }
  file;
  current = DEFAULT_SETTINGS;
  get() {
    return this.current;
  }
  /** ファイルが無い・壊れている場合は初期値で起動する（DSH の起動は止めない）。 */
  async load() {
    try {
      const r = validateSettings(JSON.parse(await readFile(this.file, "utf8")));
      this.current = r.ok ? r.value : DEFAULT_SETTINGS;
    } catch {
      this.current = DEFAULT_SETTINGS;
    }
  }
  async save(next) {
    await mkdir(dirname(this.file), { recursive: true });
    const tmp = `${this.file}.${process.pid}.tmp`;
    await writeFile(tmp, JSON.stringify(next, null, 2), "utf8");
    await rename(tmp, this.file);
    this.current = next;
  }
};

// src/shared/url-policy.ts
var LOOPBACK = /* @__PURE__ */ new Set(["127.0.0.1", "localhost", "[::1]"]);
function isLoopbackHost(hostname) {
  return LOOPBACK.has(hostname.toLowerCase()) || /^127\.\d+\.\d+\.\d+$/.test(hostname);
}
function isBlockedRemote(hostname) {
  const h = hostname.toLowerCase();
  return /^169\.254\./.test(h) || h.startsWith("[fe80:") || h === "0.0.0.0" || h === "[::]";
}
function checkEngineUrl(raw, allowRemote) {
  let url;
  try {
    url = new URL(raw);
  } catch {
    return { ok: false, reason: "invalid-url" };
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return { ok: false, reason: "unsupported-protocol" };
  if (url.username !== "" || url.password !== "") return { ok: false, reason: "credentials-not-allowed" };
  if (isBlockedRemote(url.hostname)) return { ok: false, reason: "blocked-host" };
  if (isLoopbackHost(url.hostname)) return { ok: true, url };
  if (!allowRemote) return { ok: false, reason: "remote-not-allowed" };
  if (url.protocol !== "https:") return { ok: false, reason: "remote-requires-https" };
  return { ok: true, url };
}
function baseOf(url) {
  return `${url.protocol}//${url.host}${url.pathname.replace(/\/+$/, "")}`;
}

// src/voicevox/speakers.ts
function parseSpeakers(json) {
  if (!Array.isArray(json)) throw new Error("speakers response is not an array");
  const out = [];
  for (const item of json) {
    if (typeof item !== "object" || item === null) continue;
    const rec = item;
    if (typeof rec["name"] !== "string" || !Array.isArray(rec["styles"])) continue;
    const styles = [];
    for (const s of rec["styles"]) {
      if (typeof s !== "object" || s === null) continue;
      const st = s;
      if (typeof st["id"] === "number" && Number.isInteger(st["id"]) && typeof st["name"] === "string") {
        styles.push({ id: st["id"], name: st["name"] });
      }
    }
    if (styles.length === 0) continue;
    out.push({ uuid: typeof rec["speaker_uuid"] === "string" ? rec["speaker_uuid"] : "", name: rec["name"], styles });
  }
  return out;
}

// src/voicevox/provider.ts
var ProviderError = class extends Error {
  constructor(code, message, status) {
    super(message);
    this.code = code;
    this.status = status;
    this.name = "ProviderError";
  }
  code;
  status;
};
var DEFAULT_TIMEOUT_MS = 3e4;
var VoicevoxProvider = class {
  base;
  fetchImpl;
  timeoutMs;
  constructor(options) {
    this.base = options.baseUrl.replace(/\/+$/, "");
    this.fetchImpl = options.fetchImpl ?? ((...args) => fetch(...args));
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  }
  async request(path, init, signal) {
    const timeout = AbortSignal.timeout(this.timeoutMs);
    const combined = signal ? AbortSignal.any([signal, timeout]) : timeout;
    let res;
    try {
      res = await this.fetchImpl(this.base + path, { ...init, signal: combined });
    } catch (error) {
      if (signal?.aborted) throw new ProviderError("aborted", "request aborted");
      if (timeout.aborted) throw new ProviderError("timeout", `request timed out after ${this.timeoutMs}ms`);
      throw new ProviderError("unreachable", error instanceof Error ? error.message : "network error");
    }
    if (!res.ok) throw new ProviderError("http", `VOICEVOX responded with HTTP ${res.status}`, res.status);
    return res;
  }
  async version(signal) {
    const res = await this.request("/version", { method: "GET" }, signal);
    const text = (await res.text()).trim();
    return text.replace(/^"|"$/g, "");
  }
  async speakers(signal) {
    const res = await this.request("/speakers", { method: "GET" }, signal);
    try {
      return parseSpeakers(await res.json());
    } catch (error) {
      throw new ProviderError("bad-response", error instanceof Error ? error.message : "invalid speakers response");
    }
  }
  /** audio_query → パラメータ反映 → synthesis。WAV のバイト列を返す。 */
  async synthesize(text, params, signal) {
    const q = await this.request(
      `/audio_query?speaker=${encodeURIComponent(String(params.speakerId))}&text=${encodeURIComponent(text)}`,
      { method: "POST" },
      signal
    );
    let query;
    try {
      query = await q.json();
    } catch {
      throw new ProviderError("bad-response", "audio_query returned invalid JSON");
    }
    query["speedScale"] = params.speedScale;
    query["pitchScale"] = params.pitchScale;
    query["intonationScale"] = params.intonationScale;
    query["volumeScale"] = params.volumeScale;
    const s = await this.request(
      `/synthesis?speaker=${encodeURIComponent(String(params.speakerId))}`,
      { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(query) },
      signal
    );
    return new Uint8Array(await s.arrayBuffer());
  }
};

// src/host/guard.ts
function trustedHostsFrom(argv, env) {
  const out = /* @__PURE__ */ new Set();
  argv.forEach((arg, i) => {
    if (arg === "--trusted-host" && argv[i + 1]) out.add(argv[i + 1]);
    else if (arg.startsWith("--trusted-host=")) out.add(arg.slice("--trusted-host=".length));
  });
  for (const h of (env["DSH_VOICEVOX_TRUSTED_HOSTS"] ?? "").split(",")) if (h.trim()) out.add(h.trim());
  return out;
}
function headerOf(req, name2) {
  const v = req.headers[name2];
  return Array.isArray(v) ? v[0] : v;
}
function checkRequest(req, trusted = /* @__PURE__ */ new Set()) {
  if (headerOf(req, "sec-fetch-site") === "cross-site") return { ok: false, status: 403, error: "cross-site request rejected" };
  const origin = headerOf(req, "origin");
  if (origin !== void 0) {
    let host;
    try {
      host = new URL(origin);
    } catch {
      return { ok: false, status: 403, error: "invalid origin" };
    }
    if (!isLoopbackHost(host.hostname) && !trusted.has(host.host)) return { ok: false, status: 403, error: "origin is not loopback or trusted" };
    if (host.host !== headerOf(req, "host")) return { ok: false, status: 403, error: "origin does not match host" };
  }
  if (req.method === "POST" && !(headerOf(req, "content-type") ?? "").toLowerCase().startsWith("application/json")) {
    return { ok: false, status: 415, error: "content-type must be application/json" };
  }
  return { ok: true };
}

// src/host/routes.ts
var ROUTE_PREFIX = "/dsh-voicevox-api";
var MAX_BODY = 64 * 1024;
var MAX_TEXT = 2e3;
function send(res, status, body) {
  const json = JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff"
  });
  res.end(json);
}
async function readJson(req) {
  let size = 0;
  const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY) throw new RangeError("body too large");
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}
function statusOf(error) {
  if (error instanceof ProviderError) {
    const status = error.code === "timeout" ? 504 : error.code === "http" ? 502 : error.code === "unreachable" ? 503 : 502;
    return { status, message: `${error.code}: ${error.message}` };
  }
  if (error instanceof RangeError) return { status: 413, message: error.message };
  if (error instanceof SyntaxError) return { status: 400, message: "invalid JSON" };
  return { status: 500, message: "internal error" };
}
function createHandler(store, fetchImpl, trusted = trustedHostsFrom(process.argv, process.env)) {
  const providerFor = () => {
    const s = store.get();
    const policy = checkEngineUrl(s.engineUrl, s.allowRemote);
    if (!policy.ok) throw new ProviderError("unreachable", `engine URL rejected: ${policy.reason}`);
    return new VoicevoxProvider({ baseUrl: baseOf(policy.url), ...fetchImpl ? { fetchImpl } : {} });
  };
  return async function handle(req, res) {
    const guard = checkRequest(req, trusted);
    if (!guard.ok) return send(res, guard.status, { error: guard.error });
    const path = (req.url ?? "").split("?")[0]?.slice(ROUTE_PREFIX.length) ?? "";
    try {
      if (path === "/settings" && req.method === "GET") return send(res, 200, store.get());
      if (path === "/settings" && req.method === "POST") {
        const r = validateSettings(await readJson(req), store.get());
        if (!r.ok) return send(res, 400, { errors: r.errors });
        const policy = checkEngineUrl(r.value.engineUrl, r.value.allowRemote);
        if (!policy.ok) return send(res, 400, { errors: [`engineUrl: ${policy.reason}`] });
        await store.save(r.value);
        return send(res, 200, { settings: r.value });
      }
      if (path === "/status" && req.method === "GET") {
        const provider = providerFor();
        const [version, speakers] = await Promise.all([provider.version(), provider.speakers()]);
        return send(res, 200, { version, speakers });
      }
      if (path === "/synthesize" && req.method === "POST") {
        const body = await readJson(req);
        if (typeof body.text !== "string" || body.text.trim() === "" || body.text.length > MAX_TEXT) {
          return send(res, 400, { error: `text must be 1-${MAX_TEXT} characters` });
        }
        const s = store.get();
        const speakerId = Number.isInteger(body.speakerId) && body.speakerId >= 0 ? body.speakerId : s.speakerId;
        const wav = await providerFor().synthesize(body.text, { ...s, speakerId });
        res.writeHead(200, { "Content-Type": "audio/wav", "Content-Length": wav.length, "Cache-Control": "no-store" });
        res.end(wav);
        return;
      }
      send(res, 404, { error: "not found" });
    } catch (error) {
      const { status, message } = statusOf(error);
      if (!res.headersSent) send(res, status, { error: message });
      else res.end();
    }
  };
}

// src/host/index.ts
var name = "dsh-voicevox-tts";
var inject = ["webServer"];
async function apply(ctx) {
  const webServer = ctx.get("webServer");
  if (!webServer) return;
  const store = new ConfigStore();
  await store.load();
  const handle = createHandler(store);
  ctx.effect(
    () => webServer.register({ kind: "prefix", path: ROUTE_PREFIX, handler: handle }),
    "dsh-voicevox-tts: api routes"
  );
}
export {
  apply,
  inject,
  name
};
