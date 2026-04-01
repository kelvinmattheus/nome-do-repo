// ── Auth ────────────────────────────────────────────────────────
export type UserRole = 'ADMIN' | 'COLLECTOR';

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  isActive: boolean;
}

export interface LoginResponse {
  token: string;
  user: AuthUser;
}

// ── Customer ─────────────────────────────────────────────────────
export type CustomerStatus = 'ATIVO' | 'INADIMPLENTE' | 'INATIVO';

export interface Customer {
  id: string;
  cpf: string;
  name: string;
  zipCode?: string;
  street?: string;
  number?: string;
  complement?: string;
  neighborhood?: string;
  city?: string;
  state?: string;
  birthDate?: string;
  phone1?: string;
  phone2?: string;
  monthlyIncome?: number;
  residenceMonths?: number;
  status: CustomerStatus;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CustomerFormData {
  cpf: string;
  name: string;
  zipCode?: string;
  street?: string;
  number?: string;
  complement?: string;
  neighborhood?: string;
  city?: string;
  state?: string;
  birthDate?: string | null;
  phone1?: string;
  phone2?: string;
  monthlyIncome?: number;
  residenceMonths?: number;
  status: CustomerStatus;
  notes?: string;
}

// ── Contract ─────────────────────────────────────────────────────
export type ContractStatus = 'ATIVO' | 'QUITADO' | 'ATRASADO' | 'RENEGOCIADO';

export interface Installment {
  id: string;
  contractId: string;
  installmentNumber: number;
  dueDate: string;
  amount: number;
  status: 'PENDENTE' | 'PAGA' | 'ATRASADA' | 'PARCIAL';
  paidAmount?: number;
  paidAt?: string;
}

export interface Contract {
  id: string;
  customerId: string;
  customer?: Customer;
  product: string;
  quantity?: number;
  financedAmount: number;
  installmentCount: number;
  contractStartDate: string;
  interestRate?: number;
  notes?: string;
  status: ContractStatus;
  promisedPaymentDate?: string;
  promisedPaymentValue?: number;
  collectionNote?: string;
  overdueInstallments?: number;
  pendingAmount?: number;
  sellerId?: string;
  seller?: AuthUser;
  installments?: Installment[];
  createdAt: string;
  updatedAt: string;
}

export interface ContractFormData {
  customerId: string;
  product: string;
  quantity?: number;
  financedAmount: number;
  installmentCount: number;
  contractStartDate: string | null;
  interestRate?: number;
  notes?: string;
  status: ContractStatus;
  promisedPaymentDate?: string | null;
  promisedPaymentValue?: number | null;
  collectionNote?: string;
}

// ── Payment ──────────────────────────────────────────────────────
export type PaymentMethod = 'PIX' | 'DINHEIRO' | 'CARTAO' | 'BOLETO' | 'TED';

export interface Payment {
  id: string;
  contractId: string;
  contract?: Contract;
  installmentId?: string;
  installment?: Installment;
  collectorId: string;
  collector?: AuthUser;
  amount: number;
  paymentDate: string;
  paymentMethod: PaymentMethod;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface PaymentFormData {
  contractId: string;
  installmentId?: string | null;
  collectorId: string;
  amount: number;
  paymentDate: string;
  paymentMethod: PaymentMethod;
  notes?: string;
}

// ── User ─────────────────────────────────────────────────────────
export interface User {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface UserFormData {
  name: string;
  email: string;
  password?: string;
  role: UserRole;
  isActive: boolean;
}

// ── Assignment ───────────────────────────────────────────────────
export interface Assignment {
  id: string;
  contractId: string;
  contract?: Contract;
  collectorId: string;
  collector?: User;
  createdAt: string;
}

export interface DistributionCollector {
  id: string;
  name: string;
  email: string;
  assignedCount: number;
  assignedCustomers: {
    assignmentId: string;
    customerName: string;
    product: string;
  }[];
}

// ── Dashboard ────────────────────────────────────────────────────
export interface DashboardSummary {
  valueOpenMonth: number;
  valueReceivedMonth: number;
  missingToReceiveMonth: number;
  overdueInstallments: number;
  customersInArrears: number;
  collectorsDaily: CollectorDaily[];
  assignmentsToday: number;
  customersCount: number;
  contractsCount: number;
  totalSold: number;
  overdueCount: number;
  ticketAverage: number;
}

export interface CollectorDaily {
  id: string;
  name: string;
  receivedToday: number;
  paymentsToday: number;
}

// ── Cash Accounts ─────────────────────────────────────────────────
export interface CashAccount {
  collectorId: string;
  collectorName: string;
  received: number;
  payments: number;
  receipts: Payment[];
}

export interface CashAccountsResponse {
  month: string;
  accounts: CashAccount[];
  total: number;
}

// ── Products & Stock ─────────────────────────────────────────────
export interface Product {
  id: string;
  name: string;
  description?: string;
  unit: string;
  packageUnit?: string;
  packageQty?: number;
  currentStock: number;
  minStock: number;
  costPrice: number;
  salePrice: number;
  expiryDate?: string;
  createdAt: string;
}

export interface ProductFormData {
  name: string;
  description?: string;
  unit: string;
  packageUnit?: string;
  packageQty?: number;
  minStock: number;
  costPrice: number;
  salePrice: number;
  expiryDate?: string | null;
}

export type StockMovementType =
  | 'ENTRADA'
  | 'SAIDA'
  | 'AVARIA'
  | 'TROCA'
  | 'AJUSTE_POSITIVO'
  | 'AJUSTE_NEGATIVO'
  | 'ESTORNO';

export interface StockMovement {
  id: string;
  productId: string;
  product?: Product;
  type: StockMovementType;
  quantity: number;
  unitCost: number;
  salePrice?: number;
  destination?: string;
  reason?: string;
  createdAt: string;
}

export interface StockSummary {
  totalProducts: number;
  totalItems: number;
  totalCostValue: number;
  totalSaleValue: number;
  lowStockProducts: Product[];
}

// ── Baskets ──────────────────────────────────────────────────────
export interface BasketItem {
  id: string;
  basketId: string;
  productId: string;
  product?: Product;
  quantity: number;
}

export interface Basket {
  id: string;
  name: string;
  description?: string;
  currentStock: number;
  minStock: number;
  costPrice: number;
  salePrice: number;
  items?: BasketItem[];
  createdAt: string;
}

export type BasketMovementType =
  | 'MONTAGEM'
  | 'VENDA'
  | 'DESMONTAGEM'
  | 'AVARIA'
  | 'AJUSTE_POSITIVO'
  | 'AJUSTE_NEGATIVO'
  | 'ESTORNO';

export interface BasketMovement {
  id: string;
  basketId: string;
  basket?: Basket;
  type: BasketMovementType;
  quantity: number;
  unitCost: number;
  salePrice?: number;
  destination?: string;
  reason?: string;
  createdAt: string;
}

// ── SPC ──────────────────────────────────────────────────────────
export type SpcStatus = 'ATIVO' | 'BAIXADO';

export interface SpcRecord {
  id: string;
  customerId: string;
  customer?: Customer;
  contractId?: string;
  contract?: Contract;
  includeDate?: string;
  debtAmount: number;
  reason?: string;
  notes?: string;
  status: SpcStatus;
  removedReason?: string;
  removedAt?: string;
  agreements?: SpcAgreement[];
  createdAt: string;
  updatedAt: string;
}

export interface SpcAgreement {
  id: string;
  spcId: string;
  agreedAmount: number;
  paymentDate: string;
  notes?: string;
  createdAt: string;
}

export interface SpcSummary {
  totalActive: number;
  totalDebt: number;
  totalBaixados: number;
}

// ── Audit ─────────────────────────────────────────────────────────
export interface AuditLog {
  id: string;
  userId: string;
  user?: User;
  action: string;
  entity: string;
  entityId?: string;
  details?: string;
  ipAddress?: string;
  createdAt: string;
}

// ── Customer Full Profile ─────────────────────────────────────────
export interface TimelineItem {
  type: 'CONTRATO' | 'PAGAMENTO' | 'DISTRIBUICAO';
  date: string;
  title: string;
  description: string;
}

export interface CustomerContractFull extends Contract {
  paidInstallments?: number;
  payments: Payment[];
  assignments: Array<{
    id: string;
    assignedAt: string;
    collector: { id: string; name: string; email: string };
  }>;
}

export interface CustomerFull extends Customer {
  createdBy?: { id: string; name: string; email: string };
  contracts: CustomerContractFull[];
}

export interface CustomerFullResponse {
  customer: CustomerFull;
  timeline: TimelineItem[];
}

// ── Collector Dashboard ───────────────────────────────────────────
export interface CollectorContractView {
  id: string;
  customer: {
    id: string;
    name: string;
    cpf: string;
    phone1?: string;
    phone2?: string;
    city?: string;
    street?: string;
    number?: string;
    neighborhood?: string;
  };
  product: string;
  financedAmount: number;
  overdueInstallments: number;
  pendingAmount: number;
  status: ContractStatus;
  promisedPaymentDate?: string;
  promisedPaymentValue?: number;
  collectionNote?: string;
  installments?: Installment[];
}
