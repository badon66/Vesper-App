// Generated from the Supabase project with the connector's type generator
// after migration m2_leads_knock_sessions. Regenerate after every migration.
export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      knock_sessions: {
        Row: {
          conversations: number
          created_at: string
          doors_knocked: number
          ended_at: string | null
          id: string
          neighbourhood: string
          notes: string | null
          started_at: string
          updated_at: string
          user_id: string
        }
        Insert: {
          conversations?: number
          created_at?: string
          doors_knocked?: number
          ended_at?: string | null
          id?: string
          neighbourhood: string
          notes?: string | null
          started_at?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          conversations?: number
          created_at?: string
          doors_knocked?: number
          ended_at?: string | null
          id?: string
          neighbourhood?: string
          notes?: string | null
          started_at?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "knock_sessions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profile_names"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "knock_sessions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "knock_sessions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_events: {
        Row: {
          actor_id: string | null
          created_at: string
          from_status: Database["public"]["Enums"]["lead_status"] | null
          id: string
          lead_id: string
          payload: Json | null
          to_status: Database["public"]["Enums"]["lead_status"] | null
          type: Database["public"]["Enums"]["event_type"]
        }
        Insert: {
          actor_id?: string | null
          created_at?: string
          from_status?: Database["public"]["Enums"]["lead_status"] | null
          id?: string
          lead_id: string
          payload?: Json | null
          to_status?: Database["public"]["Enums"]["lead_status"] | null
          type: Database["public"]["Enums"]["event_type"]
        }
        Update: {
          actor_id?: string | null
          created_at?: string
          from_status?: Database["public"]["Enums"]["lead_status"] | null
          id?: string
          lead_id?: string
          payload?: Json | null
          to_status?: Database["public"]["Enums"]["lead_status"] | null
          type?: Database["public"]["Enums"]["event_type"]
        }
        Relationships: [
          {
            foreignKeyName: "lead_events_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profile_names"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_events_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_events_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_events_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_photos: {
        Row: {
          caption: string | null
          created_at: string
          created_by: string | null
          id: string
          lead_id: string
          storage_path: string
        }
        Insert: {
          caption?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          lead_id: string
          storage_path: string
        }
        Update: {
          caption?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          lead_id?: string
          storage_path?: string
        }
        Relationships: [
          {
            foreignKeyName: "lead_photos_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profile_names"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_photos_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_photos_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_photos_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      leads: {
        Row: {
          address_line: string
          assigned_to: string | null
          both_decision_makers: boolean | null
          city: string
          consent_text: boolean
          created_at: string
          created_by: string
          email: string | null
          est_feet: number | null
          first_name: string
          house_type: Database["public"]["Enums"]["house_type"] | null
          id: string
          installed_at: string | null
          knock_session_id: string | null
          last_name: string | null
          lat: number | null
          lng: number | null
          lost_at: string | null
          lost_reason: string | null
          neighbourhood: string | null
          notes: string | null
          phone: string | null
          place_id: string | null
          postal_code: string | null
          soffit_colour: Database["public"]["Enums"]["soffit_colour"] | null
          soffit_note: string | null
          sold_at: string | null
          source: Database["public"]["Enums"]["lead_source"]
          status: Database["public"]["Enums"]["lead_status"]
          updated_at: string
        }
        Insert: {
          address_line: string
          assigned_to?: string | null
          both_decision_makers?: boolean | null
          city?: string
          consent_text?: boolean
          created_at?: string
          created_by: string
          email?: string | null
          est_feet?: number | null
          first_name: string
          house_type?: Database["public"]["Enums"]["house_type"] | null
          id?: string
          installed_at?: string | null
          knock_session_id?: string | null
          last_name?: string | null
          lat?: number | null
          lng?: number | null
          lost_at?: string | null
          lost_reason?: string | null
          neighbourhood?: string | null
          notes?: string | null
          phone?: string | null
          place_id?: string | null
          postal_code?: string | null
          soffit_colour?: Database["public"]["Enums"]["soffit_colour"] | null
          soffit_note?: string | null
          sold_at?: string | null
          source?: Database["public"]["Enums"]["lead_source"]
          status?: Database["public"]["Enums"]["lead_status"]
          updated_at?: string
        }
        Update: {
          address_line?: string
          assigned_to?: string | null
          both_decision_makers?: boolean | null
          city?: string
          consent_text?: boolean
          created_at?: string
          created_by?: string
          email?: string | null
          est_feet?: number | null
          first_name?: string
          house_type?: Database["public"]["Enums"]["house_type"] | null
          id?: string
          installed_at?: string | null
          knock_session_id?: string | null
          last_name?: string | null
          lat?: number | null
          lng?: number | null
          lost_at?: string | null
          lost_reason?: string | null
          neighbourhood?: string | null
          notes?: string | null
          phone?: string | null
          place_id?: string | null
          postal_code?: string | null
          soffit_colour?: Database["public"]["Enums"]["soffit_colour"] | null
          soffit_note?: string | null
          sold_at?: string | null
          source?: Database["public"]["Enums"]["lead_source"]
          status?: Database["public"]["Enums"]["lead_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "leads_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "profile_names"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profile_names"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_knock_session_id_fkey"
            columns: ["knock_session_id"]
            isOneToOne: false
            referencedRelation: "knock_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          active: boolean
          created_at: string
          email: string
          full_name: string
          id: string
          phone: string | null
          role: Database["public"]["Enums"]["user_role"]
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          email: string
          full_name: string
          id: string
          phone?: string | null
          role?: Database["public"]["Enums"]["user_role"]
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          email?: string
          full_name?: string
          id?: string
          phone?: string | null
          role?: Database["public"]["Enums"]["user_role"]
          updated_at?: string
        }
        Relationships: []
      }
      settings: {
        Row: {
          booking_pay: number
          box_price: number
          commission_rate: number
          company: Json
          distance_warning_km: number
          gst_enabled: boolean
          gst_number: string | null
          gst_rate: number
          id: number
          lost_reasons: string[]
          meeting_days: number[]
          meeting_slot_count: number
          meeting_slot_minutes: number
          meeting_start: string
          neighbour_discount: number
          presentation: Json
          price_per_ft: number
          referral_credit: number
          updated_at: string
          warranty_text: string
        }
        Insert: {
          booking_pay?: number
          box_price?: number
          commission_rate?: number
          company: Json
          distance_warning_km?: number
          gst_enabled?: boolean
          gst_number?: string | null
          gst_rate?: number
          id: number
          lost_reasons?: string[]
          meeting_days?: number[]
          meeting_slot_count?: number
          meeting_slot_minutes?: number
          meeting_start?: string
          neighbour_discount?: number
          presentation: Json
          price_per_ft?: number
          referral_credit?: number
          updated_at?: string
          warranty_text: string
        }
        Update: {
          booking_pay?: number
          box_price?: number
          commission_rate?: number
          company?: Json
          distance_warning_km?: number
          gst_enabled?: boolean
          gst_number?: string | null
          gst_rate?: number
          id?: number
          lost_reasons?: string[]
          meeting_days?: number[]
          meeting_slot_count?: number
          meeting_slot_minutes?: number
          meeting_start?: string
          neighbour_discount?: number
          presentation?: Json
          price_per_ft?: number
          referral_credit?: number
          updated_at?: string
          warranty_text?: string
        }
        Relationships: []
      }
    }
    Views: {
      profile_names: {
        Row: {
          full_name: string | null
          id: string | null
        }
        Insert: {
          full_name?: string | null
          id?: string | null
        }
        Update: {
          full_name?: string | null
          id?: string | null
        }
        Relationships: []
      }
      profiles_public: {
        Row: {
          full_name: string | null
          id: string | null
          role: Database["public"]["Enums"]["user_role"] | null
        }
        Insert: {
          full_name?: string | null
          id?: string | null
          role?: Database["public"]["Enums"]["user_role"] | null
        }
        Update: {
          full_name?: string | null
          id?: string | null
          role?: Database["public"]["Enums"]["user_role"] | null
        }
        Relationships: []
      }
      settings_public: {
        Row: {
          distance_warning_km: number | null
          lost_reasons: string[] | null
          meeting_days: number[] | null
          meeting_slot_count: number | null
          meeting_slot_minutes: number | null
          meeting_start: string | null
        }
        Insert: {
          distance_warning_km?: number | null
          lost_reasons?: string[] | null
          meeting_days?: number[] | null
          meeting_slot_count?: number | null
          meeting_slot_minutes?: number | null
          meeting_start?: string | null
        }
        Update: {
          distance_warning_km?: number | null
          lost_reasons?: string[] | null
          meeting_days?: number[] | null
          meeting_slot_count?: number | null
          meeting_slot_minutes?: number | null
          meeting_start?: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      bump_knock_session: {
        Args: { p_conversations?: number; p_doors?: number; p_session: string }
        Returns: {
          conversations: number
          created_at: string
          doors_knocked: number
          ended_at: string | null
          id: string
          neighbourhood: string
          notes: string | null
          started_at: string
          updated_at: string
          user_id: string
        }[]
        SetofOptions: {
          from: "*"
          to: "knock_sessions"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      close_my_stale_knock_sessions: { Args: never; Returns: number }
      current_user_role: {
        Args: never
        Returns: Database["public"]["Enums"]["user_role"]
      }
      end_user_sessions: { Args: { target_user: string }; Returns: number }
      is_owner: { Args: never; Returns: boolean }
      is_sales_side: { Args: never; Returns: boolean }
    }
    Enums: {
      event_type:
        | "created"
        | "note"
        | "status_change"
        | "call"
        | "text"
        | "meeting_booked"
        | "meeting_outcome"
        | "quote_created"
        | "quote_presented"
        | "quote_accepted"
        | "quote_declined"
        | "photo_added"
        | "edited"
      house_type: "bungalow" | "bi_level" | "two_storey" | "other"
      lead_source: "door" | "referral" | "neighbour_card" | "website" | "other"
      lead_status:
        | "new"
        | "follow_up"
        | "meeting_booked"
        | "met"
        | "quoted"
        | "sold"
        | "installed"
        | "lost"
      soffit_colour: "white" | "black" | "brown" | "other"
      user_role: "owner" | "sales" | "crew"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      event_type: [
        "created",
        "note",
        "status_change",
        "call",
        "text",
        "meeting_booked",
        "meeting_outcome",
        "quote_created",
        "quote_presented",
        "quote_accepted",
        "quote_declined",
        "photo_added",
        "edited",
      ],
      house_type: ["bungalow", "bi_level", "two_storey", "other"],
      lead_source: ["door", "referral", "neighbour_card", "website", "other"],
      lead_status: [
        "new",
        "follow_up",
        "meeting_booked",
        "met",
        "quoted",
        "sold",
        "installed",
        "lost",
      ],
      soffit_colour: ["white", "black", "brown", "other"],
      user_role: ["owner", "sales", "crew"],
    },
  },
} as const
