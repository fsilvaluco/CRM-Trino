export type Temperature = "cold" | "warm" | "hot";

// Task statuses — 6 specific states grouped into 3 visual columns
export type TaskStatus =
  | "sin_empezar" // gris
  | "en_curso"    // azul
  | "revisar"     // azul
  | "listo"       // verde
  | "descartado"; // amarillo
export type TaskPriority = "low" | "medium" | "high";

export type ProjectStatus = "active" | "paused" | "completed" | "archived";
export type SubprojectStatus = "active" | "paused" | "completed";

export type LeadSource =
  | "website"
  | "whatsapp"
  | "referido"
  | "redes_sociales"
  | "llamada_fria"
  | "email"
  | "formulario"
  | "evento"
  | "import"
  | "webhook"
  | "otro";

export interface Company {
  id: string;
  name: string;
  industry: string | null;
  website: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface Contact {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  company: string | null; // legacy texto plano
  companyId: string | null;
  source: LeadSource;
  temperature: Temperature;
  score: number;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface Deal {
  id: string;
  title: string;
  value: number; // in cents
  valueType: "fixed" | "percentage";
  percentageValue: number | null;
  taxType: "afecto" | "exento";
  stageId: string;
  contactId: string | null;
  companyId: string | null;
  expectedClose: Date | null;
  probability: number; // 0-100
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface PipelineStage {
  id: string;
  name: string;
  order: number;
  color: string;
  isWon: boolean;
  isLost: boolean;
}

export interface Project {
  id: string;
  name: string;
  type: string | null;
  status: ProjectStatus;
  description: string | null;
  companyId: string | null;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface Subproject {
  id: string;
  name: string;
  status: SubprojectStatus;
  projectId: string;
  startDate: Date | null;
  endDate: Date | null;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface Task {
  id: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  dueDate: Date | null;
  contactId: string | null;
  companyId: string | null;
  dealId: string | null;
  projectId: string | null;
  subprojectId: string | null;
  completedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface TaskComment {
  id: string;
  taskId: string;
  content: string;
  author: string;
  createdAt: Date;
}

export interface TaskDetail extends Task {
  contactName?: string | null;
  companyName?: string | null;
  dealTitle?: string | null;
  projectName?: string | null;
  subprojectName?: string | null;
  comments: TaskComment[];
}

export interface CrmConfig {
  business: {
    type: string;
    industry: string;
    teamSize: string;
  };
  pipeline: {
    stages: Array<{
      name: string;
      order: number;
      color: string;
      isWon: boolean;
      isLost: boolean;
    }>;
  };
  leadSources: string[];
  preferences: {
    language: "es" | "en";
    theme: "light" | "dark" | "auto";
  };
}

// Extended types with relations
export interface CompanyWithRelations extends Company {
  contactCount?: number;
  dealCount?: number;
}

export interface ContactWithDeals extends Contact {
  deals?: Deal[];
  companyName?: string | null;
}

export interface DealWithContact extends Deal {
  contact?: Contact;
  stage?: PipelineStage;
  contactName?: string | null;
  contactTemperature?: string | null;
  companyName?: string | null;
}

export interface ProjectWithRelations extends Project {
  companyName?: string | null;
  subprojects?: Subproject[];
  taskCount?: number;
}

export interface SubprojectWithRelations extends Subproject {
  projectName?: string | null;
  tasks?: Task[];
}

export interface TaskWithRelations extends Task {
  contactName?: string | null;
  companyName?: string | null;
  dealTitle?: string | null;
  projectName?: string | null;
  subprojectName?: string | null;
}

export interface PipelineColumn extends PipelineStage {
  deals: DealWithContact[];
}

export interface DashboardStats {
  totalContacts: number;
  activeDeals: number;
  totalPipelineValue: number;
  wonDealsValue: number;
  conversionRate: number;
  hotLeads: number;
}
