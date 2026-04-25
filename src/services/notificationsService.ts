import { callEvalFn } from "@/services/callEvalFn";

export async function getNotificationsCount(): Promise<number> {
  try {
    const res = await callEvalFn<{ ok: boolean; count: number }>(
      "debacu_eval_notifications_get",
      {}
    );
    return res?.count ?? 0;
  } catch {
    return 0;
  }
}

export async function markNotificationsRead(): Promise<void> {
  try {
    await callEvalFn("debacu_eval_notifications_mark_read", {});
  } catch {
    // fire-and-forget
  }
}
