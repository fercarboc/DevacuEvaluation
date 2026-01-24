import React from "react";
import { Link } from "react-router-dom";

const cx = (...cls: Array<string | false | undefined | null>) =>
  cls.filter(Boolean).join(" ");

export default function LegalLayout({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-[#06213f]">
      <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
        <div className="rounded-3xl border border-white/10 bg-white/10 p-6 backdrop-blur">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h1 className="text-2xl font-semibold text-white">{title}</h1>
              {subtitle && <p className="mt-1 text-sm text-white/75">{subtitle}</p>}
            </div>
            <div className="flex flex-wrap gap-2">
              <Link
                to="/"
                className={cx(
                  "rounded-xl border border-white/15 bg-white/10 px-3 py-2 text-sm font-medium text-white",
                  "hover:bg-white/15"
                )}
              >
                Volver
              </Link>
              <Link
                to="/legal"
                className={cx(
                  "rounded-xl border border-white/15 bg-white/10 px-3 py-2 text-sm font-medium text-white",
                  "hover:bg-white/15"
                )}
              >
                Índice legal
              </Link>
            </div>
          </div>

          <div className="mt-6 rounded-2xl bg-white p-6 text-slate-800">
            {children}
          </div>

          <p className="mt-5 text-xs text-white/60">
            Nota: este contenido es una plantilla informativa. Adáptala con los datos reales de tu empresa
            (razón social, CIF, dirección, email de contacto, DPO si aplica, etc.).
          </p>
        </div>
      </div>
    </div>
  );
}
