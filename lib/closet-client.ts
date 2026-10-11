import type { Asset, ClosetArchive, ClosetState } from "./domain";

/** Platform boundary. The web uses authenticated HTTP; Android commits to local SQLite. */
export interface ClosetClient {
  request(path: string, init?: RequestInit): Promise<Response>;
  assetUrl(hash: string, profile: string | null): string;
  uploadAsset?(file: File, profile: string): Promise<Asset>;
  exportArchive?(state: ClosetState): Promise<void>;
  pickArchive?(): Promise<{ manifest: ClosetArchive; handle: string } | null>;
  importArchive?(handle: string, manifest: ClosetArchive, profile: string): Promise<string>;
  saveAsset?(hash: string, profile: string): Promise<void>;
}
let client: ClosetClient | null = null;
export const installClosetClient = (value: ClosetClient) => { client = value; };
export const getClosetClient = () => client;
export const isLocalApp = () => client !== null;
