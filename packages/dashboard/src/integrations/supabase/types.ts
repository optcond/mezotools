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
    PostgrestVersion: "13.0.5"
  }
  public: {
    Tables: {
      indexer_state: {
        Row: {
          block_number: number
          key: string
          updated_at: string
        }
        Insert: {
          block_number: number
          key: string
          updated_at?: string
        }
        Update: {
          block_number?: number
          key?: string
          updated_at?: string
        }
        Relationships: []
      }
      price_feeds: {
        Row: {
          id: string
          price: number
          source: string
          block_number: number
          recorded_at: string
        }
        Insert: {
          id?: string
          price?: number
          source?: string
          block_number?: number
          recorded_at?: string
        }
        Update: {
          id?: string
          price?: number
          source?: string
          block_number?: number
          recorded_at?: string
        }
        Relationships: []
      }
      liquidations: {
        Row: {
          block_number: number
          block_timestamp: string
          borrower: string
          collateral: number
          created_at: string
          debt: number
          id: string
          log_index: number
          operation: string
          tx_hash: string
          tx_status: string
        }
        Insert: {
          block_number: number
          block_timestamp: string
          borrower: string
          collateral: number
          created_at?: string
          debt: number
          id?: string
          log_index: number
          operation: string
          tx_hash: string
          tx_status: string
        }
        Update: {
          block_number?: number
          block_timestamp?: string
          borrower?: string
          collateral?: number
          created_at?: string
          debt?: number
          id?: string
          log_index?: number
          operation?: string
          tx_hash?: string
          tx_status?: string
        }
        Relationships: []
      }
      redemptions: {
        Row: {
          actual_amount: number
          attempted_amount: number
          affected_borrowers: Json | null
          block_number: number
          block_timestamp: string
          collateral_fee: number
          collateral_sent: number
          created_at: string
          id: string
          log_index: number
          tx_hash: string
          tx_status: string
        }
        Insert: {
          actual_amount: number
          attempted_amount: number
          affected_borrowers?: Json | null
          block_number: number
          block_timestamp: string
          collateral_fee: number
          collateral_sent: number
          created_at?: string
          id?: string
          log_index: number
          tx_hash: string
          tx_status: string
        }
        Update: {
          actual_amount?: number
          attempted_amount?: number
          affected_borrowers?: Json | null
          block_number?: number
          block_timestamp?: string
          collateral_fee?: number
          collateral_sent?: number
          created_at?: string
          id?: string
          log_index?: number
          tx_hash?: string
          tx_status?: string
        }
        Relationships: []
      }
      system_metrics_daily: {
        Row: {
          btc_price: number
          collateral: number
          day: string
          debt: number
          id: string
          tcr: number
          trove_count: number
          updated_at: string
        }
        Insert: {
          btc_price?: number
          collateral?: number
          day: string
          debt?: number
          id?: string
          tcr?: number
          trove_count?: number
          updated_at?: string
        }
        Update: {
          btc_price?: number
          collateral?: number
          day?: string
          debt?: number
          id?: string
          tcr?: number
          trove_count?: number
          updated_at?: string
        }
        Relationships: []
      }
      bridge_assets: {
        Row: {
          balance_formatted: string
          balance_raw: string
          bridge_address: string
          decimals: number
          ethereum_address: string
          ethereum_symbol: string
          mezo_address: string
          token_name: string
          token_symbol: string
          updated_at: string
        }
        Insert: {
          balance_formatted?: string
          balance_raw?: string
          bridge_address?: string
          decimals?: number
          ethereum_address?: string
          ethereum_symbol?: string
          mezo_address?: string
          token_name?: string
          token_symbol: string
          updated_at?: string
        }
        Update: {
          balance_formatted?: string
          balance_raw?: string
          bridge_address?: string
          decimals?: number
          ethereum_address?: string
          ethereum_symbol?: string
          mezo_address?: string
          token_name?: string
          token_symbol?: string
          updated_at?: string
        }
        Relationships: []
      }
      troves: {
        Row: {
          collateral: number
          collaterization_ratio: number
          id: string
          interest: number
          owner: string
          principal_debt: number
          updated_at: string
        }
        Insert: {
          collateral?: number
          collaterization_ratio?: number
          id?: string
          interest?: number
          owner: string
          principal_debt?: number
          updated_at?: string
        }
        Update: {
          collateral?: number
          collaterization_ratio?: number
          id?: string
          interest?: number
          owner?: string
          principal_debt?: number
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
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
    Enums: {},
  },
} as const
