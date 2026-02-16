// src/components/account/Seguridad.tsx
import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "@/services/supabaseClient";
import type { User } from "@/types/types";
import {
  Eye,
  EyeOff,
  Users,
  UserPlus,
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
  Mail,
  Shield,
  Trash2,
  PauseCircle,
  PlayCircle,
  Send,
  X,
} from "lucide-react";

import {
  org_members_list,
  org_members_invite,
  org_members_update,
} from "@/services/securityService";

type MemberRole = "OWNER" | "ADMIN" | "STAFF";
type MemberStatus = "ACTIVE" | "INVITED" | "SUSPENDED";

type OrgMemberRow = {
  id: string;
  created_at: string;
  role: MemberRole;
  status: MemberStatus;
  invited_email: string | null;
  user_id: string | null;

  // opcional si tu Edge ya lo resuelve (email del auth user)
  email?: string | null;
};

type Entitlements = {
  org_id?: string;
  customer_id?: string;

  plan_code?: string | null;
  subscription_status?: string | null;

  max_users?: number | null;
  extra_seats?: number | null;

  seats_total?: number | null;
  seats_used?: number | null;
  seats_available?: number | null;
};

function clsx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

function formatDate(iso: string) {
  try {
    const d = new Date(iso);
    return d.toLocaleString("es-ES", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function statusPill(status: MemberStatus) {
  switch (status) {
    case "ACTIVE":
      return "bg-emerald-50 text-emerald-700 ring-emerald-200";
    case "INVITED":
      return "bg-amber-50 text-amber-700 ring-amber-200";
    case "SUSPENDED":
      return "bg-slate-100 text-slate-700 ring-slate-200";
  }
}

function rolePill(role: MemberRole) {
  switch (role) {
    case "OWNER":
      return "bg-indigo-50 text-indigo-700 ring-indigo-200";
    case "ADMIN":
      return "bg-sky-50 text-sky-700 ring-sky-200";
    case "STAFF":
      return "bg-slate-50 text-slate-700 ring-slate-200";
  }
}

function isOwnerOrAdmin(role?: string | null) {
  const r = (role ?? "").toUpperCase();
  return r === "OWNER" || r === "ADMIN";
}

/** Mapea errores backend a mensajes humanos (sin azúcar) */
function humanizeError(err: unknown) {
  const raw = err instanceof Error ? err.message : String(err ?? "");
  const msg = raw || "Error desconocido.";

  // patrones típicos
  if (msg.includes("UNAUTHENTICATED")) return "Sesión no válida. Vuelve a iniciar sesión.";
  if (msg.includes("FORBIDDEN") || msg.includes("NOT_ALLOWED") || msg.includes("INSUFFICIENT_ROLE"))
    return "No tienes permisos para gestionar usuarios (solo OWNER/ADMIN).";

  if (msg.includes("PLAN_NOT_ACTIVE") || msg.includes("SUBSCRIPTION_NOT_ACTIVE"))
    return "Tu suscripción no está activa. No se pueden gestionar usuarios hasta reactivar el plan.";

  if (msg.includes("SEATS_EXCEEDED") || msg.includes("NO_SEATS") || msg.includes("SEATS_AVAILABLE_0"))
    return "No hay plazas disponibles en tu plan. Sube de plan o añade seats extra.";

  if (msg.includes("ALREADY_MEMBER") || msg.includes("DUPLICATE"))
    return "Ese usuario/email ya está en tu organización (activo o invitado).";

  if (msg.includes("INVALID_ROLE")) return "Rol inválido. Usa STAFF o ADMIN.";
  if (msg.includes("INVALID_EMAIL")) return "Email inválido.";

  // fallback (sin filtrar demasiado para no ocultar diagnósticos)
  return msg;
}

export const Seguridad: React.FC<{ user: User }> = ({ user }) => {
  // --------------------------
  // Password
  // --------------------------
  const [changing, setChanging] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [newPassword, setNewPassword] = useState("");

  const change = async () => {
    if (!newPassword || newPassword.length < 8) {
      setMsg("La nueva contraseña debe tener al menos 8 caracteres.");
      return;
    }
    setChanging(true);
    setMsg(null);
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;
      setMsg("Contraseña actualizada.");
      setNewPassword("");
    } catch (e) {
      console.error(e);
      setMsg("No se pudo actualizar la contraseña.");
    } finally {
      setChanging(false);
    }
  };

  // --------------------------
  // Users / Seats
  // --------------------------
  const [membersLoading, setMembersLoading] = useState(false);
  const [membersError, setMembersError] = useState<string | null>(null);
  const [members, setMembers] = useState<OrgMemberRow[]>([]);
  const [ent, setEnt] = useState<Entitlements | null>(null);

  const [actionBusyId, setActionBusyId] = useState<string | null>(null);
  const [uiNotice, setUiNotice] = useState<string | null>(null);

  // Invite modal
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteBusy, setInviteBusy] = useState(false);
  const [inviteErr, setInviteErr] = useState<string | null>(null);

  const [invFirstName, setInvFirstName] = useState("");
  const [invLastName, setInvLastName] = useState("");
  const [invTitle, setInvTitle] = useState("");
  const [invPhone, setInvPhone] = useState("");
  const [invEmail, setInvEmail] = useState("");
  const [invRole, setInvRole] = useState<Exclude<MemberRole, "OWNER">>("STAFF");

  const seatsUsed = ent?.seats_used ?? null;
  const seatsTotal = ent?.seats_total ?? null;
  const seatsAvailable = ent?.seats_available ?? (seatsUsed != null && seatsTotal != null ? seatsTotal - seatsUsed : null);

  const subscriptionStatus = ent?.subscription_status ?? null;
  const planCode = ent?.plan_code ?? null;

  const canInvite = useMemo(() => {
    // UI solo “sugiere”; backend manda.
    if (!subscriptionStatus) return false;
    if (String(subscriptionStatus).toUpperCase() !== "ACTIVE") return false;
    if (seatsAvailable == null) return true; // si no lo tenemos, dejamos que backend enforze
    return seatsAvailable > 0;
  }, [subscriptionStatus, seatsAvailable]);

  const loadMembers = async () => {
    setMembersLoading(true);
    setMembersError(null);
    setUiNotice(null);
    try {
      const res: any = await org_members_list();
      // Esperado:
      // { ok: true, data: { members: [...], entitlements: {...} } }
      const data = res?.data ?? res;
      const rows: OrgMemberRow[] = Array.isArray(data?.members) ? data.members : Array.isArray(data) ? data : [];
      const entitlements: Entitlements | null = data?.entitlements ?? data?.entitlement ?? null;

      setMembers(rows);
      setEnt(entitlements);
    } catch (e) {
      console.error(e);
      setMembersError(humanizeError(e));
    } finally {
      setMembersLoading(false);
    }
  };

  useEffect(() => {
    void loadMembers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const resetInviteForm = () => {
    setInvFirstName("");
    setInvLastName("");
    setInvTitle("");
    setInvPhone("");
    setInvEmail("");
    setInvRole("STAFF");
    setInviteErr(null);
  };

  const openInvite = () => {
    setInviteOpen(true);
    setUiNotice(null);
    setInviteErr(null);
    // no reseteo automáticamente si estás reintentando; pero en apertura limpia:
    resetInviteForm();
  };

  const closeInvite = () => {
    if (inviteBusy) return;
    setInviteOpen(false);
  };

  const submitInvite = async () => {
    const email = invEmail.trim().toLowerCase();
    if (!email || !email.includes("@")) {
      setInviteErr("Email inválido.");
      return;
    }

    setInviteBusy(true);
    setInviteErr(null);
    setUiNotice(null);

    try {
      // Backend manda (seat limit + subscription ACTIVE + rol válido)
      await org_members_invite({
        email,
        role: invRole,
        // campos extra: si tu Edge no los usa aún, los ignora
        firstName: invFirstName.trim() || undefined,
        lastName: invLastName.trim() || undefined,
        title: invTitle.trim() || undefined,
        phone: invPhone.trim() || undefined,
      } as any);

      setInviteOpen(false);
      setUiNotice("Invitación enviada. El usuario quedará como INVITED hasta que acepte.");
      await loadMembers();
    } catch (e) {
      console.error(e);
      setInviteErr(humanizeError(e));
    } finally {
      setInviteBusy(false);
    }
  };

  const doAction = async (member: OrgMemberRow, action: "SUSPEND" | "REACTIVATE" | "REMOVE" | "RESEND_INVITE") => {
    setActionBusyId(member.id);
    setMembersError(null);
    setUiNotice(null);
    try {
      await org_members_update({ action, member_id: member.id } as any);
      const verb =
        action === "SUSPEND"
          ? "Usuario suspendido."
          : action === "REACTIVATE"
            ? "Usuario reactivado."
            : action === "REMOVE"
              ? "Usuario eliminado."
              : "Invitación reenviada.";
      setUiNotice(verb);
      await loadMembers();
    } catch (e) {
      console.error(e);
      setMembersError(humanizeError(e));
    } finally {
      setActionBusyId(null);
    }
  };

  // --------------------------
  // Render
  // --------------------------
  return (
    <section className="bg-white border border-slate-200 rounded-2xl shadow-sm">
      <div className="p-6 space-y-6">
        {/* Header */}
        <div>
          <h3 className="text-lg font-semibold text-slate-900">Seguridad</h3>
          <p className="text-xs text-slate-500">
            Contraseña, permisos y gestión de usuarios (multiusuario por plan).
          </p>
        </div>

        {/* Password */}
        <div className="rounded-2xl border border-slate-200 bg-white">
          <div className="p-4 md:p-5 space-y-3">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-semibold text-slate-900">Contraseña</p>
                <p className="text-xs text-slate-500">Recomendado: mínimo 12 caracteres.</p>
              </div>
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-600">Nueva contraseña</label>
              <div className="mt-1 relative">
                <input
                  type={showNew ? "text" : "password"}
                  className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-200"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="********"
                />
                <button
                  type="button"
                  onClick={() => setShowNew((p) => !p)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-700"
                  aria-label="Mostrar/Ocultar contraseña"
                >
                  {showNew ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={change}
                disabled={changing}
                className="px-4 py-2 rounded-xl bg-indigo-600 text-white text-sm font-semibold disabled:opacity-60"
              >
                {changing ? "Actualizando..." : "Cambiar contraseña"}
              </button>
              {msg && <p className="text-sm text-slate-500">{msg}</p>}
            </div>
          </div>
        </div>

        {/* Users / Seats */}
        <div className="rounded-2xl border border-slate-200 bg-white">
          <div className="p-4 md:p-5 space-y-4">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-start gap-3">
                <div className="mt-0.5 w-9 h-9 rounded-xl bg-slate-900 text-white flex items-center justify-center">
                  <Users className="w-4 h-4" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-slate-900">Gestión de usuarios</p>
                  <p className="text-xs text-slate-500">
                    Control por seats del plan. OWNER/ADMIN pueden invitar, suspender y quitar.
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={loadMembers}
                  disabled={membersLoading}
                  className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
                >
                  <RefreshCw className={clsx("w-4 h-4", membersLoading && "animate-spin")} />
                  Actualizar
                </button>

                <button
                  onClick={openInvite}
                  disabled={!canInvite}
                  className={clsx(
                    "inline-flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold",
                    canInvite
                      ? "bg-indigo-600 text-white hover:bg-indigo-700"
                      : "bg-slate-200 text-slate-500 cursor-not-allowed"
                  )}
                  title={
                    canInvite
                      ? "Invitar usuario"
                      : "No disponible: suscripción no activa o sin plazas."
                  }
                >
                  <UserPlus className="w-4 h-4" />
                  Añadir usuario
                </button>
              </div>
            </div>

            {/* Entitlements bar */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
                <p className="text-[11px] font-semibold text-slate-600">Plan</p>
                <div className="mt-1 flex items-center gap-2">
                  <Shield className="w-4 h-4 text-slate-700" />
                  <p className="text-sm font-semibold text-slate-900">
                    {planCode ?? "—"}
                  </p>
                  <span className={clsx(
                    "ml-1 inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold ring-1 ring-inset",
                    String(subscriptionStatus).toUpperCase() === "ACTIVE"
                      ? "bg-emerald-50 text-emerald-700 ring-emerald-200"
                      : "bg-slate-100 text-slate-700 ring-slate-200"
                  )}>
                    {subscriptionStatus ?? "—"}
                  </span>
                </div>
                <p className="mt-1 text-[11px] text-slate-500">
                  Si el plan no está ACTIVE, el backend bloqueará invitaciones y reactivaciones.
                </p>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
                <p className="text-[11px] font-semibold text-slate-600">Seats</p>
                <p className="mt-1 text-sm font-semibold text-slate-900">
                  {seatsUsed != null && seatsTotal != null ? `${seatsUsed} / ${seatsTotal}` : "—"}
                  {seatsAvailable != null && seatsAvailable >= 0 && (
                    <span className="ml-2 text-xs font-semibold text-slate-600">
                      ({seatsAvailable} libres)
                    </span>
                  )}
                </p>

                {/* Progress bar */}
                <div className="mt-2 h-2 rounded-full bg-slate-200 overflow-hidden">
                  {seatsUsed != null && seatsTotal != null && seatsTotal > 0 ? (
                    <div
                      className="h-full bg-indigo-600"
                      style={{
                        width: `${Math.min(100, Math.round((seatsUsed / seatsTotal) * 100))}%`,
                      }}
                    />
                  ) : (
                    <div className="h-full bg-slate-200" style={{ width: "0%" }} />
                  )}
                </div>

                <p className="mt-1 text-[11px] text-slate-500">
                  Se cuentan ACTIVE + INVITED. Si llegas al límite, solo podrás quitar/suspender.
                </p>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
                <p className="text-[11px] font-semibold text-slate-600">Avisos</p>
                {uiNotice ? (
                  <div className="mt-1 flex items-start gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 mt-0.5" />
                    <p className="text-xs text-slate-700">{uiNotice}</p>
                  </div>
                ) : membersError ? (
                  <div className="mt-1 flex items-start gap-2">
                    <AlertTriangle className="w-4 h-4 text-amber-600 mt-0.5" />
                    <p className="text-xs text-slate-700">{membersError}</p>
                  </div>
                ) : (
                  <p className="mt-1 text-xs text-slate-600">
                    Todo enforcement real se hace en Edge (asientos + plan ACTIVE).
                  </p>
                )}
              </div>
            </div>

            {/* Members table */}
            <div className="rounded-2xl border border-slate-200 overflow-hidden">
              <div className="bg-slate-50 px-4 py-3 flex items-center justify-between">
                <p className="text-xs font-semibold text-slate-700">Miembros</p>
                <p className="text-xs text-slate-500">
                  {membersLoading ? "Cargando..." : `${members.length} registros`}
                </p>
              </div>

              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead className="bg-white">
                    <tr className="border-b border-slate-200">
                      <th className="text-left text-[11px] font-semibold text-slate-600 px-4 py-3">Email</th>
                      <th className="text-left text-[11px] font-semibold text-slate-600 px-4 py-3">Rol</th>
                      <th className="text-left text-[11px] font-semibold text-slate-600 px-4 py-3">Estado</th>
                      <th className="text-left text-[11px] font-semibold text-slate-600 px-4 py-3">Creado</th>
                      <th className="text-right text-[11px] font-semibold text-slate-600 px-4 py-3">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white">
                    {members.length === 0 && !membersLoading ? (
                      <tr>
                        <td className="px-4 py-6 text-xs text-slate-500" colSpan={5}>
                          No hay miembros todavía. (En producción, normalmente siempre habrá al menos un OWNER.)
                        </td>
                      </tr>
                    ) : (
                      members.map((m) => {
                        const email = (m.email ?? m.invited_email ?? "—").toString();
                        const busy = actionBusyId === m.id;

                        const canResend = m.status === "INVITED";
                        const canSuspend = m.status === "ACTIVE" && m.role !== "OWNER";
                        const canReactivate = m.status === "SUSPENDED" && m.role !== "OWNER";
                        const canRemove = m.role !== "OWNER"; // nunca quites OWNER desde UI

                        return (
                          <tr key={m.id} className="border-b border-slate-100">
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-2">
                                <Mail className="w-4 h-4 text-slate-400" />
                                <span className="text-xs text-slate-900">{email}</span>
                              </div>
                            </td>

                            <td className="px-4 py-3">
                              <span
                                className={clsx(
                                  "inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold ring-1 ring-inset",
                                  rolePill(m.role)
                                )}
                              >
                                {m.role}
                              </span>
                            </td>

                            <td className="px-4 py-3">
                              <span
                                className={clsx(
                                  "inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold ring-1 ring-inset",
                                  statusPill(m.status)
                                )}
                              >
                                {m.status}
                              </span>
                            </td>

                            <td className="px-4 py-3">
                              <span className="text-xs text-slate-600">{formatDate(m.created_at)}</span>
                            </td>

                            <td className="px-4 py-3">
                              <div className="flex items-center justify-end gap-2">
                                {canResend && (
                                  <button
                                    disabled={busy}
                                    onClick={() => doAction(m, "RESEND_INVITE")}
                                    className="inline-flex items-center gap-1 px-2 py-1 rounded-lg border border-slate-200 text-[11px] font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
                                    title="Reenviar invitación"
                                  >
                                    <Send className="w-3.5 h-3.5" />
                                    Reenviar
                                  </button>
                                )}

                                {canSuspend && (
                                  <button
                                    disabled={busy}
                                    onClick={() => doAction(m, "SUSPEND")}
                                    className="inline-flex items-center gap-1 px-2 py-1 rounded-lg border border-slate-200 text-[11px] font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
                                    title="Suspender"
                                  >
                                    <PauseCircle className="w-3.5 h-3.5" />
                                    Suspender
                                  </button>
                                )}

                                {canReactivate && (
                                  <button
                                    disabled={busy}
                                    onClick={() => doAction(m, "REACTIVATE")}
                                    className="inline-flex items-center gap-1 px-2 py-1 rounded-lg border border-slate-200 text-[11px] font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
                                    title="Reactivar (enforza seats en backend)"
                                  >
                                    <PlayCircle className="w-3.5 h-3.5" />
                                    Reactivar
                                  </button>
                                )}

                                {canRemove && (
                                  <button
                                    disabled={busy}
                                    onClick={() => {
                                      const ok = window.confirm("¿Quitar este usuario de la organización?");
                                      if (ok) void doAction(m, "REMOVE");
                                    }}
                                    className="inline-flex items-center gap-1 px-2 py-1 rounded-lg border border-rose-200 text-[11px] font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-60"
                                    title="Quitar"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                    Quitar
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>

              {membersLoading && (
                <div className="px-4 py-3 text-xs text-slate-500 bg-white">Cargando miembros…</div>
              )}
            </div>

            {/* API notice */}
            <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
              <p className="text-xs text-slate-600">
                API / Integraciones: se mostrará aquí solo si el plan lo permite (pendiente).
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Invite Modal */}
      {inviteOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/30"
            onClick={closeInvite}
            aria-hidden="true"
          />
          <div className="relative w-[92vw] max-w-2xl rounded-2xl bg-white border border-slate-200 shadow-xl">
            <div className="p-5 border-b border-slate-200 flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-slate-900">Invitar usuario</p>
                <p className="text-xs text-slate-500">
                  Se contará como seat (INVITED) y el backend aplicará el límite del plan.
                </p>
              </div>
              <button
                className="p-2 rounded-xl hover:bg-slate-100 text-slate-600"
                onClick={closeInvite}
                disabled={inviteBusy}
                aria-label="Cerrar"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 space-y-4">
              {/* Notice */}
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <p className="text-xs text-slate-700">
                  <span className="font-semibold">Plan:</span> {planCode ?? "—"}{" "}
                  <span className="mx-2 text-slate-300">|</span>
                  <span className="font-semibold">Suscripción:</span> {subscriptionStatus ?? "—"}{" "}
                  <span className="mx-2 text-slate-300">|</span>
                  <span className="font-semibold">Seats:</span>{" "}
                  {seatsUsed != null && seatsTotal != null ? `${seatsUsed}/${seatsTotal}` : "—"}
                </p>
              </div>

              {inviteErr && (
                <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3">
                  <AlertTriangle className="w-4 h-4 text-amber-700 mt-0.5" />
                  <p className="text-xs text-amber-900">{inviteErr}</p>
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] font-semibold text-slate-600">Nombre</label>
                  <input
                    className="mt-1 w-full border border-slate-200 rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-200"
                    value={invFirstName}
                    onChange={(e) => setInvFirstName(e.target.value)}
                    placeholder="Nombre"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-semibold text-slate-600">Apellidos</label>
                  <input
                    className="mt-1 w-full border border-slate-200 rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-200"
                    value={invLastName}
                    onChange={(e) => setInvLastName(e.target.value)}
                    placeholder="Apellidos"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-semibold text-slate-600">Cargo</label>
                  <input
                    className="mt-1 w-full border border-slate-200 rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-200"
                    value={invTitle}
                    onChange={(e) => setInvTitle(e.target.value)}
                    placeholder="Recepción, Dirección, Revenue…"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-semibold text-slate-600">Teléfono</label>
                  <input
                    className="mt-1 w-full border border-slate-200 rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-200"
                    value={invPhone}
                    onChange={(e) => setInvPhone(e.target.value)}
                    placeholder="+34 6XX XXX XXX"
                  />
                </div>

                <div className="md:col-span-2">
                  <label className="text-[11px] font-semibold text-slate-600">Email</label>
                  <input
                    className="mt-1 w-full border border-slate-200 rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-200"
                    value={invEmail}
                    onChange={(e) => setInvEmail(e.target.value)}
                    placeholder="usuario@hotel.com"
                  />
                </div>

                <div className="md:col-span-2">
                  <label className="text-[11px] font-semibold text-slate-600">Rol</label>
                  <select
                    className="mt-1 w-full border border-slate-200 rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-200"
                    value={invRole}
                    onChange={(e) => setInvRole(e.target.value as any)}
                  >
                    <option value="STAFF">STAFF (operativo)</option>
                    <option value="ADMIN">ADMIN (gestión / auditoría)</option>
                  </select>
                  <p className="mt-1 text-[11px] text-slate-500">
                    OWNER no se invita desde aquí. OWNER es el creador/control principal.
                  </p>
                </div>
              </div>
            </div>

            <div className="p-5 border-t border-slate-200 flex items-center justify-end gap-2">
              <button
                onClick={closeInvite}
                disabled={inviteBusy}
                className="px-4 py-2 rounded-xl border border-slate-200 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
              >
                Cancelar
              </button>
              <button
                onClick={submitInvite}
                disabled={inviteBusy}
                className="px-4 py-2 rounded-xl bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 disabled:opacity-60"
              >
                {inviteBusy ? "Enviando…" : "Enviar invitación"}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
};
