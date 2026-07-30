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
    PostgrestVersion: "14.15"
  }
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      business_days: {
        Row: {
          closed_at: string | null
          date: string
          id: string
          opened_at: string
          status: string
        }
        Insert: {
          closed_at?: string | null
          date?: string
          id?: string
          opened_at?: string
          status?: string
        }
        Update: {
          closed_at?: string | null
          date?: string
          id?: string
          opened_at?: string
          status?: string
        }
        Relationships: []
      }
      order_items: {
        Row: {
          created_at: string
          id: string
          name_snapshot: string
          price_snapshot: number
          product_id: string | null
          qty: number
          staff_id: string | null
          tab_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          name_snapshot: string
          price_snapshot: number
          product_id?: string | null
          qty?: number
          staff_id?: string | null
          tab_id: string
        }
        Update: {
          created_at?: string
          id?: string
          name_snapshot?: string
          price_snapshot?: number
          product_id?: string | null
          qty?: number
          staff_id?: string | null
          tab_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "order_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_tab_id_fkey"
            columns: ["tab_id"]
            isOneToOne: false
            referencedRelation: "tab_summaries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_tab_id_fkey"
            columns: ["tab_id"]
            isOneToOne: false
            referencedRelation: "tabs"
            referencedColumns: ["id"]
          },
        ]
      }
      payments: {
        Row: {
          business_day_id: string
          id: string
          method: string | null
          paid_at: string
          staff_id: string | null
          total: number
        }
        Insert: {
          business_day_id: string
          id?: string
          method?: string | null
          paid_at?: string
          staff_id?: string | null
          total: number
        }
        Update: {
          business_day_id?: string
          id?: string
          method?: string | null
          paid_at?: string
          staff_id?: string | null
          total?: number
        }
        Relationships: [
          {
            foreignKeyName: "payments_business_day_id_fkey"
            columns: ["business_day_id"]
            isOneToOne: false
            referencedRelation: "business_days"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          category: string | null
          created_at: string
          id: string
          is_active: boolean
          name: string
          price: number
          sort_order: number
          updated_at: string
        }
        Insert: {
          category?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          price: number
          sort_order?: number
          updated_at?: string
        }
        Update: {
          category?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          price?: number
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      staff: {
        Row: {
          created_at: string
          id: string
          name: string
          role: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id: string
          name: string
          role?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          role?: string
          updated_at?: string
        }
        Relationships: []
      }
      tabs: {
        Row: {
          business_day_id: string
          created_at: string
          guest_name: string | null
          id: string
          payment_id: string | null
          seq: number
          status: string
        }
        Insert: {
          business_day_id: string
          created_at?: string
          guest_name?: string | null
          id?: string
          payment_id?: string | null
          seq?: number
          status?: string
        }
        Update: {
          business_day_id?: string
          created_at?: string
          guest_name?: string | null
          id?: string
          payment_id?: string | null
          seq?: number
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "tabs_business_day_id_fkey"
            columns: ["business_day_id"]
            isOneToOne: false
            referencedRelation: "business_days"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tabs_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "payment_summaries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tabs_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "payments"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      payment_summaries: {
        Row: {
          business_day_id: string | null
          guest_labels: string[] | null
          id: string | null
          method: string | null
          paid_at: string | null
          staff_name: string | null
          tab_count: number | null
          total: number | null
        }
        Relationships: [
          {
            foreignKeyName: "payments_business_day_id_fkey"
            columns: ["business_day_id"]
            isOneToOne: false
            referencedRelation: "business_days"
            referencedColumns: ["id"]
          },
        ]
      }
      tab_summaries: {
        Row: {
          business_day_id: string | null
          created_at: string | null
          guest_name: string | null
          id: string | null
          item_count: number | null
          last_ordered_at: string | null
          payment_id: string | null
          seq: number | null
          status: string | null
          total: number | null
        }
        Relationships: [
          {
            foreignKeyName: "tabs_business_day_id_fkey"
            columns: ["business_day_id"]
            isOneToOne: false
            referencedRelation: "business_days"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tabs_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "payment_summaries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tabs_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "payments"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      business_day_is_open: {
        Args: { target_business_day_id: string }
        Returns: boolean
      }
      current_business_date: { Args: never; Returns: string }
      is_admin: { Args: never; Returns: boolean }
      move_product: {
        Args: { direction: string; target_product_id: string }
        Returns: undefined
      }
      product_is_used: { Args: { target_product_id: string }; Returns: boolean }
      set_staff_role: {
        Args: { new_role: string; target_staff_id: string }
        Returns: undefined
      }
      settle_tabs: {
        Args: { payment_method?: string; tab_ids: string[] }
        Returns: string
      }
      staff_directory: {
        Args: never
        Returns: {
          created_at: string
          email: string
          id: string
          name: string
          role: string
        }[]
      }
      tab_business_day_is_open: {
        Args: { target_tab_id: string }
        Returns: boolean
      }
      tab_is_empty: { Args: { target_tab_id: string }; Returns: boolean }
      void_payment: { Args: { payment_id: string }; Returns: undefined }
    }
    Enums: {
      [_ in never]: never
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
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const
