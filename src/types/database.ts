export type Contact = {
  id: string
  user_id: string
  name: string
  relationship_type: string | null
  cadence_days: number
  birthday: string | null
  notes: string | null
  phone: string | null
  email: string | null
  archived: boolean
  source: 'manual' | 'gmail_import'
  nudge: string | null
  snoozed_until: string | null
  created_at: string
}

export type ContactInsert = {
  name: string
  relationship_type?: string | null
  cadence_days?: number
  birthday?: string | null
  notes?: string | null
  phone?: string | null
  email?: string | null
  source?: 'gmail_import'
  nudge?: string | null
}

export type ContactUpdate = {
  name?: string
  relationship_type?: string | null
  cadence_days?: number
  birthday?: string | null
  notes?: string | null
  phone?: string | null
  email?: string | null
  archived?: boolean
  nudge?: string | null
  snoozed_until?: string | null
}

export type Interaction = {
  id: string
  contact_id: string
  occurred_on: string
  note: string | null
  created_at: string
}

export type InteractionInsert = {
  contact_id: string
  occurred_on?: string
  note?: string | null
}

export type InteractionUpdate = {
  occurred_on?: string
  note?: string | null
}

export type OverdueContactRow = {
  id: string
  user_id: string
  name: string
  relationship_type: string | null
  cadence_days: number
  phone: string | null
  email: string | null
  nudge: string | null
  snoozed_until: string | null
  last_contact_date: string | null
  next_due_date: string
  days_overdue: number
}

export type Group = {
  id: string
  user_id: string
  name: string
  created_at: string
}

export type ContactGroup = {
  contact_id: string
  group_id: string
}

export type Database = {
  public: {
    Tables: {
      users: {
        Row: {
          id: string
          email: string
          timezone: string | null
          digest_day_of_week: number | null
          created_at: string | null
        }
        Insert: {
          id: string
          email: string
          timezone?: string | null
          digest_day_of_week?: number | null
        }
        Update: {
          email?: string
          timezone?: string | null
          digest_day_of_week?: number | null
        }
        Relationships: []
      }
      contacts: {
        Row: Contact
        Insert: {
          user_id: string
          name: string
          relationship_type?: string | null
          cadence_days?: number
          birthday?: string | null
          notes?: string | null
          phone?: string | null
          email?: string | null
          archived?: boolean
          source?: 'manual' | 'gmail_import'
          nudge?: string | null
          snoozed_until?: string | null
        }
        Update: ContactUpdate
        Relationships: []
      }
      interactions: {
        Row: Interaction
        Insert: {
          contact_id: string
          occurred_on?: string
          note?: string | null
        }
        Update: InteractionUpdate
        Relationships: []
      }
      groups: {
        Row: Group
        Insert: {
          user_id: string
          name: string
        }
        Update: {
          name?: string
        }
        Relationships: []
      }
      mcp_tokens: {
        Row: {
          id: string
          user_id: string
          token_hash: string
          label: string
          created_at: string
          last_used_at: string | null
          revoked_at: string | null
          window_started_at: string | null
          window_count: number
          expires_at: string | null
          client_id: string | null
        }
        Insert: {
          user_id: string
          token_hash: string
          label: string
          expires_at?: string | null
          client_id?: string | null
        }
        Update: {
          revoked_at?: string | null
          last_used_at?: string | null
          window_started_at?: string | null
          window_count?: number
        }
        Relationships: []
      }
      mcp_oauth_clients: {
        Row: {
          client_id: string
          client_name: string
          redirect_uris: string[]
          created_at: string
        }
        Insert: {
          client_id: string
          client_name: string
          redirect_uris: string[]
        }
        Update: {
          client_name?: string
        }
        Relationships: []
      }
      mcp_oauth_codes: {
        Row: {
          code_hash: string
          user_id: string
          client_id: string
          redirect_uri: string
          code_challenge: string
          resource: string | null
          expires_at: string
          used_at: string | null
        }
        Insert: {
          code_hash: string
          user_id: string
          client_id: string
          redirect_uri: string
          code_challenge: string
          resource?: string | null
          expires_at: string
        }
        Update: {
          used_at?: string | null
        }
        Relationships: []
      }
      mcp_oauth_refresh: {
        Row: {
          token_hash: string
          user_id: string
          client_id: string
          expires_at: string
          revoked_at: string | null
          replaced_at: string | null
        }
        Insert: {
          token_hash: string
          user_id: string
          client_id: string
          expires_at: string
        }
        Update: {
          revoked_at?: string | null
          replaced_at?: string | null
        }
        Relationships: []
      }
      google_connections: {
        Row: {
          id: string
          user_id: string
          refresh_token_enc: string
          scopes: string
          connected_at: string
          last_synced_at: string | null
        }
        Insert: {
          user_id: string
          refresh_token_enc: string
          scopes: string
          connected_at?: string
          last_synced_at?: string | null
        }
        Update: {
          refresh_token_enc?: string
          scopes?: string
          connected_at?: string
          last_synced_at?: string | null
        }
        Relationships: []
      }
      contact_groups: {
        Row: ContactGroup
        Insert: {
          contact_id: string
          group_id: string
        }
        Update: never
        Relationships: []
      }
    }
    Views: {
      overdue_contacts: {
        Row: OverdueContactRow
        Relationships: []
      }
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}
