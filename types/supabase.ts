export type ProfileRole = "employee" | "manager" | "admin";

export type Company = {
  id: string;
  name: string;
  legal_name: string | null;
  logo_url: string | null;
  favicon_url: string | null;
  primary_color: string;
  secondary_color: string;
  accent_color: string;
  website: string | null;
  support_email: string | null;
  phone: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type Location = {
  id: string;
  name: string;
  is_active: boolean;
  created_at: string;
  store_number: number;
  company_id: string;
};

export type Position = {
  id: string;
  name: string;
  is_active: boolean;
  created_at: string;
  company_id: string;
};

export type EmployeePosition = {
  employee_id: string;
  position_id: string;
};

export type TrainingModulePosition = {
  module_id: string;
  position_id: string;
  company_id: string;
  created_at: string;
};

export type TrainingModule = {
  id: string;
  title: string;
  description: string | null;
  category: string | null;
  training_audience: string;
  passing_score: number;
  estimated_minutes: number | null;
  status: string;
  allow_retake: boolean;
  max_attempts: number | null;
  renewal_period_days: number | null;
  days_allowed: number | null;
  company_id: string;
  created_by: string;
  created_at: string;
  updated_at: string;
};

export type TrainingSlide = {
  id: string;
  module_id: string;
  company_id: string;
  slide_order: number;
  title: string;
  body: string | null;
  image_url: string | null;
  slide_type: string;
  speaker_notes: string | null;
  estimated_seconds: number | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type QuizQuestionRow = {
  id: string;
  module_id: string;
  company_id: string;
  question_text: string;
  question_type: string;
  answer_a: string;
  answer_b: string;
  answer_c: string | null;
  answer_d: string | null;
  correct_answer: string;
  points: number;
  question_order: number;
  explanation: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type TrainingAssignment = {
  id: string;
  employee_id: string;
  module_id: string;
  status: "not_started" | "in_progress" | "completed" | "failed";
  progress_percent: number;
  assigned_at: string;
  started_at: string | null;
  completed_at: string | null;
  latest_score: number | null;
  passed: boolean | null;
  assigned_by: string | null;
  completion_email_sent_at: string | null;
};

export type QuizAttempt = {
  id: string;
  assignment_id: string;
  employee_id: string;
  module_id: string;
  attempt_number: number;
  total_questions: number;
  correct_answers: number;
  score: number;
  passed: boolean;
  duration_seconds: number | null;
  started_at: string;
  submitted_at: string;
  company_id: string;
};

export type QuizAttemptAnswer = {
  id: string;
  attempt_id: string;
  question_id: string;
  selected_answer: string;
  correct_answer: string;
  is_correct: boolean;
  created_at: string;
};

export type Profile = {
  id: string;
  email: string;
  employee_number: string;
  role: ProfileRole;
  location_id: string | null;
  is_active: boolean;
  created_at: string;
  first_name: string;
  last_name: string;
  hire_date: string | null;
  full_name: string;
  preferred_name: string | null;
  company_id: string;
};

export type Database = {
  public: {
    Tables: {
      companies: {
        Row: Company;
        Insert: Omit<Company, "id" | "created_at" | "updated_at"> & {
          id?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Company>;
        Relationships: [];
      };
      locations: {
        Row: Location;
        Insert: Omit<Location, "id" | "created_at"> & {
          id?: string;
          created_at?: string;
        };
        Update: Partial<Location>;
        Relationships: [
          {
            foreignKeyName: "locations_company_id_fkey";
            columns: ["company_id"];
            isOneToOne: false;
            referencedRelation: "companies";
            referencedColumns: ["id"];
          },
        ];
      };
      profiles: {
        Row: Profile;
        Insert: Omit<Profile, "created_at" | "full_name"> & {
          created_at?: string;
          full_name?: string;
        };
        Update: Partial<Omit<Profile, "id">>;
        Relationships: [
          {
            foreignKeyName: "profiles_location_id_fkey";
            columns: ["location_id"];
            isOneToOne: false;
            referencedRelation: "locations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "profiles_company_id_fkey";
            columns: ["company_id"];
            isOneToOne: false;
            referencedRelation: "companies";
            referencedColumns: ["id"];
          },
        ];
      };
      positions: {
        Row: Position;
        Insert: Omit<Position, "id" | "created_at"> & {
          id?: string;
          created_at?: string;
        };
        Update: Partial<Position>;
        Relationships: [
          {
            foreignKeyName: "positions_company_id_fkey";
            columns: ["company_id"];
            isOneToOne: false;
            referencedRelation: "companies";
            referencedColumns: ["id"];
          },
        ];
      };
      employee_positions: {
        Row: EmployeePosition;
        Insert: EmployeePosition;
        Update: Partial<EmployeePosition>;
        Relationships: [
          {
            foreignKeyName: "employee_positions_employee_id_fkey";
            columns: ["employee_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "employee_positions_position_id_fkey";
            columns: ["position_id"];
            isOneToOne: false;
            referencedRelation: "positions";
            referencedColumns: ["id"];
          },
        ];
      };
      training_module_positions: {
        Row: TrainingModulePosition;
        Insert: Omit<TrainingModulePosition, "created_at"> & {
          created_at?: string;
        };
        Update: Partial<TrainingModulePosition>;
        Relationships: [
          {
            foreignKeyName: "training_module_positions_module_id_fkey";
            columns: ["module_id"];
            isOneToOne: false;
            referencedRelation: "training_modules";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "training_module_positions_position_id_fkey";
            columns: ["position_id"];
            isOneToOne: false;
            referencedRelation: "positions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "training_module_positions_company_id_fkey";
            columns: ["company_id"];
            isOneToOne: false;
            referencedRelation: "companies";
            referencedColumns: ["id"];
          },
        ];
      };
      training_modules: {
        Row: TrainingModule;
        Insert: Omit<TrainingModule, "id" | "created_at" | "updated_at"> & {
          id?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Omit<TrainingModule, "id" | "company_id" | "created_by">>;
        Relationships: [
          {
            foreignKeyName: "training_modules_company_id_fkey";
            columns: ["company_id"];
            isOneToOne: false;
            referencedRelation: "companies";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "training_modules_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      training_slides: {
        Row: TrainingSlide;
        Insert: Omit<TrainingSlide, "id" | "created_at" | "updated_at"> & {
          id?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Omit<TrainingSlide, "id" | "module_id" | "company_id">>;
        Relationships: [
          {
            foreignKeyName: "training_slides_module_id_fkey";
            columns: ["module_id"];
            isOneToOne: false;
            referencedRelation: "training_modules";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "training_slides_company_id_fkey";
            columns: ["company_id"];
            isOneToOne: false;
            referencedRelation: "companies";
            referencedColumns: ["id"];
          },
        ];
      };
      quiz_questions: {
        Row: QuizQuestionRow;
        Insert: Omit<QuizQuestionRow, "id" | "created_at" | "updated_at"> & {
          id?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Omit<QuizQuestionRow, "id" | "module_id" | "company_id">>;
        Relationships: [
          {
            foreignKeyName: "quiz_questions_module_id_fkey";
            columns: ["module_id"];
            isOneToOne: false;
            referencedRelation: "training_modules";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "quiz_questions_company_id_fkey";
            columns: ["company_id"];
            isOneToOne: false;
            referencedRelation: "companies";
            referencedColumns: ["id"];
          },
        ];
      };
      training_assignments: {
        Row: TrainingAssignment;
        Insert: Omit<
          TrainingAssignment,
          "id" | "assigned_at" | "completion_email_sent_at"
        > & {
          id?: string;
          assigned_at?: string;
          completion_email_sent_at?: string | null;
        };
        Update: Partial<Omit<TrainingAssignment, "id" | "employee_id" | "module_id" | "assigned_by">>;
        Relationships: [
          {
            foreignKeyName: "training_assignments_employee_id_fkey";
            columns: ["employee_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "training_assignments_module_id_fkey";
            columns: ["module_id"];
            isOneToOne: false;
            referencedRelation: "training_modules";
            referencedColumns: ["id"];
          },
        ];
      };
      quiz_attempts: {
        Row: QuizAttempt;
        Insert: Omit<QuizAttempt, "id"> & {
          id?: string;
        };
        Update: Partial<Omit<QuizAttempt, "id" | "employee_id" | "module_id" | "company_id">>;
        Relationships: [
          {
            foreignKeyName: "quiz_attempts_assignment_id_fkey";
            columns: ["assignment_id"];
            isOneToOne: false;
            referencedRelation: "training_assignments";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "quiz_attempts_employee_id_fkey";
            columns: ["employee_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "quiz_attempts_module_id_fkey";
            columns: ["module_id"];
            isOneToOne: false;
            referencedRelation: "training_modules";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "quiz_attempts_company_id_fkey";
            columns: ["company_id"];
            isOneToOne: false;
            referencedRelation: "companies";
            referencedColumns: ["id"];
          },
        ];
      };
      quiz_attempt_answers: {
        Row: QuizAttemptAnswer;
        Insert: Omit<QuizAttemptAnswer, "id" | "created_at"> & {
          id?: string;
          created_at?: string;
        };
        Update: Partial<Omit<QuizAttemptAnswer, "id" | "attempt_id" | "question_id">>;
        Relationships: [
          {
            foreignKeyName: "quiz_attempt_answers_attempt_id_fkey";
            columns: ["attempt_id"];
            isOneToOne: false;
            referencedRelation: "quiz_attempts";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "quiz_attempt_answers_question_id_fkey";
            columns: ["question_id"];
            isOneToOne: false;
            referencedRelation: "quiz_questions";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
