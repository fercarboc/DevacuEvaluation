// src/modules/revenue-intelligence/pages/RevenueImportData.tsx
import React, { useMemo, useRef, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  Database,
  FileText,
  Info,
  RefreshCcw,
  Table as TableIcon,
  Upload,
} from "lucide-react";

import { supabase } from "@/services/supabaseClient";

type RevenueImportDataProps = {
  orgId: string | null;
  selectedPropertyId: string | null;
  selectedPropertyCode?: string | null;
  selectedPropertyName?: string | null;
};

type DryRunPreviewRow = Record<string, unknown>;

type DryRunErrorRow = {
  row_number?: number;
  row?: Record<string, unknown>;
  errors?: string[];
  warnings?: string[];
};

type DryRunWarningRow = {
  row_number?: number;
  reservation_key?: string;
  warnings?: string[];
};

type DryRunResponse = {
  mode: "dry_run";
  file_name: string;
  source_file_sha256: string;
  delimiter: string;
  header_row_index: number;
  skipped_top_lines: string[];
  import_profile_code: string;
  rows_detected: number;
  rows_ok: number;
  rows_warning: number;
  rows_error: number;
  summary?: {
    screening_and_revenue_rows: number;
    revenue_only_rows: number;
    invalid_rows: number;
  };
  preview: DryRunPreviewRow[];
  errors: DryRunErrorRow[];
  warnings: DryRunWarningRow[];
  header_map: Record<string, string>;
};

type CommitResponse = {
  status: "ok";
  batch_id: string;
  property_code: string;
  rows_total: number;
  rows_ok: number;
  rows_warning: number;
  rows_error: number;
  summary?: {
    screening_and_revenue_rows: number;
    revenue_only_rows: number;
    invalid_rows: number;
  };
};

type FunctionEnvelope<T> = {
  ok?: boolean;
  data?: T;
  error?: string;
  detail?: string;
};

function unwrapFunctionData<T>(payload: unknown): T | null {
  if (!payload || typeof payload !== "object") return null;

  const obj = payload as Record<string, unknown>;

  if ("data" in obj) {
    return (obj.data as T) ?? null;
  }

  return payload as T;
}

function isDryRunResponse(data: unknown): data is DryRunResponse {
  return Boolean(
    data &&
      typeof data === "object" &&
      "preview" in (data as Record<string, unknown>) &&
      "rows_ok" in (data as Record<string, unknown>)
  );
}

function isCommitResponse(data: unknown): data is CommitResponse {
  return Boolean(
    data &&
      typeof data === "object" &&
      (data as Record<string, unknown>).status === "ok" &&
      "batch_id" in (data as Record<string, unknown>)
  );
}

function extractFunctionErrorMessage(error: unknown, fallback: string): string {
  if (!error) return fallback;

  if (typeof error === "string") return error;

  if (error instanceof Error) return error.message;

  if (typeof error === "object") {
    const maybeError = error as Record<string, unknown>;

    const nestedMessage =
      typeof maybeError.message === "string"
        ? maybeError.message
        : typeof maybeError.error === "string"
        ? maybeError.error
        : typeof maybeError.details === "string"
        ? maybeError.details
        : typeof maybeError.detail === "string"
        ? maybeError.detail
        : null;

    if (nestedMessage) return nestedMessage;
  }

  return fallback;
}

export default function RevenueImportData({
  orgId,
  selectedPropertyId,
  selectedPropertyCode,
  selectedPropertyName,
}: RevenueImportDataProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);

  const [file, setFile] = useState<File | null>(null);
  const [isValidating, setIsValidating] = useState(false);
  const [isImporting, setIsImporting] = useState(false);

  const [dryRunResult, setDryRunResult] = useState<DryRunResponse | null>(null);
  const [commitResult, setCommitResult] = useState<CommitResponse | null>(null);

  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const previewHeaders = useMemo(() => {
    if (!dryRunResult?.preview?.length) return [];
    return Object.keys(dryRunResult.preview[0]);
  }, [dryRunResult]);

  const screeningRows = dryRunResult?.summary?.screening_and_revenue_rows ?? 0;
  const revenueOnlyRows = dryRunResult?.summary?.revenue_only_rows ?? 0;
  const invalidRows = dryRunResult?.summary?.invalid_rows ?? 0;

  const canOperate = Boolean(orgId && selectedPropertyId);

  const handlePickFile = () => {
    inputRef.current?.click();
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const selected = event.target.files?.[0] ?? null;

    setError(null);
    setSuccess(null);
    setDryRunResult(null);
    setCommitResult(null);

    if (!selected) {
      setFile(null);
      return;
    }

    if (!selected.name.toLowerCase().endsWith(".csv")) {
      setFile(null);
      setError("Selecciona un archivo CSV válido.");
      return;
    }

    setFile(selected);
  };

   const handleValidate = async () => {
    if (!file) return;
    if (!canOperate) {
      setError("No hay propiedad activa seleccionada.");
      return;
    }

    setIsValidating(true);
    setError(null);
    setSuccess(null);
    setDryRunResult(null);
    setCommitResult(null);

    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("mode", "dry_run");
      if (orgId) formData.append("org_id", orgId);

      const { data, error } = await supabase.functions.invoke(
        "debacu_eval_csv_unified_import",
        { body: formData },
      );

      if (error) {
        throw new Error(extractFunctionErrorMessage(error, "Error validando el CSV"));
      }

      const unwrapped = unwrapFunctionData<DryRunResponse>(data);

      if (!isDryRunResponse(unwrapped)) {
        console.error("Dry run payload inesperado:", data);
        throw new Error("Respuesta inesperada en dry_run");
      }

      setDryRunResult(unwrapped);
      setSuccess("Validación completada. Revisa preview, warnings y errores.");
    } catch (err) {
      setError(extractFunctionErrorMessage(err, "Error inesperado en dry_run"));
    } finally {
      setIsValidating(false);
    }
  };
  const handleImport = async () => {
  if (!file || !dryRunResult) return;
  if (!canOperate) {
    setError("No hay propiedad activa seleccionada.");
    return;
  }

  setIsImporting(true);
  setError(null);
  setSuccess(null);
  setCommitResult(null);

  try {
    const formData = new FormData();
    formData.append("file", file);
    formData.append("mode", "commit");

    if (orgId) formData.append("org_id", orgId);
    if (selectedPropertyId) formData.append("selected_property_id", selectedPropertyId);
    if (selectedPropertyCode) formData.append("selected_property_code", selectedPropertyCode);
    if (selectedPropertyName) formData.append("selected_property_name", selectedPropertyName);

    const { data, error } = await supabase.functions.invoke(
      "debacu_eval_csv_unified_import",
      { body: formData },
    );

    if (error) {
      throw new Error(extractFunctionErrorMessage(error, "Error importando el CSV"));
    }

    const unwrapped = unwrapFunctionData<CommitResponse>(data);

    if (!isCommitResponse(unwrapped)) {
      console.error("Commit payload inesperado:", data);
      throw new Error("Respuesta inesperada en commit");
    }

    setCommitResult(unwrapped);
    setSuccess(`Importación completada. Batch ${unwrapped.batch_id}`);
  } catch (err) {
    setError(extractFunctionErrorMessage(err, "Error inesperado en commit"));
  } finally {
    setIsImporting(false);
  }
};

  const downloadTemplate = () => {
    const csvContent =
      "reservation_id,booking_date,checkin_date,checkout_date,status,channel,gross_revenue,rooms,first_name,last_name,document,email,phone,country,segment,room_type,rate_plan,commission_amount,net_revenue,adults,children,currency,property_code\n" +
      "RES-001,2026-03-01,2026-05-01,2026-05-03,CONFIRMED,BOOKING,240.00,1,Juan,Perez,12345678Z,juan@email.com,34600111222,ES,LEISURE,DOUBLE,STANDARD,36.00,204.00,2,0,EUR,DEMOHOTEL";

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);

    link.href = url;
    link.download = "plantilla_csv_unificado_revenue.csv";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Importación Revenue</h1>
          <p className="text-gray-500">
            CSV real del PMS para{" "}
            <span className="font-bold text-blue-600">
              {selectedPropertyName ?? "propiedad activa"}
            </span>
          </p>
        </div>

        <button
          onClick={downloadTemplate}
          className="flex items-center gap-2 px-6 py-3 bg-white border border-gray-200 text-gray-700 rounded-2xl font-bold hover:bg-gray-50 transition-all shadow-sm"
        >
          <FileText size={18} />
          Descargar plantilla
        </button>
      </div>

      {!canOperate && (
        <div className="flex items-center gap-3 bg-amber-50 text-amber-700 p-4 rounded-2xl border border-amber-100">
          <AlertCircle size={20} />
          <span className="text-sm font-bold">
            Selecciona una propiedad activa antes de importar.
          </span>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-white p-8 rounded-3xl shadow-sm border border-gray-100">
            <div className="flex items-center gap-3 mb-8">
              <div className="bg-blue-100 p-2 rounded-xl text-blue-600">
                <Upload size={24} />
              </div>
              <div>
                <h2 className="text-xl font-bold">Subir CSV unificado</h2>
                <p className="text-sm text-gray-500">
                  Validación real contra Edge Function
                </p>
              </div>
            </div>

            <input
              ref={inputRef}
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={handleFileChange}
            />

            <button
              type="button"
              onClick={handlePickFile}
              className="w-full border-2 border-dashed border-gray-200 rounded-3xl p-12 text-center transition-all hover:border-blue-400 hover:bg-gray-50"
            >
              <div className="bg-blue-50 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4 text-blue-600">
                <Upload size={30} />
              </div>

              {file ? (
                <div className="space-y-2">
                  <p className="font-bold text-gray-900">{file.name}</p>
                  <p className="text-sm text-gray-500">{(file.size / 1024).toFixed(2)} KB</p>
                </div>
              ) : (
                <div className="space-y-2">
                  <p className="font-bold text-gray-900">Haz clic para seleccionar un CSV</p>
                  <p className="text-sm text-gray-500">Archivo real, validación real, importación real.</p>
                </div>
              )}
            </button>

            {error && (
              <div className="mt-6 flex items-center gap-3 bg-rose-50 text-rose-700 p-4 rounded-2xl border border-rose-100">
                <AlertCircle size={20} />
                <span className="text-sm font-bold">{error}</span>
              </div>
            )}

            {success && (
              <div className="mt-6 flex items-center gap-3 bg-emerald-50 text-emerald-700 p-4 rounded-2xl border border-emerald-100">
                <CheckCircle2 size={20} />
                <span className="text-sm font-bold">{success}</span>
              </div>
            )}

            <div className="mt-8 flex gap-4">
              <button
                onClick={handleValidate}
                disabled={!file || !canOperate || isValidating || isImporting}
                className={`flex-1 py-3 rounded-2xl font-bold transition-all ${
                  !file || !canOperate || isValidating || isImporting
                    ? "bg-gray-100 text-gray-400 cursor-not-allowed"
                    : "bg-gray-900 text-white hover:bg-gray-800"
                }`}
              >
                {isValidating ? "Validando..." : "Validar archivo"}
              </button>

              <button
                onClick={handleImport}
                disabled={!dryRunResult || !canOperate || isImporting || isValidating}
                className={`flex-1 py-3 rounded-2xl font-bold transition-all flex items-center justify-center gap-2 ${
                  !dryRunResult || !canOperate || isImporting || isValidating
                    ? "bg-gray-100 text-gray-400 cursor-not-allowed"
                    : "bg-blue-600 text-white hover:bg-blue-700 shadow-lg shadow-blue-200"
                }`}
              >
                <Database size={18} />
                {isImporting ? "Importando..." : "Importar a BD"}
              </button>
            </div>
          </div>

          {dryRunResult && (
            <>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="bg-white p-5 rounded-3xl shadow-sm border border-gray-100">
                  <p className="text-xs uppercase tracking-wider text-gray-400 font-bold">Rows OK</p>
                  <p className="text-3xl font-bold text-gray-900 mt-2">{dryRunResult.rows_ok}</p>
                </div>

                <div className="bg-white p-5 rounded-3xl shadow-sm border border-gray-100">
                  <p className="text-xs uppercase tracking-wider text-gray-400 font-bold">Warnings</p>
                  <p className="text-3xl font-bold text-amber-600 mt-2">{dryRunResult.rows_warning}</p>
                </div>

                <div className="bg-white p-5 rounded-3xl shadow-sm border border-gray-100">
                  <p className="text-xs uppercase tracking-wider text-gray-400 font-bold">Errores</p>
                  <p className="text-3xl font-bold text-rose-600 mt-2">{dryRunResult.rows_error}</p>
                </div>

                <div className="bg-white p-5 rounded-3xl shadow-sm border border-gray-100">
                  <p className="text-xs uppercase tracking-wider text-gray-400 font-bold">Delimiter</p>
                  <p className="text-2xl font-bold text-gray-900 mt-2">{dryRunResult.delimiter}</p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-white p-5 rounded-3xl shadow-sm border border-gray-100">
                  <p className="text-sm font-bold text-gray-900">Screening + Revenue</p>
                  <p className="text-2xl font-bold text-gray-900 mt-2">{screeningRows}</p>
                </div>

                <div className="bg-white p-5 rounded-3xl shadow-sm border border-gray-100">
                  <p className="text-sm font-bold text-gray-900">Revenue only</p>
                  <p className="text-2xl font-bold text-gray-900 mt-2">{revenueOnlyRows}</p>
                </div>

                <div className="bg-white p-5 rounded-3xl shadow-sm border border-gray-100">
                  <p className="text-sm font-bold text-gray-900">Inválidas</p>
                  <p className="text-2xl font-bold text-gray-900 mt-2">{invalidRows}</p>
                </div>
              </div>

              <div className="bg-white rounded-3xl shadow-sm border border-gray-100 overflow-hidden">
                <div className="p-6 border-b border-gray-100 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <TableIcon size={20} className="text-gray-400" />
                    <h3 className="font-bold">Vista previa</h3>
                  </div>

                  <div className="text-xs text-gray-500">
                    Profile: <span className="font-bold text-gray-700">{dryRunResult.import_profile_code}</span>
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-[11px] text-left">
                    <thead className="bg-gray-50 text-gray-400 font-bold uppercase tracking-wider">
                      <tr>
                        {previewHeaders.map((header) => (
                          <th key={header} className="px-4 py-3 whitespace-nowrap">
                            {header}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {dryRunResult.preview.map((row, idx) => (
                        <tr key={idx} className="hover:bg-gray-50">
                          {previewHeaders.map((header) => (
                            <td key={header} className="px-4 py-2 text-gray-600 whitespace-nowrap">
                              {String(row[header] ?? "")}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {dryRunResult.errors.length > 0 && (
                <div className="bg-white rounded-3xl shadow-sm border border-gray-100 overflow-hidden">
                  <div className="p-6 border-b border-gray-100 flex items-center gap-3">
                    <AlertCircle size={20} className="text-rose-500" />
                    <h3 className="font-bold">Errores detectados</h3>
                  </div>

                  <div className="p-6 space-y-4">
                    {dryRunResult.errors.slice(0, 10).map((item, idx) => (
                      <div key={idx} className="rounded-2xl border border-rose-100 bg-rose-50 p-4">
                        <p className="text-sm font-bold text-rose-700">
                          Fila {item.row_number ?? "-"}
                        </p>
                        <ul className="mt-2 text-sm text-rose-700 list-disc pl-5">
                          {(item.errors ?? []).map((e, i) => (
                            <li key={i}>{e}</li>
                          ))}
                        </ul>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {dryRunResult.warnings.length > 0 && (
                <div className="bg-white rounded-3xl shadow-sm border border-gray-100 overflow-hidden">
                  <div className="p-6 border-b border-gray-100 flex items-center gap-3">
                    <Info size={20} className="text-amber-500" />
                    <h3 className="font-bold">Warnings detectados</h3>
                  </div>

                  <div className="p-6 space-y-4">
                    {dryRunResult.warnings.slice(0, 10).map((item, idx) => (
                      <div key={idx} className="rounded-2xl border border-amber-100 bg-amber-50 p-4">
                        <p className="text-sm font-bold text-amber-700">
                          Fila {item.row_number ?? "-"}{" "}
                          {item.reservation_key ? `· ${item.reservation_key}` : ""}
                        </p>
                        <ul className="mt-2 text-sm text-amber-700 list-disc pl-5">
                          {(item.warnings ?? []).map((w, i) => (
                            <li key={i}>{w}</li>
                          ))}
                        </ul>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}

          {commitResult && (
            <div className="bg-white p-6 rounded-3xl shadow-sm border border-gray-100">
              <div className="flex items-center gap-3 mb-4">
                <CheckCircle2 className="text-emerald-600" />
                <h3 className="font-bold text-lg">Importación completada</h3>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-4 gap-4 text-sm">
                <div className="rounded-2xl bg-gray-50 p-4">
                  <p className="text-gray-500">Batch ID</p>
                  <p className="font-bold text-gray-900 break-all">{commitResult.batch_id}</p>
                </div>

                <div className="rounded-2xl bg-gray-50 p-4">
                  <p className="text-gray-500">Property code</p>
                  <p className="font-bold text-gray-900">{commitResult.property_code}</p>
                </div>

                <div className="rounded-2xl bg-gray-50 p-4">
                  <p className="text-gray-500">Rows OK</p>
                  <p className="font-bold text-gray-900">{commitResult.rows_ok}</p>
                </div>

                <div className="rounded-2xl bg-gray-50 p-4">
                  <p className="text-gray-500">Rows error</p>
                  <p className="font-bold text-gray-900">{commitResult.rows_error}</p>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="space-y-6">
          <div className="bg-white p-6 rounded-3xl shadow-sm border border-gray-100">
            <div className="flex items-center gap-2 mb-6">
              <div className="bg-amber-100 p-2 rounded-lg text-amber-600">
                <Info size={20} />
              </div>
              <h3 className="font-bold">Importación real</h3>
            </div>

            <div className="space-y-3 text-sm text-gray-600">
              <p>No usa mock store.</p>
              <p>No usa datos ficticios en memoria.</p>
              <p>Valida e importa contra tu Edge Function real:</p>

              <code className="block bg-gray-100 rounded-xl px-3 py-2 text-xs text-blue-700">
                debacu_eval_csv_unified_import
              </code>
            </div>
          </div>

          <div className="bg-white p-6 rounded-3xl shadow-sm border border-gray-100">
            <div className="flex items-center gap-2 mb-4">
              <RefreshCcw size={18} className="text-gray-500" />
              <h4 className="font-bold">Estado actual</h4>
            </div>

            <div className="space-y-2 text-sm text-gray-600">
              <p>Revenue import: activo</p>
              <p>Snapshots: activos</p>
              <p>Stay nights: activos</p>
              <p>Screening: no activo todavía</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}