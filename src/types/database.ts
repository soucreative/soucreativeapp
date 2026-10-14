// ============================================================
// SOU Creative — Database Types (Supabase)
// ============================================================

// ---- Enums ----

export type WorkRegime = 'full_time' | 'part_time'
export type ProposalStatus = 'draft' | 'sent' | 'awaiting' | 'won' | 'lost'
export type EmployeeStatus = 'active' | 'inactive' | 'on_leave'
export type ContractType = 'permanent' | 'fixed_term' | 'internship' | 'service_agreement'
export type ContractStatus = 'active' | 'terminated' | 'expired'
export type VariableModel = '1' | '2' | '3'
export type ObjectiveType = 'individual' | 'team' | 'department'
export type ObjectiveStatus = 'pending' | 'in_progress' | 'completed' | 'cancelled'
export type ReviewStatus = 'draft' | 'submitted' | 'approved'
export type PaymentStatus = 'pending' | 'paid' | 'overdue'
export type BillingType = 'monthly' | 'project'
export type UserRole = 'master' | 'management' | 'director' | 'employee' | 'intern' | 'admin'
export type AbsenceType = 'vacation' | 'sick_leave' | 'justified' | 'unjustified' | 'other' | 'company_day'
export type AbsenceStatus = 'pending' | 'approved' | 'rejected'

// ---- Variable Rule Data (JSONB) ----

export interface VariableModel1Tier {
  min: number        // % mínima de target
  max: number | null // % máxima (null = sem limite)
  pct: number        // % do variável a pagar
}
export interface VariableModel1Data {
  tiers: VariableModel1Tier[]
}

export interface VariableModel2Objective {
  name: string
  weight: number     // 0–1, soma deve ser 1
  target?: number
  actual?: number
}
export interface VariableModel2Data {
  objectives: VariableModel2Objective[]
}

export interface VariableModel3Data {
  team_weight: number        // normalmente 0.7
  individual_weight: number  // normalmente 0.3
}

export type VariableRuleData = VariableModel1Data | VariableModel2Data | VariableModel3Data

// ---- Table Row Types ----

export type PositionType = 'director' | 'employee' | 'professional_intern' | 'curricular_intern' | 'management'

export interface Employee {
  id: string
  auth_user_id: string | null
  first_name: string
  last_name: string
  /** Opcional — nem todos os colaboradores têm acesso à plataforma */
  email: string | null
  phone: string | null
  role: string
  department: string | null
  position_type: PositionType
  app_role: UserRole
  status: EmployeeStatus
  work_regime: WorkRegime
  days_per_week: number | null
  start_date: string
  end_date: string | null
  notes: string | null
  clickup_user_id?: number | null
  utilization_pct?: number | null
  outros_pct?: number | null
  created_at: string
  updated_at: string
}

export interface Contract {
  id: string
  employee_id: string
  contract_type: ContractType
  start_date: string
  end_date: string | null
  status: ContractStatus
  document_url: string | null
  notes: string | null
  created_at: string
  updated_at: string
}

export interface Compensation {
  id: string
  employee_id: string
  base_salary: number
  variable_model: VariableModel | null
  effective_date: string
  end_date: string | null
  notes: string | null
  created_at: string
  updated_at: string
}

export interface VariableRule {
  id: string
  employee_id: string
  model: VariableModel
  max_variable_amount: number | null
  rule_data: VariableRuleData
  effective_date: string
  end_date: string | null
  created_at: string
  updated_at: string
}

export interface Objective {
  id: string
  employee_id: string | null
  title: string
  description: string | null
  weight: number | null
  target_value: number | null
  actual_value: number | null
  unit: string | null
  year: number
  quarter: number | null
  type: ObjectiveType
  department: string | null
  responsible_id: string | null
  minimum_base: number | null
  status: ObjectiveStatus
  created_at: string
  updated_at: string
}

export interface PerformanceRecord {
  id: string
  employee_id: string
  year: number
  month: number
  target_achievement_pct: number | null
  variable_earned: number | null
  model_calculation: Record<string, unknown> | null
  notes: string | null
  created_at: string
  updated_at: string
}

export interface QuarterlyReview {
  id: string
  employee_id: string
  reviewer_id: string | null
  year: number
  quarter: number
  score: number | null
  qualitative_notes: string | null
  strengths: string | null
  areas_for_improvement: string | null
  status: ReviewStatus
  submitted_at: string | null
  approved_at: string | null
  created_at: string
  updated_at: string
}

export interface AnnualBonus {
  id: string
  employee_id: string
  year: number
  total_amount: number
  first_payment_amount: number         // gerado: total_amount * 0.5
  first_payment_date: string | null
  first_payment_status: PaymentStatus
  second_payment_amount: number        // gerado: total_amount * 0.5
  second_payment_deadline: string      // gerado: 90 dias após 1 jan do ano seguinte
  second_payment_date: string | null
  second_payment_status: PaymentStatus
  notes: string | null
  created_at: string
  updated_at: string
}

export interface FinancialRecord {
  id: string
  year: number
  month: number
  revenue: number
  other_revenue: number               // subsídios, apoios e outros proveitos não TOC
  other_revenue_notes: string | null  // origem/descrição dos outros proveitos
  plunet_revenue: number              // faturação registada no Plunet (introdução manual)
  fse: number                         // só custo operacional — o mapa toc_expense_map decide
  fse_exclusion: number               // ajuste manual ao FSE na sync TOC
  fse_exclusion_notes: string | null  // razão da exclusão
  fse_suppliers: number  // auto-calculado a partir de fornecedores
  direct_costs: number
  financial_costs: number             // juros e encargos (contas 69) — abaixo do EBITDA
  investments: number                 // imobilizado (contas 4) — abaixo do EBITDA
  /** Contas de despesa sem classificação quando o mês foi sincronizado; entraram no FSE */
  unmapped_accounts: { account_code: string; description: string; amount: number }[]
  total_payroll: number
  ebitda: number  // gerado: revenue + other_revenue + plunet_revenue - fse - fse_suppliers - direct_costs - total_payroll
  notes: string | null
  created_at: string
  updated_at: string
}

export interface Absence {
  id: string
  employee_id: string
  type: AbsenceType
  start_date: string
  end_date: string
  working_days: number
  status: AbsenceStatus
  notes: string | null
  created_at: string
  updated_at: string
}

export type AbsenceInsert = Omit<Absence, 'id' | 'created_at' | 'updated_at'>
export type AbsenceUpdate = Partial<AbsenceInsert>

// ---- Vacation Settings (per year) ----

export interface VacationSettings {
  id: string
  year: number
  company_gift_day: string | null   // YYYY-MM-DD (Dec 24 or Dec 31)
  bridge_day: string | null          // YYYY-MM-DD (must be Mon or Fri)
  notes: string | null
  created_at: string
  updated_at: string
}

export type VacationSettingsInsert = Omit<VacationSettings, 'id' | 'created_at' | 'updated_at'>
export type VacationSettingsUpdate = Partial<VacationSettingsInsert>

// ---- Vacation Prize Exchange (per employee per year) ----

export interface VacationPrizeExchange {
  id: string
  employee_id: string
  year: number
  extra_days: number           // 0–7
  prize_amount_deducted: number
  notes: string | null
  created_at: string
  updated_at: string
}

export type VacationPrizeExchangeInsert = Omit<VacationPrizeExchange, 'id' | 'created_at' | 'updated_at'>
export type VacationPrizeExchangeUpdate = Partial<VacationPrizeExchangeInsert>

// ---- CRM Comercial ----

export interface Client {
  id: string
  name: string
  sector: string | null
  contact_name: string | null
  contact_email: string | null
  contact_phone: string | null
  notes: string | null
  created_at: string
  clickup_folder_name: string | null
  toc_tax_id: string | null
}
export type ClientInsert = Omit<Client, 'id' | 'created_at'>

export interface Proposal {
  id: string
  client_id: string | null
  title: string
  description: string | null
  status: ProposalStatus
  probability: number
  sent_date: string | null
  decision_date: string | null
  delivery_start: string | null
  delivery_end: string | null
  total_value: number | null
  next_action: string | null
  next_action_date: string | null
  lost_reason: string | null
  notes: string | null
  created_by: string | null
  created_at: string
  updated_at: string
  // joined
  client?: Client
}
export type ProposalInsert = Omit<Proposal, 'id' | 'total_value' | 'created_at' | 'updated_at' | 'client'>

export interface ProposalLine {
  id: string
  proposal_id: string
  department: string
  description: string | null
  hours: number
  hourly_rate: number
  amount: number
  created_at: string
}
export type ProposalLineInsert = Omit<ProposalLine, 'id' | 'amount' | 'created_at'>

export interface Freelancer {
  id: string
  name: string
  email: string | null
  nif: string | null
  service_type: string | null
  billing_type: BillingType
  default_monthly_cost: number | null
  status: EmployeeStatus
  notes: string | null
  created_at: string
  updated_at: string
}

export interface FreelancerCost {
  id: string
  freelancer_id: string
  year: number
  month: number | null
  project_name: string | null
  amount: number
  invoice_ref: string | null
  status: PaymentStatus
  paid_at: string | null
  notes: string | null
  created_at: string
  updated_at: string
}

// ---- Suppliers (Fornecedores) ----

export type SupplierStatus = 'active' | 'inactive'
export type SupplierCostStatus = 'pending' | 'paid' | 'overdue'

export interface Supplier {
  id: string
  name: string
  email: string | null
  nif: string | null
  service_type: string | null
  status: SupplierStatus
  notes: string | null
  clickup_user_id: number | null
  hourly_rate: number | null
  created_at: string
  updated_at: string
}

export interface SupplierCost {
  id: string
  supplier_id: string
  year: number
  month: number
  department: string | null
  amount: number
  invoice_ref: string | null
  status: SupplierCostStatus
  paid_at: string | null
  notes: string | null
  hours: number | null
  clickup_approved: boolean
  created_at: string
  updated_at: string
}

export type SupplierInsert = Omit<Supplier, 'id' | 'created_at' | 'updated_at'>
export type SupplierUpdate = Partial<SupplierInsert>
export type SupplierCostInsert = Omit<SupplierCost, 'id' | 'created_at' | 'updated_at'>
export type SupplierCostUpdate = Partial<SupplierCostInsert>

export interface EmployeeTaxInfo {
  id: string
  employee_id: string
  nif: string | null
  niss: string | null
  date_of_birth: string | null
  address: string | null
  city: string | null
  postal_code: string | null
  iban: string | null
  marital_status: 'single' | 'married_two_earners' | 'married_single_earner'
  dependents_count: number
  is_disabled: boolean
  social_security_rate: number
  meal_allowance_daily: number | null
  meal_allowance_type: 'card' | 'cash'
  working_days_per_month: number
  /** 'full' = pagos em junho e novembro · 'twelfths' = duodécimos · 'none' = sem subsídios (estágio) */
  subsidy_payment_mode: 'full' | 'twelfths' | 'none'
  prize_payment_method: 'payroll' | 'km_map' | 'tax_exempt' | 'prize_exempt'
  km_monthly_amount: number | null
  created_at: string
  updated_at: string
}

// ---- Cost Center Records ----

export interface CostCenterRecord {
  id: string
  year: number
  month: number
  cost_center: string
  revenue: number
  /** Parte de `revenue` que a fatura atribui ao departamento; o resto foi repartido por uma regra */
  revenue_direct: number
  fse: number
  direct_costs: number
  payroll: number
  notes: string | null
  created_at: string
  updated_at: string
}

export type CostCenterRecordInsert = Omit<CostCenterRecord, 'id' | 'created_at' | 'updated_at'>
export type CostCenterRecordUpdate = Partial<CostCenterRecordInsert>

// ---- Sprints ----

export type SprintGoalType = 'revenue' | 'proposals'

export interface Sprint {
  id: string
  title: string
  goal_type: SprintGoalType
  goal_value: number
  start_date: string
  end_date: string
  created_by: string | null
  tip: string | null
  tip_generated_at: string | null
  created_at: string
}
export type SprintInsert = Omit<Sprint, 'id' | 'tip' | 'tip_generated_at' | 'created_at'>

// ---- Kudos ----

export type KudosCategory = 'focus' | 'collaboration' | 'creativity' | 'execution'

export interface Kudos {
  id: string
  from_employee_id: string
  to_employee_id: string
  category: KudosCategory
  message: string | null
  created_at: string
  from_employee?: Pick<Employee, 'id' | 'first_name' | 'last_name'>
  to_employee?: Pick<Employee, 'id' | 'first_name' | 'last_name'>
}
export type KudosInsert = Omit<Kudos, 'id' | 'created_at' | 'from_employee' | 'to_employee'>

// ---- Insert / Update Types ----
// Campos gerados (GENERATED ALWAYS AS) e timestamps são omitidos nos inserts

export type EmployeeInsert = Omit<Employee, 'id' | 'created_at' | 'updated_at'>
export type EmployeeUpdate = Partial<EmployeeInsert>

export type ContractInsert = Omit<Contract, 'id' | 'created_at' | 'updated_at'>
export type ContractUpdate = Partial<ContractInsert>

export type CompensationInsert = Omit<Compensation, 'id' | 'created_at' | 'updated_at'>
export type CompensationUpdate = Partial<CompensationInsert>

export type VariableRuleInsert = Omit<VariableRule, 'id' | 'created_at' | 'updated_at'>
export type VariableRuleUpdate = Partial<VariableRuleInsert>

export type ObjectiveInsert = Omit<Objective, 'id' | 'created_at' | 'updated_at'>
export type ObjectiveUpdate = Partial<ObjectiveInsert>

export type PerformanceRecordInsert = Omit<PerformanceRecord, 'id' | 'created_at' | 'updated_at'>
export type PerformanceRecordUpdate = Partial<PerformanceRecordInsert>

export type QuarterlyReviewInsert = Omit<QuarterlyReview, 'id' | 'created_at' | 'updated_at'>
export type QuarterlyReviewUpdate = Partial<QuarterlyReviewInsert>

export type AnnualBonusInsert = Omit<AnnualBonus, 'id' | 'created_at' | 'updated_at' | 'first_payment_amount' | 'second_payment_amount' | 'second_payment_deadline'>
export type AnnualBonusUpdate = Partial<AnnualBonusInsert>

export type FinancialRecordInsert = Omit<FinancialRecord, 'id' | 'created_at' | 'updated_at' | 'ebitda' | 'fse_suppliers'>
export type FinancialRecordUpdate = Partial<FinancialRecordInsert>

export type FreelancerInsert = Omit<Freelancer, 'id' | 'created_at' | 'updated_at'>
export type FreelancerUpdate = Partial<FreelancerInsert>

export type FreelancerCostInsert = Omit<FreelancerCost, 'id' | 'created_at' | 'updated_at'>
export type FreelancerCostUpdate = Partial<FreelancerCostInsert>

export type EmployeeTaxInfoInsert = Omit<EmployeeTaxInfo, 'id' | 'created_at' | 'updated_at'>
export type EmployeeTaxInfoUpdate = Partial<EmployeeTaxInfoInsert>

// ---- Supabase Database Type (para createClient<Database>) ----

export type Database = {
  public: {
    Tables: {
      employees: {
        Row: Employee
        Insert: EmployeeInsert
        Update: EmployeeUpdate
      }
      contracts: {
        Row: Contract
        Insert: ContractInsert
        Update: ContractUpdate
      }
      compensation: {
        Row: Compensation
        Insert: CompensationInsert
        Update: CompensationUpdate
      }
      variable_rules: {
        Row: VariableRule
        Insert: VariableRuleInsert
        Update: VariableRuleUpdate
      }
      objectives: {
        Row: Objective
        Insert: ObjectiveInsert
        Update: ObjectiveUpdate
      }
      performance_records: {
        Row: PerformanceRecord
        Insert: PerformanceRecordInsert
        Update: PerformanceRecordUpdate
      }
      quarterly_reviews: {
        Row: QuarterlyReview
        Insert: QuarterlyReviewInsert
        Update: QuarterlyReviewUpdate
      }
      annual_bonus: {
        Row: AnnualBonus
        Insert: AnnualBonusInsert
        Update: AnnualBonusUpdate
      }
      financial_records: {
        Row: FinancialRecord
        Insert: FinancialRecordInsert
        Update: FinancialRecordUpdate
      }
      freelancers: {
        Row: Freelancer
        Insert: FreelancerInsert
        Update: FreelancerUpdate
      }
      freelancer_costs: {
        Row: FreelancerCost
        Insert: FreelancerCostInsert
        Update: FreelancerCostUpdate
      }
      cost_center_records: {
        Row: CostCenterRecord
        Insert: CostCenterRecordInsert
        Update: CostCenterRecordUpdate
      }
      suppliers: {
        Row: Supplier
        Insert: SupplierInsert
        Update: SupplierUpdate
      }
      supplier_costs: {
        Row: SupplierCost
        Insert: SupplierCostInsert
        Update: SupplierCostUpdate
      }
      absences: {
        Row: Absence
        Insert: AbsenceInsert
        Update: AbsenceUpdate
      }
      vacation_settings: {
        Row: VacationSettings
        Insert: VacationSettingsInsert
        Update: VacationSettingsUpdate
      }
      vacation_prize_exchanges: {
        Row: VacationPrizeExchange
        Insert: VacationPrizeExchangeInsert
        Update: VacationPrizeExchangeUpdate
      }
    }
    Views: Record<string, never>
    Functions: {
      get_user_role: {
        Args: Record<string, never>
        Returns: UserRole
      }
      get_employee_id: {
        Args: Record<string, never>
        Returns: string
      }
    }
    Enums: {
      work_regime: WorkRegime
      employee_status: EmployeeStatus
      contract_type: ContractType
      contract_status: ContractStatus
      variable_model: VariableModel
      objective_type: ObjectiveType
      objective_status: ObjectiveStatus
      review_status: ReviewStatus
      payment_status: PaymentStatus
      billing_type: BillingType
      user_role: UserRole
    }
  }
}
