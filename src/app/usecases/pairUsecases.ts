import { asUserId } from '../../domain/ids';
import { createPairRoom, getPairRoomForUser } from '../services/pairService';

export async function pairCreateUsecase(input: {
  guildId: string;
  userA: string;
  userB: string;
  createPrivateChannel: (memberIds: [string, string]) => Promise<string>;
}) {
  return createPairRoom({
    guildId: input.guildId,
    userA: asUserId(input.userA),
    userB: asUserId(input.userB),
    createPrivateChannel: input.createPrivateChannel
  });
}

export async function pairRoomUsecase(guildId: string, userId: string) {
  return getPairRoomForUser(guildId, userId);
}