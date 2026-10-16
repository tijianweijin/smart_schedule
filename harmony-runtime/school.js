/* Portable school adapters. Native transport enforces HTTPS/host limits; no credentials persist here. */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.KetimeHarmonySchool = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";
  const slots = [
    ["08:00", "08:45"],
    ["08:50", "09:35"],
    ["09:50", "10:35"],
    ["10:40", "11:25"],
    ["11:30", "12:15"],
    ["13:00", "13:45"],
    ["13:50", "14:35"],
    ["14:45", "15:30"],
    ["15:40", "16:25"],
    ["16:35", "17:20"],
    ["17:25", "18:10"],
    ["18:30", "19:15"],
    ["19:20", "20:05"],
    ["20:10", "20:55"],
  ];
  const fail = (message, code = "UPSTREAM_FORMAT", status = 502) =>
    Object.assign(new Error(message), { code, status });
  const validDate = (s) =>
    typeof s === "string" &&
    /^\d{4}-\d{2}-\d{2}$/.test(s) &&
    Number.isFinite(Date.parse(s + "T12:00:00Z")) &&
    new Date(s + "T12:00:00Z").toISOString().slice(0, 10) === s;
  const plus = (s, n) =>
    new Date(Date.parse(s + "T12:00:00Z") + n * 86400000)
      .toISOString()
      .slice(0, 10);
  function weeks(value) {
    const out = new Set();
    for (const part of String(value || "")
      .replace(/，/g, ",")
      .replace(/[\s周]/g, "")
      .split(/[,;；、]/)) {
      const parity = part.includes("单") ? 1 : part.includes("双") ? 0 : null;
      for (const match of part.matchAll(/(\d+)(?:[-~至—–](\d+))?/g)) {
        const a = Number(match[1]),
          b = Number(match[2] || a);
        if (a < 1 || a > b || b > 60) continue;
        for (let n = a; n <= b; n++)
          if (parity === null || n % 2 === parity) out.add(n);
      }
    }
    return [...out].sort((a, b) => a - b);
  }
  function items(value, depth = 0) {
    if (depth > 40) throw fail("课表层级异常。");
    if (Array.isArray(value)) return value.flatMap((v) => items(v, depth + 1));
    if (value && typeof value === "object") {
      if ("courseName" in value || "jx0408id" in value) return [value];
      return Object.values(value).flatMap((v) => items(v, depth + 1));
    }
    return [];
  }
  function rootData(payload) {
    if (
      !Array.isArray(payload?.data) ||
      !payload.data[0] ||
      typeof payload.data[0] !== "object"
    )
      throw fail("学校课表数据结构已变化。");
    return payload.data[0];
  }
  function term(root, fallback, now) {
    const info = Array.isArray(root.topInfo) ? root.topInfo[0] || {} : {},
      today = now.slice(0, 10),
      d = new Date(today + "T12:00:00Z"),
      month = d.getUTCMonth() + 1,
      year = d.getUTCFullYear(),
      startYear = month >= 8 ? year : year - 1;
    const id = String(
      root.semesterId ||
        root.xnxq01id ||
        info.semesterId ||
        info.xnxq01id ||
        `${startYear}-${startYear + 1}-${month >= 8 || month < 2 ? 1 : 2}`,
    );
    if (!/^\d{4}-\d{4}-[12]$/.test(id))
      throw fail("学校返回的学期编号无法识别。", "TERM_FORMAT");
    for (const item of root.date || []) {
      const date = String(item?.mxrq || "").slice(0, 10),
        week = [item?.zc, root.week, info.week].find((x) =>
          /^\d{1,2}$/.test(String(x)),
        );
      if (!validDate(date) || week === undefined || Number(week) > 60) continue;
      const weekday = (new Date(date + "T12:00:00Z").getUTCDay() + 6) % 7;
      return {
        id,
        start: plus(date, -weekday - (Number(week) - 1) * 7),
        inferred: true,
      };
    }
    if (fallback) {
      if (
        !validDate(fallback) ||
        new Date(fallback + "T12:00:00Z").getUTCDay() !== 1
      )
        throw fail(
          "第一教学周开始日期必须为有效周一。",
          "TERM_START_REQUIRED",
          400,
        );
      return { id, start: fallback, inferred: false };
    }
    throw fail(
      "学校未返回学期开始日期，请填写第一教学周周一后重试。",
      "TERM_START_REQUIRED",
      400,
    );
  }
  const clock = (v, f) =>
    /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(
      String(v || "")
        .trim()
        .slice(0, 5),
    )
      ? String(v).trim().slice(0, 5)
      : f;
  async function timetable(current, full, accountKey, fallback, host) {
    const meta = term(rootData(current), fallback, host.now()),
      data = rootData(full);
    if (!("item" in data) && !("courses" in data))
      throw fail("学校课表数据结构已变化，未更改本地课表。");
    const raw = items(data.item ?? data.courses ?? []);
    if (raw.length > 1500)
      throw fail("学校课表条目数量异常。", "UPSTREAM_SIZE");
    const events = new Map(),
      courses = new Map();
    let skipped = 0,
      conflicts = 0;
    for (const row of raw) {
      const name = String(row.courseName || "").trim(),
        ct = String(row.classTime || ""),
        day = String(row.weekDay || ct.slice(0, 1)),
        sections = (ct.slice(1).match(/\d{2}/g) || []).map(Number);
      if (!sections.length)
        sections.push(
          ...(String(row.weekNoteDetail || "").match(/\d+/g) || []).map(Number),
        );
      const ws = weeks(row.classWeek).length
        ? weeks(row.classWeek)
        : weeks(row.classWeekDetails);
      if (
        !name ||
        !/^\d+$/.test(day) ||
        Number(day) < 1 ||
        Number(day) > 7 ||
        !sections.length ||
        !ws.length
      ) {
        skipped++;
        continue;
      }
      const low = Math.min(...sections),
        high = Math.max(...sections);
      if (low < 1 || high > slots.length) {
        skipped++;
        continue;
      }
      const begin = clock(row.startTime, slots[low - 1][0]),
        end = clock(row.endTIme || row.endTime, slots[high - 1][1]),
        teacher = String(row.teacherName || "")
          .trim()
          .slice(0, 160),
        room = String(row.classroomName || row.location || "")
          .trim()
          .slice(0, 160),
        building = String(row.buildingName || "")
          .trim()
          .slice(0, 160),
        location =
          building && !room.includes(building)
            ? (building + " " + room).trim()
            : room || building,
        course =
          String(row.jx0408id || "").trim() ||
          (await host.digest("SHA256", name + "|" + teacher)).slice(0, 20),
        block = course + "|" + day + "|" + low + "-" + high;
      courses.set(block, {
        name: name.slice(0, 200),
        teacher,
        location,
        weekday: Number(day),
        sections: low + "-" + high,
        weeks: ws,
        start: begin,
        end,
      });
      for (const week of ws) {
        const sourceId = (
            await host.digest("SHA256", meta.id + "|" + block + "|" + week)
          ).slice(0, 32),
          event = {
            sourceId,
            name: name.slice(0, 200),
            date: plus(meta.start, (week - 1) * 7 + Number(day) - 1),
            start: begin,
            end,
            courseId: course.slice(0, 160),
            teacher,
            location,
            week,
            sections: low + "-" + high,
          };
        if (
          events.has(sourceId) &&
          JSON.stringify(events.get(sourceId)) !== JSON.stringify(event)
        )
          conflicts++;
        events.set(sourceId, event);
      }
    }
    if (raw.length && !events.size)
      throw fail("课程数据无法解析，未生成课表。", "COURSE_FORMAT");
    const warnings = [];
    if (skipped) warnings.push(`有 ${skipped} 条课程缺少日期或节次，未导入。`);
    if (conflicts)
      warnings.push(`有 ${conflicts} 条排课存在冲突，请核对课表。`);
    if (!meta.inferred) warnings.push("本次使用手动填写的学期开始日期。");
    return {
      provider: "bupt",
      accountKey,
      termId: meta.id,
      termStart: meta.start,
      termStartInferred: meta.inferred,
      fetchedAt: host.now(),
      courses: [...courses.values()],
      events: [...events.values()].sort(
        (a, b) =>
          a.date.localeCompare(b.date) ||
          a.start.localeCompare(b.start) ||
          a.name.localeCompare(b.name),
      ),
      warnings,
      complete: !skipped && !conflicts,
    };
  }
  function plain(value, max = 200) {
    return String(value || "")
      .replace(/<[^>]*>/g, " ")
      .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
      .replace(/&#x([0-9a-f]+);/gi, (_, n) =>
        String.fromCodePoint(parseInt(n, 16)),
      )
      .replace(
        /&(amp|lt|gt|quot|apos|nbsp);/g,
        (_, n) =>
          ({ amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " })[n],
      )
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, max);
  }
  function homework(payload, accountKey, now) {
    const raw = payload?.data?.undoneList;
    if (!Array.isArray(raw) || raw.length > 10000)
      throw fail("教学云作业列表格式已变化。", "CLOUD_FORMAT");
    const seen = new Set(),
      assignments = [];
    let ignored = 0;
    for (const row of raw) {
      if (!row || typeof row !== "object")
        throw fail("教学云作业条目格式异常。", "CLOUD_FORMAT");
      if (String(row.type) !== "3") {
        ignored++;
        continue;
      }
      const sourceId = String(row.activityId || ""),
        title = plain(row.activityName);
      if (!/^[A-Za-z0-9_-]{1,160}$/.test(sourceId) || !title)
        throw fail(
          "教学云作业缺少名称或编号，未导入任何条目。",
          "CLOUD_FORMAT",
        );
      if (seen.has(sourceId)) continue;
      seen.add(sourceId);
      let due = String(row.endTime || "").trim(),
        dueAt = "";
      if (due) {
        if (!/(?:Z|[+-]\d\d:\d\d)$/.test(due))
          due = due.replace(" ", "T") + "+08:00";
        const time = Date.parse(due);
        if (Number.isFinite(time))
          dueAt =
            new Date(time + 8 * 3600000).toISOString().slice(0, 16) + "+08:00";
      }
      const courseName = plain(row.siteName);
      assignments.push({
        sourceId,
        title,
        courseName,
        name: ((courseName ? courseName + "：" : "") + title).slice(0, 200),
        dueAt,
        url: "https://ucloud.bupt.edu.cn/",
      });
    }
    assignments.sort(
      (a, b) =>
        (a.dueAt || "9999").localeCompare(b.dueAt || "9999") ||
        a.name.localeCompare(b.name),
    );
    return {
      provider: "bupt-ucloud",
      accountKey,
      assignments,
      ignored,
      fetchedAt: now,
    };
  }
  function client(host) {
    const sessions = new Map();
    const origin = "https://jwglweixin.bupt.edu.cn",
      auth =
        "https://auth.bupt.edu.cn/authserver/login?service=https://ucloud.bupt.edu.cn",
      api = "https://apiucloud.bupt.edu.cn";
    async function json(url, form, headers = {}) {
      const result = await host.request({
        url,
        method: "POST",
        headers: {
          Accept: "application/json",
          ...(form
            ? { "Content-Type": "application/x-www-form-urlencoded" }
            : {}),
          ...headers,
        },
        body: form ? new URLSearchParams(form).toString() : "",
      });
      if (result.status !== 200)
        throw fail("学校服务暂时不可用，请稍后重试。", "UPSTREAM_HTTP");
      try {
        return JSON.parse(result.body);
      } catch (_) {
        throw fail("学校返回数据格式已变化。");
      }
    }
    async function fetchTimetable(account, password, fallback = "") {
      if (
        !/^[A-Za-z0-9._-]{4,32}$/.test(account) ||
        !password ||
        password.length > 256
      )
        throw fail("请填写有效账号与教务密码。", "SYNC_FAILED", 400);
      const login = await json(
          origin + "/bjyddx/login",
          { userNo: account, pwd: password },
          { Origin: origin, Referer: origin + "/sjd/" },
        ),
        token = login?.data?.token;
      if (typeof token !== "string" || !token.trim() || token.length > 8192)
        throw fail("教务登录没有返回有效会话。", "LOGIN_FORMAT");
      const headers = { token, Origin: origin, Referer: origin + "/sjd/" };
      return timetable(
        await json(origin + "/bjyddx/student/curriculum?week=", null, headers),
        await json(
          origin + "/bjyddx/student/curriculum?week=all",
          null,
          headers,
        ),
        (await host.digest("SHA256", "ketime-bupt:" + account)).slice(0, 24),
        fallback,
        host,
      );
    }
    async function cloudRequest(session, address, form, headers = {}) {
      const target = new URL(address);
      const cookie = Object.values(session.jar)
        .filter(
          (c) =>
            (c.host === target.hostname || !c.hostOnly && target.hostname.endsWith('.'+c.host)) && (target.pathname === c.path || target.pathname.startsWith(c.path) && (c.path.endsWith('/') || target.pathname.charAt(c.path.length)==='/')) && (!c.expiry || c.expiry > Date.now()),
        )
        .map((c) => c.pair)
        .join("; ");
      const result = await host.request({
        url: address,
        method: form ? "POST" : "GET",
        headers: {
          Referer: "https://ucloud.bupt.edu.cn/",
          ...(cookie ? { Cookie: cookie } : {}),
          ...(form
            ? { "Content-Type": "application/x-www-form-urlencoded" }
            : {}),
          ...headers,
        },
        body: form ? new URLSearchParams(form).toString() : "",
      });
      for (const line of result.cookies || []) {
        const parts = line.split(";"),
          pair = parts.shift().trim(),
          name = pair.split("=")[0];
        if (!/^[A-Za-z0-9_-]+$/.test(name)) continue;
        const attrs = {};
        for (const part of parts) {
          const index = part.indexOf("=");
          attrs[
            (index < 0 ? part : part.slice(0, index)).trim().toLowerCase()
          ] = index < 0 ? "" : part.slice(index + 1).trim();
        }
        const domain=attrs.domain?attrs.domain.toLowerCase().replace(/^\./,''):target.hostname;
        if(domain!==target.hostname && !(domain==='bupt.edu.cn' && target.hostname.endsWith('.bupt.edu.cn')))continue;
        const path = attrs.path?.startsWith("/")
          ? attrs.path
          : target.pathname.slice(0, target.pathname.lastIndexOf("/") + 1);
        const key=domain+'|'+path+'|'+name;
        if(attrs['max-age']!==undefined && Number(attrs['max-age'])<=0){delete session.jar[key];continue}
        session.jar[key] = {
          host: domain,
          hostOnly: !attrs.domain,
          expiry: attrs['max-age']!==undefined && Number.isFinite(Number(attrs['max-age']))?Date.now()+Number(attrs['max-age'])*1000:attrs.expires&&Number.isFinite(Date.parse(attrs.expires))?Date.parse(attrs.expires):0,
          path,
          pair,
        };
      }
      return result;
    }
    async function cloudJson(
      session,
      path,
      form = null,
      token = "",
      identity = "",
    ) {
      if (!path.startsWith("/ykt-basics/") && !path.startsWith("/ykt-site/"))
        throw fail("教学云接口不受支持。", "CLOUD_HOST");
      const result = await cloudRequest(session, api + path, form, {
        Authorization: "Basic cG9ydGFsOnBvcnRhbF9zZWNyZXQ=",
        "Tenant-Id": "000000",
        Accept: "application/json",
        ...(token ? { "Blade-Auth": token } : {}),
        ...(identity ? { Identity: identity } : {}),
      });
      if (result.status === 401 || result.status === 403)
        throw fail("教学云登录失效，请重新登录。", "CLOUD_AUTH", 401);
      if (result.status !== 200)
        throw fail("教学云服务暂时不可用。", "CLOUD_HTTP");
      let value;
      try {
        value = JSON.parse(result.body);
      } catch (_) {
        throw fail("教学云接口格式已变化。", "CLOUD_FORMAT");
      }
      if (
        !value ||
        typeof value !== "object" ||
        value.error ||
        value.success === false ||
        !["200", "0"].includes(String(value.code ?? 200))
      )
        throw fail("教学云请求失败，请重新登录。", "CLOUD_AUTH", 401);
      return value;
    }
    async function prepare() {
      const session = { jar: {}, cookie: "", time: Date.now() },
        result = await cloudRequest(session, auth),
        match = result.body.match(
          /<input\b(?=[^>]*\bname\s*=\s*["']execution["'])(?=[^>]*\bvalue\s*=\s*["']([^"']+)["'])[^>]*>/i,
        );
      if (result.status !== 200 || !match)
        throw fail(
          "统一认证页面已变化，无法读取登录表单。",
          "CLOUD_LOGIN_FORMAT",
        );
      session.execution = match[1];
      let captchaImage = "";
      const captcha = result.body.match(
        /config\.captcha[^{]*\{[^}]*id:\s*['"]([^'"]+)['"]/,
      );
      if (captcha) {
        const image = await cloudRequest(
            session,
            "https://auth.bupt.edu.cn/authserver/captcha?captchaId=" +
              encodeURIComponent(captcha[1]),
          ),
          mime = (image.headers?.["content-type"] || "").split(";")[0];
        if (
          image.status !== 200 ||
          !["image/png", "image/jpeg", "image/gif"].includes(mime) ||
          !image.base64 ||
          image.base64.length > 684000
        )
          throw fail("验证码暂时不可用。", "CLOUD_CAPTCHA");
        captchaImage = "data:" + mime + ";base64," + image.base64;
      }
      const loginId = await host.random();
      for (const [key, value] of sessions)
        if (Date.now() - value.time > 300000) sessions.delete(key);
      if (sessions.size >= 8) sessions.delete(sessions.keys().next().value);
      sessions.set(loginId, session);
      return { loginId, captchaImage, expiresIn: 300 };
    }
    async function fetchHomework(loginId, account, password, captcha = "") {
      if (
        !/^[A-Za-z0-9._-]{4,32}$/.test(account) ||
        !password ||
        password.length > 256 ||
        captcha.length > 32
      )
        throw fail("请填写有效统一认证账号与密码。", "CLOUD_INPUT", 400);
      const session = sessions.get(loginId);
      sessions.delete(loginId);
      if (!session || Date.now() - session.time > 300000)
        throw fail(
          "登录准备已过期，请重新点击准备登录。",
          "CLOUD_EXPIRED",
          400,
        );
      const result = await cloudRequest(
        session,
        auth,
        {
          username: account,
          password,
          type: "username_password",
          execution: session.execution,
          _eventId: "submit",
          submit: "登录",
          ...(captcha ? { captcha } : {}),
        },
        { Referer: auth },
      );
      if (result.status !== 302)
        throw fail(
          "统一认证登录失败，请检查密码或验证码。",
          "CLOUD_LOGIN_FAILED",
          401,
        );
      const redirect = new URL(result.headers?.location || "", auth);
      if (
        redirect.protocol !== "https:" ||
        redirect.hostname !== "ucloud.bupt.edu.cn"
      )
        throw fail("统一认证返回了非教学云地址。", "CLOUD_REDIRECT");
      const ticket = redirect.searchParams.get("ticket");
      if (!ticket || ticket.length > 8192)
        throw fail("统一认证未返回有效票据。", "CLOUD_TICKET");
      const initial = await cloudJson(session, "/ykt-basics/oauth/token", {
        ticket,
        grant_type: "third",
      });
      if (typeof initial.refresh_token !== "string" || !initial.refresh_token)
        throw fail("教学云未返回有效会话。", "CLOUD_TOKEN");
      const roles = (
        await cloudJson(
          session,
          "/ykt-basics/userroledomaindept/listByUserId",
          null,
          initial.refresh_token,
        )
      ).data;
      if (!Array.isArray(roles))
        throw fail("无法读取教学云学生身份。", "CLOUD_ROLE");
      const role = roles.find(
        (r) => r && (r.roleName === "学生" || r.roleCode === "JS005"),
      );
      if (!role?.id)
        throw fail("当前账号没有教学云学生身份。", "CLOUD_ROLE", 403);
      const user = await cloudJson(session, "/ykt-basics/oauth/token", {
        grant_type: "refresh_token",
        refresh_token: initial.refresh_token,
        identity: String(role.id),
      });
      if (
        typeof user.access_token !== "string" ||
        !user.access_token ||
        !user.user_id
      )
        throw fail("教学云学生会话无效。", "CLOUD_TOKEN");
      const data = await cloudJson(
        session,
        "/ykt-site/site/student/undone?userId=" +
          encodeURIComponent(user.user_id),
        null,
        user.access_token,
        "JS005:" + role.id,
      );
      return homework(
        data,
        (await host.digest("SHA256", "ketime-ucloud:" + account)).slice(0, 24),
        host.now(),
      );
    }
    return { fetchTimetable, prepare, fetchHomework };
  }
  return {
    weeks,
    items,
    term,
    timetable,
    homework,
    plain,
    client,
    validDate,
    fail,
  };
});
