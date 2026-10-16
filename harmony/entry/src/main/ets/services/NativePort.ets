import { common } from '@kit.AbilityKit';
import { asset } from '@kit.AssetStoreKit';
import { cryptoFramework } from '@kit.CryptoArchitectureKit';
import { util, url } from '@kit.ArkTS';
import { rcp } from '@kit.RemoteCommunicationKit';
import { socket } from '@kit.NetworkKit';
import { BusinessError } from '@kit.BasicServicesKit';

interface NetworkRequest { url: string; method: string; headers: Record<string, string>; body: string; }
interface NetworkResponse { status: number; body: string; base64: string; headers: Record<string, string>; cookies: string[]; }
interface VaultPayload { name: string; value?: string; }
interface DigestPayload { algorithm: string; value: string; }
interface VerifyPayload { algorithm: string; bits: number; spki: string; signature: string; message: string; }
interface VaultManifest { version: number; generation: string; count: number; digest: string; }

const encoder = new util.TextEncoder();
const decoder = util.TextDecoder.create('utf-8');
const base64 = new util.Base64Helper();

export class HarmonyPort {
  private vaultQueue: Promise<void> = Promise.resolve();
  private server: socket.TCPSocketServer | undefined = undefined;
  private callback: ((query: string) => Promise<string>) | undefined = undefined;
  constructor(context: common.UIAbilityContext) {}
  setCallback(callback: (query: string) => Promise<string>): void { this.callback = callback; }
  private alias(name: string, suffix: string = ''): Uint8Array {
    if (!['school', 'chatgpt', 'deepseek', 'kimi', 'minimax'].includes(name)) throw new Error('凭据库名称无效');
    return encoder.encodeInto('cn.ketime.harmony.v1.' + name + suffix);
  }
  private async assetRead(alias: Uint8Array): Promise<Uint8Array | undefined> {
    const query: asset.AssetMap = new Map();
    query.set(asset.Tag.ALIAS, alias); query.set(asset.Tag.RETURN_TYPE, asset.ReturnType.ALL);
    try {
      const rows = await asset.query(query);
      if (rows.length !== 1) throw new Error('凭据库记录无效');
      return rows[0].get(asset.Tag.SECRET) as Uint8Array;
    } catch (error) {
      if ((error as BusinessError).code === 24000002) return undefined;
      throw new Error('本机加密凭据不可读取；原记录未更改');
    }
  }
  private async assetWrite(alias: Uint8Array, value: Uint8Array): Promise<void> {
    const query: asset.AssetMap = new Map(); query.set(asset.Tag.ALIAS, alias);
    const attributes: asset.AssetMap = new Map(); attributes.set(asset.Tag.SECRET, value);
    try { await asset.update(query, attributes); } catch (error) {
      if ((error as BusinessError).code !== 24000002) throw new Error('本机加密保存失败；原记录未更改');
      attributes.set(asset.Tag.ALIAS, alias);
      attributes.set(asset.Tag.ACCESSIBILITY, asset.Accessibility.DEVICE_FIRST_UNLOCKED);
      attributes.set(asset.Tag.SYNC_TYPE, asset.SyncType.NEVER);
      await asset.add(attributes);
    }
  }
  private manifest(bytes: Uint8Array): VaultManifest {
    const value = JSON.parse(decoder.decodeWithStream(bytes)) as VaultManifest;
    if (value.version !== 1 || !/^[a-f0-9]{24}$/.test(value.generation) || !Number.isInteger(value.count) || value.count < 1 || value.count > 256 || !/^[a-f0-9]{64}$/.test(value.digest)) throw new Error('凭据索引损坏，原数据未修改');
    return value;
  }
  private async sha(bytes: Uint8Array): Promise<string> {
    const md = cryptoFramework.createMd('SHA256'); await md.update({ data: bytes });
    return Array.from((await md.digest()).data).map((n: number) => n.toString(16).padStart(2, '0')).join('');
  }
  private async removeParts(name: string, generation: string, count: number): Promise<void> {
    for (let i = 0; i < count; i++) { const query: asset.AssetMap = new Map(); query.set(asset.Tag.ALIAS, this.alias(name, '.' + generation + '.' + i)); try { await asset.remove(query); } catch (_) {} }
  }
  private async vaultRead(name: string): Promise<string> {
    const index = await this.assetRead(this.alias(name)); if (index === undefined) return '';
    const m = this.manifest(index), pieces: Uint8Array[] = []; let size = 0;
    for (let i = 0; i < m.count; i++) { const piece = await this.assetRead(this.alias(name, '.' + m.generation + '.' + i)); if (piece === undefined) throw new Error('凭据记录不完整，原数据未修改'); pieces.push(piece); size += piece.length; }
    const bytes = new Uint8Array(size); let offset = 0; for (const piece of pieces) { bytes.set(piece, offset); offset += piece.length; }
    if (await this.sha(bytes) !== m.digest) throw new Error('凭据校验未通过，原数据未修改');
    return decoder.decodeWithStream(bytes);
  }
  private async vaultWrite(name: string, value: string): Promise<void> {
    const bytes = encoder.encodeInto(value); if (!bytes.length || bytes.length > 262144) throw new Error('凭据大小无效');
    const old = await this.assetRead(this.alias(name)), previous = old === undefined ? undefined : this.manifest(old);
    const generation = Array.from(cryptoFramework.createRandom().generateRandomSync(12).data).map((n: number) => n.toString(16).padStart(2, '0')).join('');
    const count = Math.ceil(bytes.length / 1024); let written = 0;
    try {
      for (let i = 0; i < count; i++) { await this.assetWrite(this.alias(name, '.' + generation + '.' + i), bytes.slice(i * 1024, (i + 1) * 1024)); written++; }
      const index: VaultManifest = { version: 1, generation, count, digest: await this.sha(bytes) };
      await this.assetWrite(this.alias(name), encoder.encodeInto(JSON.stringify(index)));
    } catch (_) { await this.removeParts(name, generation, written); throw new Error('本机加密保存失败，原记录未覆盖'); }
    if (previous !== undefined) await this.removeParts(name, previous.generation, previous.count);
  }
  private async request(data: NetworkRequest): Promise<string> {
    const address = new url.URL(data.url);
    const paths: Record<string, string[]> = {
      'jwglweixin.bupt.edu.cn': ['/bjyddx/login', '/bjyddx/student/curriculum'],
      'auth.bupt.edu.cn': ['/authserver/login', '/authserver/captcha'],
      'apiucloud.bupt.edu.cn': ['/ykt-basics/oauth/token', '/ykt-basics/userroledomaindept/listByUserId', '/ykt-site/site/student/undone'],
      'auth.openai.com': ['/api/accounts/oauth/token', '/api/accounts/oauth/revoke', '/.well-known/jwks.json'],
      'api.openai.com': ['/v1/models', '/v1/responses'],
      'api.deepseek.com': ['/models', '/chat/completions'],
      'api.moonshot.cn': ['/v1/models', '/v1/chat/completions'],
      'api.minimax.cn': ['/v1/models', '/v1/chat/completions']
    };
    if (address.protocol !== 'https:' || address.username || address.password || (address.port && address.port !== '443') || !paths[address.hostname]?.includes(address.pathname)) throw new Error('请求地址不受支持');
    if (!['GET', 'POST'].includes(data.method) || data.body.length > 262144) throw new Error('请求参数无效');
    const session = rcp.createSession({ requestConfiguration: { transfer: { autoRedirect: false, timeout: { connectMs: 25000, transferMs: 90000 } }, proxy: 'no-proxy' } });
    try {
      const request = new rcp.Request(data.url, data.method as rcp.HttpMethod, data.headers, data.method === 'POST' ? data.body : undefined);
      const response = await session.fetch(request);
      const bytes = new Uint8Array(response.body || new ArrayBuffer(0));
      if (bytes.byteLength > 4 * 1024 * 1024) throw new Error('返回数据过大');
      const headers: Record<string, string> = {};
      const cookies: string[] = [];
      Object.keys(response.headers).forEach((name: string) => {
        const value = response.headers[name];
        if (value !== undefined) headers[name.toLowerCase()] = Array.isArray(value) ? value.join(', ') : value;
        if (name.toLowerCase() === 'set-cookie' && value !== undefined) { if (Array.isArray(value)) cookies.push(...value); else cookies.push(value); }
      });
      const result: NetworkResponse = { status: response.statusCode, body: decoder.decodeWithStream(bytes), base64: base64.encodeToStringSync(bytes), headers, cookies };
      return JSON.stringify(result);
    } finally { session.close(); }
  }
  private async listen(): Promise<void> {
    if (this.server !== undefined) return;
    const server = socket.constructTCPSocketServerInstance();
    await server.listen({ address: '127.0.0.1', port: 8766, family: 1 });
    server.on('connect', (connection: socket.TCPSocketConnection) => {
      let text = ''; let handled = false;
      const timeout = setTimeout(() => { connection.close().catch(() => {}); }, 15000);
      connection.on('message', (message: socket.SocketMessageInfo) => {
        if (handled) return;
        text += decoder.decodeWithStream(new Uint8Array(message.message));
        if (text.length > 20000) { handled = true; clearTimeout(timeout); connection.close().catch(() => {}); return; }
        if (!text.includes('\r\n\r\n')) return;
        handled = true; clearTimeout(timeout);
        this.answerCallback(connection, text).catch(() => { connection.close().catch(() => {}); });
      });
    });
    this.server = server;
  }
  private async answerCallback(connection: socket.TCPSocketConnection, text: string): Promise<void> {
    let body = '授权未完成，请返回刻时重试。';
    const line = text.split('\r\n')[0];
    const match = line.match(/^GET (\/auth\/callback\?[^ ]{1,16384}) HTTP\/1\.[01]$/);
    const host = text.split('\r\n').find((line: string) => line.toLowerCase().startsWith('host:'));
    if (match && host?.slice(5).trim() === '127.0.0.1:8766' && this.callback !== undefined) {
      try { await this.callback(match[1].slice(match[1].indexOf('?') + 1)); body = 'ChatGPT 已连接，请返回刻时。'; } catch (_) { body = '授权未完成，请返回刻时查看提示并重试。'; }
    }
    const html = '<!doctype html><meta charset="utf-8"><h2>' + body + '</h2><p>可以关闭此页面。</p>';
    const bytes = encoder.encodeInto(html);
    const header = 'HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=utf-8\r\nContent-Security-Policy: default-src \'none\'\r\nCache-Control: no-store\r\nConnection: close\r\nContent-Length: ' + bytes.byteLength + '\r\n\r\n';
    await connection.send({ data: header + html }); await connection.close();
  }
  async invoke(operation: string, payload: string): Promise<string> {
    if (payload.length > 300000) throw new Error('请求过大');
    if (operation === 'http') return this.request(JSON.parse(payload) as NetworkRequest);
    if (operation === 'vault.read' || operation === 'vault.write') {
      const data = JSON.parse(payload) as VaultPayload;
      const pending = this.vaultQueue.then(async (): Promise<string> => {
        if (operation === 'vault.read') return this.vaultRead(data.name);
        await this.vaultWrite(data.name, data.value || ''); return '';
      });
      this.vaultQueue = pending.then(() => {}, () => {});
      return pending;
    }
    if (operation === 'random') return base64.encodeToStringSync(cryptoFramework.createRandom().generateRandomSync(48).data).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    if (operation === 'digest') { const data = JSON.parse(payload) as DigestPayload; if (!['SHA256', 'MD5'].includes(data.algorithm)) throw new Error('摘要算法无效'); const md = cryptoFramework.createMd(data.algorithm); await md.update({ data: encoder.encodeInto(data.value) }); const value = (await md.digest()).data; return Array.from(value).map((n: number) => n.toString(16).padStart(2, '0')).join(''); }
    if (operation === 'base64.decode') return decoder.decodeWithStream(base64.decodeSync(payload.replace(/-/g, '+').replace(/_/g, '/')));
    if (operation === 'verify') {
      const data = JSON.parse(payload) as VerifyPayload;
      if (!(data.algorithm === 'RS256' && [2048, 3072, 4096, 8192].includes(data.bits) || data.algorithm === 'ES256' && data.bits === 256)) throw new Error('签名算法不受支持');
      const algorithm = data.algorithm === 'RS256' ? 'RSA' + data.bits : 'ECC256';
      const pair = await cryptoFramework.createAsyKeyGenerator(algorithm).convertKey({ data: base64.decodeSync(data.spki) }, null);
      const verifier = cryptoFramework.createVerify(algorithm + (data.algorithm === 'RS256' ? '|PKCS1|SHA256' : '|SHA256'));
      await verifier.init(pair.pubKey); await verifier.update({ data: encoder.encodeInto(data.message) });
      return String(await verifier.verify(null, { data: base64.decodeSync(data.signature) }));
    }
    if (operation === 'oauth.listen') { await this.listen(); return ''; }
    throw new Error('原生操作不受支持');
  }
}
