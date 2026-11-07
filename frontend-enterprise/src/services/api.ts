import {
  AuthTokens,
  User,
  DocumentMetadata,
  ReviewBundle,
  ThreeWayMatchResult,
  SpendAnalytics,
  AssistantCitation,
} from "./types";

export const DEFAULT_ORG_ID = "6c885eec-bed8-4060-8215-a50eb442bf5d";
export const DEFAULT_WORKSPACE_ID = "9b2b92c0-56a0-4568-8d42-9d2681d30fc9";

class ApiClient {
  private baseUrl = "/api/v1";
  private token: string | null = null;
  private orgId = DEFAULT_ORG_ID;
  private workspaceId = DEFAULT_WORKSPACE_ID;

  constructor() {
    if (typeof window !== "undefined") {
      this.token = localStorage.getItem("ledgerone_token");
      const storedOrg = localStorage.getItem("ledgerone_org_id");
      const storedWs = localStorage.getItem("ledgerone_ws_id");
      if (storedOrg) this.orgId = storedOrg;
      if (storedWs) this.workspaceId = storedWs;
    }
  }

  setToken(token: string | null) {
    this.token = token;
    if (typeof window !== "undefined") {
      if (token) {
        localStorage.setItem("ledgerone_token", token);
      } else {
        localStorage.removeItem("ledgerone_token");
      }
    }
  }

  getToken(): string | null {
    return this.token;
  }

  setWorkspace(orgId: string, workspaceId: string) {
    this.orgId = orgId;
    this.workspaceId = workspaceId;
    if (typeof window !== "undefined") {
      localStorage.setItem("ledgerone_org_id", orgId);
      localStorage.setItem("ledgerone_ws_id", workspaceId);
    }
  }

  getWorkspace() {
    return { orgId: this.orgId, workspaceId: this.workspaceId };
  }

  private async request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const headers = new Headers(options.headers || {});
    headers.set("Content-Type", "application/json");

    if (this.token) {
      headers.set("Authorization", `Bearer ${this.token}`);
    }
    if (this.orgId) {
      headers.set("X-Organization-ID", this.orgId);
    }

    const url = `${this.baseUrl}${endpoint}`;
    const response = await fetch(url, {
      ...options,
      headers,
    });

    if (response.status === 401) {
      this.setToken(null);
      if (typeof window !== "undefined" && !window.location.pathname.includes("/login")) {
        window.location.href = "/login";
      }
      throw new Error("Session expired. Please log in again.");
    }

    if (!response.ok) {
      let errorMessage = `HTTP ${response.status} ${response.statusText}`;
      try {
        const errorData = await response.json();
        errorMessage = errorData.detail || errorData.message || errorMessage;
      } catch {
        // Fallback to generic message
      }
      throw new Error(errorMessage);
    }

    // 204 No Content
    if (response.status === 204) {
      return {} as T;
    }

    return response.json();
  }

  // --- Auth APIs ---
  async login(email: string, password: string): Promise<AuthTokens & { user: User }> {
    const res = await this.request<AuthTokens>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });
    this.setToken(res.access_token);

    // Mock/extract user profile from token or set default reviewer user
    const user: User = {
      id: "usr_apex_reviewer_001",
      email,
      name: email.split("@")[0].replace(".", " ").replace(/\b\w/g, (c) => c.toUpperCase()),
      role: "WORKSPACE_ADMIN",
      organization_id: this.orgId,
      workspace_id: this.workspaceId,
    };
    if (typeof window !== "undefined") {
      localStorage.setItem("ledgerone_user", JSON.stringify(user));
    }
    return { ...res, user };
  }

  async logout(): Promise<void> {
    this.setToken(null);
    if (typeof window !== "undefined") {
      localStorage.removeItem("ledgerone_user");
    }
  }

  getCurrentUser(): User | null {
    if (typeof window !== "undefined") {
      const stored = localStorage.getItem("ledgerone_user");
      if (stored) {
        try {
          return JSON.parse(stored);
        } catch {
          return null;
        }
      }
    }
    return null;
  }

  // --- Documents APIs ---
  async listDocuments(params?: {
    search?: string;
    lifecycle_status?: string;
    limit?: number;
    offset?: number;
  }): Promise<{ documents: DocumentMetadata[]; total: number }> {
    const query = new URLSearchParams();
    if (params?.search) query.set("search", params.search);
    if (params?.lifecycle_status && params.lifecycle_status !== "ALL") {
      query.set("lifecycle_status", params.lifecycle_status);
    }
    if (params?.limit) query.set("limit", params.limit.toString());
    if (params?.offset) query.set("offset", params.offset.toString());

    const queryString = query.toString() ? `?${query.toString()}` : "";
    const res = await this.request<DocumentMetadata[]>(
      `/organizations/${this.orgId}/workspaces/${this.workspaceId}/documents${queryString}`
    );
    return {
      documents: Array.isArray(res) ? res : [],
      total: Array.isArray(res) ? res.length : 0,
    };
  }

  async getDocument(docId: string): Promise<DocumentMetadata> {
    return this.request<DocumentMetadata>(
      `/organizations/${this.orgId}/workspaces/${this.workspaceId}/documents/${docId}`
    );
  }

  async initiateUpload(filename: string, fileSizeBytes: number, mimeType: string) {
    return this.request<{
      document_id: string;
      upload_id: string;
      s3_key: string;
      parts: Array<{ part_number: number; presigned_url: string }>;
    }>(
      `/organizations/${this.orgId}/workspaces/${this.workspaceId}/documents/initiate-upload`,
      {
        method: "POST",
        body: JSON.stringify({
          filename,
          file_size_bytes: fileSizeBytes,
          mime_type: mimeType,
        }),
      }
    );
  }

  async completeUpload(documentId: string, uploadId: string, parts: Array<{ part_number: number; etag: string }>) {
    return this.request<DocumentMetadata>(
      `/organizations/${this.orgId}/workspaces/${this.workspaceId}/documents/complete-upload`,
      {
        method: "POST",
        body: JSON.stringify({
          document_id: documentId,
          upload_id: uploadId,
          parts,
        }),
      }
    );
  }

  async deleteDocument(docId: string): Promise<void> {
    await this.request(
      `/organizations/${this.orgId}/workspaces/${this.workspaceId}/documents/${docId}`,
      { method: "DELETE" }
    );
  }

  // --- Human Review APIs ---
  async getReviewBundle(docId: string): Promise<ReviewBundle> {
    return this.request<ReviewBundle>(
      `/organizations/${this.orgId}/workspaces/${this.workspaceId}/documents/${docId}/review`
    );
  }

  async listReviewQueue(): Promise<DocumentMetadata[]> {
    const res = await this.request<DocumentMetadata[]>(
      `/organizations/${this.orgId}/workspaces/${this.workspaceId}/review-queue`
    );
    return Array.isArray(res) ? res : [];
  }

  async claimDocument(docId: string): Promise<void> {
    await this.request(
      `/organizations/${this.orgId}/workspaces/${this.workspaceId}/documents/${docId}/review/claim`,
      { method: "POST" }
    );
  }

  async correctField(docId: string, fieldName: string, value: any, rationale?: string) {
    return this.request(
      `/organizations/${this.orgId}/workspaces/${this.workspaceId}/documents/${docId}/review/correct-field`,
      {
        method: "POST",
        body: JSON.stringify({
          field_name: fieldName,
          corrected_value: value,
          rationale: rationale || "Auditor manual correction",
        }),
      }
    );
  }

  async correctLineItem(docId: string, lineIndex: number, field: string, value: any) {
    return this.request(
      `/organizations/${this.orgId}/workspaces/${this.workspaceId}/documents/${docId}/review/correct-line-item`,
      {
        method: "POST",
        body: JSON.stringify({
          line_index: lineIndex,
          field,
          value,
        }),
      }
    );
  }

  async overrideInvariant(docId: string, invariantId: string, rationale: string) {
    return this.request(
      `/organizations/${this.orgId}/workspaces/${this.workspaceId}/documents/${docId}/review/override-invariant`,
      {
        method: "POST",
        body: JSON.stringify({
          invariant_id: invariantId,
          rationale,
        }),
      }
    );
  }

  async verifyDocument(docId: string): Promise<void> {
    await this.request(
      `/organizations/${this.orgId}/workspaces/${this.workspaceId}/documents/${docId}/review/verify`,
      { method: "POST" }
    );
  }

  async rejectDocument(docId: string, reason: string): Promise<void> {
    await this.request(
      `/organizations/${this.orgId}/workspaces/${this.workspaceId}/documents/${docId}/review/reject`,
      {
        method: "POST",
        body: JSON.stringify({ reason }),
      }
    );
  }

  // --- Cross-Document 3-Way Match & Analytics ---
  async match3Way(invoiceDocId: string): Promise<ThreeWayMatchResult> {
    return this.request<ThreeWayMatchResult>(
      `/organizations/${this.orgId}/workspaces/${this.workspaceId}/cross-document/match-3way/${invoiceDocId}`,
      { method: "POST" }
    );
  }

  async linkDocuments(sourceDocId: string, targetDocId: string, relationType: string) {
    return this.request(
      `/organizations/${this.orgId}/workspaces/${this.workspaceId}/cross-document/link`,
      {
        method: "POST",
        body: JSON.stringify({
          source_document_id: sourceDocId,
          target_document_id: targetDocId,
          relation_type: relationType,
        }),
      }
    );
  }

  async getSpendAnalytics(): Promise<SpendAnalytics> {
    return this.request<SpendAnalytics>(
      `/organizations/${this.orgId}/workspaces/${this.workspaceId}/cross-document/analytics`
    );
  }

  // --- Grounded AI Assistant APIs ---
  async createAssistantSession(title?: string): Promise<{ session_id: string; title: string }> {
    return this.request<{ session_id: string; title: string }>(
      `/organizations/${this.orgId}/workspaces/${this.workspaceId}/assistant/sessions`,
      {
        method: "POST",
        body: JSON.stringify({ title: title || "Forensic Investigation" }),
      }
    );
  }

  async askAssistant(sessionId: string, query: string): Promise<{
    answer: string;
    citations: AssistantCitation[];
    grounded: boolean;
  }> {
    return this.request<{
      answer: string;
      citations: AssistantCitation[];
      grounded: boolean;
    }>(
      `/organizations/${this.orgId}/workspaces/${this.workspaceId}/assistant/sessions/${sessionId}/ask`,
      {
        method: "POST",
        body: JSON.stringify({ query }),
      }
    );
  }
}

export const api = new ApiClient();
