/*
 * Copyright (c) 2026 Huawei Device Co., Ltd.
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { common } from '@kit.AbilityKit';
import { webview } from '@kit.ArkWeb';
import { url } from '@kit.ArkTS';
import { HarmonyPort } from '../services/NativePort';
import { Runtime } from '../runtime/Service';
import { WebBridge } from '../services/WebBridge';

@Entry
@Component
struct Index {
  @State ready: boolean = false;
  @State startupError: boolean = false;
  private controller: webview.WebviewController = new webview.WebviewController();
  private context: common.UIAbilityContext = getContext(this) as common.UIAbilityContext;
  private nativePort: HarmonyPort = new HarmonyPort(this.context);
  private runtime: Runtime = new Runtime(this.nativePort);
  private token: string = '';
  private bridge: WebBridge = new WebBridge(this.context, this.controller, this.runtime, '');
  aboutToAppear(): void {
    this.nativePort.setCallback((query: string): Promise<string> => this.runtime.callback(query));
    this.nativePort.invoke('random', '').then((token: string) => {
      this.token = token; this.bridge = new WebBridge(this.context, this.controller, this.runtime, token); this.ready = true;
    }).catch(() => { this.startupError = true; });
  }
  onBackPress(): boolean {
    if (!this.ready) return false;
    this.controller.runJavaScript('Boolean(window.KetimeAndroid && window.KetimeAndroid.back())').then((result: string) => {
      if (result !== 'true') this.context.terminateSelf().catch(() => {});
    }).catch(() => {});
    return true;
  }
  private resource(request: WebResourceRequest): WebResourceResponse {
    const response = new WebResourceResponse(); response.setResponseEncoding('utf-8');
    response.setResponseCode(403); response.setReasonMessage('Blocked'); response.setResponseMimeType('text/plain'); response.setResponseData('Blocked');
    try {
      const address = new url.URL(request.getRequestUrl());
      if (address.origin !== 'http://127.0.0.1:8766' || request.getRequestMethod() !== 'GET' || address.search || address.hash) return response;
      const file = address.pathname === '/' ? 'index.html' : address.pathname.slice(1);
      if (!['index.html', 'android-mobile.js', 'android-mobile.css', 'harmony-bridge.js'].includes(file)) return response;
      const bytes = this.context.resourceManager.getRawFileContentSync('web/' + file);
      response.setResponseData(bytes.buffer as ArrayBuffer); response.setResponseCode(200); response.setReasonMessage('OK');
      response.setResponseMimeType(file.endsWith('.css') ? 'text/css' : file.endsWith('.js') ? 'text/javascript' : 'text/html');
      response.setResponseHeader([
        { headerKey: 'Cache-Control', headerValue: 'no-store' },
        { headerKey: 'X-Content-Type-Options', headerValue: 'nosniff' },
        { headerKey: 'Content-Security-Policy', headerValue: "default-src 'none'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self'; font-src 'self'; object-src 'none'; base-uri 'none'; frame-src 'none'" }
      ]);
    } catch (_) {}
    return response;
  }
  build() {
    Column() {
      if (this.ready) {
        Web({ src: 'http://127.0.0.1:8766/', controller: this.controller })
          .javaScriptAccess(true).domStorageAccess(true).fileAccess(false).databaseAccess(false)
          .mixedMode(MixedMode.None).zoomAccess(false).backgroundColor('#F7F6F3')
          .javaScriptProxy({ object: this.bridge, name: 'KetimeHarmonyHost', methodList: ['postMessage'], controller: this.controller })
          .onInterceptRequest((event: OnInterceptRequestEvent): WebResourceResponse => this.resource(event.request))
          .onPageBegin(() => { this.bridge.trusted = false; })
          .onPageEnd((event: OnPageEndEvent) => {
            this.bridge.trusted = event.url === 'http://127.0.0.1:8766/';
            if (this.bridge.trusted) this.controller.runJavaScript('window.__ketimeHarmonyReady(' + JSON.stringify(this.token) + ')').catch(() => {});
          })
          .onOverrideUrlLoading((request: WebResourceRequest): boolean => {
            const address = request.getRequestUrl();
            if (address === 'http://127.0.0.1:8766/') return false;
            if (this.bridge.trusted && address.startsWith('https://')) this.bridge.external(address).catch(() => {});
            return true;
          })
          .width('100%').height('100%')
      } else {
        Text(this.startupError ? '刻时启动未完成，请重新打开。原数据未删除。' : '正在准备刻时…').fontColor('#2A8052').padding(24)
      }
    }.width('100%').height('100%').backgroundColor('#F7F6F3')
  }
}
