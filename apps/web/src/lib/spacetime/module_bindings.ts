import {
  DbConnectionBuilder as BaseDbConnectionBuilder,
  DbConnectionImpl as BaseDbConnectionImpl,
  SubscriptionBuilderImpl as BaseSubscriptionBuilderImpl,
  convertToAccessorMap,
  makeQueryBuilder,
  procedures,
  reducerSchema,
  reducers,
  schema,
  t,
  table,
  type DbConnectionConfig,
  type ErrorContextInterface,
  type EventContextInterface,
  type QueryBuilder,
  type ReducerEventContextInterface,
  type RemoteModule,
  type SubscriptionEventContextInterface,
  type SubscriptionHandleImpl,
} from "spacetimedb";

const tablesSchema = schema({
  marketState: table(
    {
      name: "marketState",
    },
    {
      symbol: t.string().primaryKey(),
      priceUsd: t.f64(),
      updatedAtMs: t.f64(),
    }
  ),
  prediction: table(
    {
      name: "prediction",
    },
    {
      id: t.u32().primaryKey().autoInc(),
      userAlias: t.string(),
      symbol: t.string(),
      direction: t.string(),
      horizonMinutes: t.u16(),
      entryPriceUsd: t.f64(),
      createdAtMs: t.f64(),
      resolveAtMs: t.f64(),
      resolved: t.bool(),
      correct: t.bool(),
    }
  ),
  leaderboard: table(
    {
      name: "leaderboard",
    },
    {
      userAlias: t.string().primaryKey(),
      score: t.i32(),
      wins: t.u32(),
      losses: t.u32(),
      total: t.u32(),
    }
  ),
});

const reducersSchema = reducers(
  reducerSchema("submitPrediction", {
    userAlias: t.string(),
    symbol: t.string(),
    direction: t.string(),
    horizonMinutes: t.u16(),
  }),
  reducerSchema("upsertMarketTick", {
    symbol: t.string(),
    priceUsd: t.f64(),
    atMs: t.f64(),
  })
);

const proceduresSchema = procedures();

const REMOTE_MODULE = {
  versionInfo: {
    cliVersion: "2.0.0" as const,
  },
  tables: tablesSchema.schemaType.tables,
  reducers: reducersSchema.reducersType.reducers,
  ...proceduresSchema,
} satisfies RemoteModule<
  typeof tablesSchema.schemaType,
  typeof reducersSchema.reducersType,
  typeof proceduresSchema
>;

export const tables: QueryBuilder<typeof tablesSchema.schemaType> =
  makeQueryBuilder(tablesSchema.schemaType);

export const reducersMap = convertToAccessorMap(reducersSchema.reducersType.reducers);

export type EventContext = EventContextInterface<typeof REMOTE_MODULE>;
export type ReducerEventContext = ReducerEventContextInterface<typeof REMOTE_MODULE>;
export type SubscriptionEventContext =
  SubscriptionEventContextInterface<typeof REMOTE_MODULE>;
export type ErrorContext = ErrorContextInterface<typeof REMOTE_MODULE>;
export type SubscriptionHandle = SubscriptionHandleImpl<typeof REMOTE_MODULE>;

export class SubscriptionBuilder extends BaseSubscriptionBuilderImpl<
  typeof REMOTE_MODULE
> {}

export class DbConnectionBuilder extends BaseDbConnectionBuilder<DbConnection> {}

export class DbConnection extends BaseDbConnectionImpl<typeof REMOTE_MODULE> {
  static builder = (): DbConnectionBuilder => {
    return new DbConnectionBuilder(
      REMOTE_MODULE,
      (config: DbConnectionConfig<typeof REMOTE_MODULE>) => new DbConnection(config)
    );
  };

  override subscriptionBuilder = (): SubscriptionBuilder => {
    return new SubscriptionBuilder(this);
  };
}
