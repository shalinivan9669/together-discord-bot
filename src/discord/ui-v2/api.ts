export enum ComponentType {
  ActionRow = 1,
  Button = 2,
  StringSelect = 3,
  TextInput = 4,
  UserSelect = 5,
  RoleSelect = 6,
  MentionableSelect = 7,
  ChannelSelect = 8,
  Section = 9,
  TextDisplay = 10,
  Thumbnail = 11,
  MediaGallery = 12,
  File = 13,
  Separator = 14,
  Container = 17,
}

export enum ButtonStyle {
  Primary = 1,
  Secondary = 2,
  Success = 3,
  Danger = 4,
  Link = 5,
  Premium = 6,
}

export enum MessageFlags {
  IsComponentsV2 = 32768,
}

export enum SeparatorSpacingSize {
  Small = 1,
  Large = 2,
}

export enum ChannelType {
  GuildText = 0,
  GuildAnnouncement = 5,
}

export type APIButtonComponent = {
  type: ComponentType.Button;
  style: ButtonStyle.Primary | ButtonStyle.Secondary | ButtonStyle.Success | ButtonStyle.Danger;
  custom_id: string;
  label?: string;
  disabled?: boolean;
};

export type APIChannelSelectComponent = {
  type: ComponentType.ChannelSelect;
  custom_id: string;
  placeholder?: string;
  min_values?: number;
  max_values?: number;
  disabled?: boolean;
  channel_types?: ChannelType[];
};

export type APIRoleSelectComponent = {
  type: ComponentType.RoleSelect;
  custom_id: string;
  placeholder?: string;
  min_values?: number;
  max_values?: number;
  disabled?: boolean;
};

export type APISelectMenuComponent = APIChannelSelectComponent | APIRoleSelectComponent;

export type APIActionRowComponent<TComponent> = {
  type: ComponentType.ActionRow;
  components: TComponent[];
};

export type APITextDisplayComponent = {
  type: ComponentType.TextDisplay;
  content: string;
};

export type APIThumbnailComponent = {
  type: ComponentType.Thumbnail;
  media: { url: string };
  description?: string | null;
  spoiler?: boolean;
};

export type APISectionAccessoryComponent = APIButtonComponent | APIThumbnailComponent;

export type APISectionComponent = {
  type: ComponentType.Section;
  components: APITextDisplayComponent[];
  accessory: APISectionAccessoryComponent;
};

export type APISeparatorComponent = {
  type: ComponentType.Separator;
  divider?: boolean;
  spacing?: SeparatorSpacingSize;
};

export type APIMediaGalleryComponent = {
  type: ComponentType.MediaGallery;
  items: Array<{ media: { url: string }; description?: string }>;
};

export type APIComponentInMessageActionRow = APIButtonComponent | APISelectMenuComponent;

export type APIComponentInContainer =
  | APIActionRowComponent<APIComponentInMessageActionRow>
  | APITextDisplayComponent
  | APISectionComponent
  | APISeparatorComponent
  | APIMediaGalleryComponent;

export type APIContainerComponent = {
  type: ComponentType.Container;
  accent_color?: number | null;
  spoiler?: boolean;
  components: APIComponentInContainer[];
};

export type APIMessageTopLevelComponent =
  | APIContainerComponent
  | APIActionRowComponent<APIComponentInMessageActionRow>
  | APITextDisplayComponent
  | APISectionComponent
  | APISeparatorComponent
  | APIMediaGalleryComponent;

export type RESTPostAPIChannelMessageJSONBody = {
  content?: string;
  components?: APIMessageTopLevelComponent[];
  flags?: number;
};

export type RESTPatchAPIChannelMessageJSONBody = {
  content?: string | null;
  components?: APIMessageTopLevelComponent[];
  flags?: number | null;
};

export type APIMessage = {
  id: string;
};

export const Routes = {
  channelMessages(channelId: string): `/${string}` {
    return `/channels/${channelId}/messages`;
  },
  channelMessage(channelId: string, messageId: string): `/${string}` {
    return `/channels/${channelId}/messages/${messageId}`;
  }
};
