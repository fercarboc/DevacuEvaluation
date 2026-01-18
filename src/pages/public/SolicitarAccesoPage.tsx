import React, { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { createDebacuEvalAccessRequest } from "@/services/debacu_eval_accessRequests.service";

type PropertyType = "HOTEL" | "RURAL" | "APARTMENTS" | "HOSTEL" | "OTHER";

export function SolicitarAccesoPage() {
  const nav = useNavigate();
  const [loading, setLoading] = useState(false);

  const [form, setForm] = useState({
    company_name: "",
    legal_name: "",
    cif: "",
    address: "",
    city: "",
    country: "ESP",
    property_type: "HOTEL" as PropertyType,
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

  const canSubmit = useMemo(() => {
    if (!form.company_name.trim()) return false;
    if (!form.cif.trim()) return false;
    if (!form.contact_name.trim()) return false;
    if (!form.email.trim() || !form.email.includes("@")) return false;
    if (!form.accepted_terms) return false;
    if (!form.accepted_professional_use) return false;
    return true;
  }, [form]);

  const onChange = (k: string, v: any) => setForm((p) => ({ ...p, [k]: v }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;

    setLoading(true);
    try {
      const rooms = form.rooms_count.trim() ? Number(form.rooms_count) : undefined;

      const res = await createDebacuEvalAccessRequest({
        company_name: form.company_name,
        legal_name: form.legal_name,
        cif: form.cif,
        address: form.address,
        city: form.city,
        country: form.country,
        property_type: form.property_type,
        rooms_count: Number.isFinite(rooms as any) ? rooms : undefined,
        website: form.website,
        contact_name: form.contact_name,
        contact_role: form.contact_role,
        email: form.email,
        phone: form.phone,
        accepted_terms: form.accepted_terms,
        accepted_professional_use: form.accepted_professional_use,
        notes: form.notes,
      });

      nav(`/solicitud-enviada?id=${encodeURIComponent(res.id)}`);
    } catch (err: any) {
      alert(err?.message ?? "Error enviando solicitud");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="max-w-3xl mx-auto px-4 py-12">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-slate-900">Solicitar acceso</h1>
          <p className="text-slate-600 mt-2">
            Acceso restringido a profesionales. Las solicitudes se revisan manualmente.
          </p>
        </div>

        <form onSubmit={submit} className="bg-white border border-slate-200 rounded-2xl shadow-sm p-6 space-y-8">
          {/* Empresa */}
          <section className="space-y-4">
            <h2 className="text-sm font-semibold text-slate-900">Datos del establecimiento</h2>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-medium text-slate-600">Nombre comercial *</label>
                <input
                  className="mt-1 w-full border rounded-lg px-3 py-2 text-sm"
                  value={form.company_name}
                  onChange={(e) => onChange("company_name", e.target.value)}
                />
              </div>

              <div>
                <label className="text-xs font-medium text-slate-600">CIF *</label>
                <input
                  className="mt-1 w-full border rounded-lg px-3 py-2 text-sm"
                  value={form.cif}
                  onChange={(e) => onChange("cif", e.target.value)}
                />
              </div>

              <div>
                <label className="text-xs font-medium text-slate-600">Tipo *</label>
                <select
                  className="mt-1 w-full border rounded-lg px-3 py-2 text-sm"
                  value={form.property_type}
                  onChange={(e) => onChange("property_type", e.target.value)}
                >
                  <option value="HOTEL">Hotel</option>
                  <option value="RURAL">Casa rural</option>
                  <option value="APARTMENTS">Apartamentos</option>
                  <option value="HOSTEL">Hostel</option>
                  <option value="OTHER">Otro</option>
                </select>
              </div>

              <div>
                <label className="text-xs font-medium text-slate-600">Nº habitaciones</label>
                <input
                  type="number"
                  min={0}
                  className="mt-1 w-full border rounded-lg px-3 py-2 text-sm"
                  value={form.rooms_count}
                  onChange={(e) => onChange("rooms_count", e.target.value)}
                />
              </div>

              <div>
                <label className="text-xs font-medium text-slate-600">Ciudad</label>
                <input
                  className="mt-1 w-full border rounded-lg px-3 py-2 text-sm"
                  value={form.city}
                  onChange={(e) => onChange("city", e.target.value)}
                />
              </div>

              <div>
                <label className="text-xs font-medium text-slate-600">País (código)</label>
                <input
                  className="mt-1 w-full border rounded-lg px-3 py-2 text-sm"
                  value={form.country}
                  onChange={(e) => onChange("country", e.target.value.toUpperCase())}
                />
              </div>

              <div className="md:col-span-2">
                <label className="text-xs font-medium text-slate-600">Dirección</label>
                <input
                  className="mt-1 w-full border rounded-lg px-3 py-2 text-sm"
                  value={form.address}
                  onChange={(e) => onChange("address", e.target.value)}
                />
              </div>

              <div className="md:col-span-2">
                <label className="text-xs font-medium text-slate-600">Web</label>
                <input
                  className="mt-1 w-full border rounded-lg px-3 py-2 text-sm"
                  value={form.website}
                  onChange={(e) => onChange("website", e.target.value)}
                />
              </div>
            </div>
          </section>

          {/* Responsable */}
          <section className="space-y-4">
            <h2 className="text-sm font-semibold text-slate-900">Responsable</h2>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-medium text-slate-600">Nombre y apellidos *</label>
                <input
                  className="mt-1 w-full border rounded-lg px-3 py-2 text-sm"
                  value={form.contact_name}
                  onChange={(e) => onChange("contact_name", e.target.value)}
                />
              </div>

              <div>
                <label className="text-xs font-medium text-slate-600">Cargo</label>
                <input
                  className="mt-1 w-full border rounded-lg px-3 py-2 text-sm"
                  value={form.contact_role}
                  onChange={(e) => onChange("contact_role", e.target.value)}
                />
              </div>

              <div>
                <label className="text-xs font-medium text-slate-600">Email corporativo *</label>
                <input
                  className="mt-1 w-full border rounded-lg px-3 py-2 text-sm"
                  value={form.email}
                  onChange={(e) => onChange("email", e.target.value)}
                />
              </div>

              <div>
                <label className="text-xs font-medium text-slate-600">Teléfono</label>
                <input
                  className="mt-1 w-full border rounded-lg px-3 py-2 text-sm"
                  value={form.phone}
                  onChange={(e) => onChange("phone", e.target.value)}
                />
              </div>
            </div>
          </section>

          {/* Declaraciones */}
          <section className="space-y-3">
            <h2 className="text-sm font-semibold text-slate-900">Declaraciones</h2>

            <label className="flex items-start gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                className="mt-1"
                checked={form.accepted_terms}
                onChange={(e) => onChange("accepted_terms", e.target.checked)}
              />
              <span>Acepto términos y condiciones de uso *</span>
            </label>

            <label className="flex items-start gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                className="mt-1"
                checked={form.accepted_professional_use}
                onChange={(e) => onChange("accepted_professional_use", e.target.checked)}
              />
              <span>Declaro uso profesional y responsable de los datos *</span>
            </label>

            <div>
              <label className="text-xs font-medium text-slate-600">Observaciones (opcional)</label>
              <textarea
                className="mt-1 w-full border rounded-lg px-3 py-2 text-sm"
                rows={4}
                maxLength={500}
                value={form.notes}
                onChange={(e) => onChange("notes", e.target.value)}
              />
              <p className="text-xs text-slate-400 mt-1">Máx 500 caracteres.</p>
            </div>
          </section>

          <div className="pt-2 flex items-center justify-between">
            <p className="text-xs text-slate-500">
              Revisamos manualmente. Si aprobamos, recibirás un email de invitación para crear tu contraseña.
            </p>

            <button
              disabled={!canSubmit || loading}
              className="px-5 py-2.5 rounded-lg bg-indigo-600 text-white text-sm font-semibold disabled:opacity-50"
            >
              {loading ? "Enviando..." : "Enviar solicitud"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
