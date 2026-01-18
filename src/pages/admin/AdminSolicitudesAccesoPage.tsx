import React, { useEffect, useState } from "react";
import { adminAccessRequests } from "@/services/debacu_eval_adminAccess.service";

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
};

export function AdminSolicitudesAccesoPage() {
  const [status, setStatus] = useState<"PENDING" | "APPROVED" | "REJECTED" | "ALL">("PENDING");
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const res = await adminAccessRequests("LIST", { status, limit: 100 });
      setRows((res?.data ?? []) as Row[]);
    } catch (e: any) {
      alert(e?.message ?? "Error cargando solicitudes");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, [status]);

  const approve = async (id: string) => {
    const notes = window.prompt("Notas (opcional):") ?? "";
    setBusyId(id);
    try {
      await adminAccessRequests("APPROVE", { requestId: id, decisionNotes: notes });
      await load();
    } catch (e: any) {
      alert(e?.message ?? "Error aprobando");
    } finally {
      setBusyId(null);
    }
  };

  const reject = async (id: string) => {
    const notes = window.prompt("Motivo de rechazo (opcional):") ?? "";
    setBusyId(id);
    try {
      await adminAccessRequests("REJECT", { requestId: id, decisionNotes: notes });
      await load();
    } catch (e: any) {
      alert(e?.message ?? "Error rechazando");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="max-w-6xl mx-auto px-4 py-10">
      <div className="flex items-end justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Solicitudes de acceso</h1>
          <p className="text-slate-600">Aprobar envía invitación por email (Supabase Auth).</p>
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

          <button
            onClick={load}
            className="px-4 py-2 rounded-lg bg-slate-900 text-white text-sm"
          >
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
                <div className="font-semibold text-slate-900">{r.company_name}</div>
                <div className="text-xs text-slate-500">
                  {r.property_type} {r.rooms_count ? `· ${r.rooms_count} hab` : ""}
                </div>
              </div>
              <div className="col-span-2 font-mono text-xs">{r.cif}</div>
              <div className="col-span-2">{r.contact_name}</div>
              <div className="col-span-2 text-slate-600">{r.email}</div>

              <div className="col-span-1 flex justify-end gap-2">
                {r.status === "PENDING" ? (
                  <>
                    <button
                      disabled={busyId === r.id}
                      onClick={() => approve(r.id)}
                      className="px-2 py-1 rounded bg-green-600 text-white text-xs disabled:opacity-50"
                    >
                      Aprobar
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
                  <span
                    className={`text-[11px] px-2 py-1 rounded-full ${
                      r.status === "APPROVED" ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"
                    }`}
                  >
                    {r.status}
                  </span>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
