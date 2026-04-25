import { callEvalFn } from "@/services/callEvalFn";

export async function sendChatMessage(
  message: string,
  sessionId?: string,
): Promise<{ reply: string; session_id: string }> {
  const res = await callEvalFn<{ ok: boolean; reply: string; session_id: string; error?: string }>(
    "debacu_eval_chatbot_query",
    { message, session_id: sessionId },
  );
  if (!res?.ok) throw new Error(res?.error ?? "chatbot_error");
  return { reply: res.reply, session_id: res.session_id };
}
