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
      day_schedules: {
        Row: {
          created_at: string
          created_by: string
          day: string
          host_id: string
          id: string
          meeting_slot_count: number
          meeting_slot_minutes: number
          meeting_start: string
          removed_at: string | null
          removed_by: string | null
        }
        Insert: {
          created_at?: string
          created_by: string
          day: string
          host_id: string
          id?: string
          meeting_slot_count: number
          meeting_slot_minutes: number
          meeting_start: string
          removed_at?: string | null
          removed_by?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string
          day?: string
          host_id?: string
          id?: string
          meeting_slot_count?: number
          meeting_slot_minutes?: number
          meeting_start?: string
          removed_at?: string | null
          removed_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "day_schedules_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profile_names"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "day_schedules_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "day_schedules_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "day_schedules_host_id_fkey"
            columns: ["host_id"]
            isOneToOne: false
            referencedRelation: "profile_names"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "day_schedules_host_id_fkey"
            columns: ["host_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "day_schedules_host_id_fkey"
            columns: ["host_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "day_schedules_removed_by_fkey"
            columns: ["removed_by"]
            isOneToOne: false
            referencedRelation: "profile_names"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "day_schedules_removed_by_fkey"
            columns: ["removed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "day_schedules_removed_by_fkey"
            columns: ["removed_by"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
        ]
      }
      earnings: {
        Row: {
          amount: number
          base_amount: number | null
          created_at: string
          id: string
          lead_id: string
          meeting_id: string | null
          note: string | null
          paid_at: string | null
          paid_by: string | null
          payable_at: string | null
          profile_id: string
          quote_id: string | null
          rate: number
          status: Database["public"]["Enums"]["earning_status"]
          type: Database["public"]["Enums"]["earning_type"]
          updated_at: string
        }
        Insert: {
          amount: number
          base_amount?: number | null
          created_at?: string
          id?: string
          lead_id: string
          meeting_id?: string | null
          note?: string | null
          paid_at?: string | null
          paid_by?: string | null
          payable_at?: string | null
          profile_id: string
          quote_id?: string | null
          rate: number
          status?: Database["public"]["Enums"]["earning_status"]
          type: Database["public"]["Enums"]["earning_type"]
          updated_at?: string
        }
        Update: {
          amount?: number
          base_amount?: number | null
          created_at?: string
          id?: string
          lead_id?: string
          meeting_id?: string | null
          note?: string | null
          paid_at?: string | null
          paid_by?: string | null
          payable_at?: string | null
          profile_id?: string
          quote_id?: string | null
          rate?: number
          status?: Database["public"]["Enums"]["earning_status"]
          type?: Database["public"]["Enums"]["earning_type"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "earnings_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "lead_contacts"
            referencedColumns: ["lead_id"]
          },
          {
            foreignKeyName: "earnings_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "earnings_meeting_id_fkey"
            columns: ["meeting_id"]
            isOneToOne: false
            referencedRelation: "meetings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "earnings_paid_by_fkey"
            columns: ["paid_by"]
            isOneToOne: false
            referencedRelation: "profile_names"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "earnings_paid_by_fkey"
            columns: ["paid_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "earnings_paid_by_fkey"
            columns: ["paid_by"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "earnings_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profile_names"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "earnings_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "earnings_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
        ]
      }
      knock_sessions: {
        Row: {
          conversations: number
          created_at: string
          doors_knocked: number
          ended_at: string | null
          ended_automatically: boolean
          id: string
          last_tap_at: string | null
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
          ended_automatically?: boolean
          id?: string
          last_tap_at?: string | null
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
          ended_automatically?: boolean
          id?: string
          last_tap_at?: string | null
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
            referencedRelation: "lead_contacts"
            referencedColumns: ["lead_id"]
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
          slot: Database["public"]["Enums"]["photo_slot"] | null
          storage_path: string
        }
        Insert: {
          caption?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          lead_id: string
          slot?: Database["public"]["Enums"]["photo_slot"] | null
          storage_path: string
        }
        Update: {
          caption?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          lead_id?: string
          slot?: Database["public"]["Enums"]["photo_slot"] | null
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
            referencedRelation: "lead_contacts"
            referencedColumns: ["lead_id"]
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
          areas_wanted: Database["public"]["Enums"]["roofline_areas"] | null
          assigned_to: string | null
          both_decision_makers: boolean | null
          christmas_lights_now:
            | Database["public"]["Enums"]["christmas_lights_now"]
            | null
          city: string
          confirm_by: Database["public"]["Enums"]["confirm_by"] | null
          consent_text: boolean
          created_at: string
          created_by: string
          email: string | null
          est_feet: number | null
          first_name: string
          follow_up_on: string | null
          hot_buttons: Database["public"]["Enums"]["hot_button"][]
          house_type: Database["public"]["Enums"]["house_type"] | null
          id: string
          install_timing: Database["public"]["Enums"]["install_timing"] | null
          installed_at: string | null
          knock_session_id: string | null
          last_name: string | null
          lat: number | null
          lng: number | null
          looked_into_before:
            | Database["public"]["Enums"]["looked_into_before"]
            | null
          lost_at: string | null
          lost_reason: string | null
          neighbourhood: string | null
          not_collected: string[]
          notes: string | null
          owns_home: boolean | null
          phone: string | null
          phone_saved: boolean | null
          place_id: string | null
          position_accuracy_m: number | null
          position_source:
            | Database["public"]["Enums"]["map_position_source"]
            | null
          postal_code: string | null
          save_key: string | null
          setter_read: Database["public"]["Enums"]["setter_read"] | null
          soffit_colour: Database["public"]["Enums"]["soffit_colour"] | null
          soffit_note: string | null
          sold_at: string | null
          source: Database["public"]["Enums"]["lead_source"]
          status: Database["public"]["Enums"]["lead_status"]
          track_colour_id: string | null
          track_colour_initialled_at: string | null
          track_colour_initials: string | null
          track_ral_code: string | null
          updated_at: string
          wants_price: boolean | null
        }
        Insert: {
          address_line: string
          areas_wanted?: Database["public"]["Enums"]["roofline_areas"] | null
          assigned_to?: string | null
          both_decision_makers?: boolean | null
          christmas_lights_now?:
            | Database["public"]["Enums"]["christmas_lights_now"]
            | null
          city?: string
          confirm_by?: Database["public"]["Enums"]["confirm_by"] | null
          consent_text?: boolean
          created_at?: string
          created_by: string
          email?: string | null
          est_feet?: number | null
          first_name: string
          follow_up_on?: string | null
          hot_buttons?: Database["public"]["Enums"]["hot_button"][]
          house_type?: Database["public"]["Enums"]["house_type"] | null
          id?: string
          install_timing?: Database["public"]["Enums"]["install_timing"] | null
          installed_at?: string | null
          knock_session_id?: string | null
          last_name?: string | null
          lat?: number | null
          lng?: number | null
          looked_into_before?:
            | Database["public"]["Enums"]["looked_into_before"]
            | null
          lost_at?: string | null
          lost_reason?: string | null
          neighbourhood?: string | null
          not_collected?: string[]
          notes?: string | null
          owns_home?: boolean | null
          phone?: string | null
          phone_saved?: boolean | null
          place_id?: string | null
          position_accuracy_m?: number | null
          position_source?:
            | Database["public"]["Enums"]["map_position_source"]
            | null
          postal_code?: string | null
          save_key?: string | null
          setter_read?: Database["public"]["Enums"]["setter_read"] | null
          soffit_colour?: Database["public"]["Enums"]["soffit_colour"] | null
          soffit_note?: string | null
          sold_at?: string | null
          source?: Database["public"]["Enums"]["lead_source"]
          status?: Database["public"]["Enums"]["lead_status"]
          track_colour_id?: string | null
          track_colour_initialled_at?: string | null
          track_colour_initials?: string | null
          track_ral_code?: string | null
          updated_at?: string
          wants_price?: boolean | null
        }
        Update: {
          address_line?: string
          areas_wanted?: Database["public"]["Enums"]["roofline_areas"] | null
          assigned_to?: string | null
          both_decision_makers?: boolean | null
          christmas_lights_now?:
            | Database["public"]["Enums"]["christmas_lights_now"]
            | null
          city?: string
          confirm_by?: Database["public"]["Enums"]["confirm_by"] | null
          consent_text?: boolean
          created_at?: string
          created_by?: string
          email?: string | null
          est_feet?: number | null
          first_name?: string
          follow_up_on?: string | null
          hot_buttons?: Database["public"]["Enums"]["hot_button"][]
          house_type?: Database["public"]["Enums"]["house_type"] | null
          id?: string
          install_timing?: Database["public"]["Enums"]["install_timing"] | null
          installed_at?: string | null
          knock_session_id?: string | null
          last_name?: string | null
          lat?: number | null
          lng?: number | null
          looked_into_before?:
            | Database["public"]["Enums"]["looked_into_before"]
            | null
          lost_at?: string | null
          lost_reason?: string | null
          neighbourhood?: string | null
          not_collected?: string[]
          notes?: string | null
          owns_home?: boolean | null
          phone?: string | null
          phone_saved?: boolean | null
          place_id?: string | null
          position_accuracy_m?: number | null
          position_source?:
            | Database["public"]["Enums"]["map_position_source"]
            | null
          postal_code?: string | null
          save_key?: string | null
          setter_read?: Database["public"]["Enums"]["setter_read"] | null
          soffit_colour?: Database["public"]["Enums"]["soffit_colour"] | null
          soffit_note?: string | null
          sold_at?: string | null
          source?: Database["public"]["Enums"]["lead_source"]
          status?: Database["public"]["Enums"]["lead_status"]
          track_colour_id?: string | null
          track_colour_initialled_at?: string | null
          track_colour_initials?: string | null
          track_ral_code?: string | null
          updated_at?: string
          wants_price?: boolean | null
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
          {
            foreignKeyName: "leads_track_colour_id_fkey"
            columns: ["track_colour_id"]
            isOneToOne: false
            referencedRelation: "track_colours"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_track_ral_code_fkey"
            columns: ["track_ral_code"]
            isOneToOne: false
            referencedRelation: "ral_classic_colours"
            referencedColumns: ["code"]
          },
        ]
      }
      meetings: {
        Row: {
          booked_by: string
          created_at: string
          ends_at: string
          everyone_deciding_present: boolean
          host_id: string
          id: string
          lead_id: string
          outcome_at: string | null
          outcome_by: string | null
          outcome_note: string | null
          outcome_reason: string | null
          photos_skip_note: string | null
          photos_skipped: string | null
          rebooked_as: string | null
          setter_id: string
          starts_at: string
          status: Database["public"]["Enums"]["meeting_status"]
          updated_at: string
        }
        Insert: {
          booked_by: string
          created_at?: string
          ends_at: string
          everyone_deciding_present: boolean
          host_id: string
          id?: string
          lead_id: string
          outcome_at?: string | null
          outcome_by?: string | null
          outcome_note?: string | null
          outcome_reason?: string | null
          photos_skip_note?: string | null
          photos_skipped?: string | null
          rebooked_as?: string | null
          setter_id: string
          starts_at: string
          status?: Database["public"]["Enums"]["meeting_status"]
          updated_at?: string
        }
        Update: {
          booked_by?: string
          created_at?: string
          ends_at?: string
          everyone_deciding_present?: boolean
          host_id?: string
          id?: string
          lead_id?: string
          outcome_at?: string | null
          outcome_by?: string | null
          outcome_note?: string | null
          outcome_reason?: string | null
          photos_skip_note?: string | null
          photos_skipped?: string | null
          rebooked_as?: string | null
          setter_id?: string
          starts_at?: string
          status?: Database["public"]["Enums"]["meeting_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "meetings_booked_by_fkey"
            columns: ["booked_by"]
            isOneToOne: false
            referencedRelation: "profile_names"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meetings_booked_by_fkey"
            columns: ["booked_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meetings_booked_by_fkey"
            columns: ["booked_by"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meetings_host_id_fkey"
            columns: ["host_id"]
            isOneToOne: false
            referencedRelation: "profile_names"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meetings_host_id_fkey"
            columns: ["host_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meetings_host_id_fkey"
            columns: ["host_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meetings_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "lead_contacts"
            referencedColumns: ["lead_id"]
          },
          {
            foreignKeyName: "meetings_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meetings_outcome_by_fkey"
            columns: ["outcome_by"]
            isOneToOne: false
            referencedRelation: "profile_names"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meetings_outcome_by_fkey"
            columns: ["outcome_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meetings_outcome_by_fkey"
            columns: ["outcome_by"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meetings_rebooked_as_fkey"
            columns: ["rebooked_as"]
            isOneToOne: false
            referencedRelation: "meetings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meetings_setter_id_fkey"
            columns: ["setter_id"]
            isOneToOne: false
            referencedRelation: "profile_names"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meetings_setter_id_fkey"
            columns: ["setter_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meetings_setter_id_fkey"
            columns: ["setter_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
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
          hosts_meetings: boolean
          id: string
          phone: string | null
          role: Database["public"]["Enums"]["user_role"]
          updated_at: string
          welcome_done_at: string | null
        }
        Insert: {
          active?: boolean
          created_at?: string
          email: string
          full_name: string
          hosts_meetings?: boolean
          id: string
          phone?: string | null
          role?: Database["public"]["Enums"]["user_role"]
          updated_at?: string
          welcome_done_at?: string | null
        }
        Update: {
          active?: boolean
          created_at?: string
          email?: string
          full_name?: string
          hosts_meetings?: boolean
          id?: string
          phone?: string | null
          role?: Database["public"]["Enums"]["user_role"]
          updated_at?: string
          welcome_done_at?: string | null
        }
        Relationships: []
      }
      push_subscriptions: {
        Row: {
          created_at: string
          endpoint_hash: string
          id: string
          label: string
          last_sent_at: string | null
          profile_id: string
          removed_at: string | null
          sealed: string
        }
        Insert: {
          created_at?: string
          endpoint_hash: string
          id?: string
          label: string
          last_sent_at?: string | null
          profile_id: string
          removed_at?: string | null
          sealed: string
        }
        Update: {
          created_at?: string
          endpoint_hash?: string
          id?: string
          label?: string
          last_sent_at?: string | null
          profile_id?: string
          removed_at?: string | null
          sealed?: string
        }
        Relationships: [
          {
            foreignKeyName: "push_subscriptions_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profile_names"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "push_subscriptions_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "push_subscriptions_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
        ]
      }
      quote_links: {
        Row: {
          booked_at: string | null
          booked_option: string | null
          booked_selection: number[] | null
          created_at: string
          created_by: string
          first_viewed_at: string | null
          id: string
          last_viewed_at: string | null
          lead_id: string
          notified_option: string | null
          revoked_at: string | null
          revoked_by: string | null
          selection: number[] | null
          selection_at: string | null
          selection_runs: string | null
          token: string
          updated_at: string
          view_count: number
        }
        Insert: {
          booked_at?: string | null
          booked_option?: string | null
          booked_selection?: number[] | null
          created_at?: string
          created_by: string
          first_viewed_at?: string | null
          id?: string
          last_viewed_at?: string | null
          lead_id: string
          notified_option?: string | null
          revoked_at?: string | null
          revoked_by?: string | null
          selection?: number[] | null
          selection_at?: string | null
          selection_runs?: string | null
          token: string
          updated_at?: string
          view_count?: number
        }
        Update: {
          booked_at?: string | null
          booked_option?: string | null
          booked_selection?: number[] | null
          created_at?: string
          created_by?: string
          first_viewed_at?: string | null
          id?: string
          last_viewed_at?: string | null
          lead_id?: string
          notified_option?: string | null
          revoked_at?: string | null
          revoked_by?: string | null
          selection?: number[] | null
          selection_at?: string | null
          selection_runs?: string | null
          token?: string
          updated_at?: string
          view_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "quote_links_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profile_names"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quote_links_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quote_links_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quote_links_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "lead_contacts"
            referencedColumns: ["lead_id"]
          },
          {
            foreignKeyName: "quote_links_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quote_links_revoked_by_fkey"
            columns: ["revoked_by"]
            isOneToOne: false
            referencedRelation: "profile_names"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quote_links_revoked_by_fkey"
            columns: ["revoked_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quote_links_revoked_by_fkey"
            columns: ["revoked_by"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
        ]
      }
      quotes: {
        Row: {
          accepted_at: string | null
          adders: Json
          box_count: number
          box_price: number
          colour_timing: string | null
          created_at: string
          created_by: string
          declined_at: string | null
          discounts: Json
          financing_offered: boolean
          gst: number
          gst_enabled: boolean
          gst_number: string | null
          gst_rate: number
          id: string
          lead_id: string
          min_job_total: number | null
          notes: string | null
          pdf_path: string | null
          presented_at: string | null
          price_per_ft: number
          runs: Json
          rush_fee_per_ft: number | null
          status: Database["public"]["Enums"]["quote_status"]
          subtotal: number
          total: number
          total_feet: number
          track_colour_name: string | null
          track_custom: boolean
          track_ral_code: string | null
          updated_at: string
          valid_until: string | null
        }
        Insert: {
          accepted_at?: string | null
          adders?: Json
          box_count?: number
          box_price: number
          colour_timing?: string | null
          created_at?: string
          created_by: string
          declined_at?: string | null
          discounts?: Json
          financing_offered?: boolean
          gst?: number
          gst_enabled?: boolean
          gst_number?: string | null
          gst_rate: number
          id?: string
          lead_id: string
          min_job_total?: number | null
          notes?: string | null
          pdf_path?: string | null
          presented_at?: string | null
          price_per_ft: number
          runs?: Json
          rush_fee_per_ft?: number | null
          status?: Database["public"]["Enums"]["quote_status"]
          subtotal?: number
          total?: number
          total_feet?: number
          track_colour_name?: string | null
          track_custom?: boolean
          track_ral_code?: string | null
          updated_at?: string
          valid_until?: string | null
        }
        Update: {
          accepted_at?: string | null
          adders?: Json
          box_count?: number
          box_price?: number
          colour_timing?: string | null
          created_at?: string
          created_by?: string
          declined_at?: string | null
          discounts?: Json
          financing_offered?: boolean
          gst?: number
          gst_enabled?: boolean
          gst_number?: string | null
          gst_rate?: number
          id?: string
          lead_id?: string
          min_job_total?: number | null
          notes?: string | null
          pdf_path?: string | null
          presented_at?: string | null
          price_per_ft?: number
          runs?: Json
          rush_fee_per_ft?: number | null
          status?: Database["public"]["Enums"]["quote_status"]
          subtotal?: number
          total?: number
          total_feet?: number
          track_colour_name?: string | null
          track_custom?: boolean
          track_ral_code?: string | null
          updated_at?: string
          valid_until?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "quotes_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profile_names"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quotes_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quotes_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quotes_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "lead_contacts"
            referencedColumns: ["lead_id"]
          },
          {
            foreignKeyName: "quotes_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      ral_classic_colours: {
        Row: {
          code: string
          name: string
        }
        Insert: {
          code: string
          name: string
        }
        Update: {
          code?: string
          name?: string
        }
        Relationships: []
      }
      settings: {
        Row: {
          booking_cutoff_minutes: number
          booking_pay: number
          booking_window_days: number
          box_price: number
          commission_rate: number
          company: Json
          distance_warning_km: number
          door_guide: string
          faq_text: string
          gst_enabled: boolean
          gst_number: string | null
          gst_rate: number
          hold_grace_minutes: number
          hold_minutes: number
          id: number
          lost_reasons: string[]
          meeting_days: number[]
          meeting_host_id: string | null
          meeting_slot_count: number
          meeting_slot_minutes: number
          meeting_start: string
          min_job_total: number | null
          neighbour_discount: number
          not_qualified_reasons: string[]
          presentation: Json
          price_per_ft: number
          quote_valid_days: number
          referral_credit: number
          rush_colour_fee_per_ft: number | null
          service_call_fee: number | null
          step_note_after_door: string
          step_note_at_door: string
          step_note_book: string
          updated_at: string
          warranty_text: string
        }
        Insert: {
          booking_cutoff_minutes?: number
          booking_pay?: number
          booking_window_days?: number
          box_price?: number
          commission_rate?: number
          company: Json
          distance_warning_km?: number
          door_guide?: string
          faq_text?: string
          gst_enabled?: boolean
          gst_number?: string | null
          gst_rate?: number
          hold_grace_minutes?: number
          hold_minutes?: number
          id: number
          lost_reasons?: string[]
          meeting_days?: number[]
          meeting_host_id?: string | null
          meeting_slot_count?: number
          meeting_slot_minutes?: number
          meeting_start?: string
          min_job_total?: number | null
          neighbour_discount?: number
          not_qualified_reasons?: string[]
          presentation: Json
          price_per_ft?: number
          quote_valid_days?: number
          referral_credit?: number
          rush_colour_fee_per_ft?: number | null
          service_call_fee?: number | null
          step_note_after_door?: string
          step_note_at_door?: string
          step_note_book?: string
          updated_at?: string
          warranty_text: string
        }
        Update: {
          booking_cutoff_minutes?: number
          booking_pay?: number
          booking_window_days?: number
          box_price?: number
          commission_rate?: number
          company?: Json
          distance_warning_km?: number
          door_guide?: string
          faq_text?: string
          gst_enabled?: boolean
          gst_number?: string | null
          gst_rate?: number
          hold_grace_minutes?: number
          hold_minutes?: number
          id?: number
          lost_reasons?: string[]
          meeting_days?: number[]
          meeting_host_id?: string | null
          meeting_slot_count?: number
          meeting_slot_minutes?: number
          meeting_start?: string
          min_job_total?: number | null
          neighbour_discount?: number
          not_qualified_reasons?: string[]
          presentation?: Json
          price_per_ft?: number
          quote_valid_days?: number
          referral_credit?: number
          rush_colour_fee_per_ft?: number | null
          service_call_fee?: number | null
          step_note_after_door?: string
          step_note_at_door?: string
          step_note_book?: string
          updated_at?: string
          warranty_text?: string
        }
        Relationships: [
          {
            foreignKeyName: "settings_meeting_host_id_fkey"
            columns: ["meeting_host_id"]
            isOneToOne: false
            referencedRelation: "profile_names"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "settings_meeting_host_id_fkey"
            columns: ["meeting_host_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "settings_meeting_host_id_fkey"
            columns: ["meeting_host_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
        ]
      }
      slot_holds: {
        Row: {
          created_at: string
          holder_id: string
          host_id: string
          id: string
          lead_id: string | null
          meeting_id: string | null
          release_reason: string | null
          released_at: string | null
          renewed_at: string
          starts_at: string
        }
        Insert: {
          created_at?: string
          holder_id: string
          host_id: string
          id?: string
          lead_id?: string | null
          meeting_id?: string | null
          release_reason?: string | null
          released_at?: string | null
          renewed_at?: string
          starts_at: string
        }
        Update: {
          created_at?: string
          holder_id?: string
          host_id?: string
          id?: string
          lead_id?: string | null
          meeting_id?: string | null
          release_reason?: string | null
          released_at?: string | null
          renewed_at?: string
          starts_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "slot_holds_holder_id_fkey"
            columns: ["holder_id"]
            isOneToOne: false
            referencedRelation: "profile_names"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "slot_holds_holder_id_fkey"
            columns: ["holder_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "slot_holds_holder_id_fkey"
            columns: ["holder_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "slot_holds_host_id_fkey"
            columns: ["host_id"]
            isOneToOne: false
            referencedRelation: "profile_names"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "slot_holds_host_id_fkey"
            columns: ["host_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "slot_holds_host_id_fkey"
            columns: ["host_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "slot_holds_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "lead_contacts"
            referencedColumns: ["lead_id"]
          },
          {
            foreignKeyName: "slot_holds_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "slot_holds_meeting_id_fkey"
            columns: ["meeting_id"]
            isOneToOne: false
            referencedRelation: "meetings"
            referencedColumns: ["id"]
          },
        ]
      }
      time_blocks: {
        Row: {
          created_at: string
          created_by: string
          ends_at: string
          host_id: string
          id: string
          reason: string | null
          removed_at: string | null
          removed_by: string | null
          starts_at: string
        }
        Insert: {
          created_at?: string
          created_by: string
          ends_at: string
          host_id: string
          id?: string
          reason?: string | null
          removed_at?: string | null
          removed_by?: string | null
          starts_at: string
        }
        Update: {
          created_at?: string
          created_by?: string
          ends_at?: string
          host_id?: string
          id?: string
          reason?: string | null
          removed_at?: string | null
          removed_by?: string | null
          starts_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "time_blocks_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profile_names"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "time_blocks_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "time_blocks_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "time_blocks_host_id_fkey"
            columns: ["host_id"]
            isOneToOne: false
            referencedRelation: "profile_names"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "time_blocks_host_id_fkey"
            columns: ["host_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "time_blocks_host_id_fkey"
            columns: ["host_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "time_blocks_removed_by_fkey"
            columns: ["removed_by"]
            isOneToOne: false
            referencedRelation: "profile_names"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "time_blocks_removed_by_fkey"
            columns: ["removed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "time_blocks_removed_by_fkey"
            columns: ["removed_by"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
        ]
      }
      track_colours: {
        Row: {
          active: boolean
          created_at: string
          id: string
          name: string
          ral_code: string | null
          sort_order: number
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          id?: string
          name: string
          ral_code?: string | null
          sort_order: number
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          id?: string
          name?: string
          ral_code?: string | null
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "track_colours_ral_code_fkey"
            columns: ["ral_code"]
            isOneToOne: false
            referencedRelation: "ral_classic_colours"
            referencedColumns: ["code"]
          },
        ]
      }
    }
    Views: {
      lead_contacts: {
        Row: {
          assigned_to: string | null
          created_by: string | null
          email: string | null
          lead_id: string | null
          phone: string | null
        }
        Insert: {
          assigned_to?: string | null
          created_by?: string | null
          email?: string | null
          lead_id?: string | null
          phone?: string | null
        }
        Update: {
          assigned_to?: string | null
          created_by?: string | null
          email?: string | null
          lead_id?: string | null
          phone?: string | null
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
        ]
      }
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
          booking_cutoff_minutes: number | null
          booking_window_days: number | null
          distance_warning_km: number | null
          door_guide: string | null
          hold_grace_minutes: number | null
          hold_minutes: number | null
          lost_reasons: string[] | null
          meeting_days: number[] | null
          meeting_slot_count: number | null
          meeting_slot_minutes: number | null
          meeting_start: string | null
          step_note_after_door: string | null
          step_note_at_door: string | null
          step_note_book: string | null
        }
        Insert: {
          booking_cutoff_minutes?: number | null
          booking_window_days?: number | null
          distance_warning_km?: number | null
          door_guide?: string | null
          hold_grace_minutes?: number | null
          hold_minutes?: number | null
          lost_reasons?: string[] | null
          meeting_days?: number[] | null
          meeting_slot_count?: number | null
          meeting_slot_minutes?: number | null
          meeting_start?: string | null
          step_note_after_door?: string | null
          step_note_at_door?: string | null
          step_note_book?: string | null
        }
        Update: {
          booking_cutoff_minutes?: number | null
          booking_window_days?: number | null
          distance_warning_km?: number | null
          door_guide?: string | null
          hold_grace_minutes?: number | null
          hold_minutes?: number | null
          lost_reasons?: string[] | null
          meeting_days?: number[] | null
          meeting_slot_count?: number | null
          meeting_slot_minutes?: number | null
          meeting_start?: string | null
          step_note_after_door?: string | null
          step_note_at_door?: string | null
          step_note_book?: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      acts_as_owner: { Args: never; Returns: boolean }
      add_time_block: {
        Args: {
          p_ends_at: string
          p_host?: string
          p_reason?: string
          p_starts_at: string
        }
        Returns: string
      }
      book_meeting: {
        Args: {
          p_everyone_deciding_present: boolean
          p_host?: string
          p_lead_id: string
          p_photos_skip_note?: string
          p_photos_skipped?: string
          p_starts_at: string
        }
        Returns: string
      }
      booking_problems: {
        Args: {
          p_everyone_deciding_present: boolean
          p_lead_id: string
          p_photos_skip_note: string
          p_photos_skipped: string
        }
        Returns: string[]
      }
      bump_knock_session: {
        Args: { p_conversations?: number; p_doors?: number; p_session: string }
        Returns: {
          conversations: number
          created_at: string
          doors_knocked: number
          ended_at: string | null
          ended_automatically: boolean
          id: string
          last_tap_at: string | null
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
      calgary_tomorrow: { Args: never; Returns: string }
      cancel_meeting: {
        Args: { p_meeting_id: string; p_note?: string }
        Returns: undefined
      }
      check_slot_free: {
        Args: {
          p_host: string
          p_me: string
          p_owner: boolean
          p_starts_at: string
        }
        Returns: undefined
      }
      close_my_stale_knock_sessions: { Args: never; Returns: number }
      end_open_knock_sessions: { Args: never; Returns: number }
      current_user_role: {
        Args: never
        Returns: Database["public"]["Enums"]["user_role"]
      }
      day_schedule_preview: {
        Args: {
          p_count: number
          p_day: string
          p_host?: string
          p_minutes: number
          p_scope: string
          p_start: string
        }
        Returns: Json
      }
      default_meeting_host: { Args: never; Returns: string }
      end_user_sessions: { Args: { target_user: string }; Returns: number }
      extend_hold: { Args: never; Returns: Json }
      finish_welcome: { Args: never; Returns: string }
      hold_grace: { Args: never; Returns: string }
      hold_slot: {
        Args: {
          p_host?: string
          p_lead_id?: string
          p_meeting_id?: string
          p_starts_at: string
        }
        Returns: Json
      }
      hold_status: { Args: never; Returns: Json }
      is_owner: { Args: never; Returns: boolean }
      is_sales_side: { Args: never; Returns: boolean }
      is_template_slot:
        | { Args: { p_starts_at: string }; Returns: boolean }
        | { Args: { p_host: string; p_starts_at: string }; Returns: boolean }
      issue_quote_link: { Args: { p_lead_id: string }; Returns: string }
      lock_evening: {
        Args: { p_at: string; p_host: string }
        Returns: undefined
      }
      lock_evenings: {
        Args: { p_a: string; p_b: string; p_host: string }
        Returns: undefined
      }
      mark_earnings_paid: { Args: { p_ids: string[] }; Returns: number }
      move_meeting: {
        Args: { p_meeting_id: string; p_new_starts_at: string }
        Returns: string
      }
      push_devices_for_member: {
        Args: { p_profile_id: string }
        Returns: {
          created_at: string
          id: string
          label: string
          last_sent_at: string
        }[]
      }
      push_targets_for_member: {
        Args: { p_profile_id: string }
        Returns: {
          id: string
          sealed: string
        }[]
      }
      quote_for_customer: { Args: { p_token: string }; Returns: Json }
      quote_link_book: {
        Args: { p_positions: number[]; p_token: string }
        Returns: Json
      }
      quote_link_current_quote: {
        Args: { p_lead_id: string }
        Returns: {
          accepted_at: string | null
          adders: Json
          box_count: number
          box_price: number
          colour_timing: string | null
          created_at: string
          created_by: string
          declined_at: string | null
          discounts: Json
          financing_offered: boolean
          gst: number
          gst_enabled: boolean
          gst_number: string | null
          gst_rate: number
          id: string
          lead_id: string
          min_job_total: number | null
          notes: string | null
          pdf_path: string | null
          presented_at: string | null
          price_per_ft: number
          runs: Json
          rush_fee_per_ft: number | null
          status: Database["public"]["Enums"]["quote_status"]
          subtotal: number
          total: number
          total_feet: number
          track_colour_name: string | null
          track_custom: boolean
          track_ral_code: string | null
          updated_at: string
          valid_until: string | null
        }
        SetofOptions: {
          from: "*"
          to: "quotes"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      quote_link_live: {
        Args: { p_token: string }
        Returns: {
          booked_at: string | null
          booked_option: string | null
          booked_selection: number[] | null
          created_at: string
          created_by: string
          first_viewed_at: string | null
          id: string
          last_viewed_at: string | null
          lead_id: string
          notified_option: string | null
          revoked_at: string | null
          revoked_by: string | null
          selection: number[] | null
          selection_at: string | null
          selection_runs: string | null
          token: string
          updated_at: string
          view_count: number
        }
        SetofOptions: {
          from: "*"
          to: "quote_links"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      quote_link_positions: {
        Args: { p_positions: number[]; p_runs: Json }
        Returns: number[]
      }
      quote_link_run_name: {
        Args: { p_position: number; p_run: Json }
        Returns: string
      }
      quote_link_select: {
        Args: { p_positions: number[]; p_token: string }
        Returns: boolean
      }
      quote_link_visit: { Args: { p_token: string }; Returns: boolean }
      quote_mockup_signable: { Args: { p_name: string }; Returns: boolean }
      release_hold: { Args: never; Returns: undefined }
      release_lapsed_holds: {
        Args: { p_host: string; p_starts_at: string }
        Returns: undefined
      }
      remove_time_block: { Args: { p_block_id: string }; Returns: undefined }
      renew_hold: { Args: never; Returns: Json }
      reset_welcome: { Args: { p_profile_id: string }; Returns: boolean }
      resolve_meeting_host: { Args: { p_host: string }; Returns: string }
      revoke_quote_link: { Args: { p_lead_id: string }; Returns: boolean }
      schedule_board: {
        Args: { p_as_sales?: boolean; p_host?: string; p_viewer?: string }
        Returns: {
          day: string
          ends_at: string
          held_by_viewer: boolean
          holder_id: string
          holder_name: string
          lead_id: string
          meeting_id: string
          neighbourhood: string
          setter_id: string
          setter_is_viewer: boolean
          setter_name: string
          starts_at: string
          state: string
        }[]
      }
      set_day_schedule: {
        Args: {
          p_count: number
          p_day: string
          p_host?: string
          p_minutes: number
          p_scope: string
          p_start: string
        }
        Returns: Json
      }
      set_meeting_outcome: {
        Args: {
          p_meeting_id: string
          p_note?: string
          p_outcome: Database["public"]["Enums"]["meeting_status"]
          p_reason?: string
        }
        Returns: undefined
      }
      slot_minutes_on: {
        Args: { p_day: string; p_host: string }
        Returns: number
      }
      slot_starts_on:
        | { Args: { p_day: string }; Returns: string[] }
        | { Args: { p_day: string; p_host: string }; Returns: string[] }
      slot_template_on: {
        Args: { p_day: string; p_host: string }
        Returns: {
          meeting_start: string
          own_schedule: boolean
          slot_count: number
          slot_minutes: number
        }[]
      }
      slot_time_problem: {
        Args: { p_now: string; p_owner: boolean; p_starts_at: string }
        Returns: string
      }
      template_times: {
        Args: {
          p_count: number
          p_day: string
          p_minutes: number
          p_start: string
        }
        Returns: string[]
      }
    }
    Enums: {
      christmas_lights_now: "hires" | "diy" | "none"
      confirm_by: "call" | "text"
      earning_status: "pending" | "paid" | "void"
      earning_type: "booking" | "commission"
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
        | "meeting_moved"
        | "meeting_cancelled"
        | "colour_confirmed"
        | "quote_link_created"
        | "quote_link_opened"
        | "quote_link_revoked"
        | "install_requested"
      hot_button:
        | "no_ladders"
        | "up_for_christmas"
        | "curb_appeal"
        | "safety_security"
        | "not_sure"
      house_type: "bungalow" | "bi_level" | "two_storey" | "other"
      install_timing: "before_christmas" | "new_year" | "no_rush"
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
      looked_into_before: "got_quotes" | "thought_about_it" | "new_to_them"
      map_position_source: "picked" | "device"
      meeting_status:
        | "booked"
        | "confirmed"
        | "qualified"
        | "not_qualified"
        | "no_show"
        | "cancelled"
        | "moved"
      photo_slot: "front" | "left_corner" | "right_corner" | "soffit" | "mockup"
      quote_status: "draft" | "presented" | "accepted" | "declined" | "expired"
      roofline_areas: "front" | "front_and_sides" | "full_wrap" | "not_sure"
      setter_read: "hot" | "warm" | "just_curious"
      soffit_colour:
        | "white"
        | "off_white"
        | "black"
        | "brown"
        | "other"
        | "not_sure"
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
      christmas_lights_now: ["hires", "diy", "none"],
      confirm_by: ["call", "text"],
      earning_status: ["pending", "paid", "void"],
      earning_type: ["booking", "commission"],
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
        "meeting_moved",
        "meeting_cancelled",
        "colour_confirmed",
        "quote_link_created",
        "quote_link_opened",
        "quote_link_revoked",
        "install_requested",
      ],
      hot_button: [
        "no_ladders",
        "up_for_christmas",
        "curb_appeal",
        "safety_security",
        "not_sure",
      ],
      house_type: ["bungalow", "bi_level", "two_storey", "other"],
      install_timing: ["before_christmas", "new_year", "no_rush"],
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
      looked_into_before: ["got_quotes", "thought_about_it", "new_to_them"],
      map_position_source: ["picked", "device"],
      meeting_status: [
        "booked",
        "confirmed",
        "qualified",
        "not_qualified",
        "no_show",
        "cancelled",
        "moved",
      ],
      photo_slot: ["front", "left_corner", "right_corner", "soffit", "mockup"],
      quote_status: ["draft", "presented", "accepted", "declined", "expired"],
      roofline_areas: ["front", "front_and_sides", "full_wrap", "not_sure"],
      setter_read: ["hot", "warm", "just_curious"],
      soffit_colour: [
        "white",
        "off_white",
        "black",
        "brown",
        "other",
        "not_sure",
      ],
      user_role: ["owner", "sales", "crew"],
    },
  },
} as const
