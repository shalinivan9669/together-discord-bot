export type Brand<T, Name extends string> = T & { readonly __brand: Name };

export type Snowflake = Brand<string, 'Snowflake'>;
export type GuildId = Brand<string, 'GuildId'>;
export type UserId = Brand<string, 'UserId'>;
export type ChannelId = Brand<string, 'ChannelId'>;
export type RoleId = Brand<string, 'RoleId'>;
export type PairId = Brand<string, 'PairId'>;
export type DuelId = Brand<string, 'DuelId'>;
export type DuelRoundId = Brand<string, 'DuelRoundId'>;

export function asGuildId(value: string): GuildId {
  return value as GuildId;
}

export function asUserId(value: string): UserId {
  return value as UserId;
}

export function asChannelId(value: string): ChannelId {
  return value as ChannelId;
}

export function asRoleId(value: string): RoleId {
  return value as RoleId;
}

export function asPairId(value: string): PairId {
  return value as PairId;
}

export function asDuelId(value: string): DuelId {
  return value as DuelId;
}

export function asDuelRoundId(value: string): DuelRoundId {
  return value as DuelRoundId;
}