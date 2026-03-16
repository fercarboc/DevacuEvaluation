// src/components/.../DailyReportDialog.tsx
import React, { useEffect, useMemo, useState } from "react";
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
  Table,
  TableHead,
  TableRow,
  TableCell,
  TableBody,
  CircularProgress,
  Alert,
  TextField,
  MenuItem,
  Chip,
  Tooltip as MuiTooltip,
} from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import DownloadIcon from "@mui/icons-material/Download";

import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, Legend } from "recharts";

import { callEvalFn } from "@/services/callEvalFn";

type PeriodField = "evaluation_date" | "created_at";

type DailyRow = {
  incident_type: string;
  incidents_today: number;
  incidents_yesterday: number;
  delta: number;

  net_today: number;
  net_yesterday: number;

  gross_today: number;
  recovered_today: number;

  gross_yesterday: number;
  recovered_yesterday: number;
};

type BuildResp = { ok: boolean; download_url?: string | null; error?: string; detail?: string };

function isoDate(d: Date) {
  return d.toISOString().slice(0, 10);
}

function isNetworkError(msg: string) {
  const m = msg.toLowerCase();
  return m.includes("failed to fetch") || m.includes("network request failed") || m.includes("networkerror") || m.includes("load failed");
}

function addDays(d: Date, days: number) {
  const x = new Date(d.getTime());
  x.setUTCDate(x.getUTCDate() + days);
  return x;
}

function money(n: number) {
  return Number.isFinite(n) ? n.toFixed(2) : "0.00";
}

function safeLabel(s: string) {
  return String(s ?? "").trim() || "UNKNOWN";
}

export interface DailyReportDialogProps {
  open: boolean;
  onClose: () => void;
  orgId: string; // ✅ obligatorio
}

export const DailyReportDialog: React.FC<DailyReportDialogProps> = ({ open, onClose, orgId }) => {
  const today = useMemo(() => isoDate(new Date()), []);
  const yesterday = useMemo(() => isoDate(addDays(new Date(), -1)), []);

  const [periodField, setPeriodField] = useState<PeriodField>("evaluation_date");
  const [dateToday, setDateToday] = useState<string>(today);
  const [dateYesterday, setDateYesterday] = useState<string>(yesterday);

  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [rows, setRows] = useState<DailyRow[]>([]);

  async function load() {
    setErr(null);

    // ✅ si no hay orgId, no intentes exportar: te traerá 0 o org equivocada
    if (!orgId || orgId.trim().length < 8) {
      setRows([]);
      setErr("No hay orgId activo. Re-inicia sesión o selecciona un hotel.");
      return;
    }

    setLoading(true);
    try {
      const resp: any = await callEvalFn("customer_audit_export_build", {
        org_id: orgId, // ✅ CLAVE
        export_type: "CSV",
        export_scope: "DAILY_HOY_AYER_BY_TYPE",
        period_from: dateYesterday,
        period_to: dateToday,
        filters: { period_field: periodField },
      });

      if (!resp?.ok) throw new Error(resp?.error || resp?.detail || "fetch_failed");
      const url = resp.download_url as string;
      if (!url) throw new Error("missing_download_url");

      const csvText = await fetch(url).then((r) => r.text());
      setRows(parseDailyCsv(csvText));
    } catch (e: any) {
      const msg = String(e?.message ?? e);
      setErr(isNetworkError(msg) ? "No se pudo conectar con el servidor. Comprueba tu conexión e inténtalo de nuevo." : msg);
      setRows([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!open) return;
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, dateToday, dateYesterday, periodField, orgId]);

  async function doExport(kind: "PDF" | "CSV") {
    setErr(null);

    if (!orgId || orgId.trim().length < 8) {
      setErr("No hay orgId activo. Re-inicia sesión o selecciona un hotel.");
      return;
    }

    // Abrimos la ventana ANTES del await para que Safari iOS no lo bloquee
    const newWin = window.open("", "_blank");

    try {
      const resp: BuildResp = await callEvalFn("customer_audit_export_build", {
        org_id: orgId,
        export_type: kind,
        export_scope: "DAILY_HOY_AYER_BY_TYPE",
        period_from: dateYesterday,
        period_to: dateToday,
        filters: { period_field: periodField },
      });

      if (!resp?.ok) throw new Error(resp?.error || resp?.detail || "export_failed");
      const url = resp.download_url;
      if (!url) throw new Error("missing_download_url");

      if (newWin) newWin.location.href = url;
      else window.open(url, "_blank", "noopener,noreferrer");
    } catch (e: any) {
      newWin?.close();
      const msg = String(e?.message ?? e);
      setErr(isNetworkError(msg) ? "No se pudo conectar con el servidor. Comprueba tu conexión e inténtalo de nuevo." : msg);
    }
  }

  const kpis = useMemo(() => {
    const todayInc = rows.reduce((a, r) => a + (r.incidents_today || 0), 0);
    const yestInc = rows.reduce((a, r) => a + (r.incidents_yesterday || 0), 0);

    const todayGross = rows.reduce((a, r) => a + (r.gross_today || 0), 0);
    const todayRec = rows.reduce((a, r) => a + (r.recovered_today || 0), 0);

    const todayNet = rows.reduce((a, r) => a + (r.net_today || 0), 0);
    const yestNet = rows.reduce((a, r) => a + (r.net_yesterday || 0), 0);

    const pctRec = todayGross > 0 ? Math.round((todayRec / todayGross) * 100) : 0;

    const deltaInc =
      yestInc > 0 ? Math.round(((todayInc - yestInc) / yestInc) * 100) : todayInc > 0 ? 100 : 0;

    const deltaNet =
      yestNet > 0 ? Math.round(((todayNet - yestNet) / yestNet) * 100) : todayNet > 0 ? 100 : 0;

    return { todayInc, yestInc, deltaInc, todayNet, yestNet, deltaNet, pctRec, todayGross, todayRec };
  }, [rows]);

  const chartData = useMemo(() => {
    return rows.map((r) => ({
      tipo: safeLabel(r.incident_type),
      Ayer: Number(r.incidents_yesterday || 0),
      Hoy: Number(r.incidents_today || 0),
    }));
  }, [rows]);

  const subtitle = useMemo(() => `Comparativa rápida para detectar cambios de riesgo y coste.`, []);

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="lg">
      <DialogTitle sx={{ pr: 6, pb: 1.25 }}>
        <Stack direction="row" alignItems="flex-start" justifyContent="space-between" spacing={2}>
          <Box>
            <Typography variant="h6" fontWeight={800} sx={{ lineHeight: 1.1 }}>
              Informe diario (Hoy / Ayer)
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.4, fontSize: 12 }}>
              {subtitle}
            </Typography>
          </Box>

          <IconButton onClick={onClose} aria-label="close" size="small" sx={{ mt: 0.2 }}>
            <CloseIcon fontSize="small" />
          </IconButton>
        </Stack>
      </DialogTitle>

      <DialogContent sx={{ pt: 1.5 }}>
        {/* CONTROLES */}
        <Stack direction={{ xs: "column", md: "row" }} spacing={1.25} alignItems={{ xs: "stretch", md: "center" }} sx={{ mb: 1.5 }}>
          <TextField
            size="small"
            label="Ayer"
            type="date"
            value={dateYesterday}
            onChange={(e) => setDateYesterday(e.target.value)}
            InputLabelProps={{ shrink: true }}
            sx={{ minWidth: 160 }}
          />

          <TextField
            size="small"
            label="Hoy"
            type="date"
            value={dateToday}
            onChange={(e) => setDateToday(e.target.value)}
            InputLabelProps={{ shrink: true }}
            sx={{ minWidth: 160 }}
          />

          <TextField
            size="small"
            label="Campo periodo"
            select
            value={periodField}
            onChange={(e) => setPeriodField(e.target.value as PeriodField)}
            sx={{ minWidth: 190 }}
          >
            <MenuItem value="evaluation_date">evaluation_date</MenuItem>
            <MenuItem value="created_at">created_at</MenuItem>
          </TextField>

          <Box sx={{ flex: 1 }} />

          <Stack direction="row" spacing={1} sx={{ justifyContent: "flex-end" }}>
            <Button
              size="small"
              variant="outlined"
              startIcon={<DownloadIcon fontSize="small" />}
              onClick={() => void doExport("CSV")}
              disabled={loading}
              sx={{ px: 1.25, py: 0.65, fontSize: 12, borderRadius: 2, textTransform: "none", whiteSpace: "nowrap" }}
            >
              CSV
            </Button>

            <Button
              size="small"
              variant="contained"
              startIcon={<DownloadIcon fontSize="small" />}
              onClick={() => void doExport("PDF")}
              disabled={loading}
              sx={{ px: 1.25, py: 0.65, fontSize: 12, borderRadius: 2, textTransform: "none", whiteSpace: "nowrap" }}
            >
              PDF
            </Button>
          </Stack>
        </Stack>

        {err && (
          <Alert severity="error" sx={{ mb: 1.5 }}>
            {err}
          </Alert>
        )}

        {/* KPIs */}
        <Stack direction={{ xs: "column", md: "row" }} spacing={1.5} sx={{ mb: 1.5 }}>
          <Kpi title="Incidencias (hoy)" value={`${kpis.todayInc}`} subtitle={`Ayer: ${kpis.yestInc}  |  Variación: ${kpis.deltaInc}%`} tone="info" />
          <Kpi
            title="Pérdida neta (hoy)"
            value={`${money(kpis.todayNet)} EUR`}
            subtitle={`Ayer: ${money(kpis.yestNet)} EUR  |  Variación: ${kpis.deltaNet}%`}
            tone="danger"
          />
          <Kpi
            title="% recuperado (hoy)"
            value={`${kpis.pctRec}%`}
            subtitle={`Recuperado: ${money(kpis.todayRec)} / Coste: ${money(kpis.todayGross)} EUR`}
            tone="success"
          />
        </Stack>

        <Divider sx={{ my: 1.5 }} />

        {/* CHART */}
        <Box sx={{ height: 320, borderRadius: 2, border: "1px solid", borderColor: "divider", p: 1.25 }}>
          {loading ? (
            <Stack alignItems="center" justifyContent="center" sx={{ height: "100%" }}>
              <CircularProgress size={22} />
              <Typography variant="body2" color="text.secondary" sx={{ mt: 1, fontSize: 12 }}>
                Cargando…
              </Typography>
            </Stack>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 10, right: 16, left: 0, bottom: 44 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="tipo" angle={-18} textAnchor="end" interval={0} height={70} />
                <YAxis allowDecimals={false} />
                <Tooltip formatter={(value: any, name: any) => [value, name]} labelFormatter={(label: any) => `Tipo: ${label}`} />
                <Legend />
                <Bar dataKey="Ayer" name="Ayer" fill="#94a3b8" radius={[6, 6, 0, 0]} />
                <Bar dataKey="Hoy" name="Hoy" fill="#2563eb" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </Box>

        <Divider sx={{ my: 1.5 }} />

        {/* TABLE */}
        <Typography variant="subtitle1" fontWeight={800} sx={{ mb: 1, fontSize: 13 }}>
          Detalle por tipo de incidencia
        </Typography>

        <Table size="small" sx={{ border: "1px solid", borderColor: "divider", borderRadius: 2, overflow: "hidden" }}>
          <TableHead>
            <TableRow sx={{ bgcolor: "rgba(15, 23, 42, 0.04)", "& th": { fontWeight: 800, fontSize: 12, color: "text.secondary" } }}>
              <TableCell>Tipo</TableCell>
              <TableCell align="right">Ayer</TableCell>
              <TableCell align="right">Hoy</TableCell>
              <TableCell align="right">Variación</TableCell>
              <TableCell align="right">Neto hoy (EUR)</TableCell>
            </TableRow>
          </TableHead>

          <TableBody>
            {rows.map((r) => {
              const isUp = r.delta > 0;
              const isDown = r.delta < 0;

              return (
                <TableRow key={r.incident_type} hover sx={{ "& td": { fontSize: 12 } }}>
                  <TableCell>
                    <MuiTooltip title={safeLabel(r.incident_type)} placement="top" arrow>
                      <Typography sx={{ fontSize: 12 }} noWrap>
                        {safeLabel(r.incident_type)}
                      </Typography>
                    </MuiTooltip>
                  </TableCell>

                  <TableCell align="right">{r.incidents_yesterday}</TableCell>
                  <TableCell align="right">{r.incidents_today}</TableCell>

                  <TableCell align="right">
                    <Chip
                      size="small"
                      label={`${r.delta}`}
                      color={isUp ? "error" : isDown ? "success" : "default"}
                      variant={isUp || isDown ? "filled" : "outlined"}
                      sx={{ fontWeight: 700 }}
                    />
                  </TableCell>

                  <TableCell align="right">
                    <Chip size="small" label={money(r.net_today)} variant="outlined" sx={{ fontWeight: 700 }} />
                  </TableCell>
                </TableRow>
              );
            })}

            {!loading && rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={5}>
                  <Typography variant="body2" color="text.secondary" sx={{ fontSize: 12 }}>
                    No hay datos para esas fechas.
                  </Typography>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>

        <Box sx={{ height: 10 }} />
      </DialogContent>
    </Dialog>
  );
};

const Kpi: React.FC<{
  title: string;
  value: string;
  subtitle?: string;
  tone?: "info" | "success" | "danger";
}> = ({ title, value, subtitle, tone = "info" }) => {
  const toneStyles =
    tone === "success"
      ? { borderColor: "success.light", bgcolor: "success.50" }
      : tone === "danger"
      ? { borderColor: "error.light", bgcolor: "error.50" }
      : { borderColor: "info.light", bgcolor: "info.50" };

  return (
    <Box sx={{ flex: 1, borderRadius: 2, border: "1px solid", p: 1.5, minWidth: 220, ...toneStyles }}>
      <Typography variant="caption" color="text.secondary" fontWeight={800} sx={{ fontSize: 11 }}>
        {title}
      </Typography>
      <Typography variant="h6" fontWeight={900} sx={{ mt: 0.25, fontSize: 18, lineHeight: 1.1 }}>
        {value}
      </Typography>
      {subtitle && (
        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5, fontSize: 12 }}>
          {subtitle}
        </Typography>
      )}
    </Box>
  );
};

/**
 * CSV esperado para DAILY_HOY_AYER_BY_TYPE:
 * incident_type,incidents_today,incidents_yesterday,delta,gross_today,recovered_today,net_today,gross_yesterday,recovered_yesterday,net_yesterday
 */
function parseDailyCsv(csv: string): DailyRow[] {
  const lines = (csv || "").split(/\r?\n/).filter(Boolean);
  if (lines.length <= 1) return [];

  const header = lines[0].split(",").map((s) => s.trim());
  const idx = (name: string) => header.indexOf(name);

  const iType = idx("incident_type");
  const iIt = idx("incidents_today");
  const iIy = idx("incidents_yesterday");
  const iD = idx("delta");
  const iGt = idx("gross_today");
  const iRt = idx("recovered_today");
  const iNt = idx("net_today");
  const iGy = idx("gross_yesterday");
  const iRy = idx("recovered_yesterday");
  const iNy = idx("net_yesterday");

  const out: DailyRow[] = [];

  for (let i = 1; i < lines.length; i++) {
    const cols = splitCsvLine(lines[i]);
    const incident_type = cols[iType] ?? "";
    if (!incident_type) continue;

    out.push({
      incident_type,
      incidents_today: Number(cols[iIt] ?? 0) || 0,
      incidents_yesterday: Number(cols[iIy] ?? 0) || 0,
      delta: Number(cols[iD] ?? 0) || 0,
      gross_today: Number(cols[iGt] ?? 0) || 0,
      recovered_today: Number(cols[iRt] ?? 0) || 0,
      net_today: Number(cols[iNt] ?? 0) || 0,
      gross_yesterday: Number(cols[iGy] ?? 0) || 0,
      recovered_yesterday: Number(cols[iRy] ?? 0) || 0,
      net_yesterday: Number(cols[iNy] ?? 0) || 0,
    });
  }

  out.sort((a, b) => b.incidents_today - a.incidents_today);
  return out;
}

function splitCsvLine(line: string) {
  const res: string[] = [];
  let cur = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cur += ch;
      }
    } else {
      if (ch === '"') inQuotes = true;
      else if (ch === ",") {
        res.push(cur);
        cur = "";
      } else cur += ch;
    }
  }
  res.push(cur);
  return res.map((s) => s.trim());
}

export default DailyReportDialog;