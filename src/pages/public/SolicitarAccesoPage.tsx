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
  rooms_count: string; // input text -> number
  website: string;
  contact_name: string;
  contact_role: string;
  email: string;
  phone: string;

  accepted_terms: boolean; // SOLO tras PDF ok
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
    // mínimos para poder generar "draft" (legacy) con algo coherente
    // realmente crea una solicitud PENDING (modelo nuevo)
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
    // ⚠️ legacy name: this creates/returns a PENDING request
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

      const { proof } = await generateTermsAcceptancePdf({ request_id: id });

      setAcceptanceProof(proof);
      setForm((p) => ({ ...p, accepted_terms: true }));

      setLegalOpen(false);

      // ✅ BONUS: feedback claro sin abrir PDF
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
    <div className="h-[100vh] overflow-hidden bg-slate-50">
      {/* zona con scroll */}
      <div className="h-full overflow-y-auto">
        <div className="mx-auto max-w-4xl px-4 py-10">
          <h1 className="text-3xl font-semibold text-slate-900">
            Solicitar acceso
          </h1>
          <p className="mt-2 text-slate-600">
            Acceso restringido a profesionales. Las solicitudes se revisan
            manualmente.
          </p>

          <div className="mt-6 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            {/* Responsable */}
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div>
                <label className="text-sm font-medium text-slate-700">
                  Nombre y apellidos *
                </label>
                <input
                  value={form.contact_name}
                  onChange={(e) => onChange("contact_name", e.target.value)}
                  className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                  placeholder="Nombre del responsable"
                />
              </div>

              <div>
                <label className="text-sm font-medium text-slate-700">
                  Cargo
                </label>
                <input
                  value={form.contact_role}
                  onChange={(e) => onChange("contact_role", e.target.value)}
                  className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                  placeholder="Gerente, Recepción, Dirección..."
                />
              </div>

              <div>
                <label className="text-sm font-medium text-slate-700">
                  Email corporativo *
                </label>
                <input
                  value={form.email}
                  onChange={(e) => onChange("email", e.target.value)}
                  className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                  placeholder="correo@empresa.com"
                />
              </div>

              <div>
                <label className="text-sm font-medium text-slate-700">
                  Teléfono
                </label>
                <input
                  value={form.phone}
                  onChange={(e) => onChange("phone", e.target.value)}
                  className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                  placeholder="600000000"
                />
              </div>
            </div>

            {/* Empresa */}
            <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2">
              <div>
                <label className="text-sm font-medium text-slate-700">
                  Empresa / Alojamiento *
                </label>
                <input
                  value={form.company_name}
                  onChange={(e) => onChange("company_name", e.target.value)}
                  className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                  placeholder="Nombre comercial"
                />
              </div>

              <div>
                <label className="text-sm font-medium text-slate-700">
                  Razón social
                </label>
                <input
                  value={form.legal_name}
                  onChange={(e) => onChange("legal_name", e.target.value)}
                  className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                  placeholder="S.L., S.A., autónomo..."
                />
              </div>

              <div>
                <label className="text-sm font-medium text-slate-700">
                  CIF *
                </label>
                <input
                  value={form.cif}
                  onChange={(e) => onChange("cif", e.target.value)}
                  className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
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
                  className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                >
                  <option value="HOTEL">Hotel</option>
                  <option value="RURAL">Casa rural</option>
                  <option value="APARTMENTS">Apartamentos</option>
                  <option value="HOSTEL">Hostel</option>
                  <option value="OTHER">Otro</option>
                </select>
              </div>

              <div>
                <label className="text-sm font-medium text-slate-700">
                  Dirección
                </label>
                <input
                  value={form.address}
                  onChange={(e) => onChange("address", e.target.value)}
                  className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                  placeholder="Calle, número..."
                />
              </div>

              <div>
                <label className="text-sm font-medium text-slate-700">
                  Ciudad
                </label>
                <input
                  value={form.city}
                  onChange={(e) => onChange("city", e.target.value)}
                  className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                  placeholder="Localidad"
                />
              </div>

              <div>
                <label className="text-sm font-medium text-slate-700">
                  País
                </label>
                <input
                  value={form.country}
                  onChange={(e) => onChange("country", e.target.value)}
                  className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
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
                  className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                  placeholder="10"
                  inputMode="numeric"
                />
              </div>

              <div className="md:col-span-2">
                <label className="text-sm font-medium text-slate-700">Web</label>
                <input
                  value={form.website}
                  onChange={(e) => onChange("website", e.target.value)}
                  className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
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
                    Términos y condiciones *
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
                    "shrink-0 rounded-xl px-4 py-2 text-sm font-semibold",
                    loading || !canOpenTerms
                      ? "bg-slate-200 text-slate-500"
                      : "bg-slate-900 text-white hover:bg-slate-800"
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
                <span>Declaro uso profesional y responsable de los datos *</span>
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
                  className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                  rows={4}
                  placeholder="Máx 500 caracteres..."
                />
                <div className="mt-1 text-xs text-slate-500">
                  Máx {MAX_NOTES} caracteres.
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="mt-6 flex items-center justify-between">
              <p className="text-sm text-slate-600">
                Revisamos manualmente. Si aprobamos, recibirás un email de
                invitación para crear tu contraseña.
              </p>

              <button
                onClick={submitRequest}
                disabled={loading || !canSubmit}
                className={cx(
                  "rounded-2xl px-5 py-3 text-sm font-semibold",
                  loading || !canSubmit
                    ? "bg-slate-200 text-slate-500"
                    : "bg-indigo-600 text-white hover:bg-indigo-700"
                )}
              >
                {loading ? "Enviando..." : "Enviar solicitud"}
              </button>
            </div>
          </div>

          <LegalDialog
            open={legalOpen}
            onClose={() => setLegalOpen(false)}
            defaultTab={legalTab}
            onAccept={acceptTermsInsideDialog}
            accepting={acceptLoading}
            acceptLabel="Aceptar términos"
          />
        </div>
      </div>

      {/* ✅ Toast */}
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
    </div>
  );
}
