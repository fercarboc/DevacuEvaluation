// src/types/database.ts

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json }
  | Json[];

export type Database = {
  public: {
    Tables: {
      // ======================
      // DEBACU EVALUATIONS
      // ======================
      debacu_evaluations: {
        Row: {
          id: string;
          document: string;
          full_name: string;
          nationality: string | null;
          phone: string | null;
          email: string | null;
          rating: number;
          comment: string | null;
          creator_customer_id: string | null;
          creator_customer_name: string | null;
          platform: string | null;
          evaluation_date: string; // date en BD
          created_at: string; // timestamptz
          updated_at: string; // timestamptz
        };
        Insert: {
          id?: string;
          document: string;
          full_name: string;
          nationality?: string | null;
          phone?: string | null;
          email?: string | null;
          rating: number;
          comment?: string | null;
          creator_customer_id?: string | null;
          creator_customer_name?: string | null;
          platform?: string | null;
          evaluation_date?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["debacu_evaluations"]["Insert"]>;
        Relationships: [];
      };

      // ======================
      // ACCESS REQUESTS
      // ======================
      debacu_eval_access_requests: {
        Row: {
          id: string;
          status: "PENDING" | "APPROVED" | "REJECTED";
          company_name: string;
          legal_name: string | null;
          cif: string;
          address: string | null;
          city: string | null;
          country: string | null;
          property_type: "HOTEL" | "RURAL" | "APARTMENTS" | "HOSTEL" | "OTHER";
          rooms_count: number | null;
          website: string | null;
          contact_name: string;
          contact_role: string | null;
          email: string;
          phone: string | null;
          accepted_terms: boolean;
          accepted_professional_use: boolean;
          notes: string | null;
          reviewed_by: string | null;
          reviewed_at: string | null;
          decision_notes: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          status?: "PENDING" | "APPROVED" | "REJECTED";
          company_name: string;
          legal_name?: string | null;
          cif: string;
          address?: string | null;
          city?: string | null;
          country?: string | null;
          property_type: "HOTEL" | "RURAL" | "APARTMENTS" | "HOSTEL" | "OTHER";
          rooms_count?: number | null;
          website?: string | null;
          contact_name: string;
          contact_role?: string | null;
          email: string;
          phone?: string | null;
          accepted_terms: boolean;
          accepted_professional_use: boolean;
          notes?: string | null;
          reviewed_by?: string | null;
          reviewed_at?: string | null;
          decision_notes?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["debacu_eval_access_requests"]["Insert"]>;
        Relationships: [];
      };

      // ======================
      // CUSTOMERS (según tu schema real)
      // ======================
      customers: {
        Row: {
          id: string;
          name: string | null;
          nif: string | null;
          address: string | null;
          postal_code: string | null;
          city: string | null;
          province: string | null;
          country: string | null;
          phone: string | null;
          email: string | null;
          sector_id: string | null;
          plan_id: string | null;
          billing_frequency: string | null;
          start_date: string | null; // date
          service_username: string | null;
          service_password: string | null;
          api_token: string | null;
          is_active: boolean;
          iban: string | null;
          swift: string | null;
          bank_name: string | null;
          bank_address: string | null;
          stripe_customer_id: string | null;
          stripe_default_payment_method_id: string | null;
          app_id: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name?: string | null;
          nif?: string | null;
          address?: string | null;
          postal_code?: string | null;
          city?: string | null;
          province?: string | null;
          country?: string | null;
          phone?: string | null;
          email?: string | null;
          sector_id?: string | null;
          plan_id?: string | null;
          billing_frequency?: string | null;
          start_date?: string | null;
          service_username?: string | null;
          service_password?: string | null;
          api_token?: string | null;
          is_active?: boolean;
          iban?: string | null;
          swift?: string | null;
          bank_name?: string | null;
          bank_address?: string | null;
          stripe_customer_id?: string | null;
          stripe_default_payment_method_id?: string | null;
          app_id?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["customers"]["Insert"]>;
        Relationships: [];
      };

      // ======================
      // PLANS (según tu schema real)
      // ======================
      plans: {
        Row: {
          id: string;
          app_id: string | null;
          name: string;
          code: string | null;
          price_monthly: number | null; // numeric
          price_yearly: number | null; // numeric
          max_queries_per_month: number | null;
          extra_config: Json | null; // jsonb
        };
        Insert: {
          id?: string;
          app_id?: string | null;
          name: string;
          code?: string | null;
          price_monthly?: number | null;
          price_yearly?: number | null;
          max_queries_per_month?: number | null;
          extra_config?: Json | null;
        };
        Update: Partial<Database["public"]["Tables"]["plans"]["Insert"]>;
        Relationships: [];
      };

      // ======================
      // SUBSCRIPTIONS (según tu schema real)
      // ======================
      subscriptions: {
        Row: {
          id: string;
          customer_id: string;
          app_id: string;
          plan_id: string;
          billing_frequency: string;
          start_date: string; // date
          end_date: string | null; // date
          next_billing_date: string | null; // date
          status: string;
          provider: string | null;
          provider_checkout_id: string | null;
          provider_subscription_id: string | null;
          replaces_subscription_id: string | null;
          stripe_subscription_id: string | null;
          stripe_price_id: string | null;
          stripe_checkout_session_id: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          customer_id: string;
          app_id: string;
          plan_id: string;
          billing_frequency: string;
          start_date?: string;
          end_date?: string | null;
          next_billing_date?: string | null;
          status: string;
          provider?: string | null;
          provider_checkout_id?: string | null;
          provider_subscription_id?: string | null;
          replaces_subscription_id?: string | null;
          stripe_subscription_id?: string | null;
          stripe_price_id?: string | null;
          stripe_checkout_session_id?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["subscriptions"]["Insert"]>;
        Relationships: [];
      };
    };

    Views: {
      // si luego quieres tipar las vistas, las añadimos aquí
      [key: string]: never;
    };

    Functions: {};
    Enums: {};
    CompositeTypes: {};
  };
};
