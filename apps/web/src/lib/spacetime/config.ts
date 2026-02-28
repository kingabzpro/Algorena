export const DEFAULT_SPACETIMEDB_URL = "wss://maincloud.spacetimedb.com";
export const DEFAULT_SPACETIMEDB_DB_NAME = "algorena-mvp";

export const clientSpacetimeConfig = {
  url: process.env.NEXT_PUBLIC_SPACETIMEDB_URL ?? DEFAULT_SPACETIMEDB_URL,
  dbName:
    process.env.NEXT_PUBLIC_SPACETIMEDB_NAME ?? DEFAULT_SPACETIMEDB_DB_NAME,
};

export const SPACETIME_TOKEN_STORAGE_KEY = "algorena.spacetimedb.token";
