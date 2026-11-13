import type { BackgroundTransport } from "./background-client";

export interface NativePlatform {
  version: string;
  packaged: boolean;
  resources: string;
  appRoot: string;
  assertExclusive?(): Promise<void>;
  vault: {
    available(): boolean | Promise<boolean>;
    encrypt(value: string): Buffer | Promise<Buffer>;
    decrypt(value: Buffer): string | Promise<string>;
  };
  updates: {
    initialize(): Promise<void>;
    check(): Promise<unknown>;
    status(): { state: string };
    restart(): unknown;
  };
  createBackground(root: string, command: string, args: string[]): BackgroundTransport;
  openExternal(url: string): Promise<void>;
  openPath(filename: string): Promise<string>;
  openDialog(options: Record<string, unknown>): Promise<{ canceled: boolean; filePaths: string[] }>;
  saveDialog(options: Record<string, unknown>): Promise<{ canceled: boolean; filePath?: string }>;
  messageDialog(options: Record<string, unknown> & { message: string }): Promise<{ response: number }>;
}
