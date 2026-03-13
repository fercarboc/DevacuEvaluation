// src/components/ImportWizard.tsx
import React, { useEffect, useMemo, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { useImportProfiles } from "@/hooks/useImportProfiles";
import type {
  ImportProfile,
  ImportValidateCommitCommitResponse,
  ImportValidateCommitDryRunResponse,
} from "@/types/screeningCsv.types";
import {
  importValidateCommit,
  uploadScreeningCsvToStorage,
} from "@/services/screeningCsv.service";

type Props = {
  open: boolean;
  orgId: string;
  propertyId: string | null;
  propertyName?: string | null;
  onClose: () => void;
  onCommitted: (runId: string) => void;
};

type Step = "SETUP" | "DRYRUN_DONE" | "COMMIT_DONE";

function pickRunType(profile: ImportProfile) {
  return String(profile.source_type || "").toUpperCase();
}

function clean(v?: string | null) {
  const s = String(v || "").trim();
  return s.length > 0 ? s : "";
}

export default function ImportWizard({
  open,
  orgId,
  propertyId,
  propertyName,
  onClose,
  onCommitted,
}: Props) {
  const cleanOrgId = useMemo(() => clean(orgId), [orgId]);
  const cleanPropertyId = useMemo(() => clean(propertyId), [propertyId]);

  const {
    loading: loadingProfiles,
    error: profilesError,
    profiles,
    reload,
  } = useImportProfiles(cleanOrgId);

  const [profileId, setProfileId] = useState<string>("");
  const [file, setFile] = useState<File | null>(null);

  const [step, setStep] = useState<Step>("SETUP");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [dryRun, setDryRun] =
    useState<ImportValidateCommitDryRunResponse | null>(null);
  const [commitRes, setCommitRes] =
    useState<ImportValidateCommitCommitResponse | null>(null);

  const selectedProfile = useMemo(
    () => profiles.find((p) => p.id === profileId) || null,
    [profiles, profileId],
  );

  const runType = useMemo(() => {
    if (!selectedProfile) return "";
    return pickRunType(selectedProfile);
  }, [selectedProfile]);

  const canDryRun = useMemo(() => {
    return (
      cleanOrgId.length > 0 &&
      cleanPropertyId.length > 0 &&
      clean(profileId).length > 0 &&
      !!file &&
      !busy
    );
  }, [cleanOrgId, cleanPropertyId, profileId, file, busy]);

  const canCommit = useMemo(() => {
    return !!dryRun && cleanPropertyId.length > 0 && !busy;
  }, [dryRun, cleanPropertyId, busy]);

  useEffect(() => {
    if (!open) return;

    setStep("SETUP");
    setBusy(false);
    setErr(null);
    setDryRun(null);
    setCommitRes(null);
    setFile(null);

    if (profiles?.length && !profileId) {
      setProfileId(profiles[0].id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (open && !profileId && profiles?.length) {
      setProfileId(profiles[0].id);
    }
  }, [open, profiles, profileId]);

  async function handleDryRun() {
    if (!canDryRun || !selectedProfile || !file) return;

    setBusy(true);
    setErr(null);

    try {
      const filePath = await uploadScreeningCsvToStorage(
        cleanOrgId,
        cleanPropertyId,
        file,
      );

      const res = await importValidateCommit({
        orgId: cleanOrgId,
        propertyId: cleanPropertyId,
        profileId: selectedProfile.id,
        runType,
        dryRun: true,
        filePath,
      });

      if (res.mode !== "DRY_RUN") {
        throw new Error("unexpected_response_mode");
      }

      setDryRun(res);
      setCommitRes(null);
      setStep("DRYRUN_DONE");
    } catch (e: any) {
      setErr(String(e?.message || e));
    } finally {
      setBusy(false);
    }
  }

  async function handleCommit() {
    if (!canCommit || !selectedProfile || !file) return;

    setBusy(true);
    setErr(null);

    try {
      const filePath = await uploadScreeningCsvToStorage(
        cleanOrgId,
        cleanPropertyId,
        file,
      );

      const res = await importValidateCommit({
        orgId: cleanOrgId,
        propertyId: cleanPropertyId,
        profileId: selectedProfile.id,
        runType,
        dryRun: false,
        filePath,
      });

      if (res.mode !== "COMMIT") {
        throw new Error("unexpected_response_mode");
      }

      setCommitRes(res);
      setStep("COMMIT_DONE");
      onCommitted(res.run_id);
    } catch (e: any) {
      setErr(String(e?.message || e));
    } finally {
      setBusy(false);
    }
  }

  const errorsPreview = dryRun?.errors?.slice(0, 20) || [];
  const previewRows = dryRun?.preview?.slice(0, 10) || [];

  return (
    <Dialog open={open} onClose={busy ? undefined : onClose} fullWidth maxWidth="md">
      <DialogTitle>Nuevo Screening (CSV)</DialogTitle>

      <DialogContent dividers>
        <Stack spacing={2}>
          {!cleanPropertyId ? (
            <Alert severity="warning">
              Debes seleccionar una propiedad antes de subir y procesar el CSV.
            </Alert>
          ) : null}

          {propertyName ? (
            <Alert severity="info">
              Propiedad activa: <strong>{propertyName}</strong>
            </Alert>
          ) : cleanPropertyId ? (
            <Alert severity="info">
              Propiedad activa: <strong>{cleanPropertyId}</strong>
            </Alert>
          ) : null}

          {profilesError && (
            <Alert severity="error">
              Error cargando perfiles: {profilesError}
              <Button size="small" onClick={reload} sx={{ ml: 1 }}>
                Reintentar
              </Button>
            </Alert>
          )}

          {err && <Alert severity="error">{err}</Alert>}

          <Card variant="outlined">
            <CardContent>
              <Typography variant="subtitle2">Configuración</Typography>
              <Divider sx={{ my: 1 }} />

              <Stack direction={{ xs: "column", md: "row" }} spacing={2}>
                <TextField
                  select
                  label="Perfil de importación"
                  size="small"
                  fullWidth
                  value={profileId}
                  onChange={(e) => setProfileId(e.target.value)}
                  disabled={busy || loadingProfiles || !cleanPropertyId}
                >
                  {profiles.map((p) => (
                    <MenuItem key={p.id} value={p.id}>
                      {p.name} — {String(p.source_type || "").toUpperCase()}
                    </MenuItem>
                  ))}
                </TextField>

                <TextField
                  label="run_type efectivo"
                  size="small"
                  fullWidth
                  value={runType}
                  disabled
                />
              </Stack>

              <Box sx={{ mt: 2 }}>
                <Button
                  variant="outlined"
                  component="label"
                  disabled={busy || !cleanPropertyId}
                >
                  Seleccionar CSV
                  <input
                    type="file"
                    hidden
                    accept=".csv,text/csv,text/plain"
                    onChange={(e) => {
                      const f = e.target.files?.[0] || null;
                      setFile(f);
                      setDryRun(null);
                      setCommitRes(null);
                      setStep("SETUP");
                    }}
                  />
                </Button>

                <Typography
                  variant="caption"
                  sx={{ ml: 2 }}
                  color="text.secondary"
                >
                  {file ? file.name : "Ningún archivo seleccionado"}
                </Typography>
              </Box>

              <Box sx={{ mt: 2 }}>
                <Button
                  variant="contained"
                  onClick={handleDryRun}
                  disabled={!canDryRun}
                >
                  {busy ? "Procesando…" : "Validar (Dry-run)"}
                </Button>

                {busy && (
                  <CircularProgress
                    size={18}
                    sx={{ ml: 2, verticalAlign: "middle" }}
                  />
                )}
              </Box>
            </CardContent>
          </Card>

          {dryRun && (
            <Card variant="outlined">
              <CardContent>
                <Stack
                  direction="row"
                  justifyContent="space-between"
                  alignItems="center"
                >
                  <Typography variant="subtitle2">Resultado Dry-run</Typography>
                  <Typography variant="caption" color="text.secondary">
                    import_job_id: {dryRun.import_job_id}
                  </Typography>
                </Stack>

                <Divider sx={{ my: 1 }} />

                <Stack direction={{ xs: "column", md: "row" }} spacing={2}>
                  <Box>
                    <Typography variant="body2">
                      Total filas: {dryRun.total_rows}
                    </Typography>
                    <Typography variant="body2">
                      Válidas: {dryRun.valid_rows}
                    </Typography>
                    <Typography variant="body2">
                      Inválidas: {dryRun.invalid_rows}
                    </Typography>
                  </Box>

                  <Box sx={{ flex: 1 }}>
                    <Typography variant="body2" sx={{ fontWeight: 700 }}>
                      Errores (primeros {errorsPreview.length})
                    </Typography>

                    {errorsPreview.length === 0 ? (
                      <Typography variant="body2" color="text.secondary">
                        Sin errores.
                      </Typography>
                    ) : (
                      <Box component="ul" sx={{ m: 0, pl: 2 }}>
                        {errorsPreview.map((e, idx) => (
                          <li key={idx}>
                            <Typography variant="caption">
                              Row {e.row} {e.field ? `(${e.field})` : ""}:{" "}
                              {e.error}
                            </Typography>
                          </li>
                        ))}
                      </Box>
                    )}
                  </Box>
                </Stack>

                <Divider sx={{ my: 1 }} />

                <Typography variant="body2" sx={{ fontWeight: 700 }}>
                  Preview (primeras {previewRows.length})
                </Typography>

                {previewRows.length === 0 ? (
                  <Typography variant="body2" color="text.secondary">
                    Sin preview.
                  </Typography>
                ) : (
                  <Box
                    sx={{
                      mt: 1,
                      p: 1,
                      borderRadius: 1,
                      border: "1px solid",
                      borderColor: "divider",
                      backgroundColor: "background.default",
                      maxHeight: 220,
                      overflow: "auto",
                      fontFamily: "monospace",
                      fontSize: 12,
                      whiteSpace: "pre",
                    }}
                  >
                    {JSON.stringify(previewRows, null, 2)}
                  </Box>
                )}

                <Box sx={{ mt: 2 }}>
                  <Button
                    variant="contained"
                    color="success"
                    onClick={handleCommit}
                    disabled={!canCommit}
                  >
                    {busy ? "Procesando…" : "Confirmar (Commit)"}
                  </Button>
                </Box>
              </CardContent>
            </Card>
          )}

          {commitRes && (
            <Alert severity="success">
              Commit OK. Run creado: {commitRes.run_id} (HIGH={commitRes.high} / MED=
              {commitRes.medium} / LOW={commitRes.low})
            </Alert>
          )}
        </Stack>
      </DialogContent>

      <DialogActions>
        <Button onClick={onClose} disabled={busy}>
          Cerrar
        </Button>
      </DialogActions>
    </Dialog>
  );
}