// Block model — everything (including pages) is a block in one flat map,
// linked by parent_id and an ordered `content` list of child ids.

export type BlockType =
  | 'page'
  | 'text'
  | 'header'
  | 'sub_header'
  | 'sub_sub_header'
  | 'header_4'
  | 'bulleted_list'
  | 'numbered_list'
  | 'to_do'
  | 'toggle'
  | 'quote'
  | 'callout'
  | 'divider'
  | 'code'
  | 'equation'
  | 'table_of_contents'
  | 'breadcrumb'
  | 'link_to_page'
  | 'image'
  | 'bookmark'
  | 'embed'
  | 'video'
  | 'file'
  | 'column_list'
  | 'column'
  | 'table'
  | 'table_row'

export interface Block {
  id: string
  type: BlockType
  parent_id: string | null
  content: string[]
  properties: {
    /** Sanitized inline HTML (b, i, u, s, code, a, br). Plain text for pages and code. */
    title: string
    checked?: boolean
    /** Database rows only: cell values keyed by property id (the title column is `title` above). */
    cells?: Record<string, CellValue>
    /** Media / bookmark / embed: the source URL (https, or a data: URL for uploaded images). */
    url?: string
    /** Media / code: caption under the block (inline HTML). */
    caption?: string
    /** link_to_page: the page it points to. */
    page_id?: string
    /** table_row: one inline-HTML cell per table column. */
    row?: string[]
    /** bookmark: preview fetched for the link. */
    bookmark?: { title?: string; description?: string; icon?: string; image?: string }
  }
  format: {
    icon?: string
    /** Preset name, colour, CSS gradient or https image URL — rendered through `coverCss()`. */
    cover?: string
    collapsed?: boolean
    /** Text colour (`red`) or background colour (`red_background`) of a block. */
    color?: BlockColor
    /** Pages only. */
    page_font?: PageFont
    full_width?: boolean
    /** Database only: shown inside its parent page instead of as a link to its own page. */
    inline?: boolean
    /** Pages only: soft tint behind the whole page. */
    background?: ColorName
    /** Pages only: Notion's "Small text" switch. */
    small_text?: boolean
    /** Pages only: "Lock page" — no edits until unlocked. */
    locked?: boolean
    /** Pages only: shown in the sidebar's Favorites section. */
    favorite?: boolean
    /** Headings only: a toggle heading (children hide when collapsed). */
    toggleable?: boolean
    /** Numbered lists: numbers / letters / roman. Bulleted lists: disc / circle / square. */
    list_format?: 'numbers' | 'letters' | 'roman' | 'disc' | 'circle' | 'square'
    /** Numbered lists: first number of the list (typing "5. " starts at 5). */
    list_start_index?: number
    /** Quotes: Notion's "Quote size → Large". */
    quote_size?: 'large'
    /** Code blocks. */
    code_language?: string
    code_wrap?: boolean
    /** Media: width in px (missing = natural / full width) and alignment. */
    block_width?: number
    block_alignment?: 'left' | 'center' | 'right'
    /** Columns: share of the row's width (all columns of a row add up to 1). */
    column_ratio?: number
    /** Simple tables: number of columns, header row / header column. */
    table_width?: number
    table_header_row?: boolean
    table_header_column?: boolean
  }
  /** Present on a page that is a database: its columns, in display order. Rows are its child pages. */
  schema?: DbProperty[]
  /** Database only: saved views (tabs). Missing = a single default table view. */
  views?: DbView[]
  alive: boolean
  created_time: number
  last_edited_time: number
}

export type PropertyType = 'title' | 'text' | 'number' | 'select' | 'multi_select' | 'date' | 'checkbox' | 'url' | 'status' | 'created_time' | 'last_edited_time'

export type OptionColor = 'default' | 'gray' | 'brown' | 'orange' | 'yellow' | 'green' | 'blue' | 'purple' | 'pink' | 'red'

export type ColorName = Exclude<OptionColor, 'default'>
export type BlockColor = ColorName | `${ColorName}_background`
export type PageFont = 'default' | 'serif' | 'mono' | 'comic'

export interface SelectOption {
  id: string
  name: string
  color: OptionColor
}

export interface DbProperty {
  /** Stable id; the title column is always `title`. */
  id: string
  name: string
  type: PropertyType
  /** select / multi_select only. */
  options?: SelectOption[]
  width?: number
}

export type ViewType = 'table' | 'board' | 'list' | 'gallery' | 'calendar'

export type FilterOperator =
  | 'string_is'
  | 'string_contains'
  | 'string_starts_with'
  | 'number_equals'
  | 'number_greater_than'
  | 'number_less_than'
  | 'number_greater_than_or_equal_to'
  | 'number_less_than_or_equal_to'
  | 'enum_is'
  | 'enum_is_not'
  | 'enum_contains'
  | 'enum_does_not_contain'
  | 'checkbox_is'
  | 'date_is'
  | 'date_is_on_or_before'
  | 'date_is_on_or_after'
  | 'is_empty'
  | 'is_not_empty'

export interface DbFilter {
  property: string
  operator: FilterOperator
  value?: CellValue
}

export interface DbSort {
  property: string
  direction: 'ascending' | 'descending'
}

export interface DbView {
  id: string
  name: string
  type: ViewType
  sort: DbSort[]
  filter: { operator: 'and' | 'or'; filters: DbFilter[] }
  /** Property ids hidden in this view (the title is always shown). */
  hidden?: string[]
  /** Board: the select property whose options become columns. */
  group_by?: string
  /** Calendar: the date property that places rows on days. */
  calendar_by?: string
  /** Gallery: what the top of each card shows. */
  cover?: 'none' | 'page_cover' | 'page_content'
}

/**
 * text/url: string · number: number · checkbox: boolean · date: 'YYYY-MM-DD'
 * select: option id · multi_select: option ids
 */
export type CellValue = string | number | boolean | string[] | null

export type AIProvider = 'claude-code' | 'anthropic' | 'openai' | 'gemini' | 'openai-compatible'

export interface AISettings {
  provider: AIProvider
  apiKeys: Partial<Record<AIProvider, string>>
  models: Partial<Record<AIProvider, string>>
  baseUrl: string
}
