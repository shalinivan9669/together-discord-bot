import type PgBoss from 'pg-boss';
import {
  closeRound,
  endDuel,
  getActiveDuelForGuild,
  getScoreboardSnapshot,
  startDuel,
  startRound,
  submitRoundAnswer
} from '../services/duelService';

export async function duelStartUsecase(input: {
  guildId: string;
  publicChannelId: string;
  createScoreboardMessage: (content: string) => Promise<string>;
  boss: PgBoss;
  correlationId: string;
  interactionId: string;
  userId: string;
}) {
  return startDuel(input);
}

export async function duelRoundStartUsecase(input: {
  guildId: string;
  durationMinutes: number;
  notifyPair: (params: {
    pairId: string;
    privateChannelId: string;
    duelId: string;
    roundId: string;
    roundNo: number;
    endsAt: Date;
  }) => Promise<void>;
  boss: PgBoss;
  correlationId: string;
  interactionId: string;
  userId: string;
}) {
  return startRound(input);
}

export async function duelSubmitUsecase(input: {
  guildId: string;
  duelId: string;
  roundId: string;
  pairId: string;
  userId: string;
  answer: string;
  correlationId: string;
  interactionId?: string;
  boss: PgBoss;
}) {
  return submitRoundAnswer(input);
}

export async function duelCloseRoundUsecase(input: {
  guildId: string;
  duelId: string;
  roundId: string;
  correlationId: string;
  interactionId?: string;
  userId?: string;
  boss: PgBoss;
}) {
  return closeRound(input);
}

export async function duelScoreboardSnapshotUsecase(duelId: string) {
  return getScoreboardSnapshot(duelId);
}

export async function duelGetActiveUsecase(guildId: string) {
  return getActiveDuelForGuild(guildId);
}

export async function duelEndUsecase(input: {
  guildId: string;
  boss: PgBoss;
  correlationId: string;
  interactionId: string;
  userId: string;
}) {
  return endDuel(input);
}