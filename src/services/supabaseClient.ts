// src/services/supabaseClient.ts
import { createClient } from "@supabase/supabase-js";
import type { Database } from "../types/database";

const url = import.meta.env.VITE_SUPABASE_URL as string;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

// 👇 OJO: 2º genérico = schema
export const supabase = createClient<Database, "public">(url, key);