import React, { useEffect, useState } from "react";
import { adminAccessRequests } from "@/services/debacu_eval_adminAccess.service";
import { supabase } from "@/services/supabase";

type Row = {
  id: string;
  created_at: string;
  status: "PENDING" | "APPROVED" | "REJECTED";
  company_name: string;
  cif: string;
  property_type: string;
  rooms_count: number | null;
  contact_name: string;
  email: string;
  phone: string | null;
  notes: string | null;

  reviewed_by?: string | null;
  reviewed_at?: string | null;
  decision_notes?: string | null;
  customer_id?: string | null;
  org_id?: string | null;

  last_email_status?: string | null; // SENT / FAILED
  last_email_at?: string | null;
  last_email_detail?: string | null;
};

type ApproveResult = {
  ok?: boolean;
  customer_id?: string;
  org_id?: string;
  email_sent?: boolean;
  email_detail?: string | null;
};

export function AdminSolicitudesAccesoPage() {
  const [status, setStatus] = useState<"PENDING" | "APPROVED" | "REJECTED" | "ALL">("PENDING");
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const [adminUserId, setAdminUserId] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      setAdminUserId(data?.user?.id ?? null);
    })();
  }, []);

  const load = async () => {
    setLoading(true);
    try {
      const params: any = { limit: 100 };
      if (status !== "ALL") params.status = status;

      const res = await adminAccessRequests("LIST", params);
      setRows((res?.data ?? []) as Row[]);
    } catch (e: any) {
      alert(e?.message ?? "Error cargando solicitudes");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  const approve = async (id: string) => {
    const notes = window.prompt("Notas (opcional):") ?? "";
    const siteUrl = window.location.origin; // ✅ clave: local/prod dinámico

    setBusyId(id);
    try {
      const res = (await adminAccessRequests("APPROVE", {
        requestId: id,
        decisionNotes: notes,
        reviewedBy: adminUserId,
        siteUrl,
        sendEmail: true, // ✅ dispara inviteUserByEmail
      })) as ApproveResult;

      if (res?.email_sent === false) {
        alert(res?.email_detail ?? "No se pudo enviar el email de invitación (Supabase).");
      } else {
        alert("Aprobado. Email de activación enviado por Supabase.");
      }

      await load();
    } catch (e: any) {
      alert(e?.message ?? "Error aprobando");
    } finally {
      setBusyId(null);
    }
  };

  const resend = async (id: string) => {
    const siteUrl = window.location.origin;

    setBusyId(id);
    try {
      const res = (await adminAccessRequests("RESEND", {
        requestId: id,
        reviewedBy: adminUserId,
        siteUrl,
        sendEmail: true,
      })) as ApproveResult;

      if (res?.email_sent === false) {
        alert(res?.email_detail ?? "No se pudo reenviar el email de invitación.");
      } else {
        alert("Reenvío lanzado. Email de activación enviado por Supabase.");
      }

      await load();
    } catch (e: any) {
      alert(e?.message ?? "Error reenviando");
    } finally {
      setBusyId(null);
    }
  };

  const reject = async (id: string) => {
    const notes = window.prompt("Motivo de rechazo (opcional):") ?? "";
    setBusyId(id);
    try {
      await adminAccessRequests("REJECT", {
        requestId: id,
        decisionNotes: notes,
        reviewedBy: adminUserId,
      });
      await load();
    } catch (e: any) {
      alert(e?.message ?? "Error rechazando");
    } finally {
      setBusyId(null);
    }
  };

  const statusPill = (s: Row["status"]) => {
    const base = "text-[11px] px-2 py-1 rounded-full font-semibold";
    if (s === "APPROVED") return `${base} bg-green-100 text-green-700`;
    if (s === "REJECTED") return `${base} bg-red-100 text-red-700`;
    return `${base} bg-amber-100 text-amber-700`;
  };

  const emailPill = (s?: string | null) => {
    if (!s) return "text-[11px] px-2 py-1 rounded-full bg-slate-100 text-slate-600 font-semibold";
    const base = "text-[11px] px-2 py-1 rounded-full font-semibold";
    if (s === "SENT") return `${base} bg-indigo-100 text-indigo-700`;
    if (s === "FAILED") return `${base} bg-red-100 text-red-700`;
    return `${base} bg-slate-100 text-slate-600`;
  };

  return (
    <div className="max-w-6xl mx-auto px-4 py-10">
      <div className="flex items-end justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Solicitudes de acceso</h1>
          <p className="text-slate-600">
            Aprobar crea el hotel (org) y envía un email automático de Supabase para activar la cuenta.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <select
            className="border rounded-lg px-3 py-2 text-sm"
            value={status}
            onChange={(e) => setStatus(e.target.value as any)}
          >
            <option value="PENDING">Pendientes</option>
            <option value="APPROVED">Aprobadas</option>
            <option value="REJECTED">Rechazadas</option>
            <option value="ALL">Todas</option>
          </select>

          <button onClick={load} className="px-4 py-2 rounded-lg bg-slate-900 text-white text-sm">
            {loading ? "Cargando..." : "Actualizar"}
          </button>
        </div>
      </div>

      <div className="bg-white border rounded-xl overflow-hidden">
        <div className="grid grid-cols-12 gap-2 px-4 py-3 text-xs font-semibold text-slate-600 bg-slate-50 border-b">
          <div className="col-span-2">Fecha</div>
          <div className="col-span-3">Empresa</div>
          <div className="col-span-2">CIF</div>
          <div className="col-span-2">Responsable</div>
          <div className="col-span-2">Email</div>
          <div className="col-span-1 text-right">Acción</div>
        </div>

        {rows.length === 0 ? (
          <div className="p-6 text-sm text-slate-500">No hay registros</div>
        ) : (
          rows.map((r) => (
            <div key={r.id} className="grid grid-cols-12 gap-2 px-4 py-3 border-b text-sm items-center">
              <div className="col-span-2 text-slate-600">{new Date(r.created_at).toLocaleString()}</div>

              <div className="col-span-3">
                <div className="font-semibold text-slate-900 flex items-center gap-2">
                  {r.company_name}
                  <span className={statusPill(r.status)}>
                    {r.status === "PENDING" ? "Pendiente" : r.status === "APPROVED" ? "Aprobada" : "Rechazada"}
                  </span>
                </div>

                <div className="text-xs text-slate-500 flex items-center gap-2 mt-1">
                  <span>
                    {r.property_type} {r.rooms_count ? `· ${r.rooms_count} hab` : ""}
                  </span>

                  <span className={emailPill(r.last_email_status)}>
                    {r.last_email_status ? `Email: ${r.last_email_status}` : "Email: —"}
                  </span>

                  {r.last_email_at ? (
                    <span className="text-[11px] text-slate-400">{new Date(r.last_email_at).toLocaleString()}</span>
                  ) : null}
                </div>

                {r.last_email_detail ? (
                  <div className="text-[11px] text-slate-400 mt-1 truncate" title={r.last_email_detail}>
                    {r.last_email_detail}
                  </div>
                ) : null}
              </div>

              <div className="col-span-2 font-mono text-xs">{r.cif}</div>
              <div className="col-span-2">{r.contact_name}</div>
              <div className="col-span-2 text-slate-600 truncate">{r.email}</div>

              <div className="col-span-1 flex justify-end gap-2">
                {r.status === "PENDING" ? (
                  <>
                    <button
                      disabled={busyId === r.id}
                      onClick={() => approve(r.id)}
                      className="px-2 py-1 rounded bg-green-600 text-white text-xs disabled:opacity-50"
                    >
                      {busyId === r.id ? "..." : "Aprobar"}
                    </button>
                    <button
                      disabled={busyId === r.id}
                      onClick={() => reject(r.id)}
                      className="px-2 py-1 rounded bg-red-600 text-white text-xs disabled:opacity-50"
                    >
                      Rechazar
                    </button>
                  </>
                ) : (
                  <>
                    {r.status === "APPROVED" ? (
                      <button
                        disabled={busyId === r.id}
                        onClick={() => resend(r.id)}
                        className="px-2 py-1 rounded bg-indigo-600 text-white text-xs disabled:opacity-50"
                        title="Reenviar email de activación"
                      >
                        {busyId === r.id ? "..." : "Reenviar"}
                      </button>
                    ) : null}

                    <span className={statusPill(r.status)}>{r.status}</span>
                  </>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
