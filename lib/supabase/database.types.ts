export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      tb810_account_transactions: {
        Row: {
          amount: number
          created_at: string
          created_by: string | null
          credit_id: string | null
          credit_transfer_id: string | null
          id: string
          invoice_id: string | null
          legacy_id: string | null
          legacy_metadata: Json
          legacy_table: string | null
          notes: string | null
          payment_allocation_id: string | null
          payment_id: string | null
          reference_id: string | null
          reference_type: string | null
          transaction_type: Database["public"]["Enums"]["tb810_account_transaction_type"]
          unit_account_id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          amount: number
          created_at?: string
          created_by?: string | null
          credit_id?: string | null
          credit_transfer_id?: string | null
          id?: string
          invoice_id?: string | null
          legacy_id?: string | null
          legacy_metadata?: Json
          legacy_table?: string | null
          notes?: string | null
          payment_allocation_id?: string | null
          payment_id?: string | null
          reference_id?: string | null
          reference_type?: string | null
          transaction_type: Database["public"]["Enums"]["tb810_account_transaction_type"]
          unit_account_id: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          amount?: number
          created_at?: string
          created_by?: string | null
          credit_id?: string | null
          credit_transfer_id?: string | null
          id?: string
          invoice_id?: string | null
          legacy_id?: string | null
          legacy_metadata?: Json
          legacy_table?: string | null
          notes?: string | null
          payment_allocation_id?: string | null
          payment_id?: string | null
          reference_id?: string | null
          reference_type?: string | null
          transaction_type?: Database["public"]["Enums"]["tb810_account_transaction_type"]
          unit_account_id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tb810_account_transactions_credit_id_fkey"
            columns: ["credit_id"]
            isOneToOne: false
            referencedRelation: "tb810_credits"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tb810_account_transactions_credit_transfer_id_fkey"
            columns: ["credit_transfer_id"]
            isOneToOne: false
            referencedRelation: "tb810_credit_transfers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tb810_account_transactions_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "tb810_invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tb810_account_transactions_payment_allocation_id_fkey"
            columns: ["payment_allocation_id"]
            isOneToOne: false
            referencedRelation: "tb810_payment_allocations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tb810_account_transactions_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "tb810_payments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tb810_account_transactions_unit_account_id_fkey"
            columns: ["unit_account_id"]
            isOneToOne: false
            referencedRelation: "tb810_unit_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      tb810_audit_logs: {
        Row: {
          action: Database["public"]["Enums"]["tb810_audit_action"]
          actor_staff_profile_id: string | null
          building_id: string | null
          created_at: string
          entity_id: string | null
          entity_table: string
          id: string
          metadata: Json
          reason: string | null
        }
        Insert: {
          action: Database["public"]["Enums"]["tb810_audit_action"]
          actor_staff_profile_id?: string | null
          building_id?: string | null
          created_at?: string
          entity_id?: string | null
          entity_table: string
          id?: string
          metadata?: Json
          reason?: string | null
        }
        Update: {
          action?: Database["public"]["Enums"]["tb810_audit_action"]
          actor_staff_profile_id?: string | null
          building_id?: string | null
          created_at?: string
          entity_id?: string | null
          entity_table?: string
          id?: string
          metadata?: Json
          reason?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tb810_audit_logs_actor_staff_profile_id_fkey"
            columns: ["actor_staff_profile_id"]
            isOneToOne: false
            referencedRelation: "tb810_staff_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tb810_audit_logs_building_id_fkey"
            columns: ["building_id"]
            isOneToOne: false
            referencedRelation: "tb810_buildings"
            referencedColumns: ["id"]
          },
        ]
      }
      tb810_billing_periods: {
        Row: {
          approval_notes: string | null
          approved_at: string | null
          approved_by: string | null
          building_id: string
          created_at: string
          ends_on: string
          id: string
          legacy_id: string | null
          legacy_metadata: Json
          legacy_table: string | null
          notes: string | null
          period_month: number
          period_year: number
          starts_on: string
          status: string
          updated_at: string
        }
        Insert: {
          approval_notes?: string | null
          approved_at?: string | null
          approved_by?: string | null
          building_id: string
          created_at?: string
          ends_on: string
          id?: string
          legacy_id?: string | null
          legacy_metadata?: Json
          legacy_table?: string | null
          notes?: string | null
          period_month: number
          period_year: number
          starts_on: string
          status?: string
          updated_at?: string
        }
        Update: {
          approval_notes?: string | null
          approved_at?: string | null
          approved_by?: string | null
          building_id?: string
          created_at?: string
          ends_on?: string
          id?: string
          legacy_id?: string | null
          legacy_metadata?: Json
          legacy_table?: string | null
          notes?: string | null
          period_month?: number
          period_year?: number
          starts_on?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tb810_billing_periods_building_id_fkey"
            columns: ["building_id"]
            isOneToOne: false
            referencedRelation: "tb810_buildings"
            referencedColumns: ["id"]
          },
        ]
      }
      tb810_buildings: {
        Row: {
          address: string | null
          contact_email: string | null
          contact_phone: string | null
          created_at: string
          id: string
          legacy_id: string | null
          legacy_metadata: Json
          legacy_table: string | null
          legal_name: string | null
          name: string
          notes: string | null
          tax_id: string | null
          updated_at: string
        }
        Insert: {
          address?: string | null
          contact_email?: string | null
          contact_phone?: string | null
          created_at?: string
          id?: string
          legacy_id?: string | null
          legacy_metadata?: Json
          legacy_table?: string | null
          legal_name?: string | null
          name: string
          notes?: string | null
          tax_id?: string | null
          updated_at?: string
        }
        Update: {
          address?: string | null
          contact_email?: string | null
          contact_phone?: string | null
          created_at?: string
          id?: string
          legacy_id?: string | null
          legacy_metadata?: Json
          legacy_table?: string | null
          legal_name?: string | null
          name?: string
          notes?: string | null
          tax_id?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      tb810_communications: {
        Row: {
          body: string | null
          building_id: string
          channel: string
          created_at: string
          created_by: string | null
          id: string
          legacy_id: string | null
          legacy_metadata: Json
          legacy_table: string | null
          notes: string | null
          owner_id: string | null
          sent_at: string | null
          status: Database["public"]["Enums"]["tb810_communication_status"]
          subject: string | null
          unit_account_id: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          body?: string | null
          building_id: string
          channel: string
          created_at?: string
          created_by?: string | null
          id?: string
          legacy_id?: string | null
          legacy_metadata?: Json
          legacy_table?: string | null
          notes?: string | null
          owner_id?: string | null
          sent_at?: string | null
          status?: Database["public"]["Enums"]["tb810_communication_status"]
          subject?: string | null
          unit_account_id?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          body?: string | null
          building_id?: string
          channel?: string
          created_at?: string
          created_by?: string | null
          id?: string
          legacy_id?: string | null
          legacy_metadata?: Json
          legacy_table?: string | null
          notes?: string | null
          owner_id?: string | null
          sent_at?: string | null
          status?: Database["public"]["Enums"]["tb810_communication_status"]
          subject?: string | null
          unit_account_id?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tb810_communications_building_id_fkey"
            columns: ["building_id"]
            isOneToOne: false
            referencedRelation: "tb810_buildings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tb810_communications_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "tb810_owners"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tb810_communications_unit_account_id_fkey"
            columns: ["unit_account_id"]
            isOneToOne: false
            referencedRelation: "tb810_unit_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      tb810_credit_transfers: {
        Row: {
          amount: number
          approved_at: string | null
          approved_by: string | null
          created_at: string
          created_by: string | null
          destination_unit_account_id: string
          id: string
          legacy_id: string | null
          legacy_metadata: Json
          legacy_table: string | null
          notes: string | null
          reason: string
          source_unit_account_id: string
          status: Database["public"]["Enums"]["tb810_credit_transfer_status"]
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          amount: number
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          created_by?: string | null
          destination_unit_account_id: string
          id?: string
          legacy_id?: string | null
          legacy_metadata?: Json
          legacy_table?: string | null
          notes?: string | null
          reason: string
          source_unit_account_id: string
          status?: Database["public"]["Enums"]["tb810_credit_transfer_status"]
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          amount?: number
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          created_by?: string | null
          destination_unit_account_id?: string
          id?: string
          legacy_id?: string | null
          legacy_metadata?: Json
          legacy_table?: string | null
          notes?: string | null
          reason?: string
          source_unit_account_id?: string
          status?: Database["public"]["Enums"]["tb810_credit_transfer_status"]
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tb810_credit_transfers_destination_unit_account_id_fkey"
            columns: ["destination_unit_account_id"]
            isOneToOne: false
            referencedRelation: "tb810_unit_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tb810_credit_transfers_source_unit_account_id_fkey"
            columns: ["source_unit_account_id"]
            isOneToOne: false
            referencedRelation: "tb810_unit_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      tb810_credits: {
        Row: {
          amount: number
          created_at: string
          created_by: string | null
          id: string
          legacy_id: string | null
          legacy_metadata: Json
          legacy_table: string | null
          notes: string | null
          remaining_amount: number
          source_id: string | null
          source_type: string
          status: Database["public"]["Enums"]["tb810_credit_status"]
          unit_account_id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          amount: number
          created_at?: string
          created_by?: string | null
          id?: string
          legacy_id?: string | null
          legacy_metadata?: Json
          legacy_table?: string | null
          notes?: string | null
          remaining_amount: number
          source_id?: string | null
          source_type: string
          status?: Database["public"]["Enums"]["tb810_credit_status"]
          unit_account_id: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          amount?: number
          created_at?: string
          created_by?: string | null
          id?: string
          legacy_id?: string | null
          legacy_metadata?: Json
          legacy_table?: string | null
          notes?: string | null
          remaining_amount?: number
          source_id?: string | null
          source_type?: string
          status?: Database["public"]["Enums"]["tb810_credit_status"]
          unit_account_id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tb810_credits_unit_account_id_fkey"
            columns: ["unit_account_id"]
            isOneToOne: false
            referencedRelation: "tb810_unit_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      tb810_documents: {
        Row: {
          building_id: string
          created_at: string
          created_by: string | null
          credit_id: string | null
          credit_transfer_id: string | null
          document_type: string
          id: string
          invoice_id: string | null
          legacy_id: string | null
          legacy_metadata: Json
          legacy_table: string | null
          metadata: Json
          mime_type: string | null
          original_name: string | null
          owner_id: string | null
          payment_allocation_id: string | null
          payment_id: string | null
          size_bytes: number | null
          status: Database["public"]["Enums"]["tb810_document_status"]
          storage_bucket: string | null
          storage_path: string | null
          unit_account_id: string | null
          unit_id: string | null
          updated_at: string
          updated_by: string | null
          utility_bill_id: string | null
        }
        Insert: {
          building_id: string
          created_at?: string
          created_by?: string | null
          credit_id?: string | null
          credit_transfer_id?: string | null
          document_type: string
          id?: string
          invoice_id?: string | null
          legacy_id?: string | null
          legacy_metadata?: Json
          legacy_table?: string | null
          metadata?: Json
          mime_type?: string | null
          original_name?: string | null
          owner_id?: string | null
          payment_allocation_id?: string | null
          payment_id?: string | null
          size_bytes?: number | null
          status?: Database["public"]["Enums"]["tb810_document_status"]
          storage_bucket?: string | null
          storage_path?: string | null
          unit_account_id?: string | null
          unit_id?: string | null
          updated_at?: string
          updated_by?: string | null
          utility_bill_id?: string | null
        }
        Update: {
          building_id?: string
          created_at?: string
          created_by?: string | null
          credit_id?: string | null
          credit_transfer_id?: string | null
          document_type?: string
          id?: string
          invoice_id?: string | null
          legacy_id?: string | null
          legacy_metadata?: Json
          legacy_table?: string | null
          metadata?: Json
          mime_type?: string | null
          original_name?: string | null
          owner_id?: string | null
          payment_allocation_id?: string | null
          payment_id?: string | null
          size_bytes?: number | null
          status?: Database["public"]["Enums"]["tb810_document_status"]
          storage_bucket?: string | null
          storage_path?: string | null
          unit_account_id?: string | null
          unit_id?: string | null
          updated_at?: string
          updated_by?: string | null
          utility_bill_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tb810_documents_building_id_fkey"
            columns: ["building_id"]
            isOneToOne: false
            referencedRelation: "tb810_buildings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tb810_documents_credit_id_fkey"
            columns: ["credit_id"]
            isOneToOne: false
            referencedRelation: "tb810_credits"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tb810_documents_credit_transfer_id_fkey"
            columns: ["credit_transfer_id"]
            isOneToOne: false
            referencedRelation: "tb810_credit_transfers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tb810_documents_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "tb810_invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tb810_documents_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "tb810_owners"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tb810_documents_payment_allocation_id_fkey"
            columns: ["payment_allocation_id"]
            isOneToOne: false
            referencedRelation: "tb810_payment_allocations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tb810_documents_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "tb810_payments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tb810_documents_unit_account_id_fkey"
            columns: ["unit_account_id"]
            isOneToOne: false
            referencedRelation: "tb810_unit_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tb810_documents_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "tb810_units"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tb810_documents_utility_bill_id_fkey"
            columns: ["utility_bill_id"]
            isOneToOne: false
            referencedRelation: "tb810_utility_bills"
            referencedColumns: ["id"]
          },
        ]
      }
      tb810_expenses: {
        Row: {
          amount: number
          building_id: string
          category: string
          created_at: string
          created_by: string | null
          description: string
          expense_date: string
          id: string
          legacy_id: string | null
          legacy_metadata: Json
          legacy_table: string | null
          notes: string | null
          status: string
          supplier_id: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          amount: number
          building_id: string
          category: string
          created_at?: string
          created_by?: string | null
          description: string
          expense_date: string
          id?: string
          legacy_id?: string | null
          legacy_metadata?: Json
          legacy_table?: string | null
          notes?: string | null
          status?: string
          supplier_id?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          amount?: number
          building_id?: string
          category?: string
          created_at?: string
          created_by?: string | null
          description?: string
          expense_date?: string
          id?: string
          legacy_id?: string | null
          legacy_metadata?: Json
          legacy_table?: string | null
          notes?: string | null
          status?: string
          supplier_id?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tb810_expenses_building_id_fkey"
            columns: ["building_id"]
            isOneToOne: false
            referencedRelation: "tb810_buildings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tb810_expenses_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "tb810_suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      tb810_invoice_line_items: {
        Row: {
          amount: number
          created_at: string
          created_by: string | null
          description: string
          id: string
          invoice_id: string
          legacy_id: string | null
          legacy_metadata: Json
          legacy_table: string | null
          line_type: string
          notes: string | null
          quantity: number
          source_id: string | null
          source_type: string | null
          unit_account_id: string
          unit_price: number
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          amount?: number
          created_at?: string
          created_by?: string | null
          description: string
          id?: string
          invoice_id: string
          legacy_id?: string | null
          legacy_metadata?: Json
          legacy_table?: string | null
          line_type: string
          notes?: string | null
          quantity?: number
          source_id?: string | null
          source_type?: string | null
          unit_account_id: string
          unit_price?: number
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          amount?: number
          created_at?: string
          created_by?: string | null
          description?: string
          id?: string
          invoice_id?: string
          legacy_id?: string | null
          legacy_metadata?: Json
          legacy_table?: string | null
          line_type?: string
          notes?: string | null
          quantity?: number
          source_id?: string | null
          source_type?: string | null
          unit_account_id?: string
          unit_price?: number
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tb810_invoice_line_items_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "tb810_invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tb810_invoice_line_items_unit_account_id_fkey"
            columns: ["unit_account_id"]
            isOneToOne: false
            referencedRelation: "tb810_unit_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      tb810_invoices: {
        Row: {
          amount_paid: number
          approved_at: string | null
          approved_by: string | null
          balance_due: number
          billing_period_id: string
          building_id: string
          created_at: string
          due_date: string | null
          generated_at: string | null
          generated_by: string | null
          id: string
          invoice_number: string
          issue_date: string
          legacy_id: string | null
          legacy_metadata: Json
          legacy_table: string | null
          notes: string | null
          owner_id: string
          presentation_name: string | null
          reversed_at: string | null
          reversed_by: string | null
          sent_at: string | null
          status: Database["public"]["Enums"]["tb810_invoice_status"]
          subtotal: number
          total: number
          updated_at: string
        }
        Insert: {
          amount_paid?: number
          approved_at?: string | null
          approved_by?: string | null
          balance_due?: number
          billing_period_id: string
          building_id: string
          created_at?: string
          due_date?: string | null
          generated_at?: string | null
          generated_by?: string | null
          id?: string
          invoice_number: string
          issue_date?: string
          legacy_id?: string | null
          legacy_metadata?: Json
          legacy_table?: string | null
          notes?: string | null
          owner_id: string
          presentation_name?: string | null
          reversed_at?: string | null
          reversed_by?: string | null
          sent_at?: string | null
          status?: Database["public"]["Enums"]["tb810_invoice_status"]
          subtotal?: number
          total?: number
          updated_at?: string
        }
        Update: {
          amount_paid?: number
          approved_at?: string | null
          approved_by?: string | null
          balance_due?: number
          billing_period_id?: string
          building_id?: string
          created_at?: string
          due_date?: string | null
          generated_at?: string | null
          generated_by?: string | null
          id?: string
          invoice_number?: string
          issue_date?: string
          legacy_id?: string | null
          legacy_metadata?: Json
          legacy_table?: string | null
          notes?: string | null
          owner_id?: string
          presentation_name?: string | null
          reversed_at?: string | null
          reversed_by?: string | null
          sent_at?: string | null
          status?: Database["public"]["Enums"]["tb810_invoice_status"]
          subtotal?: number
          total?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tb810_invoices_billing_period_id_fkey"
            columns: ["billing_period_id"]
            isOneToOne: false
            referencedRelation: "tb810_billing_periods"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tb810_invoices_building_id_fkey"
            columns: ["building_id"]
            isOneToOne: false
            referencedRelation: "tb810_buildings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tb810_invoices_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "tb810_owners"
            referencedColumns: ["id"]
          },
        ]
      }
      tb810_meter_readings: {
        Row: {
          building_id: string
          consumption: number | null
          created_at: string
          created_by: string | null
          entered_at: string
          entered_by: string | null
          id: string
          legacy_id: string | null
          legacy_metadata: Json
          legacy_table: string | null
          notes: string | null
          reading_date: string
          reading_end: number | null
          reading_start: number | null
          status: string
          unit_id: string
          unit_of_measure: string
          updated_at: string
          updated_by: string | null
          utility_type_id: string
        }
        Insert: {
          building_id: string
          consumption?: number | null
          created_at?: string
          created_by?: string | null
          entered_at?: string
          entered_by?: string | null
          id?: string
          legacy_id?: string | null
          legacy_metadata?: Json
          legacy_table?: string | null
          notes?: string | null
          reading_date: string
          reading_end?: number | null
          reading_start?: number | null
          status?: string
          unit_id: string
          unit_of_measure?: string
          updated_at?: string
          updated_by?: string | null
          utility_type_id: string
        }
        Update: {
          building_id?: string
          consumption?: number | null
          created_at?: string
          created_by?: string | null
          entered_at?: string
          entered_by?: string | null
          id?: string
          legacy_id?: string | null
          legacy_metadata?: Json
          legacy_table?: string | null
          notes?: string | null
          reading_date?: string
          reading_end?: number | null
          reading_start?: number | null
          status?: string
          unit_id?: string
          unit_of_measure?: string
          updated_at?: string
          updated_by?: string | null
          utility_type_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tb810_meter_readings_building_id_fkey"
            columns: ["building_id"]
            isOneToOne: false
            referencedRelation: "tb810_buildings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tb810_meter_readings_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "tb810_units"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tb810_meter_readings_utility_type_id_fkey"
            columns: ["utility_type_id"]
            isOneToOne: false
            referencedRelation: "tb810_utility_types"
            referencedColumns: ["id"]
          },
        ]
      }
      tb810_owners: {
        Row: {
          active: boolean
          created_at: string
          email: string | null
          full_name: string
          id: string
          legacy_id: string | null
          legacy_metadata: Json
          legacy_table: string | null
          notes: string | null
          owner_reference: string
          phone_number: string | null
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          email?: string | null
          full_name: string
          id?: string
          legacy_id?: string | null
          legacy_metadata?: Json
          legacy_table?: string | null
          notes?: string | null
          owner_reference?: string
          phone_number?: string | null
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          email?: string | null
          full_name?: string
          id?: string
          legacy_id?: string | null
          legacy_metadata?: Json
          legacy_table?: string | null
          notes?: string | null
          owner_reference?: string
          phone_number?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      tb810_ownerships: {
        Row: {
          billing_enabled: boolean
          created_at: string
          end_date: string | null
          id: string
          legacy_id: string | null
          legacy_metadata: Json
          legacy_table: string | null
          notes: string | null
          owner_id: string
          ownership_share: number | null
          start_date: string
          unit_id: string
          updated_at: string
        }
        Insert: {
          billing_enabled?: boolean
          created_at?: string
          end_date?: string | null
          id?: string
          legacy_id?: string | null
          legacy_metadata?: Json
          legacy_table?: string | null
          notes?: string | null
          owner_id: string
          ownership_share?: number | null
          start_date?: string
          unit_id: string
          updated_at?: string
        }
        Update: {
          billing_enabled?: boolean
          created_at?: string
          end_date?: string | null
          id?: string
          legacy_id?: string | null
          legacy_metadata?: Json
          legacy_table?: string | null
          notes?: string | null
          owner_id?: string
          ownership_share?: number | null
          start_date?: string
          unit_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tb810_ownerships_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "tb810_owners"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tb810_ownerships_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "tb810_units"
            referencedColumns: ["id"]
          },
        ]
      }
      tb810_payment_allocations: {
        Row: {
          allocation_type: Database["public"]["Enums"]["tb810_payment_allocation_type"]
          amount: number
          created_at: string
          created_by: string | null
          id: string
          invoice_id: string | null
          legacy_id: string | null
          legacy_metadata: Json
          legacy_table: string | null
          notes: string | null
          payment_id: string
          unit_account_id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          allocation_type?: Database["public"]["Enums"]["tb810_payment_allocation_type"]
          amount: number
          created_at?: string
          created_by?: string | null
          id?: string
          invoice_id?: string | null
          legacy_id?: string | null
          legacy_metadata?: Json
          legacy_table?: string | null
          notes?: string | null
          payment_id: string
          unit_account_id: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          allocation_type?: Database["public"]["Enums"]["tb810_payment_allocation_type"]
          amount?: number
          created_at?: string
          created_by?: string | null
          id?: string
          invoice_id?: string | null
          legacy_id?: string | null
          legacy_metadata?: Json
          legacy_table?: string | null
          notes?: string | null
          payment_id?: string
          unit_account_id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tb810_payment_allocations_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "tb810_invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tb810_payment_allocations_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "tb810_payments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tb810_payment_allocations_unit_account_id_fkey"
            columns: ["unit_account_id"]
            isOneToOne: false
            referencedRelation: "tb810_unit_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      tb810_payments: {
        Row: {
          amount_received: number
          building_id: string
          created_at: string
          created_by: string | null
          id: string
          legacy_id: string | null
          legacy_metadata: Json
          legacy_table: string | null
          notes: string | null
          owner_id: string
          payer_name: string | null
          payment_date: string
          payment_method: string
          provider_name: string | null
          provider_reference: string | null
          receipt_number: string | null
          reversed_at: string | null
          reversed_by: string | null
          status: Database["public"]["Enums"]["tb810_payment_status"]
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          amount_received: number
          building_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          legacy_id?: string | null
          legacy_metadata?: Json
          legacy_table?: string | null
          notes?: string | null
          owner_id: string
          payer_name?: string | null
          payment_date: string
          payment_method?: string
          provider_name?: string | null
          provider_reference?: string | null
          receipt_number?: string | null
          reversed_at?: string | null
          reversed_by?: string | null
          status?: Database["public"]["Enums"]["tb810_payment_status"]
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          amount_received?: number
          building_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          legacy_id?: string | null
          legacy_metadata?: Json
          legacy_table?: string | null
          notes?: string | null
          owner_id?: string
          payer_name?: string | null
          payment_date?: string
          payment_method?: string
          provider_name?: string | null
          provider_reference?: string | null
          receipt_number?: string | null
          reversed_at?: string | null
          reversed_by?: string | null
          status?: Database["public"]["Enums"]["tb810_payment_status"]
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tb810_payments_building_id_fkey"
            columns: ["building_id"]
            isOneToOne: false
            referencedRelation: "tb810_buildings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tb810_payments_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "tb810_owners"
            referencedColumns: ["id"]
          },
        ]
      }
      tb810_permissions: {
        Row: {
          created_at: string
          description: string | null
          id: string
          key: string
          legacy_id: string | null
          legacy_metadata: Json
          legacy_table: string | null
          name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          key: string
          legacy_id?: string | null
          legacy_metadata?: Json
          legacy_table?: string | null
          name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          key?: string
          legacy_id?: string | null
          legacy_metadata?: Json
          legacy_table?: string | null
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      tb810_receipts: {
        Row: {
          amount_received: number
          building_id: string
          created_at: string
          generated_at: string
          generated_by: string | null
          id: string
          legacy_id: string | null
          legacy_metadata: Json
          legacy_table: string | null
          notes: string | null
          owner_id: string
          payment_date: string
          payment_id: string
          payment_method: string
          receipt_number: string
          reference_number: string | null
          updated_at: string
        }
        Insert: {
          amount_received: number
          building_id: string
          created_at?: string
          generated_at?: string
          generated_by?: string | null
          id?: string
          legacy_id?: string | null
          legacy_metadata?: Json
          legacy_table?: string | null
          notes?: string | null
          owner_id: string
          payment_date: string
          payment_id: string
          payment_method: string
          receipt_number: string
          reference_number?: string | null
          updated_at?: string
        }
        Update: {
          amount_received?: number
          building_id?: string
          created_at?: string
          generated_at?: string
          generated_by?: string | null
          id?: string
          legacy_id?: string | null
          legacy_metadata?: Json
          legacy_table?: string | null
          notes?: string | null
          owner_id?: string
          payment_date?: string
          payment_id?: string
          payment_method?: string
          receipt_number?: string
          reference_number?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tb810_receipts_building_id_fkey"
            columns: ["building_id"]
            isOneToOne: false
            referencedRelation: "tb810_buildings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tb810_receipts_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "tb810_owners"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tb810_receipts_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: true
            referencedRelation: "tb810_payments"
            referencedColumns: ["id"]
          },
        ]
      }
      tb810_role_permissions: {
        Row: {
          created_at: string
          id: string
          permission_id: string
          role_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          permission_id: string
          role_id: string
        }
        Update: {
          created_at?: string
          id?: string
          permission_id?: string
          role_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tb810_role_permissions_permission_id_fkey"
            columns: ["permission_id"]
            isOneToOne: false
            referencedRelation: "tb810_permissions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tb810_role_permissions_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "tb810_roles"
            referencedColumns: ["id"]
          },
        ]
      }
      tb810_roles: {
        Row: {
          created_at: string
          description: string | null
          id: string
          key: Database["public"]["Enums"]["tb810_role_key"]
          legacy_id: string | null
          legacy_metadata: Json
          legacy_table: string | null
          name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          key: Database["public"]["Enums"]["tb810_role_key"]
          legacy_id?: string | null
          legacy_metadata?: Json
          legacy_table?: string | null
          name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          key?: Database["public"]["Enums"]["tb810_role_key"]
          legacy_id?: string | null
          legacy_metadata?: Json
          legacy_table?: string | null
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      tb810_staff_profiles: {
        Row: {
          created_at: string
          display_name: string
          id: string
          job_title: string | null
          legacy_id: string | null
          legacy_metadata: Json
          legacy_table: string | null
          notes: string | null
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          display_name: string
          id?: string
          job_title?: string | null
          legacy_id?: string | null
          legacy_metadata?: Json
          legacy_table?: string | null
          notes?: string | null
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          display_name?: string
          id?: string
          job_title?: string | null
          legacy_id?: string | null
          legacy_metadata?: Json
          legacy_table?: string | null
          notes?: string | null
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      tb810_staff_roles: {
        Row: {
          created_at: string
          id: string
          role_id: string
          staff_profile_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role_id: string
          staff_profile_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role_id?: string
          staff_profile_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tb810_staff_roles_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "tb810_roles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tb810_staff_roles_staff_profile_id_fkey"
            columns: ["staff_profile_id"]
            isOneToOne: false
            referencedRelation: "tb810_staff_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      tb810_suppliers: {
        Row: {
          active: boolean
          bank_account: string | null
          bank_name: string | null
          bank_route: string | null
          building_id: string
          contact_name: string | null
          created_at: string
          description: string | null
          document_number: string | null
          document_type: string | null
          email: string | null
          id: string
          legacy_id: string | null
          legacy_metadata: Json
          legacy_table: string | null
          name: string
          phone_number: string | null
          updated_at: string
        }
        Insert: {
          active?: boolean
          bank_account?: string | null
          bank_name?: string | null
          bank_route?: string | null
          building_id: string
          contact_name?: string | null
          created_at?: string
          description?: string | null
          document_number?: string | null
          document_type?: string | null
          email?: string | null
          id?: string
          legacy_id?: string | null
          legacy_metadata?: Json
          legacy_table?: string | null
          name: string
          phone_number?: string | null
          updated_at?: string
        }
        Update: {
          active?: boolean
          bank_account?: string | null
          bank_name?: string | null
          bank_route?: string | null
          building_id?: string
          contact_name?: string | null
          created_at?: string
          description?: string | null
          document_number?: string | null
          document_type?: string | null
          email?: string | null
          id?: string
          legacy_id?: string | null
          legacy_metadata?: Json
          legacy_table?: string | null
          name?: string
          phone_number?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tb810_suppliers_building_id_fkey"
            columns: ["building_id"]
            isOneToOne: false
            referencedRelation: "tb810_buildings"
            referencedColumns: ["id"]
          },
        ]
      }
      tb810_unit_accounts: {
        Row: {
          account_number: string
          building_id: string
          created_at: string
          credit_balance: number
          current_balance: number
          id: string
          legacy_id: string | null
          legacy_metadata: Json
          legacy_table: string | null
          notes: string | null
          opening_balance: number
          status: string
          unit_id: string
          updated_at: string
        }
        Insert: {
          account_number?: string
          building_id: string
          created_at?: string
          credit_balance?: number
          current_balance?: number
          id?: string
          legacy_id?: string | null
          legacy_metadata?: Json
          legacy_table?: string | null
          notes?: string | null
          opening_balance?: number
          status?: string
          unit_id: string
          updated_at?: string
        }
        Update: {
          account_number?: string
          building_id?: string
          created_at?: string
          credit_balance?: number
          current_balance?: number
          id?: string
          legacy_id?: string | null
          legacy_metadata?: Json
          legacy_table?: string | null
          notes?: string | null
          opening_balance?: number
          status?: string
          unit_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tb810_unit_accounts_building_id_fkey"
            columns: ["building_id"]
            isOneToOne: false
            referencedRelation: "tb810_buildings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tb810_unit_accounts_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: true
            referencedRelation: "tb810_units"
            referencedColumns: ["id"]
          },
        ]
      }
      tb810_unit_types: {
        Row: {
          code: Database["public"]["Enums"]["tb810_unit_type_code"]
          created_at: string
          id: string
          legacy_id: string | null
          legacy_metadata: Json
          legacy_table: string | null
          name: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          code: Database["public"]["Enums"]["tb810_unit_type_code"]
          created_at?: string
          id?: string
          legacy_id?: string | null
          legacy_metadata?: Json
          legacy_table?: string | null
          name: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          code?: Database["public"]["Enums"]["tb810_unit_type_code"]
          created_at?: string
          id?: string
          legacy_id?: string | null
          legacy_metadata?: Json
          legacy_table?: string | null
          name?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      tb810_units: {
        Row: {
          active: boolean
          building_id: string
          created_at: string
          display_name: string | null
          floor: string | null
          has_meter: boolean
          id: string
          legacy_id: string | null
          legacy_metadata: Json
          legacy_table: string | null
          notes: string | null
          participation_percentage: number
          registered_area_m2: number | null
          unit_number: string
          unit_type_id: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          building_id: string
          created_at?: string
          display_name?: string | null
          floor?: string | null
          has_meter?: boolean
          id?: string
          legacy_id?: string | null
          legacy_metadata?: Json
          legacy_table?: string | null
          notes?: string | null
          participation_percentage?: number
          registered_area_m2?: number | null
          unit_number: string
          unit_type_id: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          building_id?: string
          created_at?: string
          display_name?: string | null
          floor?: string | null
          has_meter?: boolean
          id?: string
          legacy_id?: string | null
          legacy_metadata?: Json
          legacy_table?: string | null
          notes?: string | null
          participation_percentage?: number
          registered_area_m2?: number | null
          unit_number?: string
          unit_type_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tb810_units_building_id_fkey"
            columns: ["building_id"]
            isOneToOne: false
            referencedRelation: "tb810_buildings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tb810_units_unit_type_id_fkey"
            columns: ["unit_type_id"]
            isOneToOne: false
            referencedRelation: "tb810_unit_types"
            referencedColumns: ["id"]
          },
        ]
      }
      tb810_utility_bills: {
        Row: {
          amount: number
          attachment_document_id: string | null
          bill_date: string
          billing_period_id: string | null
          building_id: string
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          legacy_id: string | null
          legacy_metadata: Json
          legacy_table: string | null
          notes: string | null
          status: string
          supplier_id: string | null
          updated_at: string
          updated_by: string | null
          utility_type_id: string
        }
        Insert: {
          amount: number
          attachment_document_id?: string | null
          bill_date: string
          billing_period_id?: string | null
          building_id: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          legacy_id?: string | null
          legacy_metadata?: Json
          legacy_table?: string | null
          notes?: string | null
          status?: string
          supplier_id?: string | null
          updated_at?: string
          updated_by?: string | null
          utility_type_id: string
        }
        Update: {
          amount?: number
          attachment_document_id?: string | null
          bill_date?: string
          billing_period_id?: string | null
          building_id?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          legacy_id?: string | null
          legacy_metadata?: Json
          legacy_table?: string | null
          notes?: string | null
          status?: string
          supplier_id?: string | null
          updated_at?: string
          updated_by?: string | null
          utility_type_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tb810_utility_bills_billing_period_id_fkey"
            columns: ["billing_period_id"]
            isOneToOne: false
            referencedRelation: "tb810_billing_periods"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tb810_utility_bills_building_id_fkey"
            columns: ["building_id"]
            isOneToOne: false
            referencedRelation: "tb810_buildings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tb810_utility_bills_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "tb810_suppliers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tb810_utility_bills_utility_type_id_fkey"
            columns: ["utility_type_id"]
            isOneToOne: false
            referencedRelation: "tb810_utility_types"
            referencedColumns: ["id"]
          },
        ]
      }
      tb810_utility_types: {
        Row: {
          active: boolean
          code: Database["public"]["Enums"]["tb810_utility_type_code"]
          created_at: string
          id: string
          legacy_id: string | null
          legacy_metadata: Json
          legacy_table: string | null
          name: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          code: Database["public"]["Enums"]["tb810_utility_type_code"]
          created_at?: string
          id?: string
          legacy_id?: string | null
          legacy_metadata?: Json
          legacy_table?: string | null
          name: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          code?: Database["public"]["Enums"]["tb810_utility_type_code"]
          created_at?: string
          id?: string
          legacy_id?: string | null
          legacy_metadata?: Json
          legacy_table?: string | null
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_tb810_permission: {
        Args: { permission_key: string }
        Returns: boolean
      }
      has_tb810_role: { Args: { role_key: string }; Returns: boolean }
      is_tb810_staff: { Args: never; Returns: boolean }
      tb810_ensure_unit_account_for_unit: {
        Args: { target_unit_id: string }
        Returns: string
      }
      tb810_generate_owner_reference: { Args: never; Returns: string }
      tb810_generate_unit_account_number: { Args: never; Returns: string }
      tb810_rebuild_unit_account_balance: {
        Args: { target_unit_account_id: string }
        Returns: undefined
      }
    }
    Enums: {
      tb810_account_transaction_type:
        | "charge"
        | "payment"
        | "credit"
        | "credit_transfer_in"
        | "credit_transfer_out"
        | "adjustment"
        | "reversal"
        | "late_fee"
      tb810_audit_action:
        | "insert"
        | "update"
        | "delete"
        | "approve"
        | "reverse"
        | "transfer_credit"
        | "reconcile"
        | "import"
      tb810_communication_status: "draft" | "queued" | "sent" | "failed"
      tb810_credit_status: "active" | "transferred" | "consumed" | "void"
      tb810_credit_transfer_status:
        | "pending"
        | "approved"
        | "posted"
        | "reversed"
      tb810_document_status:
        | "draft"
        | "received"
        | "reviewed"
        | "approved"
        | "archived"
      tb810_invoice_status:
        | "draft"
        | "generated"
        | "pending_approval"
        | "approved"
        | "sent"
        | "partially_paid"
        | "paid"
        | "void"
      tb810_payment_allocation_type:
        | "fixed"
        | "water"
        | "common"
        | "credit"
        | "other"
      tb810_payment_status:
        | "pending"
        | "posted"
        | "partially_reconciled"
        | "reconciled"
        | "void"
      tb810_role_key:
        | "super_admin"
        | "building_manager"
        | "reconciliation_specialist"
        | "building_staff"
        | "viewer"
      tb810_unit_type_code: "condo" | "parking" | "storage"
      tb810_utility_type_code: "water" | "common_water" | "common_electricity"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      tb810_account_transaction_type: [
        "charge",
        "payment",
        "credit",
        "credit_transfer_in",
        "credit_transfer_out",
        "adjustment",
        "reversal",
        "late_fee",
      ],
      tb810_audit_action: [
        "insert",
        "update",
        "delete",
        "approve",
        "reverse",
        "transfer_credit",
        "reconcile",
        "import",
      ],
      tb810_communication_status: ["draft", "queued", "sent", "failed"],
      tb810_credit_status: ["active", "transferred", "consumed", "void"],
      tb810_credit_transfer_status: [
        "pending",
        "approved",
        "posted",
        "reversed",
      ],
      tb810_document_status: [
        "draft",
        "received",
        "reviewed",
        "approved",
        "archived",
      ],
      tb810_invoice_status: [
        "draft",
        "generated",
        "pending_approval",
        "approved",
        "sent",
        "partially_paid",
        "paid",
        "void",
      ],
      tb810_payment_allocation_type: [
        "fixed",
        "water",
        "common",
        "credit",
        "other",
      ],
      tb810_payment_status: [
        "pending",
        "posted",
        "partially_reconciled",
        "reconciled",
        "void",
      ],
      tb810_role_key: [
        "super_admin",
        "building_manager",
        "reconciliation_specialist",
        "building_staff",
        "viewer",
      ],
      tb810_unit_type_code: ["condo", "parking", "storage"],
      tb810_utility_type_code: ["water", "common_water", "common_electricity"],
    },
  },
} as const
