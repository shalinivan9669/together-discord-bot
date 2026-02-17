import { MessageFlags, SlashCommandBuilder } from 'discord.js';
import { type JobName, JobNames } from '../../infra/queue/jobs';
import { setRecurringScheduleEnabled } from '../../infra/queue/scheduler';
import {
  evaluateFeatureState,
  getGuildConfig,
  guildFeatureNames,
  setAllGuildFeatures,
  setGuildFeature,
  setGuildLocale,
  type GuildFeatureName,
  type GuildLocale,
} from '../../app/services/guildConfigService';
import { buildAdminStatusReport } from '../admin/statusReport';
import { createInteractionTranslator } from '../locale';
import { assertGuildOnly, hasAdminPermission } from '../middleware/guard';
import type { CommandModule } from './types';

type ToggleValue = 'on' | 'off';
type ConfigName = 'locale';

const featureChoiceLabels: Record<GuildFeatureName, string> = {
  horoscope: 'Гороскоп',
  anon: 'Анонимные вопросы',
  raid: 'Рейд сервера',
  checkin: 'Еженедельный чек-ин',
  hall: 'Зал славы',
  public_post: 'Публичные посты'
};

const featureChoices = guildFeatureNames.map((feature) => ({
  name: featureChoiceLabels[feature],
  value: feature,
}));

const scheduleChoices: Array<{ name: JobName; value: JobName }> = [
  JobNames.WeeklyHoroscopePublish,
  JobNames.WeeklyCheckinNudge,
  JobNames.WeeklyRaidStart,
  JobNames.WeeklyRaidEnd,
  JobNames.DailyRaidOffersGenerate,
  JobNames.RaidProgressRefresh,
  JobNames.MonthlyHallRefresh,
  JobNames.PublicPostPublish,
].map((name) => ({ name, value: name }));

type Translator = Awaited<ReturnType<typeof createInteractionTranslator>>;
type TFn = Translator['t'];

function toToggle(value: ToggleValue): boolean {
  return value === 'on';
}

function renderFeatureStateShort(input: {
  enabled: boolean;
  configured: boolean;
  t: TFn;
}): string {
  if (!input.enabled) {
    return input.t('admin.feature.state.disabled');
  }

  if (!input.configured) {
    return input.t('admin.feature.state.not_configured');
  }

  return input.t('admin.feature.state.configured');
}

function localeLabel(locale: GuildLocale, t: TFn): string {
  return locale === 'ru' ? t('locale.ru') : t('locale.en');
}

function featureLabel(
  feature: GuildFeatureName,
  t: TFn,
): string {
  if (feature === 'horoscope') {
    return t('admin.status.feature.horoscope');
  }

  if (feature === 'anon') {
    return t('admin.status.feature.anon');
  }

  if (feature === 'raid') {
    return t('admin.status.feature.raid');
  }

  if (feature === 'checkin') {
    return t('admin.status.feature.checkin');
  }

  if (feature === 'hall') {
    return t('admin.status.feature.hall');
  }

  return t('admin.status.feature.public_post');
}

export const adminCommand: CommandModule = {
  name: 'admin',
  data: new SlashCommandBuilder()
    .setName('admin')
    .setNameLocalizations({ ru: 'admin', 'en-US': 'admin' })
    .setDescription('Админ-диагностика и управление функциями/расписаниями')
    .setDescriptionLocalizations({ 'en-US': 'Admin diagnostics and feature/schedule controls' })
    .addSubcommand((sub) =>
      sub
        .setName('status')
        .setNameLocalizations({ ru: 'status', 'en-US': 'status' })
        .setDescription('Показать конфиг, функции, расписания и права')
        .setDescriptionLocalizations({ 'en-US': 'Show config, features, schedules and permissions' }),
    )
    .addSubcommandGroup((group) =>
      group
        .setName('feature')
        .setNameLocalizations({ ru: 'feature', 'en-US': 'feature' })
        .setDescription('Управление функциями сервера')
        .setDescriptionLocalizations({ 'en-US': 'Feature controls for the guild' })
        .addSubcommand((sub) =>
          sub
            .setName('set')
            .setNameLocalizations({ ru: 'set', 'en-US': 'set' })
            .setDescription('Включить/выключить одну функцию')
            .setDescriptionLocalizations({ 'en-US': 'Toggle one feature' })
            .addStringOption((opt) => {
              const option = opt
                .setName('name')
                .setNameLocalizations({ ru: 'name', 'en-US': 'name' })
                .setDescription('Имя функции')
                .setDescriptionLocalizations({ 'en-US': 'Feature name' })
                .setRequired(true);

              for (const choice of featureChoices) {
                option.addChoices({ name: choice.name, value: choice.value });
              }

              return option;
            })
            .addStringOption((opt) =>
              opt
                .setName('value')
                .setNameLocalizations({ ru: 'value', 'en-US': 'value' })
                .setDescription('on или off')
                .setDescriptionLocalizations({ 'en-US': 'on or off' })
                .setRequired(true)
                .addChoices({ name: 'on', value: 'on' }, { name: 'off', value: 'off' }),
            ),
        )
        .addSubcommand((sub) =>
          sub
            .setName('enable-all')
            .setNameLocalizations({ ru: 'enable-all', 'en-US': 'enable-all' })
            .setDescription('Включить все функции сервера')
            .setDescriptionLocalizations({ 'en-US': 'Enable all guild features' }),
        )
        .addSubcommand((sub) =>
          sub
            .setName('disable-all')
            .setNameLocalizations({ ru: 'disable-all', 'en-US': 'disable-all' })
            .setDescription('Выключить все функции сервера')
            .setDescriptionLocalizations({ 'en-US': 'Disable all guild features' }),
        ),
    )
    .addSubcommandGroup((group) =>
      group
        .setName('config')
        .setNameLocalizations({ ru: 'config', 'en-US': 'config' })
        .setDescription('Конфигурация сервера')
        .setDescriptionLocalizations({ 'en-US': 'Guild configuration' })
        .addSubcommand((sub) =>
          sub
            .setName('set')
            .setNameLocalizations({ ru: 'set', 'en-US': 'set' })
            .setDescription('Установить параметр конфигурации')
            .setDescriptionLocalizations({ 'en-US': 'Set a configuration value' })
            .addStringOption((opt) =>
              opt
                .setName('name')
                .setNameLocalizations({ ru: 'name', 'en-US': 'name' })
                .setDescription('Имя параметра')
                .setDescriptionLocalizations({ 'en-US': 'Config key' })
                .setRequired(true)
                .addChoices({ name: 'locale', value: 'locale' }),
            )
            .addStringOption((opt) =>
              opt
                .setName('value')
                .setNameLocalizations({ ru: 'value', 'en-US': 'value' })
                .setDescription('Значение параметра')
                .setDescriptionLocalizations({ 'en-US': 'Config value' })
                .setRequired(true)
                .addChoices({ name: 'ru', value: 'ru' }, { name: 'en', value: 'en' }),
            ),
        )
        .addSubcommand((sub) =>
          sub
            .setName('get')
            .setNameLocalizations({ ru: 'get', 'en-US': 'get' })
            .setDescription('Показать параметр конфигурации')
            .setDescriptionLocalizations({ 'en-US': 'Get a configuration value' })
            .addStringOption((opt) =>
              opt
                .setName('name')
                .setNameLocalizations({ ru: 'name', 'en-US': 'name' })
                .setDescription('Имя параметра')
                .setDescriptionLocalizations({ 'en-US': 'Config key' })
                .setRequired(true)
                .addChoices({ name: 'locale', value: 'locale' }),
            ),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName('schedule')
        .setNameLocalizations({ ru: 'schedule', 'en-US': 'schedule' })
        .setDescription('Переключить глобальное периодическое расписание')
        .setDescriptionLocalizations({ 'en-US': 'Toggle a global recurring schedule' })
        .addStringOption((opt) => {
          const option = opt
            .setName('name')
            .setNameLocalizations({ ru: 'name', 'en-US': 'name' })
            .setDescription('Имя расписания')
            .setDescriptionLocalizations({ 'en-US': 'Schedule name' })
            .setRequired(true);

          for (const choice of scheduleChoices) {
            option.addChoices({ name: choice.name, value: choice.value });
          }

          return option;
        })
        .addStringOption((opt) =>
          opt
            .setName('value')
            .setNameLocalizations({ ru: 'value', 'en-US': 'value' })
            .setDescription('on или off')
            .setDescriptionLocalizations({ 'en-US': 'on or off' })
            .setRequired(true)
            .addChoices({ name: 'on', value: 'on' }, { name: 'off', value: 'off' }),
        ),
    ),
  async execute(ctx, interaction) {
    assertGuildOnly(interaction);
    const tr = await createInteractionTranslator(interaction);

    if (!hasAdminPermission(interaction)) {
      await interaction.reply({
        flags: MessageFlags.Ephemeral,
        content: tr.t('error.admin_required'),
      });
      return;
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const sub = interaction.options.getSubcommand();
    const subGroup = interaction.options.getSubcommandGroup(false);

    if (subGroup === 'feature' && sub === 'set') {
      const name = interaction.options.getString('name', true) as GuildFeatureName;
      const value = interaction.options.getString('value', true) as ToggleValue;
      const enabled = toToggle(value);

      const config = await setGuildFeature(interaction.guildId, name, enabled);
      const state = evaluateFeatureState(config, name);

      await interaction.editReply(
        `${featureLabel(name, tr.t)} -> ${enabled ? tr.t('common.enabled') : tr.t('common.disabled')}\n` +
          `${tr.t('admin.reply.status_prefix')}: ${renderFeatureStateShort({ ...state, t: tr.t })}`,
      );
      return;
    }

    if (subGroup === 'feature' && (sub === 'enable-all' || sub === 'disable-all')) {
      const enabled = sub === 'enable-all';
      const config = await setAllGuildFeatures(interaction.guildId, enabled);
      const summary = guildFeatureNames
        .map((feature) => {
          const state = evaluateFeatureState(config, feature);
          return `- ${featureLabel(feature, tr.t)}: ${state.enabled ? '\u2705' : '\u274c'}`;
        })
        .join('\n');

      await interaction.editReply(
        `${enabled ? tr.t('admin.reply.all_features_enabled') : tr.t('admin.reply.all_features_disabled')}\n\n${summary}`,
      );
      return;
    }

    if (subGroup === 'config' && sub === 'set') {
      const name = interaction.options.getString('name', true) as ConfigName;

      if (name === 'locale') {
        const value = interaction.options.getString('value', true) as GuildLocale;
        await setGuildLocale(interaction.guildId, value);

        await interaction.editReply(
          tr.t('admin.reply.locale_updated', {
            locale: localeLabel(value, tr.t),
          }),
        );
        return;
      }
    }

    if (subGroup === 'config' && sub === 'get') {
      const name = interaction.options.getString('name', true) as ConfigName;

      if (name === 'locale') {
        const config = await getGuildConfig(interaction.guildId);
        await interaction.editReply(
          tr.t('admin.reply.locale_current', {
            locale: localeLabel(config.locale, tr.t),
          }),
        );
        return;
      }
    }

    if (sub === 'schedule') {
      const name = interaction.options.getString('name', true) as JobName;
      const value = interaction.options.getString('value', true) as ToggleValue;
      const enabled = toToggle(value);

      const status = await setRecurringScheduleEnabled(ctx.boss, name, enabled);
      await interaction.editReply(
        tr.t('admin.reply.schedule_toggled', {
          name: status.name,
          state: status.enabled ? tr.t('common.enabled') : tr.t('common.disabled'),
          cron: status.cron,
        }),
      );
      return;
    }

    await interaction.editReply(await buildAdminStatusReport(interaction.guild));
  },
};
