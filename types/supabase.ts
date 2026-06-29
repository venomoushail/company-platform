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
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
