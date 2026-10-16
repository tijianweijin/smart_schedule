/* Packaged Harmony UI + exact native service, mocked OS/HTTPS; isolated Edge profile. */
"use strict";
const assert = require("node:assert/strict"),
  fs = require("node:fs"),
  path = require("node:path"),
  crypto = require("node:crypto");
const { chromium } = require(
  process.env.KETIME_PLAYWRIGHT ||
    "../.local/browser-test/node_modules/playwright",
);
const { Runtime } = require("../harmony-runtime/runtime.js");
const root = path.resolve(__dirname, ".."),
  raw = path.join(root, "harmony/entry/src/main/resources/rawfile/web");
let browser;
(async () => {
  browser = await chromium.launch({
    headless: true,
    executablePath:
      process.env.KETIME_EDGE ||
      "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  });
  const vault = new Map(),
    calls = [],
    network = [],
    errors = [];
  const runtime = new Runtime({
    invoke: async (op, raw) => {
      if (op === "random") return crypto.randomBytes(48).toString("base64url");
      const d = JSON.parse(raw);
      if (op === "vault.read") return vault.get(d.name) || "";
      if (op === "vault.write") {
        vault.set(d.name, d.value);
        return "";
      }
      if (op === "http") {
        assert(
          d.url === "https://api.deepseek.com/models" ||
            d.url === "https://api.deepseek.com/chat/completions",
          "Unexpected upstream: " + d.url,
        );
        return JSON.stringify({
          status: 200,
          body: JSON.stringify(
            d.url.endsWith("/models")
              ? { data: [{ id: "deepseek-chat" }] }
              : {
                  model: "deepseek-chat",
                  choices: [
                    {
                      finish_reason: "stop",
                      message: { content: "隔离测试回复" },
                    },
                  ],
                },
          ),
        });
      }
      throw Error("Unexpected OS primitive: " + op);
    },
  });
  const context = await browser.newContext({
      viewport: { width: 393, height: 851 },
      isMobile: true,
      hasTouch: true,
      timezoneId: "Asia/Shanghai",
    }),
    page = await context.newPage();
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("dialog", (d) => d.accept());
  page.on("request", (r) => network.push(r.url()));
  await page.clock.install({ time: new Date("2026-10-16T09:46:00+08:00") });
  let exported = "",
    imported = "";
  await page.exposeFunction("__osMessage", async (raw) => {
    const m = JSON.parse(raw);
    assert.equal(m.token, "synthetic-harmony-native-token-123456789");
    calls.push(m);
    let value = "";
    if (m.op === "api")
      value = await runtime.dispatch(m.data.route, m.data.payload);
    else if (m.op === "exportBackup") exported = m.data.json;
    else if (m.op === "importBackup")
      value = JSON.stringify({ json: imported, name: "synthetic-backup.json" });
    else if (m.op !== "haptic") throw Error("Unexpected OS action " + m.op);
    await page.evaluate((r) => window.__ketimeHarmonyReceive(r), {
      id: m.id,
      value,
      error: "",
    });
  });
  await page.addInitScript(() => {
    window.KetimeHarmonyHost = {
      postMessage: (raw) => window.__osMessage(raw),
    };
    window.addEventListener("load", () =>
      window.__ketimeHarmonyReady("synthetic-harmony-native-token-123456789"),
    );
  });
  const csp =
    "default-src 'none'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self'; font-src 'self'; object-src 'none'; base-uri 'none'; frame-src 'none'";
  await page.route("**/*", async (route) => {
    const u = new URL(route.request().url());
    assert.equal(
      u.origin,
      "http://127.0.0.1:8766",
      "Web must not send direct external requests",
    );
    const name = u.pathname === "/" ? "index.html" : u.pathname.slice(1);
    if (
      ![
        "index.html",
        "harmony-bridge.js",
        "android-mobile.js",
        "android-mobile.css",
      ].includes(name)
    )
      return route.fulfill({ status: 403, body: "Blocked" });
    await route.fulfill({
      status: 200,
      body: fs.readFileSync(path.join(raw, name)),
      headers: {
        "Content-Type": name.endsWith(".css")
          ? "text/css"
          : name.endsWith(".js")
            ? "text/javascript"
            : "text/html",
        "Content-Security-Policy": csp,
      },
    });
  });
  await page.goto("http://127.0.0.1:8766/");
  await page.waitForFunction(
    () => window.__ketimeDemo && window.KetimeAndroid?.back,
  );
  assert.equal(await page.title(), "刻时 HarmonyOS 1.0");
  assert.equal(await page.locator(".view-tab").count(), 4);
  assert(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  );
  await page.click("#add-untimed-todo");
  await page.fill("#untimed-input", "鸿蒙隔离测试待收纳");
  await page.press("#untimed-input", "Enter");
  assert(
    (await page.evaluate(() => window.__ketimeDemo.getState().inbox)).some(
      (x) => x.name === "鸿蒙隔离测试待收纳",
    ),
  );
  await page.click("#add-event-btn");
  assert(await page.locator("#schedule-overlay").isVisible());
  await page.locator("#chips-editor .chip-text").first().fill("手动输入长标题不应被自动截断或改写");
  await page.fill("#event-date", "2026-10-16");
  assert(await page.evaluate(() => window.KetimeAndroid.back()));
  assert(await page.locator("#schedule-overlay").isHidden());
  await page.click("[data-view=projects]");
  await page.click("#btn-add-project");
  assert((await page.locator(".project-card").count()) > 0);
  await page.click("[data-view=growth]");
  assert(await page.locator("#growth-svg").isVisible());
  await page.click("#settings-btn");
  assert(await page.locator("#view-settings").isVisible());
  assert.equal(
    await page.locator("#settings-account-section").getAttribute("open"),
    null,
  );
  await page.locator("#settings-account-section>summary").click();
  await page.fill("#settings-account", "synthetic_student");
  await page.fill("#settings-password", "synthetic-school-secret");
  await page.fill("#settings-cloud-password", "synthetic-cloud-secret");
  await page.fill("#settings-term-start", "2026-08-31");
  await page.click("#settings-save");
  await page.waitForFunction(() =>
    document.getElementById("settings-status").textContent.includes("保存"),
  );
  assert.equal(JSON.parse(vault.get("school")).account, "synthetic_student");
  assert.equal(await page.locator("#settings-password").inputValue(), "");
  await page.locator(".bupt-backup summary").click();
  await page.click("#bupt-export");
  await page.waitForFunction(() => true);
  for (let i = 0; i < 30 && !exported; i++) await page.waitForTimeout(50);
  assert(exported.includes("鸿蒙隔离测试待收纳"));
  assert(!exported.includes("synthetic-school-secret"));
  assert(!exported.includes("synthetic-cloud-secret"));
  imported = exported;
  await page.click("#bupt-restore");
  await page.waitForFunction(() =>
    document
      .getElementById("settings-status")
      .textContent.includes("备份已恢复"),
  );
  await page.locator("#chatgpt-panel summary").click();
  await page.selectOption("#ai-provider", "deepseek");
  await page.fill("#deepseek-key", "synthetic-deepseek-api-key");
  await page.click("#deepseek-connect");
  await page.waitForFunction(
    () => !document.getElementById("deepseek-send").disabled,
  );
  await page.click("#deepseek-send");
  await page.waitForFunction(() =>
    document
      .getElementById("deepseek-reply")
      .textContent.includes("隔离测试回复"),
  );
  assert.equal(await page.locator("#deepseek-key").inputValue(), "");
  await page.click("[data-view=schedule]");
  await page.evaluate(() => {
    const s = window.__ketimeDemo.getState();
    s.schedules = [
      {
        id: "full",
        name: "普通日程",
        date: "2026-10-16",
        start: "10:00",
        end: "12:30",
        repeat: "none",
        color: "#8A5C2E",
      },
      {
        id: "tail",
        name: "有开始时间的长标题无尾日程",
        date: "2026-10-16",
        start: "15:00",
        end: "",
        location: "教学楼203室",
        repeat: "none",
        color: "#5B3C91",
      },
      {
        id: "head",
        name: "无头日程",
        date: "2026-10-16",
        start: "",
        end: "18:00",
        repeat: "none",
        color: "#2A8052",
      },
    ];
    localStorage.setItem("ketime-demo-v0.1", JSON.stringify(s));
  });
  await page.reload();
  await page.waitForFunction(() =>
    document.querySelector("[data-event-id=tail]"),
  );
  await page.clock.runFor(100);
  assert(
    (await page.evaluate(() => window.__ketimeDemo.getState().inbox)).some(
      (x) => x.name === "鸿蒙隔离测试待收纳",
    ),
  );
  const before = await page.evaluate(() => ({
    scale: window.KetimeTimelineScale.value,
    hour: window.KetimeTimelineAPI.hourHeight,
    nav: document.querySelector(".android-bottom-nav").getBoundingClientRect()
      .height,
  }));
  await page.evaluate(() => window.KetimeTimelineScale.set(1.5));
  await page.clock.runFor(80);
  const after = await page.evaluate(() => ({
    scale: window.KetimeTimelineScale.value,
    hour: window.KetimeTimelineAPI.hourHeight,
    nav: document.querySelector(".android-bottom-nav").getBoundingClientRect()
      .height,
  }));
  assert.equal(after.scale, 1.5);
  assert.equal(after.hour, 144);
  assert.equal(after.nav, before.nav);
  await page.click("[data-view=projects]");
  assert.equal(
    await page
      .locator("#view-projects")
      .evaluate((e) => getComputedStyle(e).transform),
    "none",
  );
  await page.click("[data-view=schedule]");
  for (const width of [320, 393, 600]) {
    await page.setViewportSize({ width, height: 851 });
    await page.clock.runFor(120);
    assert(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    );
    assert(await page.locator("[data-event-id=tail] .event-title").isVisible());
  }
  await page.setViewportSize({ width: 393, height: 851 });
  await page.clock.runFor(100);
  fs.mkdirSync(path.join(root, "harmony/dist"), { recursive: true });
  await page.screenshot({
    path: path.join(root, "harmony/dist/鸿蒙界面隔离验证.png"),
  });
  assert.deepEqual(errors, []);
  assert(network.every((u) => u.startsWith("http://127.0.0.1:8766/")));
  assert(
    !(await page.evaluate(() =>
      Object.values(localStorage).some((s) =>
        /synthetic-school-secret|synthetic-cloud-secret|synthetic-deepseek-api-key/.test(
          s,
        ),
      ),
    )),
  );
  console.log(
    JSON.stringify({
      passed: true,
      checks: [
        "packaged CSP/startup",
        "four views",
        "inbox persistence",
        "account save without secret echo",
        "backup export/import through OS bridge",
        "DeepSeek test via native runtime",
        "same mobile UI and markers",
        "timeline scale isolation",
        "320/393/600 widths",
        "no external web requests or console errors",
      ],
      nativeMessages: calls.length,
      screenshot: "harmony/dist/鸿蒙界面隔离验证.png",
    }),
  );
  await browser.close();
})().catch(async (e) => {
  console.error(e.stack || e);
  if (browser) await browser.close();
  process.exitCode = 1;
});
