/* Compiled into the native Ark runtime, NEVER served to ArkWeb. Secrets only cross NativePort. */
(function (root, factory) {
  if (typeof module === "object" && module.exports)
    module.exports = factory(require("./school.js"));
  else root.KetimeHarmonyRuntime = factory(root.KetimeHarmonySchool);
})(typeof globalThis !== "undefined" ? globalThis : this, function (School) {
  "use strict";
  const error = (message, code = "REQUEST_FAILED", status = 400) =>
    Object.assign(new Error(message), { safe: true, code, status });
  const object = (x) =>
    x !== null && typeof x === "object" && !Array.isArray(x);
  const keys = (x, fields) =>
    object(x) &&
    Object.keys(x).sort().join("|") === [...fields].sort().join("|");
  const text = (v, n, empty = false) => {
    if (typeof v !== "string" || v.length > n || (!empty && !v.trim()))
      throw error("信息格式无效。", "ASSISTANT_INVALID");
    return v.trim();
  };
  const date = (v) => {
    if (!School.validDate(v)) throw error("日期无效。", "ASSISTANT_INVALID");
    return v;
  };
  const effortOrder = [
    "none",
    "minimal",
    "low",
    "medium",
    "high",
    "xhigh",
    "max",
  ];
  const fields = [
    "name",
    "date",
    "start",
    "end",
    "repeat",
    "endDate",
    "location",
    "notes",
    "color",
    "projectId",
    "nodeId",
  ];
  function input(payload) {
    if (
      !object(payload) ||
      !Array.isArray(payload.messages) ||
      payload.messages.length < 1 ||
      payload.messages.length > 24 ||
      !object(payload.context)
    )
      throw error("对话过长或格式无效，请开启新对话。", "ASSISTANT_INVALID");
    const messages = payload.messages.map((m) => {
      if (!object(m) || !["user", "assistant"].includes(m.role))
        throw error("对话格式无效。");
      return { role: m.role, content: text(m.content, 6000) };
    });
    if (
      messages[messages.length - 1].role !== "user" ||
      messages.reduce((n, m) => n + m.content.length, 0) > 24000
    )
      throw error("对话过长，请开启新对话。");
    const c = payload.context,
      today = date(c.today),
      now = text(c.now, 40);
    if (
      !/^\d{4}-\d\d-\d\dT\d\d:\d\d/.test(now) ||
      !Number.isFinite(Date.parse(now)) ||
      now.slice(0, 10) !== today
    )
      throw error("本地日期时间无效，请刷新页面。");
    const source = c.projects || [];
    if (!Array.isArray(source) || source.length > 100)
      throw error("最多支持100个项目。");
    const ids = new Set();
    let count = 0;
    const projects = source.map((p) => {
      if (!object(p) || !Array.isArray(p.nodes)) throw error("项目格式无效。");
      const id = text(p.id, 100),
        nodeIds = new Set();
      if (ids.has(id)) throw error("项目编号重复。");
      ids.add(id);
      const nodes = p.nodes.map((n) => {
        if (!object(n)) throw error("节点格式无效。");
        const nid = text(n.id, 100);
        if (nodeIds.has(nid)) throw error("节点编号重复。");
        nodeIds.add(nid);
        return { id: nid, name: text(n.name, 200) };
      });
      count += nodes.length;
      if (count > 300) throw error("最多支持300个项目节点。");
      return { id, name: text(p.name, 200), nodes };
    });
    const hints = new Map(),
      year = Number(today.slice(0, 4)),
      month = Number(today.slice(5, 7));
    for (const m of messages.filter((m) => m.role === "user"))
      for (const match of m.content.matchAll(
        /(?:(\d{4})年)?(\d{1,2})月(\d{1,2})[日号]/g,
      )) {
        const relative = m.content
          .slice(Math.max(0, match.index - 6), match.index)
          .match(/(今年|明年|去年)(?:的)?\s*$/);
        const y = match[1]
          ? Number(match[1])
          : year +
            (relative
              ? { 今年: 0, 明年: 1, 去年: -1 }[relative[1]]
              : month === 12 && Number(match[2]) === 1
                ? 1
                : 0);
        const actual = `${y}-${match[2].padStart(2, "0")}-${match[3].padStart(2, "0")}`;
        if (School.validDate(actual))
          hints.set(match[0], {
            text: match[0],
            date: actual,
            weekday: new Date(actual + "T12:00:00Z").getUTCDay() || 7,
          });
      }
    return {
      messages,
      context: {
        today,
        now,
        timezone: text(c.timezone, 80),
        weekday: new Date(today + "T12:00:00Z").getUTCDay() || 7,
        calendarHints: [...hints.values()].slice(0, 100),
        projects,
      },
    };
  }
  function output(result, context) {
    if (
      !keys(result, ["eventCount", "message", "events"]) ||
      !Array.isArray(result.events) ||
      result.events.length > 50 ||
      !Number.isInteger(result.eventCount) ||
      result.eventCount !== result.events.length
    )
      throw error("日程助手返回格式无效，未创建日程。", "ASSISTANT_INVALID");
    const message = text(result.message, 2000),
      projects = new Map(
        context.projects.map((p) => [p.id, new Set(p.nodes.map((n) => n.id))]),
      );
    const events = result.events.map((e) => {
      if (!keys(e, fields)) throw error("日程字段无效。", "ASSISTANT_INVALID");
      const r = {
        name: e.name === null ? null : text(e.name, 200),
        date: e.date === null ? null : date(e.date),
      };
      for (const k of ["start", "end"]) {
        if (
          e[k] !== null &&
          (typeof e[k] !== "string" ||
            !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(e[k]))
        )
          throw error("日程时间无效。");
        r[k] = e[k];
      }
      if (
        (r.start !== null && r.start === r.end) ||
        !["none", "daily", "weekly", "monthly"].includes(e.repeat)
      )
        throw error("日程起止或重复无效。");
      r.repeat = e.repeat;
      r.endDate = e.endDate === null ? null : date(e.endDate);
      if (r.endDate && (r.repeat === "none" || (r.date && r.endDate < r.date)))
        throw error("日程期限无效。");
      for (const [k, n] of [
        ["location", 300],
        ["notes", 2000],
      ])
        r[k] = e[k] === null ? "" : text(e[k], n, true);
      if (
        e.color !== null &&
        (typeof e.color !== "string" || !/^#[0-9a-f]{6}$/i.test(e.color))
      )
        throw error("日程颜色无效。");
      r.color = e.color;
      const p = e.projectId,
        n = e.nodeId;
      if (
        (p !== null && typeof p !== "string") ||
        (n !== null && typeof n !== "string") ||
        (p === null && n !== null) ||
        (p !== null &&
          (!projects.has(p) || (n !== null && !projects.get(p).has(n))))
      )
        throw error("项目关联无效。");
      return { ...r, projectId: p, nodeId: n };
    });
    events.sort(
      (a, b) =>
        (a.date || "9999-99-99").localeCompare(b.date || "9999-99-99") ||
        ((a.date ? a.start : null) || "99:99").localeCompare(
          (b.date ? b.start : null) || "99:99",
        ),
    );
    return { eventCount: events.length, message, events };
  }
  function modelEfforts(provider, id, row = {}) {
    if (provider === "kimi") {
      if (id === "kimi-k3") return ["low", "high", "max"];
      if (["kimi-k2.5", "kimi-k2.6"].includes(id)) return ["none", "auto"];
      if (id.includes("thinking") || id.startsWith("kimi-k2.7-code"))
        return ["auto"];
      if (id.startsWith("moonshot-") || id.startsWith("kimi-k2-"))
        return ["none"];
      return ["auto"];
    }
    if (provider === "minimax") {
      if (id === "MiniMax-M3.1-Flash-Preview")
        return ["low", "medium", "high", "xhigh", "max"];
      if (id === "MiniMax-M3") return ["none", "auto"];
      return ["auto"];
    }
    if (id === "deepseek-chat") return ["none"];
    if (id === "deepseek-reasoner") return ["auto"];
    const offered = row.effort?.supported_levels;
    const levels = Array.isArray(offered)
      ? [
          ...new Set(
            offered.filter(
              (x) =>
                typeof x === "string" &&
                effortOrder.includes(x) &&
                x !== "none",
            ),
          ),
        ]
      : [];
    if (!levels.length && ["deepseek-flash", "deepseek-v4-pro"].includes(id))
      levels.push("low", "high", "max");
    return ["none", ...levels];
  }
  function catalog(provider, result) {
    const source = provider === "chatgpt" ? result.models : result.data;
    if (!Array.isArray(source))
      throw error("模型目录无效，请更新模型。", "AI_MODELS", 502);
    const seen = new Set(),
      rows = [];
    for (const row of source.slice(0, 500)) {
      if (!object(row)) continue;
      const id = provider === "chatgpt" ? row.slug : row.id;
      const pattern = {
        chatgpt: /^gpt-(\d+(?:\.\d+)?)(?:-([a-z]+))?(?:-[a-zA-Z0-9.-]+)?$/,
        deepseek: /^deepseek-[A-Za-z0-9._-]{1,90}$/,
        kimi: /^(?:kimi-k|moonshot-v)[A-Za-z0-9._-]{1,90}$/,
        minimax: /^MiniMax-M\d[A-Za-z0-9._-]{0,90}$/,
      }[provider];
      if (
        typeof id !== "string" ||
        id.length > 120 ||
        !pattern.test(id) ||
        seen.has(id)
      )
        continue;
      let levels,
        extra = {};
      if (provider === "chatgpt") {
        if (
          row.visibility !== "list" ||
          row.supported_in_api === false ||
          !Array.isArray(row.input_modalities || ["text"]) ||
          !(row.input_modalities || ["text"]).includes("text")
        )
          continue;
        const [, version, series] = id.match(pattern),
          offered = row.supported_reasoning_levels;
        levels = Array.isArray(offered)
          ? effortOrder.filter((v) =>
              offered
                .map((x) => (typeof x === "string" ? x : x?.effort))
                .includes(v),
            )
          : [
                "5",
                "5.1",
                "5.2",
                "5.3",
                "5.4",
                "5.5",
                "5.6",
                "6",
                "6.0",
                "6.1",
              ].includes(version)
            ? ["low", "medium", "high"]
            : [];
        if (Array.isArray(offered) && offered.length && !levels.length)
          continue;
        extra = {
          provider: "GPT",
          version: version.includes(".") ? version : version + ".0",
          series: series ? series[0].toUpperCase() + series.slice(1) : "默认",
        };
        if (!levels.length) levels = ["auto"];
      } else {
        levels = modelEfforts(provider, id, row);
        if (provider === "deepseek") {
          const version = String(row.name || id).match(
            /deepseek[- ]?v(\d+(?:\.\d+)*)/i,
          );
          extra = {
            version: version ? version[1] : "DeepSeek",
            series: String(row.name || id).slice(0, 120),
          };
        }
      }
      const preferred =
        provider === "chatgpt" && levels.includes("low")
          ? "low"
          : provider === "chatgpt" &&
              levels.includes(row.default_reasoning_level)
            ? row.default_reasoning_level
            : levels[0];
      rows.push({
        id,
        name: String(row.display_name || row.name || id).slice(0, 200),
        ...extra,
        reasoningEfforts: levels,
        defaultReasoningEffort: preferred,
      });
      seen.add(id);
    }
    if (!rows.length)
      throw error(
        "账户没有可调用的文字模型，请核对授权或 API Key。",
        "AI_MODELS",
        502,
      );
    return rows;
  }
  function selection(data, model, effort) {
    model = model ?? data.selectedModel;
    const row = data.models.find((r) => r.id === model);
    effort =
      effort ??
      (model === data.selectedModel
        ? data.reasoningEffort
        : row?.defaultReasoningEffort);
    if (!row || !row.reasoningEfforts.includes(effort))
      throw error(
        "所选模型或强度不可用，请更新并保存；未改用其他模型。",
        "AI_SELECTION",
      );
    return { model, effort };
  }
  function stream(raw) {
    if (typeof raw !== "string" || raw.length > 2097152)
      throw error("回复流过大。", "CHATGPT_STREAM", 502);
    const chunks = [];
    let completed = false;
    for (const block of raw.split(/\r?\n\r?\n/)) {
      const line = block
        .split(/\r?\n/)
        .filter((s) => s.startsWith("data:"))
        .map((s) => s.slice(5).trimStart())
        .join("\n");
      if (!line || line === "[DONE]") continue;
      let d;
      try {
        d = JSON.parse(line);
      } catch (_) {
        throw error("回复流格式无效。", "CHATGPT_STREAM", 502);
      }
      if (d.type === "response.output_text.delta") {
        if (typeof d.delta !== "string") throw error("回复流文字无效。");
        chunks.push(d.delta);
      } else if (d.type === "response.completed") {
        if (d.response?.status && d.response.status !== "completed")
          throw error("模型未完成回复。");
        completed = true;
        if (!chunks.length)
          for (const item of d.response?.output || [])
            for (const p of item.content || [])
              if (p.type === "output_text" && typeof p.text === "string")
                chunks.push(p.text);
        break;
      } else if (
        ["response.failed", "response.incomplete", "error"].includes(d.type)
      )
        throw error(
          "OpenAI 未完成回复，请核对额度、授权或稍后重试。",
          "CHATGPT_INCOMPLETE",
          502,
        );
    }
    const reply = chunks.join("").trim();
    if (!completed || !reply)
      throw error("未收到完整文字回复。", "CHATGPT_INCOMPLETE", 502);
    return reply;
  }
  const B64 =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  function bytes64(text) {
    if (typeof text !== "string" || !/^[A-Za-z0-9+/_=-]+$/.test(text))
      throw error("身份密钥无效。", "CHATGPT_IDENTITY");
    text = text.replace(/-/g, "+").replace(/_/g, "/").replace(/=+$/, "");
    let acc = 0,
      bits = 0,
      out = [];
    for (const ch of text) {
      acc = (acc << 6) | B64.indexOf(ch);
      bits += 6;
      if (bits >= 8) {
        bits -= 8;
        out.push((acc >> bits) & 255);
      }
    }
    return out;
  }
  function base64(bytes) {
    let out = "";
    for (let n = 0; n < bytes.length; n += 3) {
      const a = bytes[n],
        b = bytes[n + 1],
        c = bytes[n + 2],
        v = (a << 16) | ((b || 0) << 8) | (c || 0);
      out +=
        B64[(v >>> 18) & 63] +
        B64[(v >>> 12) & 63] +
        (b === undefined ? "=" : B64[(v >>> 6) & 63]) +
        (c === undefined ? "=" : B64[v & 63]);
    }
    return out;
  }
  function der(tag, data) {
    const n = data.length,
      head = n < 128 ? [n] : n < 256 ? [129, n] : [130, n >>> 8, n & 255];
    return [tag, ...head, ...data];
  }
  function integer(value) {
    let v = [...value];
    while (v.length > 1 && v[0] === 0) v.shift();
    if (v[0] & 128) v.unshift(0);
    return der(2, v);
  }
  function publicKey(jwk, alg) {
    if (alg === "RS256") {
      const n = bytes64(jwk.n),
        e = bytes64(jwk.e),
        bits = n.length * 8;
      if (![2048, 3072, 4096, 8192].includes(bits) || !e.length || e.length > 8)
        throw error("RSA 公钥参数无效。", "CHATGPT_IDENTITY");
      const rsa = der(48, [...integer(n), ...integer(e)]);
      return {
        bits,
        spki: base64(
          der(48, [
            48,
            13,
            6,
            9,
            42,
            134,
            72,
            134,
            247,
            13,
            1,
            1,
            1,
            5,
            0,
            ...der(3, [0, ...rsa]),
          ]),
        ),
      };
    }
    const x = bytes64(jwk.x),
      y = bytes64(jwk.y);
    if (x.length !== 32 || y.length !== 32)
      throw error("EC 公钥参数无效。", "CHATGPT_IDENTITY");
    return {
      bits: 256,
      spki: base64(
        der(48, [
          48,
          19,
          6,
          7,
          42,
          134,
          72,
          206,
          61,
          2,
          1,
          6,
          8,
          42,
          134,
          72,
          206,
          61,
          3,
          1,
          7,
          ...der(3, [0, 4, ...x, ...y]),
        ]),
      ),
    };
  }
  const equal = (a, b) => {
    if (typeof a !== "string" || typeof b !== "string" || a.length !== b.length)
      return false;
    let n = 0;
    for (let i = 0; i < a.length; i++) n |= a.charCodeAt(i) ^ b.charCodeAt(i);
    return n === 0;
  };
  class Runtime {
    constructor(port, options = {}) {
      this.port = port;
      this.options = options;
      this.locks = new Set();
      this.modelCache = new Map();
      this.pending = null;
      this.lastError = "";
      this.lastSchool = new Map();
      this.school = School.client({
        request: (r) => this.http(r),
        digest: (algorithm, value) =>
          this.invoke("digest", { algorithm, value }),
        random: () => this.invoke("random", ""),
        now: () => this.now(),
      });
    }
    now() {
      const d = new Date();
      return (
        new Date(d.getTime() - d.getTimezoneOffset() * 60000)
          .toISOString()
          .slice(0, 19) +
        (d.getTimezoneOffset() <= 0 ? "+" : "-") +
        String(Math.floor(Math.abs(d.getTimezoneOffset()) / 60)).padStart(
          2,
          "0",
        ) +
        ":" +
        String(Math.abs(d.getTimezoneOffset()) % 60).padStart(2, "0")
      );
    }
    invoke(op, data) {
      return this.port.invoke(
        op,
        typeof data === "string" ? data : JSON.stringify(data),
      );
    }
    async read(name) {
      const value = await this.invoke("vault.read", { name });
      if (!value) return {};
      let data;
      try {
        data = JSON.parse(value);
      } catch (_) {
        throw error("本机凭据不可读取，原记录未修改。", "VAULT", 500);
      }
      if (!object(data))
        throw error("本机凭据结构无效，原记录未修改。", "VAULT", 500);
      return data;
    }
    async write(name, data) {
      await this.invoke("vault.write", { name, value: JSON.stringify(data) });
    }
    async http(request) {
      try {
        const r = JSON.parse(
          await this.invoke("http", { headers: {}, body: "", ...request }),
        );
        if (!Number.isInteger(r.status) || typeof r.body !== "string")
          throw new Error();
        return r;
      } catch (_) {
        throw error("无法连接官方服务，请检查网络后重试。", "NETWORK", 502);
      }
    }
    async json(address, key = null, payload = null, form = false) {
      const r = await this.http({
        url: address,
        method: payload === null ? "GET" : "POST",
        headers: {
          Accept: "application/json",
          ...(key ? { Authorization: "Bearer " + key } : {}),
          ...(payload !== null
            ? {
                "Content-Type": form
                  ? "application/x-www-form-urlencoded"
                  : "application/json",
              }
            : {}),
        },
        body:
          payload === null
            ? ""
            : form
              ? new URLSearchParams(payload).toString()
              : JSON.stringify(payload),
      });
      if (r.status < 200 || r.status >= 300)
        throw error(
          {
            400: "参数或模型不受支持，请更新模型。",
            401: "授权或 API Key 无效，请重新连接。",
            402: "账户余额不足。",
            403: "服务拒绝访问，请核对权限。",
            429: "请求频率或额度受限，请稍后重试。",
          }[r.status] || "官方服务请求未完成，请稍后重试。",
          "UPSTREAM_HTTP",
          502,
        );
      if (!r.body) return {};
      let data;
      try {
        data = JSON.parse(r.body);
      } catch (_) {
        throw error("服务返回格式无效。", "UPSTREAM_FORMAT", 502);
      }
      if (
        !object(data) ||
        data.error ||
        (data.base_resp && data.base_resp.status_code !== 0)
      )
        throw error(
          "服务拒绝请求，请核对账户、模型和额度。",
          "UPSTREAM_ERROR",
          502,
        );
      return data;
    }
    async status(provider) {
      const d =
        provider === "chatgpt"
          ? await this.chatVault()
          : await this.read(provider);
      if (provider !== "chatgpt")
        return {
          provider,
          connected: !!d.apiKey,
          hasKey: !!d.apiKey,
          encrypted: true,
          selectedModel: d.model || "",
          reasoningEffort: d.reasoningEffort || "",
        };
      if (this.pending && this.pending.expiresAt < Date.now()) {
        this.pending = null;
        this.lastError = "登录超时，请重新连接。";
      }
      const p = this.profile(d);
      return {
        connected: !!p?.access_token,
        email: p?.email || "",
        pending: !!this.pending,
        error: this.lastError,
        accounts: d.profiles.map((p) => ({
          id: p.client_id,
          email: p.email || "",
          active: p.client_id === d.active,
        })),
      };
    }
    async chatVault() {
      if (!this.chatLoading) this.chatLoading = this.readChatVault().then(JSON.stringify);
      const pending = this.chatLoading;
      try { return JSON.parse(await pending); } finally { if (this.chatLoading === pending) this.chatLoading = null; }
    }
    async readChatVault() {
      let d = await this.read("chatgpt");
      if (!Object.keys(d).length) {
        const random = await this.invoke("random", "");
        const hex = await this.invoke("digest", {
          algorithm: "SHA256",
          value: random,
        });
        d = {
          hostId:
            "urn:uuid:" +
            hex.slice(0, 8) +
            "-" +
            hex.slice(8, 12) +
            "-4" +
            hex.slice(13, 16) +
            "-a" +
            hex.slice(17, 20) +
            "-" +
            hex.slice(20, 32),
          profiles: [],
          active: "",
        };
        await this.write("chatgpt", d);
      }
      if (
        !Array.isArray(d.profiles) ||
        typeof d.hostId !== "string" ||
        !d.hostId.startsWith("urn:uuid:")
      )
        throw error("本机 ChatGPT 凭据格式无效，未覆盖原记录。", "VAULT");
      return d;
    }
    profile(d) {
      return d.profiles.find((p) => p.client_id === d.active);
    }
    tokenFields(d, previous = {}) {
      const scopes =
          typeof d.scope === "string"
            ? d.scope.split(/\s+/)
            : previous.scopes || [],
        expiry = Number(d.expires_in),
        access = d.access_token,
        refresh = d.refresh_token || previous.refresh_token;
      if (!scopes.includes("chatgpt.tokens.use.direct"))
        throw error(
          "请重新连接并授权使用 ChatGPT 套餐额度。",
          "CHATGPT_PERMISSION",
        );
      if (
        typeof access !== "string" ||
        !access ||
        typeof refresh !== "string" ||
        !refresh ||
        !Number.isFinite(expiry) ||
        expiry <= 0 ||
        String(d.token_type).toLowerCase() !== "bearer"
      )
        throw error("未返回完整有效授权，请重新连接。", "CHATGPT_TOKEN");
      return {
        access_token: access,
        refresh_token: refresh,
        scopes,
        expiresAt: Date.now() / 1000 + expiry,
      };
    }
    async access() {
      const d = await this.chatVault(),
        p = this.profile(d);
      if (!p?.access_token)
        throw error("请先连接 ChatGPT。", "CHATGPT_REQUIRED", 401);
      if (p.expiresAt <= Date.now() / 1000 + 60) {
        const result = await this.json(
          "https://auth.openai.com/api/accounts/oauth/token",
          null,
          {
            grant_type: "refresh_token",
            client_id: p.client_id,
            refresh_token: p.refresh_token,
            resource: "https://api.openai.com/v1",
          },
          true,
        );
        Object.assign(p, this.tokenFields(result, p));
        await this.write("chatgpt", d);
      }
      return p.access_token;
    }
    async models(provider, keyOverride, force = true) {
      const d =
          provider === "chatgpt"
            ? await this.chatVault()
            : await this.read(provider),
        key =
          keyOverride ||
          (provider === "chatgpt" ? await this.access() : d.apiKey);
      if (!key) throw error("请先连接所选模型提供方。", "AI_REQUIRED", 401);
      const base = {
          chatgpt: "https://api.openai.com/v1",
          deepseek: "https://api.deepseek.com",
          kimi: "https://api.moonshot.cn/v1",
          minimax: "https://api.minimax.cn/v1",
        }[provider],
        fingerprint = provider === 'chatgpt' ? await this.invoke('digest', { algorithm: 'SHA256', value: key }) : '',
        cacheKey = provider + ':' + (d.active || '') + ':' + fingerprint,
        cached = this.modelCache.get(provider),
        age = cached ? Date.now() - cached.created : Infinity,
        hit = provider === 'chatgpt' && !force && !keyOverride && cached && cached.key === cacheKey && age >= 0 && age < 300000;
      let rows;
      if (hit) rows = JSON.parse(JSON.stringify(cached.rows));
      else {
        this.modelCache.delete(provider);
        rows = catalog(provider, await this.json(base + "/models", key));
        if (provider === 'chatgpt') this.modelCache.set(provider, { key: cacheKey, created: Date.now(), rows: JSON.parse(JSON.stringify(rows)) });
      }
      const order = {
          chatgpt: ["gpt-6.1-sol", "gpt-6-sol", "gpt-5.6-sol"],
          deepseek: ["deepseek-flash", "deepseek-chat"],
          kimi: ["kimi-k2.6", "kimi-k2.5", "kimi-k3"],
          minimax: ["MiniMax-M3", "MiniMax-M2.7", "MiniMax-M2.5"],
        }[provider],
        preferred =
          order.map((id) => rows.find((r) => r.id === id)).find(Boolean) ||
          rows[0],
        saved =
          provider === "chatgpt" ? this.profile(d)?.inferenceConfig || {} : d,
        selected = keyOverride ? preferred.id : saved.model || preferred.id,
        row = rows.find((r) => r.id === selected),
        effort = keyOverride
          ? preferred.defaultReasoningEffort
          : saved.reasoningEffort || row?.defaultReasoningEffort || "low",
        valid = !!row && row.reasoningEfforts.includes(effort);
      return {
        provider,
        models: rows,
        selectedModel: selected,
        defaultModel: preferred.id,
        reasoningEffort: effort,
        selectionValid: valid,
        selectionWarning: valid ? "" : "已保存模型或强度不可用，请更新并保存。",
        catalogCacheHit: !!hit,
      };
    }
    async connect(provider, payload) {
      if (provider === "chatgpt")
        return this.begin(payload.newAccount === true);
      const key = text(payload.apiKey, provider === "deepseek" ? 256 : 4096);
      if (!/^[A-Za-z0-9._-]{16,4096}$/.test(key))
        throw error("请填写有效的通用 API Key。", "AI_INPUT");
      const models = await this.models(provider, key);
      await this.write(provider, {
        apiKey: key,
        model: models.selectedModel,
        reasoningEffort: models.reasoningEffort,
      });
      return { ...(await this.status(provider)), saved: true };
    }
    async begin(newAccount = false) {
      await this.invoke("oauth.listen", "");
      const d = await this.chatVault(),
        registration = newAccount ? null : d.registrationAttempt,
        p = newAccount || registration ? null : this.profile(d),
        client =
          registration?.client_id || p?.client_id || "dynamic_agent_client",
        verifier = await this.invoke("random", ""),
        state = await this.invoke("random", ""),
        nonce = await this.invoke("random", ""),
        hash = await this.invoke("digest", {
          algorithm: "SHA256",
          value: verifier,
        }),
        challenge = base64(hash.match(/../g).map((n) => parseInt(n, 16)))
          .replace(/\+/g, "-")
          .replace(/\//g, "_")
          .replace(/=+$/, "");
      const params = {
        client_id: client,
        ext_agent_host_id: d.hostId,
        redirect_uri: "http://127.0.0.1:8766/auth/callback",
        response_type: "code",
        scope:
          "openid profile email offline_access resource.invoke chatgpt.tokens.use.direct",
        resource: "https://api.openai.com/v1",
        state,
        nonce,
        code_challenge_method: "S256",
        code_challenge: challenge,
      };
      if (client === "dynamic_agent_client")
        params.agent_name_hint = "刻时 Ketime";
      this.pending = {
        state,
        nonce,
        verifier,
        client_id: client,
        subject: registration?.subject || p?.subject || null,
        expiresAt: Date.now() + 600000,
      };
      this.lastError = "";
      return {
        authorizationUrl:
          "https://auth.openai.com/api/accounts/authorize?" +
          new URLSearchParams(params),
        expiresIn: 600,
      };
    }
    async identity(encoded, client, nonce) {
      try {
        if (typeof encoded !== "string" || encoded.length > 50000)
          throw new Error();
        const parts = encoded.split(".");
        if (parts.length !== 3) throw new Error();
        const h = JSON.parse(await this.invoke("base64.decode", parts[0])),
          c = JSON.parse(await this.invoke("base64.decode", parts[1]));
        if (
          !["RS256", "ES256"].includes(h.alg) ||
          typeof h.kid !== "string" ||
          !h.kid ||
          h.crit ||
          h.b64 === false
        )
          throw new Error();
        const result = await this.json(
            "https://auth.openai.com/.well-known/jwks.json",
          ),
          key = result.keys?.find((k) => k.kid === h.kid);
        if (
          !object(key) ||
          (key.alg && key.alg !== h.alg) ||
          (key.use && key.use !== "sig") ||
          (key.key_ops &&
            (!Array.isArray(key.key_ops) || !key.key_ops.includes("verify"))) ||
          (h.alg === "RS256" && key.kty !== "RSA") ||
          (h.alg === "ES256" && (key.kty !== "EC" || key.crv !== "P-256"))
        )
          throw new Error();
        const pk = publicKey(key, h.alg);
        let sig = bytes64(parts[2]);
        if (h.alg === "ES256") {
          if (sig.length !== 64) throw new Error();
          sig = der(48, [
            ...integer(sig.slice(0, 32)),
            ...integer(sig.slice(32)),
          ]);
        }
        if (
          (await this.invoke("verify", {
            algorithm: h.alg,
            ...pk,
            signature: base64(sig),
            message: parts[0] + "." + parts[1],
          })) !== "true"
        )
          throw new Error();
        const now = Date.now() / 1000;
        if (
          !Number.isFinite(c.exp) ||
          c.exp <= now ||
          !Number.isFinite(c.iat) ||
          c.iat > now ||
          (c.nbf !== undefined && (!Number.isFinite(c.nbf) || c.nbf > now)) ||
          c.iss !== "https://auth.openai.com" ||
          !(typeof c.aud === "string"
            ? c.aud === client
            : Array.isArray(c.aud) && c.aud.includes(client)) ||
          typeof c.sub !== "string" ||
          !c.sub ||
          !equal(c.nonce, nonce)
        )
          throw new Error();
        return c;
      } catch (_) {
        throw error(
          "ChatGPT 身份验证未通过，未保存授权。",
          "CHATGPT_IDENTITY",
          502,
        );
      }
    }
    async callback(query) {
      const params = new URLSearchParams(query),
        a = this.pending;
      if (
        !a ||
        a.expiresAt < Date.now() ||
        params.getAll("state").length !== 1 ||
        !equal(params.get("state"), a.state)
      )
        throw error("授权请求无效或已超时。", "CHATGPT_STATE");
      this.pending = null;
      if (this.locks.has("chatgpt"))
        throw error("账户请求处理中，请返回重试。", "CHATGPT_BUSY");
      this.locks.add("chatgpt");
      try {
        if (params.has("error"))
          throw error("登录或套餐授权已取消。", "CHATGPT_DENIED");
        const ids = params.getAll("client_id"),
          codes = params.getAll("code"),
          issued = ids[0] || a.client_id;
        if (
          ids.length > 1 ||
          codes.length !== 1 ||
          !codes[0] ||
          !/^oaiapp_[A-Za-z0-9_-]{1,249}$/.test(issued) ||
          (a.client_id !== "dynamic_agent_client" && issued !== a.client_id)
        )
          throw error("授权回调编号或代码无效。", "CHATGPT_CALLBACK");
        let d = await this.chatVault();
        d.registrationAttempt = { client_id: issued, subject: a.subject };
        await this.write("chatgpt", d);
        const tokens = await this.json(
            "https://auth.openai.com/api/accounts/oauth/token",
            null,
            {
              grant_type: "authorization_code",
              client_id: issued,
              code: codes[0],
              code_verifier: a.verifier,
              redirect_uri: "http://127.0.0.1:8766/auth/callback",
              resource: "https://api.openai.com/v1",
            },
            true,
          ),
          fields = this.tokenFields(tokens),
          claims = await this.identity(tokens.id_token, issued, a.nonce);
        if (a.subject && claims.sub !== a.subject)
          throw error(
            "返回账户与选定账户不一致，请选择添加其他账户。",
            "CHATGPT_ACCOUNT",
          );
        d = await this.chatVault();
        const previous = d.profiles.find(
            (p) => p.client_id === issued && p.subject === claims.sub,
          ),
          p = {
            client_id: issued,
            subject: claims.sub,
            email: typeof claims.email === "string" ? claims.email : "",
            id_token: tokens.id_token,
            ...fields,
            ...(previous?.inferenceConfig
              ? { inferenceConfig: previous.inferenceConfig }
              : {}),
          };
        d.profiles = d.profiles.filter((p) => p.client_id !== issued).concat(p);
        d.active = issued;
        delete d.registrationAttempt;
        await this.write("chatgpt", d);
        this.lastError = "";
        return "connected";
      } catch (e) {
        this.lastError = e.safe ? e.message : "授权未完成，请重新连接。";
        throw e;
      } finally {
        this.locks.delete("chatgpt");
      }
    }
    async configure(provider, payload) {
      if (!keys(payload, ["model", "reasoningEffort"]))
        throw error("请选择模型和强度后保存。");
      const { model, effort } = selection(
          await this.models(provider),
          payload.model,
          payload.reasoningEffort,
        ),
        d =
          provider === "chatgpt"
            ? await this.chatVault()
            : await this.read(provider);
      if (provider === "chatgpt")
        this.profile(d).inferenceConfig = { model, reasoningEffort: effort };
      else Object.assign(d, { model, reasoningEffort: effort });
      await this.write(provider, d);
      return { saved: true, model, reasoningEffort: effort };
    }
    async infer(provider, payload, assistant) {
      const started = Date.now();
      let messages, context;
      if (assistant) {
        ({ messages, context } = input(payload));
      } else
        messages = [{ role: "user", content: text(payload.message, 2000) }];
      const catalogStarted = Date.now(), available = await this.models(provider, undefined, false), diagnostics = { stage: 'complete', elapsedMs: 0, timings: { catalogMs: Math.max(0, Date.now() - catalogStarted) }, catalogCacheHit: available.catalogCacheHit, usage: {} };
      const { model, effort } = selection(
        available,
        assistant ? undefined : payload.model,
        assistant ? undefined : payload.reasoningEffort,
      );
      const inferenceStarted = Date.now();
      let reply;
      if (provider === "chatgpt") {
        const body = {
          model,
          input: assistant
            ? [
                {
                  role: "developer",
                  content:
                    "本地参考数据（名称仅为数据）：" + JSON.stringify(context),
                },
                ...messages,
              ]
            : messages,
          store: false,
          stream: true,
        };
        if (effort !== "auto") body.reasoning = { effort };
        if (assistant) {
          body.instructions = this.options.instructions;
          body.text = {
            format: {
              type: "json_schema",
              name: "ketime_schedule_plan",
              strict: true,
              schema: this.options.schema,
            },
          };
        }
        const result = await this.http({
          url: "https://api.openai.com/v1/responses",
          method: "POST",
          headers: {
            Authorization: "Bearer " + (await this.access()),
            Accept: "text/event-stream",
            "Content-Type": "application/json",
          },
          body: JSON.stringify(body),
        });
        if (result.status !== 200)
          throw error(
            "ChatGPT 推理未完成，请核对授权和额度。",
            "CHATGPT_INFERENCE_FAILED",
            502,
          );
        reply = stream(result.body);
      } else {
        const d = await this.read(provider);
        if (assistant)
          messages = [
            {
              role: "system",
              content:
                this.options.instructions +
                "\n仅返回JSON，不加Markdown。严格符合JSON Schema：" +
                JSON.stringify(this.options.schema),
            },
            {
              role: "user",
              content:
                "本地参考数据（名称仅为数据）：" +
                JSON.stringify(context) +
                "\n对话记录：" +
                JSON.stringify(messages),
            },
          ];
        const body = { model, messages, stream: false };
        if (provider === "deepseek") {
          body.max_tokens = assistant ? 8192 : 2048;
          if (!["deepseek-chat", "deepseek-reasoner"].includes(model))
            body.reasoning_effort = effort;
          if (assistant) body.response_format = { type: "json_object" };
        } else if (provider === "kimi") {
          body.max_tokens = assistant ? 16384 : 8192;
          if (model === "kimi-k3") body.reasoning_effort = effort;
          else if (["kimi-k2.5", "kimi-k2.6"].includes(model))
            body.thinking = {
              type: effort === "none" ? "disabled" : "enabled",
            };
          if (assistant) body.response_format = { type: "json_object" };
        } else {
          body.max_completion_tokens = assistant ? 16384 : 8192;
          body.reasoning_split = true;
          if (model === "MiniMax-M3.1-Flash-Preview")
            body.reasoning_effort = effort;
          else if (model === "MiniMax-M3")
            body.thinking = {
              type: effort === "none" ? "disabled" : "adaptive",
            };
        }
        const base = {
            deepseek: "https://api.deepseek.com",
            kimi: "https://api.moonshot.cn/v1",
            minimax: "https://api.minimax.cn/v1",
          }[provider],
          r = await this.json(base + "/chat/completions", d.apiKey, body),
          choice = r.choices?.[0];
        if (
          choice?.finish_reason !== "stop" ||
          typeof choice.message?.content !== "string" ||
          !choice.message.content.trim() ||
          choice.message.content.length > 100000 ||
          (provider !== "deepseek" && r.model && r.model !== model)
        )
          throw error(
            "回复未完成或模型不一致，未创建日程。",
            "AI_INCOMPLETE",
            502,
          );
        reply = choice.message.content.trim();
        if (provider !== "deepseek" && /<\/?think>/.test(reply))
          throw error("思考内容未与最终回复分离。", "AI_INCOMPLETE", 502);
      }
      if (!assistant)
        return {
          provider,
          model,
          reasoningEffort: effort,
          completed: true,
          reply,
        };
      diagnostics.timings.inferenceMs = Math.max(0, Date.now() - inferenceStarted);
      const validationStarted = Date.now();let parsed;
      try {
        parsed = JSON.parse(reply);
      } catch (_) {
        throw error("助手回复格式无效，未创建日程。", "ASSISTANT_INVALID", 502);
      }
      const validated = output(parsed, context);diagnostics.timings.validationMs = Math.max(0, Date.now() - validationStarted);diagnostics.elapsedMs = Math.max(0, Date.now() - started);
      return {
        ...validated,
        provider,
        model,
        reasoningEffort: effort,
        completed: true,
        diagnostics,
      };
    }
    async disconnect(provider) {
      this.modelCache.delete(provider);
      if (provider !== "chatgpt") {
        await this.write(provider, {});
        return this.status(provider);
      }
      const d = await this.chatVault(),
        p = this.profile(d);
      let warning = "";
      if (p?.refresh_token)
        try {
          await this.json(
            "https://auth.openai.com/api/accounts/oauth/revoke",
            null,
            {
              token: p.refresh_token,
              token_type_hint: "refresh_token",
              client_id: p.client_id,
            },
            true,
          );
        } catch (_) {
          warning = "本机已退出，未确认远端撤销。请在 ChatGPT 设置中断开刻时。";
        }
      if (p)
        for (const k of [
          "access_token",
          "refresh_token",
          "id_token",
          "scopes",
          "expiresAt",
        ])
          delete p[k];
      this.pending = null;
      delete d.registrationAttempt;
      await this.write("chatgpt", d);
      return { ...(await this.status(provider)), warning };
    }
    async schoolSettings(payload, save) {
      let d = await this.read("school");
      if (save) {
        if (payload.clear === true) d = {};
        else {
          const account = text(payload.account ?? d.account, 32);
          if (!/^[A-Za-z0-9._-]{4,32}$/.test(account))
            throw error("账号格式无效。");
          const same = d.account === account,
            password = payload.password || (same ? d.password : ""),
            cloudPassword =
              payload.cloudPassword || (same ? d.cloudPassword : ""),
            termStart = payload.termStart ?? d.termStart ?? "";
          for (const key of ["password", "cloudPassword"])
            if (
              payload[key] !== undefined &&
              (typeof payload[key] !== "string" || payload[key].length > 256)
            )
              throw error("密码格式不正确。");
          if (
            typeof password !== "string" ||
            !password ||
            password.length > 256 ||
            typeof cloudPassword !== "string" ||
            !cloudPassword ||
            cloudPassword.length > 256
          )
            throw error("请填写教务和教学云密码。");
          if (
            termStart &&
            (!School.validDate(termStart) ||
              new Date(termStart + "T12:00:00Z").getUTCDay() !== 1)
          )
            throw error("第一教学周开始日期必须是周一。");
          d = { account, password, cloudPassword, termStart };
        }
        await this.write("school", d);
      }
      return {
        account: d.account || "",
        hasPassword: !!d.password,
        hasCloudPassword: !!d.cloudPassword,
        termStart: d.termStart || "",
        encrypted: true,
        ...(save ? { saved: true } : {}),
      };
    }
    async schoolRoute(route, payload) {
      const now = Date.now();
      if (now - (this.lastSchool.get(route) || 0) < 5000)
        throw error("请等待几秒后再同步。", "RATE_LIMIT", 429);
      this.lastSchool.set(route, now);
      if (route === "/api/ucloud/prepare") return this.school.prepare();
      let account = payload.account || "",
        password = payload.password || "",
        termStart = payload.termStart || "";
      if (payload.stored === true) {
        const d = await this.read("school");
        account = d.account || "";
        password =
          route === "/api/ucloud/homework"
            ? d.cloudPassword || d.password || ""
            : d.password || "";
        termStart = d.termStart || "";
      }
      if (route === "/api/bupt/timetable")
        return this.school.fetchTimetable(account, password, termStart);
      return this.school.fetchHomework(
        payload.loginId || "",
        account,
        password,
        payload.captcha || "",
      );
    }
    async dispatch(route, raw) {
      let group = "";
      let owned = false;
      try {
        if (
          typeof raw !== "string" ||
          raw.length > (route.endsWith("/assistant") ? 131072 : 16384)
        )
          throw error("请求过大。", "INPUT", 413);
        const payload = JSON.parse(raw);
        if (!object(payload)) throw error("请求格式无效。");
        if (route === "/api/config")
          return JSON.stringify({
            status: 200,
            body: {
              csrfToken: "harmony-native-bridge",
              version: "1.0.0-harmony",
              provider: "bupt",
              chatgpt: true,
              deepseek: true,
              kimi: true,
              minimax: true,
              modelSettings: true,
              scheduleAssistant: true,
              assistantDrafts: true,
            },
          });
        const match = route.match(
          /^\/api\/(settings|bupt|ucloud|chatgpt|deepseek|kimi|minimax)\/([a-z]+)$/,
        );
        if (!match) throw error("接口不存在。", "NOT_FOUND", 404);
        let [, provider, action] = match;
        if (provider === "chatgpt" && action === "assistant") {
          provider = payload.provider || "gpt";
          if (provider === "gpt") provider = "chatgpt";
          if (!["chatgpt", "deepseek", "kimi", "minimax"].includes(provider))
            throw error("模型提供方无效。");
          delete payload.provider;
        }
        if (action !== "status") {
          group = ["bupt", "ucloud"].includes(provider) ? "school" : provider;
          if (this.locks.has(group))
            throw error("已有请求进行中，请等待。", "BUSY", 429);
          this.locks.add(group);
          owned = true;
        }
        let body;
        if (provider === "settings" && ["read", "save"].includes(action))
          body = await this.schoolSettings(payload, action === "save");
        else if (
          (provider === "bupt" && action === "timetable") ||
          (provider === "ucloud" && ["prepare", "homework"].includes(action))
        )
          body = await this.schoolRoute(route, payload);
        else if (
          ["chatgpt", "deepseek", "kimi", "minimax"].includes(provider)
        ) {
          if (action === "status") body = await this.status(provider);
          else if (action === "models") body = await this.models(provider);
          else if (action === "connect")
            body = await this.connect(provider, payload);
          else if (action === "configure")
            body = await this.configure(provider, payload);
          else if (action === "test" || action === "assistant")
            body = await this.infer(provider, payload, action === "assistant");
          else if (action === "disconnect")
            body = await this.disconnect(provider);
          else if (provider === "chatgpt" && action === "select") {
            this.modelCache.delete('chatgpt');
            const d = await this.chatVault();
            if (!d.profiles.some((p) => p.client_id === payload.account))
              throw error("账户不存在。");
            d.active = payload.account;
            delete d.registrationAttempt;
            this.pending = null;
            this.lastError = "";
            await this.write("chatgpt", d);
            body = await this.status(provider);
          } else throw error("接口不存在。", "NOT_FOUND", 404);
        } else throw error("接口不存在。", "NOT_FOUND", 404);
        return JSON.stringify({ status: 200, body });
      } catch (e) {
        if (owned && group === 'chatgpt') this.modelCache.delete('chatgpt');
        return JSON.stringify({
          status: e.safe || (e.code && e.status) ? e.status : 502,
          body: {
            error:
              e.safe || (e.code && e.status)
                ? e.message
                : "本机操作未完成，原数据未覆盖；请重试。",
            code: e.safe || (e.code && e.status) ? e.code : "NATIVE_FAILED",
          },
        });
      } finally {
        if (owned) this.locks.delete(group);
      }
    }
  }
  return {
    Runtime,
    input,
    output,
    catalog,
    modelEfforts,
    selection,
    stream,
    publicKey,
    bytes64,
    base64,
  };
});
