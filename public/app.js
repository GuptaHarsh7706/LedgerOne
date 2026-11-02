/**
 * LedgerOne — Phase 5: Human Verification UI & Review Studio (HITL)
 * 
 * Provides side-by-side visual document inspection, DPI-accurate bounding box canvas
 * rendering, multi-gate invariant health telemetry, and 6-role permission-aware field
 * verification with immutable audit logging.
 */

// Application State
const state = {
  token: null,
  role: "REVIEWER",
  organizationId: null,
  workspaceId: null,
  documents: [],
  activeDoc: null,
  fields: [],
  chunks: [],
  invariants: null,
  activeFilter: "ALL",
  hoveredFieldId: null,
  selectedFieldId: null,
  canvasScale: 1.0,
  zoom: 1.0,
};

// DOM Elements
const docListEl = document.getElementById("documentList");
const docCountBadgeEl = document.getElementById("docCountBadge");
const roleSelectorEl = document.getElementById("roleSelector");
const activeDocBarEl = document.getElementById("activeDocBar");
const activeDocNameEl = document.getElementById("activeDocName");
const activeDocCategoryEl = document.getElementById("activeDocCategory");
const activeDocStatusEl = document.getElementById("activeDocStatus");
const documentTextLayerEl = document.getElementById("documentTextLayer");
const overlayCanvasEl = document.getElementById("overlayCanvas");
const documentSheetEl = document.getElementById("documentSheet");
const fieldsTableBodyEl = document.getElementById("fieldsTableBody");
const fieldVerifiedCountEl = document.getElementById("fieldVerifiedCount");
const overallConfidenceBadgeEl = document.getElementById("overallConfidenceBadge");
const btnApproveDocEl = document.getElementById("btnApproveDoc");
const btnViewAuditEl = document.getElementById("btnViewAudit");
const auditDrawerEl = document.getElementById("auditDrawer");
const btnCloseAuditEl = document.getElementById("btnCloseAudit");
const auditEntriesListEl = document.getElementById("auditEntriesList");

// Modal Elements
const verifyModalEl = document.getElementById("verifyModal");
const btnCloseModalEl = document.getElementById("btnCloseModal");
const btnCancelVerifyEl = document.getElementById("btnCancelVerify");
const btnSubmitVerifyEl = document.getElementById("btnSubmitVerify");
const modalFieldNameEl = document.getElementById("modalFieldName");
const modalRawValueEl = document.getElementById("modalRawValue");
const modalVerifiedInputEl = document.getElementById("modalVerifiedInput");
const modalNotesInputEl = document.getElementById("modalNotesInput");

// Invariant Rule Elements
const ruleHeaderMathEl = document.getElementById("ruleHeaderMath");
const ruleLineMathEl = document.getElementById("ruleLineMath");
const ruleSumSubtotalEl = document.getElementById("ruleSumSubtotal");
const ruleDateValidEl = document.getElementById("ruleDateValid");

// Canvas 2D Context
const ctx = overlayCanvasEl.getContext("2d");

// ============================================================================
// 1. INITIALIZATION & AUTHENTICATION BOOTSTRAP
// ============================================================================
async function init() {
  console.log("[LedgerOne HITL] Initializing Review Studio...");
  setupEventListeners();
  await authenticateUser();
  await loadDocuments();
}

async function authenticateUser() {
  try {
    // Quick login or register an active user session
    state.role = roleSelectorEl.value || "REVIEWER";
    const email = `reviewer@ledgerone.test`;
    const password = `Password123!`;

    // Attempt login
    let loginRes = await fetch("/api/v1/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });

    if (loginRes.status !== 200) {
      // Auto-register default demo user
      await fetch("/api/v1/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, fullName: "Senior Financial Reviewer" }),
      });
      loginRes = await fetch("/api/v1/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
    }

    const authData = await loginRes.json();
    state.token = authData.accessToken;

    // Get organizations
    const meRes = await fetch("/api/v1/auth/me", {
      headers: { Authorization: `Bearer ${state.token}` },
    });
    const meData = await meRes.json();

    if (meData.organizations && meData.organizations.length > 0) {
      state.organizationId = meData.organizations[0].id;
    } else {
      // Create demo org
      const newOrgRes = await fetch("/api/v1/organizations", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${state.token}` },
        body: JSON.stringify({ name: "Global Cloud Finance", slug: "global-cloud-" + Date.now().toString(36) }),
      });
      const newOrgData = await newOrgRes.json();
      state.organizationId = newOrgData.organization.id;
      state.workspaceId = newOrgData.defaultWorkspace.id;
    }

    if (!state.workspaceId) {
      const wsRes = await fetch("/api/v1/workspaces", {
        headers: { Authorization: `Bearer ${state.token}`, "x-organization-id": state.organizationId },
      });
      const wsData = await wsRes.json();
      if (wsData.workspaces && wsData.workspaces.length > 0) {
        state.workspaceId = wsData.workspaces[0].id;
      }
    }

    updateRoleBadge();
  } catch (err) {
    console.error("[HITL] Auth bootstrap failed:", err);
  }
}

function updateRoleBadge() {
  const isViewer = state.role === "VIEWER";
  btnApproveDocEl.disabled = isViewer;
  if (isViewer) {
    btnApproveDocEl.title = "Viewer role cannot approve documents (HTTP 403)";
  } else {
    btnApproveDocEl.title = "Approve and mark document COMPLETED";
  }
}

// ============================================================================
// 2. DOCUMENT QUEUE & TRIAGE
// ============================================================================
async function loadDocuments() {
  if (!state.token || !state.organizationId) return;

  try {
    const res = await fetch("/api/v1/documents", {
      headers: {
        Authorization: `Bearer ${state.token}`,
        "x-organization-id": state.organizationId,
        "x-workspace-id": state.workspaceId || "",
      },
    });

    if (res.status === 200) {
      const data = await res.json();
      state.documents = data.documents || [];
      renderDocumentList();

      // Automatically select first document awaiting review or first available
      if (state.documents.length > 0 && !state.activeDoc) {
        const priorityDoc = state.documents.find((d) => d.status === "AWAITING_REVIEW") || state.documents[0];
        selectDocument(priorityDoc);
      }
    }
  } catch (err) {
    console.error("[HITL] Error loading documents:", err);
  }
}

function renderDocumentList() {
  const filtered = state.documents.filter((doc) => {
    if (state.activeFilter === "ALL") return true;
    return doc.status === state.activeFilter;
  });

  docCountBadgeEl.textContent = filtered.length;

  if (filtered.length === 0) {
    docListEl.innerHTML = `
      <div class="py-12 text-center text-xs text-slate-500 space-y-2">
        <svg class="w-8 h-8 mx-auto text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>
        <p>No documents found</p>
      </div>
    `;
    return;
  }

  docListEl.innerHTML = filtered
    .map((doc) => {
      const isActive = state.activeDoc && state.activeDoc.id === doc.id;
      const statusColor = getStatusBadge(doc.status);
      const formattedDate = new Date(doc.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

      return `
        <div class="doc-card p-3 rounded-lg cursor-pointer transition border ${
          isActive
            ? "bg-slate-800/90 border-emerald-500/50 shadow-md"
            : "bg-slate-900/40 border-slate-800/80 hover:bg-slate-800/60 hover:border-slate-700"
        }" onclick="window.selectDocById('${doc.id}')">
          <div class="flex items-center justify-between mb-1">
            <span class="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-950 text-slate-400 border border-slate-800">${doc.category || "INVOICE"}</span>
            <span class="text-[10px] font-mono px-2 py-0.5 rounded-full ${statusColor}">${doc.status}</span>
          </div>
          <div class="font-medium text-xs text-slate-200 truncate mb-1" title="${doc.filename}">${doc.filename}</div>
          <div class="flex items-center justify-between text-[11px] text-slate-500 font-mono">
            <span>${(doc.file_size_bytes / 1024).toFixed(1)} KB</span>
            <span>${formattedDate}</span>
          </div>
        </div>
      `;
    })
    .join("");
}

function getStatusBadge(status) {
  switch (status) {
    case "COMPLETED":
      return "bg-emerald-500/10 text-emerald-400 border border-emerald-500/30";
    case "AWAITING_REVIEW":
      return "bg-amber-500/10 text-amber-400 border border-amber-500/30 animate-pulse";
    case "PROCESSING":
      return "bg-sky-500/10 text-sky-400 border border-sky-500/30";
    case "FAILED":
      return "bg-rose-500/10 text-rose-400 border border-rose-500/30";
    default:
      return "bg-slate-800 text-slate-400 border border-slate-700";
  }
}

window.selectDocById = function (id) {
  const doc = state.documents.find((d) => d.id === id);
  if (doc) selectDocument(doc);
};

// ============================================================================
// 3. DOCUMENT DETAIL & DATA FETCHING
// ============================================================================
async function selectDocument(doc) {
  state.activeDoc = doc;
  renderDocumentList();

  // Update header bar
  activeDocNameEl.textContent = doc.filename;
  activeDocCategoryEl.textContent = doc.category || "INVOICE";
  activeDocStatusEl.textContent = doc.status;
  activeDocStatusEl.className = `px-2.5 py-0.5 text-xs font-mono font-medium rounded-full ${getStatusBadge(doc.status)}`;

  // Enable/disable approve button based on status and role
  const canApprove = (state.role === "REVIEWER" || state.role === "DOCUMENT_MANAGER" || state.role === "ORGANIZATION_ADMIN") && doc.status === "AWAITING_REVIEW";
  btnApproveDocEl.disabled = !canApprove;

  // Clear previous data
  documentTextLayerEl.textContent = "Loading document text...";
  fieldsTableBodyEl.innerHTML = `<tr><td colspan="4" class="py-8 text-center text-slate-500 font-sans">Fetching extracted fields...</td></tr>`;

  // Parallel fetch: Content, Fields, Chunks, Invariants
  const headers = {
    Authorization: `Bearer ${state.token}`,
    "x-organization-id": state.organizationId,
    "x-workspace-id": state.workspaceId || "",
  };

  try {
    const [contentRes, fieldsRes, chunksRes, invRes] = await Promise.all([
      fetch(`/api/v1/documents/${doc.id}/content`, { headers }),
      fetch(`/api/v1/documents/${doc.id}/fields`, { headers }),
      fetch(`/api/v1/documents/${doc.id}/chunks`, { headers }),
      fetch(`/api/v1/documents/${doc.id}/invariants`, { headers }),
    ]);

    // 1. Content & Text Layer
    if (contentRes.status === 200) {
      const cData = await contentRes.json();
      documentTextLayerEl.textContent = cData.content || "Empty document payload.";
    }

    // 2. Extracted Fields
    if (fieldsRes.status === 200) {
      const fData = await fieldsRes.json();
      state.fields = fData.fields || [];
      renderFieldsTable();
    }

    // 3. Document Chunks (for geometry tokens)
    if (chunksRes.status === 200) {
      const chData = await chunksRes.json();
      state.chunks = chData.chunks || [];
    }

    // 4. Invariants Status
    if (invRes.status === 200) {
      state.invariants = await invRes.json();
      renderInvariants();
    }

    // Render Bounding Boxes on Overlay Canvas
    resizeAndRenderCanvas();
  } catch (err) {
    console.error("[HITL] Error loading document details:", err);
  }
}

// ============================================================================
// 4. BOUNDING BOX CANVAS RENDERING ENGINE
// ============================================================================
function resizeAndRenderCanvas() {
  const rect = documentSheetEl.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;

  overlayCanvasEl.width = rect.width * dpr;
  overlayCanvasEl.height = rect.height * dpr;
  overlayCanvasEl.style.width = `${rect.width}px`;
  overlayCanvasEl.style.height = `${rect.height}px`;

  ctx.scale(dpr, dpr);
  drawBoundingBoxes(rect.width, rect.height);
}

function drawBoundingBoxes(width, height) {
  ctx.clearRect(0, 0, width, height);

  for (const field of state.fields) {
    if (!field.bounding_box || field.bounding_box.length !== 4) continue;

    const [xMin, yMin, xMax, yMax] = field.bounding_box;
    const x = xMin * width;
    const y = yMin * height;
    const boxW = (xMax - xMin) * width;
    const boxH = Math.max(18, (yMax - yMin) * height);

    const isHovered = state.hoveredFieldId === field.id;
    const isSelected = state.selectedFieldId === field.id;
    const isHighConf = field.confidence >= 0.85;

    // Box Color Assignment
    let fill = isHighConf ? "rgba(34, 197, 94, 0.12)" : "rgba(245, 158, 11, 0.15)";
    let stroke = isHighConf ? "rgba(34, 197, 94, 0.7)" : "rgba(245, 158, 11, 0.8)";

    if (field.is_verified) {
      fill = "rgba(14, 165, 233, 0.15)";
      stroke = "rgba(14, 165, 233, 0.85)";
    }

    if (isHovered || isSelected) {
      fill = "rgba(56, 189, 248, 0.28)";
      stroke = "rgba(56, 189, 248, 1.0)";
    }

    // Draw Translucent Rectangle
    ctx.fillStyle = fill;
    ctx.fillRect(x, y, boxW, boxH);

    // Draw Border
    ctx.lineWidth = isHovered || isSelected ? 2 : 1;
    ctx.strokeStyle = stroke;
    ctx.strokeRect(x, y, boxW, boxH);

    // Draw Field Name Label Tag
    ctx.fillStyle = isHovered || isSelected ? "#38bdf8" : stroke;
    ctx.font = "bold 9px monospace";
    ctx.fillText(field.field_name, x + 2, y > 12 ? y - 3 : y + boxH + 9);
  }
}

// Canvas Mouse Interactions
overlayCanvasEl.addEventListener("mousemove", (e) => {
  const rect = overlayCanvasEl.getBoundingClientRect();
  const mouseX = e.clientX - rect.left;
  const mouseY = e.clientY - rect.top;
  const width = rect.width;
  const height = rect.height;

  let hovered = null;
  for (const field of state.fields) {
    if (!field.bounding_box || field.bounding_box.length !== 4) continue;
    const [xMin, yMin, xMax, yMax] = field.bounding_box;
    const x = xMin * width;
    const y = yMin * height;
    const boxW = (xMax - xMin) * width;
    const boxH = Math.max(18, (yMax - yMin) * height);

    if (mouseX >= x && mouseX <= x + boxW && mouseY >= y && mouseY <= y + boxH) {
      hovered = field;
      break;
    }
  }

  if (hovered?.id !== state.hoveredFieldId) {
    state.hoveredFieldId = hovered?.id || null;
    resizeAndRenderCanvas();
    highlightFieldRow(state.hoveredFieldId);
  }
});

overlayCanvasEl.addEventListener("click", (e) => {
  if (state.hoveredFieldId) {
    state.selectedFieldId = state.hoveredFieldId;
    const field = state.fields.find((f) => f.id === state.selectedFieldId);
    if (field && state.role !== "VIEWER") {
      openVerifyModal(field);
    }
  }
});

// ============================================================================
// 5. EXTRACTED FIELDS TABLE & HITL ACTIONS
// ============================================================================
function renderFieldsTable() {
  const verifiedCount = state.fields.filter((f) => f.is_verified).length;
  fieldVerifiedCountEl.textContent = `${verifiedCount} / ${state.fields.length} Verified`;

  if (state.fields.length === 0) {
    fieldsTableBodyEl.innerHTML = `<tr><td colspan="4" class="py-8 text-center text-slate-500 font-sans">No fields extracted</td></tr>`;
    return;
  }

  const isViewer = state.role === "VIEWER";

  fieldsTableBodyEl.innerHTML = state.fields
    .map((field) => {
      const confPercent = Math.round(field.confidence * 100);
      const isVerified = field.is_verified;
      const displayVal = isVerified ? field.verified_value : (field.field_value_normalized ?? field.field_value_raw);

      return `
        <tr id="field-row-${field.id}" 
            class="field-row group hover:bg-slate-800/40 transition border-b border-slate-800/40 cursor-pointer"
            onmouseenter="window.onFieldHover('${field.id}')"
            onmouseleave="window.onFieldLeave()">
          <td class="py-2.5 px-2">
            <span class="text-xs font-mono font-semibold text-slate-300">${field.field_name}</span>
          </td>
          <td class="py-2.5 px-2 font-mono">
            <span class="text-xs ${isVerified ? "text-sky-300 font-bold" : "text-slate-200"}">${displayVal}</span>
            ${isVerified ? '<span class="ml-1 text-[10px] text-sky-400 font-sans">(verified)</span>' : ""}
          </td>
          <td class="py-2.5 px-2 font-mono">
            <div class="flex items-center gap-1.5">
              <div class="w-12 h-1.5 bg-slate-800 rounded-full overflow-hidden">
                <div class="h-full ${confPercent >= 85 ? "bg-emerald-400" : "bg-amber-400"}" style="width: ${confPercent}%"></div>
              </div>
              <span class="text-[11px] text-slate-400">${confPercent}%</span>
            </div>
          </td>
          <td class="py-2.5 px-2 text-right">
            ${
              isVerified
                ? `<span class="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-sans font-medium bg-sky-500/10 text-sky-400 border border-sky-500/30">Verified</span>`
                : `
                <div class="inline-flex items-center space-x-1">
                  <button class="px-2 py-0.5 rounded bg-emerald-600/80 hover:bg-emerald-500 text-[11px] font-sans font-medium text-white transition disabled:opacity-30 disabled:cursor-not-allowed"
                          onclick="event.stopPropagation(); window.approveFieldAsIs('${field.id}')"
                          ${isViewer ? "disabled title='Viewer cannot verify'" : ""}>
                    Approve
                  </button>
                  <button class="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-[11px] font-sans font-medium text-slate-300 border border-slate-700 transition disabled:opacity-30 disabled:cursor-not-allowed"
                          onclick="event.stopPropagation(); window.openEditFieldModal('${field.id}')"
                          ${isViewer ? "disabled title='Viewer cannot edit'" : ""}>
                    Edit
                  </button>
                </div>
              `
            }
          </td>
        </tr>
      `;
    })
    .join("");
}

window.onFieldHover = function (fieldId) {
  state.hoveredFieldId = fieldId;
  resizeAndRenderCanvas();
  highlightFieldRow(fieldId);
};

window.onFieldLeave = function () {
  state.hoveredFieldId = null;
  resizeAndRenderCanvas();
  highlightFieldRow(null);
};

function highlightFieldRow(fieldId) {
  document.querySelectorAll(".field-row").forEach((row) => row.classList.remove("field-highlighted"));
  if (fieldId) {
    const targetRow = document.getElementById(`field-row-${fieldId}`);
    if (targetRow) targetRow.classList.add("field-highlighted");
  }
}

// Approve Field As-Is
window.approveFieldAsIs = async function (fieldId) {
  if (state.role === "VIEWER") {
    alert("Viewer role is strictly forbidden from modifying fields (HTTP 403).");
    return;
  }

  try {
    const res = await fetch(`/api/v1/documents/${state.activeDoc.id}/fields/${fieldId}/verify`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${state.token}`,
        "x-organization-id": state.organizationId,
        "x-workspace-id": state.workspaceId || "",
      },
      body: JSON.stringify({ approveAsIs: true, notes: "Approved verbatim by reviewer" }),
    });

    if (res.status === 200) {
      const data = await res.json();
      const idx = state.fields.findIndex((f) => f.id === fieldId);
      if (idx !== -1) {
        state.fields[idx] = data.field;
        renderFieldsTable();
        resizeAndRenderCanvas();
      }
    } else {
      const err = await res.json();
      alert(`Verification failed (${res.status}): ${err.error}`);
    }
  } catch (err) {
    console.error("[HITL] Error verifying field:", err);
  }
};

// Open Edit Field Modal
window.openEditFieldModal = function (fieldId) {
  const field = state.fields.find((f) => f.id === fieldId);
  if (!field) return;
  openVerifyModal(field);
};

let currentModalField = null;

function openVerifyModal(field) {
  currentModalField = field;
  modalFieldNameEl.textContent = field.field_name;
  modalRawValueEl.textContent = field.field_value_raw || "(none)";
  modalVerifiedInputEl.value = field.verified_value || field.field_value_normalized || field.field_value_raw;
  modalNotesInputEl.value = "";
  verifyModalEl.classList.remove("hidden");
  modalVerifiedInputEl.focus();
}

function closeVerifyModal() {
  verifyModalEl.classList.add("hidden");
  currentModalField = null;
}

btnSubmitVerifyEl.addEventListener("click", async () => {
  if (!currentModalField) return;

  const verifiedValue = modalVerifiedInputEl.value.trim();
  const notes = modalNotesInputEl.value.trim();

  if (!verifiedValue) {
    alert("Please provide a verified value.");
    return;
  }

  try {
    const res = await fetch(`/api/v1/documents/${state.activeDoc.id}/fields/${currentModalField.id}/verify`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${state.token}`,
        "x-organization-id": state.organizationId,
        "x-workspace-id": state.workspaceId || "",
      },
      body: JSON.stringify({ verifiedValue, notes }),
    });

    if (res.status === 200) {
      const data = await res.json();
      const idx = state.fields.findIndex((f) => f.id === currentModalField.id);
      if (idx !== -1) {
        state.fields[idx] = data.field;
        renderFieldsTable();
        resizeAndRenderCanvas();
      }
      closeVerifyModal();
    } else {
      const err = await res.json();
      alert(`Verification failed (${res.status}): ${err.error}`);
    }
  } catch (err) {
    console.error("[HITL] Verification submission error:", err);
  }
});

// ============================================================================
// 6. INVARIANT STATUS & REASONING BREAKDOWN
// ============================================================================
function renderInvariants() {
  if (!state.invariants || !state.invariants.intelligence) return;

  const intel = state.invariants.intelligence;
  overallConfidenceBadgeEl.textContent = `Conf: ${(intel.overall_confidence * 100).toFixed(1)}%`;

  // Status mapping
  const checks = intel.checks || [];
  const getRule = (ruleId) => checks.find((c) => c.ruleId === ruleId);

  const headerMath = getRule("MATH-HEADER-BALANCE");
  const lineMath = getRule("MATH-LINE-ITEM-ACCURACY");
  const sumSubtotal = getRule("MATH-LINE-SUM-TO-SUBTOTAL");
  const dateValid = getRule("DATE-CHRONOLOGY-VALID");

  updateRuleBadge(ruleHeaderMathEl, headerMath);
  updateRuleBadge(ruleLineMathEl, lineMath);
  updateRuleBadge(ruleSumSubtotalEl, sumSubtotal);
  updateRuleBadge(ruleDateValidEl, dateValid);
}

function updateRuleBadge(el, rule) {
  if (!rule) {
    el.textContent = "N/A";
    el.className = "font-mono text-slate-500 text-[10px]";
    return;
  }

  if (rule.passed) {
    el.textContent = "PASS";
    el.className = "font-mono text-emerald-400 font-bold text-[10px]";
  } else {
    el.textContent = "VIOLATION";
    el.className = "font-mono text-rose-400 font-bold text-[10px]";
    el.title = rule.discrepancy || "Rule check failed";
  }
}

// ============================================================================
// 7. DOCUMENT APPROVAL & AUDIT TRAIL
// ============================================================================
btnApproveDocEl.addEventListener("click", async () => {
  if (!state.activeDoc) return;
  if (state.role === "VIEWER") {
    alert("Viewer role cannot approve documents (HTTP 403 Forbidden).");
    return;
  }

  if (!confirm(`Are you sure you want to approve document '${state.activeDoc.filename}' and mark it COMPLETED?`)) {
    return;
  }

  try {
    const res = await fetch(`/api/v1/documents/${state.activeDoc.id}/approve`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${state.token}`,
        "x-organization-id": state.organizationId,
        "x-workspace-id": state.workspaceId || "",
      },
      body: JSON.stringify({ notes: "Reviewed and approved in LedgerOne HITL Studio" }),
    });

    if (res.status === 200) {
      alert("Document successfully approved and transitioned to COMPLETED!");
      await loadDocuments();
      if (state.activeDoc) {
        selectDocById(state.activeDoc.id);
      }
    } else {
      const err = await res.json();
      alert(`Approval failed (${res.status}): ${err.error}`);
    }
  } catch (err) {
    console.error("[HITL] Error approving document:", err);
  }
});

btnViewAuditEl.addEventListener("click", async () => {
  if (!state.activeDoc) return;
  auditDrawerEl.classList.remove("translate-x-full");

  try {
    const res = await fetch(`/api/v1/documents/${state.activeDoc.id}/audit-trail`, {
      headers: {
        Authorization: `Bearer ${state.token}`,
        "x-organization-id": state.organizationId,
        "x-workspace-id": state.workspaceId || "",
      },
    });

    if (res.status === 200) {
      const data = await res.json();
      renderAuditTrail(data.auditTrail || []);
    }
  } catch (err) {
    console.error("[HITL] Error loading audit trail:", err);
  }
});

btnCloseAuditEl.addEventListener("click", () => {
  auditDrawerEl.classList.add("translate-x-full");
});

function renderAuditTrail(entries) {
  if (entries.length === 0) {
    auditEntriesListEl.innerHTML = `<div class="text-slate-500 text-center py-6">No audit records found</div>`;
    return;
  }

  auditEntriesListEl.innerHTML = entries
    .map((e) => {
      const ts = new Date(e.created_at).toLocaleString();
      return `
        <div class="p-2.5 rounded bg-slate-950 border border-slate-800 space-y-1">
          <div class="flex items-center justify-between">
            <span class="text-emerald-400 font-bold">${e.action}</span>
            <span class="text-slate-500 text-[10px]">${ts}</span>
          </div>
          <div class="text-[11px] text-slate-300">User: ${e.user_email || "System"}</div>
          ${e.new_state ? `<pre class="text-[10px] text-slate-400 overflow-x-auto bg-slate-900/60 p-1 rounded">${JSON.stringify(e.new_state, null, 2)}</pre>` : ""}
        </div>
      `;
    })
    .join("");
}

// ============================================================================
// 8. EVENT LISTENERS & ZOOM CONTROLS
// ============================================================================
function setupEventListeners() {
  // Role selector
  roleSelectorEl.addEventListener("change", (e) => {
    state.role = e.target.value;
    updateRoleBadge();
    renderFieldsTable();
  });

  // Filter tabs
  document.querySelectorAll(".filter-btn").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      document.querySelectorAll(".filter-btn").forEach((b) => b.classList.remove("active"));
      e.target.classList.add("active");
      state.activeFilter = e.target.getAttribute("data-status");
      renderDocumentList();
    });
  });

  // Refresh
  document.getElementById("btnRefreshDocs").addEventListener("click", () => {
    loadDocuments();
  });

  // Zoom controls
  document.getElementById("btnZoomIn").addEventListener("click", () => {
    state.zoom = Math.min(2.0, state.zoom + 0.15);
    applyZoom();
  });

  document.getElementById("btnZoomOut").addEventListener("click", () => {
    state.zoom = Math.max(0.6, state.zoom - 0.15);
    applyZoom();
  });

  document.getElementById("btnZoomReset").addEventListener("click", () => {
    state.zoom = 1.0;
    applyZoom();
  });

  // Modal close
  btnCloseModalEl.addEventListener("click", closeVerifyModal);
  btnCancelVerifyEl.addEventListener("click", closeVerifyModal);

  window.addEventListener("resize", () => {
    resizeAndRenderCanvas();
  });
}

function applyZoom() {
  documentSheetEl.style.transform = `scale(${state.zoom})`;
  resizeAndRenderCanvas();
}

// Bootstrap
init();
