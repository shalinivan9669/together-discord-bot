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
  [JobNames.OracleWeeklyPublish]: 'oracle',
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
      message: 'В `guild_settings` нет строки для сервера. Сначала завершите `/setup start`.'
    });
    hints.add('Завершите мастер `/setup start` и нажмите «Завершить настройку».');
  } else {
    findings.push({
      level: 'ok',
      message: 'Строка `guild_settings` найдена.'
    });
  }

  if (missingSetupKeys.length === 0) {
    findings.push({
      level: 'ok',
      message: 'Все обязательные поля мастера setup заполнены.'
    });
  } else {
    findings.push({
      level: 'fail',
      message: `Не заполнены обязательные поля setup: ${missingSetupKeys.map((key) => formatRequirementLabel(locale, key)).join(', ')}.`
    });
    hints.add('Откройте `/setup start` и заполните все обязательные селекты.');
  }

  const failedPermissionChecks = checks.filter((check) => !check.ok);
  if (failedPermissionChecks.length === 0) {
    findings.push({
      level: 'ok',
      message: 'Права бота на сервере и выбранных каналах в порядке.'
    });
  } else {
    for (const check of failedPermissionChecks) {
      findings.push({
        level: 'fail',
        message: `Права: ${check.where} -> не хватает (${check.missing.join(', ')})`
      });
    }
    hints.add('Выдайте боту недостающие права на сервере, в категории пар и целевых каналах.');
  }

  const featureStates = new Map(
    guildFeatureNames.map((feature) => [feature, evaluateFeatureState(config, feature)]),
  );

  for (const feature of guildFeatureNames) {
    const state = featureStates.get(feature) ?? evaluateFeatureState(config, feature);
    if (state.enabled && !state.configured) {
      findings.push({
        level: 'fail',
        message: `Фича «${featureLabel(feature)}» включена, но не настроена (${state.reason}).`
      });
      hints.add(`Проверьте требования фичи «${featureLabel(feature)}» в \`/admin status\` и заполните setup.`);
      continue;
    }

    findings.push({
      level: state.enabled ? 'ok' : 'warn',
      message: `Фича «${featureLabel(feature)}»: ${state.enabled ? 'включена и настроена' : 'выключена администратором'}.`
    });
  }

  for (const schedule of scheduleStatus) {
    const definition = definitionByName.get(schedule.name);
    if (!definition) {
      findings.push({
        level: 'fail',
        message: `Расписание ${schedule.name}: отсутствует определение в коде.`
      });
      continue;
    }

    if (!isCronExpressionValid(schedule.cron)) {
      findings.push({
        level: 'fail',
        message: `Расписание ${schedule.name}: некорректный cron (${schedule.cron}).`
      });
      hints.add(`Исправьте cron для ${schedule.name} в \`src/infra/queue/scheduler.ts\`.`);
      continue;
    }

    const ownerFeature = scheduleOwnerFeature[schedule.name];
    const ownerState = ownerFeature ? featureStates.get(ownerFeature) : null;

    if (ownerFeature && schedule.enabled && ownerState && !ownerState.enabled) {
      findings.push({
        level: 'warn',
        message: `Расписание ${schedule.name} включено, но фича «${featureLabel(ownerFeature)}» выключена.`
      });
      hints.add(`Выключите ${schedule.name} через \`/admin schedule\` или включите фичу «${featureLabel(ownerFeature)}».`);
      continue;
    }

    if (ownerFeature && !schedule.enabled && ownerState?.enabled && ownerState.configured) {
      findings.push({
        level: 'warn',
        message: `Расписание ${schedule.name} выключено, хотя фича «${featureLabel(ownerFeature)}» готова к работе.`
      });
      hints.add(`Включите ${schedule.name} через \`/admin schedule ${schedule.name} on\`.`);
      continue;
    }

    findings.push({
      level: 'ok',
      message: `Расписание ${schedule.name}: ${schedule.enabled ? 'включено' : 'выключено'} (cron: \`${schedule.cron}\`).`
    });
  }

  const hasFail = findings.some((finding) => finding.level === 'fail');
  const hasWarn = findings.some((finding) => finding.level === 'warn');
  const overall = hasFail ? 'FAIL' : hasWarn ? 'WARN' : 'OK';

  const hintLines = hints.size > 0
    ? [...hints].map((hint, index) => `${index + 1}. ${hint}`)
    : ['1. Проблем не обнаружено.'];

  return [
    '## Админ-доктор',
    `- Сервер: \`${guild.id}\``,
    `- Общий статус: **${overall}**`,
    '',
    '### Проверки',
    ...findings.map((finding) => buildLine(finding)),
    '',
    '### Что делать',
    ...hintLines,
  ].join('\n');
}
