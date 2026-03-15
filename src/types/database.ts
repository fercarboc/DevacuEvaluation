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
      abuse_settings: {
        Row: {
          ack_critical_minutes: number
          ack_warning_minutes: number
          created_at: string
          id: string
          resolve_critical_minutes: number
          resolve_warning_minutes: number
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          ack_critical_minutes?: number
          ack_warning_minutes?: number
          created_at?: string
          id?: string
          resolve_critical_minutes?: number
          resolve_warning_minutes?: number
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          ack_critical_minutes?: number
          ack_warning_minutes?: number
          created_at?: string
          id?: string
          resolve_critical_minutes?: number
          resolve_warning_minutes?: number
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      abuse_settings_audit: {
        Row: {
          abuse_settings_id: string
          actor: string
          after: Json
          before: Json
          created_at: string
          id: string
        }
        Insert: {
          abuse_settings_id: string
          actor: string
          after: Json
          before: Json
          created_at?: string
          id?: string
        }
        Update: {
          abuse_settings_id?: string
          actor?: string
          after?: Json
          before?: Json
          created_at?: string
          id?: string
        }
        Relationships: []
      }
      abuse_settings_audit_diff: {
        Row: {
          after_value: Json | null
          audit_id: string
          before_value: Json | null
          field_name: string
          id: string
        }
        Insert: {
          after_value?: Json | null
          audit_id: string
          before_value?: Json | null
          field_name: string
          id?: string
        }
        Update: {
          after_value?: Json | null
          audit_id?: string
          before_value?: Json | null
          field_name?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "abuse_settings_audit_diff_audit_id_fkey"
            columns: ["audit_id"]
            isOneToOne: false
            referencedRelation: "abuse_settings_audit"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "abuse_settings_audit_diff_audit_id_fkey"
            columns: ["audit_id"]
            isOneToOne: false
            referencedRelation: "abuse_settings_audit_human"
            referencedColumns: ["audit_id"]
          },
        ]
      }
      acdm_progress: {
        Row: {
          completed_at: string | null
          id: number
          lesson_id: string
          user_id: number | null
        }
        Insert: {
          completed_at?: string | null
          id?: number
          lesson_id: string
          user_id?: number | null
        }
        Update: {
          completed_at?: string | null
          id?: number
          lesson_id?: string
          user_id?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "acdm_progress_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "acdm_users"
            referencedColumns: ["id"]
          },
        ]
      }
      acdm_projects: {
        Row: {
          filename: string | null
          id: number
          uploaded_at: string | null
          user_id: number | null
        }
        Insert: {
          filename?: string | null
          id?: number
          uploaded_at?: string | null
          user_id?: number | null
        }
        Update: {
          filename?: string | null
          id?: number
          uploaded_at?: string | null
          user_id?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "acdm_projects_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "acdm_users"
            referencedColumns: ["id"]
          },
        ]
      }
      acdm_tutor_sessions: {
        Row: {
          created_at: string | null
          id: number
          notes: string | null
          requested_date: string | null
          topic: string | null
          user_id: number | null
        }
        Insert: {
          created_at?: string | null
          id?: number
          notes?: string | null
          requested_date?: string | null
          topic?: string | null
          user_id?: number | null
        }
        Update: {
          created_at?: string | null
          id?: number
          notes?: string | null
          requested_date?: string | null
          topic?: string | null
          user_id?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "acdm_tutor_sessions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "acdm_users"
            referencedColumns: ["id"]
          },
        ]
      }
      acdm_users: {
        Row: {
          id: number
          name: string | null
          pin: string
          role: string | null
        }
        Insert: {
          id?: number
          name?: string | null
          pin: string
          role?: string | null
        }
        Update: {
          id?: number
          name?: string | null
          pin?: string
          role?: string | null
        }
        Relationships: []
      }
      admin_users: {
        Row: {
          created_at: string
          is_active: boolean
          note: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          is_active?: boolean
          note?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          is_active?: boolean
          note?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      app_settings: {
        Row: {
          debacu_global_pepper: string
          id: boolean
          updated_at: string
        }
        Insert: {
          debacu_global_pepper: string
          id?: boolean
          updated_at?: string
        }
        Update: {
          debacu_global_pepper?: string
          id?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      apps: {
        Row: {
          description: string | null
          id: string
          name: string
          sectorId: string | null
        }
        Insert: {
          description?: string | null
          id: string
          name: string
          sectorId?: string | null
        }
        Update: {
          description?: string | null
          id?: string
          name?: string
          sectorId?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "apps_sectorId_fkey"
            columns: ["sectorId"]
            isOneToOne: false
            referencedRelation: "sectors"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_export_downloads: {
        Row: {
          downloaded_at: string
          downloaded_by_email: string | null
          downloaded_by_user_id: string | null
          export_id: string
          id: string
          ip: string | null
          user_agent: string | null
        }
        Insert: {
          downloaded_at?: string
          downloaded_by_email?: string | null
          downloaded_by_user_id?: string | null
          export_id: string
          id?: string
          ip?: string | null
          user_agent?: string | null
        }
        Update: {
          downloaded_at?: string
          downloaded_by_email?: string | null
          downloaded_by_user_id?: string | null
          export_id?: string
          id?: string
          ip?: string | null
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_export_downloads_export_id_fkey"
            columns: ["export_id"]
            isOneToOne: false
            referencedRelation: "audit_exports"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_exports: {
        Row: {
          app_id: string | null
          created_at: string
          customer_id: string | null
          date_from: string | null
          date_to: string | null
          file_name: string
          file_sha256: string | null
          filters_json: Json
          format: Database["public"]["Enums"]["audit_export_format"]
          generated_by: string
          generated_by_email: string | null
          id: string
          legal_basis: string | null
          mime_type: string | null
          notes: string | null
          provided_to_contact: string | null
          provided_to_name: string
          provided_to_ref: string | null
          provided_to_type: Database["public"]["Enums"]["audit_provided_to_type"]
          purpose: string
          row_count: number
          source: string | null
          status: string
          storage_bucket: string
          storage_path: string
          type: string | null
        }
        Insert: {
          app_id?: string | null
          created_at?: string
          customer_id?: string | null
          date_from?: string | null
          date_to?: string | null
          file_name: string
          file_sha256?: string | null
          filters_json: Json
          format: Database["public"]["Enums"]["audit_export_format"]
          generated_by: string
          generated_by_email?: string | null
          id?: string
          legal_basis?: string | null
          mime_type?: string | null
          notes?: string | null
          provided_to_contact?: string | null
          provided_to_name: string
          provided_to_ref?: string | null
          provided_to_type: Database["public"]["Enums"]["audit_provided_to_type"]
          purpose: string
          row_count?: number
          source?: string | null
          status?: string
          storage_bucket?: string
          storage_path: string
          type?: string | null
        }
        Update: {
          app_id?: string | null
          created_at?: string
          customer_id?: string | null
          date_from?: string | null
          date_to?: string | null
          file_name?: string
          file_sha256?: string | null
          filters_json?: Json
          format?: Database["public"]["Enums"]["audit_export_format"]
          generated_by?: string
          generated_by_email?: string | null
          id?: string
          legal_basis?: string | null
          mime_type?: string | null
          notes?: string | null
          provided_to_contact?: string | null
          provided_to_name?: string
          provided_to_ref?: string | null
          provided_to_type?: Database["public"]["Enums"]["audit_provided_to_type"]
          purpose?: string
          row_count?: number
          source?: string | null
          status?: string
          storage_bucket?: string
          storage_path?: string
          type?: string | null
        }
        Relationships: []
      }
      company_banks: {
        Row: {
          accountAlias: string | null
          bankName: string
          iban: string
          id: string
          isPrimary: boolean
          swift: string | null
        }
        Insert: {
          accountAlias?: string | null
          bankName: string
          iban: string
          id: string
          isPrimary?: boolean
          swift?: string | null
        }
        Update: {
          accountAlias?: string | null
          bankName?: string
          iban?: string
          id?: string
          isPrimary?: boolean
          swift?: string | null
        }
        Relationships: []
      }
      company_profile: {
        Row: {
          address: string | null
          cif: string
          city: string | null
          contactPerson: string | null
          country: string | null
          created_at: string | null
          email: string | null
          id: string
          name: string
          phone: string | null
          postalCode: string | null
          province: string | null
          sepaCreditorId: string | null
          updated_at: string | null
        }
        Insert: {
          address?: string | null
          cif: string
          city?: string | null
          contactPerson?: string | null
          country?: string | null
          created_at?: string | null
          email?: string | null
          id?: string
          name: string
          phone?: string | null
          postalCode?: string | null
          province?: string | null
          sepaCreditorId?: string | null
          updated_at?: string | null
        }
        Update: {
          address?: string | null
          cif?: string
          city?: string | null
          contactPerson?: string | null
          country?: string | null
          created_at?: string | null
          email?: string | null
          id?: string
          name?: string
          phone?: string | null
          postalCode?: string | null
          province?: string | null
          sepaCreditorId?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      customer_audit_export_downloads: {
        Row: {
          downloaded_at: string
          downloaded_by_email: string | null
          downloaded_by_user_id: string
          export_id: string
          id: string
          ip_address: string | null
          org_id: string
          user_agent: string | null
        }
        Insert: {
          downloaded_at?: string
          downloaded_by_email?: string | null
          downloaded_by_user_id: string
          export_id: string
          id?: string
          ip_address?: string | null
          org_id: string
          user_agent?: string | null
        }
        Update: {
          downloaded_at?: string
          downloaded_by_email?: string | null
          downloaded_by_user_id?: string
          export_id?: string
          id?: string
          ip_address?: string | null
          org_id?: string
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "customer_audit_export_downloads_export_id_fkey"
            columns: ["export_id"]
            isOneToOne: false
            referencedRelation: "customer_audit_exports"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_audit_export_downloads_export_id_fkey"
            columns: ["export_id"]
            isOneToOne: false
            referencedRelation: "v_customer_audit_exports_with_last_download"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_audit_exports: {
        Row: {
          app_id: string
          created_at: string
          error_code: string | null
          error_message: string | null
          export_scope: string
          export_type: string
          file_size_bytes: number | null
          filters: Json
          id: string
          org_id: string
          period_from: string
          period_to: string
          requested_by_email: string | null
          requested_by_role: string | null
          requested_by_user_id: string
          row_count: number | null
          sha256: string | null
          status: string
          storage_bucket: string
          storage_path: string
        }
        Insert: {
          app_id?: string
          created_at?: string
          error_code?: string | null
          error_message?: string | null
          export_scope: string
          export_type: string
          file_size_bytes?: number | null
          filters?: Json
          id?: string
          org_id: string
          period_from: string
          period_to: string
          requested_by_email?: string | null
          requested_by_role?: string | null
          requested_by_user_id: string
          row_count?: number | null
          sha256?: string | null
          status?: string
          storage_bucket?: string
          storage_path: string
        }
        Update: {
          app_id?: string
          created_at?: string
          error_code?: string | null
          error_message?: string | null
          export_scope?: string
          export_type?: string
          file_size_bytes?: number | null
          filters?: Json
          id?: string
          org_id?: string
          period_from?: string
          period_to?: string
          requested_by_email?: string | null
          requested_by_role?: string | null
          requested_by_user_id?: string
          row_count?: number | null
          sha256?: string | null
          status?: string
          storage_bucket?: string
          storage_path?: string
        }
        Relationships: []
      }
      customers: {
        Row: {
          address: string | null
          api_token: string | null
          app_id: string | null
          auth_user_id: string | null
          bank_address: string | null
          bank_name: string | null
          billing_email: string | null
          billing_frequency: string | null
          billing_phone: string | null
          city: string | null
          commercial_name: string | null
          contact_person: string | null
          contact_role: string | null
          country: string | null
          created_at: string
          email: string | null
          iban: string | null
          id: string
          is_active: boolean
          legacy_code: string | null
          legal_name: string | null
          name: string | null
          nif: string | null
          phone: string | null
          plan_id: string | null
          postal_code: string | null
          province: string | null
          sector_id: string | null
          service_password: string | null
          service_username: string | null
          start_date: string | null
          stripe_customer_id: string | null
          stripe_default_payment_method_id: string | null
          swift: string | null
          trial_used: boolean | null
          updated_at: string
        }
        Insert: {
          address?: string | null
          api_token?: string | null
          app_id?: string | null
          auth_user_id?: string | null
          bank_address?: string | null
          bank_name?: string | null
          billing_email?: string | null
          billing_frequency?: string | null
          billing_phone?: string | null
          city?: string | null
          commercial_name?: string | null
          contact_person?: string | null
          contact_role?: string | null
          country?: string | null
          created_at?: string
          email?: string | null
          iban?: string | null
          id?: string
          is_active?: boolean
          legacy_code?: string | null
          legal_name?: string | null
          name?: string | null
          nif?: string | null
          phone?: string | null
          plan_id?: string | null
          postal_code?: string | null
          province?: string | null
          sector_id?: string | null
          service_password?: string | null
          service_username?: string | null
          start_date?: string | null
          stripe_customer_id?: string | null
          stripe_default_payment_method_id?: string | null
          swift?: string | null
          trial_used?: boolean | null
          updated_at?: string
        }
        Update: {
          address?: string | null
          api_token?: string | null
          app_id?: string | null
          auth_user_id?: string | null
          bank_address?: string | null
          bank_name?: string | null
          billing_email?: string | null
          billing_frequency?: string | null
          billing_phone?: string | null
          city?: string | null
          commercial_name?: string | null
          contact_person?: string | null
          contact_role?: string | null
          country?: string | null
          created_at?: string
          email?: string | null
          iban?: string | null
          id?: string
          is_active?: boolean
          legacy_code?: string | null
          legal_name?: string | null
          name?: string | null
          nif?: string | null
          phone?: string | null
          plan_id?: string | null
          postal_code?: string | null
          province?: string | null
          sector_id?: string | null
          service_password?: string | null
          service_username?: string | null
          start_date?: string | null
          stripe_customer_id?: string | null
          stripe_default_payment_method_id?: string | null
          swift?: string | null
          trial_used?: boolean | null
          updated_at?: string
        }
        Relationships: []
      }
      debacu_adr_reference_by_category: {
        Row: {
          adr_reference: number
          hotel_category: number
          updated_at: string
        }
        Insert: {
          adr_reference: number
          hotel_category: number
          updated_at?: string
        }
        Update: {
          adr_reference?: number
          hotel_category?: number
          updated_at?: string
        }
        Relationships: []
      }
      debacu_eval_access_requests: {
        Row: {
          acceptance_legal_basis: string | null
          acceptance_locale: string | null
          accepted_professional_use: boolean
          accepted_terms: boolean
          accepted_terms_accepted_at: string | null
          accepted_terms_at: string | null
          accepted_terms_doc_hash: string | null
          accepted_terms_doc_hash_algo: string | null
          accepted_terms_ip: string | null
          accepted_terms_pdf_bucket: string | null
          accepted_terms_pdf_path: string | null
          accepted_terms_pdf_sha256: string | null
          accepted_terms_user_agent: string | null
          address: string | null
          cif: string
          city: string | null
          company_name: string
          contact_name: string
          contact_role: string | null
          country: string | null
          created_at: string
          customer_id: string | null
          decision_notes: string | null
          dpa_accepted: boolean
          dpa_accepted_at: string | null
          dpa_ip: string | null
          dpa_pdf_bucket: string | null
          dpa_pdf_path: string | null
          dpa_pdf_sha256: string | null
          dpa_user_agent: string | null
          dpa_version: string | null
          email: string
          id: string
          invite_redirect_to: string | null
          last_email_at: string | null
          last_email_detail: string | null
          last_email_status: string | null
          legal_name: string | null
          notes: string | null
          org_id: string | null
          phone: string | null
          property_type: string
          reviewed_at: string | null
          reviewed_by: string | null
          rgpd_annex_ii_accepted_at: string | null
          rgpd_annex_ii_version: string | null
          rooms_count: number | null
          status: string
          terms_version: string | null
          updated_at: string | null
          website: string | null
        }
        Insert: {
          acceptance_legal_basis?: string | null
          acceptance_locale?: string | null
          accepted_professional_use?: boolean
          accepted_terms?: boolean
          accepted_terms_accepted_at?: string | null
          accepted_terms_at?: string | null
          accepted_terms_doc_hash?: string | null
          accepted_terms_doc_hash_algo?: string | null
          accepted_terms_ip?: string | null
          accepted_terms_pdf_bucket?: string | null
          accepted_terms_pdf_path?: string | null
          accepted_terms_pdf_sha256?: string | null
          accepted_terms_user_agent?: string | null
          address?: string | null
          cif: string
          city?: string | null
          company_name: string
          contact_name: string
          contact_role?: string | null
          country?: string | null
          created_at?: string
          customer_id?: string | null
          decision_notes?: string | null
          dpa_accepted?: boolean
          dpa_accepted_at?: string | null
          dpa_ip?: string | null
          dpa_pdf_bucket?: string | null
          dpa_pdf_path?: string | null
          dpa_pdf_sha256?: string | null
          dpa_user_agent?: string | null
          dpa_version?: string | null
          email: string
          id?: string
          invite_redirect_to?: string | null
          last_email_at?: string | null
          last_email_detail?: string | null
          last_email_status?: string | null
          legal_name?: string | null
          notes?: string | null
          org_id?: string | null
          phone?: string | null
          property_type: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          rgpd_annex_ii_accepted_at?: string | null
          rgpd_annex_ii_version?: string | null
          rooms_count?: number | null
          status?: string
          terms_version?: string | null
          updated_at?: string | null
          website?: string | null
        }
        Update: {
          acceptance_legal_basis?: string | null
          acceptance_locale?: string | null
          accepted_professional_use?: boolean
          accepted_terms?: boolean
          accepted_terms_accepted_at?: string | null
          accepted_terms_at?: string | null
          accepted_terms_doc_hash?: string | null
          accepted_terms_doc_hash_algo?: string | null
          accepted_terms_ip?: string | null
          accepted_terms_pdf_bucket?: string | null
          accepted_terms_pdf_path?: string | null
          accepted_terms_pdf_sha256?: string | null
          accepted_terms_user_agent?: string | null
          address?: string | null
          cif?: string
          city?: string | null
          company_name?: string
          contact_name?: string
          contact_role?: string | null
          country?: string | null
          created_at?: string
          customer_id?: string | null
          decision_notes?: string | null
          dpa_accepted?: boolean
          dpa_accepted_at?: string | null
          dpa_ip?: string | null
          dpa_pdf_bucket?: string | null
          dpa_pdf_path?: string | null
          dpa_pdf_sha256?: string | null
          dpa_user_agent?: string | null
          dpa_version?: string | null
          email?: string
          id?: string
          invite_redirect_to?: string | null
          last_email_at?: string | null
          last_email_detail?: string | null
          last_email_status?: string | null
          legal_name?: string | null
          notes?: string | null
          org_id?: string | null
          phone?: string | null
          property_type?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          rgpd_annex_ii_accepted_at?: string | null
          rgpd_annex_ii_version?: string | null
          rooms_count?: number | null
          status?: string
          terms_version?: string | null
          updated_at?: string | null
          website?: string | null
        }
        Relationships: []
      }
      debacu_eval_admin_users: {
        Row: {
          active: boolean
          created_at: string
          user_id: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          user_id: string
        }
        Update: {
          active?: boolean
          created_at?: string
          user_id?: string
        }
        Relationships: []
      }
      debacu_eval_admins: {
        Row: {
          created_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          user_id?: string
        }
        Relationships: []
      }
      debacu_eval_alerts: {
        Row: {
          alert_type: string
          created_at: string
          description: string | null
          id: string
          metric_value: number | null
          org_id: string
          property_id: string
          severity: string
          source: string
          status: string
          stay_date: string
          threshold_value: number | null
          title: string
        }
        Insert: {
          alert_type: string
          created_at?: string
          description?: string | null
          id?: string
          metric_value?: number | null
          org_id: string
          property_id: string
          severity: string
          source?: string
          status?: string
          stay_date: string
          threshold_value?: number | null
          title: string
        }
        Update: {
          alert_type?: string
          created_at?: string
          description?: string | null
          id?: string
          metric_value?: number | null
          org_id?: string
          property_id?: string
          severity?: string
          source?: string
          status?: string
          stay_date?: string
          threshold_value?: number | null
          title?: string
        }
        Relationships: []
      }
      debacu_eval_audit_export_downloads: {
        Row: {
          created_at: string
          downloaded_by: string
          downloaded_by_email: string | null
          export_id: string
          id: string
          ip: unknown
          org_id: string
          user_agent: string | null
        }
        Insert: {
          created_at?: string
          downloaded_by: string
          downloaded_by_email?: string | null
          export_id: string
          id?: string
          ip?: unknown
          org_id: string
          user_agent?: string | null
        }
        Update: {
          created_at?: string
          downloaded_by?: string
          downloaded_by_email?: string | null
          export_id?: string
          id?: string
          ip?: unknown
          org_id?: string
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "debacu_eval_audit_export_downloads_export_fk"
            columns: ["export_id"]
            isOneToOne: false
            referencedRelation: "debacu_eval_audit_exports"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "debacu_eval_audit_export_downloads_export_fk"
            columns: ["export_id"]
            isOneToOne: false
            referencedRelation: "debacu_eval_audit_exports_with_downloads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "debacu_eval_audit_export_downloads_export_fk"
            columns: ["export_id"]
            isOneToOne: false
            referencedRelation: "debacu_eval_audit_exports_with_last_download"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "debacu_eval_audit_export_downloads_export_id_fkey"
            columns: ["export_id"]
            isOneToOne: false
            referencedRelation: "debacu_eval_audit_exports"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "debacu_eval_audit_export_downloads_export_id_fkey"
            columns: ["export_id"]
            isOneToOne: false
            referencedRelation: "debacu_eval_audit_exports_with_downloads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "debacu_eval_audit_export_downloads_export_id_fkey"
            columns: ["export_id"]
            isOneToOne: false
            referencedRelation: "debacu_eval_audit_exports_with_last_download"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "debacu_eval_audit_export_downloads_org_fk"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "debacu_eval_org_entitlements_v"
            referencedColumns: ["org_id"]
          },
          {
            foreignKeyName: "debacu_eval_audit_export_downloads_org_fk"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "debacu_eval_organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      debacu_eval_audit_exports: {
        Row: {
          created_at: string
          delivered_to_name: string
          delivered_to_org: string | null
          delivered_to_reason: string | null
          delivered_to_reference: string | null
          file_bytes: number | null
          file_sha256: string | null
          filter_customer: string | null
          filter_from: string | null
          filter_source: string | null
          filter_to: string | null
          filter_type: string | null
          format: string
          generated_by_email: string
          generated_by_user_id: string
          id: string
          meta: Json
          org_id: string
          row_count: number
          status: string
          storage_bucket: string
          storage_path: string
        }
        Insert: {
          created_at?: string
          delivered_to_name: string
          delivered_to_org?: string | null
          delivered_to_reason?: string | null
          delivered_to_reference?: string | null
          file_bytes?: number | null
          file_sha256?: string | null
          filter_customer?: string | null
          filter_from?: string | null
          filter_source?: string | null
          filter_to?: string | null
          filter_type?: string | null
          format: string
          generated_by_email: string
          generated_by_user_id: string
          id?: string
          meta?: Json
          org_id: string
          row_count?: number
          status?: string
          storage_bucket?: string
          storage_path: string
        }
        Update: {
          created_at?: string
          delivered_to_name?: string
          delivered_to_org?: string | null
          delivered_to_reason?: string | null
          delivered_to_reference?: string | null
          file_bytes?: number | null
          file_sha256?: string | null
          filter_customer?: string | null
          filter_from?: string | null
          filter_source?: string | null
          filter_to?: string | null
          filter_type?: string | null
          format?: string
          generated_by_email?: string
          generated_by_user_id?: string
          id?: string
          meta?: Json
          org_id?: string
          row_count?: number
          status?: string
          storage_bucket?: string
          storage_path?: string
        }
        Relationships: [
          {
            foreignKeyName: "debacu_eval_audit_exports_org_fk"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "debacu_eval_org_entitlements_v"
            referencedColumns: ["org_id"]
          },
          {
            foreignKeyName: "debacu_eval_audit_exports_org_fk"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "debacu_eval_organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      debacu_eval_audit_log: {
        Row: {
          action: string
          actor_user_id: string | null
          app_id: string | null
          created_at: string
          customer_id: string | null
          entity: string
          entity_id: string | null
          evaluation_id: string | null
          event_type: string | null
          id: string
          meta: Json
          result_count: number | null
          search_kind: string | null
          search_value_hash: string | null
          search_value_masked: string | null
        }
        Insert: {
          action: string
          actor_user_id?: string | null
          app_id?: string | null
          created_at?: string
          customer_id?: string | null
          entity: string
          entity_id?: string | null
          evaluation_id?: string | null
          event_type?: string | null
          id?: string
          meta?: Json
          result_count?: number | null
          search_kind?: string | null
          search_value_hash?: string | null
          search_value_masked?: string | null
        }
        Update: {
          action?: string
          actor_user_id?: string | null
          app_id?: string | null
          created_at?: string
          customer_id?: string | null
          entity?: string
          entity_id?: string | null
          evaluation_id?: string | null
          event_type?: string | null
          id?: string
          meta?: Json
          result_count?: number | null
          search_kind?: string | null
          search_value_hash?: string | null
          search_value_masked?: string | null
        }
        Relationships: []
      }
      debacu_eval_customer_org_map: {
        Row: {
          created_at: string
          customer_id: string
          org_id: string
        }
        Insert: {
          created_at?: string
          customer_id: string
          org_id: string
        }
        Update: {
          created_at?: string
          customer_id?: string
          org_id?: string
        }
        Relationships: []
      }
      debacu_eval_customer_profile: {
        Row: {
          contact_name: string | null
          contact_role: string | null
          customer_id: string
          legal_name: string | null
          notes: string | null
          property_type: string | null
          rooms_count: number | null
          updated_at: string | null
          website: string | null
        }
        Insert: {
          contact_name?: string | null
          contact_role?: string | null
          customer_id: string
          legal_name?: string | null
          notes?: string | null
          property_type?: string | null
          rooms_count?: number | null
          updated_at?: string | null
          website?: string | null
        }
        Update: {
          contact_name?: string | null
          contact_role?: string | null
          customer_id?: string
          legal_name?: string | null
          notes?: string | null
          property_type?: string | null
          rooms_count?: number | null
          updated_at?: string | null
          website?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "debacu_eval_customer_profile_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: true
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "debacu_eval_customer_profile_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: true
            referencedRelation: "v_customer_profile_status"
            referencedColumns: ["customer_id"]
          },
        ]
      }
      debacu_eval_email_log: {
        Row: {
          created_at: string
          error: string | null
          id: string
          meta: Json
          provider: string
          provider_message_id: string | null
          request_id: string
          status: string
          subject: string
          template: string
          to_email: string
        }
        Insert: {
          created_at?: string
          error?: string | null
          id?: string
          meta?: Json
          provider?: string
          provider_message_id?: string | null
          request_id: string
          status: string
          subject: string
          template: string
          to_email: string
        }
        Update: {
          created_at?: string
          error?: string | null
          id?: string
          meta?: Json
          provider?: string
          provider_message_id?: string | null
          request_id?: string
          status?: string
          subject?: string
          template?: string
          to_email?: string
        }
        Relationships: [
          {
            foreignKeyName: "debacu_eval_email_log_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "debacu_eval_access_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      debacu_eval_guest_index: {
        Row: {
          doc_key: string | null
          email_key: string | null
          first_seen_date: string | null
          identity_key: string
          incidents_count: number
          last_incident_date: string | null
          last_seen_date: string | null
          phone_key: string | null
          risk_band: string
          stays_count: number
          total_net_loss: number
          updated_at: string
        }
        Insert: {
          doc_key?: string | null
          email_key?: string | null
          first_seen_date?: string | null
          identity_key: string
          incidents_count?: number
          last_incident_date?: string | null
          last_seen_date?: string | null
          phone_key?: string | null
          risk_band?: string
          stays_count?: number
          total_net_loss?: number
          updated_at?: string
        }
        Update: {
          doc_key?: string | null
          email_key?: string | null
          first_seen_date?: string | null
          identity_key?: string
          incidents_count?: number
          last_incident_date?: string | null
          last_seen_date?: string | null
          phone_key?: string | null
          risk_band?: string
          stays_count?: number
          total_net_loss?: number
          updated_at?: string
        }
        Relationships: []
      }
      debacu_eval_guest_index_bak_20260314: {
        Row: {
          doc_key: string | null
          email_key: string | null
          first_seen_date: string | null
          identity_key: string | null
          incidents_count: number | null
          last_incident_date: string | null
          last_seen_date: string | null
          phone_key: string | null
          risk_band: string | null
          stays_count: number | null
          total_net_loss: number | null
          updated_at: string | null
        }
        Insert: {
          doc_key?: string | null
          email_key?: string | null
          first_seen_date?: string | null
          identity_key?: string | null
          incidents_count?: number | null
          last_incident_date?: string | null
          last_seen_date?: string | null
          phone_key?: string | null
          risk_band?: string | null
          stays_count?: number | null
          total_net_loss?: number | null
          updated_at?: string | null
        }
        Update: {
          doc_key?: string | null
          email_key?: string | null
          first_seen_date?: string | null
          identity_key?: string | null
          incidents_count?: number | null
          last_incident_date?: string | null
          last_seen_date?: string | null
          phone_key?: string | null
          risk_band?: string | null
          stays_count?: number | null
          total_net_loss?: number | null
          updated_at?: string | null
        }
        Relationships: []
      }
      debacu_eval_guest_stays: {
        Row: {
          checkin_date: string
          checkout_date: string | null
          created_at: string
          full_name: string | null
          id: string
          identity_key: string
          import_batch_id: string | null
          org_id: string
          property_id: string | null
          stay_status: string
          updated_at: string
        }
        Insert: {
          checkin_date: string
          checkout_date?: string | null
          created_at?: string
          full_name?: string | null
          id?: string
          identity_key: string
          import_batch_id?: string | null
          org_id: string
          property_id?: string | null
          stay_status?: string
          updated_at?: string
        }
        Update: {
          checkin_date?: string
          checkout_date?: string | null
          created_at?: string
          full_name?: string | null
          id?: string
          identity_key?: string
          import_batch_id?: string | null
          org_id?: string
          property_id?: string | null
          stay_status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "debacu_eval_guest_stays_import_batch_id_fkey"
            columns: ["import_batch_id"]
            isOneToOne: false
            referencedRelation: "debacu_eval_import_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "debacu_eval_guest_stays_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "debacu_eval_properties"
            referencedColumns: ["id"]
          },
        ]
      }
      debacu_eval_hotel_profile: {
        Row: {
          address: string | null
          adr_real: number | null
          allows_pets: boolean | null
          app_id: string
          cancellation_rate_target: number | null
          checkin_time: string | null
          checkout_time: string | null
          city: string | null
          contact_email: string | null
          contact_person: string | null
          contact_phone: string | null
          contact_role: string | null
          country: string | null
          created_at: string
          currency: string
          customer_id: string
          has_parking: boolean | null
          has_restaurant: boolean | null
          has_spa: boolean | null
          hotel_category: number | null
          hotel_name: string | null
          max_occupancy: number | null
          monthly_revenue_estimate: number | null
          monthly_stays_estimated: number | null
          occupancy_target: number | null
          org_id: string | null
          owner_auth_user_id: string | null
          postal_code: string | null
          profile_completed: boolean | null
          profile_completed_at: string | null
          property_type: string | null
          province: string | null
          revpar_target: number | null
          rooms_count: number | null
          season_mult_high: number | null
          season_mult_low: number | null
          timezone: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          address?: string | null
          adr_real?: number | null
          allows_pets?: boolean | null
          app_id?: string
          cancellation_rate_target?: number | null
          checkin_time?: string | null
          checkout_time?: string | null
          city?: string | null
          contact_email?: string | null
          contact_person?: string | null
          contact_phone?: string | null
          contact_role?: string | null
          country?: string | null
          created_at?: string
          currency?: string
          customer_id: string
          has_parking?: boolean | null
          has_restaurant?: boolean | null
          has_spa?: boolean | null
          hotel_category?: number | null
          hotel_name?: string | null
          max_occupancy?: number | null
          monthly_revenue_estimate?: number | null
          monthly_stays_estimated?: number | null
          occupancy_target?: number | null
          org_id?: string | null
          owner_auth_user_id?: string | null
          postal_code?: string | null
          profile_completed?: boolean | null
          profile_completed_at?: string | null
          property_type?: string | null
          province?: string | null
          revpar_target?: number | null
          rooms_count?: number | null
          season_mult_high?: number | null
          season_mult_low?: number | null
          timezone?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          address?: string | null
          adr_real?: number | null
          allows_pets?: boolean | null
          app_id?: string
          cancellation_rate_target?: number | null
          checkin_time?: string | null
          checkout_time?: string | null
          city?: string | null
          contact_email?: string | null
          contact_person?: string | null
          contact_phone?: string | null
          contact_role?: string | null
          country?: string | null
          created_at?: string
          currency?: string
          customer_id?: string
          has_parking?: boolean | null
          has_restaurant?: boolean | null
          has_spa?: boolean | null
          hotel_category?: number | null
          hotel_name?: string | null
          max_occupancy?: number | null
          monthly_revenue_estimate?: number | null
          monthly_stays_estimated?: number | null
          occupancy_target?: number | null
          org_id?: string | null
          owner_auth_user_id?: string | null
          postal_code?: string | null
          profile_completed?: boolean | null
          profile_completed_at?: string | null
          property_type?: string | null
          province?: string | null
          revpar_target?: number | null
          rooms_count?: number | null
          season_mult_high?: number | null
          season_mult_low?: number | null
          timezone?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "debacu_eval_hotel_profile_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: true
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "debacu_eval_hotel_profile_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: true
            referencedRelation: "v_customer_profile_status"
            referencedColumns: ["customer_id"]
          },
        ]
      }
      debacu_eval_identity_risk_events: {
        Row: {
          actor_user_id: string | null
          created_at: string
          event_type: Database["public"]["Enums"]["debacu_eval_risk_event_type"]
          id: string
          identity_key: string
          new_risk_level:
            | Database["public"]["Enums"]["debacu_eval_risk_level"]
            | null
          org_id: string | null
          payload: Json
          previous_risk_level:
            | Database["public"]["Enums"]["debacu_eval_risk_level"]
            | null
          property_id: string | null
          risk_delta: number | null
          source_id: string | null
          source_table: string | null
        }
        Insert: {
          actor_user_id?: string | null
          created_at?: string
          event_type: Database["public"]["Enums"]["debacu_eval_risk_event_type"]
          id?: string
          identity_key: string
          new_risk_level?:
            | Database["public"]["Enums"]["debacu_eval_risk_level"]
            | null
          org_id?: string | null
          payload?: Json
          previous_risk_level?:
            | Database["public"]["Enums"]["debacu_eval_risk_level"]
            | null
          property_id?: string | null
          risk_delta?: number | null
          source_id?: string | null
          source_table?: string | null
        }
        Update: {
          actor_user_id?: string | null
          created_at?: string
          event_type?: Database["public"]["Enums"]["debacu_eval_risk_event_type"]
          id?: string
          identity_key?: string
          new_risk_level?:
            | Database["public"]["Enums"]["debacu_eval_risk_level"]
            | null
          org_id?: string | null
          payload?: Json
          previous_risk_level?:
            | Database["public"]["Enums"]["debacu_eval_risk_level"]
            | null
          property_id?: string | null
          risk_delta?: number | null
          source_id?: string | null
          source_table?: string | null
        }
        Relationships: []
      }
      debacu_eval_identity_risk_state: {
        Row: {
          distinct_orgs_count: number
          distinct_properties_count: number
          first_seen_at: string
          identity_key: string
          incidents_critical: number
          incidents_high: number
          incidents_total: number
          last_incident_at: string | null
          last_seen_at: string
          last_source: string | null
          last_source_ref_id: string | null
          risk_level: Database["public"]["Enums"]["debacu_eval_risk_level"]
          risk_score: number
          snapshot: Json
          updated_at: string
        }
        Insert: {
          distinct_orgs_count?: number
          distinct_properties_count?: number
          first_seen_at?: string
          identity_key: string
          incidents_critical?: number
          incidents_high?: number
          incidents_total?: number
          last_incident_at?: string | null
          last_seen_at?: string
          last_source?: string | null
          last_source_ref_id?: string | null
          risk_level?: Database["public"]["Enums"]["debacu_eval_risk_level"]
          risk_score?: number
          snapshot?: Json
          updated_at?: string
        }
        Update: {
          distinct_orgs_count?: number
          distinct_properties_count?: number
          first_seen_at?: string
          identity_key?: string
          incidents_critical?: number
          incidents_high?: number
          incidents_total?: number
          last_incident_at?: string | null
          last_seen_at?: string
          last_source?: string | null
          last_source_ref_id?: string | null
          risk_level?: Database["public"]["Enums"]["debacu_eval_risk_level"]
          risk_score?: number
          snapshot?: Json
          updated_at?: string
        }
        Relationships: []
      }
      debacu_eval_import_batches: {
        Row: {
          created_at: string
          error_rows: number
          file_name: string | null
          id: string
          import_type: string
          org_id: string
          processed_rows: number
          property_id: string | null
          total_rows: number
        }
        Insert: {
          created_at?: string
          error_rows?: number
          file_name?: string | null
          id?: string
          import_type: string
          org_id: string
          processed_rows?: number
          property_id?: string | null
          total_rows?: number
        }
        Update: {
          created_at?: string
          error_rows?: number
          file_name?: string | null
          id?: string
          import_type?: string
          org_id?: string
          processed_rows?: number
          property_id?: string | null
          total_rows?: number
        }
        Relationships: [
          {
            foreignKeyName: "debacu_eval_import_batches_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "debacu_eval_properties"
            referencedColumns: ["id"]
          },
        ]
      }
      debacu_eval_import_guest_index: {
        Row: {
          created_at: string
          first_seen_date: string | null
          id: string
          identity_key: string
          incidents_count: number
          last_incident_date: string | null
          last_seen_date: string | null
          reservations_count: number
          risk_band: string
          stays_count: number
          total_gross: number
          total_net_loss: number
          total_recovered: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          first_seen_date?: string | null
          id?: string
          identity_key: string
          incidents_count?: number
          last_incident_date?: string | null
          last_seen_date?: string | null
          reservations_count?: number
          risk_band?: string
          stays_count?: number
          total_gross?: number
          total_net_loss?: number
          total_recovered?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          first_seen_date?: string | null
          id?: string
          identity_key?: string
          incidents_count?: number
          last_incident_date?: string | null
          last_seen_date?: string | null
          reservations_count?: number
          risk_band?: string
          stays_count?: number
          total_gross?: number
          total_net_loss?: number
          total_recovered?: number
          updated_at?: string
        }
        Relationships: []
      }
      debacu_eval_import_guest_index_bak: {
        Row: {
          created_at: string | null
          first_seen_date: string | null
          id: string | null
          identity_key: string | null
          incidents_count: number | null
          last_incident_date: string | null
          last_seen_date: string | null
          reservations_count: number | null
          risk_band: string | null
          stays_count: number | null
          total_gross: number | null
          total_net_loss: number | null
          total_recovered: number | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          first_seen_date?: string | null
          id?: string | null
          identity_key?: string | null
          incidents_count?: number | null
          last_incident_date?: string | null
          last_seen_date?: string | null
          reservations_count?: number | null
          risk_band?: string | null
          stays_count?: number | null
          total_gross?: number | null
          total_net_loss?: number | null
          total_recovered?: number | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          first_seen_date?: string | null
          id?: string | null
          identity_key?: string | null
          incidents_count?: number | null
          last_incident_date?: string | null
          last_seen_date?: string | null
          reservations_count?: number | null
          risk_band?: string | null
          stays_count?: number | null
          total_gross?: number | null
          total_net_loss?: number | null
          total_recovered?: number | null
          updated_at?: string | null
        }
        Relationships: []
      }
      debacu_eval_import_rows: {
        Row: {
          batch_id: string
          checkin_date: string
          checkout_date: string | null
          created_at: string
          error_code: string | null
          full_name: string | null
          id: string
          identity_key: string
          match_status: string
          org_id: string
          risk_band_at_import: string | null
        }
        Insert: {
          batch_id: string
          checkin_date: string
          checkout_date?: string | null
          created_at?: string
          error_code?: string | null
          full_name?: string | null
          id?: string
          identity_key: string
          match_status?: string
          org_id: string
          risk_band_at_import?: string | null
        }
        Update: {
          batch_id?: string
          checkin_date?: string
          checkout_date?: string | null
          created_at?: string
          error_code?: string | null
          full_name?: string | null
          id?: string
          identity_key?: string
          match_status?: string
          org_id?: string
          risk_band_at_import?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "debacu_eval_import_rows_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "debacu_eval_import_batches"
            referencedColumns: ["id"]
          },
        ]
      }
      debacu_eval_inventory_daily: {
        Row: {
          created_at: string | null
          id: string
          org_id: string
          property_id: string
          rooms_available: number
          rooms_out_of_order: number | null
          stay_date: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          org_id: string
          property_id: string
          rooms_available: number
          rooms_out_of_order?: number | null
          stay_date: string
        }
        Update: {
          created_at?: string | null
          id?: string
          org_id?: string
          property_id?: string
          rooms_available?: number
          rooms_out_of_order?: number | null
          stay_date?: string
        }
        Relationships: []
      }
      debacu_eval_invoices: {
        Row: {
          amount_due: number | null
          amount_subtotal: number | null
          amount_tax: number | null
          amount_total: number
          app_id: string
          created_at: string
          currency: string
          customer_id: string
          customer_id_uuid: string | null
          hosted_invoice_url: string | null
          id: string
          invoice_created_at: string
          invoice_number: string | null
          invoice_pdf: string | null
          metadata: Json
          paid_at: string | null
          period_end: string | null
          period_start: string | null
          status: string
          stripe_customer_id: string | null
          stripe_invoice_id: string
          stripe_payment_intent_id: string | null
          stripe_subscription_id: string | null
          updated_at: string
        }
        Insert: {
          amount_due?: number | null
          amount_subtotal?: number | null
          amount_tax?: number | null
          amount_total: number
          app_id: string
          created_at?: string
          currency?: string
          customer_id: string
          customer_id_uuid?: string | null
          hosted_invoice_url?: string | null
          id?: string
          invoice_created_at: string
          invoice_number?: string | null
          invoice_pdf?: string | null
          metadata?: Json
          paid_at?: string | null
          period_end?: string | null
          period_start?: string | null
          status: string
          stripe_customer_id?: string | null
          stripe_invoice_id: string
          stripe_payment_intent_id?: string | null
          stripe_subscription_id?: string | null
          updated_at?: string
        }
        Update: {
          amount_due?: number | null
          amount_subtotal?: number | null
          amount_tax?: number | null
          amount_total?: number
          app_id?: string
          created_at?: string
          currency?: string
          customer_id?: string
          customer_id_uuid?: string | null
          hosted_invoice_url?: string | null
          id?: string
          invoice_created_at?: string
          invoice_number?: string | null
          invoice_pdf?: string | null
          metadata?: Json
          paid_at?: string | null
          period_end?: string | null
          period_start?: string | null
          status?: string
          stripe_customer_id?: string | null
          stripe_invoice_id?: string
          stripe_payment_intent_id?: string | null
          stripe_subscription_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "debacu_eval_invoices_customer_id_uuid_fkey"
            columns: ["customer_id_uuid"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "debacu_eval_invoices_customer_id_uuid_fkey"
            columns: ["customer_id_uuid"]
            isOneToOne: false
            referencedRelation: "v_customer_profile_status"
            referencedColumns: ["customer_id"]
          },
        ]
      }
      debacu_eval_manual_check_results: {
        Row: {
          country: string | null
          created_at: string
          full_name_masked: string | null
          id: string
          identity_key: string
          incidents_count: number
          last_incident_at: string | null
          manual_check_id: string
          masked_document: string | null
          masked_email: string | null
          masked_phone: string | null
          org_id: string
          property_id: string
          risk_level: Database["public"]["Enums"]["debacu_eval_risk_level"]
          risk_score: number
          source_summary: Json
        }
        Insert: {
          country?: string | null
          created_at?: string
          full_name_masked?: string | null
          id?: string
          identity_key: string
          incidents_count?: number
          last_incident_at?: string | null
          manual_check_id: string
          masked_document?: string | null
          masked_email?: string | null
          masked_phone?: string | null
          org_id: string
          property_id: string
          risk_level: Database["public"]["Enums"]["debacu_eval_risk_level"]
          risk_score?: number
          source_summary?: Json
        }
        Update: {
          country?: string | null
          created_at?: string
          full_name_masked?: string | null
          id?: string
          identity_key?: string
          incidents_count?: number
          last_incident_at?: string | null
          manual_check_id?: string
          masked_document?: string | null
          masked_email?: string | null
          masked_phone?: string | null
          org_id?: string
          property_id?: string
          risk_level?: Database["public"]["Enums"]["debacu_eval_risk_level"]
          risk_score?: number
          source_summary?: Json
        }
        Relationships: [
          {
            foreignKeyName: "debacu_eval_manual_check_results_manual_check_id_fkey"
            columns: ["manual_check_id"]
            isOneToOne: false
            referencedRelation: "debacu_eval_manual_checks"
            referencedColumns: ["id"]
          },
        ]
      }
      debacu_eval_manual_checks: {
        Row: {
          check_mode: Database["public"]["Enums"]["debacu_eval_check_mode"]
          created_at: string
          current_risk_level:
            | Database["public"]["Enums"]["debacu_eval_risk_level"]
            | null
          id: string
          identity_confidence: number | null
          identity_key: string | null
          normalized_query: Json
          org_id: string
          performed_by_user_id: string
          previous_risk_level:
            | Database["public"]["Enums"]["debacu_eval_risk_level"]
            | null
          property_id: string
          query_type: Database["public"]["Enums"]["debacu_eval_query_type"]
          query_value_hash: string
          query_value_masked: string
          result_has_matches: boolean
          result_scope: string
          result_summary: Json
          risk_changed: boolean
        }
        Insert: {
          check_mode: Database["public"]["Enums"]["debacu_eval_check_mode"]
          created_at?: string
          current_risk_level?:
            | Database["public"]["Enums"]["debacu_eval_risk_level"]
            | null
          id?: string
          identity_confidence?: number | null
          identity_key?: string | null
          normalized_query?: Json
          org_id: string
          performed_by_user_id: string
          previous_risk_level?:
            | Database["public"]["Enums"]["debacu_eval_risk_level"]
            | null
          property_id: string
          query_type: Database["public"]["Enums"]["debacu_eval_query_type"]
          query_value_hash: string
          query_value_masked: string
          result_has_matches?: boolean
          result_scope: string
          result_summary?: Json
          risk_changed?: boolean
        }
        Update: {
          check_mode?: Database["public"]["Enums"]["debacu_eval_check_mode"]
          created_at?: string
          current_risk_level?:
            | Database["public"]["Enums"]["debacu_eval_risk_level"]
            | null
          id?: string
          identity_confidence?: number | null
          identity_key?: string | null
          normalized_query?: Json
          org_id?: string
          performed_by_user_id?: string
          previous_risk_level?:
            | Database["public"]["Enums"]["debacu_eval_risk_level"]
            | null
          property_id?: string
          query_type?: Database["public"]["Enums"]["debacu_eval_query_type"]
          query_value_hash?: string
          query_value_masked?: string
          result_has_matches?: boolean
          result_scope?: string
          result_summary?: Json
          risk_changed?: boolean
        }
        Relationships: []
      }
      debacu_eval_manual_incidents: {
        Row: {
          created_at: string
          created_by: string
          description: string
          economic_impact: number | null
          id: string
          identity_key: string
          incident_date: string
          incident_type: Database["public"]["Enums"]["debacu_eval_incident_type"]
          input_country: string | null
          input_document_masked: string | null
          input_email_masked: string | null
          input_first_name: string | null
          input_last_name: string | null
          input_phone_masked: string | null
          org_id: string
          property_id: string
          severity: Database["public"]["Enums"]["debacu_eval_severity"]
          source: Database["public"]["Enums"]["debacu_eval_incident_source"]
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by: string
          description: string
          economic_impact?: number | null
          id?: string
          identity_key: string
          incident_date: string
          incident_type: Database["public"]["Enums"]["debacu_eval_incident_type"]
          input_country?: string | null
          input_document_masked?: string | null
          input_email_masked?: string | null
          input_first_name?: string | null
          input_last_name?: string | null
          input_phone_masked?: string | null
          org_id: string
          property_id: string
          severity: Database["public"]["Enums"]["debacu_eval_severity"]
          source?: Database["public"]["Enums"]["debacu_eval_incident_source"]
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          description?: string
          economic_impact?: number | null
          id?: string
          identity_key?: string
          incident_date?: string
          incident_type?: Database["public"]["Enums"]["debacu_eval_incident_type"]
          input_country?: string | null
          input_document_masked?: string | null
          input_email_masked?: string | null
          input_first_name?: string | null
          input_last_name?: string | null
          input_phone_masked?: string | null
          org_id?: string
          property_id?: string
          severity?: Database["public"]["Enums"]["debacu_eval_severity"]
          source?: Database["public"]["Enums"]["debacu_eval_incident_source"]
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      debacu_eval_org_guest_evidence: {
        Row: {
          channel_code: string
          created_at: string
          economic_impact_gross: number | null
          economic_net_loss: number | null
          economic_recovered: number | null
          event_date: string
          evidence_flag: boolean | null
          id: string
          identity_key: string
          incident_type: string | null
          nationality_iso2: string | null
          nationality_raw: string | null
          org_id: string
          platform_code: string
          platform_raw: string | null
          rating: number | null
          severity: string | null
          source_id: string | null
          source_table: string
        }
        Insert: {
          channel_code?: string
          created_at?: string
          economic_impact_gross?: number | null
          economic_net_loss?: number | null
          economic_recovered?: number | null
          event_date: string
          evidence_flag?: boolean | null
          id?: string
          identity_key: string
          incident_type?: string | null
          nationality_iso2?: string | null
          nationality_raw?: string | null
          org_id: string
          platform_code?: string
          platform_raw?: string | null
          rating?: number | null
          severity?: string | null
          source_id?: string | null
          source_table?: string
        }
        Update: {
          channel_code?: string
          created_at?: string
          economic_impact_gross?: number | null
          economic_net_loss?: number | null
          economic_recovered?: number | null
          event_date?: string
          evidence_flag?: boolean | null
          id?: string
          identity_key?: string
          incident_type?: string | null
          nationality_iso2?: string | null
          nationality_raw?: string | null
          org_id?: string
          platform_code?: string
          platform_raw?: string | null
          rating?: number | null
          severity?: string | null
          source_id?: string | null
          source_table?: string
        }
        Relationships: []
      }
      debacu_eval_org_guest_index: {
        Row: {
          doc_key: string | null
          email_key: string | null
          first_seen_date: string | null
          id: string
          identity_key: string
          incidents_count: number
          last_incident_date: string | null
          last_seen_date: string | null
          org_id: string
          phone_key: string | null
          risk_band: string
          stays_count: number
          total_net_loss: number
          updated_at: string
        }
        Insert: {
          doc_key?: string | null
          email_key?: string | null
          first_seen_date?: string | null
          id?: string
          identity_key: string
          incidents_count?: number
          last_incident_date?: string | null
          last_seen_date?: string | null
          org_id: string
          phone_key?: string | null
          risk_band?: string
          stays_count?: number
          total_net_loss?: number
          updated_at?: string
        }
        Update: {
          doc_key?: string | null
          email_key?: string | null
          first_seen_date?: string | null
          id?: string
          identity_key?: string
          incidents_count?: number
          last_incident_date?: string | null
          last_seen_date?: string | null
          org_id?: string
          phone_key?: string | null
          risk_band?: string
          stays_count?: number
          total_net_loss?: number
          updated_at?: string
        }
        Relationships: []
      }
      debacu_eval_org_guest_seen: {
        Row: {
          first_seen_at: string
          identity_key: string
          incidents_count_org: number
          last_seen_at: string
          org_id: string
          stays_count_org: number
        }
        Insert: {
          first_seen_at?: string
          identity_key: string
          incidents_count_org?: number
          last_seen_at?: string
          org_id: string
          stays_count_org?: number
        }
        Update: {
          first_seen_at?: string
          identity_key?: string
          incidents_count_org?: number
          last_seen_at?: string
          org_id?: string
          stays_count_org?: number
        }
        Relationships: []
      }
      debacu_eval_org_member_profiles: {
        Row: {
          created_at: string
          first_name: string | null
          last_name: string | null
          member_id: string
          org_id: string
          phone: string | null
          title: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          first_name?: string | null
          last_name?: string | null
          member_id: string
          org_id: string
          phone?: string | null
          title?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          first_name?: string | null
          last_name?: string | null
          member_id?: string
          org_id?: string
          phone?: string | null
          title?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "debacu_eval_org_member_profiles_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: true
            referencedRelation: "debacu_eval_org_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "debacu_eval_org_member_profiles_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "debacu_eval_org_entitlements_v"
            referencedColumns: ["org_id"]
          },
          {
            foreignKeyName: "debacu_eval_org_member_profiles_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "debacu_eval_organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      debacu_eval_org_members: {
        Row: {
          auth_user_id: string | null
          created_at: string
          created_by_user_id: string | null
          id: string
          invited_email: string | null
          org_id: string
          role: string
          status: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          auth_user_id?: string | null
          created_at?: string
          created_by_user_id?: string | null
          id?: string
          invited_email?: string | null
          org_id: string
          role?: string
          status?: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          auth_user_id?: string | null
          created_at?: string
          created_by_user_id?: string | null
          id?: string
          invited_email?: string | null
          org_id?: string
          role?: string
          status?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "debacu_eval_org_members_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "debacu_eval_org_entitlements_v"
            referencedColumns: ["org_id"]
          },
          {
            foreignKeyName: "debacu_eval_org_members_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "debacu_eval_organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      debacu_eval_organizations: {
        Row: {
          address: string | null
          cif: string | null
          city: string | null
          country: string
          created_at: string
          customer_id: string | null
          id: string
          legal_name: string | null
          name: string
          property_type: string | null
          rooms_count: number | null
          website: string | null
        }
        Insert: {
          address?: string | null
          cif?: string | null
          city?: string | null
          country?: string
          created_at?: string
          customer_id?: string | null
          id?: string
          legal_name?: string | null
          name: string
          property_type?: string | null
          rooms_count?: number | null
          website?: string | null
        }
        Update: {
          address?: string | null
          cif?: string | null
          city?: string | null
          country?: string
          created_at?: string
          customer_id?: string | null
          id?: string
          legal_name?: string | null
          name?: string
          property_type?: string | null
          rooms_count?: number | null
          website?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "debacu_eval_organizations_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "debacu_eval_organizations_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "v_customer_profile_status"
            referencedColumns: ["customer_id"]
          },
        ]
      }
      debacu_eval_payments: {
        Row: {
          amount: number | null
          app_id: string
          confirmed_at: string | null
          created_at: string
          currency: string | null
          customer_id: string
          id: string
          last_error: string | null
          metadata: Json | null
          status: string | null
          stripe_customer_id: string | null
          stripe_invoice_id: string | null
          stripe_payment_intent_id: string | null
          stripe_subscription_id: string | null
          updated_at: string
        }
        Insert: {
          amount?: number | null
          app_id: string
          confirmed_at?: string | null
          created_at?: string
          currency?: string | null
          customer_id: string
          id?: string
          last_error?: string | null
          metadata?: Json | null
          status?: string | null
          stripe_customer_id?: string | null
          stripe_invoice_id?: string | null
          stripe_payment_intent_id?: string | null
          stripe_subscription_id?: string | null
          updated_at?: string
        }
        Update: {
          amount?: number | null
          app_id?: string
          confirmed_at?: string | null
          created_at?: string
          currency?: string | null
          customer_id?: string
          id?: string
          last_error?: string | null
          metadata?: Json | null
          status?: string | null
          stripe_customer_id?: string | null
          stripe_invoice_id?: string | null
          stripe_payment_intent_id?: string | null
          stripe_subscription_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "debacu_eval_payments_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "debacu_eval_payments_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "v_customer_profile_status"
            referencedColumns: ["customer_id"]
          },
        ]
      }
      debacu_eval_properties: {
        Row: {
          address: string | null
          category: number | null
          city: string | null
          code: string
          country: string | null
          created_at: string
          created_by: string | null
          currency_code: string | null
          id: string
          import_property_code: string | null
          is_active: boolean
          legal_name: string | null
          name: string
          org_id: string
          property_type: string | null
          region: string | null
          rooms_total: number | null
          tax_id: string | null
          timezone: string | null
          updated_at: string
        }
        Insert: {
          address?: string | null
          category?: number | null
          city?: string | null
          code: string
          country?: string | null
          created_at?: string
          created_by?: string | null
          currency_code?: string | null
          id?: string
          import_property_code?: string | null
          is_active?: boolean
          legal_name?: string | null
          name: string
          org_id: string
          property_type?: string | null
          region?: string | null
          rooms_total?: number | null
          tax_id?: string | null
          timezone?: string | null
          updated_at?: string
        }
        Update: {
          address?: string | null
          category?: number | null
          city?: string | null
          code?: string
          country?: string | null
          created_at?: string
          created_by?: string | null
          currency_code?: string | null
          id?: string
          import_property_code?: string | null
          is_active?: boolean
          legal_name?: string | null
          name?: string
          org_id?: string
          property_type?: string | null
          region?: string | null
          rooms_total?: number | null
          tax_id?: string | null
          timezone?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "debacu_eval_properties_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "debacu_eval_org_entitlements_v"
            referencedColumns: ["org_id"]
          },
          {
            foreignKeyName: "debacu_eval_properties_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "debacu_eval_organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      debacu_eval_property_room_types: {
        Row: {
          base_price: number | null
          capacity: number | null
          code: string
          created_at: string
          id: string
          is_active: boolean
          name: string
          org_id: string
          property_id: string
          rooms_count: number | null
          updated_at: string
        }
        Insert: {
          base_price?: number | null
          capacity?: number | null
          code: string
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          org_id: string
          property_id: string
          rooms_count?: number | null
          updated_at?: string
        }
        Update: {
          base_price?: number | null
          capacity?: number | null
          code?: string
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          org_id?: string
          property_id?: string
          rooms_count?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "debacu_eval_property_room_types_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "debacu_eval_org_entitlements_v"
            referencedColumns: ["org_id"]
          },
          {
            foreignKeyName: "debacu_eval_property_room_types_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "debacu_eval_organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "debacu_eval_property_room_types_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "debacu_eval_properties"
            referencedColumns: ["id"]
          },
        ]
      }
      debacu_eval_property_seasons: {
        Row: {
          color: string
          created_at: string
          end_date: string
          id: string
          impact_level: string | null
          is_active: boolean
          name: string
          note: string | null
          org_id: string
          price_adjustment_percent: number | null
          pricing_adjustment_type: string | null
          pricing_adjustment_value: number | null
          pricing_operation: string | null
          priority: number
          property_id: string
          season_type: string | null
          start_date: string
          updated_at: string
        }
        Insert: {
          color?: string
          created_at?: string
          end_date: string
          id?: string
          impact_level?: string | null
          is_active?: boolean
          name: string
          note?: string | null
          org_id: string
          price_adjustment_percent?: number | null
          pricing_adjustment_type?: string | null
          pricing_adjustment_value?: number | null
          pricing_operation?: string | null
          priority?: number
          property_id: string
          season_type?: string | null
          start_date: string
          updated_at?: string
        }
        Update: {
          color?: string
          created_at?: string
          end_date?: string
          id?: string
          impact_level?: string | null
          is_active?: boolean
          name?: string
          note?: string | null
          org_id?: string
          price_adjustment_percent?: number | null
          pricing_adjustment_type?: string | null
          pricing_adjustment_value?: number | null
          pricing_operation?: string | null
          priority?: number
          property_id?: string
          season_type?: string | null
          start_date?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "debacu_eval_property_seasons_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "debacu_eval_org_entitlements_v"
            referencedColumns: ["org_id"]
          },
          {
            foreignKeyName: "debacu_eval_property_seasons_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "debacu_eval_organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "debacu_eval_property_seasons_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "debacu_eval_properties"
            referencedColumns: ["id"]
          },
        ]
      }
      debacu_eval_reservation_daily_ledger: {
        Row: {
          booking_date: string | null
          created_at: string | null
          id: string
          org_id: string
          property_code: string
          reservation_id: string
          revenue: number | null
          rooms: number
          stay_date: string
        }
        Insert: {
          booking_date?: string | null
          created_at?: string | null
          id?: string
          org_id: string
          property_code: string
          reservation_id: string
          revenue?: number | null
          rooms: number
          stay_date: string
        }
        Update: {
          booking_date?: string | null
          created_at?: string | null
          id?: string
          org_id?: string
          property_code?: string
          reservation_id?: string
          revenue?: number | null
          rooms?: number
          stay_date?: string
        }
        Relationships: []
      }
      debacu_eval_reservation_identities: {
        Row: {
          country: string | null
          created_at: string
          document_hash: string | null
          email_hash: string | null
          first_name_enc: string | null
          id: string
          identity_key: string
          identity_strength: string
          last_name_enc: string | null
          org_id: string
          phone_hash: string | null
          reservation_key: string
          updated_at: string
        }
        Insert: {
          country?: string | null
          created_at?: string
          document_hash?: string | null
          email_hash?: string | null
          first_name_enc?: string | null
          id?: string
          identity_key: string
          identity_strength: string
          last_name_enc?: string | null
          org_id: string
          phone_hash?: string | null
          reservation_key: string
          updated_at?: string
        }
        Update: {
          country?: string | null
          created_at?: string
          document_hash?: string | null
          email_hash?: string | null
          first_name_enc?: string | null
          id?: string
          identity_key?: string
          identity_strength?: string
          last_name_enc?: string | null
          org_id?: string
          phone_hash?: string | null
          reservation_key?: string
          updated_at?: string
        }
        Relationships: []
      }
      debacu_eval_reservation_snapshots: {
        Row: {
          adults: number | null
          batch_id: string
          booking_date: string
          cancelled_at: string | null
          channel: string | null
          checkin_date: string
          checkout_date: string
          children: number | null
          commission_amount: number | null
          created_at: string
          currency: string
          gross_revenue: number
          id: string
          net_revenue: number | null
          org_id: string
          property_code: string
          rate_plan: string | null
          reservation_key: string
          reservation_status: string
          room_type: string | null
          rooms: number
          segment: string | null
          snapshot_date: string
        }
        Insert: {
          adults?: number | null
          batch_id: string
          booking_date: string
          cancelled_at?: string | null
          channel?: string | null
          checkin_date: string
          checkout_date: string
          children?: number | null
          commission_amount?: number | null
          created_at?: string
          currency: string
          gross_revenue: number
          id?: string
          net_revenue?: number | null
          org_id: string
          property_code: string
          rate_plan?: string | null
          reservation_key: string
          reservation_status: string
          room_type?: string | null
          rooms: number
          segment?: string | null
          snapshot_date?: string
        }
        Update: {
          adults?: number | null
          batch_id?: string
          booking_date?: string
          cancelled_at?: string | null
          channel?: string | null
          checkin_date?: string
          checkout_date?: string
          children?: number | null
          commission_amount?: number | null
          created_at?: string
          currency?: string
          gross_revenue?: number
          id?: string
          net_revenue?: number | null
          org_id?: string
          property_code?: string
          rate_plan?: string | null
          reservation_key?: string
          reservation_status?: string
          room_type?: string | null
          rooms?: number
          segment?: string | null
          snapshot_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "debacu_eval_reservation_snapshots_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "debacu_eval_unified_import_batches"
            referencedColumns: ["id"]
          },
        ]
      }
      debacu_eval_reservations: {
        Row: {
          adults: number | null
          agency: string | null
          booking_date: string
          cancelled_at: string | null
          channel: string | null
          checkin_date: string
          checkout_date: string
          children: number | null
          commission_amount: number | null
          company: string | null
          created_at: string
          currency: string
          first_seen_at: string
          first_seen_batch_id: string | null
          gross_revenue: number
          id: string
          last_seen_at: string
          last_seen_batch_id: string | null
          market_code: string | null
          net_revenue: number | null
          org_id: string
          property_code: string
          rate_plan: string | null
          reservation_id: string
          reservation_key: string
          reservation_line_id: string | null
          reservation_status: string
          room_type: string | null
          rooms: number
          segment: string | null
          source_system: string | null
          updated_at: string
        }
        Insert: {
          adults?: number | null
          agency?: string | null
          booking_date: string
          cancelled_at?: string | null
          channel?: string | null
          checkin_date: string
          checkout_date: string
          children?: number | null
          commission_amount?: number | null
          company?: string | null
          created_at?: string
          currency: string
          first_seen_at?: string
          first_seen_batch_id?: string | null
          gross_revenue: number
          id?: string
          last_seen_at?: string
          last_seen_batch_id?: string | null
          market_code?: string | null
          net_revenue?: number | null
          org_id: string
          property_code: string
          rate_plan?: string | null
          reservation_id: string
          reservation_key: string
          reservation_line_id?: string | null
          reservation_status: string
          room_type?: string | null
          rooms: number
          segment?: string | null
          source_system?: string | null
          updated_at?: string
        }
        Update: {
          adults?: number | null
          agency?: string | null
          booking_date?: string
          cancelled_at?: string | null
          channel?: string | null
          checkin_date?: string
          checkout_date?: string
          children?: number | null
          commission_amount?: number | null
          company?: string | null
          created_at?: string
          currency?: string
          first_seen_at?: string
          first_seen_batch_id?: string | null
          gross_revenue?: number
          id?: string
          last_seen_at?: string
          last_seen_batch_id?: string | null
          market_code?: string | null
          net_revenue?: number | null
          org_id?: string
          property_code?: string
          rate_plan?: string | null
          reservation_id?: string
          reservation_key?: string
          reservation_line_id?: string | null
          reservation_status?: string
          room_type?: string | null
          rooms?: number
          segment?: string | null
          source_system?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "debacu_eval_reservations_first_seen_batch_id_fkey"
            columns: ["first_seen_batch_id"]
            isOneToOne: false
            referencedRelation: "debacu_eval_unified_import_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "debacu_eval_reservations_last_seen_batch_id_fkey"
            columns: ["last_seen_batch_id"]
            isOneToOne: false
            referencedRelation: "debacu_eval_unified_import_batches"
            referencedColumns: ["id"]
          },
        ]
      }
      debacu_eval_revenue_booking_lines: {
        Row: {
          booking_date: string | null
          channel: string | null
          checkin_date: string
          checkout_date: string
          created_at: string
          currency_code: string | null
          external_reservation_id: string | null
          id: string
          import_batch_id: string | null
          org_id: string
          price_sold: number
          property_id: string
          rate_plan: string | null
          reservation_id: string
          revenue_rooms: number
          room_type_id: string | null
          segment: string | null
          source: string
          status: string | null
          stay_date: string
          units_sold: number
          updated_at: string
        }
        Insert: {
          booking_date?: string | null
          channel?: string | null
          checkin_date: string
          checkout_date: string
          created_at?: string
          currency_code?: string | null
          external_reservation_id?: string | null
          id?: string
          import_batch_id?: string | null
          org_id: string
          price_sold?: number
          property_id: string
          rate_plan?: string | null
          reservation_id: string
          revenue_rooms?: number
          room_type_id?: string | null
          segment?: string | null
          source?: string
          status?: string | null
          stay_date: string
          units_sold?: number
          updated_at?: string
        }
        Update: {
          booking_date?: string | null
          channel?: string | null
          checkin_date?: string
          checkout_date?: string
          created_at?: string
          currency_code?: string | null
          external_reservation_id?: string | null
          id?: string
          import_batch_id?: string | null
          org_id?: string
          price_sold?: number
          property_id?: string
          rate_plan?: string | null
          reservation_id?: string
          revenue_rooms?: number
          room_type_id?: string | null
          segment?: string | null
          source?: string
          status?: string | null
          stay_date?: string
          units_sold?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "debacu_eval_revenue_booking_lines_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "debacu_eval_org_entitlements_v"
            referencedColumns: ["org_id"]
          },
          {
            foreignKeyName: "debacu_eval_revenue_booking_lines_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "debacu_eval_organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "debacu_eval_revenue_booking_lines_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "debacu_eval_properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "debacu_eval_revenue_booking_lines_room_type_id_fkey"
            columns: ["room_type_id"]
            isOneToOne: false
            referencedRelation: "debacu_eval_property_room_types"
            referencedColumns: ["id"]
          },
        ]
      }
      debacu_eval_revenue_channels: {
        Row: {
          code: string
          commission_pct: number | null
          created_at: string
          id: string
          is_active: boolean
          name: string
          org_id: string
          property_id: string
        }
        Insert: {
          code: string
          commission_pct?: number | null
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          org_id: string
          property_id: string
        }
        Update: {
          code?: string
          commission_pct?: number | null
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          org_id?: string
          property_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "debacu_eval_revenue_channels_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "debacu_eval_org_entitlements_v"
            referencedColumns: ["org_id"]
          },
          {
            foreignKeyName: "debacu_eval_revenue_channels_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "debacu_eval_organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "debacu_eval_revenue_channels_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "debacu_eval_properties"
            referencedColumns: ["id"]
          },
        ]
      }
      debacu_eval_revenue_daily: {
        Row: {
          adr: number | null
          channel: string | null
          created_at: string
          id: string
          org_id: string
          property_id: string
          revenue_rooms: number
          revenue_total: number
          revpar: number | null
          room_type_id: string | null
          rooms_available: number | null
          rooms_sold: number
          segment: string | null
          source: string | null
          stay_date: string
          updated_at: string
        }
        Insert: {
          adr?: number | null
          channel?: string | null
          created_at?: string
          id?: string
          org_id: string
          property_id: string
          revenue_rooms?: number
          revenue_total?: number
          revpar?: number | null
          room_type_id?: string | null
          rooms_available?: number | null
          rooms_sold?: number
          segment?: string | null
          source?: string | null
          stay_date: string
          updated_at?: string
        }
        Update: {
          adr?: number | null
          channel?: string | null
          created_at?: string
          id?: string
          org_id?: string
          property_id?: string
          revenue_rooms?: number
          revenue_total?: number
          revpar?: number | null
          room_type_id?: string | null
          rooms_available?: number | null
          rooms_sold?: number
          segment?: string | null
          source?: string | null
          stay_date?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "debacu_eval_revenue_daily_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "debacu_eval_org_entitlements_v"
            referencedColumns: ["org_id"]
          },
          {
            foreignKeyName: "debacu_eval_revenue_daily_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "debacu_eval_organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "debacu_eval_revenue_daily_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "debacu_eval_properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "debacu_eval_revenue_daily_room_type_id_fkey"
            columns: ["room_type_id"]
            isOneToOne: false
            referencedRelation: "debacu_eval_property_room_types"
            referencedColumns: ["id"]
          },
        ]
      }
      debacu_eval_revenue_events: {
        Row: {
          color: string
          created_at: string
          created_by: string | null
          end_date: string
          event_type: string | null
          id: string
          impact_level: string | null
          is_active: boolean
          name: string
          note: string | null
          org_id: string
          pricing_adjustment_type: string | null
          pricing_adjustment_value: number | null
          pricing_operation: string | null
          priority: number
          property_id: string
          start_date: string
          updated_at: string
        }
        Insert: {
          color?: string
          created_at?: string
          created_by?: string | null
          end_date: string
          event_type?: string | null
          id?: string
          impact_level?: string | null
          is_active?: boolean
          name: string
          note?: string | null
          org_id: string
          pricing_adjustment_type?: string | null
          pricing_adjustment_value?: number | null
          pricing_operation?: string | null
          priority?: number
          property_id: string
          start_date: string
          updated_at?: string
        }
        Update: {
          color?: string
          created_at?: string
          created_by?: string | null
          end_date?: string
          event_type?: string | null
          id?: string
          impact_level?: string | null
          is_active?: boolean
          name?: string
          note?: string | null
          org_id?: string
          pricing_adjustment_type?: string | null
          pricing_adjustment_value?: number | null
          pricing_operation?: string | null
          priority?: number
          property_id?: string
          start_date?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "debacu_eval_revenue_events_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "debacu_eval_org_entitlements_v"
            referencedColumns: ["org_id"]
          },
          {
            foreignKeyName: "debacu_eval_revenue_events_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "debacu_eval_organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "debacu_eval_revenue_events_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "debacu_eval_properties"
            referencedColumns: ["id"]
          },
        ]
      }
      debacu_eval_revenue_import_errors: {
        Row: {
          created_at: string
          error_code: string
          error_message: string
          field_name: string | null
          id: string
          import_id: string
          raw_row: Json | null
          row_number: number
        }
        Insert: {
          created_at?: string
          error_code: string
          error_message: string
          field_name?: string | null
          id?: string
          import_id: string
          raw_row?: Json | null
          row_number: number
        }
        Update: {
          created_at?: string
          error_code?: string
          error_message?: string
          field_name?: string | null
          id?: string
          import_id?: string
          raw_row?: Json | null
          row_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "debacu_eval_revenue_import_errors_import_id_fkey"
            columns: ["import_id"]
            isOneToOne: false
            referencedRelation: "debacu_eval_revenue_imports"
            referencedColumns: ["id"]
          },
        ]
      }
      debacu_eval_revenue_import_rows: {
        Row: {
          channel: string | null
          created_at: string | null
          id: string
          org_id: string
          property_id: string
          revenue: number | null
          room_type: string | null
          rooms_sold: number | null
          segment: string | null
          source_file: string | null
          stay_date: string | null
        }
        Insert: {
          channel?: string | null
          created_at?: string | null
          id?: string
          org_id: string
          property_id: string
          revenue?: number | null
          room_type?: string | null
          rooms_sold?: number | null
          segment?: string | null
          source_file?: string | null
          stay_date?: string | null
        }
        Update: {
          channel?: string | null
          created_at?: string | null
          id?: string
          org_id?: string
          property_id?: string
          revenue?: number | null
          room_type?: string | null
          rooms_sold?: number | null
          segment?: string | null
          source_file?: string | null
          stay_date?: string | null
        }
        Relationships: []
      }
      debacu_eval_revenue_imports: {
        Row: {
          applied_rows: number
          created_at: string
          created_by: string | null
          error_summary: Json
          file_name: string | null
          file_sha256: string | null
          id: string
          import_type: string
          invalid_rows: number
          meta: Json
          org_id: string
          property_id: string
          skipped_rows: number
          status: string
          storage_bucket: string
          storage_path: string
          total_rows: number
          updated_at: string
          valid_rows: number
        }
        Insert: {
          applied_rows?: number
          created_at?: string
          created_by?: string | null
          error_summary?: Json
          file_name?: string | null
          file_sha256?: string | null
          id?: string
          import_type: string
          invalid_rows?: number
          meta?: Json
          org_id: string
          property_id: string
          skipped_rows?: number
          status?: string
          storage_bucket?: string
          storage_path: string
          total_rows?: number
          updated_at?: string
          valid_rows?: number
        }
        Update: {
          applied_rows?: number
          created_at?: string
          created_by?: string | null
          error_summary?: Json
          file_name?: string | null
          file_sha256?: string | null
          id?: string
          import_type?: string
          invalid_rows?: number
          meta?: Json
          org_id?: string
          property_id?: string
          skipped_rows?: number
          status?: string
          storage_bucket?: string
          storage_path?: string
          total_rows?: number
          updated_at?: string
          valid_rows?: number
        }
        Relationships: [
          {
            foreignKeyName: "debacu_eval_revenue_imports_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "debacu_eval_org_entitlements_v"
            referencedColumns: ["org_id"]
          },
          {
            foreignKeyName: "debacu_eval_revenue_imports_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "debacu_eval_organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "debacu_eval_revenue_imports_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "debacu_eval_properties"
            referencedColumns: ["id"]
          },
        ]
      }
      debacu_eval_revenue_insights: {
        Row: {
          created_at: string | null
          description: string | null
          id: string
          insight_type: string
          metric_value: number | null
          org_id: string
          property_id: string
          reference_value: number | null
          resolved: boolean | null
          severity: string
          title: string
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          id?: string
          insight_type: string
          metric_value?: number | null
          org_id: string
          property_id: string
          reference_value?: number | null
          resolved?: boolean | null
          severity?: string
          title: string
        }
        Update: {
          created_at?: string | null
          description?: string | null
          id?: string
          insight_type?: string
          metric_value?: number | null
          org_id?: string
          property_id?: string
          reference_value?: number | null
          resolved?: boolean | null
          severity?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "debacu_eval_revenue_insights_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "debacu_eval_org_entitlements_v"
            referencedColumns: ["org_id"]
          },
          {
            foreignKeyName: "debacu_eval_revenue_insights_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "debacu_eval_organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "debacu_eval_revenue_insights_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "debacu_eval_properties"
            referencedColumns: ["id"]
          },
        ]
      }
      debacu_eval_revenue_pickup_snapshots: {
        Row: {
          adr: number | null
          channel: string | null
          created_at: string
          id: string
          org_id: string
          property_code: string
          reservations_count: number | null
          revenue_rooms: number
          room_nights: number | null
          rooms_sold: number
          segment: string | null
          snapshot_date: string
          stay_date: string
        }
        Insert: {
          adr?: number | null
          channel?: string | null
          created_at?: string
          id?: string
          org_id: string
          property_code: string
          reservations_count?: number | null
          revenue_rooms?: number
          room_nights?: number | null
          rooms_sold?: number
          segment?: string | null
          snapshot_date: string
          stay_date: string
        }
        Update: {
          adr?: number | null
          channel?: string | null
          created_at?: string
          id?: string
          org_id?: string
          property_code?: string
          reservations_count?: number | null
          revenue_rooms?: number
          room_nights?: number | null
          rooms_sold?: number
          segment?: string | null
          snapshot_date?: string
          stay_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "debacu_eval_revenue_pickup_snapshots_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "debacu_eval_org_entitlements_v"
            referencedColumns: ["org_id"]
          },
          {
            foreignKeyName: "debacu_eval_revenue_pickup_snapshots_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "debacu_eval_organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      debacu_eval_revenue_price_changes: {
        Row: {
          calendar_date: string
          change_reason: string | null
          change_source: string
          changed_by: string | null
          created_at: string
          id: string
          new_price: number
          old_price: number | null
          org_id: string
          property_id: string
          room_type_id: string
        }
        Insert: {
          calendar_date: string
          change_reason?: string | null
          change_source?: string
          changed_by?: string | null
          created_at?: string
          id?: string
          new_price: number
          old_price?: number | null
          org_id: string
          property_id: string
          room_type_id: string
        }
        Update: {
          calendar_date?: string
          change_reason?: string | null
          change_source?: string
          changed_by?: string | null
          created_at?: string
          id?: string
          new_price?: number
          old_price?: number | null
          org_id?: string
          property_id?: string
          room_type_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "debacu_eval_revenue_price_changes_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "debacu_eval_org_entitlements_v"
            referencedColumns: ["org_id"]
          },
          {
            foreignKeyName: "debacu_eval_revenue_price_changes_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "debacu_eval_organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "debacu_eval_revenue_price_changes_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "debacu_eval_properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "debacu_eval_revenue_price_changes_room_type_id_fkey"
            columns: ["room_type_id"]
            isOneToOne: false
            referencedRelation: "debacu_eval_property_room_types"
            referencedColumns: ["id"]
          },
        ]
      }
      debacu_eval_revenue_sales: {
        Row: {
          channel: string | null
          created_at: string
          id: string
          org_id: string
          price_sold: number
          property_id: string
          reservation_id: string | null
          room_type_id: string
          stay_date: string
        }
        Insert: {
          channel?: string | null
          created_at?: string
          id?: string
          org_id: string
          price_sold: number
          property_id: string
          reservation_id?: string | null
          room_type_id: string
          stay_date: string
        }
        Update: {
          channel?: string | null
          created_at?: string
          id?: string
          org_id?: string
          price_sold?: number
          property_id?: string
          reservation_id?: string | null
          room_type_id?: string
          stay_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "debacu_eval_revenue_sales_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "debacu_eval_org_entitlements_v"
            referencedColumns: ["org_id"]
          },
          {
            foreignKeyName: "debacu_eval_revenue_sales_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "debacu_eval_organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "debacu_eval_revenue_sales_room_type_id_fkey"
            columns: ["room_type_id"]
            isOneToOne: false
            referencedRelation: "debacu_eval_property_room_types"
            referencedColumns: ["id"]
          },
        ]
      }
      debacu_eval_revenue_segments: {
        Row: {
          code: string
          created_at: string
          id: string
          is_active: boolean
          name: string
          org_id: string
          property_id: string
        }
        Insert: {
          code: string
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          org_id: string
          property_id: string
        }
        Update: {
          code?: string
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          org_id?: string
          property_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "debacu_eval_revenue_segments_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "debacu_eval_org_entitlements_v"
            referencedColumns: ["org_id"]
          },
          {
            foreignKeyName: "debacu_eval_revenue_segments_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "debacu_eval_organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "debacu_eval_revenue_segments_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "debacu_eval_properties"
            referencedColumns: ["id"]
          },
        ]
      }
      debacu_eval_room_prices: {
        Row: {
          closed: boolean
          closed_note: string | null
          closed_reason: string | null
          created_at: string
          date: string
          id: string
          min_stay: number
          org_id: string
          price: number
          property_id: string
          room_type_id: string
          updated_at: string
        }
        Insert: {
          closed?: boolean
          closed_note?: string | null
          closed_reason?: string | null
          created_at?: string
          date: string
          id?: string
          min_stay?: number
          org_id: string
          price?: number
          property_id: string
          room_type_id: string
          updated_at?: string
        }
        Update: {
          closed?: boolean
          closed_note?: string | null
          closed_reason?: string | null
          created_at?: string
          date?: string
          id?: string
          min_stay?: number
          org_id?: string
          price?: number
          property_id?: string
          room_type_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "debacu_eval_room_prices_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "debacu_eval_properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "debacu_eval_room_prices_room_type_id_fkey"
            columns: ["room_type_id"]
            isOneToOne: false
            referencedRelation: "debacu_eval_property_room_types"
            referencedColumns: ["id"]
          },
        ]
      }
      debacu_eval_sessions: {
        Row: {
          app_code: string
          created_at: string
          customer_id: string
          customer_name: string | null
          expires_at: string
          id: string
          revoked_at: string | null
          token: string
        }
        Insert: {
          app_code?: string
          created_at?: string
          customer_id: string
          customer_name?: string | null
          expires_at: string
          id?: string
          revoked_at?: string | null
          token: string
        }
        Update: {
          app_code?: string
          created_at?: string
          customer_id?: string
          customer_name?: string | null
          expires_at?: string
          id?: string
          revoked_at?: string | null
          token?: string
        }
        Relationships: []
      }
      debacu_eval_settings_audit_log: {
        Row: {
          action: string
          actor_email: string | null
          actor_user_id: string
          created_at: string
          diff: Json
          id: string
          ip: string | null
          settings_after: Json
          settings_before: Json
          user_agent: string | null
        }
        Insert: {
          action?: string
          actor_email?: string | null
          actor_user_id: string
          created_at?: string
          diff: Json
          id?: string
          ip?: string | null
          settings_after: Json
          settings_before: Json
          user_agent?: string | null
        }
        Update: {
          action?: string
          actor_email?: string | null
          actor_user_id?: string
          created_at?: string
          diff?: Json
          id?: string
          ip?: string | null
          settings_after?: Json
          settings_before?: Json
          user_agent?: string | null
        }
        Relationships: []
      }
      debacu_eval_stay_nights: {
        Row: {
          allocated_gross_revenue: number
          allocated_net_revenue: number | null
          channel: string | null
          created_at: string
          id: string
          org_id: string
          property_code: string
          rate_plan: string | null
          reservation_key: string
          reservation_status: string
          room_nights: number
          room_type: string | null
          rooms: number
          segment: string | null
          source_batch_id: string | null
          stay_date: string
        }
        Insert: {
          allocated_gross_revenue?: number
          allocated_net_revenue?: number | null
          channel?: string | null
          created_at?: string
          id?: string
          org_id: string
          property_code: string
          rate_plan?: string | null
          reservation_key: string
          reservation_status: string
          room_nights?: number
          room_type?: string | null
          rooms?: number
          segment?: string | null
          source_batch_id?: string | null
          stay_date: string
        }
        Update: {
          allocated_gross_revenue?: number
          allocated_net_revenue?: number | null
          channel?: string | null
          created_at?: string
          id?: string
          org_id?: string
          property_code?: string
          rate_plan?: string | null
          reservation_key?: string
          reservation_status?: string
          room_nights?: number
          room_type?: string | null
          rooms?: number
          segment?: string | null
          source_batch_id?: string | null
          stay_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "debacu_eval_stay_nights_source_batch_id_fkey"
            columns: ["source_batch_id"]
            isOneToOne: false
            referencedRelation: "debacu_eval_unified_import_batches"
            referencedColumns: ["id"]
          },
        ]
      }
      debacu_eval_system_settings: {
        Row: {
          abuse_threshold_percent: number
          allow_new_access_requests: boolean
          id: string
          retention_days: number
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          abuse_threshold_percent?: number
          allow_new_access_requests?: boolean
          id?: string
          retention_days?: number
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          abuse_threshold_percent?: number
          allow_new_access_requests?: boolean
          id?: string
          retention_days?: number
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      debacu_eval_unified_import_batches: {
        Row: {
          committed_at: string | null
          id: string
          import_profile_code: string
          metadata: Json
          org_id: string
          property_code: string
          rows_error: number
          rows_ok: number
          rows_total: number
          rows_warning: number
          separator: string
          source_file_name: string
          source_file_sha256: string
          source_system: string | null
          status: string
          uploaded_at: string
          uploaded_by: string | null
        }
        Insert: {
          committed_at?: string | null
          id?: string
          import_profile_code?: string
          metadata?: Json
          org_id: string
          property_code: string
          rows_error?: number
          rows_ok?: number
          rows_total?: number
          rows_warning?: number
          separator?: string
          source_file_name: string
          source_file_sha256: string
          source_system?: string | null
          status: string
          uploaded_at?: string
          uploaded_by?: string | null
        }
        Update: {
          committed_at?: string | null
          id?: string
          import_profile_code?: string
          metadata?: Json
          org_id?: string
          property_code?: string
          rows_error?: number
          rows_ok?: number
          rows_total?: number
          rows_warning?: number
          separator?: string
          source_file_name?: string
          source_file_sha256?: string
          source_system?: string | null
          status?: string
          uploaded_at?: string
          uploaded_by?: string | null
        }
        Relationships: []
      }
      debacu_eval_unified_import_rows: {
        Row: {
          batch_id: string
          created_at: string
          id: string
          identity_key: string | null
          normalized_payload: Json | null
          org_id: string
          raw_payload: Json
          reservation_key: string | null
          row_number: number
          screening_eligible: boolean
          validation_errors: Json
          validation_status: string
          validation_warnings: Json
        }
        Insert: {
          batch_id: string
          created_at?: string
          id?: string
          identity_key?: string | null
          normalized_payload?: Json | null
          org_id: string
          raw_payload: Json
          reservation_key?: string | null
          row_number: number
          screening_eligible?: boolean
          validation_errors?: Json
          validation_status: string
          validation_warnings?: Json
        }
        Update: {
          batch_id?: string
          created_at?: string
          id?: string
          identity_key?: string | null
          normalized_payload?: Json | null
          org_id?: string
          raw_payload?: Json
          reservation_key?: string | null
          row_number?: number
          screening_eligible?: boolean
          validation_errors?: Json
          validation_status?: string
          validation_warnings?: Json
        }
        Relationships: [
          {
            foreignKeyName: "debacu_eval_unified_import_rows_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "debacu_eval_unified_import_batches"
            referencedColumns: ["id"]
          },
        ]
      }
      debacu_eval_unified_revenue_daily: {
        Row: {
          adr: number | null
          cancelled_reservations: number
          created_at: string
          gross_revenue: number
          id: string
          metric_date: string
          net_revenue: number
          no_show_reservations: number
          org_id: string
          property_code: string
          reservations_count: number
          revpar: number | null
          room_nights: number
          updated_at: string
        }
        Insert: {
          adr?: number | null
          cancelled_reservations?: number
          created_at?: string
          gross_revenue?: number
          id?: string
          metric_date: string
          net_revenue?: number
          no_show_reservations?: number
          org_id: string
          property_code: string
          reservations_count?: number
          revpar?: number | null
          room_nights?: number
          updated_at?: string
        }
        Update: {
          adr?: number | null
          cancelled_reservations?: number
          created_at?: string
          gross_revenue?: number
          id?: string
          metric_date?: string
          net_revenue?: number
          no_show_reservations?: number
          org_id?: string
          property_code?: string
          reservations_count?: number
          revpar?: number | null
          room_nights?: number
          updated_at?: string
        }
        Relationships: []
      }
      debacu_eval_usage_alert_actions: {
        Row: {
          action_type: string
          actor_email: string | null
          actor_user_id: string | null
          alert_id: string
          created_at: string
          from_status: string | null
          id: string
          ip: string | null
          meta: Json
          note: string | null
          to_status: string | null
          user_agent: string | null
        }
        Insert: {
          action_type: string
          actor_email?: string | null
          actor_user_id?: string | null
          alert_id: string
          created_at?: string
          from_status?: string | null
          id?: string
          ip?: string | null
          meta?: Json
          note?: string | null
          to_status?: string | null
          user_agent?: string | null
        }
        Update: {
          action_type?: string
          actor_email?: string | null
          actor_user_id?: string | null
          alert_id?: string
          created_at?: string
          from_status?: string | null
          id?: string
          ip?: string | null
          meta?: Json
          note?: string | null
          to_status?: string | null
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "debacu_eval_usage_alert_actions_alert_id_fkey"
            columns: ["alert_id"]
            isOneToOne: false
            referencedRelation: "debacu_eval_usage_alerts"
            referencedColumns: ["id"]
          },
        ]
      }
      debacu_eval_usage_alerts: {
        Row: {
          acknowledged_at: string | null
          acknowledged_by: string | null
          admin_notes: string | null
          alert_type: string
          app_id: string
          created_at: string
          customer_id: string
          detail: Json | null
          detected_at: string
          id: string
          reason: string
          resolved_at: string | null
          resolved_by: string | null
          severity: string
          status: string
        }
        Insert: {
          acknowledged_at?: string | null
          acknowledged_by?: string | null
          admin_notes?: string | null
          alert_type: string
          app_id: string
          created_at?: string
          customer_id: string
          detail?: Json | null
          detected_at?: string
          id?: string
          reason: string
          resolved_at?: string | null
          resolved_by?: string | null
          severity: string
          status?: string
        }
        Update: {
          acknowledged_at?: string | null
          acknowledged_by?: string | null
          admin_notes?: string | null
          alert_type?: string
          app_id?: string
          created_at?: string
          customer_id?: string
          detail?: Json | null
          detected_at?: string
          id?: string
          reason?: string
          resolved_at?: string | null
          resolved_by?: string | null
          severity?: string
          status?: string
        }
        Relationships: []
      }
      debacu_eval_usage_metrics: {
        Row: {
          app_id: string
          created_at: string
          customer_id: string
          id: string
          metric_type: string
          metric_value: number
          period: string
          window_end: string
          window_start: string
        }
        Insert: {
          app_id: string
          created_at?: string
          customer_id: string
          id?: string
          metric_type: string
          metric_value: number
          period: string
          window_end: string
          window_start: string
        }
        Update: {
          app_id?: string
          created_at?: string
          customer_id?: string
          id?: string
          metric_type?: string
          metric_value?: number
          period?: string
          window_end?: string
          window_start?: string
        }
        Relationships: []
      }
      debacu_evaluations: {
        Row: {
          adr_real_snapshot: number | null
          adr_reference: number | null
          comment: string | null
          created_at: string | null
          creator_customer_id: string | null
          creator_customer_name: string | null
          creator_customer_uuid: string | null
          customer_id: string
          document: string
          document_norm: string | null
          economic_impact_gross: number | null
          economic_net_loss: number | null
          economic_recovered: number | null
          email: string | null
          email_norm: string | null
          evaluation_date: string | null
          full_name: string
          hotel_category: number | null
          id: string
          identity_key: string | null
          impact_items: Json | null
          incident_type: string | null
          nationality: string | null
          org_id: string | null
          phone: string | null
          phone_digits: string | null
          platform: string | null
          property_code: string | null
          property_id: string
          rating: number
          season_applied: string | null
          updated_at: string | null
        }
        Insert: {
          adr_real_snapshot?: number | null
          adr_reference?: number | null
          comment?: string | null
          created_at?: string | null
          creator_customer_id?: string | null
          creator_customer_name?: string | null
          creator_customer_uuid?: string | null
          customer_id: string
          document: string
          document_norm?: string | null
          economic_impact_gross?: number | null
          economic_net_loss?: number | null
          economic_recovered?: number | null
          email?: string | null
          email_norm?: string | null
          evaluation_date?: string | null
          full_name: string
          hotel_category?: number | null
          id?: string
          identity_key?: string | null
          impact_items?: Json | null
          incident_type?: string | null
          nationality?: string | null
          org_id?: string | null
          phone?: string | null
          phone_digits?: string | null
          platform?: string | null
          property_code?: string | null
          property_id: string
          rating: number
          season_applied?: string | null
          updated_at?: string | null
        }
        Update: {
          adr_real_snapshot?: number | null
          adr_reference?: number | null
          comment?: string | null
          created_at?: string | null
          creator_customer_id?: string | null
          creator_customer_name?: string | null
          creator_customer_uuid?: string | null
          customer_id?: string
          document?: string
          document_norm?: string | null
          economic_impact_gross?: number | null
          economic_net_loss?: number | null
          economic_recovered?: number | null
          email?: string | null
          email_norm?: string | null
          evaluation_date?: string | null
          full_name?: string
          hotel_category?: number | null
          id?: string
          identity_key?: string | null
          impact_items?: Json | null
          incident_type?: string | null
          nationality?: string | null
          org_id?: string | null
          phone?: string | null
          phone_digits?: string | null
          platform?: string | null
          property_code?: string | null
          property_id?: string
          rating?: number
          season_applied?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      debacu_evaluations_backup_20260207: {
        Row: {
          comment: string | null
          created_at: string | null
          creator_customer_id: string | null
          creator_customer_name: string | null
          document: string | null
          email: string | null
          evaluation_date: string | null
          full_name: string | null
          id: string | null
          nationality: string | null
          phone: string | null
          platform: string | null
          rating: number | null
          updated_at: string | null
        }
        Insert: {
          comment?: string | null
          created_at?: string | null
          creator_customer_id?: string | null
          creator_customer_name?: string | null
          document?: string | null
          email?: string | null
          evaluation_date?: string | null
          full_name?: string | null
          id?: string | null
          nationality?: string | null
          phone?: string | null
          platform?: string | null
          rating?: number | null
          updated_at?: string | null
        }
        Update: {
          comment?: string | null
          created_at?: string | null
          creator_customer_id?: string | null
          creator_customer_name?: string | null
          document?: string | null
          email?: string | null
          evaluation_date?: string | null
          full_name?: string | null
          id?: string | null
          nationality?: string | null
          phone?: string | null
          platform?: string | null
          rating?: number | null
          updated_at?: string | null
        }
        Relationships: []
      }
      debacu_evaluations_backup_20260209: {
        Row: {
          adr_real_snapshot: number | null
          adr_reference: number | null
          comment: string | null
          created_at: string | null
          creator_customer_id: string | null
          creator_customer_name: string | null
          creator_customer_uuid: string | null
          document: string | null
          economic_impact_gross: number | null
          economic_net_loss: number | null
          economic_recovered: number | null
          email: string | null
          evaluation_date: string | null
          full_name: string | null
          hotel_category: number | null
          id: string | null
          impact_items: Json | null
          incident_type: string | null
          nationality: string | null
          phone: string | null
          platform: string | null
          rating: number | null
          season_applied: string | null
          updated_at: string | null
        }
        Insert: {
          adr_real_snapshot?: number | null
          adr_reference?: number | null
          comment?: string | null
          created_at?: string | null
          creator_customer_id?: string | null
          creator_customer_name?: string | null
          creator_customer_uuid?: string | null
          document?: string | null
          economic_impact_gross?: number | null
          economic_net_loss?: number | null
          economic_recovered?: number | null
          email?: string | null
          evaluation_date?: string | null
          full_name?: string | null
          hotel_category?: number | null
          id?: string | null
          impact_items?: Json | null
          incident_type?: string | null
          nationality?: string | null
          phone?: string | null
          platform?: string | null
          rating?: number | null
          season_applied?: string | null
          updated_at?: string | null
        }
        Update: {
          adr_real_snapshot?: number | null
          adr_reference?: number | null
          comment?: string | null
          created_at?: string | null
          creator_customer_id?: string | null
          creator_customer_name?: string | null
          creator_customer_uuid?: string | null
          document?: string | null
          economic_impact_gross?: number | null
          economic_net_loss?: number | null
          economic_recovered?: number | null
          email?: string | null
          evaluation_date?: string | null
          full_name?: string | null
          hotel_category?: number | null
          id?: string | null
          impact_items?: Json | null
          incident_type?: string | null
          nationality?: string | null
          phone?: string | null
          platform?: string | null
          rating?: number | null
          season_applied?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      debacu_evaluations_count: {
        Row: {
          id: number
          total_count: number
        }
        Insert: {
          id?: number
          total_count?: number
        }
        Update: {
          id?: number
          total_count?: number
        }
        Relationships: []
      }
      debacu_evaluations_counter: {
        Row: {
          id: number
          total_count: number
        }
        Insert: {
          id?: number
          total_count?: number
        }
        Update: {
          id?: number
          total_count?: number
        }
        Relationships: []
      }
      debacu_hotel_incident_custom: {
        Row: {
          customer_id: string
          default_gross_max: number | null
          default_gross_min: number | null
          default_recovery_pct: number | null
          description: string | null
          id: string
          incident_type: string
          is_active: boolean
          severity: number | null
          suggested_actions: string | null
          title: string
          updated_at: string
        }
        Insert: {
          customer_id: string
          default_gross_max?: number | null
          default_gross_min?: number | null
          default_recovery_pct?: number | null
          description?: string | null
          id?: string
          incident_type: string
          is_active?: boolean
          severity?: number | null
          suggested_actions?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          customer_id?: string
          default_gross_max?: number | null
          default_gross_min?: number | null
          default_recovery_pct?: number | null
          description?: string | null
          id?: string
          incident_type?: string
          is_active?: boolean
          severity?: number | null
          suggested_actions?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "debacu_hotel_incident_custom_customer_fk"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "debacu_hotel_incident_custom_customer_fk"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "v_customer_profile_status"
            referencedColumns: ["customer_id"]
          },
        ]
      }
      debacu_hotel_incident_overrides: {
        Row: {
          customer_id: string
          default_gross_max_override: number | null
          default_gross_min_override: number | null
          default_recovery_pct_override: number | null
          description_override: string | null
          id: string
          incident_type: string
          is_active: boolean
          severity_override: number | null
          suggested_actions_override: string | null
          title_override: string | null
          updated_at: string
        }
        Insert: {
          customer_id: string
          default_gross_max_override?: number | null
          default_gross_min_override?: number | null
          default_recovery_pct_override?: number | null
          description_override?: string | null
          id?: string
          incident_type: string
          is_active?: boolean
          severity_override?: number | null
          suggested_actions_override?: string | null
          title_override?: string | null
          updated_at?: string
        }
        Update: {
          customer_id?: string
          default_gross_max_override?: number | null
          default_gross_min_override?: number | null
          default_recovery_pct_override?: number | null
          description_override?: string | null
          id?: string
          incident_type?: string
          is_active?: boolean
          severity_override?: number | null
          suggested_actions_override?: string | null
          title_override?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "debacu_hotel_incident_overrides_customer_fk"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "debacu_hotel_incident_overrides_customer_fk"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "v_customer_profile_status"
            referencedColumns: ["customer_id"]
          },
        ]
      }
      debacu_hotel_incident_pricing: {
        Row: {
          customer_id: string
          gross_max_override: number | null
          gross_min_override: number | null
          id: string
          incident_type: string | null
          is_active: boolean
          item_code: string | null
          notes: string | null
          recovery_pct_override: number | null
          unit_price_override: number | null
          updated_at: string
        }
        Insert: {
          customer_id: string
          gross_max_override?: number | null
          gross_min_override?: number | null
          id?: string
          incident_type?: string | null
          is_active?: boolean
          item_code?: string | null
          notes?: string | null
          recovery_pct_override?: number | null
          unit_price_override?: number | null
          updated_at?: string
        }
        Update: {
          customer_id?: string
          gross_max_override?: number | null
          gross_min_override?: number | null
          id?: string
          incident_type?: string | null
          is_active?: boolean
          item_code?: string | null
          notes?: string | null
          recovery_pct_override?: number | null
          unit_price_override?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "debacu_hotel_incident_pricing_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "debacu_hotel_incident_pricing_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "v_customer_profile_status"
            referencedColumns: ["customer_id"]
          },
          {
            foreignKeyName: "debacu_hotel_incident_pricing_incident_type_fkey"
            columns: ["incident_type"]
            isOneToOne: false
            referencedRelation: "debacu_incident_catalog"
            referencedColumns: ["incident_type"]
          },
          {
            foreignKeyName: "debacu_hotel_incident_pricing_item_code_fkey"
            columns: ["item_code"]
            isOneToOne: false
            referencedRelation: "debacu_item_catalog"
            referencedColumns: ["item_code"]
          },
          {
            foreignKeyName: "debacu_hotel_incident_pricing_item_code_fkey"
            columns: ["item_code"]
            isOneToOne: false
            referencedRelation: "debacu_item_catalog_effective"
            referencedColumns: ["item_code"]
          },
        ]
      }
      debacu_hotel_item_catalog: {
        Row: {
          category: string
          currency: string
          customer_id: string
          description: string | null
          id: string
          is_active: boolean
          item_code: string
          title: string
          unit_price: number
          updated_at: string
        }
        Insert: {
          category: string
          currency?: string
          customer_id: string
          description?: string | null
          id?: string
          is_active?: boolean
          item_code: string
          title: string
          unit_price: number
          updated_at?: string
        }
        Update: {
          category?: string
          currency?: string
          customer_id?: string
          description?: string | null
          id?: string
          is_active?: boolean
          item_code?: string
          title?: string
          unit_price?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "debacu_hotel_item_catalog_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "debacu_hotel_item_catalog_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "v_customer_profile_status"
            referencedColumns: ["customer_id"]
          },
        ]
      }
      debacu_hotel_profile: {
        Row: {
          adr_real: number | null
          customer_id: string
          hotel_category: number
          monthly_stays_estimated: number | null
          season_mult_high: number
          season_mult_low: number
          updated_at: string
        }
        Insert: {
          adr_real?: number | null
          customer_id: string
          hotel_category: number
          monthly_stays_estimated?: number | null
          season_mult_high?: number
          season_mult_low?: number
          updated_at?: string
        }
        Update: {
          adr_real?: number | null
          customer_id?: string
          hotel_category?: number
          monthly_stays_estimated?: number | null
          season_mult_high?: number
          season_mult_low?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "debacu_hotel_profile_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: true
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "debacu_hotel_profile_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: true
            referencedRelation: "v_customer_profile_status"
            referencedColumns: ["customer_id"]
          },
        ]
      }
      debacu_identity_links: {
        Row: {
          created_at: string | null
          identity_key_a: string
          identity_key_b: string
          reason: string
        }
        Insert: {
          created_at?: string | null
          identity_key_a: string
          identity_key_b: string
          reason: string
        }
        Update: {
          created_at?: string | null
          identity_key_a?: string
          identity_key_b?: string
          reason?: string
        }
        Relationships: []
      }
      debacu_incident_catalog: {
        Row: {
          default_gross_max: number | null
          default_gross_min: number | null
          default_recovery_pct: number | null
          description: string | null
          incident_type: string
          is_active: boolean
          severity: number
          suggested_actions: string | null
          title: string
          updated_at: string
        }
        Insert: {
          default_gross_max?: number | null
          default_gross_min?: number | null
          default_recovery_pct?: number | null
          description?: string | null
          incident_type: string
          is_active?: boolean
          severity?: number
          suggested_actions?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          default_gross_max?: number | null
          default_gross_min?: number | null
          default_recovery_pct?: number | null
          description?: string | null
          incident_type?: string
          is_active?: boolean
          severity?: number
          suggested_actions?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      debacu_item_catalog: {
        Row: {
          category: string
          currency: string
          description: string | null
          is_active: boolean
          item_code: string
          title: string
          unit_price: number
          updated_at: string
        }
        Insert: {
          category?: string
          currency?: string
          description?: string | null
          is_active?: boolean
          item_code: string
          title: string
          unit_price?: number
          updated_at?: string
        }
        Update: {
          category?: string
          currency?: string
          description?: string | null
          is_active?: boolean
          item_code?: string
          title?: string
          unit_price?: number
          updated_at?: string
        }
        Relationships: []
      }
      debacu_platform_map: {
        Row: {
          channel_group: string
          channel_type: string
          created_at: string
          display_name: string
          id: number
          is_active: boolean
          pattern: string
          priority: number
        }
        Insert: {
          channel_group: string
          channel_type: string
          created_at?: string
          display_name: string
          id?: number
          is_active?: boolean
          pattern: string
          priority?: number
        }
        Update: {
          channel_group?: string
          channel_type?: string
          created_at?: string
          display_name?: string
          id?: number
          is_active?: boolean
          pattern?: string
          priority?: number
        }
        Relationships: []
      }
      import_jobs: {
        Row: {
          created_at: string | null
          file_hash: string | null
          file_path: string
          id: string
          invalid_rows: number | null
          org_id: string
          profile_id: string | null
          property_id: string | null
          run_id: string | null
          run_type: string
          status: string
          summary: Json | null
          total_rows: number | null
          updated_at: string | null
          user_id: string
          valid_rows: number | null
        }
        Insert: {
          created_at?: string | null
          file_hash?: string | null
          file_path: string
          id?: string
          invalid_rows?: number | null
          org_id: string
          profile_id?: string | null
          property_id?: string | null
          run_id?: string | null
          run_type: string
          status?: string
          summary?: Json | null
          total_rows?: number | null
          updated_at?: string | null
          user_id: string
          valid_rows?: number | null
        }
        Update: {
          created_at?: string | null
          file_hash?: string | null
          file_path?: string
          id?: string
          invalid_rows?: number | null
          org_id?: string
          profile_id?: string | null
          property_id?: string | null
          run_id?: string | null
          run_type?: string
          status?: string
          summary?: Json | null
          total_rows?: number | null
          updated_at?: string | null
          user_id?: string
          valid_rows?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "import_jobs_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "import_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "import_jobs_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "debacu_eval_properties"
            referencedColumns: ["id"]
          },
        ]
      }
      import_profiles: {
        Row: {
          created_at: string | null
          date_format: string | null
          decimal_separator: string | null
          delimiter: string | null
          disabled_fields: string[] | null
          encoding: string | null
          id: string
          identity_strategy: string
          mapping: Json
          name: string
          org_id: string
          source_type: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          date_format?: string | null
          decimal_separator?: string | null
          delimiter?: string | null
          disabled_fields?: string[] | null
          encoding?: string | null
          id?: string
          identity_strategy: string
          mapping: Json
          name: string
          org_id: string
          source_type: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          date_format?: string | null
          decimal_separator?: string | null
          delimiter?: string | null
          disabled_fields?: string[] | null
          encoding?: string | null
          id?: string
          identity_strategy?: string
          mapping?: Json
          name?: string
          org_id?: string
          source_type?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      plans: {
        Row: {
          app_id: string | null
          code: string | null
          extra_config: Json | null
          id: string
          max_queries_per_month: number | null
          max_users: number
          name: string
          price_monthly: number | null
          price_yearly: number | null
          updated_at: string | null
        }
        Insert: {
          app_id?: string | null
          code?: string | null
          extra_config?: Json | null
          id?: string
          max_queries_per_month?: number | null
          max_users?: number
          name: string
          price_monthly?: number | null
          price_yearly?: number | null
          updated_at?: string | null
        }
        Update: {
          app_id?: string | null
          code?: string | null
          extra_config?: Json | null
          id?: string
          max_queries_per_month?: number | null
          max_users?: number
          name?: string
          price_monthly?: number | null
          price_yearly?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "plans_appId_fkey"
            columns: ["app_id"]
            isOneToOne: false
            referencedRelation: "apps"
            referencedColumns: ["id"]
          },
        ]
      }
      public_contact_requests: {
        Row: {
          company: string | null
          created_at: string
          email: string
          error_detail: string | null
          id: string
          message: string
          name: string
          phone: string | null
          sent_at: string | null
          source: string
          status: string
        }
        Insert: {
          company?: string | null
          created_at?: string
          email: string
          error_detail?: string | null
          id?: string
          message: string
          name: string
          phone?: string | null
          sent_at?: string | null
          source?: string
          status?: string
        }
        Update: {
          company?: string | null
          created_at?: string
          email?: string
          error_detail?: string | null
          id?: string
          message?: string
          name?: string
          phone?: string | null
          sent_at?: string | null
          source?: string
          status?: string
        }
        Relationships: []
      }
      receipts: {
        Row: {
          amount: number | null
          billing_period: string | null
          certificate_used: string | null
          concept: string | null
          current_hash: string | null
          customer_id: string | null
          customer_name: string | null
          date: string | null
          id: string
          invoice_number: string | null
          is_returned: boolean | null
          paid_at: string | null
          parent_receipt_id: string | null
          payment_method: string | null
          payment_reference: string | null
          periodEnd: string | null
          periodStart: string | null
          plan_name: string | null
          previous_invoice_hash: string | null
          product_name: string | null
          receiptNumber: number
          return_date: string | null
          return_reason: string | null
          sepaBatchId: string | null
          signature: string | null
          signature_method: string | null
          status: string | null
          subscription_id: string | null
        }
        Insert: {
          amount?: number | null
          billing_period?: string | null
          certificate_used?: string | null
          concept?: string | null
          current_hash?: string | null
          customer_id?: string | null
          customer_name?: string | null
          date?: string | null
          id?: string
          invoice_number?: string | null
          is_returned?: boolean | null
          paid_at?: string | null
          parent_receipt_id?: string | null
          payment_method?: string | null
          payment_reference?: string | null
          periodEnd?: string | null
          periodStart?: string | null
          plan_name?: string | null
          previous_invoice_hash?: string | null
          product_name?: string | null
          receiptNumber?: never
          return_date?: string | null
          return_reason?: string | null
          sepaBatchId?: string | null
          signature?: string | null
          signature_method?: string | null
          status?: string | null
          subscription_id?: string | null
        }
        Update: {
          amount?: number | null
          billing_period?: string | null
          certificate_used?: string | null
          concept?: string | null
          current_hash?: string | null
          customer_id?: string | null
          customer_name?: string | null
          date?: string | null
          id?: string
          invoice_number?: string | null
          is_returned?: boolean | null
          paid_at?: string | null
          parent_receipt_id?: string | null
          payment_method?: string | null
          payment_reference?: string | null
          periodEnd?: string | null
          periodStart?: string | null
          plan_name?: string | null
          previous_invoice_hash?: string | null
          product_name?: string | null
          receiptNumber?: never
          return_date?: string | null
          return_reason?: string | null
          sepaBatchId?: string | null
          signature?: string | null
          signature_method?: string | null
          status?: string | null
          subscription_id?: string | null
        }
        Relationships: []
      }
      screening_alerts: {
        Row: {
          alert_type: string
          code: string | null
          created_at: string | null
          id: string
          identity_key: string
          message: string | null
          meta: Json | null
          org_id: string
          property_id: string | null
          resolved_at: string | null
          row_number: number | null
          run_id: string
          severity: string | null
        }
        Insert: {
          alert_type: string
          code?: string | null
          created_at?: string | null
          id?: string
          identity_key: string
          message?: string | null
          meta?: Json | null
          org_id: string
          property_id?: string | null
          resolved_at?: string | null
          row_number?: number | null
          run_id: string
          severity?: string | null
        }
        Update: {
          alert_type?: string
          code?: string | null
          created_at?: string | null
          id?: string
          identity_key?: string
          message?: string | null
          meta?: Json | null
          org_id?: string
          property_id?: string | null
          resolved_at?: string | null
          row_number?: number | null
          run_id?: string
          severity?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "screening_alerts_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "debacu_eval_properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "screening_alerts_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "screening_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      screening_results: {
        Row: {
          checkin_date: string | null
          computed_at: string | null
          days_since_last: number | null
          delta_incidents_count: number | null
          delta_total_net_loss: number | null
          id: string
          identity_key: string
          incidents_count: number | null
          last_incident_date: string | null
          match_basis: string | null
          match_confidence: string | null
          org_id: string
          prev_risk_band: string | null
          property_id: string | null
          risk_band: string
          risk_band_changed: boolean | null
          row_number: number | null
          run_id: string
          total_net_loss: number | null
        }
        Insert: {
          checkin_date?: string | null
          computed_at?: string | null
          days_since_last?: number | null
          delta_incidents_count?: number | null
          delta_total_net_loss?: number | null
          id?: string
          identity_key: string
          incidents_count?: number | null
          last_incident_date?: string | null
          match_basis?: string | null
          match_confidence?: string | null
          org_id: string
          prev_risk_band?: string | null
          property_id?: string | null
          risk_band: string
          risk_band_changed?: boolean | null
          row_number?: number | null
          run_id: string
          total_net_loss?: number | null
        }
        Update: {
          checkin_date?: string | null
          computed_at?: string | null
          days_since_last?: number | null
          delta_incidents_count?: number | null
          delta_total_net_loss?: number | null
          id?: string
          identity_key?: string
          incidents_count?: number | null
          last_incident_date?: string | null
          match_basis?: string | null
          match_confidence?: string | null
          org_id?: string
          prev_risk_band?: string | null
          property_id?: string | null
          risk_band?: string
          risk_band_changed?: boolean | null
          row_number?: number | null
          run_id?: string
          total_net_loss?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "screening_results_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "debacu_eval_properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "screening_results_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "screening_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      screening_runs: {
        Row: {
          created_at: string | null
          created_by: string | null
          finished_at: string | null
          high_count: number | null
          id: string
          import_job_id: string | null
          low_count: number | null
          medium_count: number | null
          org_id: string
          params: Json | null
          property_id: string | null
          run_type: string
          source_ref: string | null
          started_at: string | null
          status: string
          total_analyzed: number | null
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          finished_at?: string | null
          high_count?: number | null
          id?: string
          import_job_id?: string | null
          low_count?: number | null
          medium_count?: number | null
          org_id: string
          params?: Json | null
          property_id?: string | null
          run_type: string
          source_ref?: string | null
          started_at?: string | null
          status?: string
          total_analyzed?: number | null
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          finished_at?: string | null
          high_count?: number | null
          id?: string
          import_job_id?: string | null
          low_count?: number | null
          medium_count?: number | null
          org_id?: string
          params?: Json | null
          property_id?: string | null
          run_type?: string
          source_ref?: string | null
          started_at?: string | null
          status?: string
          total_analyzed?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "screening_runs_import_job_id_fkey"
            columns: ["import_job_id"]
            isOneToOne: false
            referencedRelation: "import_jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "screening_runs_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "debacu_eval_properties"
            referencedColumns: ["id"]
          },
        ]
      }
      sectors: {
        Row: {
          id: string
          name: string | null
          plans: Json | null
        }
        Insert: {
          id: string
          name?: string | null
          plans?: Json | null
        }
        Update: {
          id?: string
          name?: string | null
          plans?: Json | null
        }
        Relationships: []
      }
      sepa_batches: {
        Row: {
          batchnumber: number
          createdat: string
          fromdate: string
          id: string
          numreceipts: number
          sentdate: string | null
          status: string
          todate: string
          totalamount: number
          xmlcontent: string
          xmlfileurl: string | null
        }
        Insert: {
          batchnumber?: never
          createdat?: string
          fromdate: string
          id?: string
          numreceipts: number
          sentdate?: string | null
          status: string
          todate: string
          totalamount: number
          xmlcontent: string
          xmlfileurl?: string | null
        }
        Update: {
          batchnumber?: never
          createdat?: string
          fromdate?: string
          id?: string
          numreceipts?: number
          sentdate?: string | null
          status?: string
          todate?: string
          totalamount?: number
          xmlcontent?: string
          xmlfileurl?: string | null
        }
        Relationships: []
      }
      settings_audit_log: {
        Row: {
          action: string
          changed_at: string
          changed_by: string | null
          id: string
          new_values: Json | null
          old_values: Json | null
          record_id: string | null
          table_name: string
        }
        Insert: {
          action: string
          changed_at?: string
          changed_by?: string | null
          id?: string
          new_values?: Json | null
          old_values?: Json | null
          record_id?: string | null
          table_name: string
        }
        Update: {
          action?: string
          changed_at?: string
          changed_by?: string | null
          id?: string
          new_values?: Json | null
          old_values?: Json | null
          record_id?: string | null
          table_name?: string
        }
        Relationships: []
      }
      subscription_events: {
        Row: {
          app_id: string | null
          created_at: string
          customer_id: string | null
          customer_id_uuid: string | null
          id: string
          payload: Json | null
          stripe_customer_id: string | null
          stripe_event_id: string
          stripe_subscription_id: string | null
          type: string
        }
        Insert: {
          app_id?: string | null
          created_at?: string
          customer_id?: string | null
          customer_id_uuid?: string | null
          id?: string
          payload?: Json | null
          stripe_customer_id?: string | null
          stripe_event_id: string
          stripe_subscription_id?: string | null
          type: string
        }
        Update: {
          app_id?: string | null
          created_at?: string
          customer_id?: string | null
          customer_id_uuid?: string | null
          id?: string
          payload?: Json | null
          stripe_customer_id?: string | null
          stripe_event_id?: string
          stripe_subscription_id?: string | null
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "subscription_events_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscription_events_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "v_customer_profile_status"
            referencedColumns: ["customer_id"]
          },
        ]
      }
      subscriptions: {
        Row: {
          app_id: string
          billing_frequency: string
          created_at: string
          customer_id: string
          end_date: string | null
          extra_seats: number
          grace_ends_at: string | null
          id: string
          next_billing_date: string | null
          plan_id: string
          provider: string | null
          provider_checkout_id: string | null
          provider_subscription_id: string | null
          replaces_subscription_id: string | null
          required_billing_frequency: string | null
          required_plan_code: string | null
          start_date: string
          status: string
          stripe_checkout_session_id: string | null
          stripe_customer_id: string | null
          stripe_price_id: string | null
          stripe_schedule_id: string | null
          stripe_seat_price_id: string | null
          stripe_seat_subscription_item_id: string | null
          stripe_subscription_id: string | null
          suspended_at: string | null
          trial_ends_at: string | null
          updated_at: string
        }
        Insert: {
          app_id: string
          billing_frequency: string
          created_at?: string
          customer_id: string
          end_date?: string | null
          extra_seats?: number
          grace_ends_at?: string | null
          id?: string
          next_billing_date?: string | null
          plan_id: string
          provider?: string | null
          provider_checkout_id?: string | null
          provider_subscription_id?: string | null
          replaces_subscription_id?: string | null
          required_billing_frequency?: string | null
          required_plan_code?: string | null
          start_date?: string
          status: string
          stripe_checkout_session_id?: string | null
          stripe_customer_id?: string | null
          stripe_price_id?: string | null
          stripe_schedule_id?: string | null
          stripe_seat_price_id?: string | null
          stripe_seat_subscription_item_id?: string | null
          stripe_subscription_id?: string | null
          suspended_at?: string | null
          trial_ends_at?: string | null
          updated_at?: string
        }
        Update: {
          app_id?: string
          billing_frequency?: string
          created_at?: string
          customer_id?: string
          end_date?: string | null
          extra_seats?: number
          grace_ends_at?: string | null
          id?: string
          next_billing_date?: string | null
          plan_id?: string
          provider?: string | null
          provider_checkout_id?: string | null
          provider_subscription_id?: string | null
          replaces_subscription_id?: string | null
          required_billing_frequency?: string | null
          required_plan_code?: string | null
          start_date?: string
          status?: string
          stripe_checkout_session_id?: string | null
          stripe_customer_id?: string | null
          stripe_price_id?: string | null
          stripe_schedule_id?: string | null
          stripe_seat_price_id?: string | null
          stripe_seat_subscription_item_id?: string | null
          stripe_subscription_id?: string | null
          suspended_at?: string | null
          trial_ends_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "subscriptions_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscriptions_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "v_customer_profile_status"
            referencedColumns: ["customer_id"]
          },
          {
            foreignKeyName: "subscriptions_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscriptions_replaces_subscription_id_fkey"
            columns: ["replaces_subscription_id"]
            isOneToOne: false
            referencedRelation: "subscriptions"
            referencedColumns: ["id"]
          },
        ]
      }
      users: {
        Row: {
          id: string
          name: string | null
          permissions: string[] | null
          pin: string | null
          role: string | null
        }
        Insert: {
          id: string
          name?: string | null
          permissions?: string[] | null
          pin?: string | null
          role?: string | null
        }
        Update: {
          id?: string
          name?: string | null
          permissions?: string[] | null
          pin?: string | null
          role?: string | null
        }
        Relationships: []
      }
      watchlist_reservations: {
        Row: {
          channel: string | null
          checkin_date: string
          checkout_date: string | null
          created_at: string | null
          currency: string | null
          first_seen_at: string | null
          id: string
          identity_key: string
          last_seen_at: string | null
          org_id: string
          reservation_ref: string | null
          status: string | null
          total_amount: number | null
          updated_at: string | null
        }
        Insert: {
          channel?: string | null
          checkin_date: string
          checkout_date?: string | null
          created_at?: string | null
          currency?: string | null
          first_seen_at?: string | null
          id?: string
          identity_key: string
          last_seen_at?: string | null
          org_id: string
          reservation_ref?: string | null
          status?: string | null
          total_amount?: number | null
          updated_at?: string | null
        }
        Update: {
          channel?: string | null
          checkin_date?: string
          checkout_date?: string | null
          created_at?: string | null
          currency?: string | null
          first_seen_at?: string | null
          id?: string
          identity_key?: string
          last_seen_at?: string | null
          org_id?: string
          reservation_ref?: string | null
          status?: string | null
          total_amount?: number | null
          updated_at?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      abuse_settings_audit_grouped: {
        Row: {
          abuse_settings_id: string | null
          actor_name: string | null
          changes: string | null
          changes_count: number | null
          created_at: string | null
        }
        Relationships: []
      }
      abuse_settings_audit_human: {
        Row: {
          abuse_settings_id: string | null
          actor_name: string | null
          after_value: Json | null
          audit_id: string | null
          before_value: Json | null
          created_at: string | null
          field_name: string | null
        }
        Relationships: []
      }
      abuse_settings_audit_pretty: {
        Row: {
          abuse_settings_id: string | null
          actor_name: string | null
          after_text: string | null
          audit_id: string | null
          before_text: string | null
          created_at: string | null
          field_name: string | null
        }
        Relationships: []
      }
      admin_audit_all: {
        Row: {
          app_id: string | null
          created_at: string | null
          customer_id: string | null
          id: string | null
          payload: Json | null
          source: string | null
          stripe_subscription_id: string | null
          type: string | null
        }
        Relationships: []
      }
      debacu_eval_admin_users_v: {
        Row: {
          user_id: string | null
        }
        Insert: {
          user_id?: string | null
        }
        Update: {
          user_id?: string | null
        }
        Relationships: []
      }
      debacu_eval_audit_exports_with_downloads: {
        Row: {
          created_at: string | null
          delivered_to_name: string | null
          delivered_to_org: string | null
          delivered_to_reason: string | null
          delivered_to_reference: string | null
          download_count: number | null
          file_bytes: number | null
          file_sha256: string | null
          filter_customer: string | null
          filter_from: string | null
          filter_source: string | null
          filter_to: string | null
          filter_type: string | null
          format: string | null
          generated_by_email: string | null
          generated_by_user_id: string | null
          id: string | null
          last_download_at: string | null
          meta: Json | null
          row_count: number | null
          storage_bucket: string | null
          storage_path: string | null
        }
        Relationships: []
      }
      debacu_eval_audit_exports_with_last_download: {
        Row: {
          created_at: string | null
          delivered_to_name: string | null
          delivered_to_org: string | null
          delivered_to_reason: string | null
          delivered_to_reference: string | null
          download_count: number | null
          file_bytes: number | null
          file_sha256: string | null
          filter_customer: string | null
          filter_from: string | null
          filter_source: string | null
          filter_to: string | null
          filter_type: string | null
          format: string | null
          generated_by_email: string | null
          generated_by_user_id: string | null
          id: string | null
          last_download_at: string | null
          last_download_ip: unknown
          last_download_user_agent: string | null
          last_downloaded_by: string | null
          last_downloaded_by_email: string | null
          meta: Json | null
          org_id: string | null
          row_count: number | null
          status: string | null
          storage_bucket: string | null
          storage_path: string | null
        }
        Relationships: [
          {
            foreignKeyName: "debacu_eval_audit_exports_org_fk"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "debacu_eval_org_entitlements_v"
            referencedColumns: ["org_id"]
          },
          {
            foreignKeyName: "debacu_eval_audit_exports_org_fk"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "debacu_eval_organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      debacu_eval_audit_timeline_v: {
        Row: {
          actor_user_id: string | null
          event_family: string | null
          event_id: string | null
          event_payload: Json | null
          identity_key: string | null
          occurred_at: string | null
          org_id: string | null
          property_id: string | null
          risk_level:
            | Database["public"]["Enums"]["debacu_eval_risk_level"]
            | null
        }
        Relationships: []
      }
      debacu_eval_country_summary: {
        Row: {
          cnt: number | null
          country: string | null
        }
        Relationships: []
      }
      debacu_eval_evaluations_norm_v: {
        Row: {
          adr_real_snapshot: number | null
          adr_reference: number | null
          channel_group: string | null
          channel_type: string | null
          comment: string | null
          created_at: string | null
          creator_customer_id: string | null
          creator_customer_name: string | null
          creator_customer_uuid: string | null
          customer_id: string | null
          document: string | null
          economic_impact_gross: number | null
          economic_net_loss: number | null
          economic_recovered: number | null
          email: string | null
          evaluation_date: string | null
          full_name: string | null
          hotel_category: number | null
          id: string | null
          impact_items: Json | null
          incident_type: string | null
          nationality: string | null
          phone: string | null
          platform: string | null
          platform_display: string | null
          platform_key: string | null
          rating: number | null
          season_applied: string | null
          updated_at: string | null
        }
        Relationships: []
      }
      debacu_eval_global_risk_snapshot_v: {
        Row: {
          pct_alto: number | null
          pct_bajo: number | null
          pct_medio: number | null
          pct1: number | null
          pct2: number | null
          pct3: number | null
          pct4: number | null
          pct5: number | null
          total: number | null
        }
        Relationships: []
      }
      debacu_eval_inventory_base_v: {
        Row: {
          org_id: string | null
          property_id: string | null
          rooms_available_base: number | null
        }
        Relationships: [
          {
            foreignKeyName: "debacu_eval_property_room_types_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "debacu_eval_org_entitlements_v"
            referencedColumns: ["org_id"]
          },
          {
            foreignKeyName: "debacu_eval_property_room_types_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "debacu_eval_organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "debacu_eval_property_room_types_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "debacu_eval_properties"
            referencedColumns: ["id"]
          },
        ]
      }
      debacu_eval_inventory_daily_v: {
        Row: {
          org_id: string | null
          property_id: string | null
          rooms_available: number | null
          stay_date: string | null
        }
        Relationships: [
          {
            foreignKeyName: "debacu_eval_revenue_daily_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "debacu_eval_org_entitlements_v"
            referencedColumns: ["org_id"]
          },
          {
            foreignKeyName: "debacu_eval_revenue_daily_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "debacu_eval_organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "debacu_eval_revenue_daily_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "debacu_eval_properties"
            referencedColumns: ["id"]
          },
        ]
      }
      debacu_eval_org_entitlements_v: {
        Row: {
          customer_id: string | null
          extra_seats: number | null
          max_users: number | null
          org_id: string | null
          plan_code: string | null
          seats_available: number | null
          seats_total: number | null
          seats_used: number | null
          subscription_status: string | null
        }
        Relationships: [
          {
            foreignKeyName: "debacu_eval_organizations_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "debacu_eval_organizations_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "v_customer_profile_status"
            referencedColumns: ["customer_id"]
          },
        ]
      }
      debacu_eval_platform_summary: {
        Row: {
          cnt: number | null
          platform: string | null
        }
        Relationships: []
      }
      debacu_eval_property_calendar_context_v: {
        Row: {
          calendar_date: string | null
          color: string | null
          impact_level: string | null
          item_type: string | null
          name: string | null
          org_id: string | null
          pricing_adjustment_type: string | null
          pricing_adjustment_value: number | null
          pricing_operation: string | null
          priority: number | null
          property_id: string | null
          source_id: string | null
          source_type: string | null
        }
        Relationships: []
      }
      debacu_eval_revenue_daily_property_v: {
        Row: {
          adr: number | null
          org_id: string | null
          property_id: string | null
          revenue_rooms: number | null
          revenue_total: number | null
          rooms_sold: number | null
          stay_date: string | null
        }
        Relationships: [
          {
            foreignKeyName: "debacu_eval_revenue_daily_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "debacu_eval_org_entitlements_v"
            referencedColumns: ["org_id"]
          },
          {
            foreignKeyName: "debacu_eval_revenue_daily_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "debacu_eval_organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "debacu_eval_revenue_daily_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "debacu_eval_properties"
            referencedColumns: ["id"]
          },
        ]
      }
      debacu_eval_revenue_daily_property_with_inventory_v: {
        Row: {
          adr: number | null
          occupancy_pct: number | null
          org_id: string | null
          property_id: string | null
          revenue_rooms: number | null
          revenue_total: number | null
          revpar: number | null
          rooms_available: number | null
          rooms_sold: number | null
          stay_date: string | null
        }
        Relationships: [
          {
            foreignKeyName: "debacu_eval_revenue_daily_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "debacu_eval_org_entitlements_v"
            referencedColumns: ["org_id"]
          },
          {
            foreignKeyName: "debacu_eval_revenue_daily_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "debacu_eval_organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "debacu_eval_revenue_daily_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "debacu_eval_properties"
            referencedColumns: ["id"]
          },
        ]
      }
      debacu_eval_revenue_daily_with_inventory_v: {
        Row: {
          adr: number | null
          occupancy_pct: number | null
          org_id: string | null
          property_id: string | null
          revenue_rooms: number | null
          revpar: number | null
          rooms_available: number | null
          rooms_sold: number | null
          stay_date: string | null
        }
        Relationships: [
          {
            foreignKeyName: "debacu_eval_revenue_daily_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "debacu_eval_org_entitlements_v"
            referencedColumns: ["org_id"]
          },
          {
            foreignKeyName: "debacu_eval_revenue_daily_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "debacu_eval_organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "debacu_eval_revenue_daily_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "debacu_eval_properties"
            referencedColumns: ["id"]
          },
        ]
      }
      debacu_evaluations_enriched: {
        Row: {
          adr_real_snapshot: number | null
          adr_reference: number | null
          channel_display: string | null
          channel_group: string | null
          channel_type: string | null
          comment: string | null
          created_at: string | null
          creator_customer_id: string | null
          creator_customer_name: string | null
          creator_customer_uuid: string | null
          customer_id: string | null
          document: string | null
          economic_impact_gross: number | null
          economic_net_loss: number | null
          economic_recovered: number | null
          email: string | null
          evaluation_date: string | null
          full_name: string | null
          hotel_category: number | null
          id: string | null
          impact_items: Json | null
          incident_type: string | null
          nationality: string | null
          phone: string | null
          platform: string | null
          platform_norm: string | null
          platform_original: string | null
          rating: number | null
          season_applied: string | null
          updated_at: string | null
        }
        Relationships: []
      }
      debacu_item_catalog_effective: {
        Row: {
          category: string | null
          currency: string | null
          customer_id: string | null
          description: string | null
          is_active_effective: boolean | null
          item_code: string | null
          source: string | null
          title: string | null
          unit_price_effective: number | null
        }
        Relationships: [
          {
            foreignKeyName: "debacu_hotel_item_catalog_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "debacu_hotel_item_catalog_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "v_customer_profile_status"
            referencedColumns: ["customer_id"]
          },
        ]
      }
      v_audit_hotel_monthly_by_incident: {
        Row: {
          avg_net_per_case: number | null
          creator_customer_id: string | null
          creator_customer_name: string | null
          gross: number | null
          incident_type: string | null
          month: string | null
          n: number | null
          net_loss: number | null
          recovered: number | null
        }
        Relationships: []
      }
      v_audit_hotel_monthly_incidents_100_stays: {
        Row: {
          customer_id: string | null
          incidents: number | null
          incidents_per_100_stays: number | null
          month: string | null
          monthly_stays_estimated: number | null
          net_loss: number | null
          net_loss_per_stay: number | null
        }
        Relationships: []
      }
      v_audit_hotel_monthly_kpis: {
        Row: {
          creator_customer_id: string | null
          creator_customer_name: string | null
          evaluations_total: number | null
          gross_impact: number | null
          incidents_total: number | null
          month: string | null
          net_loss: number | null
          recovered: number | null
          recovered_pct: number | null
        }
        Relationships: []
      }
      v_customer_audit_exports_with_last_download: {
        Row: {
          app_id: string | null
          created_at: string | null
          error_code: string | null
          error_message: string | null
          export_scope: string | null
          export_type: string | null
          file_size_bytes: number | null
          filters: Json | null
          id: string | null
          last_downloaded_at: string | null
          last_downloaded_by_email: string | null
          org_id: string | null
          period_from: string | null
          period_to: string | null
          requested_by_email: string | null
          requested_by_role: string | null
          requested_by_user_id: string | null
          row_count: number | null
          sha256: string | null
          status: string | null
          storage_bucket: string | null
          storage_path: string | null
        }
        Relationships: []
      }
      v_customer_profile_status: {
        Row: {
          customer_id: string | null
          has_bank_name: boolean | null
          has_billing_email: boolean | null
          has_commercial_name: boolean | null
          has_contact_person: boolean | null
          has_hotel_category: boolean | null
          has_hotel_profile: boolean | null
          has_iban: boolean | null
          has_legal_name: boolean | null
          has_monthly_stays_estimated: boolean | null
          has_nif: boolean | null
          has_season_mult_high: boolean | null
          has_season_mult_low: boolean | null
          has_swift: boolean | null
          is_ready_for_audit: boolean | null
        }
        Relationships: []
      }
      v_hotel_adr_effective: {
        Row: {
          adr_effective: number | null
          adr_real: number | null
          adr_reference: number | null
          customer_id: string | null
          hotel_category: number | null
          monthly_stays_estimated: number | null
          season_mult_high: number | null
          season_mult_low: number | null
          updated_at: string | null
        }
        Relationships: [
          {
            foreignKeyName: "debacu_hotel_profile_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: true
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "debacu_hotel_profile_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: true
            referencedRelation: "v_customer_profile_status"
            referencedColumns: ["customer_id"]
          },
        ]
      }
      v_outlier_hotels: {
        Row: {
          avg_net_loss: number | null
          category_p90: number | null
          creator_customer_id: string | null
          creator_customer_name: string | null
          hotel_category: number | null
          n_incidents: number | null
          vs_p90_ratio: number | null
        }
        Relationships: []
      }
      v_sector_category_incident: {
        Row: {
          avg_net_loss: number | null
          hotel_category: number | null
          incident_type: string | null
          month: string | null
          n: number | null
          p50_net_loss: number | null
          p90_net_loss: number | null
        }
        Relationships: []
      }
      v_top_missing_items: {
        Row: {
          amount_total: number | null
          creator_customer_id: string | null
          creator_customer_name: string | null
          item_code: string | null
          month: string | null
          qty_total: number | null
        }
        Relationships: []
      }
    }
    Functions: {
      activate_pending_subscription: {
        Args: {
          p_pending_id: string
          p_period_end: string
          p_period_start: string
          p_stripe_customer_id: string
          p_stripe_price_id: string
          p_stripe_subscription_id: string
        }
        Returns: undefined
      }
      admin_ack_usage_alert:
        | { Args: { p_id: string; p_note?: string }; Returns: undefined }
        | {
            Args: {
              p_id: string
              p_ip?: string
              p_note?: string
              p_user_agent?: string
            }
            Returns: undefined
          }
      admin_add_usage_alert_note: {
        Args: {
          p_id: string
          p_ip?: string
          p_note: string
          p_user_agent?: string
        }
        Returns: undefined
      }
      admin_audit_export_download_stats: {
        Args: { p_export_id: string }
        Returns: {
          download_count: number
          last_downloaded_at: string
          last_downloaded_by_email: string
        }[]
      }
      admin_get_abuse_settings: {
        Args: never
        Returns: {
          ack_critical_minutes: number
          ack_warning_minutes: number
          id: string
          resolve_critical_minutes: number
          resolve_warning_minutes: number
          updated_at: string
          updated_by: string
        }[]
      }
      admin_get_global_risk_distribution: {
        Args: { p_window_months?: number }
        Returns: {
          c1: number
          c2: number
          c3: number
          c4: number
          c5: number
          total: number
        }[]
      }
      admin_get_usage_alert: {
        Args: { p_id: string }
        Returns: {
          alert_type: string
          customer_id: string
          detail: Json
          detected_at: string
          id: string
          reason: string
          resolved_at: string
          severity: string
          status: string
        }[]
      }
      admin_list_audit_customers: {
        Args: { p_limit?: number; p_q?: string }
        Returns: {
          customer_id: string
          email: string
        }[]
      }
      admin_list_audit_events: {
        Args: {
          p_customer?: string
          p_from?: string
          p_limit?: number
          p_offset?: number
          p_source?: string
          p_to?: string
          p_type?: string
        }
        Returns: {
          app_id: string
          created_at: string
          customer_id: string
          id: string
          payload: Json
          source: string
          stripe_subscription_id: string
          type: string
        }[]
      }
      admin_list_audit_export_downloads: {
        Args: { p_export_id: string; p_limit?: number; p_offset?: number }
        Returns: {
          downloaded_at: string
          downloaded_by_email: string
          downloaded_by_user_id: string
          id: string
          ip: string
          user_agent: string
        }[]
      }
      admin_list_audit_exports: {
        Args: {
          p_customer?: string
          p_format?: string
          p_from?: string
          p_limit?: number
          p_offset?: number
          p_q?: string
          p_to?: string
        }
        Returns: {
          created_at: string
          delivered_to_name: string
          delivered_to_org: string
          delivered_to_reason: string
          delivered_to_reference: string
          file_bytes: number
          file_sha256: string
          filter_customer: string
          filter_from: string
          filter_source: string
          filter_to: string
          filter_type: string
          format: string
          generated_by_email: string
          generated_by_user_id: string
          id: string
          row_count: number
          storage_bucket: string
          storage_path: string
        }[]
      }
      admin_list_audit_exports_v2: {
        Args: {
          p_app_id?: string
          p_customer_id?: string
          p_format?: string
          p_from?: string
          p_limit?: number
          p_offset?: number
          p_provided_to_type?: string
          p_q?: string
          p_to?: string
          p_type?: string
        }
        Returns: {
          app_id: string
          created_at: string
          customer_id: string
          date_from: string
          date_to: string
          download_count: number
          file_name: string
          format: string
          generated_by_email: string
          id: string
          last_download_at: string
          legal_basis: string
          mime_type: string
          notes: string
          provided_to_contact: string
          provided_to_name: string
          provided_to_ref: string
          provided_to_type: string
          purpose: string
          row_count: number
          source: string
          storage_bucket: string
          storage_path: string
          type: string
        }[]
      }
      admin_list_audit_types: {
        Args: { p_source?: string }
        Returns: {
          type: string
        }[]
      }
      admin_list_customers: {
        Args: { p_limit?: number; p_q?: string }
        Returns: {
          customer_id: string
          email: string
        }[]
      }
      admin_list_usage_alert_actions: {
        Args: { p_alert_id: string; p_limit?: number; p_offset?: number }
        Returns: {
          action_type: string
          actor_email: string
          created_at: string
          from_status: string
          id: string
          ip: string
          note: string
          to_status: string
          user_agent: string
        }[]
      }
      admin_list_usage_alerts: {
        Args: { p_limit?: number; p_offset?: number; p_status?: string }
        Returns: {
          alert_type: string
          customer_email: string
          customer_id: string
          customer_name: string
          detected_at: string
          id: string
          reason: string
          severity: string
          status: string
        }[]
      }
      admin_reopen_usage_alert:
        | { Args: { p_id: string; p_note?: string }; Returns: undefined }
        | {
            Args: {
              p_id: string
              p_ip?: string
              p_note?: string
              p_user_agent?: string
            }
            Returns: undefined
          }
      admin_resolve_usage_alert: {
        Args: {
          p_id: string
          p_ip?: string
          p_note?: string
          p_user_agent?: string
        }
        Returns: undefined
      }
      admin_rollback_abuse_settings: {
        Args: { p_audit_id: string }
        Returns: undefined
      }
      admin_update_abuse_settings:
        | {
            Args: { p_abuse_settings_id: string; p_payload: Json }
            Returns: undefined
          }
        | {
            Args: {
              p_ack_critical_minutes: number
              p_ack_warning_minutes: number
              p_resolve_critical_minutes: number
              p_resolve_warning_minutes: number
            }
            Returns: undefined
          }
      admin_usage_alert_metrics: {
        Args: { p_from: string; p_to: string }
        Returns: {
          acknowledged_count: number
          avg_ack_seconds: number
          avg_resolve_seconds: number
          critical_count: number
          open_count: number
          p95_ack_seconds: number
          p95_resolve_seconds: number
          reopened_events: number
          resolved_count: number
          sla_ack_violations: number
          sla_resolve_violations: number
          total_alerts: number
        }[]
      }
      admin_usage_alert_metrics_sla: {
        Args: { p_from: string; p_to: string }
        Returns: {
          acknowledged_count: number
          avg_ack_seconds: number
          avg_resolve_seconds: number
          critical_count: number
          open_count: number
          p95_ack_seconds: number
          p95_resolve_seconds: number
          reopened_events: number
          resolved_count: number
          sla_ack_violations: number
          sla_resolve_violations: number
          total_alerts: number
        }[]
      }
      admin_whoami: {
        Args: never
        Returns: {
          email: string
          is_admin: boolean
          user_id: string
        }[]
      }
      can_access_app: {
        Args: { p_app_id: string; p_password: string; p_username: string }
        Returns: {
          allowed: boolean
          customer_id: string
          customer_name: string
        }[]
      }
      debacu_backfill_identity_links_doc: {
        Args: { p_limit?: number }
        Returns: number
      }
      debacu_backfill_links_doc: { Args: { p_limit?: number }; Returns: number }
      debacu_backfill_links_email: {
        Args: { p_limit?: number }
        Returns: number
      }
      debacu_backfill_links_phone: {
        Args: { p_limit?: number }
        Returns: number
      }
      debacu_build_identity_links: {
        Args: { p_identity_key: string }
        Returns: undefined
      }
      debacu_doc_key: { Args: { p_doc: string }; Returns: string }
      debacu_email_key: { Args: { p_email: string }; Returns: string }
      debacu_eval_check_signals: {
        Args: { k?: number; months?: number; q_input: string }
        Returns: {
          avg_stars: number
          count_bucket: string
          has_matches: boolean
          match_strength: string
          message: string
          risk: string
          time_window: string
          top_typologies: string[]
        }[]
      }
      debacu_eval_compute_identity_key:
        | { Args: { p_identifier: string }; Returns: string }
        | { Args: { p_identifier: string; p_pepper: string }; Returns: string }
      debacu_eval_count_bucket: { Args: { n: number }; Returns: string }
      debacu_eval_guest_index_upsert: {
        Args: {
          p_doc_key?: string
          p_email_key?: string
          p_identity_key: string
          p_incident_date?: string
          p_incident_delta?: number
          p_net_loss_delta?: number
          p_phone_key?: string
          p_seen_date?: string
          p_stay_delta?: number
        }
        Returns: undefined
      }
      debacu_eval_has_org_access: {
        Args: { target_org_id: string }
        Returns: boolean
      }
      debacu_eval_is_admin: { Args: never; Returns: boolean }
      debacu_eval_is_org_admin: {
        Args: { target_org_id: string }
        Returns: boolean
      }
      debacu_eval_is_org_member: {
        Args: { p_org_id: string }
        Returns: boolean
      }
      debacu_eval_match_strength: { Args: { q: string }; Returns: string }
      debacu_eval_recompute_risk_bands: { Args: never; Returns: undefined }
      debacu_eval_upsert_guest_index_from_incident: {
        Args: {
          p_evaluation_date: string
          p_gross: number
          p_identity_key: string
          p_net_loss: number
          p_recovered: number
        }
        Returns: undefined
      }
      debacu_eval_upsert_guest_index_from_stay:
        | {
            Args: { p_activity_date: string; p_identity_key: string }
            Returns: undefined
          }
        | {
            Args: {
              p_activity_date: string
              p_identity_key: string
              p_is_completed: boolean
            }
            Returns: undefined
          }
      debacu_eval_upsert_guest_index_from_visit: {
        Args: { p_evaluation_date: string; p_identity_key: string }
        Returns: undefined
      }
      debacu_get_pepper: { Args: never; Returns: string }
      debacu_hmac_hex: { Args: { p_input: string }; Returns: string }
      debacu_is_org_member: { Args: { p_org_id: string }; Returns: boolean }
      debacu_phone_key: { Args: { p_phone: string }; Returns: string }
      debug_audit_exports_count_system: {
        Args: never
        Returns: {
          n: number
        }[]
      }
      get_debacu_pepper: { Args: never; Returns: string }
      get_my_active_subscription_debacu_eval: {
        Args: never
        Returns: {
          app_id: string
          billing_frequency: string
          created_at: string
          customer_id: string
          end_date: string
          id: string
          next_billing_date: string
          plan_id: string
          provider: string
          start_date: string
          status: string
          stripe_price_id: string
          stripe_subscription_id: string
          updated_at: string
        }[]
      }
      global_risk_snapshot: {
        Args: never
        Returns: {
          c1: number
          c2: number
          c3: number
          c4: number
          c5: number
          pct_alto: number
          pct_bajo: number
          pct_medio: number
          pct1: number
          pct2: number
          pct3: number
          pct4: number
          pct5: number
          total: number
        }[]
      }
      global_risk_snapshot_public: {
        Args: never
        Returns: {
          c1: number
          c2: number
          c3: number
          c4: number
          c5: number
          pct_alto: number
          pct_bajo: number
          pct_medio: number
          pct1: number
          pct2: number
          pct3: number
          pct4: number
          pct5: number
          total: number
        }[]
      }
      is_admin: { Args: never; Returns: boolean }
      is_debacu_admin: { Args: never; Returns: boolean }
      list_debacu_eval_invoices: {
        Args: {
          p_app_id: string
          p_customer_id: string
          p_limit?: number
          p_offset?: number
        }
        Returns: {
          amount_total: number
          currency: string
          hosted_invoice_url: string
          id: string
          invoice_created_at: string
          invoice_number: string
          invoice_pdf: string
          status: string
          stripe_invoice_id: string
        }[]
      }
    }
    Enums: {
      audit_export_format: "PDF" | "CSV" | "XML"
      audit_provided_to_type:
        | "AEPD"
        | "AUDITOR_EXTERNO"
        | "JUZGADO"
        | "FUERZAS_SEGURIDAD"
        | "CLIENTE"
        | "OTRO"
      debacu_eval_check_mode: "GLOBAL" | "MINE"
      debacu_eval_incident_source: "MANUAL" | "CSV_SCREENING" | "SYSTEM"
      debacu_eval_incident_type:
        | "FRAUD"
        | "NO_SHOW"
        | "PAYMENT_INCIDENT"
        | "PROPERTY_DAMAGE"
        | "RULES_VIOLATION"
        | "AGGRESSIVE_BEHAVIOR"
        | "BLACKLIST_MATCH"
        | "OTHER"
      debacu_eval_query_type: "DOCUMENT" | "EMAIL" | "PHONE" | "FULL_NAME"
      debacu_eval_risk_event_type:
        | "MANUAL_CHECK"
        | "MANUAL_INCIDENT_CREATED"
        | "MANUAL_INCIDENT_UPDATED"
        | "CSV_SIGNAL_REFRESH"
        | "RISK_LEVEL_CHANGED"
      debacu_eval_risk_level: "NONE" | "LOW" | "MEDIUM" | "HIGH"
      debacu_eval_severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL"
      receipt_method: "SEPA" | "CARD" | "TRANSFER" | "CASH" | "OTHER"
      receipt_status:
        | "PENDING"
        | "IN_REMITTANCE"
        | "PAID"
        | "RETURNED"
        | "CANCELLED"
      sepa_status: "CREATED" | "SENT" | "CLOSED"
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
      audit_export_format: ["PDF", "CSV", "XML"],
      audit_provided_to_type: [
        "AEPD",
        "AUDITOR_EXTERNO",
        "JUZGADO",
        "FUERZAS_SEGURIDAD",
        "CLIENTE",
        "OTRO",
      ],
      debacu_eval_check_mode: ["GLOBAL", "MINE"],
      debacu_eval_incident_source: ["MANUAL", "CSV_SCREENING", "SYSTEM"],
      debacu_eval_incident_type: [
        "FRAUD",
        "NO_SHOW",
        "PAYMENT_INCIDENT",
        "PROPERTY_DAMAGE",
        "RULES_VIOLATION",
        "AGGRESSIVE_BEHAVIOR",
        "BLACKLIST_MATCH",
        "OTHER",
      ],
      debacu_eval_query_type: ["DOCUMENT", "EMAIL", "PHONE", "FULL_NAME"],
      debacu_eval_risk_event_type: [
        "MANUAL_CHECK",
        "MANUAL_INCIDENT_CREATED",
        "MANUAL_INCIDENT_UPDATED",
        "CSV_SIGNAL_REFRESH",
        "RISK_LEVEL_CHANGED",
      ],
      debacu_eval_risk_level: ["NONE", "LOW", "MEDIUM", "HIGH"],
      debacu_eval_severity: ["LOW", "MEDIUM", "HIGH", "CRITICAL"],
      receipt_method: ["SEPA", "CARD", "TRANSFER", "CASH", "OTHER"],
      receipt_status: [
        "PENDING",
        "IN_REMITTANCE",
        "PAID",
        "RETURNED",
        "CANCELLED",
      ],
      sepa_status: ["CREATED", "SENT", "CLOSED"],
    },
  },
} as const
