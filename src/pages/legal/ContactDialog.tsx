import React, { useEffect, useMemo, useState } from "react";

type Props = {
  open: boolean;
  onClose: () => void;
};

function cx(...cls: Array<string | false | undefined | null>) {
  return cls.filter(Boolean).join(" ");
}

export default function ContactDialog({ open, onClose }: Props) {
  const [name, setName] = useState("");
  const [company, setCompany] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [message, setMessage] = useState("");

  const [touched, setTouched] = useState(false);
  const [sent, setSent] = useState(false);

  const errors = useMemo(() => {
    const e: Record<string, string> = {};
    if (!name.trim()) e.name = "Indica tu nombre.";
    if (!email.trim()) e.email = "Indica tu email.";
    if (email.trim() && !/^\S+@\S+\.\S+$/.test(email.trim()))
      e.email = "Email no válido.";
    if (!message.trim()) e.message = "Escribe un mensaje.";
    return e;
  }, [name, email, message]);

  const isValid = Object.keys(errors).length === 0;

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  useEffect(() => {
    if (!open) return;
    // reset cuando abre
    setTouched(false);
    setSent(false);
  }, [open]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setTouched(true);

    if (!isValid) return;

    // ✅ Envío simple (sin backend): mailto
    const to = "informacion@debacu.com";
    const subject = encodeURIComponent("Contacto - Debacu Evaluation360");
    const body = encodeURIComponent(
      [
        `Nombre: ${name}`,
        company ? `Empresa: ${company}` : "",
        `Email: ${email}`,
        phone ? `Teléfono: ${phone}` : "",
        "",
        "Mensaje:",
        message,
      ]
        .filter(Boolean)
        .join("\n")
    );

    window.location.href = `mailto:${to}?subject=${subject}&body=${body}`;

    // UX: marca como enviado (aunque mailto abre el cliente)
    setSent(true);
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[80]">
      {/* overlay */}
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />

      {/* modal */}
      <div className="absolute inset-0 flex items-center justify-center p-4">
        <div className="w-full max-w-xl overflow-hidden rounded-3xl border border-white/10 bg-[#0b2d4d] shadow-2xl">
          {/* header */}
          <div className="flex items-center justify-between border-b border-white/10 px-6 py-4">
            <div>
              <div className="text-sm font-semibold text-white">Contacto</div>
              <div className="text-xs text-white/70">
                Responderemos lo antes posible.
              </div>
            </div>

            <button
              onClick={onClose}
              className="rounded-xl border border-white/15 bg-white/10 px-4 py-2 text-xs font-semibold text-white hover:bg-white/15"
            >
              Cerrar
            </button>
          </div>

          {/* content */}
          <form onSubmit={handleSubmit} className="bg-white px-6 py-5">
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="text-xs font-semibold text-slate-700">
                  Nombre *
                </label>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  onBlur={() => setTouched(true)}
                  className={cx(
                    "mt-1 w-full rounded-xl border px-3 py-2 text-sm outline-none",
                    "focus:ring-2 focus:ring-slate-200",
                    touched && errors.name ? "border-red-300" : "border-slate-200"
                  )}
                  placeholder="Tu nombre"
                />
                {touched && errors.name && (
                  <div className="mt-1 text-[11px] text-red-600">
                    {errors.name}
                  </div>
                )}
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-700">
                  Empresa (opcional)
                </label>
                <input
                  value={company}
                  onChange={(e) => setCompany(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-slate-200"
                  placeholder="Hotel / alojamiento"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-700">
                  Email *
                </label>
                <input
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  onBlur={() => setTouched(true)}
                  className={cx(
                    "mt-1 w-full rounded-xl border px-3 py-2 text-sm outline-none",
                    "focus:ring-2 focus:ring-slate-200",
                    touched && errors.email ? "border-red-300" : "border-slate-200"
                  )}
                  placeholder="tu@email.com"
                />
                {touched && errors.email && (
                  <div className="mt-1 text-[11px] text-red-600">
                    {errors.email}
                  </div>
                )}
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-700">
                  Teléfono (opcional)
                </label>
                <input
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-slate-200"
                  placeholder="+34 ..."
                />
              </div>
            </div>

            <div className="mt-3">
              <label className="text-xs font-semibold text-slate-700">
                Mensaje *
              </label>
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                onBlur={() => setTouched(true)}
                className={cx(
                  "mt-1 w-full rounded-xl border px-3 py-2 text-sm outline-none",
                  "focus:ring-2 focus:ring-slate-200",
                  "min-h-[120px]",
                  touched && errors.message ? "border-red-300" : "border-slate-200"
                )}
                placeholder="Cuéntanos qué necesitas..."
              />
              {touched && errors.message && (
                <div className="mt-1 text-[11px] text-red-600">
                  {errors.message}
                </div>
              )}
            </div>

            <div className="mt-4 flex items-center justify-between gap-3">
              <div className="text-[11px] text-slate-500">
                Al enviar, nos contactas por email (sin crear cuenta).
              </div>

              <button
                type="submit"
                className={cx(
                  "rounded-xl px-4 py-2 text-sm font-semibold transition-colors",
                  isValid
                    ? "bg-slate-900 text-white hover:bg-black"
                    : "bg-slate-200 text-slate-500 cursor-not-allowed"
                )}
              >
                Enviar
              </button>
            </div>

            {sent && (
              <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700">
                Listo. Se abrirá tu cliente de correo para enviar el mensaje.
              </div>
            )}
          </form>
        </div>
      </div>
    </div>
  );
}
