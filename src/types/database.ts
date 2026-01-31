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
      customers: {
        Row: {
          address: string | null
          api_token: string | null
          app_id: string | null
          bank_address: string | null
          bank_name: string | null
          billing_frequency: string | null
          city: string | null
          country: string | null
          created_at: string
          email: string | null
          iban: string | null
          id: string
          is_active: boolean
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
          bank_address?: string | null
          bank_name?: string | null
          billing_frequency?: string | null
          city?: string | null
          country?: string | null
          created_at?: string
          email?: string | null
          iban?: string | null
          id?: string
          is_active?: boolean
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
          bank_address?: string | null
          bank_name?: string | null
          billing_frequency?: string | null
          city?: string | null
          country?: string | null
          created_at?: string
          email?: string | null
          iban?: string | null
          id?: string
          is_active?: boolean
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
          last_email_at: string | null
          last_email_detail: string | null
          last_email_status: string | null
          legal_name: string | null
          notes: string | null
          phone: string | null
          property_type: string
          reviewed_at: string | null
          reviewed_by: string | null
          rgpd_annex_ii_accepted_at: string | null
          rgpd_annex_ii_version: string | null
          rooms_count: number | null
          status: string
          terms_version: string | null
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
          last_email_at?: string | null
          last_email_detail?: string | null
          last_email_status?: string | null
          legal_name?: string | null
          notes?: string | null
          phone?: string | null
          property_type: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          rgpd_annex_ii_accepted_at?: string | null
          rgpd_annex_ii_version?: string | null
          rooms_count?: number | null
          status?: string
          terms_version?: string | null
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
          last_email_at?: string | null
          last_email_detail?: string | null
          last_email_status?: string | null
          legal_name?: string | null
          notes?: string | null
          phone?: string | null
          property_type?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          rgpd_annex_ii_accepted_at?: string | null
          rgpd_annex_ii_version?: string | null
          rooms_count?: number | null
          status?: string
          terms_version?: string | null
          website?: string | null
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
          user_agent: string | null
        }
        Insert: {
          created_at?: string
          downloaded_by: string
          downloaded_by_email?: string | null
          export_id: string
          id?: string
          ip?: unknown
          user_agent?: string | null
        }
        Update: {
          created_at?: string
          downloaded_by?: string
          downloaded_by_email?: string | null
          export_id?: string
          id?: string
          ip?: unknown
          user_agent?: string | null
        }
        Relationships: [
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
          row_count: number
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
          row_count?: number
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
          row_count?: number
          storage_bucket?: string
          storage_path?: string
        }
        Relationships: []
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
        Relationships: []
      }
      debacu_eval_org_members: {
        Row: {
          created_at: string
          id: string
          org_id: string
          role: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          org_id: string
          role?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          org_id?: string
          role?: string
          user_id?: string
        }
        Relationships: [
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
          id?: string
          legal_name?: string | null
          name?: string
          property_type?: string | null
          rooms_count?: number | null
          website?: string | null
        }
        Relationships: []
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
          comment: string | null
          created_at: string | null
          creator_customer_id: string | null
          creator_customer_name: string | null
          document: string
          email: string | null
          evaluation_date: string | null
          full_name: string
          id: string
          nationality: string | null
          phone: string | null
          platform: string | null
          rating: number
          updated_at: string | null
        }
        Insert: {
          comment?: string | null
          created_at?: string | null
          creator_customer_id?: string | null
          creator_customer_name?: string | null
          document: string
          email?: string | null
          evaluation_date?: string | null
          full_name: string
          id?: string
          nationality?: string | null
          phone?: string | null
          platform?: string | null
          rating: number
          updated_at?: string | null
        }
        Update: {
          comment?: string | null
          created_at?: string | null
          creator_customer_id?: string | null
          creator_customer_name?: string | null
          document?: string
          email?: string | null
          evaluation_date?: string | null
          full_name?: string
          id?: string
          nationality?: string | null
          phone?: string | null
          platform?: string | null
          rating?: number
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
      LEX_BUDGET_ITEMS: {
        Row: {
          amount: number | null
          budgetId: string | null
          concept: string | null
          id: string
          quantity: number | null
          unitPrice: number | null
        }
        Insert: {
          amount?: number | null
          budgetId?: string | null
          concept?: string | null
          id: string
          quantity?: number | null
          unitPrice?: number | null
        }
        Update: {
          amount?: number | null
          budgetId?: string | null
          concept?: string | null
          id?: string
          quantity?: number | null
          unitPrice?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "LEX_BUDGET_ITEMS_budgetId_fkey"
            columns: ["budgetId"]
            isOneToOne: false
            referencedRelation: "LEX_BUDGETS"
            referencedColumns: ["id"]
          },
        ]
      }
      LEX_BUDGETS: {
        Row: {
          caseId: string | null
          clientId: string | null
          date: string | null
          id: string
          status: string | null
          total: number | null
        }
        Insert: {
          caseId?: string | null
          clientId?: string | null
          date?: string | null
          id: string
          status?: string | null
          total?: number | null
        }
        Update: {
          caseId?: string | null
          clientId?: string | null
          date?: string | null
          id?: string
          status?: string | null
          total?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "LEX_BUDGETS_caseId_fkey"
            columns: ["caseId"]
            isOneToOne: false
            referencedRelation: "LEX_CASES"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "LEX_BUDGETS_clientId_fkey"
            columns: ["clientId"]
            isOneToOne: false
            referencedRelation: "LEX_CLIENTS"
            referencedColumns: ["id"]
          },
        ]
      }
      LEX_CASES: {
        Row: {
          caseNumber: string | null
          clientId: string | null
          description: string | null
          id: string
          openDate: string | null
          status: string | null
          subject: string | null
        }
        Insert: {
          caseNumber?: string | null
          clientId?: string | null
          description?: string | null
          id: string
          openDate?: string | null
          status?: string | null
          subject?: string | null
        }
        Update: {
          caseNumber?: string | null
          clientId?: string | null
          description?: string | null
          id?: string
          openDate?: string | null
          status?: string | null
          subject?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "LEX_CASES_clientId_fkey"
            columns: ["clientId"]
            isOneToOne: false
            referencedRelation: "LEX_CLIENTS"
            referencedColumns: ["id"]
          },
        ]
      }
      LEX_CLIENTS: {
        Row: {
          address: string | null
          city: string | null
          contactPerson: string | null
          created_at: string | null
          email: string | null
          id: string
          name: string | null
          nif: string | null
          phone: string | null
          province: string | null
          zipCode: string | null
        }
        Insert: {
          address?: string | null
          city?: string | null
          contactPerson?: string | null
          created_at?: string | null
          email?: string | null
          id: string
          name?: string | null
          nif?: string | null
          phone?: string | null
          province?: string | null
          zipCode?: string | null
        }
        Update: {
          address?: string | null
          city?: string | null
          contactPerson?: string | null
          created_at?: string | null
          email?: string | null
          id?: string
          name?: string | null
          nif?: string | null
          phone?: string | null
          province?: string | null
          zipCode?: string | null
        }
        Relationships: []
      }
      LEX_COMMUNICATIONS: {
        Row: {
          clientId: string | null
          content: string | null
          date: string | null
          id: string
          relatedEntityId: string | null
          relatedEntityType: string | null
          subject: string | null
          type: string | null
          userId: string | null
        }
        Insert: {
          clientId?: string | null
          content?: string | null
          date?: string | null
          id: string
          relatedEntityId?: string | null
          relatedEntityType?: string | null
          subject?: string | null
          type?: string | null
          userId?: string | null
        }
        Update: {
          clientId?: string | null
          content?: string | null
          date?: string | null
          id?: string
          relatedEntityId?: string | null
          relatedEntityType?: string | null
          subject?: string | null
          type?: string | null
          userId?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "LEX_COMMUNICATIONS_clientId_fkey"
            columns: ["clientId"]
            isOneToOne: false
            referencedRelation: "LEX_CLIENTS"
            referencedColumns: ["id"]
          },
        ]
      }
      LEX_DOCUMENT_VERSIONS: {
        Row: {
          docType: string | null
          id: string
          originalDocId: string | null
          recipientEmail: string | null
          sentDate: string | null
          versionLabel: string | null
        }
        Insert: {
          docType?: string | null
          id: string
          originalDocId?: string | null
          recipientEmail?: string | null
          sentDate?: string | null
          versionLabel?: string | null
        }
        Update: {
          docType?: string | null
          id?: string
          originalDocId?: string | null
          recipientEmail?: string | null
          sentDate?: string | null
          versionLabel?: string | null
        }
        Relationships: []
      }
      LEX_EVENTS: {
        Row: {
          caseId: string | null
          completed: boolean | null
          date: string | null
          description: string | null
          id: string
          title: string | null
          type: string | null
          userId: string | null
        }
        Insert: {
          caseId?: string | null
          completed?: boolean | null
          date?: string | null
          description?: string | null
          id: string
          title?: string | null
          type?: string | null
          userId?: string | null
        }
        Update: {
          caseId?: string | null
          completed?: boolean | null
          date?: string | null
          description?: string | null
          id?: string
          title?: string | null
          type?: string | null
          userId?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "LEX_EVENTS_caseId_fkey"
            columns: ["caseId"]
            isOneToOne: false
            referencedRelation: "LEX_CASES"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "LEX_EVENTS_userId_fkey"
            columns: ["userId"]
            isOneToOne: false
            referencedRelation: "LEX_USERS"
            referencedColumns: ["id"]
          },
        ]
      }
      LEX_INVOICE_ITEMS: {
        Row: {
          amount: number | null
          concept: string | null
          id: string
          invoiceId: string | null
          quantity: number | null
          unitPrice: number | null
        }
        Insert: {
          amount?: number | null
          concept?: string | null
          id: string
          invoiceId?: string | null
          quantity?: number | null
          unitPrice?: number | null
        }
        Update: {
          amount?: number | null
          concept?: string | null
          id?: string
          invoiceId?: string | null
          quantity?: number | null
          unitPrice?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "LEX_INVOICE_ITEMS_invoiceId_fkey"
            columns: ["invoiceId"]
            isOneToOne: false
            referencedRelation: "LEX_INVOICES"
            referencedColumns: ["id"]
          },
        ]
      }
      LEX_INVOICES: {
        Row: {
          caseId: string | null
          chainHash: string | null
          clientId: string | null
          clientName: string | null
          clientNif: string | null
          created_at: string | null
          date: string | null
          id: string
          irpfAmount: number | null
          irpfRate: number | null
          ivaAmount: number | null
          ivaRate: number | null
          linkedPaymentId: string | null
          number: number | null
          paymentStatus: string | null
          previousInvoiceHash: string | null
          rectificationReason: string | null
          rectifiesInvoiceId: string | null
          series: string | null
          signature: string | null
          status: string | null
          subtotal: number | null
          total: number | null
          type: string | null
        }
        Insert: {
          caseId?: string | null
          chainHash?: string | null
          clientId?: string | null
          clientName?: string | null
          clientNif?: string | null
          created_at?: string | null
          date?: string | null
          id: string
          irpfAmount?: number | null
          irpfRate?: number | null
          ivaAmount?: number | null
          ivaRate?: number | null
          linkedPaymentId?: string | null
          number?: number | null
          paymentStatus?: string | null
          previousInvoiceHash?: string | null
          rectificationReason?: string | null
          rectifiesInvoiceId?: string | null
          series?: string | null
          signature?: string | null
          status?: string | null
          subtotal?: number | null
          total?: number | null
          type?: string | null
        }
        Update: {
          caseId?: string | null
          chainHash?: string | null
          clientId?: string | null
          clientName?: string | null
          clientNif?: string | null
          created_at?: string | null
          date?: string | null
          id?: string
          irpfAmount?: number | null
          irpfRate?: number | null
          ivaAmount?: number | null
          ivaRate?: number | null
          linkedPaymentId?: string | null
          number?: number | null
          paymentStatus?: string | null
          previousInvoiceHash?: string | null
          rectificationReason?: string | null
          rectifiesInvoiceId?: string | null
          series?: string | null
          signature?: string | null
          status?: string | null
          subtotal?: number | null
          total?: number | null
          type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "LEX_INVOICES_caseId_fkey"
            columns: ["caseId"]
            isOneToOne: false
            referencedRelation: "LEX_CASES"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "LEX_INVOICES_clientId_fkey"
            columns: ["clientId"]
            isOneToOne: false
            referencedRelation: "LEX_CLIENTS"
            referencedColumns: ["id"]
          },
        ]
      }
      LEX_LEGAL_RESOURCES: {
        Row: {
          caseId: string | null
          dateSaved: string | null
          id: string
          source: string | null
          summary: string | null
          title: string | null
          url: string | null
        }
        Insert: {
          caseId?: string | null
          dateSaved?: string | null
          id: string
          source?: string | null
          summary?: string | null
          title?: string | null
          url?: string | null
        }
        Update: {
          caseId?: string | null
          dateSaved?: string | null
          id?: string
          source?: string | null
          summary?: string | null
          title?: string | null
          url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "LEX_LEGAL_RESOURCES_caseId_fkey"
            columns: ["caseId"]
            isOneToOne: false
            referencedRelation: "LEX_CASES"
            referencedColumns: ["id"]
          },
        ]
      }
      LEX_PAYMENTS: {
        Row: {
          amount: number | null
          caseId: string | null
          clientId: string | null
          concept: string | null
          date: string | null
          id: string
          isInvoiced: boolean | null
          linkedInvoiceId: string | null
          type: string | null
        }
        Insert: {
          amount?: number | null
          caseId?: string | null
          clientId?: string | null
          concept?: string | null
          date?: string | null
          id: string
          isInvoiced?: boolean | null
          linkedInvoiceId?: string | null
          type?: string | null
        }
        Update: {
          amount?: number | null
          caseId?: string | null
          clientId?: string | null
          concept?: string | null
          date?: string | null
          id?: string
          isInvoiced?: boolean | null
          linkedInvoiceId?: string | null
          type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "LEX_PAYMENTS_caseId_fkey"
            columns: ["caseId"]
            isOneToOne: false
            referencedRelation: "LEX_CASES"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "LEX_PAYMENTS_clientId_fkey"
            columns: ["clientId"]
            isOneToOne: false
            referencedRelation: "LEX_CLIENTS"
            referencedColumns: ["id"]
          },
        ]
      }
      LEX_SETTINGS: {
        Row: {
          address: string | null
          barNumber: string | null
          defaultIrpf: number | null
          defaultIva: number | null
          id: number
          name: string | null
          nif: string | null
        }
        Insert: {
          address?: string | null
          barNumber?: string | null
          defaultIrpf?: number | null
          defaultIva?: number | null
          id: number
          name?: string | null
          nif?: string | null
        }
        Update: {
          address?: string | null
          barNumber?: string | null
          defaultIrpf?: number | null
          defaultIva?: number | null
          id?: number
          name?: string | null
          nif?: string | null
        }
        Relationships: []
      }
      LEX_USERS: {
        Row: {
          id: string
          name: string | null
          password: string | null
          permissions: Json | null
          position: string | null
          role: string | null
          specialty: string | null
          username: string | null
        }
        Insert: {
          id: string
          name?: string | null
          password?: string | null
          permissions?: Json | null
          position?: string | null
          role?: string | null
          specialty?: string | null
          username?: string | null
        }
        Update: {
          id?: string
          name?: string | null
          password?: string | null
          permissions?: Json | null
          position?: string | null
          role?: string | null
          specialty?: string | null
          username?: string | null
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
          name: string
          price_monthly: number | null
          price_yearly: number | null
        }
        Insert: {
          app_id?: string | null
          code?: string | null
          extra_config?: Json | null
          id?: string
          max_queries_per_month?: number | null
          name: string
          price_monthly?: number | null
          price_yearly?: number | null
        }
        Update: {
          app_id?: string | null
          code?: string | null
          extra_config?: Json | null
          id?: string
          max_queries_per_month?: number | null
          name?: string
          price_monthly?: number | null
          price_yearly?: number | null
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
          id: string
          payload: Json | null
          stripe_customer_id: string | null
          stripe_event_id: string | null
          stripe_subscription_id: string | null
          type: string
        }
        Insert: {
          app_id?: string | null
          created_at?: string
          customer_id?: string | null
          id?: string
          payload?: Json | null
          stripe_customer_id?: string | null
          stripe_event_id?: string | null
          stripe_subscription_id?: string | null
          type: string
        }
        Update: {
          app_id?: string | null
          created_at?: string
          customer_id?: string | null
          id?: string
          payload?: Json | null
          stripe_customer_id?: string | null
          stripe_event_id?: string | null
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
        ]
      }
      subscriptions: {
        Row: {
          app_id: string
          billing_frequency: string
          created_at: string
          customer_id: string
          end_date: string | null
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
    }
    Views: {
      abuse_settings_audit_grouped: {
        Row: {
          abuse_settings_id: string | null
          actor_name: string | null
          audit_id: string | null
          changes_count: number | null
          changes_summary: string | null
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
      debacu_eval_country_summary: {
        Row: {
          cnt: number | null
          country: string | null
        }
        Relationships: []
      }
      debacu_eval_platform_summary: {
        Row: {
          cnt: number | null
          platform: string | null
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
      admin_list_audit_exports_v2:
        | {
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
              file_name: string
              format: Database["public"]["Enums"]["audit_export_format"]
              generated_by_email: string
              id: string
              legal_basis: string
              mime_type: string
              notes: string
              provided_to_contact: string
              provided_to_name: string
              provided_to_ref: string
              provided_to_type: Database["public"]["Enums"]["audit_provided_to_type"]
              purpose: string
              row_count: number
              source: string
              storage_bucket: string
              storage_path: string
              type: string
            }[]
          }
        | {
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
              download_count: number
              format: string
              generated_by_email: string
              id: string
              row_count: number
              storage_path: string
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
      can_access_app: {
        Args: { p_app_id: string; p_password: string; p_username: string }
        Returns: {
          allowed: boolean
          customer_id: string
          customer_name: string
        }[]
      }
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
      debacu_eval_count_bucket: { Args: { n: number }; Returns: string }
      debacu_eval_match_strength: { Args: { q: string }; Returns: string }
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
