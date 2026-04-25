import React, { useEffect, useRef, useState } from "react";
import { Bot, Loader2, MessageCircle, Send, X } from "lucide-react";
import { sendChatMessage } from "@/services/chatbotService";

const SESSION_KEY = "debacu_chat_session_id";

interface Msg {
  id: string;
  role: "user" | "assistant";
  content: string;
}

const WELCOME: Msg = {
  id: "welcome",
  role: "assistant",
  content:
    "Hola, soy el asistente de Debacu. Puedo ayudarte a interpretar tus alarmas de riesgo, entender la plataforma o responder preguntas sobre tus reservas. ¿En qué puedo ayudarte?",
};

export default function ChatWidget() {
  const [open, setOpen]         = useState(false);
  const [msgs, setMsgs]         = useState<Msg[]>([WELCOME]);
  const [input, setInput]       = useState("");
  const [sessionId, setSession] = useState<string | undefined>(
    () => localStorage.getItem(SESSION_KEY) ?? undefined,
  );
  const [loading, setLoading]   = useState(false);

  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef  = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [msgs, loading]);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 80);
  }, [open]);

  const send = async () => {
    const text = input.trim();
    if (!text || loading) return;

    const userMsg: Msg = { id: `u-${Date.now()}`, role: "user", content: text };
    setMsgs((p) => [...p, userMsg]);
    setInput("");
    setLoading(true);

    try {
      const { reply, session_id } = await sendChatMessage(text, sessionId);
      setSession(session_id);
      localStorage.setItem(SESSION_KEY, session_id);
      setMsgs((p) => [...p, { id: `a-${Date.now()}`, role: "assistant", content: reply }]);
    } catch {
      setMsgs((p) => [
        ...p,
        { id: `e-${Date.now()}`, role: "assistant", content: "Ha ocurrido un error. Inténtalo de nuevo." },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const handleKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }
  };

  return (
    <>
      {open && (
        <div
          className="fixed bottom-20 right-4 z-50 flex w-80 flex-col rounded-2xl border border-slate-200 bg-white shadow-2xl sm:w-96"
          style={{ maxHeight: "min(520px, calc(100vh - 110px))" }}
        >
          {/* Cabecera */}
          <div className="flex shrink-0 items-center justify-between gap-2 rounded-t-2xl bg-indigo-600 px-4 py-3 text-white">
            <div className="flex items-center gap-2">
              <Bot className="h-4 w-4 shrink-0" />
              <span className="text-sm font-semibold">Asistente Debacu</span>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded-lg p-1 hover:bg-white/20 transition-colors"
              aria-label="Cerrar asistente"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Mensajes */}
          <div className="flex-1 overflow-y-auto space-y-3 bg-slate-50 p-3">
            {msgs.map((msg) => (
              <div key={msg.id} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                {msg.role === "assistant" && (
                  <span className="mr-2 mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-indigo-100">
                    <Bot className="h-3 w-3 text-indigo-600" />
                  </span>
                )}
                <div
                  className={`max-w-[82%] whitespace-pre-wrap rounded-2xl px-3 py-2 text-sm leading-relaxed ${
                    msg.role === "user"
                      ? "rounded-br-sm bg-indigo-600 text-white"
                      : "rounded-bl-sm border border-slate-200 bg-white text-slate-700 shadow-sm"
                  }`}
                >
                  {msg.content}
                </div>
              </div>
            ))}

            {loading && (
              <div className="flex justify-start">
                <span className="mr-2 mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-indigo-100">
                  <Bot className="h-3 w-3 text-indigo-600" />
                </span>
                <div className="rounded-2xl rounded-bl-sm border border-slate-200 bg-white px-3 py-2 shadow-sm">
                  <Loader2 className="h-4 w-4 animate-spin text-indigo-400" />
                </div>
              </div>
            )}

            <div ref={bottomRef} />
          </div>

          {/* Input */}
          <div className="flex shrink-0 items-end gap-2 rounded-b-2xl border-t border-slate-200 bg-white p-3">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKey}
              placeholder="Escribe tu pregunta…"
              rows={1}
              style={{ resize: "none" }}
              className="flex-1 rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-700 placeholder-slate-400 focus:border-indigo-300 focus:outline-none focus:ring-2 focus:ring-indigo-400/50"
            />
            <button
              type="button"
              onClick={send}
              disabled={!input.trim() || loading}
              className="shrink-0 rounded-xl bg-indigo-600 p-2 text-white transition-colors hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-40"
              aria-label="Enviar mensaje"
            >
              <Send className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {/* Botón flotante */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="fixed bottom-4 right-4 z-50 flex h-12 w-12 items-center justify-center rounded-full bg-indigo-600 text-white shadow-lg transition-colors hover:bg-indigo-700"
        aria-label={open ? "Cerrar asistente" : "Abrir asistente Debacu"}
      >
        {open ? <X className="h-5 w-5" /> : <MessageCircle className="h-5 w-5" />}
      </button>
    </>
  );
}
