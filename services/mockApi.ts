import { User, Rating, PlanType, Invoice } from '../types';

// Mock Data Storage
let CURRENT_USER: User | null = null;

const MOCK_USERS: User[] = [
  {
    id: 'u1',
    username: 'admin',
    fullName: 'Carlos Gerente',
    email: 'admin@debacu.com',
    plan: PlanType.PROFESSIONAL,
    planStartDate: '2023-01-15',
    monthlyFee: 49.99
  },
  {
    id: 'u2',
    username: 'user',
    fullName: 'Ana Vendedora',
    email: 'ana@tienda.com',
    plan: PlanType.BASIC,
    planStartDate: '2023-05-20',
    monthlyFee: 19.99
  }
];

const MOCK_RATINGS: Rating[] = [
  {
    id: 'r1',
    value: 5,
    comment: 'Cliente excelente, paga a tiempo.',
    createdAt: '2023-10-01T10:00:00Z',
    authorId: 'u1',
    authorName: 'Carlos Gerente',
    clientData: { fullName: 'Juan Perez', email: 'juan@gmail.com', document: '12345678A' }
  },
  {
    id: 'r2',
    value: 1,
    comment: 'Intentó estafar con una devolución falsa.',
    createdAt: '2023-11-15T14:30:00Z',
    authorId: 'u3', // Someone else
    authorName: 'Roberto Externo',
    clientData: { fullName: 'Juan Perez', email: 'juan@gmail.com', document: '12345678A' }
  },
  {
    id: 'r3',
    value: 3,
    comment: 'Cliente regular, a veces tarda en responder.',
    createdAt: '2023-12-05T09:15:00Z',
    authorId: 'u2',
    authorName: 'Ana Vendedora',
    clientData: { fullName: 'Maria Lopez', phone: '555-0199' }
  }
];

const MOCK_INVOICES: Invoice[] = [
  { id: 'inv-001', date: '2023-10-01', amount: 49.99, status: 'Paid', description: 'Suscripción DebacuEval - Octubre' },
  { id: 'inv-002', date: '2023-11-01', amount: 49.99, status: 'Paid', description: 'Suscripción DebacuEval - Noviembre' },
  { id: 'inv-003', date: '2023-12-01', amount: 49.99, status: 'Pending', description: 'Suscripción DebacuEval - Diciembre' },
];

// Helper to simulate API delay
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export const api = {
  login: async (username: string, password: string, appCode: string): Promise<User> => {
    await delay(800);
    
    // Simulate logging/sending the appCode to central management
    console.log(`[Debacu Central Auth] Processing login for App Code: ${appCode}`);

    // Mock simple check
    if (password === '123456') {
      const user = MOCK_USERS.find(u => u.username === username);
      if (user) {
        // Simulate external API check for subscription status
        if (user.plan === PlanType.INACTIVE) {
          throw new Error("Su suscripción está inactiva. Contacte soporte.");
        }
        CURRENT_USER = user;
        return user;
      }
    }
    throw new Error("Credenciales inválidas");
  },

  logout: async () => {
    await delay(200);
    CURRENT_USER = null;
  },

  getCurrentUser: () => CURRENT_USER,

  searchRatings: async (query: string): Promise<Rating[]> => {
    await delay(500);
    if (!CURRENT_USER) throw new Error("No autenticado");
    
    if (!query.trim()) return [];

    const lowerQuery = query.toLowerCase();
    
    // Filter ratings based on query matching any client field
    return MOCK_RATINGS.filter(r => {
      const { fullName, email, phone, document } = r.clientData;
      return (
        fullName?.toLowerCase().includes(lowerQuery) ||
        email?.toLowerCase().includes(lowerQuery) ||
        phone?.includes(lowerQuery) ||
        document?.toLowerCase().includes(lowerQuery)
      );
    });
  },

  addRating: async (ratingData: Omit<Rating, 'id' | 'createdAt' | 'authorId' | 'authorName'>): Promise<Rating> => {
    await delay(600);
    if (!CURRENT_USER) throw new Error("No autenticado");

    const newRating: Rating = {
      ...ratingData,
      id: `r${Date.now()}`,
      createdAt: new Date().toISOString(),
      authorId: CURRENT_USER.id,
      authorName: CURRENT_USER.fullName
    };

    MOCK_RATINGS.unshift(newRating);
    return newRating;
  },

  getInvoices: async (): Promise<Invoice[]> => {
    await delay(400);
    return MOCK_INVOICES;
  },

  downloadInvoice: async (invoiceId: string): Promise<void> => {
    await delay(1000);
    // Simulate download logic
    console.log(`[Debacu System] Downloading PDF for invoice ${invoiceId}`);
    return;
  },

  resendInvoiceEmail: async (invoiceId: string): Promise<void> => {
    await delay(800);
    // Simulate email logic
    console.log(`[Debacu System] Resending invoice ${invoiceId} to user email`);
    return;
  },

  updatePlan: async (newPlan: PlanType): Promise<User> => {
    await delay(800);
    if (!CURRENT_USER) throw new Error("No autenticado");
    
    // Logic to calculate new fee
    let fee = 0;
    if (newPlan === PlanType.BASIC) fee = 19.99;
    if (newPlan === PlanType.PROFESSIONAL) fee = 49.99;
    if (newPlan === PlanType.ENTERPRISE) fee = 99.99;

    const updatedUser = { ...CURRENT_USER, plan: newPlan, monthlyFee: fee };
    CURRENT_USER = updatedUser;
    
    // Update mock db ref
    const idx = MOCK_USERS.findIndex(u => u.id === updatedUser.id);
    if (idx !== -1) MOCK_USERS[idx] = updatedUser;

    return updatedUser;
  }
};