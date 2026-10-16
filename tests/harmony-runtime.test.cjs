"use strict";
const { test } = require("node:test"),
  assert = require("node:assert/strict"),
  crypto = require("node:crypto"),
  { execFileSync } = require("node:child_process"),
  path = require("node:path");
const lib = require("../harmony-runtime/runtime.js"),
  School = require("../harmony-runtime/school.js");
const python = process.env.KETIME_BUILD_PYTHON || "C:/anaconda3/python.exe";
function reference(code, input) {
  return JSON.parse(
    execFileSync(
      python,
      ["-c", 'import sys,json;sys.path.insert(0,".");' + code],
      {
        cwd: path.resolve(__dirname, ".."),
        input: JSON.stringify(input),
        encoding: "utf8",
        env: { ...process.env, PYTHONIOENCODING: "utf-8" },
      },
    ),
  );
}
function host(
  handler = () => {
    throw Error("Unexpected external call");
  },
) {
  const vault = new Map(),
    requests = [];
  return {
    vault,
    requests,
    invoke: async (op, raw) => {
      if (op === "random") return crypto.randomBytes(48).toString("base64url");
      if (op === "base64.decode")
        return Buffer.from(raw, "base64url").toString("utf8");
      const d = JSON.parse(raw);
      if (op === "vault.read") return vault.get(d.name) || "";
      if (op === "vault.write") {
        vault.set(d.name, d.value);
        return "";
      }
      if (op === "digest")
        return crypto
          .createHash(d.algorithm.toLowerCase())
          .update(d.value)
          .digest("hex");
      if (op === "verify")
        return String(
          crypto.verify(
            "sha256",
            Buffer.from(d.message),
            crypto.createPublicKey({
              key: Buffer.from(d.spki, "base64"),
              format: "der",
              type: "spki",
            }),
            Buffer.from(d.signature, "base64"),
          ),
        );
      if (op === "http") {
        requests.push(d);
        return JSON.stringify(await handler(d));
      }
      throw Error("Unexpected native primitive: " + op);
    },
  };
}
const payload = {
  messages: [
    { role: "user", content: "10月1日早上升旗，明年1月5日实验，12月31日总结" },
  ],
  context: {
    today: "2026-12-30",
    now: "2026-12-30T19:30:00+08:00",
    timezone: "Asia/Shanghai",
    projects: [{ id: "p", name: "项目", nodes: [{ id: "n", name: "节点" }] }],
  },
};
const event = {
  name: "测试活动",
  date: "2026-10-01",
  start: "09:00",
  end: null,
  repeat: "none",
  endDate: null,
  location: "教学楼",
  notes: "入场说明",
  color: "#2A8052",
  projectId: "p",
  nodeId: "n",
};
test("Assistant input/calendar hints match existing Python", () => {
  const expected = reference(
    'from schedule_assistant import validate_input;h,c=validate_input(json.load(sys.stdin));print(json.dumps({"messages":h,"context":c},ensure_ascii=False))',
    payload,
  );
  assert.deepEqual(lib.input(payload), expected);
});
test("Assistant multi-event sorting and nullable boundaries match Python", () => {
  const result = {
      eventCount: 4,
      message: "请确认日程",
      events: [
        { ...event, name: "未定", date: null, start: null, end: null },
        { ...event, name: "晚间", start: "22:00", end: "01:00" },
        { ...event, name: "仅结束", start: null, end: "10:30" },
        event,
      ],
    },
    context = lib.input(payload).context;
  const expected = reference(
    'from schedule_assistant import validate_output;v=json.load(sys.stdin);print(json.dumps(validate_output(v["result"],v["context"]),ensure_ascii=False))',
    { result, context },
  );
  assert.deepEqual(lib.output(result, context), expected);
  assert.throws(() => lib.output({ ...result, eventCount: 3 }, context));
  assert.throws(() =>
    lib.output(
      {
        eventCount: 1,
        message: "a",
        events: [{ ...event, projectId: "unknown" }],
      },
      context,
    ),
  );
  assert.throws(() =>
    lib.output(
      {
        eventCount: 1,
        message: "a",
        events: [{ ...event, date: "2026-02-30" }],
      },
      context,
    ),
  );
});
test("Kimi/MiniMax catalog capabilities match existing Python", () => {
  for (const [provider, data] of [
    [
      "kimi",
      {
        data: [
          { id: "kimi-k3" },
          { id: "kimi-k2.6" },
          { id: "kimi-k2-thinking" },
          { id: "vision-model" },
        ],
      },
    ],
    [
      "minimax",
      {
        data: [
          { id: "MiniMax-M3" },
          { id: "MiniMax-M3.1-Flash-Preview" },
          { id: "MiniMax-M2.5" },
        ],
      },
    ],
  ]) {
    const expected = reference(
      'from api_clients import catalog;v=json.load(sys.stdin);print(json.dumps(catalog(v["provider"],v["data"])))',
      { provider, data },
    );
    assert.deepEqual(lib.catalog(provider, data), expected);
  }
});
test("DeepSeek capabilities never invent unadvertised reasoning modes", () => {
  const data = {
    data: [
      { id: "deepseek-chat" },
      { id: "deepseek-reasoner" },
      { id: "deepseek-flash" },
      { id: "deepseek-new" },
      {
        id: "deepseek-future",
        effort: { supported_levels: ["max", "high", "garbage", "max"] },
      },
    ],
  };
  const expected = reference(
    "from deepseek_client import catalog;print(json.dumps(catalog(json.load(sys.stdin))))",
    data,
  );
  assert.deepEqual(lib.catalog("deepseek", data), expected);
});
test("ChatGPT catalog honors visibility, API capability, modality and effort metadata", () => {
  const data = {
    models: [
      {
        slug: "gpt-6.1-sol",
        visibility: "list",
        supported_reasoning_levels: ["low", "high"],
      },
      { slug: "gpt-6-astra", visibility: "hidden" },
      { slug: "gpt-5.6-sol", visibility: "list" },
      {
        slug: "gpt-7-new",
        visibility: "list",
        supported_reasoning_levels: [{ effort: "max" }],
      },
      { slug: "gpt-8-foo", visibility: "list", input_modalities: ["image"] },
    ],
  };
  const expected = reference(
    "from chatgpt_client import model_catalog;print(json.dumps(model_catalog(json.load(sys.stdin))))",
    data,
  );
  assert.deepEqual(lib.catalog("chatgpt", data), expected);
});
test("BUPT course expansion, IDs, locations and week-zero match Android", async () => {
  for (const week of [0, 5]) {
    const current = {
        code: 1,
        data: [
          {
            semesterId: "2026-2027-1",
            date: [{ mxrq: week ? "2026-10-02" : "2026-08-26", zc: week }],
          },
        ],
      },
      course = {
        courseName: "测试课程",
        jx0408id: "test-course",
        weekDay: "1",
        classTime: "10304",
        classWeek: "1-5(单)",
        teacherName: "测试教师",
        buildingName: "教学楼",
        classroomName: "101",
      },
      full = { data: [{ item: { morning: [course] } }] },
      expected = reference(
        'from bupt_sync import convert_timetable;v=json.load(sys.stdin);d=convert_timetable(v["current"],v["full"],"a"*24);d.pop("fetchedAt");print(json.dumps(d,ensure_ascii=False))',
        { current, full },
      ),
      actual = await School.timetable(current, full, "a".repeat(24), "", {
        now: () => "2026-10-16T12:00:00+08:00",
        digest: async (_, s) =>
          crypto.createHash("sha256").update(s).digest("hex"),
      });
    delete actual.fetchedAt;
    assert.deepEqual(actual, expected);
  }
});
test("Homework converter preserves course prefix, deadline and deduplication", () => {
  const data = {
      data: {
        undoneList: [
          {
            type: 3,
            activityId: "work_123",
            activityName: "<b>实验一</b>",
            siteName: "测试课程",
            endTime: "2026-10-10 23:59:00",
          },
          { type: 4, activityId: "quiz", activityName: "测验" },
        ],
      },
    },
    expected = reference(
      'from ucloud_sync import convert_homework;d=convert_homework(json.load(sys.stdin),"a"*24);d.pop("fetchedAt");print(json.dumps(d,ensure_ascii=False))',
      data,
    ),
    actual = School.homework(data, "a".repeat(24), "now");
  delete actual.fetchedAt;
  assert.deepEqual(actual, expected);
});
test("Stored passwords never appear in public settings; blank keeps old, account change rejects", async () => {
  const h = host(),
    runtime = new lib.Runtime(h),
    call = async (route, p) =>
      JSON.parse(await runtime.dispatch(route, JSON.stringify(p)));
  assert.equal(
    (
      await call("/api/settings/save", {
        account: "test_student",
        password: "test-school-secret",
        cloudPassword: "test-cloud-secret",
        termStart: "2026-08-31",
      })
    ).status,
    200,
  );
  const read = await call("/api/settings/read", {});
  assert.equal(JSON.stringify(read).includes("secret"), false);
  await call("/api/settings/save", {
    account: "test_student",
    password: "",
    cloudPassword: "",
  });
  assert.equal(JSON.parse(h.vault.get("school")).termStart, "2026-08-31");
  assert.equal(
    (
      await call("/api/settings/save", {
        account: "other_student",
        password: "",
        cloudPassword: "",
      })
    ).status,
    400,
  );
  assert.equal(JSON.parse(h.vault.get("school")).account, "test_student");
});
test("Provider requests preserve selected model/effort; incomplete responses rejected", async () => {
  for (const [provider, model, effort] of [
    ["deepseek", "deepseek-flash", "none"],
    ["kimi", "kimi-k3", "high"],
    ["minimax", "MiniMax-M3", "none"],
  ]) {
    let finish = "stop";
    const h = host((req) => ({
        status: 200,
        body: JSON.stringify(
          req.url.endsWith("/models")
            ? { data: [{ id: model }] }
            : {
                model,
                choices: [
                  { finish_reason: finish, message: { content: "测试回复" } },
                ],
              },
        ),
      })),
      runtime = new lib.Runtime(h);
    h.vault.set(
      provider,
      JSON.stringify({
        apiKey: "fake-local-test-key",
        model,
        reasoningEffort: effort,
      }),
    );
    const reply = JSON.parse(
      await runtime.dispatch(
        `/api/${provider}/test`,
        JSON.stringify({ message: "测试" }),
      ),
    );
    assert.equal(reply.status, 200);
    assert.equal(reply.body.model, model);
    const body = JSON.parse(h.requests[h.requests.length - 1].body);
    assert.equal(body.model, model);
    if (provider === "deepseek") assert.equal(body.reasoning_effort, "none");
    if (provider === "kimi") assert.equal(body.reasoning_effort, "high");
    if (provider === "minimax") assert.equal(body.thinking.type, "disabled");
    finish = "length";
    assert.equal(
      JSON.parse(
        await runtime.dispatch(
          `/api/${provider}/test`,
          JSON.stringify({ message: "测试" }),
        ),
      ).status,
      502,
    );
  }
});
test("Busy callers cannot release another in-flight operation lock", async () => {
  let release;
  const pending = new Promise((r) => (release = r)),
    h = host(async () => {
      await pending;
      return {
        status: 200,
        body: JSON.stringify({ data: [{ id: "deepseek-chat" }] }),
      };
    }),
    runtime = new lib.Runtime(h);
  h.vault.set(
    "deepseek",
    JSON.stringify({
      apiKey: "fake-key",
      model: "deepseek-chat",
      reasoningEffort: "none",
    }),
  );
  const first = runtime.dispatch("/api/deepseek/models", "{}");
  await new Promise((r) => setImmediate(r));
  for (let i = 0; i < 2; i++) {
    assert.equal(
      JSON.parse(await runtime.dispatch("/api/deepseek/models", "{}")).status,
      429,
    );
    assert(runtime.locks.has("deepseek"));
  }
  release();
  await first;
  assert(!runtime.locks.has("deepseek"));
});
test("JWT SPKI construction and signature validation work for RSA and P-256", async () => {
  for (const alg of ["RS256", "ES256"]) {
    const pair =
        alg === "RS256"
          ? crypto.generateKeyPairSync("rsa", { modulusLength: 2048 })
          : crypto.generateKeyPairSync("ec", { namedCurve: "prime256v1" }),
      jwk = pair.publicKey.export({ format: "jwk" }),
      pk = lib.publicKey(jwk, alg);
    assert.deepEqual(
      crypto
        .createPublicKey({
          key: Buffer.from(pk.spki, "base64"),
          format: "der",
          type: "spki",
        })
        .export({ format: "jwk" }),
      jwk,
    );
    const header = Buffer.from(
        JSON.stringify({ alg, kid: "test-key" }),
      ).toString("base64url"),
      claims = {
        exp: Date.now() / 1000 + 600,
        iat: Date.now() / 1000 - 1,
        iss: "https://auth.openai.com",
        aud: "oaiapp_test",
        sub: "subject",
        nonce: "nonce",
      },
      body = Buffer.from(JSON.stringify(claims)).toString("base64url"),
      signature = crypto
        .sign("sha256", Buffer.from(header + "." + body), {
          key: pair.privateKey,
          ...(alg === "ES256" ? { dsaEncoding: "ieee-p1363" } : {}),
        })
        .toString("base64url"),
      h = host(() => ({
        status: 200,
        body: JSON.stringify({
          keys: [
            { ...jwk, kid: "test-key", alg, use: "sig", key_ops: ["verify"] },
          ],
        }),
      })),
      runtime = new lib.Runtime(h);
    assert.equal(
      (
        await runtime.identity(
          header + "." + body + "." + signature,
          "oaiapp_test",
          "nonce",
        )
      ).sub,
      "subject",
    );
    await assert.rejects(() =>
      runtime.identity(
        header + "." + body + "." + signature,
        "oaiapp_other",
        "nonce",
      ),
    );
    await assert.rejects(() =>
      runtime.identity(
        header + "." + body + "." + signature,
        "oaiapp_test",
        "wrong",
      ),
    );
  }
});
test("OAuth state checked before token exchange, failed one-use callback retains registration", async () => {
  const h = host(() => ({ status: 400, body: "{}" })),
    runtime = new lib.Runtime(h);
  h.invoke = ((original) => async (op, raw) =>
    op === "oauth.listen" ? "" : original(op, raw))(h.invoke);
  const begin = await runtime.begin(),
    params = new URL(begin.authorizationUrl).searchParams;
  assert.equal(params.get("code_challenge_method"), "S256");
  assert.equal(params.has("id_token_hint"), false);
  await assert.rejects(() =>
    runtime.callback("state=wrong&code=one&client_id=oaiapp_test"),
  );
  assert.equal(h.requests.length, 0);
  await assert.rejects(() =>
    runtime.callback(
      "state=" + params.get("state") + "&code=one&client_id=oaiapp_test",
    ),
  );
  assert.equal(
    JSON.parse(h.vault.get("chatgpt")).registrationAttempt.client_id,
    "oaiapp_test",
  );
  const requests = h.requests.length;
  await assert.rejects(() =>
    runtime.callback(
      "state=" + params.get("state") + "&code=one&client_id=oaiapp_test",
    ),
  );
  assert.equal(h.requests.length, requests);
});
test("Streaming response must contain completed event, never accept reasoning-only partial", () => {
  assert.equal(
    lib.stream(
      'data: {"type":"response.output_text.delta","delta":"你好"}\n\ndata: {"type":"response.completed"}\n\n',
    ),
    "你好",
  );
  assert.throws(() =>
    lib.stream(
      'data: {"type":"response.output_text.delta","delta":"未完成"}\n\n',
    ),
  );
  assert.throws(() => lib.stream('data: {"type":"response.incomplete"}\n\n'));
});
