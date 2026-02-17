// src/pages/admin/AdminClientsPage.tsx
 
import React, { useEffect, useMemo, useRef, useState } from "react";

import { list_clients } from "@/services/adminService";
import { adminAccessRequests } from "@/services/debacu_eval_adminAccess.service";
import { supabase } from "@/services/supabase";
import { DataTable, Th, Tr, Td } from "@/components/ui/DataTable";

type ClientRow = {
  id: string;
  name?: string | null;
  email?: string | null;

  plan_id?: string | null;
  billing_frequency?: string | null;

  // extras (si list_clients los trae; si no, saldrá "—")
  phone?: string | null;
  country?: string | null;
  address?: string | null;
  city?: string | null;
  nif?: string | null;
  is_active?: boolean | null;

  last_login_at?: string | null;
};

type AccessRequestRow = {
  id: string;
  created_at: string;
  status: "PENDING" | "APPROVED" | "REJECTED";
  company_name: string | null;
  legal_name?: string | null;
  email: string | null;
  customer_id: string | null;

  reviewed_by?: string | null;
  reviewed_at?: string | null;
  decision_notes?: string | null;

  last_email_status?: string | null;
  last_email_at?: string | null;
  last_email_detail?: string | null;

  accepted_terms?: boolean | null;
  accepted_professional_use?: boolean | null;
  terms_version?: string | null;

  accepted_terms_pdf_path?: string | null;
  accepted_terms_pdf_bucket?: string | null;
  accepted_terms_pdf_sha256?: string | null;
  accepted_terms_accepted_at?: string | null;

  accepted_terms_ip?: string | null;
  accepted_terms_user_agent?: string | null;

  // extras del formulario
  cif?: string | null;
  property_type?: string | null;
  rooms_count?: number | null;
  contact_name?: string | null;
  contact_role?: string | null;
  phone?: string | null;
  notes?: string | null;

  address?: string | null;
  city?: string | null;
  country?: string | null;
  website?: string | null;
};

const cx = (...cls: Array<string | false | undefined | null>) => cls.filter(Boolean).join(" ");

function pillBase() {
  return "inline-flex items-center rounded-full px-2 py-1 text-[11px] font-semibold";
}
function statusPill(status?: string | null) {
  const base = pillBase();
  if (status === "APPROVED") return `${base} bg-emerald-100 text-emerald-700`;
  if (status === "REJECTED") return `${base} bg-rose-100 text-rose-700`;
  if (status === "PENDING") return `${base} bg-amber-100 text-amber-700`;
  return `${base} bg-slate-100 text-slate-600`;
}
function emailPill(status?: string | null) {
  const base = pillBase();
  if (status === "SENT") return `${base} bg-indigo-100 text-indigo-700`;
  if (status === "FAILED") return `${base} bg-rose-100 text-rose-700`;
  return `${base} bg-slate-100 text-slate-600`;
}
function termsPill(accepted?: boolean | null) {
  const base = pillBase();
  if (accepted) return `${base} bg-emerald-100 text-emerald-700`;
  return `${base} bg-slate-100 text-slate-600`;
}
function fmtDate(v?: string | null) {
  if (!v) return "—";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return v;
  return d.toLocaleString();
}

export default function AdminClientsPage() {
  const [clients, setClients] = useState<ClientRow[]>([]);
  const [requests, setRequests] = useState<AccessRequestRow[]>([]);
  const [loading, setLoading] = useState(false);

  const [detailOpen, setDetailOpen] = useState(false);
  const [selectedClient, setSelectedClient] = useState<ClientRow | null>(null);
  const [selectedReq, setSelectedReq] = useState<AccessRequestRow | null>(null);

  const [pdfBusy, setPdfBusy] = useState(false);
  const didLoad = useRef(false);


  useEffect(() => {
    if (didLoad.current) return;
       didLoad.current = true;

    void (async () => {
      setLoading(true);
      try {
        // 1) clientes
        const data = await list_clients();
        setClients((data ?? []) as ClientRow[]);

        // 2) solicitudes (todas) para mapear por customer_id o email
        const res = await adminAccessRequests("LIST", { status: "ALL", limit: 2000 });
        setRequests(((res as any)?.data ?? []) as AccessRequestRow[]);
      } catch (e: any) {
        alert(e?.message ?? "Error cargando clientes/solicitudes");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const requestByCustomerId = useMemo(() => {
    const m = new Map<string, AccessRequestRow>();
    for (const r of requests) {
      if (!r.customer_id) continue;
      const prev = m.get(r.customer_id);
      if (!prev) m.set(r.customer_id, r);
      else {
        const a = new Date(prev.created_at).getTime();
        const b = new Date(r.created_at).getTime();
        if (b > a) m.set(r.customer_id, r);
      }
    }
    return m;
  }, [requests]);

  const requestByEmail = useMemo(() => {
    const m = new Map<string, AccessRequestRow>();
    for (const r of requests) {
      const e = (r.email ?? "").trim().toLowerCase();
      if (!e) continue;
      const prev = m.get(e);
      if (!prev) m.set(e, r);
      else {
        const a = new Date(prev.created_at).getTime();
        const b = new Date(r.created_at).getTime();
        if (b > a) m.set(e, r);
      }
    }
    return m;
  }, [requests]);

  function getLatestRequestForClient(c: ClientRow): AccessRequestRow | null {
    if (c.id && requestByCustomerId.has(c.id)) return requestByCustomerId.get(c.id)!;

    const e = (c.email ?? "").trim().toLowerCase();
    if (e && requestByEmail.has(e)) return requestByEmail.get(e)!;

    return null;
  }

  function openDetail(c: ClientRow) {
    const r = getLatestRequestForClient(c);
    setSelectedClient(c);
    setSelectedReq(r);
    setDetailOpen(true);
  }

  async function openPdf(req: AccessRequestRow) {
  if (!req?.id) return;

  try {
    setPdfBusy(true);

    // llama a Edge Function admin_get_signed_legal_acceptance_url
    const { data, error } = await supabase.functions.invoke(
      "admin_get_signed_legal_acceptance_url",
      {
        body: { request_id: req.id, expires_in: 60 * 15 },
      }
    );

    if (error) throw error;
    if (!data?.signed_url) throw new Error("No signed_url returned");

    window.open(data.signed_url, "_blank", "noopener,noreferrer");
  } catch (e: any) {
    alert(e?.message ?? "No se pudo abrir el PDF.");
  } finally {
    setPdfBusy(false);
  }
}

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Clientes</h1>
          <p className="text-sm text-slate-600">Vista de clientes + solicitud + legal (aceptación de condiciones).</p>
        </div>

        <div className="text-sm text-slate-600">{loading ? "Cargando..." : `${clients.length} clientes`}</div>
      </div>

      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <DataTable>
          <thead>
            <tr>
              <Th>Organización</Th>
              <Th>Email</Th>
              <Th>Plan</Th>
              <Th>Estado</Th>
              <Th>Condiciones</Th>
              <Th>Credenciales</Th>
              <Th>Último acceso</Th>

              {/* 👇 IMPORTANTE: tu <Th> NO acepta className, así que el último lo hacemos nativo */}
              <th className="bg-slate-50 px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-slate-600">
                Acción
              </th>
            </tr>
          </thead>

          <tbody>
            {clients.map((client) => {
              const req = getLatestRequestForClient(client);

              return (
                <Tr key={client.id}>
                  <Td>
                    <div className="min-w-0">
                      <div className="font-semibold text-slate-900 truncate">{client.name ?? "Sin nombre"}</div>

                      {req?.status ? (
                        <div className="mt-1 flex items-center gap-2">
                          <span className={statusPill(req.status)}>
                            {req.status === "PENDING"
                              ? "Solicitud: Pendiente"
                              : req.status === "APPROVED"
                                ? "Solicitud: Aprobada"
                                : "Solicitud: Rechazada"}
                          </span>
                          <span className="text-xs text-slate-500">{fmtDate(req.created_at)}</span>
                        </div>
                      ) : (
                        <div className="mt-1 text-xs text-slate-500">Sin solicitud</div>
                      )}
                    </div>
                  </Td>

                  <Td className="text-slate-700">{client.email ?? "-"}</Td>

                  <Td>
                    <div className="text-slate-800">{(client as any).plan_name ?? client.plan_id ?? "-"}</div>

                    <div className="text-xs text-slate-500">{client.billing_frequency ?? "—"}</div>
                  </Td>

                  <Td>
                    <span className={pillBase() + " bg-slate-100 text-slate-600"}>
                      {typeof client.is_active === "boolean" ? (client.is_active ? "Activo" : "Inactivo") : "—"}
                    </span>
                  </Td>

                  <Td>
                    <span className={termsPill(req?.accepted_terms)}>{req?.accepted_terms ? "Aceptado" : "Sin aceptar"}</span>
                    <div className="mt-1 text-xs text-slate-500">{req?.terms_version ? `v ${req.terms_version}` : "—"}</div>
                  </Td>

                  <Td>
                    <span className={emailPill(req?.last_email_status)}>
                      {req?.last_email_status ? `Email: ${req.last_email_status}` : "Email: —"}
                    </span>
                    <div className="mt-1 text-xs text-slate-500">{req?.last_email_at ? fmtDate(req.last_email_at) : "—"}</div>
                  </Td>

                  <Td className="text-slate-700">{client.last_login_at ? fmtDate(client.last_login_at) : "—"}</Td>

                  <Td className="text-right">
                    <button
                      onClick={() => openDetail(client)}
                      className="text-indigo-600 hover:text-indigo-700 text-sm font-semibold"
                    >
                      Detalle
                    </button>
                  </Td>
                </Tr>
              );
            })}
          </tbody>
        </DataTable>
      </section>

      {/* =======================
          MODAL DETALLE (scroll + X + footer)
         ======================= */}
      {detailOpen && selectedClient && (
        <div className="fixed inset-0 z-50">
          {/* Backdrop */}
          <div className="absolute inset-0 bg-black/40" onClick={() => setDetailOpen(false)} aria-hidden="true" />

          {/* Panel */}
          <div className="absolute inset-0 flex items-center justify-center p-4">
            <div className="w-full max-w-3xl rounded-2xl bg-white shadow-xl ring-1 ring-slate-200">
              {/* HEADER fijo */}
              <div className="flex items-start justify-between gap-3 border-b border-slate-200 p-5">
                <div className="min-w-0">
                  <div className="text-lg font-bold text-slate-900 truncate">{selectedClient.name ?? "Cliente"}</div>
                  <div className="text-sm text-slate-600 truncate">{selectedClient.email ?? "—"}</div>
                </div>

                <button
                  type="button"
                  onClick={() => setDetailOpen(false)}
                  className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 text-slate-700 hover:bg-slate-50"
                  aria-label="Cerrar"
                  title="Cerrar"
                >
                  ✕
                </button>
              </div>

              {/* BODY con scroll */}
              <div className="max-h-[75vh] overflow-y-auto p-5 space-y-6">
                {/* DATOS CLIENTE */}
                <section className="rounded-xl border border-slate-200 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-sm font-bold text-slate-900">Datos del cliente</div>

                    {selectedReq?.accepted_terms ? (
                      <span className="inline-flex items-center rounded-full px-2 py-1 text-[11px] font-semibold bg-emerald-100 text-emerald-700">
                        Aceptado condiciones
                      </span>
                    ) : selectedReq ? (
                      <span className="inline-flex items-center rounded-full px-2 py-1 text-[11px] font-semibold bg-slate-100 text-slate-600">
                        Sin aceptar
                      </span>
                    ) : (
                      <span className="inline-flex items-center rounded-full px-2 py-1 text-[11px] font-semibold bg-slate-100 text-slate-600">
                        Sin solicitud
                      </span>
                    )}
                  </div>

                  <div className="mt-3 grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
                    <div>
                      <div className="text-xs text-slate-500">Plan</div>
                      <div className="font-semibold text-slate-800">{selectedClient.plan_id ?? "—"}</div>
                    </div>

                    <div>
                      <div className="text-xs text-slate-500">Frecuencia</div>
                      <div className="font-semibold text-slate-800">{selectedClient.billing_frequency ?? "—"}</div>
                    </div>

                    <div>
                      <div className="text-xs text-slate-500">Customer ID</div>
                      <div className="font-mono text-xs text-slate-700 break-all">{selectedClient.id ?? "—"}</div>
                    </div>
                  </div>

                  <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                    <div>
                      <div className="text-xs text-slate-500">Teléfono</div>
                      <div className="font-semibold text-slate-800">{selectedClient.phone ?? "—"}</div>
                    </div>

                    <div>
                      <div className="text-xs text-slate-500">País</div>
                      <div className="font-semibold text-slate-800">{selectedClient.country ?? "—"}</div>
                    </div>

                    <div className="md:col-span-2">
                      <div className="text-xs text-slate-500">Dirección</div>
                      <div className="font-semibold text-slate-800">
                        {selectedClient.address ?? "—"}
                        {selectedClient.city ? ` · ${selectedClient.city}` : ""}
                      </div>
                    </div>

                    <div>
                      <div className="text-xs text-slate-500">NIF/CIF</div>
                      <div className="font-semibold text-slate-800">{selectedClient.nif ?? "—"}</div>
                    </div>

                    <div>
                      <div className="text-xs text-slate-500">Activo</div>
                      <div className="font-semibold text-slate-800">
                        {typeof selectedClient.is_active === "boolean" ? (selectedClient.is_active ? "Sí" : "No") : "—"}
                      </div>
                    </div>
                  </div>
                </section>

                {/* SOLICITUD */}
                <section className="rounded-xl border border-slate-200 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-sm font-bold text-slate-900">Solicitud de acceso</div>
                    <span className={statusPill(selectedReq?.status ?? null)}>{selectedReq?.status ?? "SIN SOLICITUD"}</span>
                  </div>

                  {!selectedReq ? (
                    <div className="mt-3 text-sm text-slate-600">Este cliente no tiene solicitud asociada.</div>
                  ) : (
                    <>
                      <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                        <div>
                          <div className="text-xs text-slate-500">Fecha solicitud</div>
                          <div className="font-semibold text-slate-800">{fmtDate(selectedReq.created_at)}</div>
                        </div>

                        <div>
                          <div className="text-xs text-slate-500">CIF</div>
                          <div className="font-semibold text-slate-800">{selectedReq.cif ?? "—"}</div>
                        </div>

                        <div>
                          <div className="text-xs text-slate-500">Tipo / Habitaciones</div>
                          <div className="font-semibold text-slate-800">
                            {selectedReq.property_type ?? "—"} {selectedReq.rooms_count ? `· ${selectedReq.rooms_count}` : ""}
                          </div>
                        </div>

                        <div>
                          <div className="text-xs text-slate-500">Contacto</div>
                          <div className="font-semibold text-slate-800">
                            {selectedReq.contact_name ?? "—"} {selectedReq.contact_role ? `(${selectedReq.contact_role})` : ""}
                          </div>
                        </div>

                        <div className="md:col-span-2">
                          <div className="text-xs text-slate-500">Empresa / Razón social</div>
                          <div className="font-semibold text-slate-800">
                            {selectedReq.company_name ?? "—"}
                            {selectedReq.legal_name ? ` · ${selectedReq.legal_name}` : ""}
                          </div>
                        </div>

                        <div className="md:col-span-2">
                          <div className="text-xs text-slate-500">Dirección</div>
                          <div className="font-semibold text-slate-800">
                            {selectedReq.address ?? "—"}
                            {selectedReq.city ? ` · ${selectedReq.city}` : ""}
                            {selectedReq.country ? ` · ${selectedReq.country}` : ""}
                          </div>
                        </div>

                        <div>
                          <div className="text-xs text-slate-500">Teléfono</div>
                          <div className="font-semibold text-slate-800">{selectedReq.phone ?? "—"}</div>
                        </div>

                        <div>
                          <div className="text-xs text-slate-500">Web</div>
                          <div className="font-semibold text-slate-800 break-all">{selectedReq.website ?? "—"}</div>
                        </div>
                      </div>

                      <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                        <div className="rounded-xl bg-slate-50 p-3">
                          <div className="text-xs text-slate-500">Decisión admin</div>
                          <div className="mt-1 text-sm text-slate-800">
                            <div>
                              <span className="font-semibold">Revisado:</span>{" "}
                              {selectedReq.reviewed_at ? fmtDate(selectedReq.reviewed_at) : "—"}
                            </div>
                            <div className="mt-1">
                              <span className="font-semibold">Notas:</span> {selectedReq.decision_notes ?? "—"}
                            </div>
                            <div className="mt-1">
                              <span className="font-semibold">Reviewed by:</span>{" "}
                              <span className="font-mono text-xs break-all">{selectedReq.reviewed_by ?? "—"}</span>
                            </div>
                          </div>
                        </div>

                        <div className="rounded-xl bg-slate-50 p-3">
                          <div className="text-xs text-slate-500">Envío credenciales</div>
                          <div className="mt-1 text-sm text-slate-800">
                            <div>
                              <span className="font-semibold">Estado:</span> {selectedReq.last_email_status ?? "—"}
                            </div>
                            <div className="mt-1">
                              <span className="font-semibold">Fecha:</span>{" "}
                              {selectedReq.last_email_at ? fmtDate(selectedReq.last_email_at) : "—"}
                            </div>
                            <div className="mt-1">
                              <span className="font-semibold">Detalle:</span>{" "}
                              <span className="break-words">{selectedReq.last_email_detail ?? "—"}</span>
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* LEGAL */}
                      <div className="mt-4 rounded-xl border border-slate-200 p-4">
                        <div className="flex items-center justify-between gap-3">
                          <div className="text-sm font-bold text-slate-900">Aceptación de condiciones</div>
                          <span className={termsPill(selectedReq.accepted_terms)}>
                            {selectedReq.accepted_terms ? "Aceptado" : "No"}
                          </span>
                        </div>

                        <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                          <div>
                            <div className="text-xs text-slate-500">Fecha aceptación</div>
                            <div className="font-semibold text-slate-800">
                              {selectedReq.accepted_terms_accepted_at ? fmtDate(selectedReq.accepted_terms_accepted_at) : "—"}
                            </div>
                          </div>

                          <div>
                            <div className="text-xs text-slate-500">Versión términos</div>
                            <div className="font-semibold text-slate-800">{selectedReq.terms_version ?? "—"}</div>
                          </div>

                          <div className="md:col-span-2">
                            <div className="text-xs text-slate-500">SHA256</div>
                            <div className="font-mono text-xs text-slate-700 break-all">
                              {selectedReq.accepted_terms_pdf_sha256 ?? "—"}
                            </div>
                          </div>

                          <div className="md:col-span-2">
                            <div className="text-xs text-slate-500">IP / User-Agent</div>
                            <div className="text-xs text-slate-700 break-words">
                              {selectedReq.accepted_terms_ip ?? "—"}
                              <div className="mt-1 text-[11px] text-slate-500 break-words">
                                {selectedReq.accepted_terms_user_agent ?? "—"}
                              </div>
                            </div>
                          </div>

                          <div className="md:col-span-2">
                            <div className="text-xs text-slate-500">Uso profesional aceptado</div>
                            <div className="font-semibold text-slate-800">
                              {typeof selectedReq.accepted_professional_use === "boolean"
                                ? selectedReq.accepted_professional_use
                                  ? "Sí"
                                  : "No"
                                : "—"}
                            </div>
                          </div>
                        </div>

                        <div className="mt-4 flex items-center justify-between gap-3">
                          <div className="text-xs text-slate-500 break-all">
                            <span className="font-semibold">PDF:</span>{" "}
                            {selectedReq.accepted_terms_pdf_bucket || "debacu_legal_acceptances"} /{" "}
                            {selectedReq.accepted_terms_pdf_path ?? "—"}
                          </div>

                          <button
                            disabled={pdfBusy || !selectedReq.accepted_terms_pdf_path}
                            onClick={() => openPdf(selectedReq)}
                            className={cx(
                              "shrink-0 rounded-xl px-4 py-2 text-sm font-semibold",
                              pdfBusy || !selectedReq.accepted_terms_pdf_path
                                ? "bg-slate-200 text-slate-500"
                                : "bg-slate-900 text-white hover:bg-slate-800"
                            )}
                            title={selectedReq.accepted_terms_pdf_path ? "Abrir justificante" : "No hay PDF de aceptación"}
                          >
                            {pdfBusy ? "Abriendo..." : "Ver PDF"}
                          </button>
                        </div>

                        <div className="mt-3 text-[11px] text-slate-500">
                          Si el bucket es privado y tu sesión no tiene permisos, lo profesional es una Edge Function <b>admin</b> que genere una
                          signed_url (15 min) sin tocar el resto del flujo.
                        </div>
                      </div>
                    </>
                  )}
                </section>
              </div>

              {/* FOOTER fijo */}
              <div className="flex items-center justify-end gap-2 border-t border-slate-200 p-4">
                <button
                  type="button"
                  onClick={() => setDetailOpen(false)}
                  className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Cerrar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
