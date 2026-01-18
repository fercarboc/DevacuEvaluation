export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
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
          fullName: string;
          nationality: string | null;
          phone: string | null;
          email: string | null;
          rating: number;
          comment: string | null;
          creatorCustomerId: string | null;
          creatorCustomerName: string | null;
          platform: string | null;
          evaluationDate: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          document: string;
          fullName: string;
          nationality?: string | null;
          phone?: string | null;
          email?: string | null;
          rating: number;
          comment?: string | null;
          creatorCustomerId?: string | null;
          creatorCustomerName?: string | null;
          platform?: string | null;
          evaluationDate?: string;
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
        };
        Update: Partial<Database["public"]["Tables"]["debacu_eval_access_requests"]["Insert"]>;
        Relationships: [];
      };

      // ======================
      // CUSTOMERS
      // ======================
      customers: {
        Row: {
          id: string;
          name: string | null;
          email: string | null;
          serviceUsername: string | null;
          servicePassword: string | null;
          isActive: boolean;
          startDate: string | null;
          planId: string | null;
        };
        Insert: {
          id?: string;
          name?: string | null;
          email?: string | null;
          serviceUsername?: string | null;
          servicePassword?: string | null;
          isActive?: boolean;
          startDate?: string | null;
          planId?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["customers"]["Insert"]>;
        Relationships: [];
      };

      // ======================
      // PLANS
      // ======================
      plans: {
        Row: {
          id: string;
          appId: string | null;
          name: string;
          code: string | null;
          price_monthly: number | null;
          price_yearly: number | null;
        };
        Insert: {
          id?: string;
          appId?: string | null;
          name: string;
          code?: string | null;
          price_monthly?: number | null;
          price_yearly?: number | null;
        };
        Update: Partial<Database["public"]["Tables"]["plans"]["Insert"]>;
        Relationships: [];
      };

      // ======================
      // SUBSCRIPTIONS
      // ======================
      subscriptions: {
        Row: {
          id: string;
          customerId: string;
          appId: string;
          planId: string;
          status: string;
          startDate: string | null;
          endDate: string | null;
        };
        Insert: {
          id?: string;
          customerId: string;
          appId: string;
          planId: string;
          status: string;
          startDate?: string | null;
          endDate?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["subscriptions"]["Insert"]>;
        Relationships: [];
      };
    };

    Views: {};
    Functions: {};
    Enums: {};
    CompositeTypes: {};
  };
};
