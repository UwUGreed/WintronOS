export type IntegrationState =
  | "UNDER_DEVELOPMENT"
  | "SETUP_REQUIRED"
  | "VERIFICATION_REQUIRED"
  | "CHECKING"
  | "CONNECTION_VERIFIED"
  | "ERROR";

export const integrationLabels: Record<IntegrationState, string> = {
  UNDER_DEVELOPMENT: "Under development",
  SETUP_REQUIRED: "Setup required",
  VERIFICATION_REQUIRED: "Needs verification",
  CHECKING: "Checking connection",
  CONNECTION_VERIFIED: "Connection verified",
  ERROR: "Connection failed",
};

// Implemented features belong in the live section, not in this roadmap.
export const developmentIntegrations = [
  {
    id: "leads",
    name: "Automatic contact enrichment",
    description:
      "Automatic email discovery, phone verification, and contact enrichment are under development.",
    available:
      "Search for businesses with Brave Search, review their websites, and add verified contact details manually.",
  },
  {
    id: "inbox",
    name: "Communication inbox",
    description:
      "Mailbox connections, incoming messages, and reply tracking are under development.",
    available: "Client notes and uploaded correspondence are available now.",
  },
  {
    id: "outreach",
    name: "Outreach & reply automations",
    description:
      "Email sequences, automatic follow-ups, and stop-on-reply rules are under development.",
    available:
      "Pipeline follow-up dates and recurring billing rules are available now.",
  },
  {
    id: "stripe",
    name: "Stripe payments",
    description:
      "Online checkout, processor refunds, and payment webhooks are under development.",
    available:
      "Record payments and refunds already handled by your payment provider in Money.",
  },
  {
    id: "bank",
    name: "Bank synchronization",
    description:
      "Bank connections, transaction imports, and automatic matching are under development.",
    available:
      "Record expenses and reconcile existing payment records manually.",
  },
  {
    id: "signatures",
    name: "Proposal delivery & electronic signatures",
    description:
      "Proposal sending, online acceptance, and electronic signing are under development.",
    available:
      "Prepare internal proposal drafts and upload signed contracts now.",
  },
] as const;

export type SmtpStatus = {
  state: Exclude<IntegrationState, "UNDER_DEVELOPMENT">;
  configured: boolean;
  issues: string[];
  checkedAt: string | null;
  detail: string;
  lastAcceptedAt: string | null;
};

export type LeadStatus = {
  state: Exclude<IntegrationState, "UNDER_DEVELOPMENT" | "CHECKING">;
  configured: boolean;
  detail: string;
  lastSearchAt: string | null;
  dailyLimit: number;
  usedToday: number;
};
export type LeadResult = {
  title: string;
  url: string;
  description: string;
  existingProspectId: string | null;
};
export type LeadSearch = {
  query: string;
  page: number;
  more: boolean;
  searchedAt: string;
  results: LeadResult[];
  remainingToday: number;
};
