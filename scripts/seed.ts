import { randomUUID } from 'node:crypto';
import { db } from '../src/infra/db/drizzle';
import {
  agreementsLibrary,
  contentOracleArchetypes,
  raidQuests
} from '../src/infra/db/schema';

const sharedVariants = {
  soft: {
    conflict: {
      risk: 'Срываетесь на личности вместо правила.',
      step: 'Назови 1 чувство и 1 просьбу без обвинения.',
      keyPhrase: 'Давай говорить по правилу, не по боли.',
      taboo: 'Не припоминай старые ошибки и долги.',
      miniChallenge: 'Согласуйте одно правило ссоры на 4 дня.'
    },
    ok: {
      risk: 'Расслабились и перестали договариваться.',
      step: 'Обсудите 2 нужно и 2 нельзя на ближайшие 4 дня.',
      keyPhrase: 'Давай закрепим, что нас держит.',
      taboo: 'Не говори мне все равно, если не все равно.',
      miniChallenge: 'Сделай один маленький честный отказ сегодня.'
    },
    boredom: {
      risk: 'Рутина съедает внимание друг к другу.',
      step: 'Поставьте рамку: 30 минут без экранов вместе.',
      keyPhrase: 'Давай выделим время как приоритет.',
      taboo: 'Не сидите рядом каждый в своем телефоне.',
      miniChallenge: 'Договоритесь о 1 общем мини-ритуале на 4 дня.'
    },
    distance: {
      risk: 'Ожидания не озвучены — растет обида.',
      step: 'Сделайте контракт контакта: когда и как на 4 дня.',
      keyPhrase: 'Мне нужна ясность, не догадки.',
      taboo: 'Не исчезай молча после напряжения.',
      miniChallenge: 'Выберите 10 минут в сутки как точку связи.'
    },
    fatigue: {
      risk: 'Усталость превращается в раздражение.',
      step: 'Снимите 1 нагрузку: что можно отменить или упростить.',
      keyPhrase: 'Сейчас важнее беречь силы, чем быть правыми.',
      taboo: 'Не меряйтесь кто устал сильнее.',
      miniChallenge: 'Спросите: что реально облегчит тебе день, и сделайте это.'
    },
    jealousy: {
      risk: 'Ревность прячется как контроль заботы.',
      step: 'Скажи: 1 страх и 1 просьбу о безопасности.',
      keyPhrase: 'Мне нужна опора, а не контроль.',
      taboo: 'Не устраивай проверок и ловушек.',
      miniChallenge: 'Согласуйте 1 границу и 1 способ успокоения на 4 дня.'
    }
  },
  neutral: {
    conflict: {
      risk: 'Вы спорите о прошлом, не о решении.',
      step: 'Сформулируй: я хочу ___, поэтому прошу ___.',
      keyPhrase: 'Сначала понимаем, потом решаем.',
      taboo: 'Не повышай ставки угрозами и ультиматумами.',
      miniChallenge: 'Закройте спор одним маленьким решением на сегодня.'
    },
    ok: {
      risk: 'Нормально = само держится, но это не так.',
      step: 'Сверьте 3 ожидания: время, деньги, внимание.',
      keyPhrase: 'Договоренность лучше надежды.',
      taboo: 'Не обещай как-нибудь, назови конкретно.',
      miniChallenge: 'Запишите 1 правило заботы и проверьте через 4 дня.'
    },
    boredom: {
      risk: 'Живете рядом, но без контакта.',
      step: 'Сделайте 10 минут вопрос-ответ без спора.',
      keyPhrase: 'Давай вернем интерес, не драму.',
      taboo: 'Не заменяй близость мемами и скроллом.',
      miniChallenge: 'Каждый задает 1 неожиданный вопрос сегодня.'
    },
    distance: {
      risk: 'Отдаление растет из-за неопределенности.',
      step: 'Согласуйте минимум: 1 сообщение и 1 звонок в день.',
      keyPhrase: 'Мне важна регулярность, даже короткая.',
      taboo: 'Не наказывай тишиной.',
      miniChallenge: 'Поставьте общую точку связи в календарь на 4 дня.'
    },
    fatigue: {
      risk: 'Низкая эмпатия дает больше конфликтов.',
      step: 'Перейдите в режим поддержки: один конкретный запрос.',
      keyPhrase: 'Скажи, что упростить прямо сейчас.',
      taboo: 'Не обсуждайте тяжелые решения на нуле энергии.',
      miniChallenge: 'Введите код-слово ресурс 0-5 и используйте 4 дня.'
    },
    jealousy: {
      risk: 'Строишь сюжет без фактов.',
      step: 'Задай 1 уточняющий вопрос до реакции.',
      keyPhrase: 'Я хочу понимать, а не подозревать.',
      taboo: 'Не требуй докажи, проси объясни.',
      miniChallenge: 'Согласуйте прозрачное действие, которое успокоит обоих.'
    }
  },
  hard: {
    conflict: {
      risk: 'Ты побеждаешь — отношения проигрывают.',
      step: 'Стоп-слово, 3 минуты паузы и возврат с вопросом.',
      keyPhrase: 'Я не воюю с тобой. Я решаю с тобой.',
      taboo: 'Никаких унижений, ярлыков, ты всегда или никогда.',
      miniChallenge: 'Каждый признает 1 свою долю в конфликте сегодня.'
    },
    ok: {
      risk: 'Копишь неудобства, потом взрываешься.',
      step: 'Назови одну мелкую проблему прямо сегодня.',
      keyPhrase: 'Лучше неловко сейчас, чем больно потом.',
      taboo: 'Не играй в намеки.',
      miniChallenge: 'Договоритесь о 1 конкретной правке быта на 4 дня.'
    },
    boredom: {
      risk: 'Энтропия: все тухнет без обслуживания.',
      step: 'Назначьте окно новизны 30 минут в этом цикле.',
      keyPhrase: 'Близость требует ухода, не удачи.',
      taboo: 'Не откладывай потом бесконечно.',
      miniChallenge: 'Запланируйте мини-свидание до сна сегодня.'
    },
    distance: {
      risk: 'Вы живете параллельными жизнями.',
      step: 'Сделайте минимум контакта на 4 дня письменно.',
      keyPhrase: 'Мне нужна стабильность, а не случайность.',
      taboo: 'Не давай смешанных сигналов.',
      miniChallenge: 'Каждый день 10 минут, без пропусков.'
    },
    fatigue: {
      risk: 'Забота рушится, потому что вы на нуле.',
      step: 'Составьте план сначала восстановление, потом планы.',
      keyPhrase: 'Сначала ресурс, потом разговоры.',
      taboo: 'Не геройствуй и не требуй геройства.',
      miniChallenge: 'Отмени одну необязательную задачу сегодня.'
    },
    jealousy: {
      risk: 'Контроль маскируется под я переживаю.',
      step: 'Переведи страх в границу и просьбу.',
      keyPhrase: 'Я говорю о нужде, не о контроле.',
      taboo: 'Никакого слежения и проверок.',
      miniChallenge: 'Напишите 1 границу и 1 ритуал успокоения на 4 дня.'
    }
  }
};

const archetypes = [
  { key: 'anchor', title: 'Якорь', variantsJson: sharedVariants },
  { key: 'spark', title: 'Искра', variantsJson: sharedVariants },
  { key: 'mirror', title: 'Зеркало', variantsJson: sharedVariants },
  { key: 'bridge', title: 'Мост', variantsJson: sharedVariants },
  { key: 'lantern', title: 'Фонарь', variantsJson: sharedVariants },
  { key: 'compass', title: 'Компас', variantsJson: sharedVariants },
  { key: 'harbor', title: 'Гавань', variantsJson: sharedVariants },
  { key: 'signal', title: 'Сигнал', variantsJson: sharedVariants },
  { key: 'forge', title: 'Кузня', variantsJson: sharedVariants },
  { key: 'garden', title: 'Сад', variantsJson: sharedVariants },
  { key: 'pulse', title: 'Пульс', variantsJson: sharedVariants },
  { key: 'horizon', title: 'Горизонт', variantsJson: sharedVariants }
];

const agreements = [
  'После 23:00 ставим паузу в горячих разговорах.',
  'Сначала уточняем тон, потом делаем вывод.',
  'Каждый день делаем 10-минутный чек-ин.',
  'Во время еды вместе без телефонов.',
  'После конфликта стараемся восстановиться в тот же день.',
  'Перед критикой говорим одну благодарность.',
  'Раз в 4 дня синхронизируем общий план.',
  'О поддержке и успокоении просим прямо.',
  'Раз в 4 дня держим один спокойный вечер без драмы.',
  'В стрессе говорим уважительно и без ярлыков.'
].map((text, index) => ({
  key: `agreement_${index + 1}`,
  text,
  tagsJson: ['baseline', 'cycle4d']
}));

const questTemplates = [
  { key: 'micro_repair', category: 'repair', difficulty: 'micro', points: 10, text: 'Сделайте паузу 2 минуты и вернитесь к разговору спокойно.' },
  { key: 'micro_gratitude', category: 'connection', difficulty: 'micro', points: 8, text: 'Обменяйтесь одной конкретной благодарностью.' },
  { key: 'micro_walk', category: 'connection', difficulty: 'micro', points: 10, text: 'Прогуляйтесь вместе 10 минут без экранов.' },
  { key: 'micro_no_phone', category: 'focus', difficulty: 'micro', points: 8, text: '20 минут разговора без телефонов.' },
  { key: 'micro_boundary', category: 'boundary', difficulty: 'micro', points: 12, text: 'Сформулируйте одну четкую границу уважительно.' },
  { key: 'micro_support', category: 'support', difficulty: 'micro', points: 10, text: 'Спросите и сделайте одно конкретное действие поддержки.' },
  { key: 'micro_checkin', category: 'ritual', difficulty: 'micro', points: 9, text: 'Пройдите мини-чек-ин по шкале 0-5.' },
  { key: 'micro_breath', category: 'repair', difficulty: 'micro', points: 7, text: '3 минуты совместного дыхания для снижения напряжения.' },
  { key: 'micro_plan', category: 'planning', difficulty: 'micro', points: 10, text: 'Сверьте два главных приоритета на завтра.' },
  { key: 'micro_phrase', category: 'language', difficulty: 'micro', points: 8, text: 'Используйте согласованную ключевую фразу в напряжении.' },
  { key: 'medium_date', category: 'connection', difficulty: 'medium', points: 20, text: 'Назначьте и проведите свидание 45 минут.' },
  { key: 'medium_repair_script', category: 'repair', difficulty: 'medium', points: 24, text: 'Пройдите полный скрипт восстановления после конфликта.' },
  { key: 'medium_budget_talk', category: 'planning', difficulty: 'medium', points: 18, text: 'Сделайте спокойный 20-минутный разговор о бюджете.' },
  { key: 'medium_future_map', category: 'planning', difficulty: 'medium', points: 22, text: 'Наметьте одну общую цель на 3 месяца.' },
  { key: 'medium_support_day', category: 'support', difficulty: 'medium', points: 20, text: 'Снимите с партнера одну стрессовую задачу на день.' },
  { key: 'medium_conflict_reset', category: 'repair', difficulty: 'medium', points: 23, text: 'Перезапустите повторяющийся конфликт новым правилом.' },
  { key: 'medium_energy_plan', category: 'health', difficulty: 'medium', points: 19, text: 'Соберите недельный план с учетом усталости.' },
  { key: 'medium_family_call', category: 'family', difficulty: 'medium', points: 18, text: 'Организуйте один содержательный семейный созвон.' },
  { key: 'medium_values_talk', category: 'values', difficulty: 'medium', points: 21, text: 'Обсудите одно расхождение ценностей без атаки.' },
  { key: 'medium_celebrate', category: 'connection', difficulty: 'medium', points: 20, text: 'Осознанно отметьте одну общую победу.' }
];

async function seedArchetypes() {
  for (const archetype of archetypes) {
    await db
      .insert(contentOracleArchetypes)
      .values({
        key: archetype.key,
        title: archetype.title,
        variantsJson: archetype.variantsJson,
        active: true
      })
      .onConflictDoUpdate({
        target: contentOracleArchetypes.key,
        set: {
          title: archetype.title,
          variantsJson: archetype.variantsJson,
          active: true
        }
      });
  }
}

async function seedAgreements() {
  for (const agreement of agreements) {
    await db
      .insert(agreementsLibrary)
      .values({
        key: agreement.key,
        text: agreement.text,
        tagsJson: agreement.tagsJson,
        active: true
      })
      .onConflictDoUpdate({
        target: agreementsLibrary.key,
        set: {
          text: agreement.text,
          tagsJson: agreement.tagsJson,
          active: true
        }
      });
  }
}

async function seedRaidQuests() {
  for (const quest of questTemplates) {
    await db
      .insert(raidQuests)
      .values({
        id: randomUUID(),
        key: quest.key,
        category: quest.category,
        difficulty: quest.difficulty,
        points: quest.points,
        text: quest.text,
        active: true
      })
      .onConflictDoUpdate({
        target: raidQuests.key,
        set: {
          category: quest.category,
          difficulty: quest.difficulty,
          points: quest.points,
          text: quest.text,
          active: true
        }
      });
  }
}

async function main() {
  await seedArchetypes();
  await seedAgreements();
  await seedRaidQuests();
  console.log('Seed completed.');
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
