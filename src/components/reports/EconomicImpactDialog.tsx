// src/components/dialogs/REconomicImpactDialog.tsx
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
  Chip,
  Divider,
  Table,
  TableHead,
  TableRow,
  TableCell,
  TableBody,
  MenuItem,
  Select,
  FormControl,
  InputLabel,
  TextField,
  CircularProgress,
  Alert,
} from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import DownloadIcon from "@mui/icons-material/Download";

import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
  Line,
} from "recharts";

import { callEvalFn } from "@/services/callEvalFn";

/**
 * Diario: usamos el scope WEEKLY_7D_DAILY_SERIES (agrega por día dentro del rango).
 * Si luego creas ECONOMIC_IMPACT_DAILY, solo cambia SCOPE_DAILY.
 */
type PeriodPreset = "LAST_7" | "LAST_30" | "CUSTOM";
type PeriodField = "evaluation_date" | "created_at";

type EconDailyRow = {
  day: string; // YYYY-MM-DD
  incidents: number;
  gross: number;
  recovered: number;
  net: number;
};

type BuildResp = {
  ok: boolean;
  download_url?: string | null;
  error?: string;
  detail?: string;
};

const SCOPE_DAILY = "WEEKLY_7D_DAILY_SERIES" as const;

function isoDate(d: Date) {
  return d.toISOString().slice(0, 10);
}

function startOfTodayUtc() {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

function addDaysUtc(d: Date, days: number) {
  const x = new Date(d.getTime());
  x.setUTCDate(x.getUTCDate() + days);
  return x;
}

function money(n: number) {
  if (!Number.isFinite(n)) return "0.00";
  return n.toFixed(2);
}

function sum(rows: EconDailyRow[], key: keyof EconDailyRow) {
  return rows.reduce((acc, r) => acc + (Number(r[key]) || 0), 0);
}

/** Estimación sin vender humo. Cap 50% */
function projectedSavings(netTotal: number, improvementRate: number) {
  const rate = Math.max(0, Math.min(0.5, improvementRate));
  return netTotal * rate;
}

function dd(iso: string) {
  return iso.slice(8, 10);
}

function clampFromTo(from: string, to: string) {
  if (!from || !to) return { from, to };
  return from <= to ? { from, to } : { from: to, to: from };
}

export interface EconomicImpactDialogProps {
  open: boolean;
  onClose: () => void;
  from?: string;
  to?: string;
  periodField?: PeriodField;
}

export const EconomicImpactDialog: React.FC<EconomicImpactDialogProps> = ({
  open,
  onClose,
  from: fromProp,
  to: toProp,
  periodField: periodFieldProp,
}) => {
  const today = useMemo(() => isoDate(startOfTodayUtc()), []);
  const defaultFrom7 = useMemo(() => isoDate(addDaysUtc(startOfTodayUtc(), -6)), []);
  const defaultFrom30 = useMemo(() => isoDate(addDaysUtc(startOfTodayUtc(), -29)), []);

  const [preset, setPreset] = useState<PeriodPreset>("LAST_7");
  const [periodField, setPeriodField] = useState<PeriodField>("evaluation_date");

  const [from, setFrom] = useState<string>(defaultFrom7);
  const [to, setTo] = useState<string>(today);

  const [improvementRate, setImprovementRate] = useState<number>(0.15);

  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [rows, setRows] = useState<EconDailyRow[]>([]);

  // UI compacta
  const compactInputSx = useMemo(
    () => ({
      "& .MuiInputBase-root": { fontSize: 13, height: 36 },
      "& .MuiInputLabel-root": { fontSize: 12 },
      "& .MuiFormHelperText-root": { fontSize: 11, marginLeft: 0 },
    }),
    []
  );

  // Al abrir: aplica props si vienen
  useEffect(() => {
    if (!open) return;

    setErr(null);

    if (periodFieldProp) setPeriodField(periodFieldProp);

    if (fromProp && toProp) {
      const fixed = clampFromTo(fromProp, toProp);
      setFrom(fixed.from);
      setTo(fixed.to);
      setPreset("CUSTOM");
      return;
    }

    if (preset === "LAST_7") {
      setFrom(defaultFrom7);
      setTo(today);
    } else if (preset === "LAST_30") {
      setFrom(defaultFrom30);
      setTo(today);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Presets -> rango
  useEffect(() => {
    if (!open) return;

    if (preset === "LAST_7") {
      setFrom(defaultFrom7);
      setTo(today);
    } else if (preset === "LAST_30") {
      setFrom(defaultFrom30);
      setTo(today);
    }
  }, [preset, open, defaultFrom7, defaultFrom30, today]);

  const totals = useMemo(() => {
    const gross = sum(rows, "gross");
    const recovered = sum(rows, "recovered");
    const net = sum(rows, "net");
    const incidents = sum(rows, "incidents");
    const saving = projectedSavings(net, improvementRate);
    const pctRecovered = gross > 0 ? Math.round((recovered / gross) * 100) : 0;
    return { gross, recovered, net, incidents, saving, pctRecovered };
  }, [rows, improvementRate]);

  async function load() {
    setErr(null);
    setLoading(true);

    try {
      const fixed = clampFromTo(from, to);

      const resp: any = await callEvalFn("customer_audit_export_build", {
        export_type: "CSV",
        export_scope: SCOPE_DAILY,
        period_from: fixed.from,
        period_to: fixed.to,
        filters: { period_field: periodField },
      });

      if (!resp?.ok) throw new Error(resp?.error || resp?.detail || "fetch_failed");

      const url = resp.download_url as string;
      if (!url) throw new Error("missing_download_url");

      const csvText = await fetch(url).then((r) => r.text());
      const parsed = parseDailyCsv(csvText);
      const filled = fillMissingDays(parsed, fixed.from, fixed.to);
      setRows(filled);
    } catch (e: any) {
      setErr(String(e?.message ?? e));
      setRows([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!open) return;
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, from, to, periodField]);

  async function doExport(kind: "PDF" | "CSV") {
    setErr(null);

    try {
      const fixed = clampFromTo(from, to);

      const resp: BuildResp = await callEvalFn("customer_audit_export_build", {
        export_type: kind,
        export_scope: SCOPE_DAILY,
        period_from: fixed.from,
        period_to: fixed.to,
        filters: { period_field: periodField },
      });

      if (!resp?.ok) throw new Error(resp?.error || resp?.detail || "export_failed");
      const url = resp.download_url;
      if (!url) throw new Error("missing_download_url");

      window.open(url, "_blank", "noopener,noreferrer");
    } catch (e: any) {
      setErr(String(e?.message ?? e));
    }
  }

  const chartData = useMemo(() => {
    return rows.map((r) => ({
      day: r.day,
      x: dd(r.day),
      incidents: r.incidents,
      coste: Number(r.gross || 0),
      recuperado: Number(r.recovered || 0),
      neto: Number(r.net || 0),
    }));
  }, [rows]);

  return (
    <Dialog
      open={open}
      onClose={onClose}
      fullWidth
      maxWidth="lg"
      PaperProps={{ sx: { borderRadius: 3 } }}
    >
      <DialogTitle sx={{ pr: 6, pb: 1.25 }}>
        <Stack direction="row" alignItems="center" justifyContent="space-between">
          <Box>
            <Typography variant="subtitle1" fontWeight={900} sx={{ fontSize: 17 }}>
              Impacto económico (ROI) — Diario
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ fontSize: 12, mt: 0.25 }}>
              Coste, recuperado y neto por día. Ahorro proyectado (estimado).
            </Typography>
          </Box>

          <IconButton onClick={onClose} aria-label="close" size="small">
            <CloseIcon fontSize="small" />
          </IconButton>
        </Stack>
      </DialogTitle>

      <DialogContent sx={{ pt: 1.5 }}>
        {/* Filtros */}
        <Stack
          direction={{ xs: "column", md: "row" }}
          spacing={1.25}
          sx={{ mb: 1.75, mt: 0.75, alignItems: { xs: "stretch", md: "flex-end" } }}
        >
          <FormControl size="small" sx={{ ...compactInputSx, minWidth: 150 }}>
            <InputLabel>Periodo</InputLabel>
            <Select
              label="Periodo"
              value={preset}
              onChange={(e) => setPreset(e.target.value as PeriodPreset)}
            >
              <MenuItem value="LAST_7">Últimos 7 días</MenuItem>
              <MenuItem value="LAST_30">Últimos 30 días</MenuItem>
              <MenuItem value="CUSTOM">Personalizado</MenuItem>
            </Select>
          </FormControl>

          {preset === "CUSTOM" ? (
            <>
              <TextField
                size="small"
                label="Desde"
                type="date"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
                InputLabelProps={{ shrink: true }}
                sx={{ ...compactInputSx, minWidth: 150 }}
              />
              <TextField
                size="small"
                label="Hasta"
                type="date"
                value={to}
                onChange={(e) => setTo(e.target.value)}
                InputLabelProps={{ shrink: true }}
                sx={{ ...compactInputSx, minWidth: 150 }}
              />
            </>
          ) : (
            <>
              <TextField
                size="small"
                label="Desde"
                value={from}
                InputLabelProps={{ shrink: true }}
                sx={{ ...compactInputSx, minWidth: 150 }}
                disabled
              />
              <TextField
                size="small"
                label="Hasta"
                value={to}
                InputLabelProps={{ shrink: true }}
                sx={{ ...compactInputSx, minWidth: 150 }}
                disabled
              />
            </>
          )}

          <FormControl size="small" sx={{ ...compactInputSx, minWidth: 150 }}>
            <InputLabel>Campo periodo</InputLabel>
            <Select
              label="Campo periodo"
              value={periodField}
              onChange={(e) => setPeriodField(e.target.value as PeriodField)}
            >
              <MenuItem value="evaluation_date">evaluation_date</MenuItem>
              <MenuItem value="created_at">created_at</MenuItem>
            </Select>
          </FormControl>

          {/* Mejora: campo estrecho + texto en la MISMA línea */}
          <Stack
            direction="row"
            spacing={1}
            alignItems="flex-end"
            sx={{ minWidth: 210 }}
          >
            <TextField
              size="small"
              label="Mejora (%)"
              type="number"
              value={Math.round(improvementRate * 100)}
              onChange={(e) => setImprovementRate(Number(e.target.value) / 100)}
              inputProps={{ min: 0, max: 50, step: 1 }}
              sx={{ ...compactInputSx, width: 92 }} // ✅ pensado para 3 cifras
            />
            <Typography variant="caption" color="text.secondary" sx={{ fontSize: 11, pb: 0.65 }}>
              (límite máx. 50%)
            </Typography>
          </Stack>

          <Box sx={{ flex: 1 }} />

          {/* Botones compactos: en una línea */}
          <Stack direction="row" spacing={1} sx={{ flexWrap: "nowrap" }}>
            <Button
              variant="outlined"
              size="small"
              startIcon={<DownloadIcon sx={{ fontSize: 16 }} />}
              onClick={() => void doExport("CSV")}
              disabled={loading}
              sx={{
                fontSize: 11,
                px: 1.5,
                py: 0.4,
                minHeight: 32,
                whiteSpace: "nowrap",
              }}
            >
              Exportar CSV
            </Button>
            <Button
              variant="contained"
              size="small"
              startIcon={<DownloadIcon sx={{ fontSize: 16 }} />}
              onClick={() => void doExport("PDF")}
              disabled={loading}
              sx={{
                fontSize: 11,
                px: 1.5,
                py: 0.4,
                minHeight: 32,
                whiteSpace: "nowrap",
              }}
            >
              Exportar PDF
            </Button>
          </Stack>
        </Stack>

        {err && (
          <Alert severity="error" sx={{ mb: 1.5 }}>
            {err}
          </Alert>
        )}

        {/* KPI cards (más compactas) */}
        <Stack direction={{ xs: "column", md: "row" }} spacing={1.25} sx={{ mb: 1.75 }}>
          <KpiCard
            title="Coste directo"
            value={`${money(totals.gross)} EUR`}
            subtitle={`Incidencias: ${totals.incidents}`}
            tone="blue"
          />
          <KpiCard
            title="Recuperado"
            value={`${money(totals.recovered)} EUR`}
            subtitle={`% recuperado: ${totals.pctRecovered}%`}
            tone="green"
          />
          <KpiCard
            title="Pérdida neta"
            value={`${money(totals.net)} EUR`}
            subtitle="Neto = net_loss (o coste - recuperado)"
            tone="red"
          />
          <KpiCard
            title="Ahorro proyectado"
            value={`${money(totals.saving)} EUR`}
            subtitle={`Estimado con mejora ${Math.round(improvementRate * 100)}%`}
            highlight
            tone="teal"
          />
        </Stack>

        <Divider sx={{ my: 1.75 }} />

        {/* Chart */}
        <Box sx={{ height: 340 }}>
          {loading ? (
            <Stack alignItems="center" justifyContent="center" sx={{ height: "100%" }}>
              <CircularProgress size={26} />
              <Typography variant="body2" color="text.secondary" sx={{ mt: 1, fontSize: 12 }}>
                Cargando…
              </Typography>
            </Stack>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData} margin={{ top: 10, right: 24, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="x" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip
                  formatter={(val: any, name: any) => {
                    const labelMap: Record<string, string> = {
                      coste: "Coste",
                      recuperado: "Recuperado",
                      neto: "Neto",
                      incidents: "Incidencias",
                    };
                    const outLabel = labelMap[name] ?? String(name);
                    if (name === "incidents") return [val, outLabel];
                    return [`${money(Number(val || 0))} EUR`, outLabel];
                  }}
                  labelFormatter={(_, payload: any) => {
                    const day = payload?.[0]?.payload?.day;
                    return day ? `Día: ${day}` : "";
                  }}
                />
                <Legend />

                <Area type="monotone" dataKey="coste" name="Coste" stroke="#2563eb" fill="#2563eb" fillOpacity={0.12} />
                <Area type="monotone" dataKey="recuperado" name="Recuperado" stroke="#16a34a" fill="#16a34a" fillOpacity={0.10} />
                <Line type="monotone" dataKey="neto" name="Neto" stroke="#ef4444" strokeWidth={2} dot={{ r: 2 }} />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </Box>

        <Divider sx={{ my: 1.75 }} />

        {/* Table */}
        <Typography variant="subtitle2" fontWeight={900} sx={{ mb: 1, fontSize: 13 }}>
          Detalle por día
        </Typography>

        <Box
          sx={{
            border: "1px solid",
            borderColor: "divider",
            borderRadius: 2,
            overflow: "hidden",
          }}
        >
          <Table size="small">
            <TableHead>
              <TableRow
                sx={{
                  bgcolor: "#f6f8fb",
                  "& th": {
                    fontSize: 12,
                    fontWeight: 900,
                    color: "#334155",
                    py: 1,
                  },
                }}
              >
                <TableCell>Día</TableCell>
                <TableCell align="right">Incidencias</TableCell>
                <TableCell align="right">Coste</TableCell>
                <TableCell align="right">Recuperado</TableCell>
                <TableCell align="right">Neto</TableCell>
                <TableCell align="right">% Recuperado</TableCell>
              </TableRow>
            </TableHead>

            <TableBody>
              {rows.map((r) => {
                const pct = r.gross > 0 ? (r.recovered / r.gross) * 100 : 0;
                return (
                  <TableRow
                    key={r.day}
                    hover
                    sx={{
                      "& td": { fontSize: 12, py: 0.9 },
                      "&:nth-of-type(even)": { bgcolor: "#fbfcfe" },
                    }}
                  >
                    <TableCell sx={{ fontWeight: 700, color: "#0f172a" }}>{r.day}</TableCell>
                    <TableCell align="right">{r.incidents}</TableCell>
                    <TableCell align="right">{money(r.gross)}</TableCell>
                    <TableCell align="right">{money(r.recovered)}</TableCell>
                    <TableCell align="right">
                      <Chip
                        size="small"
                        label={money(r.net)}
                        sx={{
                          height: 22,
                          fontSize: 11,
                          fontWeight: 800,
                          bgcolor: r.net > 0 ? "#fff1f2" : "#ecfdf5",
                          color: r.net > 0 ? "#be123c" : "#166534",
                          border: "1px solid",
                          borderColor: r.net > 0 ? "#fecdd3" : "#bbf7d0",
                        }}
                      />
                    </TableCell>
                    <TableCell align="right">{Math.round(pct)}%</TableCell>
                  </TableRow>
                );
              })}

              {!loading && rows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6}>
                    <Typography variant="body2" color="text.secondary" sx={{ fontSize: 12 }}>
                      No hay datos en el rango seleccionado.
                    </Typography>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </Box>

        <Box sx={{ height: 10 }} />
      </DialogContent>
    </Dialog>
  );
};

const toneMap = {
  blue: { border: "#dbeafe", bg: "#f8fbff", chip: "#2563eb" },
  green: { border: "#dcfce7", bg: "#f7fffb", chip: "#16a34a" },
  red: { border: "#ffe4e6", bg: "#fffafb", chip: "#ef4444" },
  teal: { border: "#ccfbf1", bg: "#f0fdfa", chip: "#0f766e" },
};

const KpiCard: React.FC<{
  title: string;
  value: string;
  subtitle?: string;
  highlight?: boolean;
  tone?: keyof typeof toneMap;
}> = ({ title, value, subtitle, highlight, tone = "blue" }) => {
  const t = toneMap[tone];

  return (
    <Box
      sx={{
        flex: 1,
        borderRadius: 2,
        border: "1px solid",
        borderColor: highlight ? t.border : "divider",
        bgcolor: highlight ? t.bg : "background.paper",
        p: 1.5, // ✅ más compacta
        minWidth: 180,
      }}
    >
      <Stack direction="row" alignItems="center" justifyContent="space-between">
        <Typography variant="caption" color="text.secondary" fontWeight={900} sx={{ fontSize: 11 }}>
          {title}
        </Typography>
        <Box
          sx={{
            width: 8,
            height: 8,
            borderRadius: 99,
            bgcolor: t.chip,
            opacity: 0.9,
          }}
        />
      </Stack>

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
};

/* =========================================================
 * CSV parsing + fill missing days
 * ========================================================= */

function parseDailyCsv(csv: string): EconDailyRow[] {
  const lines = (csv || "").split(/\r?\n/).filter(Boolean);
  if (lines.length <= 1) return [];

  const header = lines[0].split(",").map((s) => s.trim());
  const idx = (name: string) => header.indexOf(name);

  // day, incidents, risk_high, risk_medium, risk_low, gross, recovered, net_loss
  const iDay = idx("day");
  const iInc = idx("incidents");
  const iGross = idx("gross");
  const iRec = idx("recovered");
  const iNet = idx("net_loss");

  const out: EconDailyRow[] = [];

  for (let i = 1; i < lines.length; i++) {
    const cols = splitCsvLine(lines[i]);
    const day = cols[iDay] ?? "";
    if (!day) continue;

    out.push({
      day,
      incidents: Number(cols[iInc] ?? 0) || 0,
      gross: Number(cols[iGross] ?? 0) || 0,
      recovered: Number(cols[iRec] ?? 0) || 0,
      net: Number(cols[iNet] ?? 0) || 0,
    });
  }

  out.sort((a, b) => a.day.localeCompare(b.day));
  return out;
}

function fillMissingDays(rows: EconDailyRow[], from: string, to: string): EconDailyRow[] {
  if (!from || !to) return rows;

  const map = new Map<string, EconDailyRow>();
  for (const r of rows) map.set(r.day, r);

  const fromD = new Date(`${from}T00:00:00.000Z`);
  const toD = new Date(`${to}T00:00:00.000Z`);

  const out: EconDailyRow[] = [];
  for (let d = new Date(fromD.getTime()); d.getTime() <= toD.getTime(); d = addDaysUtc(d, 1)) {
    const key = isoDate(d);
    out.push(
      map.get(key) ?? {
        day: key,
        incidents: 0,
        gross: 0,
        recovered: 0,
        net: 0,
      }
    );
  }
  return out;
}

// Split CSV simple (soporta comillas dobles)
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

export default EconomicImpactDialog;
