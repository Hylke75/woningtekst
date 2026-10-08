
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  
  "graphql_public": {
          Tables: {
            [_ in never]: never
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "graphql":
{ Args: { "extensions"?: Json,"operationName"?: string,"query"?: string,"variables"?: Json }; Returns: Json
                           }
          }
          Enums: {
            [_ in never]: never
          }
          CompositeTypes: {
            [_ in never]: never
          }
        },"public": {
          Tables: {
            "ai_usage_events": {
                  Row: {
                    "cache_read_tokens": number,"created_at": string,"duration_ms": number | null,"error_code": string | null,"estimated_cost": number,"finished_at": string | null,"id": string,"input_tokens": number,"job_id": string | null,"model": string,"operation": string,"organization_id": string,"output_tokens": number,"property_id": string | null,"status": string,"user_id": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "cache_read_tokens"?: number,"created_at"?: string,"duration_ms"?: number | null,"error_code"?: string | null,"estimated_cost"?: number,"finished_at"?: string | null,"id"?: string,"input_tokens"?: number,"job_id"?: string | null,"model": string,"operation": string,"organization_id": string,"output_tokens"?: number,"property_id"?: string | null,"status": string,"user_id"?: string | null
                  }
                  Update: {
                    "cache_read_tokens"?: number,"created_at"?: string,"duration_ms"?: number | null,"error_code"?: string | null,"estimated_cost"?: number,"finished_at"?: string | null,"id"?: string,"input_tokens"?: number,"job_id"?: string | null,"model"?: string,"operation"?: string,"organization_id"?: string,"output_tokens"?: number,"property_id"?: string | null,"status"?: string,"user_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "ai_usage_events_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    }
                  ]
                },"audit_logs": {
                  Row: {
                    "action": string,"created_at": string,"entity_id": string | null,"entity_type": string,"id": number,"metadata": NonNullable<Json>,"organization_id": string | null,"user_id": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "action": string,"created_at"?: string,"entity_id"?: string | null,"entity_type": string,"id"?: never,"metadata"?: NonNullable<Json>,"organization_id"?: string | null,"user_id"?: string | null
                  }
                  Update: {
                    "action"?: string,"created_at"?: string,"entity_id"?: string | null,"entity_type"?: string,"id"?: never,"metadata"?: NonNullable<Json>,"organization_id"?: string | null,"user_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "audit_logs_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    }
                  ]
                },"content_versions": {
                  Row: {
                    "approved_at": string | null,"approved_by": string | null,"based_on_version_id": string | null,"channel": Database["public"]['Enums']["content_channel"],"content": string,"created_at": string,"edited_by": string | null,"generated_by": string | null,"generation_job_id": string | null,"hashtags": (string)[],"id": string,"language": Database["public"]['Enums']["content_language"],"meta_description": string | null,"organization_id": string,"prompt_version": string | null,"property_id": string,"seo_title": string | null,"slug": string | null,"source": Database["public"]['Enums']["content_source"],"status": Database["public"]['Enums']["content_status"],"style_guide_id": string | null,"style_guide_version": number | null,"submitted_at": string | null,"submitted_by": string | null,"version_number": number
                  }
                  ComputedFields: never
                  Insert: {
                    "approved_at"?: string | null,"approved_by"?: string | null,"based_on_version_id"?: string | null,"channel": Database["public"]['Enums']["content_channel"],"content": string,"created_at"?: string,"edited_by"?: string | null,"generated_by"?: string | null,"generation_job_id"?: string | null,"hashtags"?: (string)[],"id"?: string,"language": Database["public"]['Enums']["content_language"],"meta_description"?: string | null,"organization_id": string,"prompt_version"?: string | null,"property_id": string,"seo_title"?: string | null,"slug"?: string | null,"source": Database["public"]['Enums']["content_source"],"status"?: Database["public"]['Enums']["content_status"],"style_guide_id"?: string | null,"style_guide_version"?: number | null,"submitted_at"?: string | null,"submitted_by"?: string | null,"version_number": number
                  }
                  Update: {
                    "approved_at"?: string | null,"approved_by"?: string | null,"based_on_version_id"?: string | null,"channel"?: Database["public"]['Enums']["content_channel"],"content"?: string,"created_at"?: string,"edited_by"?: string | null,"generated_by"?: string | null,"generation_job_id"?: string | null,"hashtags"?: (string)[],"id"?: string,"language"?: Database["public"]['Enums']["content_language"],"meta_description"?: string | null,"organization_id"?: string,"prompt_version"?: string | null,"property_id"?: string,"seo_title"?: string | null,"slug"?: string | null,"source"?: Database["public"]['Enums']["content_source"],"status"?: Database["public"]['Enums']["content_status"],"style_guide_id"?: string | null,"style_guide_version"?: number | null,"submitted_at"?: string | null,"submitted_by"?: string | null,"version_number"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "content_versions_based_on_version_id_fkey"
      columns: ["based_on_version_id"]
isOneToOne: false
      referencedRelation: "content_versions"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "content_versions_generation_job_id_organization_id_fkey"
      columns: ["generation_job_id","organization_id"]
isOneToOne: false
      referencedRelation: "generation_jobs"
      referencedColumns: ["id","organization_id"]
    },{
      foreignKeyName: "content_versions_property_id_organization_id_fkey"
      columns: ["property_id","organization_id"]
isOneToOne: false
      referencedRelation: "properties"
      referencedColumns: ["id","organization_id"]
    },{
      foreignKeyName: "content_versions_property_id_organization_id_fkey"
      columns: ["property_id","organization_id"]
isOneToOne: false
      referencedRelation: "property_overview"
      referencedColumns: ["id","organization_id"]
    },{
      foreignKeyName: "content_versions_style_guide_id_organization_id_fkey"
      columns: ["style_guide_id","organization_id"]
isOneToOne: false
      referencedRelation: "style_guides"
      referencedColumns: ["id","organization_id"]
    }
                  ]
                },"generation_jobs": {
                  Row: {
                    "attempt_count": number,"created_at": string,"current_step": string | null,"error_code": string | null,"error_message": string | null,"estimated_cost": number,"finished_at": string | null,"heartbeat_at": string | null,"id": string,"idempotency_key": string,"input_hash": string,"job_type": Database["public"]['Enums']["job_type"],"model": string | null,"organization_id": string,"params": NonNullable<Json>,"property_id": string | null,"requested_by": string | null,"started_at": string | null,"status": Database["public"]['Enums']["job_status"],"steps": NonNullable<Json>,"style_guide_id": string | null,"token_usage": NonNullable<Json>
                  }
                  ComputedFields: never
                  Insert: {
                    "attempt_count"?: number,"created_at"?: string,"current_step"?: string | null,"error_code"?: string | null,"error_message"?: string | null,"estimated_cost"?: number,"finished_at"?: string | null,"heartbeat_at"?: string | null,"id"?: string,"idempotency_key": string,"input_hash": string,"job_type": Database["public"]['Enums']["job_type"],"model"?: string | null,"organization_id": string,"params"?: NonNullable<Json>,"property_id"?: string | null,"requested_by"?: string | null,"started_at"?: string | null,"status"?: Database["public"]['Enums']["job_status"],"steps"?: NonNullable<Json>,"style_guide_id"?: string | null,"token_usage"?: NonNullable<Json>
                  }
                  Update: {
                    "attempt_count"?: number,"created_at"?: string,"current_step"?: string | null,"error_code"?: string | null,"error_message"?: string | null,"estimated_cost"?: number,"finished_at"?: string | null,"heartbeat_at"?: string | null,"id"?: string,"idempotency_key"?: string,"input_hash"?: string,"job_type"?: Database["public"]['Enums']["job_type"],"model"?: string | null,"organization_id"?: string,"params"?: NonNullable<Json>,"property_id"?: string | null,"requested_by"?: string | null,"started_at"?: string | null,"status"?: Database["public"]['Enums']["job_status"],"steps"?: NonNullable<Json>,"style_guide_id"?: string | null,"token_usage"?: NonNullable<Json>
                  }
                  Relationships: [
                    {
      foreignKeyName: "generation_jobs_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "generation_jobs_property_id_organization_id_fkey"
      columns: ["property_id","organization_id"]
isOneToOne: false
      referencedRelation: "properties"
      referencedColumns: ["id","organization_id"]
    },{
      foreignKeyName: "generation_jobs_property_id_organization_id_fkey"
      columns: ["property_id","organization_id"]
isOneToOne: false
      referencedRelation: "property_overview"
      referencedColumns: ["id","organization_id"]
    },{
      foreignKeyName: "generation_jobs_style_guide_id_organization_id_fkey"
      columns: ["style_guide_id","organization_id"]
isOneToOne: false
      referencedRelation: "style_guides"
      referencedColumns: ["id","organization_id"]
    }
                  ]
                },"invitations": {
                  Row: {
                    "accepted_at": string | null,"accepted_by": string | null,"created_at": string,"email": string,"expires_at": string,"id": string,"invited_by": string | null,"organization_id": string,"revoked_at": string | null,"role": Database["public"]['Enums']["app_role"]
                  }
                  ComputedFields: never
                  Insert: {
                    "accepted_at"?: string | null,"accepted_by"?: string | null,"created_at"?: string,"email": string,"expires_at"?: string,"id"?: string,"invited_by"?: string | null,"organization_id": string,"revoked_at"?: string | null,"role": Database["public"]['Enums']["app_role"]
                  }
                  Update: {
                    "accepted_at"?: string | null,"accepted_by"?: string | null,"created_at"?: string,"email"?: string,"expires_at"?: string,"id"?: string,"invited_by"?: string | null,"organization_id"?: string,"revoked_at"?: string | null,"role"?: Database["public"]['Enums']["app_role"]
                  }
                  Relationships: [
                    {
      foreignKeyName: "invitations_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    }
                  ]
                },"organization_email_domains": {
                  Row: {
                    "created_at": string,"created_by": string | null,"default_role": Database["public"]['Enums']["app_role"],"domain": string,"is_active": boolean,"organization_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"created_by"?: string | null,"default_role"?: Database["public"]['Enums']["app_role"],"domain": string,"is_active"?: boolean,"organization_id": string
                  }
                  Update: {
                    "created_at"?: string,"created_by"?: string | null,"default_role"?: Database["public"]['Enums']["app_role"],"domain"?: string,"is_active"?: boolean,"organization_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "organization_email_domains_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    }
                  ]
                },"organization_memberships": {
                  Row: {
                    "created_at": string,"is_active": boolean,"organization_id": string,"role": Database["public"]['Enums']["app_role"],"updated_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"is_active"?: boolean,"organization_id": string,"role": Database["public"]['Enums']["app_role"],"updated_at"?: string,"user_id": string
                  }
                  Update: {
                    "created_at"?: string,"is_active"?: boolean,"organization_id"?: string,"role"?: Database["public"]['Enums']["app_role"],"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "organization_memberships_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "organization_memberships_user_id_fkey"
      columns: ["user_id"]
isOneToOne: true
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"organization_settings": {
                  Row: {
                    "ai_daily_cost_limit_eur": number,"ai_daily_requests_per_user": number,"ai_monthly_cost_limit_eur": number,"ai_requests_per_minute_per_user": number,"approval_roles": (Database["public"]['Enums']["app_role"])[],"organization_id": string,"retention_months_after_sale": number,"retention_months_inactive_concept": number,"updated_at": string,"updated_by": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "ai_daily_cost_limit_eur"?: number,"ai_daily_requests_per_user"?: number,"ai_monthly_cost_limit_eur"?: number,"ai_requests_per_minute_per_user"?: number,"approval_roles"?: (Database["public"]['Enums']["app_role"])[],"organization_id": string,"retention_months_after_sale"?: number,"retention_months_inactive_concept"?: number,"updated_at"?: string,"updated_by"?: string | null
                  }
                  Update: {
                    "ai_daily_cost_limit_eur"?: number,"ai_daily_requests_per_user"?: number,"ai_monthly_cost_limit_eur"?: number,"ai_requests_per_minute_per_user"?: number,"approval_roles"?: (Database["public"]['Enums']["app_role"])[],"organization_id"?: string,"retention_months_after_sale"?: number,"retention_months_inactive_concept"?: number,"updated_at"?: string,"updated_by"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "organization_settings_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: true
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    }
                  ]
                },"organizations": {
                  Row: {
                    "created_at": string,"id": string,"name": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"id"?: string,"name": string
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"name"?: string
                  }
                  Relationships: [
                    
                  ]
                },"profiles": {
                  Row: {
                    "created_at": string,"email": string,"full_name": string,"id": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"email"?: string,"full_name"?: string,"id": string,"updated_at"?: string
                  }
                  Update: {
                    "created_at"?: string,"email"?: string,"full_name"?: string,"id"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    
                  ]
                },"properties": {
                  Row: {
                    "addition": string | null,"address": string | null,"asking_price": number | null,"assigned_to": string | null,"bathrooms": number | null,"bedrooms": number | null,"city": string | null,"created_at": string,"created_by": string | null,"data_checked_at": string | null,"data_checked_by": string | null,"deleted_at": string | null,"energy_label": string | null,"facts_json": NonNullable<Json>,"floor_position": string | null,"floors": number | null,"house_number": string | null,"id": string,"listing_status": Database["public"]['Enums']["listing_status"],"living_area": number | null,"neighbourhood": string | null,"organization_id": string,"plot_area": number | null,"positioning_json": NonNullable<Json>,"postcode": string | null,"property_type": string | null,"publication_json": NonNullable<Json>,"rooms": number | null,"sale_condition": Database["public"]['Enums']["sale_condition"] | null,"toilets": number | null,"updated_at": string,"updated_by": string | null,"workflow_status": Database["public"]['Enums']["workflow_status"],"year_built": number | null
                  }
                  ComputedFields: never
                  Insert: {
                    "addition"?: string | null,"address"?: string | null,"asking_price"?: number | null,"assigned_to"?: string | null,"bathrooms"?: number | null,"bedrooms"?: number | null,"city"?: string | null,"created_at"?: string,"created_by"?: string | null,"data_checked_at"?: string | null,"data_checked_by"?: string | null,"deleted_at"?: string | null,"energy_label"?: string | null,"facts_json"?: NonNullable<Json>,"floor_position"?: string | null,"floors"?: number | null,"house_number"?: string | null,"id"?: string,"listing_status"?: Database["public"]['Enums']["listing_status"],"living_area"?: number | null,"neighbourhood"?: string | null,"organization_id": string,"plot_area"?: number | null,"positioning_json"?: NonNullable<Json>,"postcode"?: string | null,"property_type"?: string | null,"publication_json"?: NonNullable<Json>,"rooms"?: number | null,"sale_condition"?: Database["public"]['Enums']["sale_condition"] | null,"toilets"?: number | null,"updated_at"?: string,"updated_by"?: string | null,"workflow_status"?: Database["public"]['Enums']["workflow_status"],"year_built"?: number | null
                  }
                  Update: {
                    "addition"?: string | null,"address"?: string | null,"asking_price"?: number | null,"assigned_to"?: string | null,"bathrooms"?: number | null,"bedrooms"?: number | null,"city"?: string | null,"created_at"?: string,"created_by"?: string | null,"data_checked_at"?: string | null,"data_checked_by"?: string | null,"deleted_at"?: string | null,"energy_label"?: string | null,"facts_json"?: NonNullable<Json>,"floor_position"?: string | null,"floors"?: number | null,"house_number"?: string | null,"id"?: string,"listing_status"?: Database["public"]['Enums']["listing_status"],"living_area"?: number | null,"neighbourhood"?: string | null,"organization_id"?: string,"plot_area"?: number | null,"positioning_json"?: NonNullable<Json>,"postcode"?: string | null,"property_type"?: string | null,"publication_json"?: NonNullable<Json>,"rooms"?: number | null,"sale_condition"?: Database["public"]['Enums']["sale_condition"] | null,"toilets"?: number | null,"updated_at"?: string,"updated_by"?: string | null,"workflow_status"?: Database["public"]['Enums']["workflow_status"],"year_built"?: number | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "properties_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    }
                  ]
                },"property_documents": {
                  Row: {
                    "alt_text_en": string | null,"alt_text_nl": string | null,"created_at": string,"document_type": Database["public"]['Enums']["document_type"],"extraction_error": string | null,"extraction_status": Database["public"]['Enums']["extraction_status"],"file_size": number,"filename": string,"id": string,"mime_type": string,"organization_id": string,"page_count": number | null,"property_id": string,"sha256": string,"storage_path": string,"uploaded_by": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "alt_text_en"?: string | null,"alt_text_nl"?: string | null,"created_at"?: string,"document_type"?: Database["public"]['Enums']["document_type"],"extraction_error"?: string | null,"extraction_status"?: Database["public"]['Enums']["extraction_status"],"file_size": number,"filename": string,"id"?: string,"mime_type": string,"organization_id": string,"page_count"?: number | null,"property_id": string,"sha256": string,"storage_path": string,"uploaded_by"?: string | null
                  }
                  Update: {
                    "alt_text_en"?: string | null,"alt_text_nl"?: string | null,"created_at"?: string,"document_type"?: Database["public"]['Enums']["document_type"],"extraction_error"?: string | null,"extraction_status"?: Database["public"]['Enums']["extraction_status"],"file_size"?: number,"filename"?: string,"id"?: string,"mime_type"?: string,"organization_id"?: string,"page_count"?: number | null,"property_id"?: string,"sha256"?: string,"storage_path"?: string,"uploaded_by"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "property_documents_property_id_organization_id_fkey"
      columns: ["property_id","organization_id"]
isOneToOne: false
      referencedRelation: "properties"
      referencedColumns: ["id","organization_id"]
    },{
      foreignKeyName: "property_documents_property_id_organization_id_fkey"
      columns: ["property_id","organization_id"]
isOneToOne: false
      referencedRelation: "property_overview"
      referencedColumns: ["id","organization_id"]
    }
                  ]
                },"property_facts": {
                  Row: {
                    "confidence": Database["public"]['Enums']["confidence_level"],"created_at": string,"extraction_job_id": string | null,"field_name": string,"field_value": string,"id": string,"organization_id": string,"property_id": string,"source_document_id": string | null,"source_quote": string | null,"source_reference": string | null,"source_type": Database["public"]['Enums']["fact_source_type"],"verification_status": Database["public"]['Enums']["verification_status"],"verified_at": string | null,"verified_by": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "confidence"?: Database["public"]['Enums']["confidence_level"],"created_at"?: string,"extraction_job_id"?: string | null,"field_name": string,"field_value": string,"id"?: string,"organization_id": string,"property_id": string,"source_document_id"?: string | null,"source_quote"?: string | null,"source_reference"?: string | null,"source_type": Database["public"]['Enums']["fact_source_type"],"verification_status"?: Database["public"]['Enums']["verification_status"],"verified_at"?: string | null,"verified_by"?: string | null
                  }
                  Update: {
                    "confidence"?: Database["public"]['Enums']["confidence_level"],"created_at"?: string,"extraction_job_id"?: string | null,"field_name"?: string,"field_value"?: string,"id"?: string,"organization_id"?: string,"property_id"?: string,"source_document_id"?: string | null,"source_quote"?: string | null,"source_reference"?: string | null,"source_type"?: Database["public"]['Enums']["fact_source_type"],"verification_status"?: Database["public"]['Enums']["verification_status"],"verified_at"?: string | null,"verified_by"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "property_facts_extraction_job_id_organization_id_fkey"
      columns: ["extraction_job_id","organization_id"]
isOneToOne: false
      referencedRelation: "generation_jobs"
      referencedColumns: ["id","organization_id"]
    },{
      foreignKeyName: "property_facts_property_id_organization_id_fkey"
      columns: ["property_id","organization_id"]
isOneToOne: false
      referencedRelation: "properties"
      referencedColumns: ["id","organization_id"]
    },{
      foreignKeyName: "property_facts_property_id_organization_id_fkey"
      columns: ["property_id","organization_id"]
isOneToOne: false
      referencedRelation: "property_overview"
      referencedColumns: ["id","organization_id"]
    },{
      foreignKeyName: "property_facts_source_document_id_organization_id_fkey"
      columns: ["source_document_id","organization_id"]
isOneToOne: false
      referencedRelation: "property_documents"
      referencedColumns: ["id","organization_id"]
    }
                  ]
                },"property_presence": {
                  Row: {
                    "organization_id": string,"property_id": string,"seen_at": string,"slot": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "organization_id": string,"property_id": string,"seen_at"?: string,"slot"?: string,"user_id": string
                  }
                  Update: {
                    "organization_id"?: string,"property_id"?: string,"seen_at"?: string,"slot"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "property_presence_property_id_organization_id_fkey"
      columns: ["property_id","organization_id"]
isOneToOne: false
      referencedRelation: "properties"
      referencedColumns: ["id","organization_id"]
    },{
      foreignKeyName: "property_presence_property_id_organization_id_fkey"
      columns: ["property_id","organization_id"]
isOneToOne: false
      referencedRelation: "property_overview"
      referencedColumns: ["id","organization_id"]
    },{
      foreignKeyName: "property_presence_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"review_issues": {
                  Row: {
                    "category": string,"content_version_id": string | null,"created_at": string,"description": string,"field_name": string | null,"generation_job_id": string | null,"id": string,"organization_id": string,"property_id": string,"resolution_status": Database["public"]['Enums']["resolution_status"],"resolved_at": string | null,"resolved_by": string | null,"severity": Database["public"]['Enums']["issue_severity"],"source_details": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "category"?: string,"content_version_id"?: string | null,"created_at"?: string,"description": string,"field_name"?: string | null,"generation_job_id"?: string | null,"id"?: string,"organization_id": string,"property_id": string,"resolution_status"?: Database["public"]['Enums']["resolution_status"],"resolved_at"?: string | null,"resolved_by"?: string | null,"severity": Database["public"]['Enums']["issue_severity"],"source_details"?: string | null
                  }
                  Update: {
                    "category"?: string,"content_version_id"?: string | null,"created_at"?: string,"description"?: string,"field_name"?: string | null,"generation_job_id"?: string | null,"id"?: string,"organization_id"?: string,"property_id"?: string,"resolution_status"?: Database["public"]['Enums']["resolution_status"],"resolved_at"?: string | null,"resolved_by"?: string | null,"severity"?: Database["public"]['Enums']["issue_severity"],"source_details"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "review_issues_content_version_id_organization_id_fkey"
      columns: ["content_version_id","organization_id"]
isOneToOne: false
      referencedRelation: "content_versions"
      referencedColumns: ["id","organization_id"]
    },{
      foreignKeyName: "review_issues_generation_job_id_organization_id_fkey"
      columns: ["generation_job_id","organization_id"]
isOneToOne: false
      referencedRelation: "generation_jobs"
      referencedColumns: ["id","organization_id"]
    },{
      foreignKeyName: "review_issues_property_id_organization_id_fkey"
      columns: ["property_id","organization_id"]
isOneToOne: false
      referencedRelation: "properties"
      referencedColumns: ["id","organization_id"]
    },{
      foreignKeyName: "review_issues_property_id_organization_id_fkey"
      columns: ["property_id","organization_id"]
isOneToOne: false
      referencedRelation: "property_overview"
      referencedColumns: ["id","organization_id"]
    }
                  ]
                },"style_guides": {
                  Row: {
                    "change_note": string,"content": string,"created_at": string,"created_by": string | null,"id": string,"is_active": boolean,"organization_id": string,"title": string,"version": number
                  }
                  ComputedFields: never
                  Insert: {
                    "change_note"?: string,"content": string,"created_at"?: string,"created_by"?: string | null,"id"?: string,"is_active"?: boolean,"organization_id": string,"title"?: string,"version": number
                  }
                  Update: {
                    "change_note"?: string,"content"?: string,"created_at"?: string,"created_by"?: string | null,"id"?: string,"is_active"?: boolean,"organization_id"?: string,"title"?: string,"version"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "style_guides_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    }
                  ]
                }
          }
          Views: {
            "property_overview": {
                  Row: {
                    "addition": string | null,"address": string | null,"approved_count": number | null,"asking_price": number | null,"assigned_to": string | null,"assigned_to_name": string | null,"city": string | null,"created_at": string | null,"created_by": string | null,"deleted_at": string | null,"house_number": string | null,"id": string | null,"last_activity_at": string | null,"listing_status": Database["public"]['Enums']["listing_status"] | null,"neighbourhood": string | null,"open_issue_count": number | null,"organization_id": string | null,"postcode": string | null,"property_type": string | null,"review_count": number | null,"text_count": number | null,"updated_at": string | null,"workflow_status": Database["public"]['Enums']["workflow_status"] | null
                  }
                  ComputedFields: never
                  Relationships: [
                    {
      foreignKeyName: "properties_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    }
                  ]
                }
          }
          Functions: {
            "activate_style_guide":
{ Args: { "p_id": string }; Returns: {
              "change_note": string,
"content": string,
"created_at": string,
"created_by": string | null,
"id": string,
"is_active": boolean,
"organization_id": string,
"title": string,
"version": number
            }
                          SetofOptions: {
        from: "*"
        to: "style_guides"
        isOneToOne: true
        isSetofReturn: false
      } },
"admin_create_invitation":
{ Args: { "p_email": string,"p_role": Database["public"]['Enums']["app_role"] }; Returns: {
              "accepted_at": string | null,
"accepted_by": string | null,
"created_at": string,
"email": string,
"expires_at": string,
"id": string,
"invited_by": string | null,
"organization_id": string,
"revoked_at": string | null,
"role": Database["public"]['Enums']["app_role"]
            }
                          SetofOptions: {
        from: "*"
        to: "invitations"
        isOneToOne: true
        isSetofReturn: false
      } },
"admin_remove_email_domain":
{ Args: { "p_domain": string }; Returns: undefined
                           },
"admin_revoke_invitation":
{ Args: { "p_id": string }; Returns: undefined
                           },
"admin_set_email_domain":
{ Args: { "p_domain": string,"p_role": Database["public"]['Enums']["app_role"] }; Returns: {
              "created_at": string,
"created_by": string | null,
"default_role": Database["public"]['Enums']["app_role"],
"domain": string,
"is_active": boolean,
"organization_id": string
            }
                          SetofOptions: {
        from: "*"
        to: "organization_email_domains"
        isOneToOne: true
        isSetofReturn: false
      } },
"admin_update_member":
{ Args: { "p_is_active": boolean,"p_role": Database["public"]['Enums']["app_role"],"p_user_id": string }; Returns: {
              "created_at": string,
"is_active": boolean,
"organization_id": string,
"role": Database["public"]['Enums']["app_role"],
"updated_at": string,
"user_id": string
            }
                          SetofOptions: {
        from: "*"
        to: "organization_memberships"
        isOneToOne: true
        isSetofReturn: false
      } },
"cancel_generation_job":
{ Args: { "p_job_id": string }; Returns: undefined
                           },
"dashboard_stats":
{ Args: { "p_days"?: number }; Returns: Json
                           },
"log_event":
{ Args: { "p_action": string,"p_entity_id": string,"p_entity_type": string,"p_metadata"?: Json }; Returns: undefined
                           },
"mark_property_checked":
{ Args: { "p_checked": boolean,"p_property_id": string }; Returns: string
                           },
"mfa_status":
{ Args: Record<PropertyKey, never>; Returns: {
              "current_level": string,"has_verified_factor": boolean
            }[]
                           },
"patch_property":
{ Args: { "p_columns": Json,"p_facts"?: Json,"p_positioning"?: Json,"p_property_id": string,"p_publication"?: Json }; Returns: string
                           },
"publish_style_guide":
{ Args: { "p_activate"?: boolean,"p_change_note": string,"p_content": string,"p_title": string }; Returns: {
              "change_note": string,
"content": string,
"created_at": string,
"created_by": string | null,
"id": string,
"is_active": boolean,
"organization_id": string,
"title": string,
"version": number
            }
                          SetofOptions: {
        from: "*"
        to: "style_guides"
        isOneToOne: true
        isSetofReturn: false
      } },
"purge_property":
{ Args: { "p_property_id": string }; Returns: undefined
                           },
"retention_candidates":
{ Args: Record<PropertyKey, never>; Returns: {
              "label": string,"last_change": string,"property_id": string,"reason": string
            }[]
                           },
"save_content_version":
{ Args: { "p_based_on_version_id"?: string,"p_channel": Database["public"]['Enums']["content_channel"],"p_content": string,"p_expected_version": number,"p_generation_job_id"?: string,"p_hashtags"?: (string)[],"p_language": Database["public"]['Enums']["content_language"],"p_meta_description"?: string,"p_prompt_version"?: string,"p_property_id": string,"p_seo_title"?: string,"p_slug"?: string,"p_source": Database["public"]['Enums']["content_source"],"p_style_guide_id"?: string }; Returns: {
              "approved_at": string | null,
"approved_by": string | null,
"based_on_version_id": string | null,
"channel": Database["public"]['Enums']["content_channel"],
"content": string,
"created_at": string,
"edited_by": string | null,
"generated_by": string | null,
"generation_job_id": string | null,
"hashtags": (string)[],
"id": string,
"language": Database["public"]['Enums']["content_language"],
"meta_description": string | null,
"organization_id": string,
"prompt_version": string | null,
"property_id": string,
"seo_title": string | null,
"slug": string | null,
"source": Database["public"]['Enums']["content_source"],
"status": Database["public"]['Enums']["content_status"],
"style_guide_id": string | null,
"style_guide_version": number | null,
"submitted_at": string | null,
"submitted_by": string | null,
"version_number": number
            }
                          SetofOptions: {
        from: "*"
        to: "content_versions"
        isOneToOne: true
        isSetofReturn: false
      } },
"server_admin_digest":
{ Args: { "p_secret": string }; Returns: Json
                           },
"server_ai_finish":
{ Args: { "p_cache_read_tokens": number,"p_duration_ms": number,"p_error_code": string,"p_estimated_cost": number,"p_event_id": string,"p_input_tokens": number,"p_output_tokens": number,"p_secret": string,"p_status": string }; Returns: undefined
                           },
"server_ai_reserve":
{ Args: { "p_job_id": string,"p_model": string,"p_operation": string,"p_property_id": string,"p_secret": string }; Returns: Json
                           },
"server_job_claim":
{ Args: { "p_job_id": string,"p_secret": string,"p_stale_seconds"?: number }; Returns: {
              "attempt_count": number,
"created_at": string,
"current_step": string | null,
"error_code": string | null,
"error_message": string | null,
"estimated_cost": number,
"finished_at": string | null,
"heartbeat_at": string | null,
"id": string,
"idempotency_key": string,
"input_hash": string,
"job_type": Database["public"]['Enums']["job_type"],
"model": string | null,
"organization_id": string,
"params": NonNullable<Json>,
"property_id": string | null,
"requested_by": string | null,
"started_at": string | null,
"status": Database["public"]['Enums']["job_status"],
"steps": NonNullable<Json>,
"style_guide_id": string | null,
"token_usage": NonNullable<Json>
            }
                          SetofOptions: {
        from: "*"
        to: "generation_jobs"
        isOneToOne: true
        isSetofReturn: false
      } },
"server_job_update":
{ Args: { "p_current_step": string,"p_error_code": string,"p_error_message": string,"p_job_id": string,"p_secret": string,"p_status": Database["public"]['Enums']["job_status"],"p_steps_patch": Json }; Returns: {
              "attempt_count": number,
"created_at": string,
"current_step": string | null,
"error_code": string | null,
"error_message": string | null,
"estimated_cost": number,
"finished_at": string | null,
"heartbeat_at": string | null,
"id": string,
"idempotency_key": string,
"input_hash": string,
"job_type": Database["public"]['Enums']["job_type"],
"model": string | null,
"organization_id": string,
"params": NonNullable<Json>,
"property_id": string | null,
"requested_by": string | null,
"started_at": string | null,
"status": Database["public"]['Enums']["job_status"],
"steps": NonNullable<Json>,
"style_guide_id": string | null,
"token_usage": NonNullable<Json>
            }
                          SetofOptions: {
        from: "*"
        to: "generation_jobs"
        isOneToOne: true
        isSetofReturn: false
      } },
"set_content_status":
{ Args: { "p_status": Database["public"]['Enums']["content_status"],"p_version_id": string }; Returns: {
              "approved_at": string | null,
"approved_by": string | null,
"based_on_version_id": string | null,
"channel": Database["public"]['Enums']["content_channel"],
"content": string,
"created_at": string,
"edited_by": string | null,
"generated_by": string | null,
"generation_job_id": string | null,
"hashtags": (string)[],
"id": string,
"language": Database["public"]['Enums']["content_language"],
"meta_description": string | null,
"organization_id": string,
"prompt_version": string | null,
"property_id": string,
"seo_title": string | null,
"slug": string | null,
"source": Database["public"]['Enums']["content_source"],
"status": Database["public"]['Enums']["content_status"],
"style_guide_id": string | null,
"style_guide_version": number | null,
"submitted_at": string | null,
"submitted_by": string | null,
"version_number": number
            }
                          SetofOptions: {
        from: "*"
        to: "content_versions"
        isOneToOne: true
        isSetofReturn: false
      } },
"touch_presence":
{ Args: { "p_property_id": string,"p_slot": string }; Returns: {
              "full_name": string,"seen_at": string,"slot": string,"user_id": string
            }[]
                           }
          }
          Enums: {
            "app_role": "admin"|"makelaar"|"redacteur","confidence_level": "hoog"|"middel"|"laag","content_channel": "funda"|"website"|"facebook"|"instagram","content_language": "nl"|"en","content_source": "ai_generatie"|"ai_herschrijving"|"handmatig"|"hersteld","content_status": "concept"|"ter_controle"|"goedgekeurd","document_type": "originele_omschrijving"|"verkoopdossier"|"meetrapport"|"plattegrond"|"foto"|"energielabel"|"vve_document"|"overig","extraction_status": "niet_gestart"|"bezig"|"voltooid"|"mislukt"|"niet_van_toepassing","fact_source_type": "document"|"geplakte_tekst"|"handmatig","issue_severity": "info"|"waarschuwing"|"kritiek","job_status": "wachtrij"|"bezig"|"voltooid"|"mislukt"|"geannuleerd","job_type": "volledige_generatie"|"enkele_hergeneratie"|"herschrijving"|"tekstcontrole"|"extractie"|"schrijfwijzer_analyse","listing_status": "in_voorbereiding"|"beschikbaar"|"onder_bod"|"verkocht_onder_voorbehoud"|"verkocht"|"ingetrokken","resolution_status": "open"|"opgelost"|"genegeerd","sale_condition": "kosten_koper"|"vrij_op_naam","verification_status": "onbevestigd"|"bevestigd"|"conflict"|"afgewezen","workflow_status": "concept"|"in_controle"|"goedgekeurd"|"gearchiveerd"
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
  "graphql_public": {
          Enums: {
            
          }
        },"public": {
          Enums: {
            "app_role": ["admin", "makelaar", "redacteur"],"confidence_level": ["hoog", "middel", "laag"],"content_channel": ["funda", "website", "facebook", "instagram"],"content_language": ["nl", "en"],"content_source": ["ai_generatie", "ai_herschrijving", "handmatig", "hersteld"],"content_status": ["concept", "ter_controle", "goedgekeurd"],"document_type": ["originele_omschrijving", "verkoopdossier", "meetrapport", "plattegrond", "foto", "energielabel", "vve_document", "overig"],"extraction_status": ["niet_gestart", "bezig", "voltooid", "mislukt", "niet_van_toepassing"],"fact_source_type": ["document", "geplakte_tekst", "handmatig"],"issue_severity": ["info", "waarschuwing", "kritiek"],"job_status": ["wachtrij", "bezig", "voltooid", "mislukt", "geannuleerd"],"job_type": ["volledige_generatie", "enkele_hergeneratie", "herschrijving", "tekstcontrole", "extractie", "schrijfwijzer_analyse"],"listing_status": ["in_voorbereiding", "beschikbaar", "onder_bod", "verkocht_onder_voorbehoud", "verkocht", "ingetrokken"],"resolution_status": ["open", "opgelost", "genegeerd"],"sale_condition": ["kosten_koper", "vrij_op_naam"],"verification_status": ["onbevestigd", "bevestigd", "conflict", "afgewezen"],"workflow_status": ["concept", "in_controle", "goedgekeurd", "gearchiveerd"]
          }
        }
} as const
