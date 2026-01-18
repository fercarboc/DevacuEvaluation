// src/components/RatingForm.tsx
import React, { useMemo, useState } from "react";
import { Save, AlertCircle, CheckCircle, Shield, FileText, Info } from "lucide-react";
import { StarRating } from "./StarRating";
import { addEvaluation } from "../services/evaluationService";

interface RatingFormProps {
  currentCustomerId: string;    // id del hotel/cliente en la central
  currentCustomerName: string;  // nombre del hotel/cliente
}

type Status = "idle" | "submitting" | "success" | "error";

type ReasonCode =
  | "PAYMENT_ISSUE"
  | "PROPERTY_DAMAGE"
  | "NO_SHOW"
  | "RULES_VIOLATION"
  | "NOISE"
  | "FRAUD_SUSPECT"
  | "AGGRESSIVE_BEHAVIOR"
  | "EXCELLENT_GUEST"
  | "OTHER";

const REASONS: { code: ReasonCode; label: string; kind: "risk" | "positive" | "neutral" }[] = [
  { code: "PAYMENT_ISSUE", label: "Incidencia de pago / impago", kind: "risk" },
  { code: "PROPERTY_DAMAGE", label: "Daños en la propiedad", kind: "risk" },
  { code: "NO_SHOW", label: "No-show (no se presentó)", kind: "risk" },
  { code: "RULES_VIOLATION", label: "Incumplimiento de normas", kind: "risk" },
  { code: "NOISE", label: "Ruido / molestias", kind: "risk" },
  { code: "FRAUD_SUSPECT", label: "Sospecha de fraude", kind: "risk" },
  { code: "AGGRESSIVE_BEHAVIOR", label: "Comportamiento agresivo", kind: "risk" },
  { code: "EXCELLENT_GUEST", label: "Cliente excelente", kind: "positive" },
  { code: "OTHER", label: "Otro", kind: "neutral" },
];

const PLATFORM_OPTIONS = [
  "BOOKING",
  "EXPEDIA",
  "AIRBNB",
  "MOTOR_PROPIO",
  "AGENCIA",
  "WALK_IN",
  "OTROS",
] as const;

type Platform = (typeof PLATFORM_OPTIONS)[number];

function clampText(s: string, max: number) {
  const t = (s ?? "").trim();
  return t.length > max ? t.slice(0, max) : t;
}

function sanitizeUpperLettersAndSpaces(input: string) {
  const raw = input ?? "";
  const cleaned = raw.replace(/[0-9]/g, "");
  return cleaned.toUpperCase();
}

function sanitizeDoc(input: string) {
  const raw = input ?? "";
  return raw.replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
}

function sanitizePhone(input: string) {
  const raw = input ?? "";
  return raw.replace(/\D/g, "").slice(0, 11);
}

export const RatingForm: React.FC<RatingFormProps> = ({
  currentCustomerId,
  currentCustomerName,
}) => {
  const [status, setStatus] = useState<Status>("idle");

  const [form, setForm] = useState({
    fullName: "",
    document: "",
    email: "",
    phone: "",
    nationality: "",
    platform: "" as Platform | "",
    platformOther: "",
    value: 0,
    reasons: [] as ReasonCode[],
    severity: "MEDIUM" as "LOW" | "MEDIUM" | "HIGH",
    hasEvidence: false,
    notes: "",
  });

  const ratingLabel =
    form.value === 1
      ? "Muy negativo"
      : form.value === 2
      ? "Negativo"
      : form.value === 3
      ? "Neutro"
      : form.value === 4
      ? "Positivo"
      : form.value === 5
      ? "Excelente"
      : "Selecciona estrellas";

  const selectedReasons = useMemo(() => new Set(form.reasons), [form.reasons]);

  const riskSelected = useMemo(
    () => form.reasons.some((r) => REASONS.find((x) => x.code === r)?.kind === "risk"),
    [form.reasons]
  );

  const positiveSelected = useMemo(
    () => form.reasons.includes("EXCELLENT_GUEST"),
    [form.reasons]
  );

  const handleToggleReason = (code: ReasonCode) => {
    setForm((prev) => {
      const exists = prev.reasons.includes(code);
      const next = exists ? prev.reasons.filter((x) => x !== code) : [...prev.reasons, code];

      // regla simple: si marcas "Cliente excelente", no tiene sentido marcar daños/impagos a la vez
      if (!exists && code === "EXCELLENT_GUEST") {
        return { ...prev, reasons: ["EXCELLENT_GUEST"], severity: "LOW", hasEvidence: false };
      }
      if (!exists && prev.reasons.includes("EXCELLENT_GUEST")) {
        // si ya estaba excelente y marcas otra cosa, quitamos excelente
        return { ...prev, reasons: next.filter((x) => x !== "EXCELLENT_GUEST") };
      }
      return { ...prev, reasons: next };
    });
  };

  const canSubmit = useMemo(() => {
    if (status === "submitting") return false;
    if (!form.value) return false;
    if (!form.fullName.trim()) return false;
    // mínimo: 1 motivo seleccionado (evita “opinión libre”)
    if (form.reasons.length === 0) return false;
    // si plataforma = OTROS, requiere texto
    if (form.platform === "OTROS" && !form.platformOther.trim()) return false;
    // Si es riesgo, pedimos documento o email o teléfono (algún identificador)
    if (riskSelected) {
      const hasId = !!form.document.trim() || !!form.email.trim() || !!form.phone.trim();
      if (!hasId) return false;
    }
    return true;
  }, [form, status, riskSelected]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!canSubmit) {
      alert("Revisa el formulario: faltan campos obligatorios o criterios mínimos.");
      return;
    }

    setStatus("submitting");

    try {
      // Construimos comment “controlado”: no es texto libre, es resumen estructurado.
      const reasonsText = form.reasons.join(",");
      const platformFinal =
        form.platform === "OTROS"
          ? `OTROS:${clampText(form.platformOther, 30)}`
          : (form.platform || "DEBACU_EVAL");

      const controlledCommentParts: string[] = [];
      controlledCommentParts.push(`reasons=${reasonsText}`);
      controlledCommentParts.push(`severity=${form.severity}`);
      controlledCommentParts.push(`evidence=${form.hasEvidence ? "yes" : "no"}`);
      const notes = clampText(form.notes, 240);
      if (notes) controlledCommentParts.push(`notes=${notes}`);

      const result = await addEvaluation(
        {
          document: form.document.trim() ? sanitizeDoc(form.document) : "GEN-SIN-DOC",
          fullName: sanitizeUpperLettersAndSpaces(form.fullName).trim(),
          nationality: form.nationality.trim() ? form.nationality.trim().toUpperCase() : null,
          phone: form.phone.trim() ? sanitizePhone(form.phone) : null,
          email: form.email.trim() ? form.email.trim().toLowerCase() : "",
          rating: form.value,
          comment: controlledCommentParts.join(" | "),
          platform: platformFinal,
        },
        currentCustomerId,
        currentCustomerName
      );

      if (!result) throw new Error("No se pudo guardar la valoración");

      setStatus("success");
      setTimeout(() => {
        setStatus("idle");
        setForm({
          fullName: "",
          document: "",
          email: "",
          phone: "",
          nationality: "",
          platform: "",
          platformOther: "",
          value: 0,
          reasons: [],
          severity: "MEDIUM",
          hasEvidence: false,
          notes: "",
        });
      }, 1400);
    } catch (err) {
      console.error(err);
      setStatus("error");
    }
  };

  return (
    <div className="max-w-6xl mx-auto">
      <div className="mb-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-2xl font-bold text-slate-900 mb-1">Registrar incidencia</h2>
            <p className="text-sm text-slate-600">
              Registro estructurado para auditoría interna. Evita texto libre: selecciona motivos y severidad.
            </p>
          </div>

          <div className="hidden md:flex items-center gap-2 rounded-2xl border bg-white px-4 py-3 text-xs text-slate-600">
            <Shield className="w-4 h-4 text-slate-500" />
            <span>Acceso restringido · Acciones auditables</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* FORM */}
        <div className="lg:col-span-2">
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 text-sm">
            {status === "success" ? (
              <div className="text-center py-10">
                <CheckCircle className="w-12 h-12 text-green-500 mx-auto mb-4" />
                <h3 className="text-lg font-bold text-slate-900">Registro guardado</h3>
                <p className="text-slate-500 text-sm mt-1">La incidencia ha sido registrada correctamente.</p>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-5">
                {/* Identificación */}
                <div className="rounded-2xl border border-slate-200 p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <Info className="w-4 h-4 text-slate-500" />
                    <div className="text-sm font-semibold text-slate-900">Identificación del cliente</div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="md:col-span-2">
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        Nombre completo *
                      </label>
                      <input
                        type="text"
                        required
                        value={form.fullName}
                        onChange={(e) => setForm((p) => ({ ...p, fullName: sanitizeUpperLettersAndSpaces(e.target.value) }))}
                        className="block w-full px-3 py-2 border border-slate-300 rounded-xl focus:ring-indigo-500 focus:border-indigo-500 text-sm"
                        placeholder="NOMBRE Y APELLIDOS"
                      />
                      <p className="text-[11px] text-slate-400 mt-1">
                        Se normaliza a mayúsculas. Evita apodos o datos innecesarios.
                      </p>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">Documento / ID</label>
                      <input
                        type="text"
                        value={form.document}
                        onChange={(e) => setForm((p) => ({ ...p, document: sanitizeDoc(e.target.value) }))}
                        className="block w-full px-3 py-2 border border-slate-300 rounded-xl focus:ring-indigo-500 focus:border-indigo-500 text-sm"
                        placeholder="DNI, NIE, PASAPORTE..."
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">Teléfono</label>
                      <input
                        type="tel"
                        value={form.phone}
                        onChange={(e) => setForm((p) => ({ ...p, phone: sanitizePhone(e.target.value) }))}
                        maxLength={11}
                        className="block w-full px-3 py-2 border border-slate-300 rounded-xl focus:ring-indigo-500 focus:border-indigo-500 text-sm"
                        placeholder="Ej: 600123456"
                      />
                      <p className="text-[11px] text-slate-400 mt-1">Sólo números, máximo 11 dígitos.</p>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">Email</label>
                      <input
                        type="email"
                        value={form.email}
                        onChange={(e) => setForm((p) => ({ ...p, email: e.target.value.trim() }))}
                        className="block w-full px-3 py-2 border border-slate-300 rounded-xl focus:ring-indigo-500 focus:border-indigo-500 text-sm"
                        placeholder="cliente@email.com"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">Nacionalidad (código)</label>
                      <input
                        type="text"
                        value={form.nationality}
                        onChange={(e) => setForm((p) => ({ ...p, nationality: e.target.value.toUpperCase().slice(0, 3) }))}
                        maxLength={3}
                        className="block w-full px-3 py-2 border border-slate-300 rounded-xl focus:ring-indigo-500 focus:border-indigo-500 text-sm uppercase"
                        placeholder="ESP, FRA, GBR..."
                      />
                    </div>
                  </div>
                </div>

                {/* Origen */}
                <div className="rounded-2xl border border-slate-200 p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <FileText className="w-4 h-4 text-slate-500" />
                    <div className="text-sm font-semibold text-slate-900">Origen de la reserva</div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">Plataforma *</label>
                      <select
                        value={form.platform}
                        onChange={(e) => setForm((p) => ({ ...p, platform: e.target.value as Platform }))}
                        className="block w-full px-3 py-2 border border-slate-300 rounded-xl focus:ring-indigo-500 focus:border-indigo-500 text-sm bg-white"
                        required
                      >
                        <option value="">Selecciona…</option>
                        <option value="BOOKING">BOOKING</option>
                        <option value="EXPEDIA">EXPEDIA</option>
                        <option value="AIRBNB">AIRBNB</option>
                        <option value="MOTOR_PROPIO">Motor propio</option>
                        <option value="AGENCIA">Agencia</option>
                        <option value="WALK_IN">Walk-in</option>
                        <option value="OTROS">Otros</option>
                      </select>
                    </div>

                    {form.platform === "OTROS" && (
                      <div>
                        <label className="block text-xs font-semibold text-slate-700 mb-1">Especifica *</label>
                        <input
                          value={form.platformOther}
                          onChange={(e) => setForm((p) => ({ ...p, platformOther: clampText(e.target.value, 30) }))}
                          className="block w-full px-3 py-2 border border-slate-300 rounded-xl focus:ring-indigo-500 focus:border-indigo-500 text-sm"
                          placeholder="Ej: Agencia local"
                          required
                        />
                      </div>
                    )}
                  </div>
                </div>

                {/* Motivos */}
                <div className="rounded-2xl border border-slate-200 p-4">
                  <div className="text-sm font-semibold text-slate-900 mb-1">Motivos *</div>
                  <p className="text-[11px] text-slate-500 mb-3">
                    Selecciona motivos predefinidos. Esto evita acusaciones “a texto libre” y mantiene trazabilidad.
                  </p>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {REASONS.map((r) => {
                      const checked = selectedReasons.has(r.code);
                      const tone =
                        r.kind === "risk"
                          ? "border-red-200 bg-red-50"
                          : r.kind === "positive"
                          ? "border-green-200 bg-green-50"
                          : "border-slate-200 bg-white";

                      return (
                        <label
                          key={r.code}
                          className={`flex items-center gap-2 rounded-xl border px-3 py-2 cursor-pointer ${checked ? tone : "border-slate-200 bg-white"}`}
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => handleToggleReason(r.code)}
                            className="h-4 w-4"
                          />
                          <span className="text-sm text-slate-800">{r.label}</span>
                        </label>
                      );
                    })}
                  </div>

                  <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <div className="text-xs font-semibold text-slate-700 mb-2">Severidad *</div>
                      <div className="flex gap-2">
                        {(["LOW", "MEDIUM", "HIGH"] as const).map((s) => (
                          <label
                            key={s}
                            className={`flex-1 rounded-xl border px-3 py-2 text-center text-sm cursor-pointer ${
                              form.severity === s ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 bg-white text-slate-700"
                            }`}
                          >
                            <input
                              type="radio"
                              name="severity"
                              value={s}
                              checked={form.severity === s}
                              onChange={() => setForm((p) => ({ ...p, severity: s }))}
                              className="hidden"
                            />
                            {s === "LOW" ? "Baja" : s === "MEDIUM" ? "Media" : "Alta"}
                          </label>
                        ))}
                      </div>
                    </div>

                    <div>
                      <div className="text-xs font-semibold text-slate-700 mb-2">¿Hay evidencia?</div>
                      <label className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2">
                        <input
                          type="checkbox"
                          checked={form.hasEvidence}
                          onChange={(e) => setForm((p) => ({ ...p, hasEvidence: e.target.checked }))}
                          className="h-4 w-4"
                        />
                        <span className="text-sm text-slate-700">Sí, existe evidencia (interno)</span>
                      </label>
                      <p className="text-[11px] text-slate-400 mt-1">
                        No subas nada todavía si no tienes control de ficheros y RLS. Esto es marcador interno.
                      </p>
                    </div>
                  </div>
                </div>

                {/* Valoración */}
                <div className="rounded-2xl border border-slate-200 p-4">
                  <label className="block text-xs font-semibold text-slate-700 mb-2">
                    Valoración general *
                  </label>
                  <div className="flex items-center gap-4 mb-2">
                    <StarRating
                      rating={form.value}
                      interactive={true}
                      onChange={(v) => setForm((p) => ({ ...p, value: v }))}
                      size="lg"
                    />
                    <span className="text-xs text-slate-500 font-semibold">{ratingLabel}</span>
                  </div>
                  <p className="text-[11px] text-slate-400">
                    La valoración debe ser coherente con los motivos seleccionados. Esto se audita.
                  </p>
                </div>

                {/* Observaciones (opcional y corto) */}
                <div className="rounded-2xl border border-slate-200 p-4">
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Observaciones (opcional, máx 240)
                  </label>
                  <textarea
                    rows={3}
                    value={form.notes}
                    onChange={(e) => setForm((p) => ({ ...p, notes: clampText(e.target.value, 240) }))}
                    className="block w-full px-3 py-2 border border-slate-300 rounded-xl focus:ring-indigo-500 focus:border-indigo-500 text-sm"
                    placeholder="Sólo contexto operativo. Sin datos sensibles ni acusaciones."
                  />
                  <div className="mt-1 flex justify-between text-[11px] text-slate-400">
                    <span>Evita nombres de terceros, direcciones o detalles innecesarios.</span>
                    <span>{form.notes.length}/240</span>
                  </div>
                </div>

                {/* Submit */}
                <div className="pt-1">
                  <button
                    type="submit"
                    disabled={!canSubmit}
                    className="w-full flex justify-center items-center px-6 py-3 rounded-2xl text-sm font-semibold text-white bg-slate-900 hover:bg-black disabled:opacity-40 transition-colors"
                  >
                    {status === "submitting" ? (
                      "Guardando…"
                    ) : (
                      <>
                        <Save className="w-4 h-4 mr-2" />
                        Guardar registro
                      </>
                    )}
                  </button>

                  {!canSubmit && (
                    <div className="mt-3 text-[12px] text-slate-500">
                      Requisitos mínimos: estrellas + nombre + al menos 1 motivo.
                      {riskSelected ? " Además, en incidencias de riesgo debes aportar documento, email o teléfono." : ""}
                      {form.platform === "OTROS" ? " En “Otros” debes especificar el origen." : ""}
                    </div>
                  )}

                  {status === "error" && (
                    <div className="flex items-center gap-2 text-red-600 bg-red-50 p-3 rounded-xl text-xs mt-3">
                      <AlertCircle className="w-4 h-4" />
                      Error al guardar. Reintenta y revisa conexión / permisos.
                    </div>
                  )}
                </div>

                {/* Warning legal UX */}
                <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-xs text-amber-900">
                  <div className="font-semibold mb-1">Uso responsable</div>
                  <div>
                    Este registro es para soporte interno y auditoría. No es un registro oficial ni una lista pública.
                    Los accesos y modificaciones deben quedar registrados.
                  </div>
                </div>
              </form>
            )}
          </div>
        </div>

        {/* Side info */}
        <div>
          <div className="bg-slate-900 text-white border border-slate-800 rounded-2xl p-5 h-full">
            <div className="text-sm font-semibold mb-2">Buenas prácticas</div>
            <ul className="text-xs text-slate-200 space-y-2">
              <li>• Registra hechos verificables, no opiniones.</li>
              <li>• Evita datos sensibles en observaciones.</li>
              <li>• Usa motivos + severidad para estandarizar.</li>
              <li>• Si es grave, marca evidencia y conserva soporte interno.</li>
            </ul>

            <div className="mt-5 rounded-2xl bg-white/10 p-4 text-xs text-slate-200">
              <div className="font-semibold text-white mb-1">Qué cambia aquí</div>
              <div>
                Se elimina el “comentario libre” como elemento principal. Esto baja riesgo legal y sube la calidad del dato.
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
