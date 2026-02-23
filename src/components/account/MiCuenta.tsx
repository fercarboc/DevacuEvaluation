// src/pages/MiCuenta.tsx
import React, { useMemo, useState } from "react";
import type { User } from "@/types/types";
 

import { PlanesTab } from "./PlanesTab";
import { PerfilHotel } from "./PerfilHotel";
import { Catalogo } from "./Catalogo";
import { DatosBancoHotel } from "./DatosBancoHotel";
import { Seguridad } from "./Seguridad";
 

type TabKey = "planes" | "perfilHotel" | "catalogo" | "banco" | "seguridad";

const TABS: { key: TabKey; label: string }[] = [
  { key: "planes", label: "Planes" },
  { key: "perfilHotel", label: "Perfil del hotel" },
  { key: "catalogo", label: "Catálogo de objetos" },
  { key: "banco", label: "Datos bancarios" },
  { key: "seguridad", label: "Seguridad" },
];

export function MiCuenta({ user }: { user: User }) {
  const [activeTab, setActiveTab] = useState<TabKey>("planes");

  const header = useMemo(() => {
    const title =
      activeTab === "planes"
        ? "Mi plan"
        : activeTab === "perfilHotel"
        ? "Perfil del hotel"
        : activeTab === "catalogo"
        ? "Catálogo de objetos"
        : activeTab === "banco"
        ? "Datos bancarios"
        : "Seguridad";
    const subtitle =
      activeTab === "planes"
        ? "Gestiona tu suscripción y facturas."
        : activeTab === "perfilHotel"
        ? "Datos del hotel y empresa, economía y parámetros."
        : activeTab === "catalogo"
        ? "Objetos/activos con precio unitario y activación."
        : activeTab === "banco"
        ? "Opcional (domiciliación SEPA bajo solicitud)."
        : "Contraseña y opciones avanzadas (según plan).";
    return { title, subtitle };
  }, [activeTab]);

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex flex-col gap-1">
        <h2 className="text-2xl font-bold text-slate-800">{header.title}</h2>
        <p className="text-sm text-slate-500">{header.subtitle}</p>
      </div>

      <div className="flex flex-wrap gap-3 border-b border-slate-200 pb-2">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`px-4 py-2 text-sm font-semibold rounded-full transition ${
              activeTab === tab.key ? "bg-slate-900 text-white" : "border border-slate-300 text-slate-600"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === "planes" && <PlanesTab user={user} />}

      {activeTab === "perfilHotel" && <PerfilHotel user={user} />}

      {activeTab === "catalogo" && <Catalogo />}

      {activeTab === "banco" && <DatosBancoHotel user={user} />}

      {activeTab === "seguridad" && <Seguridad user={user} />}
    </div>
  );
}
