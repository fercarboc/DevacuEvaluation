// src/pages/public/SolicitarAccesoPage.tsx
import React, { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import LegalDialog, { type TabKey } from "@/pages/legal/LegalDialog";
import {
  createDebacuEvalAccessRequestDraft,
  finalizeDebacuEvalAccessRequest,
  generateTermsAcceptancePdf,
  type AcceptanceProof,
  type PropertyType,
} from "@/services/debacu_eval_accessRequests.service";
import {
  ShieldCheck,
  TrendingUp,
  Zap,
  LayoutDashboard,
  ArrowLeft,
  Building2,
} from "lucide-react";

const cx = (...cls: Array<string | false | undefined | null>) =>
  cls.filter(Boolean).join(" ");

type FormState = {
  company_name: string;
  legal_name: string;
  cif: string;
  address: string;
  city: string;
  country: string;
  property_type: PropertyType;
  rooms_count: string;
  website: string;
  contact_name: string;
  contact_role: string;
  email: string;
  phone: string;
  accepted_terms: boolean;
  accepted_professional_use: boolean;
  notes: string;
};

const MAX_NOTES = 500;

type ToastState = {
  open: boolean;
  message: string;
  type: "success" | "error" | "info";
};

export default function SolicitarAccesoPage() {
  const nav = useNavigate();

  const [loading, setLoading] = useState(false);
  const [legalOpen, setLegalOpen] = useState(false);
  const [legalTab, setLegalTab] = useState<TabKey>("terminos");
  const [acceptLoading, setAcceptLoading] = useState(false);
  const [requestId, setRequestId] = useState<string | null>(null);
  const [acceptanceProof, setAcceptanceProof] = useState<AcceptanceProof | null>(
    null
  );

  const [toast, setToast] = useState<ToastState>({
    open: false,
    message: "",
    type: "info",
  });

  const showToast = (message: string, type: ToastState["type"] = "info") => {
    setToast({ open: true, message, type });
    window.setTimeout(() => {
      setToast((t) => ({ ...t, open: false }));
    }, 3200);
  };

  const [form, setForm] = useState<FormState>({
    company_name: "",
    legal_name: "",
    cif: "",
    address: "",
    city: "",
    country: "ESP",
    property_type: "HOTEL",
    rooms_count: "",
    website: "",
    contact_name: "",
    contact_role: "",
    email: "",
    phone: "",
    accepted_terms: false,
    accepted_professional_use: false,
    notes: "",
  });

  const onChange = (k: keyof FormState, v: any) =>
    setForm((p) => ({ ...p, [k]: v }));

  const roomsCountNumber = useMemo(() => {
    const n = Number(form.rooms_count);
    return Number.isFinite(n) && n > 0 ? n : undefined;
  }, [form.rooms_count]);

  const canOpenTerms = useMemo(() => {
    return (
      form.company_name.trim().length > 1 &&
      form.cif.trim().length > 2 &&
      form.contact_name.trim().length > 1 &&
      form.email.trim().includes("@")
    );
  }, [form.company_name, form.cif, form.contact_name, form.email]);

  const canSubmit = useMemo(() => {
    return (
      !!requestId &&
      form.accepted_terms === true &&
      form.accepted_professional_use === true &&
      form.company_name.trim().length > 1 &&
      form.cif.trim().length > 2 &&
      form.contact_name.trim().length > 1 &&
      form.email.trim().includes("@")
    );
  }, [requestId, form]);

  async function ensureDraft(): Promise<string> {
    if (requestId) return requestId;

    const draftInput = {
      company_name: form.company_name.trim(),
      legal_name: form.legal_name.trim() || undefined,
      cif: form.cif.trim(),
      address: form.address.trim() || undefined,
      city: form.city.trim() || undefined,
      country: form.country.trim() || "ESP",
      property_type: form.property_type,
      rooms_count: roomsCountNumber,
      website: form.website.trim() || undefined,
      contact_name: form.contact_name.trim(),
      contact_role: form.contact_role.trim() || undefined,
      email: form.email.trim(),
      phone: form.phone.trim() || undefined,
      accepted_professional_use: !!form.accepted_professional_use,
      notes: form.notes.trim() || undefined,
    };

    const { id } = await createDebacuEvalAccessRequestDraft(draftInput);
    setRequestId(id);
    return id;
  }

  async function openTerms() {
    if (!canOpenTerms) return;

    try {
      setLoading(true);
      await ensureDraft();
      setLegalTab("terminos");
      setLegalOpen(true);
    } catch (e: any) {
      console.error(e);
      showToast(e?.message ?? "No se pudo iniciar la solicitud.", "error");
    } finally {
      setLoading(false);
    }
  }

  async function acceptTermsInsideDialog() {
    try {
      setAcceptLoading(true);

      const id = await ensureDraft();

      const { proof } = await generateTermsAcceptancePdf({
        request_id: id,
        email: form.email,
      });

      setAcceptanceProof(proof);
      setForm((p) => ({ ...p, accepted_terms: true }));

      setLegalOpen(false);
      showToast("Aceptado. Justificante generado y guardado.", "success");
    } catch (e: any) {
      console.error(e);
      showToast(
        e?.message ?? "No se pudo generar el justificante de aceptación.",
        "error"
      );
    } finally {
      setAcceptLoading(false);
    }
  }

  async function submitRequest() {
    if (!canSubmit || !requestId) return;

    try {
      setLoading(true);

      await finalizeDebacuEvalAccessRequest({
        request_id: requestId,
        accepted_professional_use: !!form.accepted_professional_use,
      });

      showToast("Solicitud enviada. La revisaremos manualmente.", "success");
      nav("/solicitud-enviada");
    } catch (e: any) {
      console.error(e);
      showToast(e?.message ?? "No se pudo enviar la solicitud.", "error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#020617]">
      <div className="min-h-screen md:grid md:grid-cols-12">
        {/* LEFT PANEL */}
        <aside className="relative hidden md:col-span-5 md:flex lg:col-span-5 overflow-hidden border-r border-white/[0.05]">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,_rgba(37,99,235,0.16),_transparent_35%),radial-gradient(circle_at_bottom_left,_rgba(124,58,237,0.12),_transparent_28%)]" />
          <div className="absolute inset-0 bg-[#020617]" />

          <div className="relative z-10 flex h-full w-full flex-col justify-between px-10 py-10 lg:px-14 lg:py-12">
            <div>
              <button
                type="button"
                onClick={() => nav("/")}
                className="mb-10 inline-flex items-center gap-2 text-sm text-slate-500 transition-colors hover:text-white"
              >
                <ArrowLeft size={16} />
                Volver
              </button>

              <div className="mb-8 inline-flex items-center gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-600 shadow-xl shadow-blue-600/30">
                  <Building2 className="h-6 w-6 text-white" />
                </div>
                <div>
                  <div className="text-xl font-bold text-white">Debacu</div>
                  <div className="text-sm text-slate-400">Evaluation360</div>
                </div>
              </div>

              <div className="max-w-md">
                <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-blue-500/20 bg-blue-500/10 px-3 py-1 text-[10px] font-bold uppercase tracking-widest text-blue-400">
                  <Zap size={12} />
                  Acceso profesional
                </div>

                <h1 className="text-3xl font-display font-bold leading-tight text-white lg:text-4xl">
                  Solicita acceso a un entorno SaaS diseñado para hospitality
                </h1>

                <p className="mt-5 text-base leading-relaxed text-slate-400">
                  Debacu combina evaluación de riesgo, revenue intelligence y
                  análisis operativo en una plataforma profesional orientada a
                  hoteles, apartamentos y alojamientos.
                </p>
              </div>

              <div className="mt-10 grid grid-cols-2 gap-4">
                {[
                  {
                    icon: <ShieldCheck size={20} />,
                    label: "Análisis de riesgo",
                  },
                  {
                    icon: <TrendingUp size={20} />,
                    label: "Revenue intelligence",
                  },
                  {
                    icon: <Zap size={20} />,
                    label: "Alertas operativas",
                  },
                  {
                    icon: <LayoutDashboard size={20} />,
                    label: "Decisiones con datos",
                  },
                ].map((item, i) => (
                  <div
                    key={i}
                    className="rounded-2xl border border-white/[0.06] bg-white/[0.03] p-4 backdrop-blur-sm"
                  >
                    <div className="mb-3 text-blue-400">{item.icon}</div>
                    <div className="text-[11px] font-bold uppercase tracking-widest text-slate-300">
                      {item.label}
                    </div>
                  </div>
                ))}
              </div>

              <div className="mt-10 rounded-3xl border border-white/[0.06] bg-white/[0.03] p-5 backdrop-blur-sm">
                <div className="mb-5 flex items-center justify-between">
                  <div className="h-2 w-24 rounded-full bg-white/10" />
                  <div className="h-2 w-12 rounded-full bg-blue-500/40" />
                </div>

                <div className="space-y-3">
                  <div className="h-1.5 w-full rounded-full bg-white/5" />
                  <div className="h-1.5 w-4/5 rounded-full bg-white/5" />
                  <div className="h-1.5 w-2/3 rounded-full bg-white/5" />
                </div>

                <div className="mt-6 flex h-20 items-end gap-2">
                  {[42, 68, 48, 88, 64, 76].map((h, i) => (
                    <div
                      key={i}
                      style={{ height: `${h}%` }}
                      className="flex-1 rounded-t-md bg-blue-600/20"
                    />
                  ))}
                </div>
              </div>
            </div>

            <div className="pt-8 text-xs text-white/45">
              © {new Date().getFullYear()} Debacu · Uso profesional · RGPD/LOPDGDD
            </div>
          </div>
        </aside>

        {/* RIGHT PANEL */}
        <main className="md:col-span-7 lg:col-span-7">
          <div className="border-b border-white/[0.06] bg-[#020617] md:hidden">
            <div className="mx-auto max-w-xl px-4 py-4">
              <div className="text-sm font-semibold text-white">Solicitar acceso</div>
              <div className="mt-1 text-xs text-slate-400">
                Acceso restringido. Revisamos manualmente.
              </div>
            </div>
          </div>

          <div className="h-[100vh] overflow-y-auto bg-slate-50">
            <div className="mx-auto max-w-xl px-4 py-8 md:px-8 md:py-10">
              <div className="hidden md:block">
                <h1 className="text-3xl font-semibold text-slate-900">
                  Solicitud de acceso
                </h1>
                <p className="mt-2 text-sm text-slate-600">
                  Completa tus datos. Revisaremos la solicitud y, si procede,
                  recibirás una invitación para crear tu contraseña.
                </p>
              </div>

              <div className="mt-6 rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm md:p-7">
                {/* Responsable */}
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <div>
                    <label className="text-sm font-medium text-slate-700">
                      Nombre y apellidos <span className="text-rose-600">*</span>
                    </label>
                    <input
                      value={form.contact_name}
                      onChange={(e) => onChange("contact_name", e.target.value)}
                      className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-slate-300 focus:ring-4 focus:ring-slate-100"
                      placeholder="Nombre del responsable"
                      autoComplete="name"
                    />
                  </div>

                  <div>
                    <label className="text-sm font-medium text-slate-700">Cargo</label>
                    <input
                      value={form.contact_role}
                      onChange={(e) => onChange("contact_role", e.target.value)}
                      className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-slate-300 focus:ring-4 focus:ring-slate-100"
                      placeholder="Gerente, Recepción, Dirección..."
                    />
                  </div>

                  <div>
                    <label className="text-sm font-medium text-slate-700">
                      Email corporativo <span className="text-rose-600">*</span>
                    </label>
                    <input
                      value={form.email}
                      onChange={(e) => onChange("email", e.target.value)}
                      className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-slate-300 focus:ring-4 focus:ring-slate-100"
                      placeholder="correo@empresa.com"
                      autoComplete="email"
                    />
                  </div>

                  <div>
                    <label className="text-sm font-medium text-slate-700">Teléfono</label>
                    <input
                      value={form.phone}
                      onChange={(e) => onChange("phone", e.target.value)}
                      className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-slate-300 focus:ring-4 focus:ring-slate-100"
                      placeholder="600000000"
                      autoComplete="tel"
                    />
                  </div>
                </div>

                {/* Empresa */}
                <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2">
                  <div>
                    <label className="text-sm font-medium text-slate-700">
                      Empresa / Alojamiento <span className="text-rose-600">*</span>
                    </label>
                    <input
                      value={form.company_name}
                      onChange={(e) => onChange("company_name", e.target.value)}
                      className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-slate-300 focus:ring-4 focus:ring-slate-100"
                      placeholder="Nombre comercial"
                    />
                  </div>

                  <div>
                    <label className="text-sm font-medium text-slate-700">Razón social</label>
                    <input
                      value={form.legal_name}
                      onChange={(e) => onChange("legal_name", e.target.value)}
                      className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-slate-300 focus:ring-4 focus:ring-slate-100"
                      placeholder="S.L., S.A., autónomo..."
                    />
                  </div>

                  <div>
                    <label className="text-sm font-medium text-slate-700">
                      CIF <span className="text-rose-600">*</span>
                    </label>
                    <input
                      value={form.cif}
                      onChange={(e) => onChange("cif", e.target.value)}
                      className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-slate-300 focus:ring-4 focus:ring-slate-100"
                      placeholder="B12345678"
                    />
                  </div>

                  <div>
                    <label className="text-sm font-medium text-slate-700">
                      Tipo de establecimiento
                    </label>
                    <select
                      value={form.property_type}
                      onChange={(e) =>
                        onChange("property_type", e.target.value as PropertyType)
                      }
                      className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-slate-300 focus:ring-4 focus:ring-slate-100"
                    >
                      <option value="HOTEL">Hotel</option>
                      <option value="RURAL">Casa rural</option>
                      <option value="APARTMENTS">Apartamentos</option>
                      <option value="HOSTEL">Hostel</option>
                      <option value="OTHER">Otro</option>
                    </select>
                  </div>

                  <div>
                    <label className="text-sm font-medium text-slate-700">Dirección</label>
                    <input
                      value={form.address}
                      onChange={(e) => onChange("address", e.target.value)}
                      className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-slate-300 focus:ring-4 focus:ring-slate-100"
                      placeholder="Calle, número..."
                    />
                  </div>

                  <div>
                    <label className="text-sm font-medium text-slate-700">Ciudad</label>
                    <input
                      value={form.city}
                      onChange={(e) => onChange("city", e.target.value)}
                      className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-slate-300 focus:ring-4 focus:ring-slate-100"
                      placeholder="Localidad"
                    />
                  </div>

                  <div>
                    <label className="text-sm font-medium text-slate-700">País</label>
                    <input
                      value={form.country}
                      onChange={(e) => onChange("country", e.target.value)}
                      className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-slate-300 focus:ring-4 focus:ring-slate-100"
                      placeholder="ESP"
                    />
                  </div>

                  <div>
                    <label className="text-sm font-medium text-slate-700">
                      Nº habitaciones
                    </label>
                    <input
                      value={form.rooms_count}
                      onChange={(e) => onChange("rooms_count", e.target.value)}
                      className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-slate-300 focus:ring-4 focus:ring-slate-100"
                      placeholder="10"
                      inputMode="numeric"
                    />
                  </div>

                  <div className="md:col-span-2">
                    <label className="text-sm font-medium text-slate-700">Web</label>
                    <input
                      value={form.website}
                      onChange={(e) => onChange("website", e.target.value)}
                      className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-slate-300 focus:ring-4 focus:ring-slate-100"
                      placeholder="https://..."
                    />
                  </div>
                </div>

                {/* Declaraciones */}
                <div className="mt-8 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <div className="text-sm font-semibold text-slate-800">
                    Declaraciones
                  </div>

                  <div className="mt-3 flex items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-4">
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-slate-900">
                        Términos y condiciones <span className="text-rose-600">*</span>
                      </div>
                      <div className="mt-1 text-sm text-slate-600">
                        Debes abrir el documento y aceptarlo expresamente. Generaremos
                        un justificante PDF con fecha y tus datos.
                      </div>

                      {form.accepted_terms && (
                        <div className="mt-2 text-xs font-semibold text-emerald-700">
                          ✔ Aceptado (justificante generado)
                        </div>
                      )}
                    </div>

                    <button
                      onClick={openTerms}
                      disabled={loading || !canOpenTerms}
                      className={cx(
                        "shrink-0 rounded-xl px-4 py-2 text-sm font-semibold ring-1 ring-inset",
                        loading || !canOpenTerms
                          ? "bg-slate-200 text-slate-500 ring-slate-200"
                          : "bg-slate-900 text-white ring-slate-900 hover:bg-slate-800"
                      )}
                    >
                      Ver y aceptar
                    </button>
                  </div>

                  <label className="mt-4 flex items-start gap-3 text-sm text-slate-700">
                    <input
                      type="checkbox"
                      checked={form.accepted_professional_use}
                      onChange={(e) =>
                        onChange("accepted_professional_use", e.target.checked)
                      }
                      className="mt-1 h-4 w-4"
                    />
                    <span>
                      Declaro uso profesional y responsable de los datos{" "}
                      <span className="text-rose-600">*</span>
                    </span>
                  </label>

                  <div className="mt-4">
                    <label className="text-sm font-medium text-slate-700">
                      Observaciones (opcional)
                    </label>
                    <textarea
                      value={form.notes}
                      onChange={(e) =>
                        onChange("notes", e.target.value.slice(0, MAX_NOTES))
                      }
                      className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-300 focus:ring-4 focus:ring-slate-100"
                      rows={4}
                      placeholder="Máx 500 caracteres..."
                    />
                    <div className="mt-1 text-xs text-slate-500">
                      Máx {MAX_NOTES} caracteres.
                    </div>
                  </div>
                </div>

                {/* Footer */}
                <div className="mt-6 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                  <p className="text-sm text-slate-600">
                    Revisamos manualmente. Si aprobamos, recibirás un email de
                    invitación para crear tu contraseña.
                  </p>

                  <button
                    onClick={submitRequest}
                    disabled={loading || !canSubmit}
                    className={cx(
                      "w-full rounded-2xl px-5 py-3 text-sm font-semibold ring-1 ring-inset md:w-auto",
                      loading || !canSubmit
                        ? "bg-slate-200 text-slate-500 ring-slate-200"
                        : "bg-indigo-600 text-white ring-indigo-600 hover:bg-indigo-700"
                    )}
                  >
                    {loading ? "Enviando..." : "Enviar solicitud"}
                  </button>
                </div>
              </div>

              <LegalDialog
                open={legalOpen}
                onClose={() => setLegalOpen(false)}
                customerEmail={form.email}
                defaultTab={legalTab}
                onAccept={acceptTermsInsideDialog}
                accepting={acceptLoading}
                acceptLabel="Aceptar términos"
              />

              <div className="h-8" />
            </div>
          </div>

          {/* Toast */}
          {toast.open && (
            <div className="fixed bottom-6 right-6 z-50">
              <div
                className={cx(
                  "rounded-2xl px-4 py-3 text-sm font-semibold shadow-lg ring-1",
                  toast.type === "success" &&
                    "bg-emerald-600 text-white ring-emerald-700/30",
                  toast.type === "error" &&
                    "bg-rose-600 text-white ring-rose-700/30",
                  toast.type === "info" &&
                    "bg-slate-900 text-white ring-slate-700/30"
                )}
              >
                <div className="flex items-start gap-3">
                  <div className="min-w-0">{toast.message}</div>

                  <button
                    type="button"
                    onClick={() => setToast((t) => ({ ...t, open: false }))}
                    className="shrink-0 rounded-lg px-2 py-1 text-xs font-bold opacity-80 hover:opacity-100"
                    aria-label="Cerrar"
                    title="Cerrar"
                  >
                    ✕
                  </button>
                </div>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}