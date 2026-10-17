// Block model — everything (including pages) is a block in one flat map,
// linked by parent_id and an ordered `content` list of child ids.

export type BlockType =
  | 'page'
  | 'text'
  | 'header'
  | 'sub_header'
  | 'sub_sub_header'
  | 'bulleted_list'
  | 'numbered_list'
  | 'to_do'
  | 'toggle'
  | 'quote'
  | 'callout'
  | 'divider'
  | 'code'

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
  }
  format: {
    icon?: string
    cover?: string
    collapsed?: boolean
  }
  /** Present on a page that is a database: its columns, in display order. Rows are its child pages. */
  schema?: DbProperty[]
  alive: boolean
  created_time: number
  last_edited_time: number
}

export type PropertyType = 'title' | 'text' | 'number' | 'select' | 'multi_select' | 'date' | 'checkbox' | 'url'

export type OptionColor = 'default' | 'gray' | 'brown' | 'orange' | 'yellow' | 'green' | 'blue' | 'purple' | 'pink' | 'red'

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
