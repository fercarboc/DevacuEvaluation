// src/components/AlertsPanel.tsx
import React, { useMemo } from "react";
import {
  Box,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Divider,
  Stack,
  Tooltip,
  Typography,
} from "@mui/material";
import type { ScreeningAlert } from "@/types/screeningCsv.types";

type Props = {
  loading: boolean;
  alerts: ScreeningAlert[];
};

function alertColor(type: string) {
  const t = String(type || "").toUpperCase();
  if (t === "HIGH_RISK") return "error";
  if (t === "RISK_CHANGED") return "warning";
  if (t === "NEW_INCIDENT") return "warning";
  return "default";
}

function fmtTs(ts?: string | null) {
  if (!ts) return "";
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return ts;
  return d.toLocaleString();
}

export default function AlertsPanel({ loading, alerts }: Props) {
  const rows = useMemo(() => alerts || [], [alerts]);

  return (
    <Card variant="outlined">
      <CardContent>
        <Stack direction="row" justifyContent="space-between" alignItems="center">
          <Typography variant="subtitle1">Alertas</Typography>
          <Typography variant="caption" color="text.secondary">
            {rows.length}
          </Typography>
        </Stack>

        <Divider sx={{ my: 1 }} />

        {loading && (
          <Box sx={{ py: 2, display: "flex", alignItems: "center", gap: 1 }}>
            <CircularProgress size={18} />
            <Typography variant="body2">Cargando alertas…</Typography>
          </Box>
        )}

        {!loading && rows.length === 0 && (
          <Typography variant="body2" color="text.secondary">
            Sin alertas para este run / filtro.
          </Typography>
        )}

        {!loading && rows.length > 0 && (
          <Box sx={{ maxHeight: 720, overflow: "auto" }}>
            <Stack spacing={1}>
              {rows.map((a) => {
                const resolved = !!a.resolved_at;
                const t = String(a.alert_type || "").toUpperCase();

                return (
                  <Box
                    key={a.id}
                    sx={{
                      border: "1px solid",
                      borderColor: "divider",
                      borderRadius: 1,
                      p: 1,
                      opacity: resolved ? 0.6 : 1,
                    }}
                  >
                    <Stack direction="row" spacing={1} alignItems="center" justifyContent="space-between">
                      <Stack direction="row" spacing={1} alignItems="center">
                        <Chip size="small" label={t} color={alertColor(t) as any} variant="outlined" />
                        {resolved && <Chip size="small" label="RESUELTA" variant="outlined" />}
                      </Stack>

                      <Typography variant="caption" color="text.secondary">
                        {fmtTs(a.created_at)}
                      </Typography>
                    </Stack>

                    <Typography variant="body2" sx={{ mt: 0.5 }}>
                      {a.message || "(sin mensaje)"}
                    </Typography>

                    <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: "block" }}>
                      <Tooltip title={a.identity_key}>
                        <span style={{ fontFamily: "monospace" }}>
                          identity: {String(a.identity_key || "").slice(0, 10)}…
                        </span>
                      </Tooltip>
                      {a.row_number ? ` · row: ${a.row_number}` : ""}
                      {a.resolved_at ? ` · resolved: ${fmtTs(a.resolved_at)}` : ""}
                    </Typography>
                  </Box>
                );
              })}
            </Stack>
          </Box>
        )}
      </CardContent>
    </Card>
  );
}