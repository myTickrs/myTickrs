import type {
  AiContext,
  AiFileKind,
  ExtractResult,
  ImportConfig,
  Mapping,
  StructuredRecords,
  StructuredSample,
} from '@tickrs/shared';
import type { Ctx } from '../context.js';

export interface ImportAi {
  config(ctx: Ctx): Promise<ImportConfig['ai']>;
  extract(ctx: Ctx, file: AiFile, context: AiContext): Promise<ExtractResult>;
  proposeMapping(ctx: Ctx, sample: StructuredSample, context: AiContext): Promise<Mapping>;
  readRecords(ctx: Ctx, records: StructuredRecords, context: AiContext): Promise<ExtractResult>;
  signIn?: AiSignIn;
}

export interface AiFile {
  name: string;
  kind: AiFileKind;
  mediaType: string;
  data: string;
}

export interface AiSignIn {
  start(provider: string, redirectUri: string): { authorizeUrl: string };
  owns(state: string | undefined): boolean;
  complete(callback: {
    state?: string;
    code?: string;
    error?: string;
    errorDescription?: string;
  }): Promise<string>;
  signOut(): void;
}
