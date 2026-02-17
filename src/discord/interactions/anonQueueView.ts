import { listPendingAnonQuestionsPage } from '../../app/services/anonService';
import { buildAnonModerationButtons, buildAnonQueuePaginationButtons } from './components';

const DEFAULT_PAGE_SIZE = 3;

export type AnonQueueView = {
  content: string;
  components: Array<ReturnType<typeof buildAnonModerationButtons> | ReturnType<typeof buildAnonQueuePaginationButtons>>;
  page: number;
  totalPages: number;
  total: number;
};

export async function buildAnonQueueView(guildId: string, page: number, pageSize = DEFAULT_PAGE_SIZE): Promise<AnonQueueView> {
  const safePageSize = Math.max(1, Math.min(5, pageSize));
  const requestedPage = Math.max(0, page);

  const firstPass = await listPendingAnonQuestionsPage(guildId, {
    limit: safePageSize,
    offset: requestedPage * safePageSize
  });

  if (firstPass.total === 0) {
    return {
      content: 'No pending anonymous questions.',
      components: [],
      page: 0,
      totalPages: 1,
      total: 0
    };
  }

  const totalPages = Math.max(1, Math.ceil(firstPass.total / safePageSize));
  const pageIndex = Math.min(requestedPage, totalPages - 1);

  const pageResult = pageIndex === requestedPage
    ? firstPass
    : await listPendingAnonQuestionsPage(guildId, {
        limit: safePageSize,
        offset: pageIndex * safePageSize
      });

  const lines = pageResult.rows.map((row, idx) => {
    const itemNo = pageIndex * safePageSize + idx + 1;
    return `${itemNo}. \`${row.id}\`\n${row.questionText}`;
  });

  const components: Array<ReturnType<typeof buildAnonModerationButtons> | ReturnType<typeof buildAnonQueuePaginationButtons>> =
    pageResult.rows.map((row) => buildAnonModerationButtons(row.id));

  if (totalPages > 1) {
    components.push(
      buildAnonQueuePaginationButtons({
        page: pageIndex,
        totalPages
      }),
    );
  }

  return {
    content: `Pending questions (${pageResult.total})\n\n${lines.join('\n\n')}`,
    components,
    page: pageIndex,
    totalPages,
    total: pageResult.total
  };
}
