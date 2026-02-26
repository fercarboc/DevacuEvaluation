// src/components/ImportJobsDialog.tsx
import React, { useMemo, useState } from "react";
import {
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  IconButton,
  MenuItem,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Tooltip,
  Typography,
  CircularProgress,
} from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import { useImportJobs } from "@/hooks/useImportJobs";

type Props = {
  open: boolean;
  onClose: () => void;
  orgId: string;
};

function isoDateOnly(d: Date) {
  // yyyy-mm-dd
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function startOfDayISO(dateOnly: string) {
  // dateOnly = yyyy-mm-dd -> ISO local-ish; para filtros vale con Z
  return `${dateOnly}T00:00:00.000Z`;
}

function endOfDayISO(dateOnly: string) {
  return `${dateOnly}T23:59:59.999Z`;
}

function fmtTs(ts?: string | null) {
  if (!ts) return "-";
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return ts;
  return d.toLocaleString();
}

function statusChipColor(status: string) {
  const s = String(status || "").toUpperCase();
  if (s === "COMMITTED") return "success";
  if (s === "VALIDATED") return "info";
  if (s === "FAILED") return "error";
  if (s === "UPLOADED") return "warning";
  return "default";
}

export default function ImportJobsDialog({ open, onClose, orgId }: Props) {
  const [rangePreset, setRangePreset] = useState<"WEEK" | "MONTH" | "CUSTOM">("MONTH");
  const [status, setStatus] = useState<string>("ALL");
  const [runType, setRunType] = useState<string>("ALL");

  const today = useMemo(() => new Date(), []);
  const defaultFrom = useMemo(() => {
    const d = new Date(today);
    d.setDate(d.getDate() - 30);
    return isoDateOnly(d);
  }, [today]);

  const defaultFromWeek = useMemo(() => {
    const d = new Date(today);
    d.setDate(d.getDate() - 7);
    return isoDateOnly(d);
  }, [today]);

  const [fromDate, setFromDate] = useState<string>(defaultFrom);
  const [toDate, setToDate] = useState<string>(isoDateOnly(today));

  const effectiveFrom = useMemo(() => {
    if (rangePreset === "WEEK") return startOfDayISO(defaultFromWeek);
    if (rangePreset === "MONTH") return startOfDayISO(defaultFrom);
    return fromDate ? startOfDayISO(fromDate) : undefined;
  }, [rangePreset, defaultFrom, defaultFromWeek, fromDate]);

  const effectiveTo = useMemo(() => {
    if (rangePreset === "WEEK") return endOfDayISO(isoDateOnly(today));
    if (rangePreset === "MONTH") return endOfDayISO(isoDateOnly(today));
    return toDate ? endOfDayISO(toDate) : undefined;
  }, [rangePreset, today, toDate]);

  const { loading, error, jobs, reload } = useImportJobs(orgId, {
    from: effectiveFrom,
    to: effectiveTo,
    status,
    runType,
    limit: 200,
  });

  const totals = useMemo(() => {
    const total = jobs.length;
    const committed = jobs.filter((j) => String(j.status || "").toUpperCase() === "COMMITTED").length;
    const failed = jobs.filter((j) => String(j.status || "").toUpperCase() === "FAILED").length;
    return { total, committed, failed };
  }, [jobs]);

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="lg">
      <DialogTitle sx={{ pr: 6 }}>
        Importaciones (CSV)
        <IconButton
          onClick={onClose}
          sx={{ position: "absolute", right: 8, top: 8 }}
          aria-label="Cerrar"
        >
          <CloseIcon />
        </IconButton>
      </DialogTitle>

      <DialogContent>
        <Stack direction={{ xs: "column", md: "row" }} spacing={1.5} alignItems={{ xs: "stretch", md: "center" }}>
          <TextField
            select
            size="small"
            label="Rango"
            value={rangePreset}
            onChange={(e) => setRangePreset(e.target.value as any)}
            sx={{ minWidth: 180 }}
          >
            <MenuItem value="WEEK">Semana (últimos 7 días)</MenuItem>
            <MenuItem value="MONTH">Mes (últimos 30 días)</MenuItem>
            <MenuItem value="CUSTOM">Personalizado</MenuItem>
          </TextField>

          {rangePreset === "CUSTOM" && (
            <>
              <TextField
                size="small"
                type="date"
                label="Desde"
                value={fromDate}
                onChange={(e) => setFromDate(e.target.value)}
                InputLabelProps={{ shrink: true }}
                sx={{ minWidth: 160 }}
              />
              <TextField
                size="small"
                type="date"
                label="Hasta"
                value={toDate}
                onChange={(e) => setToDate(e.target.value)}
                InputLabelProps={{ shrink: true }}
                sx={{ minWidth: 160 }}
              />
            </>
          )}

          <TextField
            select
            size="small"
            label="Estado"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            sx={{ minWidth: 160 }}
          >
            <MenuItem value="ALL">(Todos)</MenuItem>
            <MenuItem value="UPLOADED">UPLOADED</MenuItem>
            <MenuItem value="VALIDATED">VALIDATED</MenuItem>
            <MenuItem value="COMMITTED">COMMITTED</MenuItem>
            <MenuItem value="FAILED">FAILED</MenuItem>
          </TextField>

          <TextField
            select
            size="small"
            label="Run type"
            value={runType}
            onChange={(e) => setRunType(e.target.value)}
            sx={{ minWidth: 220 }}
          >
            <MenuItem value="ALL">(Todos)</MenuItem>
            <MenuItem value="FUTURE_BOOKINGS">FUTURE_BOOKINGS</MenuItem>
            <MenuItem value="INHOUSE_TODAY">INHOUSE_TODAY</MenuItem>
            <MenuItem value="HISTORICAL_STAYS">HISTORICAL_STAYS</MenuItem>
            <MenuItem value="HISTORICAL_BOOKINGS">HISTORICAL_BOOKINGS</MenuItem>
          </TextField>

          <Box sx={{ flex: 1 }} />

          <Stack direction="row" spacing={1} alignItems="center" justifyContent="flex-end">
            <Chip size="small" label={`Total: ${totals.total}`} variant="outlined" />
            <Chip size="small" label={`OK: ${totals.committed}`} color="success" variant="outlined" />
            <Chip size="small" label={`FAILED: ${totals.failed}`} color="error" variant="outlined" />
            <Button size="small" onClick={reload} disabled={loading}>
              Refrescar
            </Button>
          </Stack>
        </Stack>

        <Divider sx={{ my: 2 }} />

        {loading && (
          <Box sx={{ py: 2, display: "flex", alignItems: "center", gap: 1 }}>
            <CircularProgress size={18} />
            <Typography variant="body2">Cargando importaciones…</Typography>
          </Box>
        )}

        {!loading && error && (
          <Typography variant="body2" color="error">
            {error}
          </Typography>
        )}

        {!loading && !error && jobs.length === 0 && (
          <Typography variant="body2" color="text.secondary">
            No hay importaciones para este filtro.
          </Typography>
        )}

        {!loading && !error && jobs.length > 0 && (
          <Box sx={{ border: "1px solid", borderColor: "divider", borderRadius: 1, overflow: "auto", maxHeight: 620 }}>
            <Table size="small" stickyHeader>
              <TableHead>
                <TableRow>
                  <TableCell>Fecha</TableCell>
                  <TableCell>Run type</TableCell>
                  <TableCell>Estado</TableCell>
                  <TableCell align="right">Total</TableCell>
                  <TableCell align="right">Válidas</TableCell>
                  <TableCell align="right">Inválidas</TableCell>
                  <TableCell>Archivo</TableCell>
                  <TableCell>ID</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {jobs.map((j) => {
                  const st = String(j.status || "").toUpperCase();
                  const rt = String(j.run_type || "").toUpperCase();
                  return (
                    <TableRow key={j.id} hover>
                      <TableCell>{fmtTs(j.created_at)}</TableCell>
                      <TableCell>
                        <Typography variant="body2" sx={{ fontWeight: 700 }}>
                          {rt || "-"}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Chip
                          size="small"
                          label={st || "-"}
                          color={statusChipColor(st) as any}
                          variant="outlined"
                        />
                      </TableCell>
                      <TableCell align="right">{Number(j.total_rows ?? 0)}</TableCell>
                      <TableCell align="right">{Number(j.valid_rows ?? 0)}</TableCell>
                      <TableCell align="right">{Number(j.invalid_rows ?? 0)}</TableCell>
                      <TableCell sx={{ maxWidth: 420 }}>
                        <Tooltip title={j.file_path || "-"}>
                          <Typography variant="body2" noWrap>
                            {j.file_path || "-"}
                          </Typography>
                        </Tooltip>
                      </TableCell>
                      <TableCell>
                        <Tooltip title={j.id}>
                          <Typography variant="body2" sx={{ fontFamily: "monospace" }}>
                            {j.id.slice(0, 8)}…
                          </Typography>
                        </Tooltip>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </Box>
        )}
      </DialogContent>

      <DialogActions>
        <Button onClick={onClose}>Cerrar</Button>
      </DialogActions>
    </Dialog>
  );
}