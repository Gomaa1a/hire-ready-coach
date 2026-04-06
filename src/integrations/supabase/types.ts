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
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      credits: {
        Row: {
          balance: number
          id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          balance?: number
          id?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          balance?: number
          id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      interview_state: {
        Row: {
          current_phase: string
          cv_summary: string | null
          id: string
          interview_id: string
          question_count: number
          running_scores: Json
          topics_covered: Json
          updated_at: string
        }
        Insert: {
          current_phase?: string
          cv_summary?: string | null
          id?: string
          interview_id: string
          question_count?: number
          running_scores?: Json
          topics_covered?: Json
          updated_at?: string
        }
        Update: {
          current_phase?: string
          cv_summary?: string | null
          id?: string
          interview_id?: string
          question_count?: number
          running_scores?: Json
          topics_covered?: Json
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "interview_state_interview_id_fkey"
            columns: ["interview_id"]
            isOneToOne: true
            referencedRelation: "interviews"
            referencedColumns: ["id"]
          },
        ]
      }
      interviews: {
        Row: {
          ai_summary: string | null
          created_at: string
          cv_url: string | null
          ended_at: string | null
          id: string
          interview_type: string
          level: string
          question_bank: Json | null
          role: string
          status: string
          user_id: string
        }
        Insert: {
          ai_summary?: string | null
          created_at?: string
          cv_url?: string | null
          ended_at?: string | null
          id?: string
          interview_type?: string
          level: string
          question_bank?: Json | null
          role: string
          status?: string
          user_id: string
        }
        Update: {
          ai_summary?: string | null
          created_at?: string
          cv_url?: string | null
          ended_at?: string | null
          id?: string
          interview_type?: string
          level?: string
          question_bank?: Json | null
          role?: string
          status?: string
          user_id?: string
        }
        Relationships: []
      }
      messages: {
        Row: {
          content: string
          created_at: string
          id: string
          interview_id: string
          role: string
        }
        Insert: {
          content: string
          created_at?: string
          id?: string
          interview_id: string
          role: string
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          interview_id?: string
          role?: string
        }
        Relationships: [
          {
            foreignKeyName: "messages_interview_id_fkey"
            columns: ["interview_id"]
            isOneToOne: false
            referencedRelation: "interviews"
            referencedColumns: ["id"]
          },
        ]
      }
      negotiation_sessions: {
        Row: {
          assertiveness_score: number | null
          created_at: string
          ended_at: string | null
          id: string
          interview_id: string
          outcome: string | null
          professionalism_score: number | null
          tips: Json | null
          user_id: string
        }
        Insert: {
          assertiveness_score?: number | null
          created_at?: string
          ended_at?: string | null
          id?: string
          interview_id: string
          outcome?: string | null
          professionalism_score?: number | null
          tips?: Json | null
          user_id: string
        }
        Update: {
          assertiveness_score?: number | null
          created_at?: string
          ended_at?: string | null
          id?: string
          interview_id?: string
          outcome?: string | null
          professionalism_score?: number | null
          tips?: Json | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "negotiation_sessions_interview_id_fkey"
            columns: ["interview_id"]
            isOneToOne: false
            referencedRelation: "interviews"
            referencedColumns: ["id"]
          },
        ]
      }
      payments: {
        Row: {
          amount: number | null
          created_at: string
          credits_added: number | null
          id: string
          status: string
          stripe_session_id: string | null
          user_id: string
        }
        Insert: {
          amount?: number | null
          created_at?: string
          credits_added?: number | null
          id?: string
          status?: string
          stripe_session_id?: string | null
          user_id: string
        }
        Update: {
          amount?: number | null
          created_at?: string
          credits_added?: number | null
          id?: string
          status?: string
          stripe_session_id?: string | null
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          biggest_challenge: string | null
          created_at: string
          current_role: string | null
          experience_level: string | null
          full_name: string | null
          heard_from: string | null
          id: string
          interview_frequency: string | null
          onboarding_completed: boolean
          primary_goal: string | null
          target_role: string | null
          used_promo_code: string | null
        }
        Insert: {
          avatar_url?: string | null
          biggest_challenge?: string | null
          created_at?: string
          current_role?: string | null
          experience_level?: string | null
          full_name?: string | null
          heard_from?: string | null
          id: string
          interview_frequency?: string | null
          onboarding_completed?: boolean
          primary_goal?: string | null
          target_role?: string | null
          used_promo_code?: string | null
        }
        Update: {
          avatar_url?: string | null
          biggest_challenge?: string | null
          created_at?: string
          current_role?: string | null
          experience_level?: string | null
          full_name?: string | null
          heard_from?: string | null
          id?: string
          interview_frequency?: string | null
          onboarding_completed?: boolean
          primary_goal?: string | null
          target_role?: string | null
          used_promo_code?: string | null
        }
        Relationships: []
      }
      promo_codes: {
        Row: {
          code: string
          commission_percent: number
          created_at: string
          discount_percent: number
          id: string
          is_active: boolean
          owner_email: string | null
          owner_name: string
        }
        Insert: {
          code: string
          commission_percent?: number
          created_at?: string
          discount_percent?: number
          id?: string
          is_active?: boolean
          owner_email?: string | null
          owner_name: string
        }
        Update: {
          code?: string
          commission_percent?: number
          created_at?: string
          discount_percent?: number
          id?: string
          is_active?: boolean
          owner_email?: string | null
          owner_name?: string
        }
        Relationships: []
      }
      referral_signups: {
        Row: {
          created_at: string
          id: string
          promo_code_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          promo_code_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          promo_code_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "referral_signups_promo_code_id_fkey"
            columns: ["promo_code_id"]
            isOneToOne: false
            referencedRelation: "promo_codes"
            referencedColumns: ["id"]
          },
        ]
      }
      reports: {
        Row: {
          clarity_score: number | null
          comm_score: number | null
          conf_score: number | null
          created_at: string
          feedback_text: string | null
          id: string
          impact_score: number | null
          interview_id: string
          market_insights: Json | null
          overall_score: number | null
          roadmap: Json | null
          role_requirements: Json | null
          scoring_rubric: Json | null
          strengths: Json | null
          struct_score: number | null
          tech_score: number | null
          user_id: string
          weaknesses: Json | null
        }
        Insert: {
          clarity_score?: number | null
          comm_score?: number | null
          conf_score?: number | null
          created_at?: string
          feedback_text?: string | null
          id?: string
          impact_score?: number | null
          interview_id: string
          market_insights?: Json | null
          overall_score?: number | null
          roadmap?: Json | null
          role_requirements?: Json | null
          scoring_rubric?: Json | null
          strengths?: Json | null
          struct_score?: number | null
          tech_score?: number | null
          user_id: string
          weaknesses?: Json | null
        }
        Update: {
          clarity_score?: number | null
          comm_score?: number | null
          conf_score?: number | null
          created_at?: string
          feedback_text?: string | null
          id?: string
          impact_score?: number | null
          interview_id?: string
          market_insights?: Json | null
          overall_score?: number | null
          roadmap?: Json | null
          role_requirements?: Json | null
          scoring_rubric?: Json | null
          strengths?: Json | null
          struct_score?: number | null
          tech_score?: number | null
          user_id?: string
          weaknesses?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "reports_interview_id_fkey"
            columns: ["interview_id"]
            isOneToOne: false
            referencedRelation: "interviews"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      platform_stats: {
        Row: {
          total_interviews: number | null
          total_users: number | null
        }
        Relationships: []
      }
    }
    Functions: {
      deduct_credit: { Args: never; Returns: boolean }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      lookup_promo_code: {
        Args: { _code: string }
        Returns: {
          code: string
          discount_percent: number
          id: string
          is_active: boolean
        }[]
      }
      owns_interview: { Args: { _interview_id: string }; Returns: boolean }
    }
    Enums: {
      app_role: "admin" | "user"
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
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
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
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
      app_role: ["admin", "user"],
    },
  },
} as const
