export type Prospect = {
  id: string;
  name: string;
  industry: string;
  location: string;
  website: string;
  email: string;
  phone: string;
  sourceUrl: string;
  evidence: string;
  qualification: string;
  status: string;
  observedAt: string | null;
  createdAt: string;
  opportunity?: { id: string } | null;
};
export type Opportunity = {
  id: string;
  name: string;
  stage: string;
  ownerName: string;
  value: string;
  followUp: string | null;
  lossReason: string;
  clientId: string | null;
  prospect?: Prospect | null;
  notes: {
    id: string;
    content: string;
    authorName: string;
    createdAt: string;
  }[];
};
export type Task = {
  id: string;
  projectId: string;
  title: string;
  ownerName: string;
  dueDate: string | null;
  completed: boolean;
};
export type Project = {
  id: string;
  clientId: string;
  name: string;
  description: string;
  status: string;
  ownerName: string;
  dueDate: string | null;
  tasks: Task[];
  client: { name: string };
  documents: { id: string; name: string }[];
};
export type WorkspaceData = {
  prospects: Prospect[];
  opportunities: Opportunity[];
  projects: Project[];
  searches: {
    id: string;
    name: string;
    query: string;
    industry: string;
    location: string;
  }[];
  jobs: {
    id: string;
    kind: string;
    status: string;
    detail: string;
    createdAt: string;
  }[];
  integrations: {
    leadProvider: boolean;
    stripe: boolean;
    inbox: boolean;
    smtp: boolean;
  };
};
