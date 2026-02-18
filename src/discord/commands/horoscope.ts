import {
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
  type GuildBasedChannel
} from 'discord.js';
import {
  buildAstroPairView,
  configureAstroFeature,
  getAstroFeatureState,
  getUserZodiacSign,
  resolveCurrentAstroCycle
} from '../../app/services/astroHoroscopeService';
import { parseAstroContext, parseAstroMode } from '../../domain/astro';
import { getPairForUser } from '../../infra/db/queries/pairs';
import { getGuildSettings } from '../../infra/db/queries/guildSettings';
import { JobNames } from '../../infra/queue/jobs';
import { createCorrelationId } from '../../lib/correlation';
import { logInteraction } from '../interactionLog';
import {
  buildAstroClaimPicker,
  buildAstroPairPicker
} from '../interactions/components';
import { assertAdminOrConfiguredModerator, assertGuildOnly } from '../middleware/guard';
import type { CommandModule } from './types';

const requiredChannelPermissions = [
  PermissionFlagsBits.ViewChannel,
  PermissionFlagsBits.SendMessages,
  PermissionFlagsBits.EmbedLinks,
  PermissionFlagsBits.ReadMessageHistory
] as const;

function missingPermissionBits(channel: GuildBasedChannel, bits: readonly bigint[]): bigint[] {
  const me = channel.guild.members.me;
  if (!me) {
    return [...bits];
  }

  const permissions = me.permissionsIn(channel);
  return bits.filter((bit) => !permissions.has(bit));
}

function formatMissingPermissions(bits: readonly bigint[]): string {
  return bits
    .map((bit) => String(bit))
    .join(', ');
}

export const horoscopeCommand: CommandModule = {
  name: 'horoscope',
  data: new SlashCommandBuilder()
    .setName('horoscope')
    .setNameLocalizations({ ru: 'horoscope', 'en-US': 'horoscope' })
    .setDescription('Астро-гороскоп на 6 дней')
    .setDescriptionLocalizations({ 'en-US': 'Astro horoscope on a 6-day cycle' })
    .addSubcommand((sub) =>
      sub
        .setName('setup')
        .setNameLocalizations({ ru: 'setup', 'en-US': 'setup' })
        .setDescription('Настроить канал Astro Horoscope')
        .setDescriptionLocalizations({ 'en-US': 'Configure Astro Horoscope channel' })
        .addChannelOption((opt) =>
          opt
            .setName('channel')
            .setNameLocalizations({ ru: 'channel', 'en-US': 'channel' })
            .setDescription('Публичный канал для карты гороскопа')
            .setDescriptionLocalizations({ 'en-US': 'Public channel for the horoscope card' })
            .setRequired(true),
        )
        .addBooleanOption((opt) =>
          opt
            .setName('post_test')
            .setNameLocalizations({ ru: 'post_test', 'en-US': 'post_test' })
            .setDescription('Сразу поставить publish в очередь')
            .setDescriptionLocalizations({ 'en-US': 'Queue publish immediately' })
            .setRequired(false),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName('status')
        .setNameLocalizations({ ru: 'status', 'en-US': 'status' })
        .setDescription('Статус Astro Horoscope')
        .setDescriptionLocalizations({ 'en-US': 'Astro Horoscope status' }),
    )
    .addSubcommand((sub) =>
      sub
        .setName('publish-now')
        .setNameLocalizations({ ru: 'publish-now', 'en-US': 'publish-now' })
        .setDescription('Идемпотентно обновить публичную карту')
        .setDescriptionLocalizations({ 'en-US': 'Idempotently refresh public card' }),
    )
    .addSubcommand((sub) =>
      sub
        .setName('me')
        .setNameLocalizations({ ru: 'me', 'en-US': 'me' })
        .setDescription('Получить личный Astro Horoscope')
        .setDescriptionLocalizations({ 'en-US': 'Start private claim flow' }),
    )
    .addSubcommand((sub) =>
      sub
        .setName('pair')
        .setNameLocalizations({ ru: 'pair', 'en-US': 'pair' })
        .setDescription('Синастрия для пары')
        .setDescriptionLocalizations({ 'en-US': 'Start pair synastry flow' }),
    ),
  async execute(ctx, interaction) {
    assertGuildOnly(interaction);
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const sub = interaction.options.getSubcommand();
    const correlationId = createCorrelationId();

    if (sub === 'setup') {
      const settings = await getGuildSettings(interaction.guildId);
      assertAdminOrConfiguredModerator(interaction, settings?.moderatorRoleId ?? null);

      const channel = interaction.options.getChannel('channel', true);
      if (!channel.isTextBased()) {
        await interaction.editReply('Нужен текстовый канал.');
        return;
      }

      const missing = missingPermissionBits(channel as GuildBasedChannel, requiredChannelPermissions);
      if (missing.length > 0) {
        await interaction.editReply(
          `У бота не хватает прав в канале: ${formatMissingPermissions(missing)}`,
        );
        return;
      }

      const postTest = interaction.options.getBoolean('post_test', false) ?? false;
      const state = await configureAstroFeature({
        guildId: interaction.guildId,
        channelId: channel.id,
        enable: true,
        postAnchorIfMissing: true
      });

      if (postTest) {
        await ctx.boss.send(
          JobNames.AstroPublish,
          {
            correlationId,
            interactionId: interaction.id,
            guildId: interaction.guildId,
            userId: interaction.user.id,
            feature: 'astro',
            action: 'setup_post_test'
          },
          {
            singletonKey: `astro.publish:${interaction.guildId}`,
            singletonSeconds: 10,
            retryLimit: 3
          },
        );
      }

      logInteraction({
        interaction,
        feature: 'astro',
        action: 'setup',
        correlationId
      });

      await interaction.editReply(
        [
          'Astro Horoscope настроен.',
          `Канал: <#${state.channelId}>`,
          `Anchor date: ${state.anchorDate ?? 'не задана'}`,
          postTest ? 'Publish поставлен в очередь.' : 'Publish не запускался (post_test=false).'
        ].join('\n'),
      );
      return;
    }

    if (sub === 'status') {
      const settings = await getGuildSettings(interaction.guildId);
      assertAdminOrConfiguredModerator(interaction, settings?.moderatorRoleId ?? null);

      const state = await getAstroFeatureState(interaction.guildId);
      if (!state.enabled) {
        await interaction.editReply('Astro Horoscope выключен. Запустите `/horoscope setup`.');
        return;
      }

      const cycle = await resolveCurrentAstroCycle(interaction.guildId);
      await interaction.editReply(
        [
          'Astro Horoscope включен.',
          `Канал: ${state.channelId ? `<#${state.channelId}>` : 'не задан'}`,
          `Message ID: ${state.messageId ?? 'не задан'}`,
          `Anchor date: ${cycle.anchorDate}`,
          `Текущий цикл: ${cycle.cycleStartDate} → ${cycle.cycleEndDate}`
        ].join('\n'),
      );
      return;
    }

    if (sub === 'publish-now') {
      const settings = await getGuildSettings(interaction.guildId);
      assertAdminOrConfiguredModerator(interaction, settings?.moderatorRoleId ?? null);

      const state = await getAstroFeatureState(interaction.guildId);
      if (!state.enabled || !state.configured) {
        await interaction.editReply('Сначала выполните `/horoscope setup`.');
        return;
      }

      await ctx.boss.send(
        JobNames.AstroPublish,
        {
          correlationId,
          interactionId: interaction.id,
          guildId: interaction.guildId,
          userId: interaction.user.id,
          feature: 'astro',
          action: 'publish_now'
        },
        {
          singletonKey: `astro.publish:${interaction.guildId}`,
          singletonSeconds: 10,
          retryLimit: 3
        },
      );

      logInteraction({
        interaction,
        feature: 'astro',
        action: 'publish_now',
        correlationId
      });

      await interaction.editReply('Astro publish поставлен в очередь.');
      return;
    }

    if (sub === 'me') {
      const state = await getAstroFeatureState(interaction.guildId);
      if (!state.enabled || !state.configured) {
        await interaction.editReply('Astro Horoscope не настроен. Обратитесь к администратору.');
        return;
      }

      const sign = await getUserZodiacSign(interaction.user.id);
      const defaultMode = parseAstroMode('neutral')!;
      const defaultContext = parseAstroContext('ok')!;

      await interaction.editReply({
        content: 'Выбери знак, тон и контекст, затем нажми «Получить приватно».',
        components: buildAstroClaimPicker({
          sign: sign ?? 'aries',
          mode: defaultMode,
          context: defaultContext,
          saveSign: sign ? 'nosave' : 'save'
        }) as never
      });
      return;
    }

    if (sub === 'pair') {
      const state = await getAstroFeatureState(interaction.guildId);
      if (!state.enabled || !state.configured) {
        await interaction.editReply('Astro Horoscope не настроен. Обратитесь к администратору.');
        return;
      }

      const pair = await getPairForUser(interaction.guildId, interaction.user.id);
      if (!pair) {
        await interaction.editReply('Сначала создайте пару: `/pair create`.');
        return;
      }

      const selfSign = await getUserZodiacSign(interaction.user.id);
      const partnerUserId = pair.user1Id === interaction.user.id ? pair.user2Id : pair.user1Id;
      const partnerSign = await getUserZodiacSign(partnerUserId);

      if (selfSign && partnerSign) {
        const text = await buildAstroPairView({
          guildId: interaction.guildId,
          userSign: selfSign,
          partnerSign
        });
        await interaction.editReply(text);
        return;
      }

      await interaction.editReply({
        content: partnerSign
          ? 'Нажмите «Показать синастрию».'
          : 'У партнера нет сохраненного знака. Выберите знак для этого просмотра.',
        components: buildAstroPairPicker({
          selfSign: selfSign ?? 'aries',
          partnerSign: partnerSign ?? 'aries',
          selfSource: selfSign ? 'saved' : 'temp',
          partnerSource: partnerSign ? 'saved' : 'temp'
        }) as never
      });
      return;
    }

    await interaction.editReply('Неизвестная подкоманда.');
  }
};
