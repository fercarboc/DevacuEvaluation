 // src/context/RevenuePropertyContext.tsx

import { createContext, useContext, useState } from "react";

interface ContextType {
  propertyId: string | null;
  setPropertyId: (id: string) => void;
}

const RevenuePropertyContext = createContext<ContextType | null>(null);

export const RevenuePropertyProvider = ({ children }: any) => {
  const [propertyId, setPropertyId] = useState<string | null>(null);

  return (
    <RevenuePropertyContext.Provider value={{ propertyId, setPropertyId }}>
      {children}
    </RevenuePropertyContext.Provider>
  );
};

export const useRevenueProperty = () => {
  const ctx = useContext(RevenuePropertyContext);
  if (!ctx) throw new Error("RevenuePropertyContext missing");
  return ctx;
};