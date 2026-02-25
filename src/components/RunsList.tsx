// src/components/RunsList.tsx
import React, { useMemo } from "react";
import {
  Box,
  Button,
  Card,
  CardContent,
  CircularProgress,
  Divider,
  List,
  ListItemButton,
  ListItemText,
  Stack,
  Typography,
} from "@mui/material";
import { useScreeningRuns } from "@/hooks/useScreeningRuns";
import type { ScreeningRun } from "@/types/screeningCsv.types";

type Props = {
  orgId: string;
  selectedRunId: string | null;
  onSelectRun: (runId: string) => void;
  onCreateNew: () => void;
};

function fmtTs(ts?: string | null) {
  if (!ts) return "";
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return ts;
  return d.toLocaleString();
}

function runLabel(r: ScreeningRun) {
  const t = String(r.run_type || "").toUpperCase();
  return t || "RUN";
}

export default function RunsList({ orgId, selectedRunId, onSelectRun, onCreateNew }: Props) {
  const { loading, error, runs, reload } = useScreeningRuns(orgId, 80);

  const hasRuns = useMemo(() => (runs?.length || 0) > 0, [runs]);

  return (
    <Card variant="outlined">
      <CardContent>
        <Stack direction="row" alignItems="center" justifyContent="space-between" spacing={1}>
          <Typography variant="subtitle1">Runs</Typography>
          <Stack direction="row" spacing={1}>
            <Button size="small" onClick={reload} disabled={loading}>
              Refrescar
            </Button>
            <Button size="small" variant="contained" onClick={onCreateNew}>
              Nuevo
            </Button>
          </Stack>
        </Stack>

        <Divider sx={{ my: 1 }} />

        {loading && (
          <Box sx={{ py: 2, display: "flex", alignItems: "center", gap: 1 }}>
            <CircularProgress size={18} />
            <Typography variant="body2">Cargando runs…</Typography>
          </Box>
        )}

        {!loading && error && (
          <Box sx={{ py: 1 }}>
            <Typography variant="body2" color="error">
              {error}
            </Typography>
          </Box>
        )}

        {!loading && !error && !hasRuns && (
          <Box sx={{ py: 2 }}>
            <Typography variant="body2" color="text.secondary">
              No hay runs todavía. Crea uno con “Nuevo”.
            </Typography>
          </Box>
        )}

        {!loading && !error && hasRuns && (
          <List dense disablePadding sx={{ maxHeight: 620, overflow: "auto" }}>
            {runs.map((r) => {
              const selected = selectedRunId === r.id;
              const total = Number(r.total_analyzed ?? 0);
              const high = Number(r.high_count ?? 0);
              const med = Number(r.medium_count ?? 0);
              const low = Number(r.low_count ?? 0);

              return (
                <ListItemButton
                  key={r.id}
                  selected={selected}
                  onClick={() => onSelectRun(r.id)}
                  sx={{
                    borderRadius: 1,
                    mb: 0.5,
                    border: "1px solid",
                    borderColor: selected ? "primary.main" : "divider",
                  }}
                >
                  <ListItemText
                    primary={
                      <Stack direction="row" justifyContent="space-between" spacing={1}>
                        <Typography variant="body2" sx={{ fontWeight: 700 }}>
                          {runLabel(r)}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          {fmtTs(r.created_at)}
                        </Typography>
                      </Stack>
                    }
                    secondary={
                      <Stack direction="row" spacing={1} sx={{ mt: 0.5, flexWrap: "wrap" }}>
                        <Typography variant="caption" color="text.secondary">
                          Total: {total}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          HIGH: {high}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          MED: {med}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          LOW: {low}
                        </Typography>
                      </Stack>
                    }
                  />
                </ListItemButton>
              );
            })}
          </List>
        )}
      </CardContent>
    </Card>
  );
}