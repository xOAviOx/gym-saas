
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  
  "public": {
          Tables: {
            "audit_logs": {
                  Row: {
                    "action": string,"actor_user_id": string | null,"after": Json | null,"before": Json | null,"created_at": string,"entity_id": string | null,"entity_type": string,"id": string,"org_id": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "action": string,"actor_user_id"?: string | null,"after"?: Json | null,"before"?: Json | null,"created_at"?: string,"entity_id"?: string | null,"entity_type": string,"id"?: string,"org_id": string,"updated_at"?: string
                  }
                  Update: {
                    "action"?: string,"actor_user_id"?: string | null,"after"?: Json | null,"before"?: Json | null,"created_at"?: string,"entity_id"?: string | null,"entity_type"?: string,"id"?: string,"org_id"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "audit_logs_org_id_fkey"
      columns: ["org_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    }
                  ]
                },"check_ins": {
                  Row: {
                    "checked_in_at": string,"checked_in_by": string | null,"created_at": string,"flag": Database["public"]['Enums']["check_in_flag"] | null,"id": string,"member_id": string,"method": Database["public"]['Enums']["check_in_method"],"org_id": string,"override_by": string | null,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "checked_in_at"?: string,"checked_in_by"?: string | null,"created_at"?: string,"flag"?: Database["public"]['Enums']["check_in_flag"] | null,"id"?: string,"member_id": string,"method"?: Database["public"]['Enums']["check_in_method"],"org_id": string,"override_by"?: string | null,"updated_at"?: string
                  }
                  Update: {
                    "checked_in_at"?: string,"checked_in_by"?: string | null,"created_at"?: string,"flag"?: Database["public"]['Enums']["check_in_flag"] | null,"id"?: string,"member_id"?: string,"method"?: Database["public"]['Enums']["check_in_method"],"org_id"?: string,"override_by"?: string | null,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "check_ins_checked_in_by_fkey"
      columns: ["checked_in_by"]
isOneToOne: false
      referencedRelation: "team_members"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "check_ins_member_id_fkey"
      columns: ["member_id"]
isOneToOne: false
      referencedRelation: "members"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "check_ins_org_id_fkey"
      columns: ["org_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "check_ins_override_by_fkey"
      columns: ["override_by"]
isOneToOne: false
      referencedRelation: "team_members"
      referencedColumns: ["id"]
    }
                  ]
                },"collection_requests": {
                  Row: {
                    "amount": number,"confirmed_payment_id": string | null,"created_at": string,"created_by": string | null,"expires_at": string,"id": string,"invoice_id": string,"member_id": string,"org_id": string,"provider": Database["public"]['Enums']["collection_provider"],"provider_link_id": string | null,"short_url": string | null,"status": Database["public"]['Enums']["collection_request_status"],"updated_at": string,"upi_uri": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "amount": number,"confirmed_payment_id"?: string | null,"created_at"?: string,"created_by"?: string | null,"expires_at": string,"id"?: string,"invoice_id": string,"member_id": string,"org_id": string,"provider": Database["public"]['Enums']["collection_provider"],"provider_link_id"?: string | null,"short_url"?: string | null,"status"?: Database["public"]['Enums']["collection_request_status"],"updated_at"?: string,"upi_uri"?: string | null
                  }
                  Update: {
                    "amount"?: number,"confirmed_payment_id"?: string | null,"created_at"?: string,"created_by"?: string | null,"expires_at"?: string,"id"?: string,"invoice_id"?: string,"member_id"?: string,"org_id"?: string,"provider"?: Database["public"]['Enums']["collection_provider"],"provider_link_id"?: string | null,"short_url"?: string | null,"status"?: Database["public"]['Enums']["collection_request_status"],"updated_at"?: string,"upi_uri"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "collection_requests_confirmed_payment_id_fkey"
      columns: ["confirmed_payment_id"]
isOneToOne: false
      referencedRelation: "payments"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "collection_requests_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "team_members"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "collection_requests_invoice_id_fkey"
      columns: ["invoice_id"]
isOneToOne: false
      referencedRelation: "invoices"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "collection_requests_member_id_fkey"
      columns: ["member_id"]
isOneToOne: false
      referencedRelation: "members"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "collection_requests_org_id_fkey"
      columns: ["org_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    }
                  ]
                },"counters": {
                  Row: {
                    "key": string,"next_value": number,"org_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "key": string,"next_value"?: number,"org_id": string
                  }
                  Update: {
                    "key"?: string,"next_value"?: number,"org_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "counters_org_id_fkey"
      columns: ["org_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    }
                  ]
                },"expenses": {
                  Row: {
                    "amount": number,"category": Database["public"]['Enums']["expense_category"],"created_at": string,"created_by": string | null,"expense_date": string,"id": string,"notes": string | null,"org_id": string,"receipt_url": string | null,"updated_at": string,"vendor": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "amount": number,"category"?: Database["public"]['Enums']["expense_category"],"created_at"?: string,"created_by"?: string | null,"expense_date": string,"id"?: string,"notes"?: string | null,"org_id": string,"receipt_url"?: string | null,"updated_at"?: string,"vendor"?: string | null
                  }
                  Update: {
                    "amount"?: number,"category"?: Database["public"]['Enums']["expense_category"],"created_at"?: string,"created_by"?: string | null,"expense_date"?: string,"id"?: string,"notes"?: string | null,"org_id"?: string,"receipt_url"?: string | null,"updated_at"?: string,"vendor"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "expenses_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "team_members"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "expenses_org_id_fkey"
      columns: ["org_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    }
                  ]
                },"invitations": {
                  Row: {
                    "accepted_at": string | null,"created_at": string,"email": string,"expires_at": string,"id": string,"invited_by": string | null,"org_id": string,"role": Database["public"]['Enums']["team_role"],"token_hash": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "accepted_at"?: string | null,"created_at"?: string,"email": string,"expires_at": string,"id"?: string,"invited_by"?: string | null,"org_id": string,"role"?: Database["public"]['Enums']["team_role"],"token_hash": string,"updated_at"?: string
                  }
                  Update: {
                    "accepted_at"?: string | null,"created_at"?: string,"email"?: string,"expires_at"?: string,"id"?: string,"invited_by"?: string | null,"org_id"?: string,"role"?: Database["public"]['Enums']["team_role"],"token_hash"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "invitations_invited_by_fkey"
      columns: ["invited_by"]
isOneToOne: false
      referencedRelation: "team_members"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "invitations_org_id_fkey"
      columns: ["org_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    }
                  ]
                },"invoice_items": {
                  Row: {
                    "amount": number,"created_at": string,"description": string,"id": string,"invoice_id": string,"org_id": string,"quantity": number,"sac_hsn": string,"unit_price": number,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "amount": number,"created_at"?: string,"description": string,"id"?: string,"invoice_id": string,"org_id": string,"quantity"?: number,"sac_hsn"?: string,"unit_price": number,"updated_at"?: string
                  }
                  Update: {
                    "amount"?: number,"created_at"?: string,"description"?: string,"id"?: string,"invoice_id"?: string,"org_id"?: string,"quantity"?: number,"sac_hsn"?: string,"unit_price"?: number,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "invoice_items_invoice_id_fkey"
      columns: ["invoice_id"]
isOneToOne: false
      referencedRelation: "invoices"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "invoice_items_org_id_fkey"
      columns: ["org_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    }
                  ]
                },"invoices": {
                  Row: {
                    "amount_paid": number,"balance_due": number,"cgst_amount": number,"created_at": string,"created_by": string | null,"discount_amount": number,"due_date": string,"fiscal_year": string,"gst_rate": number,"id": string,"invoice_number": string,"issue_date": string,"member_id": string,"membership_id": string | null,"notes": string | null,"org_id": string,"sgst_amount": number,"status": Database["public"]['Enums']["invoice_status"],"subtotal": number,"taxable_value": number,"total_amount": number,"updated_at": string,"void_reason": string | null,"voided_at": string | null,"voided_by": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "amount_paid"?: number,"balance_due": number,"cgst_amount"?: number,"created_at"?: string,"created_by"?: string | null,"discount_amount"?: number,"due_date": string,"fiscal_year": string,"gst_rate"?: number,"id"?: string,"invoice_number": string,"issue_date": string,"member_id": string,"membership_id"?: string | null,"notes"?: string | null,"org_id": string,"sgst_amount"?: number,"status"?: Database["public"]['Enums']["invoice_status"],"subtotal": number,"taxable_value": number,"total_amount": number,"updated_at"?: string,"void_reason"?: string | null,"voided_at"?: string | null,"voided_by"?: string | null
                  }
                  Update: {
                    "amount_paid"?: number,"balance_due"?: number,"cgst_amount"?: number,"created_at"?: string,"created_by"?: string | null,"discount_amount"?: number,"due_date"?: string,"fiscal_year"?: string,"gst_rate"?: number,"id"?: string,"invoice_number"?: string,"issue_date"?: string,"member_id"?: string,"membership_id"?: string | null,"notes"?: string | null,"org_id"?: string,"sgst_amount"?: number,"status"?: Database["public"]['Enums']["invoice_status"],"subtotal"?: number,"taxable_value"?: number,"total_amount"?: number,"updated_at"?: string,"void_reason"?: string | null,"voided_at"?: string | null,"voided_by"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "invoices_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "team_members"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "invoices_member_id_fkey"
      columns: ["member_id"]
isOneToOne: false
      referencedRelation: "members"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "invoices_membership_id_fkey"
      columns: ["membership_id"]
isOneToOne: false
      referencedRelation: "memberships"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "invoices_org_id_fkey"
      columns: ["org_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "invoices_voided_by_fkey"
      columns: ["voided_by"]
isOneToOne: false
      referencedRelation: "team_members"
      referencedColumns: ["id"]
    }
                  ]
                },"members": {
                  Row: {
                    "address": string | null,"alt_phone": string | null,"consent_messaging": boolean,"consent_recorded_at": string | null,"created_at": string,"deleted_at": string | null,"dob": string | null,"email": string | null,"emergency_contact_name": string | null,"emergency_contact_phone": string | null,"full_name": string,"gender": string | null,"id": string,"joined_on": string,"member_code": string,"notes": string | null,"org_id": string,"phone": string,"photo_url": string | null,"referred_by_member_id": string | null,"source": Database["public"]['Enums']["member_source"],"status": string,"tags": (string)[],"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "address"?: string | null,"alt_phone"?: string | null,"consent_messaging"?: boolean,"consent_recorded_at"?: string | null,"created_at"?: string,"deleted_at"?: string | null,"dob"?: string | null,"email"?: string | null,"emergency_contact_name"?: string | null,"emergency_contact_phone"?: string | null,"full_name": string,"gender"?: string | null,"id"?: string,"joined_on"?: string,"member_code"?: string,"notes"?: string | null,"org_id": string,"phone": string,"photo_url"?: string | null,"referred_by_member_id"?: string | null,"source"?: Database["public"]['Enums']["member_source"],"status"?: string,"tags"?: (string)[],"updated_at"?: string
                  }
                  Update: {
                    "address"?: string | null,"alt_phone"?: string | null,"consent_messaging"?: boolean,"consent_recorded_at"?: string | null,"created_at"?: string,"deleted_at"?: string | null,"dob"?: string | null,"email"?: string | null,"emergency_contact_name"?: string | null,"emergency_contact_phone"?: string | null,"full_name"?: string,"gender"?: string | null,"id"?: string,"joined_on"?: string,"member_code"?: string,"notes"?: string | null,"org_id"?: string,"phone"?: string,"photo_url"?: string | null,"referred_by_member_id"?: string | null,"source"?: Database["public"]['Enums']["member_source"],"status"?: string,"tags"?: (string)[],"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "members_org_id_fkey"
      columns: ["org_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "members_referred_by_member_id_fkey"
      columns: ["referred_by_member_id"]
isOneToOne: false
      referencedRelation: "members"
      referencedColumns: ["id"]
    }
                  ]
                },"memberships": {
                  Row: {
                    "created_at": string,"created_by": string | null,"discount_amount": number,"end_date": string,"final_amount": number,"freeze_days_used": number,"frozen_from": string | null,"frozen_to": string | null,"id": string,"list_price": number,"member_id": string,"notes": string | null,"org_id": string,"plan_id": string,"sessions_total": number | null,"sessions_used": number,"start_date": string,"status": Database["public"]['Enums']["membership_status"],"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"created_by"?: string | null,"discount_amount"?: number,"end_date": string,"final_amount": number,"freeze_days_used"?: number,"frozen_from"?: string | null,"frozen_to"?: string | null,"id"?: string,"list_price": number,"member_id": string,"notes"?: string | null,"org_id": string,"plan_id": string,"sessions_total"?: number | null,"sessions_used"?: number,"start_date": string,"status"?: Database["public"]['Enums']["membership_status"],"updated_at"?: string
                  }
                  Update: {
                    "created_at"?: string,"created_by"?: string | null,"discount_amount"?: number,"end_date"?: string,"final_amount"?: number,"freeze_days_used"?: number,"frozen_from"?: string | null,"frozen_to"?: string | null,"id"?: string,"list_price"?: number,"member_id"?: string,"notes"?: string | null,"org_id"?: string,"plan_id"?: string,"sessions_total"?: number | null,"sessions_used"?: number,"start_date"?: string,"status"?: Database["public"]['Enums']["membership_status"],"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "memberships_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "team_members"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "memberships_member_id_fkey"
      columns: ["member_id"]
isOneToOne: false
      referencedRelation: "members"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "memberships_org_id_fkey"
      columns: ["org_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "memberships_plan_id_fkey"
      columns: ["plan_id"]
isOneToOne: false
      referencedRelation: "plans"
      referencedColumns: ["id"]
    }
                  ]
                },"message_logs": {
                  Row: {
                    "body": string,"channel": Database["public"]['Enums']["message_channel"],"created_at": string,"error": string | null,"id": string,"invoice_id": string | null,"member_id": string,"org_id": string,"provider_message_id": string | null,"reminder_date": string | null,"scheduled_for": string | null,"sent_at": string | null,"sent_by": string | null,"status": Database["public"]['Enums']["message_status"],"template_key": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "body": string,"channel": Database["public"]['Enums']["message_channel"],"created_at"?: string,"error"?: string | null,"id"?: string,"invoice_id"?: string | null,"member_id": string,"org_id": string,"provider_message_id"?: string | null,"reminder_date"?: string | null,"scheduled_for"?: string | null,"sent_at"?: string | null,"sent_by"?: string | null,"status"?: Database["public"]['Enums']["message_status"],"template_key": string,"updated_at"?: string
                  }
                  Update: {
                    "body"?: string,"channel"?: Database["public"]['Enums']["message_channel"],"created_at"?: string,"error"?: string | null,"id"?: string,"invoice_id"?: string | null,"member_id"?: string,"org_id"?: string,"provider_message_id"?: string | null,"reminder_date"?: string | null,"scheduled_for"?: string | null,"sent_at"?: string | null,"sent_by"?: string | null,"status"?: Database["public"]['Enums']["message_status"],"template_key"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "message_logs_invoice_id_fkey"
      columns: ["invoice_id"]
isOneToOne: false
      referencedRelation: "invoices"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "message_logs_member_id_fkey"
      columns: ["member_id"]
isOneToOne: false
      referencedRelation: "members"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "message_logs_org_id_fkey"
      columns: ["org_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "message_logs_sent_by_fkey"
      columns: ["sent_by"]
isOneToOne: false
      referencedRelation: "team_members"
      referencedColumns: ["id"]
    }
                  ]
                },"organization_secrets": {
                  Row: {
                    "created_at": string,"org_id": string,"razorpay_key_id": string | null,"razorpay_key_secret_enc": string | null,"razorpay_webhook_secret_enc": string | null,"updated_at": string,"whatsapp_access_token_enc": string | null,"whatsapp_phone_number_id": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"org_id": string,"razorpay_key_id"?: string | null,"razorpay_key_secret_enc"?: string | null,"razorpay_webhook_secret_enc"?: string | null,"updated_at"?: string,"whatsapp_access_token_enc"?: string | null,"whatsapp_phone_number_id"?: string | null
                  }
                  Update: {
                    "created_at"?: string,"org_id"?: string,"razorpay_key_id"?: string | null,"razorpay_key_secret_enc"?: string | null,"razorpay_webhook_secret_enc"?: string | null,"updated_at"?: string,"whatsapp_access_token_enc"?: string | null,"whatsapp_phone_number_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "organization_secrets_org_id_fkey"
      columns: ["org_id"]
isOneToOne: true
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    }
                  ]
                },"organizations": {
                  Row: {
                    "address_line": string | null,"city": string | null,"created_at": string,"default_collection_mode": Database["public"]['Enums']["collection_mode"],"deletion_scheduled_for": string | null,"email": string | null,"gst_enabled": boolean,"gst_rate": number,"gstin": string | null,"id": string,"invoice_prefix": string,"kiosk_pin_hash": string | null,"logo_url": string | null,"name": string,"phone": string | null,"pincode": string | null,"settings": NonNullable<Json>,"state": string | null,"timezone": string,"updated_at": string,"upi_payee_name": string | null,"upi_vpa": string | null,"vertical": string
                  }
                  ComputedFields: never
                  Insert: {
                    "address_line"?: string | null,"city"?: string | null,"created_at"?: string,"default_collection_mode"?: Database["public"]['Enums']["collection_mode"],"deletion_scheduled_for"?: string | null,"email"?: string | null,"gst_enabled"?: boolean,"gst_rate"?: number,"gstin"?: string | null,"id"?: string,"invoice_prefix": string,"kiosk_pin_hash"?: string | null,"logo_url"?: string | null,"name": string,"phone"?: string | null,"pincode"?: string | null,"settings"?: NonNullable<Json>,"state"?: string | null,"timezone"?: string,"updated_at"?: string,"upi_payee_name"?: string | null,"upi_vpa"?: string | null,"vertical"?: string
                  }
                  Update: {
                    "address_line"?: string | null,"city"?: string | null,"created_at"?: string,"default_collection_mode"?: Database["public"]['Enums']["collection_mode"],"deletion_scheduled_for"?: string | null,"email"?: string | null,"gst_enabled"?: boolean,"gst_rate"?: number,"gstin"?: string | null,"id"?: string,"invoice_prefix"?: string,"kiosk_pin_hash"?: string | null,"logo_url"?: string | null,"name"?: string,"phone"?: string | null,"pincode"?: string | null,"settings"?: NonNullable<Json>,"state"?: string | null,"timezone"?: string,"updated_at"?: string,"upi_payee_name"?: string | null,"upi_vpa"?: string | null,"vertical"?: string
                  }
                  Relationships: [
                    
                  ]
                },"payment_claims": {
                  Row: {
                    "amount": number,"claimed_at": string,"created_at": string,"id": string,"invoice_id": string,"member_id": string,"note": string | null,"org_id": string,"payment_id": string | null,"reject_reason": string | null,"reviewed_at": string | null,"reviewed_by": string | null,"status": Database["public"]['Enums']["payment_claim_status"],"updated_at": string,"utr": string
                  }
                  ComputedFields: never
                  Insert: {
                    "amount": number,"claimed_at"?: string,"created_at"?: string,"id"?: string,"invoice_id": string,"member_id": string,"note"?: string | null,"org_id": string,"payment_id"?: string | null,"reject_reason"?: string | null,"reviewed_at"?: string | null,"reviewed_by"?: string | null,"status"?: Database["public"]['Enums']["payment_claim_status"],"updated_at"?: string,"utr": string
                  }
                  Update: {
                    "amount"?: number,"claimed_at"?: string,"created_at"?: string,"id"?: string,"invoice_id"?: string,"member_id"?: string,"note"?: string | null,"org_id"?: string,"payment_id"?: string | null,"reject_reason"?: string | null,"reviewed_at"?: string | null,"reviewed_by"?: string | null,"status"?: Database["public"]['Enums']["payment_claim_status"],"updated_at"?: string,"utr"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "payment_claims_invoice_id_fkey"
      columns: ["invoice_id"]
isOneToOne: false
      referencedRelation: "invoices"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "payment_claims_member_id_fkey"
      columns: ["member_id"]
isOneToOne: false
      referencedRelation: "members"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "payment_claims_org_id_fkey"
      columns: ["org_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "payment_claims_payment_id_fkey"
      columns: ["payment_id"]
isOneToOne: false
      referencedRelation: "payments"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "payment_claims_reviewed_by_fkey"
      columns: ["reviewed_by"]
isOneToOne: false
      referencedRelation: "team_members"
      referencedColumns: ["id"]
    }
                  ]
                },"payments": {
                  Row: {
                    "amount": number,"collected_by": string | null,"created_at": string,"id": string,"invoice_id": string,"is_reversal": boolean,"member_id": string,"method": Database["public"]['Enums']["payment_method"],"org_id": string,"paid_at": string,"razorpay_payment_id": string | null,"reference": string | null,"reversal_reason": string | null,"reverses_payment_id": string | null,"updated_at": string,"utr": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "amount": number,"collected_by"?: string | null,"created_at"?: string,"id"?: string,"invoice_id": string,"is_reversal"?: boolean,"member_id": string,"method": Database["public"]['Enums']["payment_method"],"org_id": string,"paid_at"?: string,"razorpay_payment_id"?: string | null,"reference"?: string | null,"reversal_reason"?: string | null,"reverses_payment_id"?: string | null,"updated_at"?: string,"utr"?: string | null
                  }
                  Update: {
                    "amount"?: number,"collected_by"?: string | null,"created_at"?: string,"id"?: string,"invoice_id"?: string,"is_reversal"?: boolean,"member_id"?: string,"method"?: Database["public"]['Enums']["payment_method"],"org_id"?: string,"paid_at"?: string,"razorpay_payment_id"?: string | null,"reference"?: string | null,"reversal_reason"?: string | null,"reverses_payment_id"?: string | null,"updated_at"?: string,"utr"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "payments_collected_by_fkey"
      columns: ["collected_by"]
isOneToOne: false
      referencedRelation: "team_members"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "payments_invoice_id_fkey"
      columns: ["invoice_id"]
isOneToOne: false
      referencedRelation: "invoices"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "payments_member_id_fkey"
      columns: ["member_id"]
isOneToOne: false
      referencedRelation: "members"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "payments_org_id_fkey"
      columns: ["org_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "payments_reverses_payment_id_fkey"
      columns: ["reverses_payment_id"]
isOneToOne: false
      referencedRelation: "payments"
      referencedColumns: ["id"]
    }
                  ]
                },"plans": {
                  Row: {
                    "color": string | null,"created_at": string,"description": string | null,"duration_days": number,"id": string,"is_active": boolean,"name": string,"org_id": string,"price": number,"session_count": number | null,"sort_order": number,"type": Database["public"]['Enums']["plan_type"],"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "color"?: string | null,"created_at"?: string,"description"?: string | null,"duration_days": number,"id"?: string,"is_active"?: boolean,"name": string,"org_id": string,"price": number,"session_count"?: number | null,"sort_order"?: number,"type"?: Database["public"]['Enums']["plan_type"],"updated_at"?: string
                  }
                  Update: {
                    "color"?: string | null,"created_at"?: string,"description"?: string | null,"duration_days"?: number,"id"?: string,"is_active"?: boolean,"name"?: string,"org_id"?: string,"price"?: number,"session_count"?: number | null,"sort_order"?: number,"type"?: Database["public"]['Enums']["plan_type"],"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "plans_org_id_fkey"
      columns: ["org_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    }
                  ]
                },"portal_tokens": {
                  Row: {
                    "created_at": string,"expires_at": string,"id": string,"member_id": string,"org_id": string,"revoked_at": string | null,"token_hash": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"expires_at": string,"id"?: string,"member_id": string,"org_id": string,"revoked_at"?: string | null,"token_hash": string,"updated_at"?: string
                  }
                  Update: {
                    "created_at"?: string,"expires_at"?: string,"id"?: string,"member_id"?: string,"org_id"?: string,"revoked_at"?: string | null,"token_hash"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "portal_tokens_member_id_fkey"
      columns: ["member_id"]
isOneToOne: false
      referencedRelation: "members"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "portal_tokens_org_id_fkey"
      columns: ["org_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    }
                  ]
                },"profiles": {
                  Row: {
                    "active_org_id": string | null,"avatar_url": string | null,"created_at": string,"full_name": string | null,"id": string,"phone": string | null,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "active_org_id"?: string | null,"avatar_url"?: string | null,"created_at"?: string,"full_name"?: string | null,"id": string,"phone"?: string | null,"updated_at"?: string
                  }
                  Update: {
                    "active_org_id"?: string | null,"avatar_url"?: string | null,"created_at"?: string,"full_name"?: string | null,"id"?: string,"phone"?: string | null,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "profiles_active_org_id_fkey"
      columns: ["active_org_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    }
                  ]
                },"rate_limits": {
                  Row: {
                    "count": number,"key": string,"updated_at": string,"window_start": string
                  }
                  ComputedFields: never
                  Insert: {
                    "count"?: number,"key": string,"updated_at"?: string,"window_start"?: string
                  }
                  Update: {
                    "count"?: number,"key"?: string,"updated_at"?: string,"window_start"?: string
                  }
                  Relationships: [
                    
                  ]
                },"razorpay_events": {
                  Row: {
                    "created_at": string,"error": string | null,"event_id": string,"event_type": string,"id": string,"org_id": string | null,"payload": NonNullable<Json>,"processed_at": string | null,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"error"?: string | null,"event_id": string,"event_type": string,"id"?: string,"org_id"?: string | null,"payload": NonNullable<Json>,"processed_at"?: string | null,"updated_at"?: string
                  }
                  Update: {
                    "created_at"?: string,"error"?: string | null,"event_id"?: string,"event_type"?: string,"id"?: string,"org_id"?: string | null,"payload"?: NonNullable<Json>,"processed_at"?: string | null,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "razorpay_events_org_id_fkey"
      columns: ["org_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    }
                  ]
                },"team_members": {
                  Row: {
                    "created_at": string,"id": string,"is_active": boolean,"org_id": string,"role": Database["public"]['Enums']["team_role"],"updated_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"id"?: string,"is_active"?: boolean,"org_id": string,"role"?: Database["public"]['Enums']["team_role"],"updated_at"?: string,"user_id": string
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"is_active"?: boolean,"org_id"?: string,"role"?: Database["public"]['Enums']["team_role"],"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "team_members_org_id_fkey"
      columns: ["org_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    }
                  ]
                }
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "accept_invitation":
{ Args: { "p_token_hash": string }; Returns: {
              "created_at": string,
"id": string,
"is_active": boolean,
"org_id": string,
"role": Database["public"]['Enums']["team_role"],
"updated_at": string,
"user_id": string
            }
                          SetofOptions: {
        from: "*"
        to: "team_members"
        isOneToOne: true
        isSetofReturn: false
      } },
"allocate_invoice_number":
{ Args: { "p_issue_date": string,"p_org": string }; Returns: {
              "fiscal_year": string,"invoice_number": string
            }[]
                           },
"assert_org_role":
{ Args: { "p_org": string,"p_roles": (Database["public"]['Enums']["team_role"])[] }; Returns: undefined
                           },
"cancel_membership":
{ Args: { "p_membership_id": string,"p_reason": string }; Returns: {
              "created_at": string,
"created_by": string | null,
"discount_amount": number,
"end_date": string,
"final_amount": number,
"freeze_days_used": number,
"frozen_from": string | null,
"frozen_to": string | null,
"id": string,
"list_price": number,
"member_id": string,
"notes": string | null,
"org_id": string,
"plan_id": string,
"sessions_total": number | null,
"sessions_used": number,
"start_date": string,
"status": Database["public"]['Enums']["membership_status"],
"updated_at": string
            }
                          SetofOptions: {
        from: "*"
        to: "memberships"
        isOneToOne: true
        isSetofReturn: false
      } },
"cancel_organization_deletion":
{ Args: { "p_org": string }; Returns: {
              "address_line": string | null,
"city": string | null,
"created_at": string,
"default_collection_mode": Database["public"]['Enums']["collection_mode"],
"deletion_scheduled_for": string | null,
"email": string | null,
"gst_enabled": boolean,
"gst_rate": number,
"gstin": string | null,
"id": string,
"invoice_prefix": string,
"kiosk_pin_hash": string | null,
"logo_url": string | null,
"name": string,
"phone": string | null,
"pincode": string | null,
"settings": NonNullable<Json>,
"state": string | null,
"timezone": string,
"updated_at": string,
"upi_payee_name": string | null,
"upi_vpa": string | null,
"vertical": string
            }
                          SetofOptions: {
        from: "*"
        to: "organizations"
        isOneToOne: true
        isSetofReturn: false
      } },
"change_team_role":
{ Args: { "p_role": Database["public"]['Enums']["team_role"],"p_team_member_id": string }; Returns: {
              "created_at": string,
"id": string,
"is_active": boolean,
"org_id": string,
"role": Database["public"]['Enums']["team_role"],
"updated_at": string,
"user_id": string
            }
                          SetofOptions: {
        from: "*"
        to: "team_members"
        isOneToOne: true
        isSetofReturn: false
      } },
"check_in_member":
{ Args: { "p_member_id": string,"p_method"?: Database["public"]['Enums']["check_in_method"],"p_override"?: boolean }; Returns: Json
                           },
"check_rate_limit":
{ Args: { "p_key": string,"p_limit": number,"p_window_seconds": number }; Returns: boolean
                           },
"compute_membership_status":
{ Args: { "m": Omit<Database["public"]['Tables']["memberships"]['Row'], Database["public"]['Tables']["memberships"]['ComputedFields']>,"p_today": string }; Returns: Database["public"]['Enums']["membership_status"]
                           },
"confirm_payment_claim":
{ Args: { "p_claim_id": string }; Returns: {
              "amount": number,
"claimed_at": string,
"created_at": string,
"id": string,
"invoice_id": string,
"member_id": string,
"note": string | null,
"org_id": string,
"payment_id": string | null,
"reject_reason": string | null,
"reviewed_at": string | null,
"reviewed_by": string | null,
"status": Database["public"]['Enums']["payment_claim_status"],
"updated_at": string,
"utr": string
            }
                          SetofOptions: {
        from: "*"
        to: "payment_claims"
        isOneToOne: true
        isSetofReturn: false
      } },
"create_membership":
{ Args: { "p_discount_amount"?: number,"p_member_id": string,"p_notes"?: string,"p_plan_id": string,"p_start_date": string }; Returns: Json
                           },
"create_organization":
{ Args: { "p_city": string,"p_email"?: string,"p_gst_enabled": boolean,"p_gstin": string,"p_invoice_prefix": string,"p_name": string,"p_phone": string,"p_state"?: string,"p_upi_payee_name": string,"p_upi_vpa": string }; Returns: {
              "address_line": string | null,
"city": string | null,
"created_at": string,
"default_collection_mode": Database["public"]['Enums']["collection_mode"],
"deletion_scheduled_for": string | null,
"email": string | null,
"gst_enabled": boolean,
"gst_rate": number,
"gstin": string | null,
"id": string,
"invoice_prefix": string,
"kiosk_pin_hash": string | null,
"logo_url": string | null,
"name": string,
"phone": string | null,
"pincode": string | null,
"settings": NonNullable<Json>,
"state": string | null,
"timezone": string,
"updated_at": string,
"upi_payee_name": string | null,
"upi_vpa": string | null,
"vertical": string
            }
                          SetofOptions: {
        from: "*"
        to: "organizations"
        isOneToOne: true
        isSetofReturn: false
      } },
"current_team_member_id":
{ Args: { "p_org": string }; Returns: string
                           },
"daily_maintenance":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"dashboard_stats":
{ Args: { "p_org": string }; Returns: Json
                           },
"fiscal_year_label":
{ Args: { "p_date": string }; Returns: string
                           },
"freeze_membership":
{ Args: { "p_from": string,"p_membership_id": string,"p_to": string }; Returns: {
              "created_at": string,
"created_by": string | null,
"discount_amount": number,
"end_date": string,
"final_amount": number,
"freeze_days_used": number,
"frozen_from": string | null,
"frozen_to": string | null,
"id": string,
"list_price": number,
"member_id": string,
"notes": string | null,
"org_id": string,
"plan_id": string,
"sessions_total": number | null,
"sessions_used": number,
"start_date": string,
"status": Database["public"]['Enums']["membership_status"],
"updated_at": string
            }
                          SetofOptions: {
        from: "*"
        to: "memberships"
        isOneToOne: true
        isSetofReturn: false
      } },
"has_org_role":
{ Args: { "p_org": string,"p_roles": (Database["public"]['Enums']["team_role"])[] }; Returns: boolean
                           },
"is_org_member":
{ Args: { "p_org": string }; Returns: boolean
                           },
"is_privileged_caller":
{ Args: Record<PropertyKey, never>; Returns: boolean
                           },
"ist_day_start":
{ Args: { "p_date": string }; Returns: string
                           },
"ist_today":
{ Args: Record<PropertyKey, never>; Returns: string
                           },
"my_org_ids":
{ Args: Record<PropertyKey, never>; Returns: string[]
                           },
"my_org_ids_with_role":
{ Args: { "p_roles": (Database["public"]['Enums']["team_role"])[] }; Returns: string[]
                           },
"next_counter_value":
{ Args: { "p_key": string,"p_org": string }; Returns: number
                           },
"purge_member_data":
{ Args: { "p_member_id": string }; Returns: string
                           },
"recompute_all_statuses":
{ Args: { "p_org"?: string }; Returns: number
                           },
"recompute_invoice":
{ Args: { "p_invoice_id": string }; Returns: undefined
                           },
"record_payment":
{ Args: { "p_amount": number,"p_collection_request_id"?: string,"p_invoice_id": string,"p_method": Database["public"]['Enums']["payment_method"],"p_paid_at"?: string,"p_razorpay_payment_id"?: string,"p_reference"?: string,"p_utr"?: string }; Returns: {
              "amount": number,
"collected_by": string | null,
"created_at": string,
"id": string,
"invoice_id": string,
"is_reversal": boolean,
"member_id": string,
"method": Database["public"]['Enums']["payment_method"],
"org_id": string,
"paid_at": string,
"razorpay_payment_id": string | null,
"reference": string | null,
"reversal_reason": string | null,
"reverses_payment_id": string | null,
"updated_at": string,
"utr": string | null
            }
                          SetofOptions: {
        from: "*"
        to: "payments"
        isOneToOne: true
        isSetofReturn: false
      } },
"refresh_member_status":
{ Args: { "p_member_id": string }; Returns: string
                           },
"reject_payment_claim":
{ Args: { "p_claim_id": string,"p_reason": string }; Returns: {
              "amount": number,
"claimed_at": string,
"created_at": string,
"id": string,
"invoice_id": string,
"member_id": string,
"note": string | null,
"org_id": string,
"payment_id": string | null,
"reject_reason": string | null,
"reviewed_at": string | null,
"reviewed_by": string | null,
"status": Database["public"]['Enums']["payment_claim_status"],
"updated_at": string,
"utr": string
            }
                          SetofOptions: {
        from: "*"
        to: "payment_claims"
        isOneToOne: true
        isSetofReturn: false
      } },
"restore_member":
{ Args: { "p_member_id": string }; Returns: {
              "address": string | null,
"alt_phone": string | null,
"consent_messaging": boolean,
"consent_recorded_at": string | null,
"created_at": string,
"deleted_at": string | null,
"dob": string | null,
"email": string | null,
"emergency_contact_name": string | null,
"emergency_contact_phone": string | null,
"full_name": string,
"gender": string | null,
"id": string,
"joined_on": string,
"member_code": string,
"notes": string | null,
"org_id": string,
"phone": string,
"photo_url": string | null,
"referred_by_member_id": string | null,
"source": Database["public"]['Enums']["member_source"],
"status": string,
"tags": (string)[],
"updated_at": string
            }
                          SetofOptions: {
        from: "*"
        to: "members"
        isOneToOne: true
        isSetofReturn: false
      } },
"reverse_payment":
{ Args: { "p_payment_id": string,"p_reason": string }; Returns: {
              "amount": number,
"collected_by": string | null,
"created_at": string,
"id": string,
"invoice_id": string,
"is_reversal": boolean,
"member_id": string,
"method": Database["public"]['Enums']["payment_method"],
"org_id": string,
"paid_at": string,
"razorpay_payment_id": string | null,
"reference": string | null,
"reversal_reason": string | null,
"reverses_payment_id": string | null,
"updated_at": string,
"utr": string | null
            }
                          SetofOptions: {
        from: "*"
        to: "payments"
        isOneToOne: true
        isSetofReturn: false
      } },
"safe_uuid":
{ Args: { "p": string }; Returns: string
                           },
"schedule_organization_deletion":
{ Args: { "p_org": string }; Returns: {
              "address_line": string | null,
"city": string | null,
"created_at": string,
"default_collection_mode": Database["public"]['Enums']["collection_mode"],
"deletion_scheduled_for": string | null,
"email": string | null,
"gst_enabled": boolean,
"gst_rate": number,
"gstin": string | null,
"id": string,
"invoice_prefix": string,
"kiosk_pin_hash": string | null,
"logo_url": string | null,
"name": string,
"phone": string | null,
"pincode": string | null,
"settings": NonNullable<Json>,
"state": string | null,
"timezone": string,
"updated_at": string,
"upi_payee_name": string | null,
"upi_vpa": string | null,
"vertical": string
            }
                          SetofOptions: {
        from: "*"
        to: "organizations"
        isOneToOne: true
        isSetofReturn: false
      } },
"set_team_member_active":
{ Args: { "p_active": boolean,"p_team_member_id": string }; Returns: {
              "created_at": string,
"id": string,
"is_active": boolean,
"org_id": string,
"role": Database["public"]['Enums']["team_role"],
"updated_at": string,
"user_id": string
            }
                          SetofOptions: {
        from: "*"
        to: "team_members"
        isOneToOne: true
        isSetofReturn: false
      } },
"shares_org_with":
{ Args: { "p_user": string }; Returns: boolean
                           },
"soft_delete_member":
{ Args: { "p_member_id": string }; Returns: {
              "address": string | null,
"alt_phone": string | null,
"consent_messaging": boolean,
"consent_recorded_at": string | null,
"created_at": string,
"deleted_at": string | null,
"dob": string | null,
"email": string | null,
"emergency_contact_name": string | null,
"emergency_contact_phone": string | null,
"full_name": string,
"gender": string | null,
"id": string,
"joined_on": string,
"member_code": string,
"notes": string | null,
"org_id": string,
"phone": string,
"photo_url": string | null,
"referred_by_member_id": string | null,
"source": Database["public"]['Enums']["member_source"],
"status": string,
"tags": (string)[],
"updated_at": string
            }
                          SetofOptions: {
        from: "*"
        to: "members"
        isOneToOne: true
        isSetofReturn: false
      } },
"split_gst":
{ Args: { "p_rate": number,"p_total": number }; Returns: {
              "cgst_amount": number,"sgst_amount": number,"taxable_value": number
            }[]
                           },
"submit_payment_claim":
{ Args: { "p_amount": number,"p_invoice_id": string,"p_note"?: string,"p_utr": string }; Returns: {
              "amount": number,
"claimed_at": string,
"created_at": string,
"id": string,
"invoice_id": string,
"member_id": string,
"note": string | null,
"org_id": string,
"payment_id": string | null,
"reject_reason": string | null,
"reviewed_at": string | null,
"reviewed_by": string | null,
"status": Database["public"]['Enums']["payment_claim_status"],
"updated_at": string,
"utr": string
            }
                          SetofOptions: {
        from: "*"
        to: "payment_claims"
        isOneToOne: true
        isSetofReturn: false
      } },
"transfer_ownership":
{ Args: { "p_team_member_id": string }; Returns: {
              "created_at": string,
"id": string,
"is_active": boolean,
"org_id": string,
"role": Database["public"]['Enums']["team_role"],
"updated_at": string,
"user_id": string
            }
                          SetofOptions: {
        from: "*"
        to: "team_members"
        isOneToOne: true
        isSetofReturn: false
      } },
"unfreeze_membership":
{ Args: { "p_membership_id": string }; Returns: {
              "created_at": string,
"created_by": string | null,
"discount_amount": number,
"end_date": string,
"final_amount": number,
"freeze_days_used": number,
"frozen_from": string | null,
"frozen_to": string | null,
"id": string,
"list_price": number,
"member_id": string,
"notes": string | null,
"org_id": string,
"plan_id": string,
"sessions_total": number | null,
"sessions_used": number,
"start_date": string,
"status": Database["public"]['Enums']["membership_status"],
"updated_at": string
            }
                          SetofOptions: {
        from: "*"
        to: "memberships"
        isOneToOne: true
        isSetofReturn: false
      } },
"void_invoice":
{ Args: { "p_invoice_id": string,"p_reason": string }; Returns: {
              "amount_paid": number,
"balance_due": number,
"cgst_amount": number,
"created_at": string,
"created_by": string | null,
"discount_amount": number,
"due_date": string,
"fiscal_year": string,
"gst_rate": number,
"id": string,
"invoice_number": string,
"issue_date": string,
"member_id": string,
"membership_id": string | null,
"notes": string | null,
"org_id": string,
"sgst_amount": number,
"status": Database["public"]['Enums']["invoice_status"],
"subtotal": number,
"taxable_value": number,
"total_amount": number,
"updated_at": string,
"void_reason": string | null,
"voided_at": string | null,
"voided_by": string | null
            }
                          SetofOptions: {
        from: "*"
        to: "invoices"
        isOneToOne: true
        isSetofReturn: false
      } },
"write_audit_log":
{ Args: { "p_action": string,"p_after"?: Json,"p_before"?: Json,"p_entity_id"?: string,"p_entity_type": string,"p_org": string }; Returns: undefined
                           }
          }
          Enums: {
            "check_in_flag": "expiring"|"expired"|"dues_pending","check_in_method": "manual"|"qr","collection_mode": "upi_direct"|"razorpay","collection_provider": "upi_direct"|"razorpay","collection_request_status": "pending"|"paid"|"expired"|"cancelled","expense_category": "rent"|"salaries"|"electricity"|"equipment"|"maintenance"|"marketing"|"supplies"|"other","invoice_status": "unpaid"|"partially_paid"|"paid"|"void","member_source": "walk_in"|"instagram"|"referral"|"google"|"other","membership_status": "upcoming"|"active"|"frozen"|"expired"|"cancelled","message_channel": "whatsapp_manual"|"whatsapp_api","message_status": "prepared"|"sent"|"delivered"|"failed","payment_claim_status": "pending"|"confirmed"|"rejected","payment_method": "cash"|"upi"|"razorpay"|"card"|"bank_transfer","plan_type": "duration"|"sessions","team_role": "owner"|"manager"|"staff"
          }
          CompositeTypes: {
            [_ in never]: never
          }
        }
}

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
  ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
  ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
  : never

export const Constants = {
  "public": {
          Enums: {
            "check_in_flag": ["expiring", "expired", "dues_pending"],"check_in_method": ["manual", "qr"],"collection_mode": ["upi_direct", "razorpay"],"collection_provider": ["upi_direct", "razorpay"],"collection_request_status": ["pending", "paid", "expired", "cancelled"],"expense_category": ["rent", "salaries", "electricity", "equipment", "maintenance", "marketing", "supplies", "other"],"invoice_status": ["unpaid", "partially_paid", "paid", "void"],"member_source": ["walk_in", "instagram", "referral", "google", "other"],"membership_status": ["upcoming", "active", "frozen", "expired", "cancelled"],"message_channel": ["whatsapp_manual", "whatsapp_api"],"message_status": ["prepared", "sent", "delivered", "failed"],"payment_claim_status": ["pending", "confirmed", "rejected"],"payment_method": ["cash", "upi", "razorpay", "card", "bank_transfer"],"plan_type": ["duration", "sessions"],"team_role": ["owner", "manager", "staff"]
          }
        }
} as const
