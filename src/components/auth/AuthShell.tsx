import React from "react";

export default function AuthShell({
  children,
  title,
  subtitle,
}: {
  children: React.ReactNode;
  title?: string;
  subtitle?: string;
}) {
  return (
    <div className="relative min-h-screen overflow-hidden">
      {/* Fondo azul corporativo */}
      <div className="absolute inset-0 bg-gradient-to-br from-[#06213f] via-[#0b3a6f] to-[#0e4f8a]" />

      {/* Decoración sutil */}
      <div className="absolute -top-40 -right-40 h-[520px] w-[520px] rounded-full bg-white/5 blur-3xl" />
      <div className="absolute -bottom-40 -left-40 h-[520px] w-[520px] rounded-full bg-black/10 blur-3xl" />

      {/* Contenido centrado */}
      <div className="relative z-10 flex min-h-screen items-center justify-center p-4">
        <div className="w-full max-w-4xl rounded-2xl border border-slate-200 bg-white shadow-2xl">
          {(title || subtitle) && (
            <div className="border-b border-slate-100 px-8 py-6">
              {title && (
                <h1 className="text-2xl font-bold text-slate-900">{title}</h1>
              )}
              {subtitle && (
                <p className="mt-1 text-sm text-slate-600">{subtitle}</p>
              )}
            </div>
          )}

          {/* ⚠️ Scroll vertical SOLO dentro de la tarjeta */}
          <div className="max-h-[78vh] overflow-y-auto px-8 py-6">
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}
