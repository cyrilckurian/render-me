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
    PostgrestVersion: "14.4"
  }
  public: {
    Tables: {
      composer_sessions: {
        Row: {
          base_sketch_path: string | null
          created_at: string
          id: string
          regions_json: Json
          title: string
          updated_at: string
          user_id: string
          variations_json: Json
        }
        Insert: {
          base_sketch_path?: string | null
          created_at?: string
          id?: string
          regions_json?: Json
          title?: string
          updated_at?: string
          user_id: string
          variations_json?: Json
        }
        Update: {
          base_sketch_path?: string | null
          created_at?: string
          id?: string
          regions_json?: Json
          title?: string
          updated_at?: string
          user_id?: string
          variations_json?: Json
        }
        Relationships: []
      }
      compositions: {
        Row: {
          created_at: string
          id: string
          image_source: string
          original_file_name: string
          original_image_path: string
          regions_json: Json
          result_image_path: string | null
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          image_source?: string
          original_file_name?: string
          original_image_path: string
          regions_json?: Json
          result_image_path?: string | null
          title?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          image_source?: string
          original_file_name?: string
          original_image_path?: string
          regions_json?: Json
          result_image_path?: string | null
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      custom_styles: {
        Row: {
          created_at: string
          description: string
          id: string
          name: string
          prompt: string
          user_id: string
        }
        Insert: {
          created_at?: string
          description: string
          id?: string
          name: string
          prompt: string
          user_id: string
        }
        Update: {
          created_at?: string
          description?: string
          id?: string
          name?: string
          prompt?: string
          user_id?: string
        }
        Relationships: []
      }
      feature_requests: {
        Row: {
          allow_contact: boolean
          created_at: string
          details: string
          email: string
          id: string
        }
        Insert: {
          allow_contact?: boolean
          created_at?: string
          details: string
          email: string
          id?: string
        }
        Update: {
          allow_contact?: boolean
          created_at?: string
          details?: string
          email?: string
          id?: string
        }
        Relationships: []
      }
      render_feedback: {
        Row: {
          created_at: string
          expectation: string | null
          id: string
          rating: string
          reality: string | null
          render_id: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string
          expectation?: string | null
          id?: string
          rating: string
          reality?: string | null
          render_id?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string
          expectation?: string | null
          id?: string
          rating?: string
          reality?: string | null
          render_id?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      renders: {
        Row: {
          created_at: string
          floor_plan_name: string
          floor_plan_path: string
          id: string
          prompt: string
          rendered_image_path: string | null
          thumbnail_path: string | null
          reference_image_paths: string[] | null
          style_id: string
          style_name: string
          user_id: string
        }
        Insert: {
          created_at?: string
          floor_plan_name: string
          floor_plan_path: string
          id?: string
          prompt: string
          rendered_image_path?: string | null
          thumbnail_path?: string | null
          reference_image_paths?: string[] | null
          style_id: string
          style_name: string
          user_id: string
        }
        Update: {
          created_at?: string
          floor_plan_name?: string
          floor_plan_path?: string
          id?: string
          prompt?: string
          rendered_image_path?: string | null
          thumbnail_path?: string | null
          reference_image_paths?: string[] | null
          style_id?: string
          style_name?: string
          user_id?: string
        }
        Relationships: []
      }
      review_comments: {
        Row: {
          annotation_rect: Json | null
          comment_text: string | null
          created_at: string
          id: string
          link_id: string
          page_id: string
          project_id: string
          reviewer_name: string
          voice_path: string | null
        }
        Insert: {
          annotation_rect?: Json | null
          comment_text?: string | null
          created_at?: string
          id?: string
          link_id: string
          page_id: string
          project_id: string
          reviewer_name: string
          voice_path?: string | null
        }
        Update: {
          annotation_rect?: Json | null
          comment_text?: string | null
          created_at?: string
          id?: string
          link_id?: string
          page_id?: string
          project_id?: string
          reviewer_name?: string
          voice_path?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "review_comments_link_id_fkey"
            columns: ["link_id"]
            isOneToOne: false
            referencedRelation: "review_links"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "review_comments_page_id_fkey"
            columns: ["page_id"]
            isOneToOne: false
            referencedRelation: "review_pages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "review_comments_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "review_projects"
            referencedColumns: ["id"]
          },
        ]
      }
      review_files: {
        Row: {
          created_at: string
          drive_file_id: string | null
          file_name: string
          file_type: string
          id: string
          page_count: number
          project_id: string
          sort_order: number
          source: string
          storage_path: string
          user_id: string
        }
        Insert: {
          created_at?: string
          drive_file_id?: string | null
          file_name: string
          file_type: string
          id?: string
          page_count?: number
          project_id: string
          sort_order?: number
          source?: string
          storage_path: string
          user_id: string
        }
        Update: {
          created_at?: string
          drive_file_id?: string | null
          file_name?: string
          file_type?: string
          id?: string
          page_count?: number
          project_id?: string
          sort_order?: number
          source?: string
          storage_path?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "review_files_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "review_projects"
            referencedColumns: ["id"]
          },
        ]
      }
      review_links: {
        Row: {
          created_at: string
          id: string
          project_id: string
          reviewer_name: string
          token: string
        }
        Insert: {
          created_at?: string
          id?: string
          project_id: string
          reviewer_name: string
          token?: string
        }
        Update: {
          created_at?: string
          id?: string
          project_id?: string
          reviewer_name?: string
          token?: string
        }
        Relationships: [
          {
            foreignKeyName: "review_links_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "review_projects"
            referencedColumns: ["id"]
          },
        ]
      }
      review_pages: {
        Row: {
          created_at: string
          file_id: string
          id: string
          image_path: string
          page_number: number
          project_id: string
        }
        Insert: {
          created_at?: string
          file_id: string
          id?: string
          image_path: string
          page_number?: number
          project_id: string
        }
        Update: {
          created_at?: string
          file_id?: string
          id?: string
          image_path?: string
          page_number?: number
          project_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "review_pages_file_id_fkey"
            columns: ["file_id"]
            isOneToOne: false
            referencedRelation: "review_files"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "review_pages_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "review_projects"
            referencedColumns: ["id"]
          },
        ]
      }
      review_projects: {
        Row: {
          created_at: string
          description: string | null
          id: string
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          title?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      style_requests: {
        Row: {
          created_at: string
          id: string
          sample_urls: string[]
          status: string
          style_prompt: string | null
          title: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          sample_urls?: string[]
          status?: string
          style_prompt?: string | null
          title: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          sample_urls?: string[]
          status?: string
          style_prompt?: string | null
          title?: string
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      review_link_token_matches: {
        Args: { p_link_id: string; p_token: string }
        Returns: boolean
      }
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
