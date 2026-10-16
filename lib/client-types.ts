export type Row = { id: string; [key: string]: unknown };
export type Client = Row & {
  name: string;
  email: string;
  contactName: string;
  industry: string;
  status: string;
  phone: string;
  website: string;
  billingAddress: string;
  paymentTerms: number;
  createdAt: string;
  tags: string[];
  notes?: Note[];
  invoices?: Invoice[];
  payments?: Payment[];
  projects?: Row[];
  retainers?: Retainer[];
  documents?: Row[];
  activity?: Activity[];
  contacts?: Row[];
};
export type Note = Row & {
  title: string;
  content: string;
  createdAt: string;
  updatedAt: string;
  authorId: string;
  revisions: Row[];
};
export type Line = {
  description: string;
  quantity: string;
  unitPrice: string;
  discountPercent: string;
  taxPercent: string;
  jurisdiction: string;
  serviceCategory: string;
  total?: string;
};
export type Invoice = Row & {
  number: string | null;
  clientId: string;
  client: Client;
  description: string;
  total: string;
  subtotal: string;
  discount: string;
  tax: string;
  balance: string;
  status: string;
  displayStatus: string;
  issueDate: string;
  dueDate: string;
  lines: Line[];
  notes: string;
  terms: string;
  paymentInstructions: string;
  deliveries: Row[];
};
export type Payment = Row & {
  clientId: string;
  client: Client;
  amount: string;
  receivedAt: string;
  method: string;
  reference: string;
  reconciled: boolean;
  allocations: (Row & {
    invoice: Invoice;
    invoiceId: string;
    amount: string;
    refunds: Row[];
  })[];
  refunds: Row[];
};
export type Expense = Row & {
  vendor: string;
  description: string;
  date: string;
  amount: string;
  category: string;
  reviewRequired: boolean;
  reviews: (Row & {
    reviewRequired: boolean;
    notes: string;
    reviewerName: string;
    createdAt: string;
  })[];
  reversedAt: string | null;
  documents: Row[];
};
export type Retainer = Row & {
  name: string;
  clientId: string;
  client: Client;
  amount: string;
  frequency: string;
  nextInvoiceDate: string;
  status: string;
  startDate: string;
  endDate: string | null;
  paymentTerms: number;
  services: string;
  notes: string;
};
export type Activity = Row & {
  summary: string;
  action: string;
  entityType: string;
  createdAt: string;
  actorId: string;
};
export type Account = Row & {
  code: string;
  name: string;
  type: string;
  debit: string;
  credit: string;
  balance: string;
  periodBalance: string;
};
export type Owner = Row & {
  name: string;
  percentage: string;
  residency: string;
  transactions: Row[];
};
export type State = {
  actor: { name: string; userId: string; role: string };
  organization: Row & {
    name: string;
    paymentTerms: number;
    terms: string;
    paymentInstructions: string;
  };
  clients: Client[];
  invoices: Invoice[];
  payments: Payment[];
  expenses: Expense[];
  retainers: Retainer[];
  owners: Owner[];
  activity: Activity[];
  notifications: (Row & {
    title: string;
    message: string;
    reads: Row[];
    target: string;
  })[];
  revenue: string;
  retainerRevenue: string;
  revenueByService: { name: string; revenue: string }[];
  expensesTotal: string;
  profit: string;
  cashCollected: string;
  cashBalance: string;
  outstanding: string;
  overdue: string;
  unpaidCount: number;
  mrr: string;
  arr: string;
  monthly: { month: string; year: number; revenue: string; expenses: string }[];
  taxConfig:
    | (Row & {
        earmarked: string;
        classification: string;
        taxYear: number;
        accountingMethod: string;
        federalReservePercent: string;
        stateReservePercent: string;
        selfEmploymentReservePercent: string;
      })
    | null;
  taxPayments: Row[];
  reserves: { federal: string; state: string; selfEmployment: string } | null;
  reserveTarget: string;
  remainingReserve: string | null;
  accountBalances: Account[];
  entries: (Row & {
    date: string;
    memo: string;
    lines: (Row & { debit: string; credit: string; account: Account })[];
  })[];
  aging: { label: string; total: string }[];
  revenueByClient: { clientId: string; name: string; revenue: string }[];
  assets: string;
  liabilities: string;
  equity: string;
  retainedEarnings: string;
  cashMovement: string;
  from: string;
  to: string;
};
export type Settings = {
  users: (Row & {
    role: string;
    active: boolean;
    user: {
      id: string;
      name: string;
      email: string;
      twoFactorEnabled: boolean;
      sessions: Row[];
    };
  })[];
  audits: Activity[];
  jobs: Row[];
  accounts: Account[];
  smtpConfigured: boolean;
  mfaRequired: boolean;
  version: string;
  database: string;
  storage: string;
};
