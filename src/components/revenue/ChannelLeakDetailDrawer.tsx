// src/components/revenue/ChannelLeakDetailDrawer.tsx
import React, { useEffect, useMemo, useState } from "react";
import {
  Drawer,
  Box,
  Typography,
  IconButton,
  Button,
  Card,
  CardContent,
  Divider,
  Chip,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Tooltip,
  Stack,
  Skeleton,
  alpha,
  LinearProgress,
} from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import DownloadIcon from "@mui/icons-material/Download";

import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RTooltip,
  ComposedChart,
  Line,
  Legend,
} from "recharts";

import { callEvalFn } from "@/services/callEvalFn";

type PeriodField = "evaluation_date" | "created_at";
type ChannelGroup = "OTA" | "DIRECTO" | "B2B" | "OTROS";

type RowOut = {
  id: string;
  evaluation_date: string | null;
  created_at: string | null;

  platform: string | null;
  platform_key: string;
  channel_group: ChannelGroup | "OTROS";
  channel_type: string | null;

  rating: number;
  risk_bucket: "HIGH" | "MEDIUM" | "LOW";

  incident_type: string | null;

  gross: number;
  recovered: number;
  net: number;

  document: string | null;
  full_name: string | null;
};

type ApiOk = {
  ok: true;
  data: {
    meta: {
      app_id: string;
      org_id: string;
      customer_id: string;
      channel_group: string;
      platform_key: string;
      period_from: string;
      period_to: string;
      period_field: PeriodField;
    };
    rows: RowOut[];
    total: number;
    limit: number;
    offset: number;
  };
};

type ApiErr = { ok: false; error: string; detail?: string };

function euro(n: number) {
  const v = Number.isFinite(n) ? n : 0;
  return new Intl.NumberFormat("es-ES", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(v);
}

function pct(n: number) {
  const v = Number.isFinite(n) ? n : 0;
  return `${Math.round(v * 100)}%`;
}

function toIsoDay(d: string | null) {
  if (!d) return "";
  return d.slice(0, 10);
}

function safeType(t: string | null) {
  return (t ?? "UNKNOWN").trim() || "UNKNOWN";
}

function riskChipColor(r: RowOut["risk_bucket"]) {
  if (r === "HIGH") return "error";
  if (r === "MEDIUM") return "warning";
  return "success";
}

function downloadCsv(filename: string, rows: RowOut[]) {
  const header = [
    "date",
    "id",
    "risk",
    "incident_type",
    "gross",
    "recovered",
    "net",
    "platform_key",
    "channel_group",
    "full_name",
    "document",
  ];
  const lines = [header.join(",")];

  for (const r of rows) {
    const date = toIsoDay(r.evaluation_date) || toIsoDay(r.created_at) || "";
    const vals = [
      date,
      r.id,
      r.risk_bucket,
      safeType(r.incident_type),
      String(r.gross ?? 0),
      String(r.recovered ?? 0),
      String(r.net ?? 0),
      r.platform_key,
      r.channel_group,
      (r.full_name ?? "").replaceAll(",", " "),
      (r.document ?? "").replaceAll(",", " "),
    ];
    lines.push(vals.map((x) => `"${String(x).replaceAll('"', '""')}"`).join(","));
  }

  const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/** ===========================
 * Recomendación dinámica
 * =========================== */
function buildRecommendation(args: { channelGroup: ChannelGroup; platformKey: string; rows: RowOut[] }) {
  const { channelGroup, platformKey, rows } = args;

  const incidents = rows.length;
  const grossTotal = rows.reduce((a, r) => a + (r.gross || 0), 0);
  const recoveredTotal = rows.reduce((a, r) => a + (r.recovered || 0), 0);
  const netTotal = rows.reduce((a, r) => a + (r.net || 0), 0);

  if (incidents === 0) {
    return {
      tone: "success" as const,
      title: "Sin incidencias relevantes",
      text:
        "En este periodo no hay registros con impacto neto en este canal. Mantén monitorización y revisa si faltan datos de carga.",
    };
  }

  const avgNet = netTotal / Math.max(1, incidents);
  const recoveryRate = grossTotal > 0 ? recoveredTotal / grossTotal : 0;

  const byDay = new Map<string, { net: number; n: number }>();
  for (const r of rows) {
    const d = toIsoDay(r.evaluation_date) || toIsoDay(r.created_at) || "unknown";
    const cur = byDay.get(d) ?? { net: 0, n: 0 };
    cur.net += r.net || 0;
    cur.n += 1;
    byDay.set(d, cur);
  }
  const dayAgg = Array.from(byDay.entries()).map(([day, v]) => ({ day, ...v }));
  dayAgg.sort((a, b) => b.net - a.net);
  const topDay = dayAgg[0];
  const peakShare = topDay ? (netTotal > 0 ? topDay.net / netTotal : 0) : 0;

  const byType = new Map<string, { net: number; n: number; recovered: number; gross: number }>();
  for (const r of rows) {
    const t = safeType(r.incident_type);
    const cur = byType.get(t) ?? { net: 0, n: 0, recovered: 0, gross: 0 };
    cur.net += r.net || 0;
    cur.n += 1;
    cur.recovered += r.recovered || 0;
    cur.gross += r.gross || 0;
    byType.set(t, cur);
  }
  const typeAgg = Array.from(byType.entries()).map(([type, v]) => ({ type, ...v }));
  typeAgg.sort((a, b) => b.net - a.net);
  const topType = typeAgg[0];

  if (recoveryRate >= 0.6 && netTotal > 0) {
    return {
      tone: "info" as const,
      title: "Buena recuperación, pero hay fuga residual",
      text:
        `Recuperas ${pct(recoveryRate)} del bruto. ` +
        `Aun así queda net loss ${euro(netTotal)} (media ${euro(avgNet)} por incidencia). ` +
        (topType ? `Principal motivo: ${topType.type}. ` : "") +
        (peakShare >= 0.7
          ? `Pico concentrado el ${topDay.day}. Revisa ese día (turnos, validaciones, check-in).`
          : "Revisa reglas de aceptación y depósitos para reducir el remanente."),
    };
  }

  if (incidents <= 2 && avgNet >= 80) {
    return {
      tone: "warning" as const,
      title: "Pocas incidencias, coste alto",
      text:
        `Ticket medio alto (${euro(avgNet)}). ` +
        `Aplica fricción solo en perfiles/fechas de riesgo: prepago parcial, depósito o verificación de tarjeta. ` +
        (channelGroup === "DIRECTO"
          ? "En directo, endurece reglas en picos y segmenta por historial."
          : "En OTA, revisa condiciones (no reembolsable, política daños, fianza) si el canal lo permite."),
    };
  }

  const dominant = (topType?.type ?? "").toUpperCase();

  if (dominant.includes("NO_SHOW")) {
    return {
      tone: "warning" as const,
      title: "NO_SHOW domina la fuga",
      text:
        `Principal drenaje: NO_SHOW (net ${euro(topType.net)} en ${topType.n} casos). ` +
        `Acción: garantía de tarjeta/depósito, cancelación más dura en picos y confirmación activa 48–24h antes. ` +
        (peakShare >= 0.7 ? `Pico: ${topDay.day}.` : ""),
    };
  }

  if (dominant.includes("SMOKING")) {
    return {
      tone: "warning" as const,
      title: "Fumar en habitación: control y cobro",
      text:
        `SMOKING_IN_ROOM concentra el mayor net loss. ` +
        `Acción: depósito/preautorización, señalización clara y evidencia operativa (parte + fotos) para cobrar sin fricción. ` +
        `Si no recuperas, revisa flujo y plazos.`,
    };
  }

  if (dominant.includes("PROPERTY_DAMAGE")) {
    return {
      tone: "warning" as const,
      title: "Daños materiales: reduce exposición",
      text:
        `PROPERTY_DAMAGE es el principal coste. ` +
        `Acción: fianza/preautorización en perfiles de riesgo, checklist y estandarizar partes para acelerar recuperaciones.`,
    };
  }

  if (dominant.includes("MISSING") || dominant.includes("THEFT") || dominant.includes("KEY_LOSS")) {
    return {
      tone: "warning" as const,
      title: "Pérdidas/objetos: foco en prevención",
      text:
        `Pérdida recurrente por ${topType.type}. ` +
        `Acción: inventario mínimo, registro de entrega (toallas/mandos/llaves) y cobro automático documentado si procede.`,
    };
  }

  if (channelGroup === "DIRECTO") {
    return {
      tone: "info" as const,
      title: "Directo: ajusta aceptación por patrón",
      text:
        `Net loss ${euro(netTotal)} en ${incidents} incidencias. ` +
        `Busca patrón por fecha/motivo y endurece reglas solo donde duele (picos, tipos dominantes). ` +
        `Si domina riesgo alto, añade verificación y depósito segmentado.`,
    };
  }

  return {
    tone: "info" as const,
    title: "Ajuste operativo recomendado",
    text:
      `Net loss ${euro(netTotal)} (media ${euro(avgNet)}). ` +
      (topType ? `Motivo principal: ${topType.type}. ` : "") +
      `Actúa primero donde se concentra el net loss (motivo + día pico) y revisa recuperación/cobro en ${platformKey}.`,
  };
}

/** ===========================
 * UI helpers “premium”
 * =========================== */
function toneBorder(tone: "warning" | "success" | "info") {
  if (tone === "warning") return "warning.main";
  if (tone === "success") return "success.main";
  return "info.main";
}

function toneBg(tone: "warning" | "success" | "info") {
  if (tone === "warning") return "warning.50";
  if (tone === "success") return "success.50";
  return "info.50";
}

function toneChipColor(tone: "warning" | "success" | "info") {
  if (tone === "warning") return "warning";
  if (tone === "success") return "success";
  return "info";
}

function KpiCard(props: {
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
  loading?: boolean;
  accent?: "neutral" | "danger" | "info";
}) {
  const { label, value, sub, loading, accent = "neutral" } = props;

  const accentColor =
    accent === "danger" ? "error.main" : accent === "info" ? "info.main" : "text.secondary";

  const accentBg =
    accent === "danger"
      ? alpha("#ef4444", 0.08)
      : accent === "info"
      ? alpha("#2563eb", 0.08)
      : alpha("#0f172a", 0.03);

  return (
    <Card
      variant="outlined"
      sx={{
        flex: 1,
        borderRadius: 2,
        borderColor: "divider",
        background: `linear-gradient(180deg, ${accentBg} 0%, rgba(255,255,255,0) 75%)`,
      }}
    >
      <CardContent sx={{ py: 1.25, px: 1.5, "&:last-child": { pb: 1.25 } }}>
        <Typography
          variant="caption"
          color="text.secondary"
          sx={{ letterSpacing: 0.6, textTransform: "uppercase", fontWeight: 700 }}
        >
          {label}
        </Typography>

        <Box sx={{ mt: 0.25, display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 1 }}>
          {loading ? (
            <Skeleton width={88} height={28} />
          ) : (
            <Typography variant="h6" sx={{ fontWeight: 800, color: accentColor }}>
              {value}
            </Typography>
          )}

          {sub ? (
            <Typography variant="caption" color="text.secondary" sx={{ whiteSpace: "nowrap" }}>
              {sub}
            </Typography>
          ) : null}
        </Box>
      </CardContent>
    </Card>
  );
}

function riskChipStyle(r: RowOut["risk_bucket"]) {
  if (r === "HIGH") return { color: "error" as const, label: "HIGH" };
  if (r === "MEDIUM") return { color: "warning" as const, label: "MEDIUM" };
  return { color: "success" as const, label: "LOW" };
}

/** ===========================
 * Componente
 * =========================== */
export default function ChannelLeakDetailDrawer(props: {
  open: boolean;
  onClose: () => void;

  channelGroup: ChannelGroup;
  platformKey: string;

  periodFrom: string; // YYYY-MM-DD
  periodTo: string; // YYYY-MM-DD
  periodField: PeriodField;

  limit?: number;
  offset?: number;
}) {
  const {
    open,
    onClose,
    channelGroup,
    platformKey,
    periodFrom,
    periodTo,
    periodField,
    limit = 200,
    offset = 0,
  } = props;

  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [rows, setRows] = useState<RowOut[]>([]);
  const [total, setTotal] = useState(0);

  useEffect(() => {
    if (!open) return;

    let cancelled = false;

    async function run() {
      setLoading(true);
      setErr(null);

      try {
        const res = await callEvalFn<ApiOk | ApiErr>("debacu_eval_channel_leak_detail_get", {
          channel_group: channelGroup,
          platform_key: platformKey,
          period_from: periodFrom,
          period_to: periodTo,
          period_field: periodField,
          limit,
          offset,
        });

        if (cancelled) return;

        if (!res || (res as any).ok !== true) {
          const e = res as ApiErr;
          setErr(e?.detail || e?.error || "Error desconocido");
          setRows([]);
          setTotal(0);
          return;
        }

        const ok = res as ApiOk;
        setRows(ok.data.rows ?? []);
        setTotal(ok.data.total ?? 0);
      } catch (e: any) {
        if (cancelled) return;
        setErr(String(e?.message ?? e));
        setRows([]);
        setTotal(0);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    run();
    return () => {
      cancelled = true;
    };
  }, [open, channelGroup, platformKey, periodFrom, periodTo, periodField, limit, offset]);

  const kpis = useMemo(() => {
    const incidents = rows.length;
    const grossTotal = rows.reduce((a, r) => a + (r.gross || 0), 0);
    const recoveredTotal = rows.reduce((a, r) => a + (r.recovered || 0), 0);
    const netTotal = rows.reduce((a, r) => a + (r.net || 0), 0);
    const avgNet = netTotal / Math.max(1, incidents);
    return { incidents, grossTotal, recoveredTotal, netTotal, avgNet };
  }, [rows]);

  const rec = useMemo(
    () => buildRecommendation({ channelGroup, platformKey, rows }),
    [channelGroup, platformKey, rows]
  );

  const byMotivo = useMemo(() => {
    const map = new Map<string, { type: string; net: number; n: number }>();
    for (const r of rows) {
      const type = safeType(r.incident_type);
      const cur = map.get(type) ?? { type, net: 0, n: 0 };
      cur.net += r.net || 0;
      cur.n += 1;
      map.set(type, cur);
    }
    const out = Array.from(map.values());
    out.sort((a, b) => b.net - a.net);
    return out.slice(0, 10);
  }, [rows]);

  const byDia = useMemo(() => {
    const map = new Map<string, { day: string; net: number; incidents: number }>();
    for (const r of rows) {
      const day = toIsoDay(r.evaluation_date) || toIsoDay(r.created_at) || "unknown";
      const cur = map.get(day) ?? { day, net: 0, incidents: 0 };
      cur.net += r.net || 0;
      cur.incidents += 1;
      map.set(day, cur);
    }
    const out = Array.from(map.values());
    out.sort((a, b) => a.day.localeCompare(b.day));
    return out;
  }, [rows]);

  const title = `${channelGroup === "DIRECTO" ? "Directo" : channelGroup} / ${platformKey}`;

  return (
    <Drawer
      anchor="right"
      open={open}
      onClose={onClose}
      PaperProps={{
        sx: {
          width: "min(940px, 94vw)",
          borderTopLeftRadius: 16,
          borderBottomLeftRadius: 16,
          overflow: "hidden",
          bgcolor: "background.paper",
        },
      }}
    >
      {/* Top bar */}
      <Box
        sx={{
          px: 2,
          py: 1.5,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 2,
          position: "sticky",
          top: 0,
          zIndex: 3,
          bgcolor: "background.paper",
          borderBottom: "1px solid",
          borderColor: "divider",
          backgroundImage: `linear-gradient(180deg, ${alpha("#2563eb", 0.08)} 0%, rgba(255,255,255,0) 70%)`,
        }}
      >
        <Box sx={{ minWidth: 0 }}>
          <Typography variant="subtitle1" noWrap sx={{ fontWeight: 800 }}>
            {title} <span style={{ opacity: 0.65, fontWeight: 650 }}>— Detalle de fuga</span>
          </Typography>

          <Typography variant="caption" color="text.secondary" noWrap sx={{ display: "block" }}>
            {periodFrom} → {periodTo} · {periodField} ·{" "}
            <span style={{ opacity: 0.85 }}>total {total} · mostrando {rows.length}</span>
          </Typography>
        </Box>

        <Box sx={{ display: "flex", gap: 1, flexShrink: 0, alignItems: "center" }}>
          <Button
            size="small"
            variant="outlined"
            startIcon={<DownloadIcon fontSize="small" />}
            onClick={() => downloadCsv(`fuga_${channelGroup}_${platformKey}_${periodFrom}_${periodTo}.csv`, rows)}
            disabled={rows.length === 0}
            sx={{ borderRadius: 2, textTransform: "none" }}
          >
            CSV
          </Button>
          <IconButton size="small" onClick={onClose} sx={{ borderRadius: 2 }}>
            <CloseIcon fontSize="small" />
          </IconButton>
        </Box>
      </Box>

      {loading && <LinearProgress />}

      <Box
  sx={{
    p: 2,
    height: "calc(100vh - 64px)", // 64px ≈ alto del header sticky (ajusta si tu header es más alto)
    overflowY: "auto",
  }}
>

        {err && (
          <Card
            variant="outlined"
            sx={{
              mb: 2,
              borderRadius: 2,
              borderColor: "error.main",
              bgcolor: alpha("#ef4444", 0.06),
            }}
          >
            <CardContent sx={{ py: 1.25, "&:last-child": { pb: 1.25 } }}>
              <Typography variant="caption" color="error" sx={{ fontWeight: 800, letterSpacing: 0.6 }}>
                Error
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                {err}
              </Typography>
            </CardContent>
          </Card>
        )}

        {/* KPIs */}
        <Stack direction={{ xs: "column", sm: "row" }} spacing={1.25} sx={{ mb: 1.5 }}>
          <KpiCard label="Incidencias" value={kpis.incidents} sub="registros" loading={loading} accent="neutral" />
          <KpiCard
            label="Net loss"
            value={euro(kpis.netTotal)}
            sub={`Bruto ${euro(kpis.grossTotal)} · Recup ${euro(kpis.recoveredTotal)}`}
            loading={loading}
            accent="danger"
          />
          <KpiCard label="Net medio" value={euro(kpis.avgNet)} sub="por incidencia" loading={loading} accent="info" />
        </Stack>

        {/* Recomendación */}
        <Card
          variant="outlined"
          sx={{
            mb: 2,
            borderRadius: 2,
            borderColor: toneBorder(rec.tone),
            bgcolor: toneBg(rec.tone),
          }}
        >
          <CardContent sx={{ py: 1.25, "&:last-child": { pb: 1.25 } }}>
            <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 1 }}>
              <Typography variant="subtitle2" sx={{ fontWeight: 900 }}>
                {rec.title}
              </Typography>
              <Chip size="small" label={rec.tone.toUpperCase()} color={toneChipColor(rec.tone)} variant="outlined" />
            </Box>

            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5, lineHeight: 1.4 }}>
              {rec.text}
            </Typography>
          </CardContent>
        </Card>

        {/* Charts */}
        <Stack direction={{ xs: "column", md: "row" }} spacing={1.25} sx={{ mb: 2 }}>
          <Card
            variant="outlined"
            sx={{
              flex: 1,
              borderRadius: 2,
              bgcolor: alpha("#0f172a", 0.015),
            }}
          >
            <CardContent sx={{ pb: 1.25, "&:last-child": { pb: 1.25 } }}>
              <Typography variant="subtitle2" sx={{ fontWeight: 900 }}>
                Por motivo
              </Typography>
              <Typography variant="caption" color="text.secondary">
                Net loss acumulado (top 10)
              </Typography>

              <Box sx={{ height: 230, mt: 1 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={byMotivo} layout="vertical" margin={{ top: 10, right: 14, bottom: 10, left: 70 }}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis type="number" tickFormatter={(v) => `${v}€`} tick={{ fontSize: 11 }} />
                    <YAxis type="category" dataKey="type" width={170} tick={{ fontSize: 11 }} />
                    <RTooltip formatter={(v: any) => euro(Number(v))} />
                    <Bar dataKey="net" fill="#111111" radius={[10, 10, 10, 10]} />
                  </BarChart>
                </ResponsiveContainer>
              </Box>
            </CardContent>
          </Card>

          <Card
            variant="outlined"
            sx={{
              flex: 1,
              borderRadius: 2,
              bgcolor: alpha("#0f172a", 0.015),
            }}
          >
            <CardContent sx={{ pb: 1.25, "&:last-child": { pb: 1.25 } }}>
              <Typography variant="subtitle2" sx={{ fontWeight: 900 }}>
                Por día
              </Typography>
              <Typography variant="caption" color="text.secondary">
                Net € + nº incidencias
              </Typography>

              <Box sx={{ height: 230, mt: 1 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={byDia} margin={{ top: 10, right: 22, bottom: 10, left: 6 }}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="day" tick={{ fontSize: 11 }} />
                    <YAxis yAxisId="left" tickFormatter={(v) => `${v}€`} tick={{ fontSize: 11 }} />
                    <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11 }} />

                    <Legend
                      verticalAlign="top"
                      height={18}
                      iconType="circle"
                      wrapperStyle={{ fontSize: 11, opacity: 0.9 }}
                    />

                    <RTooltip
                      formatter={(v: any, name: any) => {
                        if (name === "net") return euro(Number(v));
                        return v;
                      }}
                    />

                    <Line
                      yAxisId="left"
                      type="monotone"
                      dataKey="net"
                      name="net"
                      stroke="#111111"
                      strokeWidth={2.2}
                      dot={{ r: 2.8 }}
                    />
                    <Line
                      yAxisId="right"
                      type="monotone"
                      dataKey="incidents"
                      name="incidencias"
                      stroke="#2563eb"
                      strokeWidth={2.2}
                      dot={{ r: 2.8 }}
                    />
                  </ComposedChart>
                </ResponsiveContainer>
              </Box>

              <Typography variant="caption" color="text.secondary">
                Negro: net € · Azul: incidencias
              </Typography>
            </CardContent>
          </Card>
        </Stack>

        {/* Tabla */}
        <Card variant="outlined" sx={{ borderRadius: 2 }}>
          <CardContent sx={{ pb: 1.25, "&:last-child": { pb: 1.25 } }}>
            <Box sx={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", mb: 1 }}>
              <Box>
                <Typography variant="subtitle2" sx={{ fontWeight: 900 }}>
                  Incidencias
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  Lista (máx. 200) para detectar patrón real
                </Typography>
              </Box>
              <Chip
                size="small"
                variant="outlined"
                label={`${rows.length} filas`}
                sx={{ fontSize: 12, borderRadius: 2 }}
              />
            </Box>

            <Box sx={{ overflowX: "auto" }}>
              <Table
                size="small"
                sx={{
                  minWidth: 760,
                  "& thead th": {
                    fontSize: 12,
                    fontWeight: 900,
                    bgcolor: alpha("#0f172a", 0.04),
                    borderBottom: "1px solid",
                    borderBottomColor: "divider",
                    whiteSpace: "nowrap",
                  },
                  "& tbody td": { fontSize: 12, py: 0.9, whiteSpace: "nowrap" },
                }}
              >
                <TableHead>
                  <TableRow>
                    <TableCell>Fecha</TableCell>
                    <TableCell>ID</TableCell>
                    <TableCell>Riesgo</TableCell>
                    <TableCell>Tipo</TableCell>
                    <TableCell align="right">Bruto</TableCell>
                    <TableCell align="right">Recup.</TableCell>
                    <TableCell align="right">Net</TableCell>
                  </TableRow>
                </TableHead>

                <TableBody>
                  {rows.map((r) => {
                    const date = toIsoDay(r.evaluation_date) || toIsoDay(r.created_at) || "-";
                    const risk = riskChipStyle(r.risk_bucket);

                    return (
                      <TableRow
                        key={r.id}
                        hover
                        sx={{
                          "&:hover td": { bgcolor: alpha("#2563eb", 0.04) },
                        }}
                      >
                        <TableCell>{date}</TableCell>

                        <TableCell sx={{ maxWidth: 240 }}>
                          <Tooltip title={r.id}>
                            <span>{r.id.slice(0, 10)}…</span>
                          </Tooltip>
                        </TableCell>

                        <TableCell>
                          <Chip size="small" label={risk.label} color={risk.color} sx={{ fontWeight: 800 }} />
                        </TableCell>

                        <TableCell>{safeType(r.incident_type)}</TableCell>

                        <TableCell align="right">{Math.round(r.gross || 0)}</TableCell>
                        <TableCell align="right">{Math.round(r.recovered || 0)}</TableCell>

                        <TableCell align="right">
                          <Chip
                            size="small"
                            label={Math.round(r.net || 0)}
                            color={r.net > 0 ? "error" : "default"}
                            variant={r.net > 0 ? "filled" : "outlined"}
                            sx={{ fontWeight: 900 }}
                          />
                        </TableCell>
                      </TableRow>
                    );
                  })}

                  {rows.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={7} sx={{ py: 2 }}>
                        <Typography variant="body2" color="text.secondary">
                          {loading ? "Cargando…" : "Sin datos para este canal / periodo."}
                        </Typography>
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </Box>

            <Box sx={{ display: "flex", justifyContent: "flex-end", mt: 1.5 }}>
              <Button size="small" variant="outlined" onClick={onClose} sx={{ borderRadius: 2, textTransform: "none" }}>
                Cerrar
              </Button>
            </Box>
          </CardContent>
        </Card>
      </Box>
    </Drawer>
  );
}
