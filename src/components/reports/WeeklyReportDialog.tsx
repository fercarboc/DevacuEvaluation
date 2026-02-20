import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Dialog,
  DialogTitle,
  DialogContent,
  IconButton,
  Box,
  Typography,
  Stack,
  Button,
  Divider,
  CircularProgress,
  Alert,
  TextField,
  Chip,
} from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import DownloadIcon from "@mui/icons-material/Download";

import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
  LineChart,
  Line,
} from "recharts";

import { callEvalFn } from "@/services/callEvalFn";

const CHART_COLORS = {
  riskHigh: "#ef4444",
  riskMedium: "#f59e0b",
  riskLow: "#22c55e",
  incidents: "#2563eb",
  gross: "#2563eb",
  recovered: "#16a34a",
  net: "#ef4444",
};

type PeriodField = "evaluation_date" | "created_at";

type WeeklyPoint = {
  day: string; // YYYY-MM-DD
  incidents: number;
  risk_high: number;
  risk_medium: number;
  risk_low: number;
  gross: number;
  recovered: number;
  net: number;
};

type WeeklySeriesResp = {
  ok: boolean;
  customer_name?: string;
  period_from: string;
  period_to: string;
  period_field: PeriodField;
  total_rows?: number;
  series: WeeklyPoint[];
  error?: string;
  detail?: string;
};

type ExportScope = "WEEKLY_7D_DAILY_SERIES";

type BuildExportResponse = {
  ok: boolean;
  export_id: string;
  status: "READY" | "FAILED" | string;
  row_count: number;
  sha256: string;
  file_size_bytes: number;
  storage_bucket: string;
  storage_path: string;
  download_url: string | null;
  error?: string;
  detail?: string;
};

type BasicPdfResp = {
  ok: boolean;
  download_url: string | null;
  storage_path?: string;
  row_count?: number;
  error?: string;
  detail?: string;
};

function triggerDownload(url: string) {
  window.open(url, "_blank", "noopener,noreferrer");
}

function money(n: number) {
  const v = Number(n);
  return Number.isFinite(v) ? v.toFixed(2) : "0.00";
}

function clampDateRange(from: string, to: string) {
  if (!from || !to) return { from, to };
  if (from > to) return { from: to, to: from };
  return { from, to };
}

function isForbiddenResp(resp: any) {
  const d = String(resp?.detail ?? resp?.error ?? "");
  return d === "FORBIDDEN";
}

export interface WeeklyReportDialogProps {
  open: boolean;
  onClose: () => void;
  defaultFrom: string;
  defaultTo: string;
  periodField: PeriodField;
  orgId?: string | null; // ✅ opcional
}

export const WeeklyReportDialog: React.FC<WeeklyReportDialogProps> = ({
  open,
  onClose,
  defaultFrom,
  defaultTo,
  periodField: periodFieldProp,
  orgId,
}) => {
  const [periodField, setPeriodField] = useState<PeriodField>(periodFieldProp);
  const [from, setFrom] = useState<string>(defaultFrom);
  const [to, setTo] = useState<string>(defaultTo);

  const [loading, setLoading] = useState(false);
  const [exportingPdf, setExportingPdf] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [points, setPoints] = useState<WeeklyPoint[]>([]);
  const [meta, setMeta] = useState<{
    period_from: string;
    period_to: string;
    customer_name?: string;
    total_rows?: number;
  } | null>(null);

  const captureRef = useRef<HTMLDivElement | null>(null);

  const compactInputSx = useMemo(
    () => ({
      "& .MuiInputBase-root": { fontSize: 13, height: 36 },
      "& .MuiInputLabel-root": { fontSize: 12 },
      "& .MuiFormHelperText-root": { fontSize: 11, marginLeft: 0 },
      minWidth: 0,
    }),
    []
  );

  useEffect(() => {
    if (!open) return;
    setPeriodField(periodFieldProp);
    setFrom(defaultFrom);
    setTo(defaultTo);
    setErr(null);
    setPoints([]);
    setMeta(null);
  }, [open, defaultFrom, defaultTo, periodFieldProp]);

  async function load() {
    setErr(null);
    setLoading(true);

    try {
      const fixed = clampDateRange(from, to);

      // 1) intento normal (con orgId si viene)
      const payload1: any = {
        period_from: fixed.from,
        period_to: fixed.to,
        period_field: periodField,
        filters: { period_field: periodField }, // compat
        ...(orgId ? { org_id: orgId } : {}),
      };

      let resp: any = await callEvalFn("customer_operational_weekly_series_get", payload1);

      // 2) si FORBIDDEN y estabas enviando org_id, reintenta sin org_id
      if (orgId && isForbiddenResp(resp)) {
        const payload2: any = {
          period_from: fixed.from,
          period_to: fixed.to,
          period_field: periodField,
          filters: { period_field: periodField },
        };
        resp = await callEvalFn("customer_operational_weekly_series_get", payload2);
      }

      if (!resp || typeof resp !== "object") throw new Error("Respuesta inválida del servidor.");
      if (!resp.ok) {
        const d = String(resp.detail ?? resp.error ?? "request_failed");
        if (d === "PLAN_NOT_ACTIVE") throw new Error("Tu organización no tiene un plan activo para este módulo.");
        if (d === "FORBIDDEN") throw new Error("FORBIDDEN: no tienes permisos para esta organización (org_id incorrecto o sesión cruzada).");
        throw new Error(d || "No se pudo cargar la serie semanal.");
      }

      const data = resp as WeeklySeriesResp;
      const safeSeries = Array.isArray(data.series) ? data.series : [];

      setMeta({
        period_from: data.period_from,
        period_to: data.period_to,
        customer_name: data.customer_name,
        total_rows: data.total_rows,
      });

      setPoints(
        safeSeries.map((p) => ({
          day: String(p.day ?? "").slice(0, 10),
          incidents: Number(p.incidents ?? 0) || 0,
          risk_high: Number(p.risk_high ?? 0) || 0,
          risk_medium: Number(p.risk_medium ?? 0) || 0,
          risk_low: Number(p.risk_low ?? 0) || 0,
          gross: Number(p.gross ?? 0) || 0,
          recovered: Number(p.recovered ?? 0) || 0,
          net: Number(p.net ?? 0) || 0,
        }))
      );
    } catch (e: any) {
      setErr(String(e?.message ?? e));
      setMeta(null);
      setPoints([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!open) return;
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, from, to, periodField, orgId]);

  async function doExportCsv() {
    setErr(null);
    try {
      const fixed = clampDateRange(from, to);

      const payload: any = {
        export_type: "CSV",
        export_scope: "WEEKLY_7D_DAILY_SERIES" as ExportScope,
        period_from: fixed.from,
        period_to: fixed.to,
        period_field: periodField,
        filters: { period_field: periodField },
        ...(orgId ? { org_id: orgId } : {}),
      };

      const resp: any = await callEvalFn("customer_audit_export_build", payload);

      if (!resp?.ok) {
        const d = String(resp?.detail ?? resp?.error ?? "export_failed");
        if (d === "FORBIDDEN") throw new Error("FORBIDDEN: no tienes permisos (org_id incorrecto o sesión cruzada).");
        throw new Error(d);
      }

      const r = resp as BuildExportResponse;
      const url = r.download_url;
      if (!url) throw new Error("missing_download_url");

      triggerDownload(url);
    } catch (e: any) {
      setErr(String(e?.message ?? e));
    }
  }

  async function doExportPdfBasic() {
    setErr(null);
    setExportingPdf(true);

    try {
      const fixed = clampDateRange(from, to);

      const payload: any = {
        title: "Informe semanal (7 días)",
        period_from: fixed.from,
        period_to: fixed.to,
        period_field: periodField,
        ...(orgId ? { org_id: orgId } : {}),
      };

      const resp: any = await callEvalFn("customer_weekly_report_pdf_basic", payload);

      if (!resp?.ok) {
        const d = String(resp?.detail ?? resp?.error ?? "pdf_basic_failed");
        if (d === "FORBIDDEN") throw new Error("FORBIDDEN: no tienes permisos (org_id incorrecto o sesión cruzada).");
        throw new Error(d);
      }

      const r = resp as BasicPdfResp;
      const url = r.download_url;
      if (!url) throw new Error("missing_download_url");

      triggerDownload(url);
    } catch (e: any) {
      setErr(String(e?.message ?? e));
    } finally {
      setExportingPdf(false);
    }
  }

  const kpis = useMemo(() => {
    const totalInc = points.reduce((a, p) => a + (p.incidents || 0), 0);
    const high = points.reduce((a, p) => a + (p.risk_high || 0), 0);
    const medium = points.reduce((a, p) => a + (p.risk_medium || 0), 0);
    const low = points.reduce((a, p) => a + (p.risk_low || 0), 0);

    const gross = points.reduce((a, p) => a + (p.gross || 0), 0);
    const recovered = points.reduce((a, p) => a + (p.recovered || 0), 0);
    const net = points.reduce((a, p) => a + (p.net || 0), 0);

    const pctRecovered = gross > 0 ? Math.round((recovered / gross) * 100) : 0;

    return { totalInc, high, medium, low, gross, recovered, net, pctRecovered };
  }, [points]);

  const chartRisk = useMemo(
    () =>
      points.map((p) => ({
        day: p.day.slice(5),
        Alto: p.risk_high,
        Medio: p.risk_medium,
        Bajo: p.risk_low,
      })),
    [points]
  );

  const chartIncidents = useMemo(
    () =>
      points.map((p) => ({
        day: p.day.slice(5),
        Incidencias: p.incidents,
      })),
    [points]
  );

  const chartEconomic = useMemo(
    () =>
      points.map((p) => ({
        day: p.day.slice(5),
        Gross: p.gross,
        Recuperado: p.recovered,
        Neto: p.net,
      })),
    [points]
  );

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="lg" PaperProps={{ sx: { borderRadius: 3 } }}>
      <DialogTitle sx={{ pr: 6, pb: 1.25 }}>
        <Stack direction="row" alignItems="center" justifyContent="space-between" gap={2} sx={{ minWidth: 0 }}>
          <Box sx={{ minWidth: 0 }}>
            <Typography variant="subtitle1" fontWeight={900} sx={{ fontSize: 17 }}>
              Informe semanal (7 días)
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ fontSize: 12, mt: 0.25 }}>
              Serie diaria con riesgo + impacto económico (gross/recuperado/neto).
            </Typography>
          </Box>

          <IconButton onClick={onClose} aria-label="close" size="small">
            <CloseIcon fontSize="small" />
          </IconButton>
        </Stack>
      </DialogTitle>

      <DialogContent sx={{ pt: 1.5, minWidth: 0 }}>
        {/* Controls */}
        <Stack
          direction={{ xs: "column", md: "row" }}
          spacing={1.25}
          alignItems={{ xs: "stretch", md: "flex-end" }}
          sx={{ mb: 1.75, mt: 0.75, minWidth: 0 }}
        >
          <TextField
            size="small"
            label="Desde"
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            InputLabelProps={{ shrink: true }}
            sx={{ ...compactInputSx, minWidth: 150, maxWidth: { md: 190 } }}
            disabled={loading || exportingPdf}
          />
          <TextField
            size="small"
            label="Hasta"
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            InputLabelProps={{ shrink: true }}
            sx={{ ...compactInputSx, minWidth: 150, maxWidth: { md: 190 } }}
            disabled={loading || exportingPdf}
          />

          <TextField
            size="small"
            label="Campo periodo"
            select
            value={periodField}
            onChange={(e) => setPeriodField(e.target.value as PeriodField)}
            sx={{ ...compactInputSx, minWidth: 190, maxWidth: { md: 230 } }}
            SelectProps={{ native: true }}
            disabled={loading || exportingPdf}
          >
            <option value="evaluation_date">evaluation_date</option>
            <option value="created_at">created_at</option>
          </TextField>

          <Box sx={{ flex: 1, minWidth: 0 }} />

          <Stack direction="row" spacing={1} sx={{ flexWrap: "nowrap", minWidth: 0 }}>
            <Button
              variant="outlined"
              size="small"
              startIcon={<DownloadIcon sx={{ fontSize: 16 }} />}
              onClick={() => void doExportCsv()}
              disabled={loading || exportingPdf}
              sx={{ fontSize: 11, px: 1.5, py: 0.4, minHeight: 32, whiteSpace: "nowrap" }}
            >
              CSV
            </Button>

            <Button
              variant="contained"
              size="small"
              startIcon={<DownloadIcon sx={{ fontSize: 16 }} />}
              onClick={() => void doExportPdfBasic()}
              disabled={loading || exportingPdf}
              sx={{ fontSize: 11, px: 1.5, py: 0.4, minHeight: 32, whiteSpace: "nowrap" }}
            >
              {exportingPdf ? "Generando…" : "PDF"}
            </Button>
          </Stack>
        </Stack>

        {meta ? (
          <Stack direction="row" spacing={1} sx={{ mb: 1, minWidth: 0 }} flexWrap="wrap">
            <Chip size="small" label={`Rango: ${meta.period_from} → ${meta.period_to}`} />
            <Chip size="small" label={`Campo: ${periodField}`} />
            {meta.customer_name ? <Chip size="small" label={`Hotel: ${meta.customer_name}`} /> : null}
            {typeof meta.total_rows === "number" ? <Chip size="small" label={`Registros: ${meta.total_rows}`} /> : null}
            {orgId ? <Chip size="small" label={`org_id: ${orgId}`} /> : <Chip size="small" label="org_id: auto" />}
          </Stack>
        ) : null}

        {err ? (
          <Alert severity="error" sx={{ mb: 1.5 }}>
            {err}
          </Alert>
        ) : null}

        {/* CONTENIDO */}
        <Box ref={captureRef} sx={{ bgcolor: "#fff", minWidth: 0 }}>
          {/* KPIs */}
          <Stack direction={{ xs: "column", md: "row" }} spacing={1.25} sx={{ mb: 1.75, minWidth: 0 }}>
            <KpiBox
              title="Incidencias (7d)"
              value={`${kpis.totalInc}`}
              subtitle={`Alto: ${kpis.high} · Medio: ${kpis.medium} · Bajo: ${kpis.low}`}
            />
            <KpiBox
              title="Coste bruto (Gross)"
              value={`${money(kpis.gross)} EUR`}
              subtitle={`Recuperado: ${money(kpis.recovered)} EUR (${kpis.pctRecovered}%)`}
            />
            <KpiBox title="Pérdida neta" value={`${money(kpis.net)} EUR`} subtitle="Neto = gross - recuperado (o neto almacenado)" />
          </Stack>

          <Divider sx={{ my: 1.75 }} />

          <Stack spacing={1.75} sx={{ minWidth: 0 }}>
            {/* Riesgo */}
            <Box sx={{ height: 280, border: "1px solid", borderColor: "divider", borderRadius: 2, p: 1.25, minWidth: 0 }}>
              <Typography variant="subtitle2" fontWeight={900} sx={{ mb: 1, fontSize: 13 }}>
                Distribución de riesgo por día
              </Typography>
              {loading ? (
                <CenterLoading />
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartRisk} margin={{ top: 10, right: 16, left: 0, bottom: 8 }}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="day" tick={{ fontSize: 12 }} />
                    <YAxis tick={{ fontSize: 12 }} />
                    <Tooltip />
                    <Legend />
                    <Bar dataKey="Alto" stackId="a" fill={CHART_COLORS.riskHigh} />
                    <Bar dataKey="Medio" stackId="a" fill={CHART_COLORS.riskMedium} />
                    <Bar dataKey="Bajo" stackId="a" fill={CHART_COLORS.riskLow} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </Box>

            {/* Incidencias */}
            <Box sx={{ height: 260, border: "1px solid", borderColor: "divider", borderRadius: 2, p: 1.25, minWidth: 0 }}>
              <Typography variant="subtitle2" fontWeight={900} sx={{ mb: 1, fontSize: 13 }}>
                Incidencias por día
              </Typography>
              {loading ? (
                <CenterLoading />
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartIncidents} margin={{ top: 10, right: 16, left: 0, bottom: 8 }}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="day" tick={{ fontSize: 12 }} />
                    <YAxis tick={{ fontSize: 12 }} />
                    <Tooltip />
                    <Legend />
                    <Bar dataKey="Incidencias" fill={CHART_COLORS.incidents} radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </Box>

            {/* Económico */}
            <Box sx={{ height: 300, border: "1px solid", borderColor: "divider", borderRadius: 2, p: 1.25, minWidth: 0 }}>
              <Typography variant="subtitle2" fontWeight={900} sx={{ mb: 1, fontSize: 13 }}>
                Impacto económico diario (Gross / Recuperado / Neto)
              </Typography>
              {loading ? (
                <CenterLoading />
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartEconomic} margin={{ top: 10, right: 16, left: 0, bottom: 8 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                    <XAxis dataKey="day" tick={{ fontSize: 12 }} />
                    <YAxis tick={{ fontSize: 12 }} />
                    <Tooltip
                      formatter={(val: any, name: any) => {
                        const n = Number(val || 0);
                        return [`${money(n)} EUR`, String(name)];
                      }}
                    />
                    <Legend />
                    <Line type="monotone" dataKey="Gross" stroke={CHART_COLORS.gross} strokeWidth={2.5} dot={{ r: 4 }} activeDot={{ r: 6 }} />
                    <Line
                      type="monotone"
                      dataKey="Recuperado"
                      stroke={CHART_COLORS.recovered}
                      strokeWidth={2.5}
                      dot={{ r: 4 }}
                      activeDot={{ r: 6 }}
                    />
                    <Line type="monotone" dataKey="Neto" stroke={CHART_COLORS.net} strokeWidth={2.5} dot={{ r: 4 }} activeDot={{ r: 6 }} />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </Box>
          </Stack>
        </Box>

        <Box sx={{ height: 10 }} />
      </DialogContent>
    </Dialog>
  );
};

const KpiBox: React.FC<{ title: string; value: string; subtitle?: string }> = ({ title, value, subtitle }) => (
  <Box
    sx={{
      flex: 1,
      border: "1px solid",
      borderColor: "divider",
      borderRadius: 2,
      p: 1.5,
      minWidth: 220,
      bgcolor: "background.paper",
    }}
  >
    <Typography variant="caption" color="text.secondary" fontWeight={900} sx={{ fontSize: 11 }}>
      {title}
    </Typography>
    <Typography variant="h6" fontWeight={900} sx={{ mt: 0.15, fontSize: 18 }}>
      {value}
    </Typography>
    {subtitle ? (
      <Typography variant="body2" color="text.secondary" sx={{ mt: 0.25, fontSize: 12 }}>
        {subtitle}
      </Typography>
    ) : null}
  </Box>
);

function CenterLoading() {
  return (
    <Stack alignItems="center" justifyContent="center" sx={{ height: "100%" }}>
      <CircularProgress size={24} />
      <Typography variant="body2" color="text.secondary" sx={{ mt: 1, fontSize: 12 }}>
        Cargando…
      </Typography>
    </Stack>
  );
}

export default WeeklyReportDialog;