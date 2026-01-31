// src/services/rpcUntyped.ts
import { supabase } from "@/services/supabaseClient";

export async function rpcUntyped<TReturn = unknown, TArgs extends Record<string, any> = Record<string, any>>(
  fn: string,
  args?: TArgs
): Promise<TReturn> {
  const { data, error } = await (supabase as any).rpc(fn, args ?? {});
  if (error) throw error;
  return data as TReturn;
}
