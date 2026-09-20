export type Contact = {
  id: string
  user_id: string
  name: string
  relationship_type: string | null
  cadence_days: number
  birthday: string | null
  notes: string | null
  archived: boolean
  created_at: string
}

export type ContactInsert = {
  name: string
  relationship_type?: string | null
  cadence_days?: number
  birthday?: string | null
  notes?: string | null
}

export type ContactUpdate = {
  name?: string
  relationship_type?: string | null
  cadence_days?: number
  birthday?: string | null
  notes?: string | null
  archived?: boolean
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
  last_contact_date: string
  next_due_date: string
  days_overdue: number
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
          archived?: boolean
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
