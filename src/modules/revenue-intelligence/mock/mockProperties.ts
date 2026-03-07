import { Property } from '../types';

export const mockProperties: Property[] = [
  {
    id: "hotel_achuri",
    name: "Achuri 2025",
    company: "Achuri S.L.",
    cif: "B12345678",
    type: "Hotel",
    roomsCount: 18,
    category: "3 Estrellas",
    address: "Calle Mayor 1",
    city: "Bilbao",
    postalCode: "48001",
    province: "Bizkaia",
    country: "España",
    contactName: "Juan Pérez",
    contactPhone: "+34 944 123 456",
    contactEmail: "info@achuri.com",
    availableRooms: 18,
    baseRate: 75,
    currency: "EUR",
    vatIncluded: true,
    active: true
  },
  {
    id: "hotel_costa",
    name: "Hotel Costa Norte",
    company: "Costa Norte Hoteles S.A.",
    cif: "A87654321",
    type: "Hotel",
    roomsCount: 45,
    category: "4 Estrellas",
    address: "Paseo Marítimo 10",
    city: "Santander",
    postalCode: "39001",
    province: "Cantabria",
    country: "España",
    contactName: "Ana García",
    contactPhone: "+34 942 987 654",
    contactEmail: "reservas@costanorte.com",
    availableRooms: 45,
    baseRate: 110,
    currency: "EUR",
    vatIncluded: true,
    active: true
  }
];