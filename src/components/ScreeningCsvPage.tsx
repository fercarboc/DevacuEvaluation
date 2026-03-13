import React, { useEffect, useMemo, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Divider,
  Drawer,
  Stack,
  Typography,
} from "@mui/material";
import RunsList from "@/components/RunsList";
import ImportWizard from "@/components/ImportWizard";
import RunDetail from "@/components/RunDetail";
import ImportJobsDialog from "@/components/ImportJobsDialog";
import { useScreeningRuns } from "@/hooks/useScreeningRuns";

type Props = {
  orgId: string;
  propertyId: string | null;
  propertyName?: string | null;
};

function clean(v?: string | null) {
  const s = String(v || "").trim();
  return s.length > 0 ? s : "";
}

function downloadTemplateCsv() {
  const headers = [
    "first_name",
    "last_name",
    "email",
    "phone",
    "document_number",
    "document_country",
    "date_of_birth",
    "reservation_ref",
    "booking_created_at",
    "checkin_date",
    "checkout_date",
    "status",
    "channel",
    "currency",
    "total_amount",
    "room_amount",
    "extras_amount",
    "commission_amount",
    "net_amount",
    "deposit_amount",
  ];

  const exampleRows = [
    [
      "Juan",
      "Pérez",
      "juan@example.com",
      "600123123",
      "12345678A",
      "ES",
      "1985-06-10",
      "RES-1001",
      "2026-03-10",
      "2026-03-20",
      "2026-03-22",
      "CONFIRMED",
      "DIRECT",
      "EUR",
      "250.00",
      "220.00",
      "15.00",
      "0.00",
      "235.00",
      "50.00",
    ],
    [
      "Anna",
      "Smith",
      "anna@example.com",
      "447700900123",
      "XK998877",
      "GB",
      "1990-09-18",
      "RES-1002",
      "2026-03-11",
      "2026-03-25",
      "2026-03-28",
      "BOOKED",
      "BOOKING",
      "EUR",
      "420.00",
      "380.00",
      "20.00",
      "30.00",
      "370.00",
      "100.00",
    ],
  ];

  const escapeCsv = (value: string) => {
    const v = String(value ?? "");
    if (v.includes(",") || v.includes('"') || v.includes("\n")) {
      return `"${v.replace(/"/g, '""')}"`;
    }
    return v;
  };

  const csv = [
    headers.join(","),
    ...exampleRows.map((row) => row.map(escapeCsv).join(",")),
  ].join("\n");

  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = "debacu_screening_template.csv";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);

  URL.revokeObjectURL(url);
}

export default function ScreeningCsvPage({
  orgId,
  propertyId,
  propertyName,
}: Props) {
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);

  const [openWizard, setOpenWizard] = useState(false);
  const [openRuns, setOpenRuns] = useState(false);
  const [openImports, setOpenImports] = useState(false);

  const cleanOrgId = useMemo(() => clean(orgId), [orgId]);
  const cleanPropertyId = useMemo(() => clean(propertyId), [propertyId]);
  const cleanPropertyName = useMemo(() => clean(propertyName), [propertyName]);

  const canUse = useMemo(() => {
    return cleanOrgId.length > 0 && cleanPropertyId.length > 0;
  }, [cleanOrgId, cleanPropertyId]);

  const { runs } = useScreeningRuns({
    orgId: cleanOrgId,
    propertyId: cleanPropertyId,
    limit: 1,
    autoLoad: true,
  });

  useEffect(() => {
    if (!canUse) {
      setSelectedRunId(null);
      return;
    }

    if (!selectedRunId && runs && runs.length > 0) {
      setSelectedRunId(runs[0].id);
    }
  }, [canUse, runs, selectedRunId]);

  return (
    <Box sx={{ p: 2 }}>
      <Stack
        direction={{ xs: "column", md: "row" }}
        alignItems={{ xs: "flex-start", md: "center" }}
        justifyContent="space-between"
        spacing={2}
      >
        <Box>
          <Typography variant="h6">Screening por CSV</Typography>
          <Typography variant="body2" color="text.secondary">
            Importa un CSV, valida (dry-run) y genera un run por propiedad.
          </Typography>

          {canUse ? (
            <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 0.5 }}>
              Propiedad activa: {cleanPropertyName || cleanPropertyId}
            </Typography>
          ) : null}
        </Box>

        <Stack
          direction={{ xs: "column", sm: "row" }}
          spacing={1}
          sx={{ width: { xs: "100%", md: "auto" } }}
        >
          <Button variant="outlined" onClick={downloadTemplateCsv}>
            Descargar plantilla CSV
          </Button>

          <Button variant="outlined" onClick={() => setOpenRuns(true)} disabled={!canUse}>
            Ver runs
          </Button>

          <Button variant="outlined" onClick={() => setOpenImports(true)} disabled={!canUse}>
            Ver importaciones
          </Button>

          <Button variant="contained" onClick={() => setOpenWizard(true)} disabled={!canUse}>
            Nuevo screening (CSV)
          </Button>
        </Stack>
      </Stack>

      <Divider sx={{ my: 2 }} />

      {!canUse ? (
        <Alert severity="warning" sx={{ mb: 2 }}>
          Debes seleccionar una propiedad antes de subir un CSV, ver runs o consultar importaciones.
        </Alert>
      ) : null}

      {canUse ? (
        <Alert severity="info" sx={{ mb: 2 }}>
          Todo el flujo de esta pantalla queda imputado a la propiedad activa:
          {" "}
          <strong>{cleanPropertyName || cleanPropertyId}</strong>.
        </Alert>
      ) : null}

      <RunDetail
        orgId={cleanOrgId}
        runId={selectedRunId}
        propertyName={cleanPropertyName || cleanPropertyId}
      />

      <Drawer
        anchor="left"
        open={openRuns}
        onClose={() => setOpenRuns(false)}
        PaperProps={{ sx: { width: 460, p: 2 } }}
      >
        <RunsList
          orgId={cleanOrgId}
          propertyId={cleanPropertyId || null}
          propertyName={cleanPropertyName || cleanPropertyId}
          selectedRunId={selectedRunId}
          onSelectRun={(id) => {
            setSelectedRunId(id);
            setOpenRuns(false);
          }}
          onCreateNew={() => {
            setOpenRuns(false);
            setOpenWizard(true);
          }}
        />
      </Drawer>

      <ImportJobsDialog
        open={openImports}
        orgId={cleanOrgId}
        propertyId={cleanPropertyId || null}
        propertyName={cleanPropertyName || cleanPropertyId}
        onClose={() => setOpenImports(false)}
      />

      <ImportWizard
        open={openWizard}
        orgId={cleanOrgId}
        propertyId={cleanPropertyId || null}
        propertyName={cleanPropertyName || cleanPropertyId}
        onClose={() => setOpenWizard(false)}
        onCommitted={(runId) => {
          setOpenWizard(false);
          setSelectedRunId(runId);
        }}
      />
    </Box>
  );
}