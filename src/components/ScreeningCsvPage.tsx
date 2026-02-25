// src/components/ScreeningCsvPage.tsx
import React, { useMemo, useState } from "react";
import { Box, Button, Divider, Stack, Typography } from "@mui/material";
import RunsList from "@/components/RunsList";
import ImportWizard from "@/components/ImportWizard";
import RunDetail from "@/components/RunDetail";

type Props = {
  orgId: string;
};

export default function ScreeningCsvPage({ orgId }: Props) {
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [openWizard, setOpenWizard] = useState(false);

  const canUse = useMemo(() => String(orgId || "").trim().length > 0, [orgId]);

  return (
    <Box sx={{ p: 2 }}>
      <Stack direction="row" alignItems="center" justifyContent="space-between" spacing={2}>
        <Box>
          <Typography variant="h6">Screening por CSV</Typography>
          <Typography variant="body2" color="text.secondary">
            Importa un CSV, valida (dry-run) y genera un run de screening (persona + fecha).
          </Typography>
        </Box>

        <Button
          variant="contained"
          onClick={() => setOpenWizard(true)}
          disabled={!canUse}
        >
          Nuevo Screening (CSV)
        </Button>
      </Stack>

      <Divider sx={{ my: 2 }} />

      <Stack direction={{ xs: "column", md: "row" }} spacing={2} alignItems="flex-start">
        <Box sx={{ width: { xs: "100%", md: 420 }, flexShrink: 0 }}>
          <RunsList
            orgId={orgId}
            selectedRunId={selectedRunId}
            onSelectRun={(id) => setSelectedRunId(id)}
            onCreateNew={() => setOpenWizard(true)}
          />
        </Box>

        <Box sx={{ width: "100%" }}>
          <RunDetail orgId={orgId} runId={selectedRunId} />
        </Box>
      </Stack>

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