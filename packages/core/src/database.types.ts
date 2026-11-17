
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
            "api_keys": {
                  Row: {
                    "created_at": string,"id": string,"key_hash": string,"key_prefix": string,"last_used_at": string | null,"name": string,"owner_id": string,"revoked_at": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"id"?: string,"key_hash": string,"key_prefix": string,"last_used_at"?: string | null,"name": string,"owner_id": string,"revoked_at"?: string | null
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"key_hash"?: string,"key_prefix"?: string,"last_used_at"?: string | null,"name"?: string,"owner_id"?: string,"revoked_at"?: string | null
                  }
                  Relationships: [
                    
                  ]
                },"chunks": {
                  Row: {
                    "chunk_index": number,"content": string,"document_id": string,"embedding": string,"fts": unknown,"id": string,"owner_id": string,"page_end": number,"page_start": number,"token_count": number
                  }
                  ComputedFields: never
                  Insert: {
                    "chunk_index": number,"content": string,"document_id": string,"embedding": string,"fts"?: never,"id"?: string,"owner_id": string,"page_end": number,"page_start": number,"token_count": number
                  }
                  Update: {
                    "chunk_index"?: number,"content"?: string,"document_id"?: string,"embedding"?: string,"fts"?: never,"id"?: string,"owner_id"?: string,"page_end"?: number,"page_start"?: number,"token_count"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "chunks_document_id_fkey"
      columns: ["document_id"]
isOneToOne: false
      referencedRelation: "documents"
      referencedColumns: ["id"]
    }
                  ]
                },"documents": {
                  Row: {
                    "content_type": string,"created_at": string,"error": string | null,"external_ref": string | null,"id": string,"industry": string | null,"mime_type": string,"owner_id": string,"page_count": number | null,"published_at": string | null,"source_url": string | null,"status": string,"storage_path": string,"title": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "content_type": string,"created_at"?: string,"error"?: string | null,"external_ref"?: string | null,"id"?: string,"industry"?: string | null,"mime_type"?: string,"owner_id": string,"page_count"?: number | null,"published_at"?: string | null,"source_url"?: string | null,"status"?: string,"storage_path": string,"title": string,"updated_at"?: string
                  }
                  Update: {
                    "content_type"?: string,"created_at"?: string,"error"?: string | null,"external_ref"?: string | null,"id"?: string,"industry"?: string | null,"mime_type"?: string,"owner_id"?: string,"page_count"?: number | null,"published_at"?: string | null,"source_url"?: string | null,"status"?: string,"storage_path"?: string,"title"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    
                  ]
                },"query_logs": {
                  Row: {
                    "cost_usd": number | null,"created_at": string,"embedding_tokens": number | null,"error": string | null,"id": string,"input_tokens": number | null,"kind": string,"latency_ms": number | null,"metadata": NonNullable<Json>,"model": string | null,"output_tokens": number | null,"query": string,"retrieved_chunk_ids": (string)[] | null,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "cost_usd"?: number | null,"created_at"?: string,"embedding_tokens"?: number | null,"error"?: string | null,"id"?: string,"input_tokens"?: number | null,"kind": string,"latency_ms"?: number | null,"metadata"?: NonNullable<Json>,"model"?: string | null,"output_tokens"?: number | null,"query": string,"retrieved_chunk_ids"?: (string)[] | null,"user_id": string
                  }
                  Update: {
                    "cost_usd"?: number | null,"created_at"?: string,"embedding_tokens"?: number | null,"error"?: string | null,"id"?: string,"input_tokens"?: number | null,"kind"?: string,"latency_ms"?: number | null,"metadata"?: NonNullable<Json>,"model"?: string | null,"output_tokens"?: number | null,"query"?: string,"retrieved_chunk_ids"?: (string)[] | null,"user_id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"rate_limits": {
                  Row: {
                    "bucket": string,"count": number,"user_id": string,"window_start": string
                  }
                  ComputedFields: never
                  Insert: {
                    "bucket": string,"count"?: number,"user_id": string,"window_start": string
                  }
                  Update: {
                    "bucket"?: string,"count"?: number,"user_id"?: string,"window_start"?: string
                  }
                  Relationships: [
                    
                  ]
                }
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "claim_document":
{ Args: { "p_document_id"?: string }; Returns: {
              "content_type": string,
"created_at": string,
"error": string | null,
"external_ref": string | null,
"id": string,
"industry": string | null,
"mime_type": string,
"owner_id": string,
"page_count": number | null,
"published_at": string | null,
"source_url": string | null,
"status": string,
"storage_path": string,
"title": string,
"updated_at": string
            }[]
                          SetofOptions: {
        from: "*"
        to: "documents"
        isOneToOne: false
        isSetofReturn: true
      } },
"consume_rate_limit":
{ Args: { "p_bucket": string,"p_limit": number,"p_user_id"?: string,"p_window_seconds": number }; Returns: {
              "allowed": boolean,"remaining": number,"reset_at": string
            }[]
                           },
"match_chunks_hybrid":
{ Args: { "candidate_count"?: number,"filter_after"?: string,"filter_before"?: string,"filter_content_type"?: (string)[],"filter_document_ids"?: (string)[],"filter_industry"?: (string)[],"filter_owner"?: string,"match_count"?: number,"query_embedding": string,"query_text": string,"rrf_k"?: number,"search_mode"?: string }; Returns: {
              "chunk_index": number,"content": string,"content_type": string,"document_id": string,"document_title": string,"external_ref": string,"id": string,"industry": string,"keyword_rank": number,"keyword_score": number,"page_end": number,"page_start": number,"published_at": string,"rrf_score": number,"token_count": number,"vector_rank": number,"vector_score": number
            }[]
                           },
"replace_document_chunks":
{ Args: { "p_chunks": Json,"p_document_id": string,"p_page_count": number }; Returns: number
                           },
"usage_summary":
{ Args: { "p_days"?: number }; Returns: {
              "cost_usd": number,"embedding_tokens": number,"errors": number,"input_tokens": number,"kind": string,"output_tokens": number,"p50_latency_ms": number,"p95_latency_ms": number,"queries": number
            }[]
                           }
          }
          Enums: {
            [_ in never]: never
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
            
          }
        }
} as const
