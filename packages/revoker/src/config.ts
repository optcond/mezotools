import {
  EnvironmentType,
  MEZO_EXPLORER_API_BASE_URL,
  MezoChain,
} from "@mtools/shared";

export interface RevokerConfig {
  environment: EnvironmentType;
  chainId: number;
  mezoRpcUrl: string;
  blockscoutApiBaseUrl: string;
  supabaseUrl?: string;
  supabaseServiceKey?: string;
  indexerName: string;
  blockRangeSize: number;
  requestCooldownMs: number;
  requestTimeoutMs: number;
  confirmationBlocks: number;
  maxRangesPerRun: number;
  backfillLoopPauseMs: number;
  forwardFillFlushSize: number;
  upsertBatchSize: number;
  devHistoryBlockLimit: number;
}

function parsePositiveInt(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function defaultClassicBlockscoutApiUrl(): string {
  return MEZO_EXPLORER_API_BASE_URL.replace(/\/api\/v2\/?$/, "/api");
}

export interface LoadConfigOptions {
  requireSupabase?: boolean;
}

export function loadConfig(
  env: NodeJS.ProcessEnv,
  options: LoadConfigOptions = {},
): RevokerConfig {
  const requireSupabase = options.requireSupabase ?? true;
  const environment =
    env.ENVIRONMENT?.toLowerCase() === "prod"
      ? EnvironmentType.PROD
      : EnvironmentType.DEV;

  const mezoRpcUrl = env.MEZO_RPC_URL;
  let supabaseUrl: string | undefined;
  let supabaseServiceKey: string | undefined;

  if (environment === EnvironmentType.DEV) {
    supabaseUrl = env.SUPABASE_URL_DEV;
    supabaseServiceKey =
      env.SUPABASE_SERVICE_ROLE_KEY_DEV ?? env.SUPABASE_SERVICE_KEY;
  } else {
    supabaseUrl = env.SUPABASE_URL;
    supabaseServiceKey =
      env.SUPABASE_SERVICE_ROLE_KEY ?? env.SUPABASE_SERVICE_KEY;
  }

  if (!mezoRpcUrl) {
    throw new Error("MEZO_RPC_URL env variable is missing");
  }

  if (requireSupabase && !supabaseUrl) {
    throw new Error("SUPABASE_URL env variable is missing");
  }

  if (requireSupabase && !supabaseServiceKey) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY env variable is missing (service role required for inserts)",
    );
  }

  return {
    environment,
    chainId: parsePositiveInt(env.REVOKER_CHAIN_ID, MezoChain.id),
    mezoRpcUrl,
    blockscoutApiBaseUrl:
      env.REVOKER_BLOCKSCOUT_API_BASE_URL ?? defaultClassicBlockscoutApiUrl(),
    supabaseUrl,
    supabaseServiceKey,
    indexerName: env.REVOKER_INDEXER_NAME ?? "revoker",
    blockRangeSize: parsePositiveInt(env.REVOKER_BLOCK_RANGE_SIZE, 1_000),
    requestCooldownMs: parsePositiveInt(env.REVOKER_REQUEST_COOLDOWN_MS, 500),
    requestTimeoutMs: parsePositiveInt(env.REVOKER_REQUEST_TIMEOUT_MS, 20_000),
    confirmationBlocks: parsePositiveInt(env.REVOKER_CONFIRMATION_BLOCKS, 10),
    maxRangesPerRun: parsePositiveInt(env.REVOKER_MAX_RANGES_PER_RUN, 50),
    backfillLoopPauseMs: parsePositiveInt(
      env.REVOKER_BACKFILL_LOOP_PAUSE_MS,
      2_000,
    ),
    forwardFillFlushSize: parsePositiveInt(
      env.REVOKER_FORWARD_FILL_FLUSH_SIZE,
      5_000,
    ),
    upsertBatchSize: parsePositiveInt(env.REVOKER_UPSERT_BATCH_SIZE, 500),
    devHistoryBlockLimit: parsePositiveInt(
      env.REVOKER_DEV_HISTORY_BLOCK_LIMIT,
      200_000,
    ),
  };
}
