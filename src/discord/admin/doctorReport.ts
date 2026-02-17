import type { Guild } from 'discord.js';
import { getGuildSettings } from '../../infra/db/queries/guildSettings';
import {
  evaluateFeatureState,
  getGuildConfig,
  guildFeatureNames,
  type GuildFeatureName,
} from '../../app/services/guildConfigService';
import { runPermissionsCheck } from '../permissions/check';
import {
  listRecurringScheduleDefinitions,
  listRecurringScheduleStatus,
} from '../../infra/queue/scheduler';
import { getSetupMissingRequirementKeys } from '../../app/services/configRequirements';
import { formatRequirementLabel } from '../featureErrors';
import { t } from '../../i18n';
import { JobNames, type JobName } from '../../infra/queue/jobs';

type DoctorFindingLevel = 'ok' | 'warn' | 'fail';

type DoctorFinding = {
  level: DoctorFindingLevel;
  message: string;
};

const scheduleOwnerFeature: Partial<Record<JobName, GuildFeatureName>> = {
  [JobNames.WeeklyOraclePublish]: 'oracle',
  [JobNames.WeeklyCheckinNudge]: 'checkin',
  [JobNames.WeeklyRaidStart]: 'raid',
  [JobNames.WeeklyRaidEnd]: 'raid',
  [JobNames.DailyRaidOffersGenerate]: 'raid',
  [JobNames.RaidProgressRefresh]: 'raid',
  [JobNames.MonthlyHallRefresh]: 'hall',
  [JobNames.PublicPostPublish]: 'public_post',
};

function levelMark(level: DoctorFindingLevel): string {
  if (level === 'ok') {
    return 'OK';
  }

  if (level === 'warn') {
    return 'WARN';
  }

  return 'FAIL';
}

function buildLine(finding: DoctorFinding): string {
  return `- [${levelMark(finding.level)}] ${finding.message}`;
}

function featureLabel(feature: GuildFeatureName): string {
  if (feature === 'oracle') {
    return t('ru', 'admin.status.feature.oracle');
  }

  if (feature === 'anon') {
    return t('ru', 'admin.status.feature.anon');
  }

  if (feature === 'raid') {
    return t('ru', 'admin.status.feature.raid');
  }

  if (feature === 'checkin') {
    return t('ru', 'admin.status.feature.checkin');
  }

  if (feature === 'hall') {
    return t('ru', 'admin.status.feature.hall');
  }

  return t('ru', 'admin.status.feature.public_post');
}

function isCronFieldValid(field: string, min: number, max: number): boolean {
  if (field === '*') {
    return true;
  }

  const numberPattern = /^\d+$/;
  const stepPattern = /^\*\/\d+$/;
  const rangePattern = /^\d+-\d+$/;
  const rangeStepPattern = /^\d+-\d+\/\d+$/;
  const list = field.split(',');

  return list.every((token) => {
    if (numberPattern.test(token)) {
      const value = Number.parseInt(token, 10);
      return value >= min && value <= max;
    }

    if (stepPattern.test(token)) {
      const parts = token.split('/');
      if (parts.length !== 2) {
        return false;
      }

      const rawStep = parts[1];
      if (!rawStep) {
        return false;
      }

      const step = Number.parseInt(rawStep, 10);
      return step > 0 && step <= max;
    }

    if (rangePattern.test(token)) {
      const parts = token.split('-');
      if (parts.length !== 2) {
        return false;
      }

      const rawStart = parts[0];
      const rawEnd = parts[1];
      if (!rawStart || !rawEnd) {
        return false;
      }

      const start = Number.parseInt(rawStart, 10);
      const end = Number.parseInt(rawEnd, 10);
      return start >= min && end <= max && start <= end;
    }

    if (rangeStepPattern.test(token)) {
      const stepParts = token.split('/');
      if (stepParts.length !== 2) {
        return false;
      }

      const range = stepParts[0];
      const rawStep = stepParts[1];
      if (!range || !rawStep) {
        return false;
      }

      const rangeParts = range.split('-');
      if (rangeParts.length !== 2) {
        return false;
      }

      const rawStart = rangeParts[0];
      const rawEnd = rangeParts[1];
      if (!rawStart || !rawEnd) {
        return false;
      }

      const start = Number.parseInt(rawStart, 10);
      const end = Number.parseInt(rawEnd, 10);
      const step = Number.parseInt(rawStep, 10);
      return start >= min && end <= max && start <= end && step > 0 && step <= max;
    }

    return false;
  });
}

function isCronExpressionValid(cron: string): boolean {
  const parts = cron.trim().split(/\s+/);
  if (parts.length !== 5) {
    return false;
  }

  const minute = parts[0];
  const hour = parts[1];
  const dayOfMonth = parts[2];
  const month = parts[3];
  const dayOfWeek = parts[4];
  if (!minute || !hour || !dayOfMonth || !month || !dayOfWeek) {
    return false;
  }

  return isCronFieldValid(minute, 0, 59)
    && isCronFieldValid(hour, 0, 23)
    && isCronFieldValid(dayOfMonth, 1, 31)
    && isCronFieldValid(month, 1, 12)
    && isCronFieldValid(dayOfWeek, 0, 7);
}

export async function buildAdminDoctorReport(guild: Guild): Promise<string> {
  const locale = 'ru';
  const config = await getGuildConfig(guild.id);
  const dbRow = await getGuildSettings(guild.id);
  const scheduleStatus = await listRecurringScheduleStatus();
  const scheduleDefinitions = listRecurringScheduleDefinitions();
  const definitionByName = new Map(scheduleDefinitions.map((definition) => [definition.name, definition]));

  const checks = await runPermissionsCheck({
    guild,
    pairCategoryId: config.pairCategoryId,
    targetChannelIds: [
      config.oracleChannelId,
      config.raidChannelId,
      config.hallChannelId,
      config.publicPostChannelId,
      config.anonInboxChannelId,
    ].filter((value): value is string => Boolean(value)),
    locale
  });

  const missingSetupKeys = getSetupMissingRequirementKeys(config);
  const findings: DoctorFinding[] = [];
  const hints = new Set<string>();

  if (!dbRow) {
    findings.push({
      level: 'fail',
      message: 'Р’ `guild_settings` РЅРµС‚ СЃС‚СЂРѕРєРё РґР»СЏ СЃРµСЂРІРµСЂР°. РЎРЅР°С‡Р°Р»Р° Р·Р°РІРµСЂС€РёС‚Рµ `/setup start`.'
    });
    hints.add('Р—Р°РІРµСЂС€РёС‚Рµ РјР°СЃС‚РµСЂ `/setup start` Рё РЅР°Р¶РјРёС‚Рµ В«Р—Р°РІРµСЂС€РёС‚СЊ РЅР°СЃС‚СЂРѕР№РєСѓВ».');
  } else {
    findings.push({
      level: 'ok',
      message: 'РЎС‚СЂРѕРєР° `guild_settings` РЅР°Р№РґРµРЅР°.'
    });
  }

  if (missingSetupKeys.length === 0) {
    findings.push({
      level: 'ok',
      message: 'Р’СЃРµ РѕР±СЏР·Р°С‚РµР»СЊРЅС‹Рµ РїРѕР»СЏ РјР°СЃС‚РµСЂР° setup Р·Р°РїРѕР»РЅРµРЅС‹.'
    });
  } else {
    findings.push({
      level: 'fail',
      message: `РќРµ Р·Р°РїРѕР»РЅРµРЅС‹ РѕР±СЏР·Р°С‚РµР»СЊРЅС‹Рµ РїРѕР»СЏ setup: ${missingSetupKeys.map((key) => formatRequirementLabel(locale, key)).join(', ')}.`
    });
    hints.add('РћС‚РєСЂРѕР№С‚Рµ `/setup start` Рё Р·Р°РїРѕР»РЅРёС‚Рµ РІСЃРµ РѕР±СЏР·Р°С‚РµР»СЊРЅС‹Рµ СЃРµР»РµРєС‚С‹.');
  }

  const failedPermissionChecks = checks.filter((check) => !check.ok);
  if (failedPermissionChecks.length === 0) {
    findings.push({
      level: 'ok',
      message: 'РџСЂР°РІР° Р±РѕС‚Р° РЅР° СЃРµСЂРІРµСЂРµ Рё РІС‹Р±СЂР°РЅРЅС‹С… РєР°РЅР°Р»Р°С… РІ РїРѕСЂСЏРґРєРµ.'
    });
  } else {
    for (const check of failedPermissionChecks) {
      findings.push({
        level: 'fail',
        message: `РџСЂР°РІР°: ${check.where} -> РЅРµ С…РІР°С‚Р°РµС‚ (${check.missing.join(', ')})`
      });
    }
    hints.add('Р’С‹РґР°Р№С‚Рµ Р±РѕС‚Сѓ РЅРµРґРѕСЃС‚Р°СЋС‰РёРµ РїСЂР°РІР° РЅР° СЃРµСЂРІРµСЂРµ, РІ РєР°С‚РµРіРѕСЂРёРё РїР°СЂ Рё С†РµР»РµРІС‹С… РєР°РЅР°Р»Р°С….');
  }

  const featureStates = new Map(
    guildFeatureNames.map((feature) => [feature, evaluateFeatureState(config, feature)]),
  );

  for (const feature of guildFeatureNames) {
    const state = featureStates.get(feature) ?? evaluateFeatureState(config, feature);
    if (state.enabled && !state.configured) {
      findings.push({
        level: 'fail',
        message: `Р¤РёС‡Р° В«${featureLabel(feature)}В» РІРєР»СЋС‡РµРЅР°, РЅРѕ РЅРµ РЅР°СЃС‚СЂРѕРµРЅР° (${state.reason}).`
      });
      hints.add(`РџСЂРѕРІРµСЂСЊС‚Рµ С‚СЂРµР±РѕРІР°РЅРёСЏ С„РёС‡Рё В«${featureLabel(feature)}В» РІ \`/admin status\` Рё Р·Р°РїРѕР»РЅРёС‚Рµ setup.`);
      continue;
    }

    findings.push({
      level: state.enabled ? 'ok' : 'warn',
      message: `Р¤РёС‡Р° В«${featureLabel(feature)}В»: ${state.enabled ? 'РІРєР»СЋС‡РµРЅР° Рё РЅР°СЃС‚СЂРѕРµРЅР°' : 'РІС‹РєР»СЋС‡РµРЅР° Р°РґРјРёРЅРёСЃС‚СЂР°С‚РѕСЂРѕРј'}.`
    });
  }

  for (const schedule of scheduleStatus) {
    const definition = definitionByName.get(schedule.name);
    if (!definition) {
      findings.push({
        level: 'fail',
        message: `Р Р°СЃРїРёСЃР°РЅРёРµ ${schedule.name}: РѕС‚СЃСѓС‚СЃС‚РІСѓРµС‚ РѕРїСЂРµРґРµР»РµРЅРёРµ РІ РєРѕРґРµ.`
      });
      continue;
    }

    if (!isCronExpressionValid(schedule.cron)) {
      findings.push({
        level: 'fail',
        message: `Р Р°СЃРїРёСЃР°РЅРёРµ ${schedule.name}: РЅРµРєРѕСЂСЂРµРєС‚РЅС‹Р№ cron (${schedule.cron}).`
      });
      hints.add(`РСЃРїСЂР°РІСЊС‚Рµ cron РґР»СЏ ${schedule.name} РІ \`src/infra/queue/scheduler.ts\`.`);
      continue;
    }

    const ownerFeature = scheduleOwnerFeature[schedule.name];
    const ownerState = ownerFeature ? featureStates.get(ownerFeature) : null;

    if (ownerFeature && schedule.enabled && ownerState && !ownerState.enabled) {
      findings.push({
        level: 'warn',
        message: `Р Р°СЃРїРёСЃР°РЅРёРµ ${schedule.name} РІРєР»СЋС‡РµРЅРѕ, РЅРѕ С„РёС‡Р° В«${featureLabel(ownerFeature)}В» РІС‹РєР»СЋС‡РµРЅР°.`
      });
      hints.add(`Р’С‹РєР»СЋС‡РёС‚Рµ ${schedule.name} С‡РµСЂРµР· \`/admin schedule\` РёР»Рё РІРєР»СЋС‡РёС‚Рµ С„РёС‡Сѓ В«${featureLabel(ownerFeature)}В».`);
      continue;
    }

    if (ownerFeature && !schedule.enabled && ownerState?.enabled && ownerState.configured) {
      findings.push({
        level: 'warn',
        message: `Р Р°СЃРїРёСЃР°РЅРёРµ ${schedule.name} РІС‹РєР»СЋС‡РµРЅРѕ, С…РѕС‚СЏ С„РёС‡Р° В«${featureLabel(ownerFeature)}В» РіРѕС‚РѕРІР° Рє СЂР°Р±РѕС‚Рµ.`
      });
      hints.add(`Р’РєР»СЋС‡РёС‚Рµ ${schedule.name} С‡РµСЂРµР· \`/admin schedule ${schedule.name} on\`.`);
      continue;
    }

    findings.push({
      level: 'ok',
      message: `Р Р°СЃРїРёСЃР°РЅРёРµ ${schedule.name}: ${schedule.enabled ? 'РІРєР»СЋС‡РµРЅРѕ' : 'РІС‹РєР»СЋС‡РµРЅРѕ'} (cron: \`${schedule.cron}\`).`
    });
  }

  const hasFail = findings.some((finding) => finding.level === 'fail');
  const hasWarn = findings.some((finding) => finding.level === 'warn');
  const overall = hasFail ? 'FAIL' : hasWarn ? 'WARN' : 'OK';

  const hintLines = hints.size > 0
    ? [...hints].map((hint, index) => `${index + 1}. ${hint}`)
    : ['1. РџСЂРѕР±Р»РµРј РЅРµ РѕР±РЅР°СЂСѓР¶РµРЅРѕ.'];

  return [
    '## РђРґРјРёРЅ-РґРѕРєС‚РѕСЂ',
    `- РЎРµСЂРІРµСЂ: \`${guild.id}\``,
    `- РћР±С‰РёР№ СЃС‚Р°С‚СѓСЃ: **${overall}**`,
    '',
    '### РџСЂРѕРІРµСЂРєРё',
    ...findings.map((finding) => buildLine(finding)),
    '',
    '### Р§С‚Рѕ РґРµР»Р°С‚СЊ',
    ...hintLines,
  ].join('\n');
}

