import { common } from '@kit.AbilityKit';
import { webview } from '@kit.ArkWeb';
import { picker, fileIo as fs } from '@kit.CoreFileKit';
import { util, url } from '@kit.ArkTS';
import { vibrator } from '@kit.SensorServiceKit';
import { Runtime } from '../runtime/Service';

interface BridgeData { route?: string; payload?: string; address?: string; json?: string; name?: string; }
interface BridgeMessage { id: string; token: string; op: string; data: BridgeData; }
interface BridgeReply { id: string; value: string; error: string; }
interface ImportedBackup { json: string; name: string; }

export class WebBridge {
  public trusted: boolean = false;
  private fileBusy: boolean = false;
  private context: common.UIAbilityContext;
  private controller: webview.WebviewController;
  private runtime: Runtime;
  private token: string;
  constructor(context: common.UIAbilityContext, controller: webview.WebviewController, runtime: Runtime, token: string) {
    this.context = context; this.controller = controller; this.runtime = runtime; this.token = token;
  }
  private isTrusted(): boolean { return this.trusted && this.controller.getUrl() === 'http://127.0.0.1:8766/'; }
  private reply(id: string, value: string, error: string = ''): void {
    if (!this.isTrusted()) return;
    const reply: BridgeReply = { id, value, error };
    this.controller.runJavaScript('window.__ketimeHarmonyReceive(' + JSON.stringify(reply) + ')').catch(() => {});
  }
  public postMessage(raw: string): void {
    if (!this.isTrusted() || raw.length > 22 * 1024 * 1024) return;
    try {
      const m = JSON.parse(raw) as BridgeMessage;
      if (m.token !== this.token || !/^\d{1,12}$/.test(m.id) || !m.data) return;
      this.handle(m).then((value: string) => this.reply(m.id, value)).catch(() => this.reply(m.id, '', '操作未完成或已取消，原数据未修改。'));
    } catch (_) {}
  }
  public async external(address: string): Promise<void> {
    const parsed = new url.URL(address);
    if (parsed.protocol !== 'https:' || parsed.username || parsed.password || (parsed.port && parsed.port !== '443')) throw new Error('链接不安全');
    await this.context.startAbility({ action: 'ohos.want.action.viewData', entities: ['entity.system.browsable'], uri: address });
  }
  private async handle(m: BridgeMessage): Promise<string> {
    if (m.op === 'api') return this.runtime.dispatch(m.data.route || '', m.data.payload || '{}');
    if (m.op === 'haptic') { await vibrator.startVibration({ type: 'time', duration: 12 }, { usage: 'touch' }); return ''; }
    if (m.op === 'openAuth') {
      const address = new url.URL(m.data.address || '');
      if (address.origin !== 'https://auth.openai.com' || address.pathname !== '/api/accounts/authorize') throw new Error('授权地址无效');
      await this.external(address.href); return '';
    }
    if (!['exportBackup', 'importBackup'].includes(m.op) || this.fileBusy) throw new Error('操作不受支持');
    this.fileBusy = true;
    try {
      const viewPicker = new picker.DocumentViewPicker(this.context);
      if (m.op === 'exportBackup') {
        const data = m.data.json || '';
        if (!data || new util.TextEncoder().encodeInto(data).length > 10 * 1024 * 1024) throw new Error('备份大小无效');
        JSON.parse(data);
        const name = (m.data.name || '刻时备份.json').replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_').slice(0,120);
        const locations = await viewPicker.save({ newFileNames: [name.endsWith('.json') ? name : name + '.json'], fileSuffixChoices: ['JSON|.json'] });
        if (!locations.length) return '';
        const file = await fs.open(locations[0], fs.OpenMode.READ_WRITE | fs.OpenMode.CREATE | fs.OpenMode.TRUNC);
        try { const bytes = new util.TextEncoder().encodeInto(data); let offset = 0;
          while (offset < bytes.length) { const count = await fs.write(file.fd, bytes.slice(offset).buffer); if (count <= 0) throw new Error('备份写入中断'); offset += count; }
        } finally { await fs.close(file); }
        return 'saved';
      }
      const locations = await viewPicker.select({ maxSelectNumber: 1, fileSuffixFilters: ['JSON|.json'] });
      if (!locations.length) return '';
      const file = await fs.open(locations[0], fs.OpenMode.READ_ONLY);
      try {
        const stat = await fs.stat(file.fd); if (stat.size > 10 * 1024 * 1024) throw new Error('备份文件过大');
        const bytes = new ArrayBuffer(stat.size); let offset = 0;
        while (offset < stat.size) { const chunk = new ArrayBuffer(stat.size - offset), count = await fs.read(file.fd, chunk); if (count <= 0) throw new Error('备份读取中断'); new Uint8Array(bytes).set(new Uint8Array(chunk, 0, count), offset); offset += count; }
        const result: ImportedBackup = { json: util.TextDecoder.create('utf-8', { fatal: true }).decodeWithStream(new Uint8Array(bytes)), name: '刻时备份.json' };
        return JSON.stringify(result);
      } finally { await fs.close(file); }
    } finally { this.fileBusy = false; }
  }
}
