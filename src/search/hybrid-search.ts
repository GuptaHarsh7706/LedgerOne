/**
 * LedgerOne Hybrid Search Engine
 * 
 * Implements dense vector retrieval (pgvector HNSW), sparse full-text lexical retrieval
 * (PostgreSQL tsvector + GIN), and Reciprocal Rank Fusion (RRF).
 * 
 * Features:
 * - Multi-tenant and workspace isolation (strictly bounded by organization_id & workspace_id)
 * - Independent dense and lexical retrieval benchmarks
 * - Parametric Reciprocal Rank Fusion: RRF = Σ w_i / (k + rank_i)
 * - Page bounding box and geometry provenance preservation
 * - High-throughput P95 latency target (<= 200ms)
 */

import { Pool, PoolClient } from "pg";
import { appPool, adminPool, withTenantTransaction, TenantContext } from "../db/tenant-context.js";
import { defaultEmbeddingEngine, EmbeddingEngine } from "./embedding-engine.js";

export interface SearchOptions {
  workspaceId?: string;
  documentId?: string;
  limit?: number;
  k?: number; // RRF constant, default 60
  denseWeight?: number; // default 1.0
  lexicalWeight?: number; // default 1.0
  minScore?: number;
  poolClient?: PoolClient | Pool;
  useAdminPool?: boolean;
}

export interface SearchResultChunk {
  chunkId: string;
  organizationId: string;
  workspaceId: string;
  documentId: string;
  pageNumber: number;
  boundingBox: [number, number, number, number];
  content: string;
  denseScore: number;
  denseRank: number | null;
  lexicalScore: number;
  lexicalRank: number | null;
  rrfScore: number;
}

export interface SearchResponse {
  mode: "dense" | "lexical" | "hybrid";
  query: string;
  total: number;
  durationMs: number;
  results: SearchResultChunk[];
}

export class HybridSearchEngine {
  private embeddingEngine: EmbeddingEngine;
  private pool: Pool;

  constructor(embeddingEngine: EmbeddingEngine = defaultEmbeddingEngine, pool: Pool = appPool) {
    this.embeddingEngine = embeddingEngine;
    this.pool = pool;
  }

  /**
   * Executes Dense Semantic Vector Search using pgvector HNSW cosine distance (<=>).
   */
  async searchDense(
    orgId: string,
    query: string,
    options: SearchOptions = {}
  ): Promise<SearchResponse> {
    const startTime = performance.now();
    const limit = Math.min(Math.max(options.limit || 10, 1), 100);
    const queryEmbedding = this.embeddingEngine.embed(query);
    const vectorLiteral = this.embeddingEngine.formatForPgVector(queryEmbedding);

    const client = options.poolClient || (options.useAdminPool ? adminPool : this.pool);

    const sql = `
      SELECT 
        id AS chunk_id,
        organization_id,
        workspace_id,
        document_id,
        page_number,
        bounding_box,
        content,
        (1.0 - (embedding <=> $1::vector)) AS dense_score,
        ROW_NUMBER() OVER (ORDER BY (embedding <=> $1::vector) ASC) AS dense_rank
      FROM document_chunks
      WHERE organization_id = $2
        AND ($3::uuid IS NULL OR workspace_id = $3)
        AND ($4::uuid IS NULL OR document_id = $4)
        AND embedding IS NOT NULL
      ORDER BY (embedding <=> $1::vector) ASC
      LIMIT $5;
    `;

    const res = await client.query(sql, [
      vectorLiteral,
      orgId,
      options.workspaceId || null,
      options.documentId || null,
      limit,
    ]);

    const durationMs = Math.round((performance.now() - startTime) * 100) / 100;

    const results: SearchResultChunk[] = res.rows.map((row) => ({
      chunkId: row.chunk_id,
      organizationId: row.organization_id,
      workspaceId: row.workspace_id,
      documentId: row.document_id,
      pageNumber: row.page_number,
      boundingBox: typeof row.bounding_box === "string" ? JSON.parse(row.bounding_box) : row.bounding_box,
      content: row.content,
      denseScore: Math.max(0, Math.min(1, parseFloat(row.dense_score) || 0)),
      denseRank: parseInt(row.dense_rank, 10),
      lexicalScore: 0,
      lexicalRank: null,
      rrfScore: Math.max(0, Math.min(1, parseFloat(row.dense_score) || 0)),
    }));

    return {
      mode: "dense",
      query,
      total: results.length,
      durationMs,
      results,
    };
  }

  /**
   * Executes Full-Text Lexical Search using PostgreSQL tsvector and ts_rank_cd with GIN index.
   */
  async searchLexical(
    orgId: string,
    query: string,
    options: SearchOptions = {}
  ): Promise<SearchResponse> {
    const startTime = performance.now();
    const limit = Math.min(Math.max(options.limit || 10, 1), 100);

    const client = options.poolClient || (options.useAdminPool ? adminPool : this.pool);

    // Sanitize query for websearch/plainto tsquery
    const cleanQuery = query.trim().replace(/#/g, " number ").replace(/['"\\]/g, " ");

    const sql = `
      SELECT 
        id AS chunk_id,
        organization_id,
        workspace_id,
        document_id,
        page_number,
        bounding_box,
        content,
        ts_rank_cd(tsv_content, plainto_tsquery('english', $1)) AS lexical_score,
        ROW_NUMBER() OVER (ORDER BY ts_rank_cd(tsv_content, plainto_tsquery('english', $1)) DESC) AS lexical_rank
      FROM document_chunks
      WHERE organization_id = $2
        AND ($3::uuid IS NULL OR workspace_id = $3)
        AND ($4::uuid IS NULL OR document_id = $4)
        AND (
          tsv_content @@ plainto_tsquery('english', $1)
          OR content ILIKE '%' || $1 || '%'
        )
      ORDER BY ts_rank_cd(tsv_content, plainto_tsquery('english', $1)) DESC
      LIMIT $5;
    `;

    const res = await client.query(sql, [
      cleanQuery,
      orgId,
      options.workspaceId || null,
      options.documentId || null,
      limit,
    ]);

    const durationMs = Math.round((performance.now() - startTime) * 100) / 100;

    const results: SearchResultChunk[] = res.rows.map((row) => ({
      chunkId: row.chunk_id,
      organizationId: row.organization_id,
      workspaceId: row.workspace_id,
      documentId: row.document_id,
      pageNumber: row.page_number,
      boundingBox: typeof row.bounding_box === "string" ? JSON.parse(row.bounding_box) : row.bounding_box,
      content: row.content,
      denseScore: 0,
      denseRank: null,
      lexicalScore: parseFloat(row.lexical_score) || 0,
      lexicalRank: parseInt(row.lexical_rank, 10),
      rrfScore: parseFloat(row.lexical_score) || 0,
    }));

    return {
      mode: "lexical",
      query,
      total: results.length,
      durationMs,
      results,
    };
  }

  /**
   * Executes Reciprocal Rank Fusion (RRF) Hybrid Search combining dense and lexical branches.
   * RRF score = w_dense / (k + dense_rank) + w_lex / (k + lexical_rank)
   */
  async searchHybrid(
    orgId: string,
    query: string,
    options: SearchOptions = {}
  ): Promise<SearchResponse> {
    const startTime = performance.now();
    const limit = Math.min(Math.max(options.limit || 10, 1), 100);
    const k = options.k !== undefined ? options.k : 60;
    const wDense = options.denseWeight !== undefined ? options.denseWeight : 1.0;
    const wLex = options.lexicalWeight !== undefined ? options.lexicalWeight : 1.0;

    const queryEmbedding = this.embeddingEngine.embed(query);
    const vectorLiteral = this.embeddingEngine.formatForPgVector(queryEmbedding);
    const cleanQuery = query.trim().replace(/#/g, " number ").replace(/['"\\]/g, " ");

    const client = options.poolClient || (options.useAdminPool ? adminPool : this.pool);

    // Single-query CTE combining dense and lexical rankings into fused RRF scores
    const sql = `
      WITH dense_candidates AS (
        SELECT 
          id AS chunk_id,
          organization_id,
          workspace_id,
          document_id,
          page_number,
          bounding_box,
          content,
          (1.0 - (embedding <=> $1::vector)) AS dense_score,
          ROW_NUMBER() OVER (ORDER BY (embedding <=> $1::vector) ASC) AS dense_rank
        FROM document_chunks
        WHERE organization_id = $2
          AND ($3::uuid IS NULL OR workspace_id = $3)
          AND ($4::uuid IS NULL OR document_id = $4)
          AND embedding IS NOT NULL
        LIMIT 50
      ),
      lexical_candidates AS (
        SELECT 
          id AS chunk_id,
          organization_id,
          workspace_id,
          document_id,
          page_number,
          bounding_box,
          content,
          ts_rank_cd(tsv_content, plainto_tsquery('english', $5)) AS lexical_score,
          ROW_NUMBER() OVER (ORDER BY ts_rank_cd(tsv_content, plainto_tsquery('english', $5)) DESC) AS lexical_rank
        FROM document_chunks
        WHERE organization_id = $2
          AND ($3::uuid IS NULL OR workspace_id = $3)
          AND ($4::uuid IS NULL OR document_id = $4)
          AND (
            tsv_content @@ plainto_tsquery('english', $5)
            OR content ILIKE '%' || $5 || '%'
          )
        LIMIT 50
      ),
      fused AS (
        SELECT 
          COALESCE(d.chunk_id, l.chunk_id) AS chunk_id,
          COALESCE(d.organization_id, l.organization_id) AS organization_id,
          COALESCE(d.workspace_id, l.workspace_id) AS workspace_id,
          COALESCE(d.document_id, l.document_id) AS document_id,
          COALESCE(d.page_number, l.page_number) AS page_number,
          COALESCE(d.bounding_box, l.bounding_box) AS bounding_box,
          COALESCE(d.content, l.content) AS content,
          COALESCE(d.dense_score, 0.0) AS dense_score,
          d.dense_rank AS dense_rank,
          COALESCE(l.lexical_score, 0.0) AS lexical_score,
          l.lexical_rank AS lexical_rank,
          (
            COALESCE($6::float / ($8::int + d.dense_rank), 0.0) +
            COALESCE($7::float / ($8::int + l.lexical_rank), 0.0)
          ) AS rrf_score
        FROM dense_candidates d
        FULL OUTER JOIN lexical_candidates l ON d.chunk_id = l.chunk_id
      )
      SELECT *
      FROM fused
      WHERE ($9::float IS NULL OR rrf_score >= $9)
      ORDER BY rrf_score DESC
      LIMIT $10;
    `;

    const res = await client.query(sql, [
      vectorLiteral,
      orgId,
      options.workspaceId || null,
      options.documentId || null,
      cleanQuery,
      wDense,
      wLex,
      k,
      options.minScore || null,
      limit,
    ]);

    const durationMs = Math.round((performance.now() - startTime) * 100) / 100;

    const results: SearchResultChunk[] = res.rows.map((row) => ({
      chunkId: row.chunk_id,
      organizationId: row.organization_id,
      workspaceId: row.workspace_id,
      documentId: row.document_id,
      pageNumber: row.page_number,
      boundingBox: typeof row.bounding_box === "string" ? JSON.parse(row.bounding_box) : row.bounding_box,
      content: row.content,
      denseScore: Math.max(0, Math.min(1, parseFloat(row.dense_score) || 0)),
      denseRank: row.dense_rank ? parseInt(row.dense_rank, 10) : null,
      lexicalScore: parseFloat(row.lexical_score) || 0,
      lexicalRank: row.lexical_rank ? parseInt(row.lexical_rank, 10) : null,
      rrfScore: parseFloat(row.rrf_score) || 0,
    }));

    return {
      mode: "hybrid",
      query,
      total: results.length,
      durationMs,
      results,
    };
  }
}

export const defaultHybridSearchEngine = new HybridSearchEngine();
