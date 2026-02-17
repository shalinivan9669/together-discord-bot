import {
  ButtonStyle,
  ChannelType,
  ComponentType,
  SeparatorSpacingSize,
  type APIActionRowComponent,
  type APIButtonComponent,
  type APIComponentInContainer,
  type APIContainerComponent,
  type APISectionAccessoryComponent,
  type APISectionComponent,
  type APISelectMenuComponent,
  type APISeparatorComponent,
  type APITextDisplayComponent,
} from './api';

const DEFAULT_CARD_ACCENT = 0x2f7d6d;
const MAX_TEXT_DISPLAY_LENGTH = 4000;
const MAX_SECTION_BLOCKS = 3;

function truncateSafe(value: string, maxLength: number): string {
  const chars = [...value];
  if (chars.length <= maxLength) {
    return value;
  }

  if (maxLength <= 1) {
    return chars.slice(0, maxLength).join('');
  }

  return `${chars.slice(0, maxLength - 1).join('')}…`;
}

export function safeTextDisplayContent(value: string): string {
  return truncateSafe(value, MAX_TEXT_DISPLAY_LENGTH);
}

export function textBlock(content: string): APITextDisplayComponent {
  return {
    type: ComponentType.TextDisplay,
    content: safeTextDisplayContent(content)
  };
}

export function section(params: {
  text: string | string[];
  accessory: APISectionAccessoryComponent;
}): APISectionComponent {
  const lines = Array.isArray(params.text) ? params.text : [params.text];

  return {
    type: ComponentType.Section,
    components: lines.slice(0, MAX_SECTION_BLOCKS).map((line) => textBlock(line)),
    accessory: params.accessory
  };
}

export function separator(params?: {
  divider?: boolean;
  spacing?: SeparatorSpacingSize;
}): APISeparatorComponent {
  return {
    type: ComponentType.Separator,
    divider: params?.divider,
    spacing: params?.spacing
  };
}

export function uiCard(params: {
  title: string;
  status?: string;
  accentColor?: number;
  components: APIComponentInContainer[];
}): APIContainerComponent {
  const headerLines = [
    `## ${truncateSafe(params.title.trim(), 120)}`,
    params.status ? `Статус: **${truncateSafe(params.status.trim(), 80)}**` : null
  ].filter((value): value is string => Boolean(value));

  return {
    type: ComponentType.Container,
    accent_color: params.accentColor ?? DEFAULT_CARD_ACCENT,
    components: [
      textBlock(headerLines.join('\n')),
      ...params.components
    ].slice(0, 10)
  };
}

export function actionRowButtons(
  buttons: APIButtonComponent[],
): APIActionRowComponent<APIButtonComponent> {
  return {
    type: ComponentType.ActionRow,
    components: buttons.slice(0, 5)
  };
}

export function actionRowSelects(
  selects: APISelectMenuComponent[],
): APIActionRowComponent<APISelectMenuComponent> {
  return {
    type: ComponentType.ActionRow,
    components: selects.slice(0, 1)
  };
}

export { ButtonStyle, ChannelType, ComponentType, SeparatorSpacingSize };
