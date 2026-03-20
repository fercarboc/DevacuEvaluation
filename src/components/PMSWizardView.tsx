// src/components/PMSWizardView.tsx
import React, { useState, useEffect, useRef } from "react";
import { Card, Button, Badge } from "./UI";
import {
  ChevronRight,
  ChevronLeft,
  ShieldCheck,
  Zap,
  CheckCircle2,
  Circle,
  Loader2,
  Terminal,
  ArrowRight,
  Eye,
  EyeOff,
  Globe,
  Database,
  Lock,
  RefreshCw,
  XCircle,
  Building2,
  Hotel,
  AlertTriangle,
} from "lucide-react";
import { cn } from "../utils";
import { callEvalFn } from "@/services/callEvalFn";

// ── Tipos Edge Functions ──────────────────────────────────────────────────────

type SaveConnectionResponse = {
  ok: boolean;
  data: {
    connectionId: string;
    orgId: string;
    propertyId: string | null;
    providerCode: string;
    environment: string;
    authMode: string;
    status: string;
    message: string;
  };
};

type TestConnectionResponse = {
  ok: boolean;
  data: {
    connectionId: string;
    providerCode: string;
    environment: string;
    valid: boolean;
    status: "ACTIVE" | "ERROR";
    apiVersion?: string | null;
    permissions?: string | null;
    latencyMs?: number | null;
    errorCode?: string | null;
    errorDetail?: string | null;
    checks: {
      connectionEstablished: boolean;
      credentialsValid: boolean;
      permissionsOk: boolean;
      endpointReachable: boolean;
    };
  };
};

type SyncRunResponse = {
  ok: boolean;
  data: {
    job_id: string;
    entity_type: string;
    status: "SUCCESS" | "FAILED" | "WARNING";
    records_read: number;
    records_created: number;
    records_updated: number;
    records_error: number;
    duration_ms: number;
    error_message?: string;
  };
};

// ── PMS meta ──────────────────────────────────────────────────────────────────

const PMS_META: Record<string, { name: string; logo: string; providerCode: string; authMode: "oauth2" | "api_key" }> = {
  apaleo:   { name: "Apaleo",    logo: "A", providerCode: "APALEO",          authMode: "oauth2"  },
  tesipro:  { name: "Tesipro",   logo: "T", providerCode: "TESIPRO_ULYSES",  authMode: "api_key" },
  mews:     { name: "Mews",      logo: "M", providerCode: "MEWS",            authMode: "oauth2"  },
  cloudbeds:{ name: "Cloudbeds", logo: "C", providerCode: "CLOUDBEDS",       authMode: "oauth2"  },
  ulyses:   { name: "Ulyses",    logo: "U", providerCode: "TESIPRO_ULYSES",  authMode: "api_key" },
  sihot:    { name: "Sihot",     logo: "S", providerCode: "SIHOT",           authMode: "api_key" },
};

// ── Entidades de sync ─────────────────────────────────────────────────────────

type EntitySyncState = "pending" | "progress" | "done" | "error";

interface EntitySync {
  label: string;
  entity_type: "ROOM_TYPE" | "ROOM" | "GUEST" | "RESERVATION" | "STAY";
  state: EntitySyncState;
  count: string;
  progress: number;
  error?: string;
}

const INITIAL_SYNC_ENTITIES: EntitySync[] = [
  { label: "ROOM_TYPES",    entity_type: "ROOM_TYPE",    state: "pending", count: "Pendiente", progress: 0 },
  { label: "ROOMS",         entity_type: "ROOM",         state: "pending", count: "Pendiente", progress: 0 },
  { label: "GUESTS",        entity_type: "GUEST",        state: "pending", count: "Pendiente", progress: 0 },
  { label: "RESERVATIONS",  entity_type: "RESERVATION",  state: "pending", count: "Pendiente", progress: 0 },
  { label: "STAYS",         entity_type: "STAY",         state: "pending", count: "Pendiente", progress: 0 },
];

// ── Constantes ────────────────────────────────────────────────────────────────

const STEPS = [
  "1. Seleccionar PMS",
  "2. Credenciales",
  "3. Validar",
  "4. Sync inicial",
];

const PMS_PROVIDERS = [
  {
    id: "apaleo",
    name: "Apaleo",
    authType: "OAuth2",
    description: "API-first property management system for modern hotel groups.",
    tags: ["Webhooks", "Multi-propiedad", "Sandbox disponible"],
    recommended: true,
    logo: "A",
  },
  {
    id: "tesipro",
    name: "Tesipro",
    authType: "API Key",
    description: "Solución integral de gestión hotelera líder en el mercado español.",
    tags: ["ES", "Webhooks", "Cloud Native"],
    logo: "T",
  },
  {
    id: "mews",
    name: "Mews",
    authType: "OAuth2",
    description: "Cloud-based property management system for hotels and hostels.",
    tags: ["Open API", "Global", "Webhooks"],
    logo: "M",
  },
  {
    id: "cloudbeds",
    name: "Cloudbeds",
    authType: "OAuth2",
    description: "Suite de gestión hotelera para propiedades de todos los tamaños.",
    tags: ["All-in-one", "Marketplace", "Sync"],
    logo: "C",
  },
  {
    id: "ulyses",
    name: "Ulyses",
    authType: "API Key",
    description: "PMS especializado en la automatización de procesos operativos.",
    tags: ["Automation", "ES", "API"],
    logo: "U",
  },
  {
    id: "sihot",
    name: "Sihot",
    authType: "API Key",
    description: "Modular hotel management software for international chains.",
    tags: ["Modular", "Enterprise", "Scalable"],
    logo: "S",
  },
];

// ── Props ─────────────────────────────────────────────────────────────────────

interface PMSWizardProps {
  hotelName: string;
  orgId: string;
  propertyId: string | null;
  onClose: () => void;
  onFinish: () => void;
}

// ── Componente ────────────────────────────────────────────────────────────────

export const PMSWizardView: React.FC<PMSWizardProps> = ({
  hotelName,
  orgId,
  propertyId,
  onClose,
  onFinish,
}) => {
  // Navegación
  const [step, setStep] = useState(1);

  // Paso 1
  const [selectedPMS, setSelectedPMS] = useState<string | null>(null);

  // Paso 2
  const [clientId, setClientId]         = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [showSecret, setShowSecret]     = useState(false);
  const [isSandbox, setIsSandbox]       = useState(true);
  const [step2Loading, setStep2Loading] = useState(false);
  const [step2Error, setStep2Error]     = useState<string | null>(null);

  // Conexión guardada
  const [connectionId, setConnectionId] = useState<string | null>(null);

  // Paso 3
  const [validationState, setValidationState] =
    useState<"idle" | "progress" | "success" | "error">("idle");
  const [testResult, setTestResult]     = useState<TestConnectionResponse["data"] | null>(null);
  const [testError, setTestError]       = useState<string | null>(null);

  // Paso 4
  const [syncEntities, setSyncEntities] = useState<EntitySync[]>(INITIAL_SYNC_ENTITIES);
  const [syncStarted, setSyncStarted]   = useState(false);
  const [allSyncDone, setAllSyncDone]   = useState(false);
  const [syncLog, setSyncLog]           = useState<string[]>([]);

  // Helper: añadir línea al log
  const addLog = (line: string) =>
    setSyncLog((prev) => [...prev.slice(-20), line]);

  // ── Paso 3: test automático al llegar ──
  useEffect(() => {
    if (step !== 3 || !connectionId || validationState !== "idle") return;

    setValidationState("progress");

    callEvalFn<TestConnectionResponse>("pms-connection-test", {
      connection_id: connectionId,
    })
      .then((res) => {
        setTestResult(res.data);
        setValidationState(res.data.valid ? "success" : "error");
      })
      .catch((err: Error) => {
        setTestError(err.message || "Error al validar la conexión");
        setValidationState("error");
      });
  }, [step, connectionId, validationState]);

  // ── Helpers ──
  const currentPMS = selectedPMS ? PMS_META[selectedPMS] : null;

  // Obtener checks reales o simulados durante el progreso
  const getChecks = () => {
    if (validationState === "progress") {
      return [
        { label: "Conexión establecida",           status: "progress" },
        { label: "Verificando permisos de lectura", status: "pending"  },
        { label: "Probando endpoint reservas",      status: "pending"  },
        { label: "Probando endpoint huéspedes",     status: "pending"  },
      ];
    }
    if (testResult) {
      const c = testResult.checks;
      const toStatus = (v: boolean) => (v ? "done" : "error");
      return [
        { label: "Conexión establecida",           status: toStatus(c.connectionEstablished) },
        { label: "Verificando permisos de lectura", status: toStatus(c.credentialsValid)     },
        { label: "Probando endpoint reservas",      status: toStatus(c.endpointReachable)    },
        { label: "Probando endpoint huéspedes",     status: toStatus(c.permissionsOk)        },
      ];
    }
    return [
      { label: "Conexión establecida",           status: "pending" },
      { label: "Verificando permisos de lectura", status: "pending" },
      { label: "Probando endpoint reservas",      status: "pending" },
      { label: "Probando endpoint huéspedes",     status: "pending" },
    ];
  };

  // ── Envío paso 2 ──
  const handleStep2Submit = async () => {
    if (!selectedPMS || !currentPMS || !orgId) return;

    const credentials =
      currentPMS.authMode === "oauth2"
        ? { client_id: clientId.trim(), client_secret: clientSecret.trim() }
        : { api_key: clientId.trim() };

    setStep2Loading(true);
    setStep2Error(null);

    try {
      const res = await callEvalFn<SaveConnectionResponse>("pms-connection-save", {
        org_id: orgId,
        property_id: propertyId ?? null,
        provider_code: currentPMS.providerCode,
        environment: isSandbox ? "sandbox" : "production",
        auth_mode: currentPMS.authMode,
        credentials,
      });

      setConnectionId(res.data.connectionId);
      setValidationState("idle"); // Reinicia para que el useEffect del paso 3 lance el test
      setTestResult(null);
      setTestError(null);
      setStep(3);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Error al guardar las credenciales";
      setStep2Error(msg);
    } finally {
      setStep2Loading(false);
    }
  };

  // ── Reintentar credenciales desde paso 3 ──
  const handleRetryCredentials = () => {
    setValidationState("idle");
    setTestResult(null);
    setTestError(null);
    setStep(2);
  };

  // ── Inicio del sync paso 4 ──
  const handleStartSync = async () => {
    if (!connectionId || syncStarted) return;
    setSyncStarted(true);
    setSyncEntities(INITIAL_SYNC_ENTITIES);
    setSyncLog([]);

    const entities = INITIAL_SYNC_ENTITIES;
    const now = () => new Date().toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit", second: "2-digit" });

    let anyFailed = false;

    for (let i = 0; i < entities.length; i++) {
      const entity = entities[i];

      setSyncEntities((prev) =>
        prev.map((e, idx) => (idx === i ? { ...e, state: "progress", progress: 40 } : e))
      );
      addLog(`[${now()}] FETCHING: Iniciando sync ${entity.entity_type}...`);

      try {
        const res = await callEvalFn<SyncRunResponse>("pms-sync-run", {
          connection_id: connectionId,
          entity_type: entity.entity_type,
          sync_mode: "FULL",
          triggered_by: "onboarding",
        });

        const { records_read, records_created, records_updated } = res.data;
        const countLabel = `${records_read} registros`;

        setSyncEntities((prev) =>
          prev.map((e, idx) =>
            idx === i ? { ...e, state: "done", progress: 100, count: countLabel } : e
          )
        );
        addLog(
          `[${now()}] SUCCESS: ${entity.label} — ${records_read} leídos, ${records_created} creados, ${records_updated} actualizados`
        );
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Error desconocido";
        setSyncEntities((prev) =>
          prev.map((e, idx) =>
            idx === i ? { ...e, state: "error", progress: 100, count: "Error", error: msg } : e
          )
        );
        addLog(`[${now()}] ERROR: ${entity.label} — ${msg}`);
        anyFailed = true;
      }
    }

    setAllSyncDone(true);
    if (!anyFailed) {
      addLog(`[${now()}] COMPLETE: Sync inicial finalizado correctamente.`);
    } else {
      addLog(`[${now()}] WARNING: Sync completado con errores en algunas entidades.`);
    }
  };

  // ── Stepper ──────────────────────────────────────────────────────────────────

  const renderStepper = () => (
    <div className="flex items-center justify-between mb-12 max-w-4xl mx-auto">
      {STEPS.map((s, i) => {
        const stepNum = i + 1;
        const isActive = step === stepNum;
        const isCompleted = step > stepNum;

        return (
          <React.Fragment key={s}>
            <div className="flex flex-col items-center gap-2 relative">
              <div
                className={cn(
                  "w-10 h-10 rounded-full flex items-center justify-center border-2 transition-all duration-300",
                  isActive
                    ? "border-blue-500 bg-blue-500/10 text-blue-500 shadow-[0_0_15px_rgba(59,130,246,0.3)]"
                    : isCompleted
                    ? "border-emerald-500 bg-emerald-500 text-white"
                    : "border-slate-700 bg-slate-800 text-slate-500"
                )}
              >
                {isCompleted ? (
                  <CheckCircle2 className="w-6 h-6" />
                ) : (
                  <span className="text-sm font-bold">{stepNum}</span>
                )}
              </div>
              <span
                className={cn(
                  "text-[10px] font-bold uppercase tracking-wider absolute -bottom-6 whitespace-nowrap",
                  isActive ? "text-blue-500" : isCompleted ? "text-emerald-500" : "text-slate-500"
                )}
              >
                {s.split(". ")[1]}
              </span>
            </div>
            {i < STEPS.length - 1 && (
              <div
                className={cn(
                  "flex-1 h-[2px] mx-4 transition-colors duration-500",
                  isCompleted ? "bg-emerald-500" : "bg-slate-700"
                )}
              />
            )}
          </React.Fragment>
        );
      })}
    </div>
  );

  // ── Paso 1: Seleccionar PMS ───────────────────────────────────────────────

  const renderStep1 = () => (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {PMS_PROVIDERS.map((pms) => (
          <Card
            key={pms.id}
            onClick={() => setSelectedPMS(pms.id)}
            className={cn(
              "p-6 cursor-pointer transition-all duration-200 border-2 hover:shadow-xl group",
              selectedPMS === pms.id
                ? "border-blue-500 bg-blue-500/5 ring-1 ring-blue-500/20"
                : "border-slate-800 bg-slate-900/50 hover:border-slate-600"
            )}
          >
            <div className="flex justify-between items-start mb-4">
              <div className="w-12 h-12 rounded-xl bg-slate-800 border border-slate-700 flex items-center justify-center text-xl font-bold text-white group-hover:scale-110 transition-transform">
                {pms.logo}
              </div>
              <div className="flex flex-col items-end gap-1">
                {pms.recommended && (
                  <Badge variant="info" className="bg-blue-500/10 text-blue-400 border-blue-500/20">
                    RECOMENDADO
                  </Badge>
                )}
                {pms.tags.includes("ES") && (
                  <Badge variant="neutral" className="bg-amber-500/10 text-amber-500 border-amber-500/20">
                    ES
                  </Badge>
                )}
              </div>
            </div>
            <h3 className="text-lg font-bold text-white mb-1">{pms.name}</h3>
            <p className="text-[10px] font-bold text-slate-500 uppercase mb-3">{pms.authType}</p>
            <p className="text-sm text-slate-400 mb-4 line-clamp-2">{pms.description}</p>
            <div className="flex flex-wrap gap-1">
              {pms.tags.map((tag) => (
                <span
                  key={tag}
                  className="text-[9px] px-2 py-0.5 rounded bg-slate-800 text-slate-500 font-bold uppercase tracking-tight"
                >
                  {tag}
                </span>
              ))}
            </div>
          </Card>
        ))}
      </div>
      <div className="flex justify-end pt-8 border-t border-slate-800">
        <Button
          variant="primary"
          disabled={!selectedPMS}
          onClick={() => setStep(2)}
          className="px-8 py-6 text-lg"
        >
          Siguiente <ChevronRight className="ml-2 w-5 h-5" />
        </Button>
      </div>
    </div>
  );

  // ── Paso 2: Credenciales ──────────────────────────────────────────────────

  const renderStep2 = () => {
    const pms = currentPMS!;
    const isOAuth = pms.authMode === "oauth2";
    const label1 = isOAuth ? "Client ID" : "API Key";
    const placeholder1 = isOAuth ? `${pms.name.toLowerCase()}_client_...` : "sk_live_...";
    const label2 = isOAuth ? "Client Secret" : undefined;

    return (
      <div className="max-w-2xl mx-auto animate-in fade-in slide-in-from-bottom-4 duration-500">
        <Card className="p-8 bg-slate-900/50 border-slate-800">
          <div className="flex items-center gap-4 mb-8">
            <div className="w-16 h-16 rounded-2xl bg-slate-800 border border-slate-700 flex items-center justify-center text-3xl font-bold text-white">
              {pms.logo}
            </div>
            <div>
              <h3 className="text-2xl font-bold text-white">Conectar {pms.name}</h3>
              <p className="text-slate-400">
                Autoriza a Debacu a acceder en modo lectura a tu cuenta de {pms.name}.
              </p>
            </div>
          </div>

          <div className="space-y-6">
            {/* Entorno */}
            <div className="flex items-center justify-between p-4 bg-slate-800/50 rounded-xl border border-slate-700">
              <div>
                <p className="text-sm font-bold text-white">Entorno de Conexión</p>
                <p className="text-xs text-slate-500">Selecciona si es una cuenta de pruebas o real.</p>
              </div>
              <div className="flex bg-slate-900 p-1 rounded-lg border border-slate-700">
                <button
                  onClick={() => setIsSandbox(true)}
                  className={cn(
                    "px-4 py-1.5 rounded-md text-xs font-bold transition-all",
                    isSandbox ? "bg-blue-600 text-white shadow-lg" : "text-slate-500 hover:text-slate-300"
                  )}
                >
                  SANDBOX
                </button>
                <button
                  onClick={() => setIsSandbox(false)}
                  className={cn(
                    "px-4 py-1.5 rounded-md text-xs font-bold transition-all",
                    !isSandbox ? "bg-blue-600 text-white shadow-lg" : "text-slate-500 hover:text-slate-300"
                  )}
                >
                  PRODUCTION
                </button>
              </div>
            </div>

            {/* Credenciales */}
            <div className="space-y-4">
              <h4 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest flex items-center gap-2">
                <Lock className="w-3 h-3" /> Credenciales {isOAuth ? "OAuth2" : "API Key"}
              </h4>

              {/* Campo 1: Client ID / API Key */}
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-400">{label1}</label>
                <input
                  type="text"
                  value={clientId}
                  onChange={(e) => setClientId(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-3 text-white focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                  placeholder={placeholder1}
                />
              </div>

              {/* Campo 2: Client Secret (solo OAuth2) */}
              {label2 && (
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-400">{label2}</label>
                  <div className="relative">
                    <input
                      type={showSecret ? "text" : "password"}
                      value={clientSecret}
                      onChange={(e) => setClientSecret(e.target.value)}
                      className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-3 text-white focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                      placeholder="••••••••••••••••••••••••"
                    />
                    <button
                      onClick={() => setShowSecret(!showSecret)}
                      className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
                    >
                      {showSecret ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Autorización */}
            <label className="flex items-start gap-3 p-4 bg-blue-500/5 rounded-xl border border-blue-500/20 cursor-pointer group">
              <input
                type="checkbox"
                className="mt-1 w-5 h-5 rounded border-slate-700 bg-slate-800 text-blue-600 focus:ring-blue-500"
                defaultChecked
              />
              <span className="text-sm text-slate-300 group-hover:text-white transition-colors">
                Autorizo acceso de solo lectura a reservas, huéspedes y estancias para el análisis de
                datos de Debacu.
              </span>
            </label>

            {/* Error */}
            {step2Error && (
              <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4 flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
                <p className="text-sm text-red-300">{step2Error}</p>
              </div>
            )}

            {/* Seguridad */}
            <div className="bg-slate-800/30 p-4 rounded-lg flex items-start gap-3 border border-slate-700/50">
              <ShieldCheck className="w-5 h-5 text-emerald-500 shrink-0" />
              <p className="text-xs text-slate-500 leading-relaxed">
                <span className="text-slate-300 font-bold">Nota de Seguridad:</span> Debacu nunca
                escribe en tu PMS. Todas las peticiones se realizan bajo el principio de "mínimo
                privilegio" y solo lectura.
              </p>
            </div>
          </div>

          <div className="flex justify-between mt-12 pt-8 border-t border-slate-800">
            <Button
              variant="ghost"
              onClick={() => setStep(1)}
              className="text-slate-400"
              disabled={step2Loading}
            >
              <ChevronLeft className="mr-2 w-5 h-5" /> Anterior
            </Button>
            <Button
              variant="primary"
              onClick={handleStep2Submit}
              disabled={step2Loading || !clientId.trim() || (!currentPMS || (currentPMS.authMode === "oauth2" && !clientSecret.trim()))}
              className="px-10 py-6 text-lg"
            >
              {step2Loading ? (
                <span className="flex items-center gap-2">
                  <Loader2 className="w-5 h-5 animate-spin" /> Guardando...
                </span>
              ) : (
                <>Autorizar con {pms.name} <ArrowRight className="ml-2 w-5 h-5" /></>
              )}
            </Button>
          </div>
        </Card>
      </div>
    );
  };

  // ── Paso 3: Validación ────────────────────────────────────────────────────

  const renderStep3 = () => {
    const checks = getChecks();

    // Estado: progreso
    if (validationState === "progress" || validationState === "idle") {
      return (
        <div className="max-w-xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-12">
          <Card className="p-10 border-blue-500/20 bg-blue-500/5">
            <div className="flex flex-col items-center text-center mb-10">
              <div className="relative mb-6">
                <Loader2 className="w-16 h-16 text-blue-500 animate-spin" />
                <div className="absolute inset-0 flex items-center justify-center">
                  <Zap className="w-6 h-6 text-blue-400 animate-pulse" />
                </div>
              </div>
              <h3 className="text-2xl font-bold text-white mb-2">Validando credenciales...</h3>
              <p className="text-slate-500">
                Estamos verificando la conexión con los servidores de {currentPMS?.name ?? "PMS"}.
              </p>
            </div>

            <div className="space-y-4 max-w-xs mx-auto">
              {checks.map((item) => (
                <div key={item.label} className="flex items-center gap-4">
                  {item.status === "done" ? (
                    <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                  ) : item.status === "progress" ? (
                    <RefreshCw className="w-5 h-5 text-blue-500 animate-spin" />
                  ) : (
                    <Circle className="w-5 h-5 text-slate-700" />
                  )}
                  <span
                    className={cn(
                      "text-sm font-medium",
                      item.status === "done"
                        ? "text-slate-300"
                        : item.status === "progress"
                        ? "text-blue-400"
                        : "text-slate-600"
                    )}
                  >
                    {item.label}
                  </span>
                </div>
              ))}
            </div>
          </Card>
        </div>
      );
    }

    // Estado: error
    if (validationState === "error") {
      return (
        <div className="max-w-xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-12">
          <Card className="p-10 border-red-500/30 bg-red-500/5">
            <div className="flex flex-col items-center text-center mb-8">
              <div className="w-20 h-20 rounded-full bg-red-500/20 border border-red-500/30 flex items-center justify-center mb-6">
                <XCircle className="w-12 h-12 text-red-400" />
              </div>
              <h3 className="text-2xl font-bold text-white mb-2">Error de validación</h3>
              <p className="text-red-400/80 font-medium">
                {testResult?.errorDetail ?? testError ?? "No se pudo validar la conexión"}
              </p>
            </div>

            <div className="space-y-4 max-w-xs mx-auto mb-10">
              {checks.map((item) => (
                <div key={item.label} className="flex items-center gap-4">
                  {item.status === "done" ? (
                    <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                  ) : item.status === "error" ? (
                    <XCircle className="w-5 h-5 text-red-400" />
                  ) : (
                    <Circle className="w-5 h-5 text-slate-700" />
                  )}
                  <span
                    className={cn(
                      "text-sm font-medium",
                      item.status === "done"
                        ? "text-slate-300"
                        : item.status === "error"
                        ? "text-red-400"
                        : "text-slate-600"
                    )}
                  >
                    {item.label}
                  </span>
                </div>
              ))}
            </div>

            <Button
              variant="primary"
              onClick={handleRetryCredentials}
              className="w-full py-6 text-lg bg-slate-700 hover:bg-slate-600 border-none"
            >
              <ChevronLeft className="mr-2 w-5 h-5" /> Reintentar credenciales
            </Button>
          </Card>
        </div>
      );
    }

    // Estado: éxito
    return (
      <div className="max-w-xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-12">
        <Card className="p-10 border-emerald-500/30 bg-emerald-500/5">
          <div className="flex flex-col items-center text-center mb-8">
            <div className="w-20 h-20 rounded-full bg-emerald-500 flex items-center justify-center mb-6 shadow-[0_0_30px_rgba(16,185,129,0.4)]">
              <CheckCircle2 className="w-12 h-12 text-white" />
            </div>
            <h3 className="text-3xl font-bold text-white mb-2">¡Conexión validada correctamente!</h3>
            <p className="text-emerald-400/80 font-medium">
              Todos los sistemas están listos para la sincronización.
            </p>
          </div>

          <div className="space-y-4 max-w-xs mx-auto mb-10">
            {checks.map((item) => (
              <div key={item.label} className="flex items-center gap-4">
                <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                <span className="text-sm font-medium text-slate-300">{item.label}</span>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-3 gap-4 mb-10">
            <div className="p-4 bg-slate-900/50 rounded-xl border border-slate-800 text-center">
              <p className="text-[10px] font-bold text-slate-500 uppercase mb-1">Permisos</p>
              <p className="text-sm font-bold text-white">Read-only ✓</p>
            </div>
            <div className="p-4 bg-slate-900/50 rounded-xl border border-slate-800 text-center">
              <p className="text-[10px] font-bold text-slate-500 uppercase mb-1">Entorno</p>
              <p className="text-sm font-bold text-white">
                {testResult?.environment === "sandbox" ? "Sandbox" : "Production"}
              </p>
            </div>
            <div className="p-4 bg-slate-900/50 rounded-xl border border-slate-800 text-center">
              <p className="text-[10px] font-bold text-slate-500 uppercase mb-1">Versión API</p>
              <p className="text-sm font-bold text-white">{testResult?.apiVersion ?? "—"}</p>
            </div>
          </div>

          <Button
            variant="primary"
            onClick={() => setStep(4)}
            className="w-full py-8 text-xl bg-emerald-600 hover:bg-emerald-500 border-none"
          >
            Iniciar Sync Inicial <ArrowRight className="ml-2 w-6 h-6" />
          </Button>
        </Card>
      </div>
    );
  };

  // ── Paso 4: Sync inicial ──────────────────────────────────────────────────

  const renderStep4 = () => {
    const totalRecords = syncEntities.reduce((acc, e) => {
      const n = parseInt(e.count);
      return acc + (isNaN(n) ? 0 : n);
    }, 0);

    return (
      <div className="max-w-2xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
        <Card className="p-8">
          <div className="flex justify-between items-start mb-10">
            <div>
              <h3 className="text-2xl font-bold text-white mb-2">
                {syncStarted ? "Sincronización inicial en progreso" : "Listo para sincronizar"}
              </h3>
              <p className="text-slate-400">
                Importando datos estructurales y operativos de {currentPMS?.name ?? "PMS"}.
              </p>
            </div>
            {syncStarted && !allSyncDone && (
              <div className="text-right">
                <p className="text-[10px] font-bold text-slate-500 uppercase mb-1">Estado</p>
                <p className="text-lg font-mono font-bold text-blue-400 flex items-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin" /> Sincronizando...
                </p>
              </div>
            )}
            {allSyncDone && (
              <div className="text-right">
                <p className="text-[10px] font-bold text-slate-500 uppercase mb-1">Importados</p>
                <p className="text-2xl font-mono font-bold text-emerald-400">
                  {totalRecords.toLocaleString()} rec.
                </p>
              </div>
            )}
          </div>

          {/* Barras de progreso */}
          <div className="space-y-6 mb-10">
            {syncEntities.map((item) => (
              <div key={item.label} className="space-y-2">
                <div className="flex justify-between items-end">
                  <span className="text-xs font-bold text-slate-300 font-mono">{item.label}</span>
                  <span
                    className={cn(
                      "text-xs font-bold",
                      item.state === "done"
                        ? "text-emerald-500"
                        : item.state === "error"
                        ? "text-red-400"
                        : item.state === "progress"
                        ? "text-blue-400"
                        : "text-slate-600"
                    )}
                  >
                    {item.count} {item.state === "done" && "✓"} {item.state === "error" && "✗"}
                  </span>
                </div>
                <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
                  <div
                    className={cn(
                      "h-full transition-all duration-700",
                      item.state === "done"
                        ? "bg-emerald-500"
                        : item.state === "error"
                        ? "bg-red-500"
                        : item.state === "progress"
                        ? "bg-blue-500 animate-pulse"
                        : "bg-slate-700"
                    )}
                    style={{ width: `${item.progress}%` }}
                  />
                </div>
                {item.error && (
                  <p className="text-[10px] text-red-400 font-mono">{item.error}</p>
                )}
              </div>
            ))}
          </div>

          {/* Log */}
          <div className="bg-slate-950 rounded-lg p-4 font-mono text-[10px] text-slate-400 border border-slate-800 mb-8">
            <div className="flex items-center gap-2 mb-2 text-slate-500 border-b border-slate-800 pb-2">
              <Terminal className="w-3 h-3" />
              <span className="uppercase tracking-widest">Sync Live Log</span>
            </div>
            <div className="space-y-1 max-h-32 overflow-y-auto">
              {syncLog.length === 0 ? (
                <p className="text-slate-600">Esperando inicio del sync...</p>
              ) : (
                syncLog.map((line, i) => (
                  <p
                    key={i}
                    className={cn(
                      line.includes("SUCCESS") ? "text-emerald-500/70" :
                      line.includes("ERROR")   ? "text-red-400/70" :
                      line.includes("WARNING") ? "text-amber-400/70" :
                      "text-slate-500"
                    )}
                  >
                    {line}
                  </p>
                ))
              )}
            </div>
          </div>

          {/* Botón */}
          {!syncStarted ? (
            <Button
              variant="primary"
              onClick={handleStartSync}
              className="w-full py-6 text-lg"
            >
              <Zap className="mr-2 w-5 h-5" /> Iniciar Sync Inicial
            </Button>
          ) : (
            <Button
              variant="primary"
              disabled={!allSyncDone}
              onClick={() => setStep(5)}
              className="w-full py-6 text-lg"
            >
              {!allSyncDone ? (
                <span className="flex items-center gap-2">
                  <Loader2 className="w-5 h-5 animate-spin" /> Sincronizando...
                </span>
              ) : (
                "Finalizar"
              )}
            </Button>
          )}
        </Card>
      </div>
    );
  };

  // ── Paso 5: Éxito ─────────────────────────────────────────────────────────

  const renderStep5 = () => {
    const totalRecords = syncEntities.reduce((acc, e) => {
      const n = parseInt(e.count);
      return acc + (isNaN(n) ? 0 : n);
    }, 0);

    return (
      <div className="max-w-3xl mx-auto text-center animate-in zoom-in-95 duration-700">
        <div className="relative inline-block mb-10">
          <div className="absolute inset-0 bg-emerald-500 blur-3xl opacity-20 animate-pulse" />
          <div className="w-32 h-32 rounded-full bg-emerald-500 flex items-center justify-center relative shadow-[0_0_50px_rgba(16,185,129,0.5)]">
            <CheckCircle2 className="w-20 h-20 text-white" />
          </div>
          <div
            className="absolute -top-4 -left-4 w-4 h-4 rounded-full bg-blue-400 animate-bounce"
            style={{ animationDelay: "0.1s" }}
          />
          <div
            className="absolute -top-8 right-0 w-3 h-3 rounded-full bg-amber-400 animate-bounce"
            style={{ animationDelay: "0.3s" }}
          />
          <div
            className="absolute bottom-0 -right-8 w-5 h-5 rounded-full bg-rose-400 animate-bounce"
            style={{ animationDelay: "0.5s" }}
          />
        </div>

        <h2 className="text-4xl font-bold text-white mb-4">
          {hotelName} conectado exitosamente
        </h2>
        <p className="text-xl text-slate-400 mb-12 max-w-xl mx-auto">
          La integración con {currentPMS?.name ?? "PMS"} se ha completado. Los datos ya están
          fluyendo hacia la consola de Debacu.
        </p>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-12">
          {[
            { label: "PMS",          value: currentPMS?.name ?? "—" },
            { label: "Entorno",      value: isSandbox ? "Sandbox" : "Production" },
            { label: "Importados",   value: `${totalRecords.toLocaleString()} registros` },
            { label: "Próxima Sync", value: "en 15 min" },
          ].map((item) => (
            <Card key={item.label} className="p-4 bg-slate-900/50 border-slate-800">
              <p className="text-[10px] font-bold text-slate-500 uppercase mb-1">{item.label}</p>
              <p className="text-sm font-bold text-white">{item.value}</p>
            </Card>
          ))}
        </div>

        <div className="flex flex-col md:flex-row gap-4 justify-center">
          <Button variant="primary" onClick={onFinish} className="px-12 py-6 text-lg">
            Ver Panel del Hotel
          </Button>
          <Button
            variant="outline"
            onClick={() => {
              setStep(1);
              setSelectedPMS(null);
              setClientId("");
              setClientSecret("");
              setConnectionId(null);
              setValidationState("idle");
              setTestResult(null);
              setTestError(null);
              setSyncEntities(INITIAL_SYNC_ENTITIES);
              setSyncStarted(false);
              setAllSyncDone(false);
              setSyncLog([]);
            }}
            className="px-12 py-6 text-lg border-slate-700 text-slate-300"
          >
            Conectar Otro PMS
          </Button>
        </div>
      </div>
    );
  };

  // ── Render principal ──────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-[#0f172a] text-slate-300">
      <div className="max-w-7xl mx-auto p-8">
        {/* Breadcrumb */}
        <div className="flex items-center gap-2 text-xs font-bold text-slate-500 uppercase tracking-widest mb-8">
          <Building2 className="w-4 h-4" />
          <span>Hoteles</span>
          <ChevronRight className="w-3 h-3" />
          <Hotel className="w-4 h-4" />
          <span className="text-slate-300">{hotelName}</span>
          <ChevronRight className="w-3 h-3" />
          <span className="text-blue-500">Nueva Integración</span>
        </div>

        {/* Header */}
        <div className="flex justify-between items-start mb-12">
          <div>
            <h1 className="text-4xl font-bold text-white mb-2">Wizard de Conexión PMS</h1>
            <p className="text-slate-400">
              Configura la sincronización de datos para {hotelName} en 4 sencillos pasos.
            </p>
          </div>
          <Button variant="ghost" onClick={onClose} className="text-slate-500 hover:text-white">
            <XCircle className="w-6 h-6" />
          </Button>
        </div>

        {/* Stepper */}
        {step < 5 && renderStepper()}

        {/* Contenido */}
        <div className="mt-8">
          {step === 1 && renderStep1()}
          {step === 2 && renderStep2()}
          {step === 3 && renderStep3()}
          {step === 4 && renderStep4()}
          {step === 5 && renderStep5()}
        </div>
      </div>
    </div>
  );
};
