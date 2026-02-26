// src/components/RunDetail.tsx
import React, { useMemo, useState } from "react";
import {
  Alert,
  Box,
  Card,
  CardContent,
  Chip,
  Divider,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { useRunDetail } from "@/hooks/useRunDetail";
import ResultsTable from "@/components/ResultsTable";
import AlertsPanel from "@/components/AlertsPanel";

type Props = {
  orgId: string;
  runId: string | null;
};

function fmtTs(ts?: string | null) {
  if (!ts) return "";
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return ts;
  return d.toLocaleString();
}

export default function RunDetail({ orgId, runId }: Props) {
  // orgId se mantiene por consistencia/posibles usos futuros (por ahora no hace falta aquí)
  void orgId;

  const [riskBand, setRiskBand] = useState<string>("");
  const [onlyChanged, setOnlyChanged] = useState<boolean>(false);
  const [unresolvedAlertsOnly, setUnresolvedAlertsOnly] = useState<boolean>(false);

  const { loading, error, run, results, alerts, reload } = useRunDetail(runId, {
    riskBand: riskBand || undefined,
    onlyChanged: onlyChanged || undefined,
    unresolvedAlertsOnly: unresolvedAlertsOnly || undefined,
  });

  const kpis = useMemo(() => {
    const total = Number(run?.total_analyzed ?? 0);
    const high = Number(run?.high_count ?? 0);
    const med = Number(run?.medium_count ?? 0);
    const low = Number(run?.low_count ?? 0);
    return { total, high, med, low };
  }, [run]);

  if (!runId) {
    return (
      <Card variant="outlined">
        <CardContent>
          <Typography variant="body2" color="text.secondary">
            Selecciona un run.
          </Typography>
        </CardContent>
      </Card>
    );
  }

  return (
    <Stack spacing={2}>
      <Card variant="outlined">
        <CardContent>
          <Stack direction="row" justifyContent="space-between" alignItems="flex-start" spacing={2}>
            <Box>
              <Typography variant="subtitle1">
                Run: {String(run?.run_type || "").toUpperCase()}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                {run?.id || runId} {run?.created_at ? `· ${fmtTs(run.created_at)}` : ""}
              </Typography>
            </Box>

            <Chip
              label={loading ? "Cargando…" : "Refrescar"}
              onClick={() => !loading && reload()}
              color={loading ? "default" : "primary"}
              variant={loading ? "outlined" : "filled"}
              clickable={!loading}
            />
          </Stack>

          <Divider sx={{ my: 1 }} />

          {error && (
            <Alert severity="error" sx={{ mb: 1 }}>
              {error}
            </Alert>
          )}

          <Stack direction={{ xs: "column", md: "row" }} spacing={1}>
            <Chip label={`Total: ${kpis.total}`} variant="outlined" />
            <Chip label={`HIGH: ${kpis.high}`} color="error" variant="outlined" />
            <Chip label={`MED: ${kpis.med}`} color="warning" variant="outlined" />
            <Chip label={`LOW: ${kpis.low}`} color="success" variant="outlined" />
            <Chip label={`Alertas: ${alerts.length}`} variant="outlined" />
          </Stack>

          <Divider sx={{ my: 2 }} />

          <Stack
            direction={{ xs: "column", md: "row" }}
            spacing={2}
            sx={{ alignItems: { xs: "stretch", md: "center" } }}
          >
            <TextField
              select
              size="small"
              label="Filtrar por risk_band"
              value={riskBand}
              onChange={(e) => setRiskBand(e.target.value)}
              sx={{ minWidth: 220 }}
            >
              <MenuItem value="">(Todos)</MenuItem>
              <MenuItem value="HIGH">HIGH</MenuItem>
              <MenuItem value="MEDIUM">MEDIUM</MenuItem>
              <MenuItem value="LOW">LOW</MenuItem>
            </TextField>

            <TextField
              select
              size="small"
              label="Solo cambios de banda"
              value={onlyChanged ? "YES" : "NO"}
              onChange={(e) => setOnlyChanged(e.target.value === "YES")}
              sx={{ minWidth: 220 }}
            >
              <MenuItem value="NO">No</MenuItem>
              <MenuItem value="YES">Sí</MenuItem>
            </TextField>

            <TextField
              select
              size="small"
              label="Alertas sin resolver"
              value={unresolvedAlertsOnly ? "YES" : "NO"}
              onChange={(e) => setUnresolvedAlertsOnly(e.target.value === "YES")}
              sx={{ minWidth: 220 }}
            >
              <MenuItem value="NO">No</MenuItem>
              <MenuItem value="YES">Sí</MenuItem>
            </TextField>
          </Stack>
        </CardContent>
      </Card>

      {/* ✅ Layout pro: resultados a ancho flexible + alertas ancho fijo */}
      <Stack
        direction={{ xs: "column", lg: "row" }}
        spacing={2}
        alignItems="flex-start"
        sx={{ width: "100%" }}
      >
        {/* IMPORTANTÍSIMO: minWidth: 0 para que el overflowX funcione en flex */}
        <Box sx={{ flex: 1, width: "100%", minWidth: 0 }}>
          {/* Scroll horizontal SOLO dentro de resultados */}
          <Box sx={{ width: "100%", overflowX: "auto" }}>
            {/* Si tu tabla es muy ancha, fuerza que tenga “mínimo contenido” */}
            <Box sx={{ minWidth: 900 }}>
              <ResultsTable loading={loading} results={results} />
            </Box>
          </Box>
        </Box>

        <Box sx={{ width: { xs: "100%", lg: 380 }, flexShrink: 0 }}>
          <AlertsPanel loading={loading} alerts={alerts} />
        </Box>
      </Stack>
    </Stack>
  );
}