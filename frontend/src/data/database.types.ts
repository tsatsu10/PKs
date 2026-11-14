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
      audit_logs: {
        Row: {
          action: string
          created_at: string
          entity_id: string | null
          entity_type: string
          id: string
          payload: Json | null
          user_id: string
        }
        Insert: {
          action: string
          created_at?: string
          entity_id?: string | null
          entity_type: string
          id?: string
          payload?: Json | null
          user_id: string
        }
        Update: {
          action?: string
          created_at?: string
          entity_id?: string | null
          entity_type?: string
          id?: string
          payload?: Json | null
          user_id?: string
        }
        Relationships: []
      }
      client_errors: {
        Row: {
          app_version: string | null
          created_at: string
          fingerprint: string
          id: number
          kind: string
          message: string
          route: string | null
          stack: string | null
          user_agent: string | null
          user_id: string
        }
        Insert: {
          app_version?: string | null
          created_at?: string
          fingerprint: string
          id?: never
          kind: string
          message: string
          route?: string | null
          stack?: string | null
          user_agent?: string | null
          user_id?: string
        }
        Update: {
          app_version?: string | null
          created_at?: string
          fingerprint?: string
          id?: never
          kind?: string
          message?: string
          route?: string | null
          stack?: string | null
          user_agent?: string | null
          user_id?: string
        }
        Relationships: []
      }
      domains: {
        Row: {
          created_at: string
          id: string
          name: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          user_id?: string
        }
        Relationships: []
      }
      export_job_items: {
        Row: {
          export_job_id: string
          knowledge_object_id: string
          sort_order: number
        }
        Insert: {
          export_job_id: string
          knowledge_object_id: string
          sort_order?: number
        }
        Update: {
          export_job_id?: string
          knowledge_object_id?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "export_job_items_export_job_id_fkey"
            columns: ["export_job_id"]
            isOneToOne: false
            referencedRelation: "export_jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "export_job_items_knowledge_object_id_fkey"
            columns: ["knowledge_object_id"]
            isOneToOne: false
            referencedRelation: "knowledge_objects"
            referencedColumns: ["id"]
          },
        ]
      }
      export_jobs: {
        Row: {
          completed_at: string | null
          created_at: string
          error_message: string | null
          filename: string | null
          format: Database["public"]["Enums"]["export_format"]
          id: string
          include_content: boolean
          include_domains: boolean
          include_key_points: boolean
          include_links: boolean
          include_summary: boolean
          include_tags: boolean
          knowledge_object_id: string | null
          status: Database["public"]["Enums"]["export_status"]
          storage_key: string | null
          template: Database["public"]["Enums"]["export_template"]
          user_id: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          error_message?: string | null
          filename?: string | null
          format: Database["public"]["Enums"]["export_format"]
          id?: string
          include_content?: boolean
          include_domains?: boolean
          include_key_points?: boolean
          include_links?: boolean
          include_summary?: boolean
          include_tags?: boolean
          knowledge_object_id?: string | null
          status?: Database["public"]["Enums"]["export_status"]
          storage_key?: string | null
          template?: Database["public"]["Enums"]["export_template"]
          user_id: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          error_message?: string | null
          filename?: string | null
          format?: Database["public"]["Enums"]["export_format"]
          id?: string
          include_content?: boolean
          include_domains?: boolean
          include_key_points?: boolean
          include_links?: boolean
          include_summary?: boolean
          include_tags?: boolean
          knowledge_object_id?: string | null
          status?: Database["public"]["Enums"]["export_status"]
          storage_key?: string | null
          template?: Database["public"]["Enums"]["export_template"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "export_jobs_knowledge_object_id_fkey"
            columns: ["knowledge_object_id"]
            isOneToOne: false
            referencedRelation: "knowledge_objects"
            referencedColumns: ["id"]
          },
        ]
      }
      files: {
        Row: {
          created_at: string
          extracted_text: string | null
          filename: string
          id: string
          mime_type: string | null
          size_bytes: number | null
          storage_key: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          extracted_text?: string | null
          filename: string
          id?: string
          mime_type?: string | null
          size_bytes?: number | null
          storage_key?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          extracted_text?: string | null
          filename?: string
          id?: string
          mime_type?: string | null
          size_bytes?: number | null
          storage_key?: string | null
          user_id?: string
        }
        Relationships: []
      }
      import_items: {
        Row: {
          created_at: string
          id: string
          integration_id: string | null
          knowledge_object_id: string
          payload: Json | null
          source_identifier: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          integration_id?: string | null
          knowledge_object_id: string
          payload?: Json | null
          source_identifier: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          integration_id?: string | null
          knowledge_object_id?: string
          payload?: Json | null
          source_identifier?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "import_items_integration_id_fkey"
            columns: ["integration_id"]
            isOneToOne: false
            referencedRelation: "integrations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "import_items_knowledge_object_id_fkey"
            columns: ["knowledge_object_id"]
            isOneToOne: false
            referencedRelation: "knowledge_objects"
            referencedColumns: ["id"]
          },
        ]
      }
      integrations: {
        Row: {
          config: Json | null
          created_at: string
          enabled: boolean
          has_secret: boolean | null
          id: string
          name: string
          type: string
          updated_at: string
          user_id: string
          webhook_secret: string | null
        }
        Insert: {
          config?: Json | null
          created_at?: string
          enabled?: boolean
          has_secret?: boolean | null
          id?: string
          name: string
          type?: string
          updated_at?: string
          user_id: string
          webhook_secret?: string | null
        }
        Update: {
          config?: Json | null
          created_at?: string
          enabled?: boolean
          has_secret?: boolean | null
          id?: string
          name?: string
          type?: string
          updated_at?: string
          user_id?: string
          webhook_secret?: string | null
        }
        Relationships: []
      }
      journal_entries: {
        Row: {
          content: string
          created_at: string
          entry_date: string
          id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          content?: string
          created_at?: string
          entry_date: string
          id?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          content?: string
          created_at?: string
          entry_date?: string
          id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      knowledge_object_domains: {
        Row: {
          domain_id: string
          knowledge_object_id: string
        }
        Insert: {
          domain_id: string
          knowledge_object_id: string
        }
        Update: {
          domain_id?: string
          knowledge_object_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "knowledge_object_domains_domain_id_fkey"
            columns: ["domain_id"]
            isOneToOne: false
            referencedRelation: "domains"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "knowledge_object_domains_knowledge_object_id_fkey"
            columns: ["knowledge_object_id"]
            isOneToOne: false
            referencedRelation: "knowledge_objects"
            referencedColumns: ["id"]
          },
        ]
      }
      knowledge_object_files: {
        Row: {
          file_id: string
          knowledge_object_id: string
        }
        Insert: {
          file_id: string
          knowledge_object_id: string
        }
        Update: {
          file_id?: string
          knowledge_object_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "knowledge_object_files_file_id_fkey"
            columns: ["file_id"]
            isOneToOne: false
            referencedRelation: "files"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "knowledge_object_files_knowledge_object_id_fkey"
            columns: ["knowledge_object_id"]
            isOneToOne: false
            referencedRelation: "knowledge_objects"
            referencedColumns: ["id"]
          },
        ]
      }
      knowledge_object_tags: {
        Row: {
          knowledge_object_id: string
          tag_id: string
        }
        Insert: {
          knowledge_object_id: string
          tag_id: string
        }
        Update: {
          knowledge_object_id?: string
          tag_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "knowledge_object_tags_knowledge_object_id_fkey"
            columns: ["knowledge_object_id"]
            isOneToOne: false
            referencedRelation: "knowledge_objects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "knowledge_object_tags_tag_id_fkey"
            columns: ["tag_id"]
            isOneToOne: false
            referencedRelation: "tags"
            referencedColumns: ["id"]
          },
        ]
      }
      knowledge_object_versions: {
        Row: {
          change_reason: string | null
          content: string | null
          content_json: Json | null
          created_at: string
          edited_by: string | null
          id: string
          key_points: Json | null
          knowledge_object_id: string
          summary: string | null
          title: string
          version: number
        }
        Insert: {
          change_reason?: string | null
          content?: string | null
          content_json?: Json | null
          created_at?: string
          edited_by?: string | null
          id?: string
          key_points?: Json | null
          knowledge_object_id: string
          summary?: string | null
          title: string
          version: number
        }
        Update: {
          change_reason?: string | null
          content?: string | null
          content_json?: Json | null
          created_at?: string
          edited_by?: string | null
          id?: string
          key_points?: Json | null
          knowledge_object_id?: string
          summary?: string | null
          title?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "knowledge_object_versions_knowledge_object_id_fkey"
            columns: ["knowledge_object_id"]
            isOneToOne: false
            referencedRelation: "knowledge_objects"
            referencedColumns: ["id"]
          },
        ]
      }
      knowledge_objects: {
        Row: {
          content: string | null
          content_json: Json | null
          content_text: string | null
          cover_url: string | null
          created_at: string
          current_version: number
          due_at: string | null
          fts: unknown
          id: string
          is_deleted: boolean
          is_pinned: boolean
          key_points: Json | null
          last_viewed_at: string | null
          remind_at: string | null
          revision: number
          slug: string | null
          source: string | null
          status: string
          summary: string | null
          title: string
          type: Database["public"]["Enums"]["knowledge_object_type"]
          updated_at: string
          user_id: string
        }
        Insert: {
          content?: string | null
          content_json?: Json | null
          content_text?: string | null
          cover_url?: string | null
          created_at?: string
          current_version?: number
          due_at?: string | null
          fts?: unknown
          id?: string
          is_deleted?: boolean
          is_pinned?: boolean
          key_points?: Json | null
          last_viewed_at?: string | null
          remind_at?: string | null
          revision?: number
          slug?: string | null
          source?: string | null
          status?: string
          summary?: string | null
          title: string
          type?: Database["public"]["Enums"]["knowledge_object_type"]
          updated_at?: string
          user_id: string
        }
        Update: {
          content?: string | null
          content_json?: Json | null
          content_text?: string | null
          cover_url?: string | null
          created_at?: string
          current_version?: number
          due_at?: string | null
          fts?: unknown
          id?: string
          is_deleted?: boolean
          is_pinned?: boolean
          key_points?: Json | null
          last_viewed_at?: string | null
          remind_at?: string | null
          revision?: number
          slug?: string | null
          source?: string | null
          status?: string
          summary?: string | null
          title?: string
          type?: Database["public"]["Enums"]["knowledge_object_type"]
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      link_edges: {
        Row: {
          created_at: string
          from_object_id: string
          id: string
          relationship_type: string | null
          to_object_id: string
        }
        Insert: {
          created_at?: string
          from_object_id: string
          id?: string
          relationship_type?: string | null
          to_object_id: string
        }
        Update: {
          created_at?: string
          from_object_id?: string
          id?: string
          relationship_type?: string | null
          to_object_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "link_edges_from_object_id_fkey"
            columns: ["from_object_id"]
            isOneToOne: false
            referencedRelation: "knowledge_objects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "link_edges_to_object_id_fkey"
            columns: ["to_object_id"]
            isOneToOne: false
            referencedRelation: "knowledge_objects"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          body: string | null
          created_at: string
          id: string
          read_at: string | null
          related_id: string | null
          related_type: string | null
          title: string
          type: string
          user_id: string
        }
        Insert: {
          body?: string | null
          created_at?: string
          id?: string
          read_at?: string | null
          related_id?: string | null
          related_type?: string | null
          title: string
          type: string
          user_id: string
        }
        Update: {
          body?: string | null
          created_at?: string
          id?: string
          read_at?: string | null
          related_id?: string | null
          related_type?: string | null
          title?: string
          type?: string
          user_id?: string
        }
        Relationships: []
      }
      paste_bin: {
        Row: {
          content: string
          created_at: string
          id: string
          title: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          content?: string
          created_at?: string
          id?: string
          title?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          title?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      prompt_runs: {
        Row: {
          created_at: string
          id: string
          input_tokens: number | null
          knowledge_object_id: string
          model: string | null
          output: string | null
          output_tokens: number | null
          prompt_template_id: string | null
          provider: string | null
          saved_object_id: string | null
          status: string
          truncated: boolean
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          input_tokens?: number | null
          knowledge_object_id: string
          model?: string | null
          output?: string | null
          output_tokens?: number | null
          prompt_template_id?: string | null
          provider?: string | null
          saved_object_id?: string | null
          status?: string
          truncated?: boolean
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          input_tokens?: number | null
          knowledge_object_id?: string
          model?: string | null
          output?: string | null
          output_tokens?: number | null
          prompt_template_id?: string | null
          provider?: string | null
          saved_object_id?: string | null
          status?: string
          truncated?: boolean
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "prompt_runs_knowledge_object_id_fkey"
            columns: ["knowledge_object_id"]
            isOneToOne: false
            referencedRelation: "knowledge_objects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prompt_runs_prompt_template_id_fkey"
            columns: ["prompt_template_id"]
            isOneToOne: false
            referencedRelation: "prompt_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prompt_runs_saved_object_id_fkey"
            columns: ["saved_object_id"]
            isOneToOne: false
            referencedRelation: "knowledge_objects"
            referencedColumns: ["id"]
          },
        ]
      }
      prompt_templates: {
        Row: {
          applies_to_types: string[] | null
          created_at: string
          description: string | null
          id: string
          name: string
          output_format: string | null
          prompt_text: string
          tags: string[] | null
          updated_at: string
          user_id: string
          version: number
          visibility: string | null
        }
        Insert: {
          applies_to_types?: string[] | null
          created_at?: string
          description?: string | null
          id?: string
          name: string
          output_format?: string | null
          prompt_text: string
          tags?: string[] | null
          updated_at?: string
          user_id: string
          version?: number
          visibility?: string | null
        }
        Update: {
          applies_to_types?: string[] | null
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          output_format?: string | null
          prompt_text?: string
          tags?: string[] | null
          updated_at?: string
          user_id?: string
          version?: number
          visibility?: string | null
        }
        Relationships: []
      }
      rate_limit_run_prompt: {
        Row: {
          count: number
          user_id: string
          window_bucket: string
        }
        Insert: {
          count?: number
          user_id: string
          window_bucket: string
        }
        Update: {
          count?: number
          user_id?: string
          window_bucket?: string
        }
        Relationships: []
      }
      server_key_daily_usage: {
        Row: {
          count: number
          day: string
          user_id: string
        }
        Insert: {
          count?: number
          day: string
          user_id: string
        }
        Update: {
          count?: number
          day?: string
          user_id?: string
        }
        Relationships: []
      }
      share_invite_log: {
        Row: {
          created_at: string
          id: number
          invited_by: string
        }
        Insert: {
          created_at?: string
          id?: number
          invited_by: string
        }
        Update: {
          created_at?: string
          id?: number
          invited_by?: string
        }
        Relationships: []
      }
      share_invites: {
        Row: {
          accepted_at: string | null
          created_at: string
          email: string
          id: string
          invited_by: string
          knowledge_object_id: string
          role: Database["public"]["Enums"]["share_role"]
        }
        Insert: {
          accepted_at?: string | null
          created_at?: string
          email: string
          id?: string
          invited_by: string
          knowledge_object_id: string
          role?: Database["public"]["Enums"]["share_role"]
        }
        Update: {
          accepted_at?: string | null
          created_at?: string
          email?: string
          id?: string
          invited_by?: string
          knowledge_object_id?: string
          role?: Database["public"]["Enums"]["share_role"]
        }
        Relationships: [
          {
            foreignKeyName: "share_invites_knowledge_object_id_fkey"
            columns: ["knowledge_object_id"]
            isOneToOne: false
            referencedRelation: "knowledge_objects"
            referencedColumns: ["id"]
          },
        ]
      }
      share_permissions: {
        Row: {
          created_at: string
          id: string
          knowledge_object_id: string
          role: Database["public"]["Enums"]["share_role"]
          shared_with_email: string | null
          shared_with_user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          knowledge_object_id: string
          role?: Database["public"]["Enums"]["share_role"]
          shared_with_email?: string | null
          shared_with_user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          knowledge_object_id?: string
          role?: Database["public"]["Enums"]["share_role"]
          shared_with_email?: string | null
          shared_with_user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "share_permissions_knowledge_object_id_fkey"
            columns: ["knowledge_object_id"]
            isOneToOne: false
            referencedRelation: "knowledge_objects"
            referencedColumns: ["id"]
          },
        ]
      }
      tags: {
        Row: {
          created_at: string
          id: string
          name: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          user_id?: string
        }
        Relationships: []
      }
      templates: {
        Row: {
          created_at: string
          description: string | null
          id: string
          name: string
          schema: Json
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          name: string
          schema?: Json
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          schema?: Json
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      usage_counters: {
        Row: {
          bucket: string
          count: number
          scope: string
          subject: string
        }
        Insert: {
          bucket: string
          count?: number
          scope: string
          subject: string
        }
        Update: {
          bucket?: string
          count?: number
          scope?: string
          subject?: string
        }
        Relationships: []
      }
      user_ai_providers: {
        Row: {
          api_key: string
          created_at: string
          id: string
          name: string
          provider_type: string
          user_id: string
        }
        Insert: {
          api_key: string
          created_at?: string
          id?: string
          name: string
          provider_type: string
          user_id: string
        }
        Update: {
          api_key?: string
          created_at?: string
          id?: string
          name?: string
          provider_type?: string
          user_id?: string
        }
        Relationships: []
      }
      users: {
        Row: {
          created_at: string
          display_name: string | null
          email: string | null
          id: string
          timezone: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          display_name?: string | null
          email?: string | null
          id: string
          timezone?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          display_name?: string | null
          email?: string | null
          id?: string
          timezone?: string | null
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      _consume_counter: {
        Args: {
          p_limit: number
          p_scope: string
          p_subject: string
          p_window_seconds: number
        }
        Returns: Json
      }
      backfill_object_content_json: {
        Args: { p_content_json: Json; p_id: string; p_revision: number }
        Returns: boolean
      }
      blocknote_plain_text: { Args: { p_blocks: Json }; Returns: string }
      can_edit_object: { Args: { obj_id: string }; Returns: boolean }
      can_read_object: { Args: { obj_id: string }; Returns: boolean }
      consume_global_usage: {
        Args: { p_limit: number; p_scope: string; p_window_seconds: number }
        Returns: Json
      }
      consume_server_key_quota: {
        Args: { p_daily_limit: number }
        Returns: Json
      }
      consume_usage: {
        Args: {
          p_limit: number
          p_scope: string
          p_user_id: string
          p_window_seconds: number
        }
        Returns: Json
      }
      count_knowledge_objects: {
        Args: {
          date_from_f?: string
          date_to_f?: string
          domain_id_f?: string
          due_from_f?: string
          due_to_f?: string
          search_query?: string
          status_filter?: string
          tag_id_f?: string
          type_filter?: string
        }
        Returns: number
      }
      create_domain: { Args: { p_name: string }; Returns: Json }
      create_tag: { Args: { p_name: string }; Returns: Json }
      delete_object_permanently: {
        Args: { p_object_id: string }
        Returns: Json
      }
      get_dashboard_activity: { Args: never; Returns: Json }
      get_dashboard_stats: { Args: never; Returns: Json }
      get_object_links_batch: {
        Args: { p_limit_per?: number; p_object_ids: string[] }
        Returns: Json
      }
      increment_run_prompt_rate_limit: {
        Args: { p_limit_per_minute?: number }
        Returns: Json
      }
      merge_case_duplicate_taxonomy: { Args: never; Returns: undefined }
      owns_knowledge_object: { Args: { obj_id: string }; Returns: boolean }
      markdown_plain_text: { Args: { p_md: string }; Returns: string }
      report_client_error: {
        Args: {
          p_app_version: string
          p_fingerprint: string
          p_kind: string
          p_message: string
          p_route: string
          p_stack: string
          p_user_agent: string
        }
        Returns: boolean
      }
      resolve_user_id_by_email: {
        Args: { p_knowledge_object_id?: string; target_email: string }
        Returns: string
      }
      save_prompt_output_as_object: {
        Args: { p_content: string; p_run_id: string; p_title: string }
        Returns: string
      }
      search_knowledge_objects: {
        Args: {
          date_from_f?: string
          date_to_f?: string
          domain_id_f?: string
          due_from_f?: string
          due_to_f?: string
          limit_n?: number
          offset_n?: number
          search_query?: string
          status_filter?: string
          tag_id_f?: string
          type_filter?: string
        }
        Returns: {
          content: string | null
          content_json: Json | null
          content_text: string | null
          cover_url: string | null
          created_at: string
          current_version: number
          due_at: string | null
          fts: unknown
          id: string
          is_deleted: boolean
          is_pinned: boolean
          key_points: Json | null
          last_viewed_at: string | null
          remind_at: string | null
          revision: number
          slug: string | null
          source: string | null
          status: string
          summary: string | null
          title: string
          type: Database["public"]["Enums"]["knowledge_object_type"]
          updated_at: string
          user_id: string
        }[]
        SetofOptions: {
          from: "*"
          to: "knowledge_objects"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      search_knowledge_objects_with_snippets: {
        Args: {
          date_from_f?: string
          date_to_f?: string
          domain_id_f?: string
          due_from_f?: string
          due_to_f?: string
          limit_n?: number
          offset_n?: number
          search_query?: string
          status_filter?: string
          tag_id_f?: string
          type_filter?: string
        }
        Returns: Json[]
      }
      share_object_by_email: {
        Args: {
          p_email: string
          p_object_id: string
          p_role: Database["public"]["Enums"]["share_role"]
        }
        Returns: Json
      }
      snapshot_knowledge_object: {
        Args: { p_fields?: Json; p_object_id: string; p_reason?: string }
        Returns: number
      }
      suggest_linked_objects: {
        Args: { limit_n?: number; p_object_id: string }
        Returns: {
          content: string | null
          content_json: Json | null
          content_text: string | null
          cover_url: string | null
          created_at: string
          current_version: number
          due_at: string | null
          fts: unknown
          id: string
          is_deleted: boolean
          is_pinned: boolean
          key_points: Json | null
          last_viewed_at: string | null
          remind_at: string | null
          revision: number
          slug: string | null
          source: string | null
          status: string
          summary: string | null
          title: string
          type: Database["public"]["Enums"]["knowledge_object_type"]
          updated_at: string
          user_id: string
        }[]
        SetofOptions: {
          from: "*"
          to: "knowledge_objects"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      suggest_tags_for_object: {
        Args: { p_object_id: string }
        Returns: {
          tag_id: string
          tag_name: string
          usage_count: number
        }[]
      }
      suggest_tags_for_object_fallback: {
        Args: { p_object_id: string }
        Returns: {
          tag_id: string
          tag_name: string
          usage_count: number
        }[]
      }
      touch_object_view: { Args: { p_object_id: string }; Returns: undefined }
      user_day_start: { Args: never; Returns: string }
    }
    Enums: {
      export_format: "txt" | "md" | "pdf" | "docx" | "html" | "json"
      export_status: "queued" | "processing" | "completed" | "failed"
      export_template: "raw" | "brief" | "full" | "stakeholder"
      knowledge_object_type:
        | "note"
        | "document"
        | "sop"
        | "report"
        | "proposal"
        | "guideline"
        | "insight"
        | "template"
        | "concept"
        | "tool"
        | "incident"
        | "case"
        | "research_paper"
        | "decision"
        | "prompt"
        | "bookmark"
        | "meeting_notes"
        | "quote"
        | "recipe"
        | "person"
        | "howto"
      share_role: "viewer" | "editor"
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
      export_format: ["txt", "md", "pdf", "docx", "html", "json"],
      export_status: ["queued", "processing", "completed", "failed"],
      export_template: ["raw", "brief", "full", "stakeholder"],
      knowledge_object_type: [
        "note",
        "document",
        "sop",
        "report",
        "proposal",
        "guideline",
        "insight",
        "template",
        "concept",
        "tool",
        "incident",
        "case",
        "research_paper",
        "decision",
        "prompt",
        "bookmark",
        "meeting_notes",
        "quote",
        "recipe",
        "person",
        "howto",
      ],
      share_role: ["viewer", "editor"],
    },
  },
} as const
