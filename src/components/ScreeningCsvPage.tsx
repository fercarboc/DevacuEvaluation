// src/components/ScreeningCsvPage.tsx
import React, { useMemo, useState } from "react";
import { Box, Button, Divider, Drawer, Stack, Typography } from "@mui/material";
import RunsList from "@/components/RunsList";
import ImportWizard from "@/components/ImportWizard";
import RunDetail from "@/components/RunDetail";
import ImportJobsDialog from "@/components/ImportJobsDialog";

type Props = { orgId: string };

export default function ScreeningCsvPage({ orgId }: Props) {
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);

  const [openWizard, setOpenWizard] = useState(false);
  const [openRuns, setOpenRuns] = useState(false);
  const [openImports, setOpenImports] = useState(false);

  const canUse = useMemo(() => String(orgId || "").trim().length > 0, [orgId]);

  return (
    <Box sx={{ p: 2 }}>
      <Stack direction="row" alignItems="center" justifyContent="space-between" spacing={2}>
        <Box>
          <Typography variant="h6">Screening por CSV</Typography>
          <Typography variant="body2" color="text.secondary">
            Importa un CSV, valida (dry-run) y genera un run (persona + fecha).
          </Typography>
        </Box>

        <Stack direction="row" spacing={1}>
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

      {/* ✅ A ancho completo: aquí va la tabla + alertas */}
      <RunDetail orgId={orgId} runId={selectedRunId} />

      {/* Drawer de Runs (NO ocupa espacio si no lo abres) */}
      <Drawer
        anchor="left"
        open={openRuns}
        onClose={() => setOpenRuns(false)}
        PaperProps={{ sx: { width: 460, p: 2 } }}
      >
        <RunsList
          orgId={orgId}
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

      {/* Dialog de Importaciones */}
      <ImportJobsDialog
        open={openImports}
        orgId={orgId}
        onClose={() => setOpenImports(false)}
      />

      <ImportWizard
        open={openWizard}
        orgId={orgId}
        onClose={() => setOpenWizard(false)}
        onCommitted={(runId) => {
          setOpenWizard(false);
          setSelectedRunId(runId);
        }}
      />
    </Box>
  );
}