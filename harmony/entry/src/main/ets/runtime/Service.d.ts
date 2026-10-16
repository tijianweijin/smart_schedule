export interface NativePort {
  invoke(operation: string, payload: string): Promise<string>;
}
export declare class Runtime {
  constructor(port: NativePort);
  dispatch(route: string, payload: string): Promise<string>;
  callback(query: string): Promise<string>;
}
