import React, { useEffect, useRef, useState } from "react";
import { Mail, Phone, MapPin } from "lucide-react";

import "@/styles/public.css";
import WebNavbar from "@/pages/public/WebNavbar";
import WebFooter from "@/pages/public/WebFooter";

type ContactFormState = {
  name: string;
  email: string;
  company: string;
  phone: string;
  message: string;
  website: string; // honeypot
};

const initialForm: ContactFormState = {
  name: "",
  email: "",
  company: "",
  phone: "",
  message: "",
  website: "",
};

export default function ContactoPage() {
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const [form, setForm] = useState<ContactFormState>(initialForm);
  const [submitting, setSubmitting] = useState(false);
  const [successMessage, setSuccessMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTo({ top: 0, behavior: "auto" });
    }
  }, []);

  const updateField =
    (field: keyof ContactFormState) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      setForm((prev) => ({
        ...prev,
        [field]: e.target.value,
      }));
    };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    setSuccessMessage("");
    setErrorMessage("");

    if (!form.name.trim()) {
      setErrorMessage("Introduce tu nombre.");
      return;
    }

    if (!form.email.trim()) {
      setErrorMessage("Introduce tu email.");
      return;
    }

    if (!form.message.trim() || form.message.trim().length < 10) {
      setErrorMessage("El mensaje debe tener al menos 10 caracteres.");
      return;
    }

    setSubmitting(true);

    try {
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/public_contact_send`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
          },
          body: JSON.stringify({
            name: form.name,
            email: form.email,
            company: form.company,
            phone: form.phone,
            message: form.message,
            website: form.website,
          }),
        }
      );

      const data = await response.json();

      if (!response.ok || !data.ok) {
        throw new Error(data.error || "No se pudo enviar el formulario");
      }

      setSuccessMessage(
        "Solicitud enviada correctamente. Te responderemos lo antes posible."
      );
      setForm(initialForm);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "No se pudo enviar la solicitud";
      setErrorMessage(message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="public-page h-screen overflow-hidden bg-[#020617] text-white">
      <WebNavbar />

      <div
        id="public-page-scroll"
        ref={scrollRef}
        className="h-[calc(100vh-96px)] overflow-y-auto overflow-x-hidden"
      >
        <main className="pb-24 pt-10">
          <section className="px-6">
            <div className="mx-auto max-w-7xl">
              <div className="grid gap-16 lg:grid-cols-2">
                <div>
                  <h2 className="mb-6 max-w-2xl font-display text-4xl font-bold leading-[1.05] text-white md:text-5xl">
                    La nueva generación de inteligencia para hoteles
                  </h2>

                  <p className="mb-10 max-w-xl text-base leading-8 text-slate-400 md:text-lg">
                    Debacu utiliza inteligencia artificial para analizar reservas,
                    detectar riesgos y optimizar tu revenue. Déjanos tus datos y te
                    mostraremos cómo aplicarlo en tu alojamiento.
                  </p>

                  <div className="space-y-7">
                    <div className="flex items-center gap-4">
                      <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-blue-500/20 bg-blue-600/10">
                        <Mail className="h-5 w-5 text-blue-500" />
                      </div>
                      <div>
                        <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">
                          Email
                        </p>
                        <p className="text-lg font-medium text-white">
                          contacto@debacu.com
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-4">
                      <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-emerald-500/20 bg-emerald-600/10">
                        <Phone className="h-5 w-5 text-emerald-500" />
                      </div>
                      <div>
                        <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">
                          Teléfono
                        </p>
                        <p className="text-lg font-medium text-white">
                          +34 672 336 572
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-4">
                      <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-violet-500/20 bg-violet-600/10">
                        <MapPin className="h-5 w-5 text-violet-500" />
                      </div>
                      <div>
                        <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">
                          Ubicación
                        </p>
                        <p className="text-lg font-medium text-white">
                          Madrid - España
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="mt-10 rounded-2xl border border-white/[0.08] bg-white/[0.03] p-6">
                    <p className="text-sm leading-7 text-slate-400">
                     Únete a los alojamientos que ya están utilizando Debacu para tomar decisiones con datos reales.
                     Nuestro equipo revisará tu solicitud y te contactará para mostrarte cómo aplicar Debacu en tu hotel. 
                    </p>
                   
                  </div>
                </div>

                <div className="glass-card border-white/[0.05] p-8">
                  <form className="space-y-6" onSubmit={handleSubmit}>
                    <div className="grid gap-6 md:grid-cols-2">
                      <div className="space-y-2">
                        <label className="text-xs font-bold uppercase text-slate-500">
                          Nombre
                        </label>
                        <input
                          type="text"
                          value={form.name}
                          onChange={updateField("name")}
                          className="w-full rounded-lg border border-white/10 bg-white/5 p-3 text-sm text-white placeholder:text-slate-600 focus:border-blue-500/50 focus:outline-none"
                          placeholder="Tu nombre"
                        />
                      </div>

                      <div className="space-y-2">
                        <label className="text-xs font-bold uppercase text-slate-500">
                          Email
                        </label>
                        <input
                          type="email"
                          value={form.email}
                          onChange={updateField("email")}
                          className="w-full rounded-lg border border-white/10 bg-white/5 p-3 text-sm text-white placeholder:text-slate-600 focus:border-blue-500/50 focus:outline-none"
                          placeholder="tu@email.com"
                        />
                      </div>
                    </div>

                    <div className="grid gap-6 md:grid-cols-2">
                      <div className="space-y-2">
                        <label className="text-xs font-bold uppercase text-slate-500">
                          Hotel / Empresa
                        </label>
                        <input
                          type="text"
                          value={form.company}
                          onChange={updateField("company")}
                          className="w-full rounded-lg border border-white/10 bg-white/5 p-3 text-sm text-white placeholder:text-slate-600 focus:border-blue-500/50 focus:outline-none"
                          placeholder="Nombre de tu alojamiento"
                        />
                      </div>

                      <div className="space-y-2">
                        <label className="text-xs font-bold uppercase text-slate-500">
                          Teléfono
                        </label>
                        <input
                          type="text"
                          value={form.phone}
                          onChange={updateField("phone")}
                          className="w-full rounded-lg border border-white/10 bg-white/5 p-3 text-sm text-white placeholder:text-slate-600 focus:border-blue-500/50 focus:outline-none"
                          placeholder="+34..."
                        />
                      </div>
                    </div>

                    <div className="hidden">
                      <label htmlFor="website">Website</label>
                      <input
                        id="website"
                        type="text"
                        value={form.website}
                        onChange={updateField("website")}
                        autoComplete="off"
                        tabIndex={-1}
                      />
                    </div>

                    <div className="space-y-2">
                      <label className="text-xs font-bold uppercase text-slate-500">
                        Mensaje
                      </label>
                      <textarea
                        rows={5}
                        value={form.message}
                        onChange={updateField("message")}
                        className="w-full rounded-lg border border-white/10 bg-white/5 p-3 text-sm text-white placeholder:text-slate-600 focus:border-blue-500/50 focus:outline-none"
                        placeholder="Cuéntanos qué necesitas"
                      />
                    </div>

                    {successMessage && (
                      <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-300">
                        {successMessage}
                      </div>
                    )}

                    {errorMessage && (
                      <div className="rounded-lg border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-300">
                        {errorMessage}
                      </div>
                    )}

                    <button
                      type="submit"
                      disabled={submitting}
                      className="btn-primary w-full py-4 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {submitting ? "Enviando..." : "Enviar mensaje"}
                    </button>

                    <p className="text-[11px] leading-relaxed text-slate-600">
                      Esta solicitud llegará a contacto@debacu.com para su revisión
                      comercial y funcional. 
                    </p> <p>
                      Respuesta habitual en menos de 24 horas.
                    </p>

                  </form>
                </div>
              </div>
            </div>
          </section>
        </main>

        <WebFooter />
      </div>
    </div>
  );
}