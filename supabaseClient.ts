// src/supabaseClient.ts
import { createClient } from '@supabase/supabase-js';

// ⚠️ Sustituye por tu URL y Public Anon Key reales de Supabase
const SUPABASE_URL = "https://dqqjaujnulutinskmqsu.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRxcWphdWpudWx1dGluc2ttcXN1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ4NzA1NTYsImV4cCI6MjA4MDQ0NjU1Nn0.bszEj5MKqZgG4B_TqllE7ijxrcV9JinFXeMIaP1ljOw";

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
