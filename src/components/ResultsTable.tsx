// src/components/ResultsTable.tsx
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
import type { ScreeningResult } from "@/types/screeningCsv.types";

type Props = {
  loading: boolean;
  results: ScreeningResult[];
};

function riskChipColor(band: string) {
  const b = String(band || "").toUpperCase();
  if (b === "HIGH") return "error";
  if (b === "MEDIUM") return "warning";
  if (b === "LOW") return "success";
  return "default";
}

function fmtMoney(v: any) {
  const n = Number(v ?? 0);
  if (!Number.isFinite(n)) return "-";
  return n.toFixed(2);
}

export default function ResultsTable({ loading, results }: Props) {
  const rows = useMemo(() => results || [], [results]);

  return (
    <Card variant="outlined">
      <CardContent>
        <Stack direction="row" justifyContent="space-between" alignItems="center">
          <Typography variant="subtitle1">Resultados</Typography>
          <Typography variant="caption" color="text.secondary">
            {rows.length} filas
          </Typography>
        </Stack>

        <Divider sx={{ my: 1 }} />

        {loading && (
          <Box sx={{ py: 2, display: "flex", alignItems: "center", gap: 1 }}>
            <CircularProgress size={18} />
            <Typography variant="body2">Cargando resultados…</Typography>
          </Box>
        )}

        {!loading && rows.length === 0 && (
          <Typography variant="body2" color="text.secondary">
            Sin resultados para este filtro.
          </Typography>
        )}

        {!loading && rows.length > 0 && (
          <Box sx={{ overflow: "auto", maxHeight: 720, border: "1px solid", borderColor: "divider", borderRadius: 1 }}>
            <Box
              component="table"
              sx={{
                width: "100%",
                borderCollapse: "collapse",
                "& th, & td": { borderBottom: "1px solid", borderColor: "divider", p: 1, fontSize: 12, whiteSpace: "nowrap" },
                "& th": { position: "sticky", top: 0, backgroundColor: "background.paper", zIndex: 1, textAlign: "left" },
              }}
            >
              <thead>
                <tr>
                  <th>Band</th>
                  <th>Check-in</th>
                  <th>Inc</th>
                  <th>Net Loss</th>
                  <th>Δ Inc</th>
                  <th>Δ Loss</th>
                  <th>Prev</th>
                  <th>Cambio</th>
                  <th>Último incidente</th>
                  <th>Días</th>
                  <th>Match</th>
                  <th>Fila CSV</th>
                  <th>Identity</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const band = String(r.risk_band || "LOW").toUpperCase();
                  const prev = r.prev_risk_band ? String(r.prev_risk_band).toUpperCase() : "-";
                  const changed = !!r.risk_band_changed;

                  return (
                    <tr key={r.id}>
                      <td>
                        <Chip
                          size="small"
                          label={band}
                          color={riskChipColor(band) as any}
                          variant="outlined"
                        />
                      </td>
                      <td>{r.checkin_date || "-"}</td>
                      <td>{Number(r.incidents_count ?? 0)}</td>
                      <td>{fmtMoney(r.total_net_loss)}</td>
                      <td>{Number(r.delta_incidents_count ?? 0)}</td>
                      <td>{fmtMoney(r.delta_total_net_loss)}</td>
                      <td>{prev}</td>
                      <td>{changed ? "Sí" : "No"}</td>
                      <td>{r.last_incident_date || "-"}</td>
                      <td>{r.days_since_last ?? "-"}</td>
                      <td>
                        <Tooltip title={`basis=${r.match_basis || "-"} conf=${r.match_confidence || "-"}`}>
                          <span>{r.match_confidence || "-"}</span>
                        </Tooltip>
                      </td>
                      <td>{r.row_number ?? "-"}</td>
                      <td>
                        <Tooltip title={r.identity_key}>
                          <span style={{ fontFamily: "monospace" }}>
                            {String(r.identity_key || "").slice(0, 10)}…
                          </span>
                        </Tooltip>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </Box>
          </Box>
        )}
      </CardContent>
    </Card>
  );
}