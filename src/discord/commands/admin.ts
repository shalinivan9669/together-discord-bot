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
import { buildAdminDoctorReport } from '../admin/doctorReport';
import { createInteractionTranslator } from '../locale';
import { assertGuildOnly, hasAdminPermission } from '../middleware/guard';
import type { CommandModule } from './types';

type ToggleValue = 'on' | 'off';
type ConfigName = 'locale';

const featureChoiceLabels: Record<GuildFeatureName, string> = {
  oracle: 'РћСЂР°РєСѓР»',
  anon: 'РђРЅРѕРЅРёРјРЅС‹Рµ РІРѕРїСЂРѕСЃС‹',
  raid: 'Р РµР№Рґ СЃРµСЂРІРµСЂР°',
  checkin: 'Р•Р¶РµРЅРµРґРµР»СЊРЅС‹Р№ С‡РµРє-РёРЅ',
  hall: 'Р—Р°Р» СЃР»Р°РІС‹',
  public_post: 'РџСѓР±Р»РёС‡РЅС‹Рµ РїРѕСЃС‚С‹'
};

const featureChoices = guildFeatureNames.map((feature) => ({
  name: featureChoiceLabels[feature],
  value: feature,
}));

const scheduleChoices: Array<{ name: JobName; value: JobName }> = [
  JobNames.WeeklyOraclePublish,
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
  if (feature === 'oracle') {
    return t('admin.status.feature.oracle');
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
    .setDescription('РђРґРјРёРЅ-РґРёР°РіРЅРѕСЃС‚РёРєР° Рё СѓРїСЂР°РІР»РµРЅРёРµ С„СѓРЅРєС†РёСЏРјРё/СЂР°СЃРїРёСЃР°РЅРёСЏРјРё')
    .setDescriptionLocalizations({ 'en-US': 'Admin diagnostics and feature/schedule controls' })
    .addSubcommand((sub) =>
      sub
        .setName('status')
        .setNameLocalizations({ ru: 'status', 'en-US': 'status' })
        .setDescription('РџРѕРєР°Р·Р°С‚СЊ РєРѕРЅС„РёРі, С„СѓРЅРєС†РёРё, СЂР°СЃРїРёСЃР°РЅРёСЏ Рё РїСЂР°РІР°')
        .setDescriptionLocalizations({ 'en-US': 'Show config, features, schedules and permissions' }),
    )
    .addSubcommand((sub) =>
      sub
        .setName('doctor')
        .setNameLocalizations({ ru: 'doctor', 'en-US': 'doctor' })
        .setDescription('Р СџР С•Р В»Р Р…Р В°РЎРЏ Р Т‘Р С‘Р В°Р С–Р Р…Р С•РЎРѓРЎвЂљР С‘Р С”Р В° Р Р…Р В°РЎРѓРЎвЂљРЎР‚Р С•Р ВµР С”, Р С—РЎР‚Р В°Р Р† Р С‘ РЎР‚Р В°РЎРѓР С—Р С‘РЎРѓР В°Р Р…Р С‘Р в„–')
        .setDescriptionLocalizations({ 'en-US': 'Full diagnostic report: config, permissions, schedules' }),
    )
    .addSubcommandGroup((group) =>
      group
        .setName('feature')
        .setNameLocalizations({ ru: 'feature', 'en-US': 'feature' })
        .setDescription('РЈРїСЂР°РІР»РµРЅРёРµ С„СѓРЅРєС†РёСЏРјРё СЃРµСЂРІРµСЂР°')
        .setDescriptionLocalizations({ 'en-US': 'Feature controls for the guild' })
        .addSubcommand((sub) =>
          sub
            .setName('set')
            .setNameLocalizations({ ru: 'set', 'en-US': 'set' })
            .setDescription('Р’РєР»СЋС‡РёС‚СЊ/РІС‹РєР»СЋС‡РёС‚СЊ РѕРґРЅСѓ С„СѓРЅРєС†РёСЋ')
            .setDescriptionLocalizations({ 'en-US': 'Toggle one feature' })
            .addStringOption((opt) => {
              const option = opt
                .setName('name')
                .setNameLocalizations({ ru: 'name', 'en-US': 'name' })
                .setDescription('РРјСЏ С„СѓРЅРєС†РёРё')
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
                .setDescription('on РёР»Рё off')
                .setDescriptionLocalizations({ 'en-US': 'on or off' })
                .setRequired(true)
                .addChoices({ name: 'on', value: 'on' }, { name: 'off', value: 'off' }),
            ),
        )
        .addSubcommand((sub) =>
          sub
            .setName('enable-all')
            .setNameLocalizations({ ru: 'enable-all', 'en-US': 'enable-all' })
            .setDescription('Р’РєР»СЋС‡РёС‚СЊ РІСЃРµ С„СѓРЅРєС†РёРё СЃРµСЂРІРµСЂР°')
            .setDescriptionLocalizations({ 'en-US': 'Enable all guild features' }),
        )
        .addSubcommand((sub) =>
          sub
            .setName('disable-all')
            .setNameLocalizations({ ru: 'disable-all', 'en-US': 'disable-all' })
            .setDescription('Р’С‹РєР»СЋС‡РёС‚СЊ РІСЃРµ С„СѓРЅРєС†РёРё СЃРµСЂРІРµСЂР°')
            .setDescriptionLocalizations({ 'en-US': 'Disable all guild features' }),
        ),
    )
    .addSubcommandGroup((group) =>
      group
        .setName('config')
        .setNameLocalizations({ ru: 'config', 'en-US': 'config' })
        .setDescription('РљРѕРЅС„РёРіСѓСЂР°С†РёСЏ СЃРµСЂРІРµСЂР°')
        .setDescriptionLocalizations({ 'en-US': 'Guild configuration' })
        .addSubcommand((sub) =>
          sub
            .setName('set')
            .setNameLocalizations({ ru: 'set', 'en-US': 'set' })
            .setDescription('РЈСЃС‚Р°РЅРѕРІРёС‚СЊ РїР°СЂР°РјРµС‚СЂ РєРѕРЅС„РёРіСѓСЂР°С†РёРё')
            .setDescriptionLocalizations({ 'en-US': 'Set a configuration value' })
            .addStringOption((opt) =>
              opt
                .setName('name')
                .setNameLocalizations({ ru: 'name', 'en-US': 'name' })
                .setDescription('РРјСЏ РїР°СЂР°РјРµС‚СЂР°')
                .setDescriptionLocalizations({ 'en-US': 'Config key' })
                .setRequired(true)
                .addChoices({ name: 'locale', value: 'locale' }),
            )
            .addStringOption((opt) =>
              opt
                .setName('value')
                .setNameLocalizations({ ru: 'value', 'en-US': 'value' })
                .setDescription('Р—РЅР°С‡РµРЅРёРµ РїР°СЂР°РјРµС‚СЂР°')
                .setDescriptionLocalizations({ 'en-US': 'Config value' })
                .setRequired(true)
                .addChoices({ name: 'ru', value: 'ru' }, { name: 'en', value: 'en' }),
            ),
        )
        .addSubcommand((sub) =>
          sub
            .setName('get')
            .setNameLocalizations({ ru: 'get', 'en-US': 'get' })
            .setDescription('РџРѕРєР°Р·Р°С‚СЊ РїР°СЂР°РјРµС‚СЂ РєРѕРЅС„РёРіСѓСЂР°С†РёРё')
            .setDescriptionLocalizations({ 'en-US': 'Get a configuration value' })
            .addStringOption((opt) =>
              opt
                .setName('name')
                .setNameLocalizations({ ru: 'name', 'en-US': 'name' })
                .setDescription('РРјСЏ РїР°СЂР°РјРµС‚СЂР°')
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
        .setDescription('РџРµСЂРµРєР»СЋС‡РёС‚СЊ РіР»РѕР±Р°Р»СЊРЅРѕРµ РїРµСЂРёРѕРґРёС‡РµСЃРєРѕРµ СЂР°СЃРїРёСЃР°РЅРёРµ')
        .setDescriptionLocalizations({ 'en-US': 'Toggle a global recurring schedule' })
        .addStringOption((opt) => {
          const option = opt
            .setName('name')
            .setNameLocalizations({ ru: 'name', 'en-US': 'name' })
            .setDescription('РРјСЏ СЂР°СЃРїРёСЃР°РЅРёСЏ')
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
            .setDescription('on РёР»Рё off')
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

    if (sub === 'doctor') {
      await interaction.editReply(await buildAdminDoctorReport(interaction.guild));
      return;
    }

    await interaction.editReply(await buildAdminStatusReport(interaction.guild, { locale: 'ru' }));
  },
};

