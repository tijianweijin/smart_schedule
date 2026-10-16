(function () {
  "use strict";
  window.KetimeHarmony = true;
  var token = "",
    readyResolve,
    pending = new Map(),
    counter = 0;
  var ready = new Promise(function (resolve) {
    readyResolve = resolve;
  });
  window.__ketimeHarmonyReady = function (value) {
    if (token || typeof value !== "string" || value.length < 32) return;
    token = value;
    window.__ketimeAndroidToken = value;
    readyResolve();
  };
  window.__ketimeHarmonyReceive = function (reply) {
    var entry = pending.get(reply.id);
    if (!entry) return;
    pending.delete(reply.id);
    clearTimeout(entry.timer);
    if (reply.error) entry.reject(Error(reply.error));
    else entry.resolve(reply.value);
  };
  function call(op, data) {
    return ready.then(function () {
      return new Promise(function (resolve, reject) {
        var id = String(++counter),
          entry = {
            resolve: resolve,
            reject: reject,
            timer: setTimeout(function () {
              pending.delete(id);
              reject(Error("本机操作超时，请稍后重试。"));
            }, 150000),
          };
        pending.set(id, entry);
        try {
          window.KetimeHarmonyHost.postMessage(
            JSON.stringify({ id: id, token: token, op: op, data: data }),
          );
        } catch (e) {
          clearTimeout(entry.timer);
          pending.delete(id);
          reject(Error("本机连接未就绪，请重新打开刻时。"));
        }
      });
    });
  }
  window.KetimeNative = {
    openAuth: function (t, address) {
      if (t === token)
        call("openAuth", { address: address }).catch(function (e) {
          alert(e.message);
        });
    },
    exportBackup: function (t, json, name) {
      if (t === token)
        call("exportBackup", { json: json, name: name }).catch(function (e) {
          alert(e.message);
        });
    },
    haptic: function (t) {
      if (t === token) call("haptic", {}).catch(function () {});
    },
  };
  var originalFetch = window.fetch;
  window.fetch = function (resource, options) {
    var address;
    try {
      address = new URL(
        typeof resource === "string" ? resource : resource.url,
        location.href,
      );
    } catch (_) {
      return Promise.reject(Error("请求地址无效。"));
    }
    if (address.origin !== location.origin)
      return Promise.reject(Error("已阻止页面直接访问外部网络。"));
    if (!address.pathname.startsWith("/api/"))
      return originalFetch.apply(window, arguments);
    options = options || {};
    var method = options.method || "GET",
      body = options.body || "{}";
    if (
      address.search ||
      address.hash ||
      (method !== "POST" &&
        !(method === "GET" && address.pathname === "/api/config")) ||
      typeof body !== "string"
    )
      return Promise.reject(Error("本机请求格式无效。"));
    return call("api", { route: address.pathname, payload: body }).then(
      function (value) {
        var response = JSON.parse(value);
        return new Response(JSON.stringify(response.body), {
          status: response.status,
          headers: { "Content-Type": "application/json" },
        });
      },
    );
  };
  document.addEventListener("DOMContentLoaded", function () {
    document.title = "刻时 HarmonyOS 1.0";
    var accountNote=document.querySelector('#settings-account-section .bupt-note');
    if(accountNote)accountNote.textContent='账号、两种密码和模型授权由鸿蒙 AssetStore 在本机加密保存；不会进入浏览器存储、日程备份或代码仓库。卸载或清除应用数据后需重新配置。';
    var note = document.getElementById("settings-local-hint");
    if (note)
      note.textContent =
        "账号、密码和 API 密钥由鸿蒙应用本机加密保存，不进入网页存储或日程备份；卸载或清除数据后需要重新配置。";
    var privacy = document.getElementById("settings-data-privacy");
    if (privacy)
      privacy.querySelectorAll("p").forEach(function (p) {
        p.textContent = p.textContent
          .replace(/Android Keystore/g, "鸿蒙 AssetStore")
          .replace(/Android 安装版/g, "鸿蒙安装版");
      });
  });
  document.addEventListener(
    "click",
    function (event) {
      var input = event.target;
      if (!(input instanceof HTMLInputElement) || input.type !== "file") return;
      event.preventDefault();
      call("importBackup", {})
        .then(function (value) {
          if (!value) return;
          var result = JSON.parse(value),
            transfer = new DataTransfer();
          transfer.items.add(
            new File([result.json], result.name, { type: "application/json" }),
          );
          input.files = transfer.files;
          input.dispatchEvent(new Event("change", { bubbles: true }));
        })
        .catch(function (e) {
          alert(e.message);
        });
    },
    true,
  );
})();
