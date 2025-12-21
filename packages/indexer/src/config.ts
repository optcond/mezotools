import { EnvironmentType, ProviderType } from "@mtools/shared";

export interface IndexerConfig {
  environment: EnvironmentType;
  mezoRpcType: ProviderType;
  mezoRpcUrl: string;
  ethereumRpcType: ProviderType;
  ethereumRpcUrl: string;
  supabaseUrl: string;
  supabaseServiceKey: string;
  liquidationChunkSize: number;
  redemptionChunkSize: number;
}

function parsePositiveInt(value: string | undefined, fallback: number): number {
  if (!value) {
    return fallback;
  }
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function loadConfig(env: NodeJS.ProcessEnv) {
  const environment =
    env.ENVIRONMENT?.toLowerCase() === "prod"
      ? EnvironmentType.PROD
      : EnvironmentType.DEV;
  const mezoRpcType =
    env.MEZO_RPC_TYPE === "websocket"
      ? ProviderType.WEBSOCKET
      : ProviderType.HTTP;
  const mezoRpcUrl = env.MEZO_RPC_URL;
  const ethereumRpcType =
    env.ETHEREUM_RPC_TYPE === "websocket"
      ? ProviderType.WEBSOCKET
      : ProviderType.HTTP;
  const ethereumRpcUrl = env.ETHEREUM_RPC_URL;

  let supabaseUrl: string | undefined, supabaseServiceKey: string | undefined;

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

  if (!ethereumRpcUrl) {
    throw new Error("ETHEREUM_RPC_URL env variable is missing");
  }

  if (!supabaseUrl) {
    throw new Error("SUPABASE_URL env variable is missing");
  }

  if (!supabaseServiceKey) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY env variable is missing (service role required for inserts)"
    );
  }

  return {
    environment,
    mezoRpcType,
    mezoRpcUrl,
    ethereumRpcType,
    ethereumRpcUrl,
    supabaseUrl,
    supabaseServiceKey,
    liquidationChunkSize: parsePositiveInt(env.LIQUIDATION_CHUNK_SIZE, 1_000),
    redemptionChunkSize: parsePositiveInt(env.REDEMPTION_CHUNK_SIZE, 1_000),
    cowFiPk: env.COW_FI_PK as `0x${string}`,
  };
}
