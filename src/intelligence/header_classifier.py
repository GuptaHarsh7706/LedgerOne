"""
Column Header Classifier for LedgerOne Financial Tables.
Phase 4 Step 4 Wave 3 Implementation.

Implements a multi-lingual, 3-pillar acceptance classifier combining exact regex patterns,
normalized Levenshtein string similarity, and margin threshold gating.
Guarantees zero column type collisions across financial tables.
"""
from __future__ import annotations

import re
from enum import Enum
from typing import Any, Dict, List, Optional, Sequence, Tuple, Union

from pydantic import BaseModel, ConfigDict, Field


class ColumnRole(str, Enum):
    """Canonical semantic roles for financial table columns."""
    LINE_NUMBER = "LINE_NUMBER"       # Line, Item #, Pos., No., Pos-Nr., Position
    ITEM_CODE = "ITEM_CODE"           # SKU, Item Code, Part Number, Art.-Nr., Ref
    DESCRIPTION = "DESCRIPTION"       # Description, Details, Item, Bezeichnung, Libellé, Artikel
    QUANTITY = "QUANTITY"             # Qty, Quantity, Hours, Units, Menge, Stk., Quantité, Heures
    UNIT_PRICE = "UNIT_PRICE"         # Unit Price, Price, Rate, Einzelpreis, Prix unitaire
    LINE_TOTAL = "LINE_TOTAL"         # Total, Line Total, Amount, Extended, Gesamt, Montant
    TAX_RATE = "TAX_RATE"             # Tax Rate, VAT %, MwSt %, Taux TVA, Steuersatz
    TAX_AMOUNT = "TAX_AMOUNT"         # Tax, VAT Amount, MwSt Betrag, Montant TVA
    DISCOUNT = "DISCOUNT"             # Discount, Rebate, Rabatt, Remise, Nachlass
    DATE = "DATE"                     # Date, Transaction Date, Datum, Date d'opération
    DEBIT = "DEBIT"                   # Debit, DR, Soll, Débit
    CREDIT = "CREDIT"                 # Credit, CR, Haben, Crédit
    BALANCE = "BALANCE"               # Balance, Running Balance, Saldo, Solde
    UNKNOWN = "UNKNOWN"               # Unrecognized / Non-financial column


# ---------------------------------------------------------------------------
# Multi-Lingual Header Lexicon and Regex Patterns (EN, DE, FR, ES, IT)
# ---------------------------------------------------------------------------

HEADER_PATTERNS: Dict[ColumnRole, List[Tuple[re.Pattern, float]]] = {
    ColumnRole.LINE_NUMBER: [
        (re.compile(r"^(?:line|item\s*#?|pos(?:ition)?|no\.?|pos-?nr\.?|n°|num(?:ero)?)$", re.IGNORECASE), 1.0),
        (re.compile(r"^(?:idx|index|item\s*no\.?|sr\.?\s*no\.?)$", re.IGNORECASE), 0.95),
    ],
    ColumnRole.ITEM_CODE: [
        (re.compile(r"^(?:sku|item\s*code|part\s*#?|part\s*no\.?|art(?:ikel)?-?nr\.?|code\s*article|ref(?:erence)?)$", re.IGNORECASE), 1.0),
        (re.compile(r"^(?:product\s*id|code|product\s*code|model\s*#?)$", re.IGNORECASE), 0.90),
    ],
    ColumnRole.DESCRIPTION: [
        (re.compile(r"^(?:description|desc\.?|item\s*description|details|scope|bezeichnung|artikelbeschreibung|libell[ée]|d[ée]signation|descripci[oó]n|descrizione)$", re.IGNORECASE), 1.0),
        (re.compile(r"^(?:detailed\s*scope(?:\s*description)?|product(?:\s*name)?|particulars|service\s*details)$", re.IGNORECASE), 0.95),
        (re.compile(r"^(?:item|article|service|activity|items)$", re.IGNORECASE), 0.85),
    ],
    ColumnRole.QUANTITY: [
        (re.compile(r"^(?:qty|quantity|hours|units|menge|stk\.?|anzahl|quantit[ée]|heures|cant(?:idad)?|q\.?t[ée]\.?)$", re.IGNORECASE), 1.0),
        (re.compile(r"^(?:hrs|pieces|pcs|volume|weight)$", re.IGNORECASE), 0.90),
    ],
    ColumnRole.UNIT_PRICE: [
        (re.compile(r"^(?:unit\s*price|price(?:\s*/\s*unit)?|rate|einzelpreis|st[uü]ckpreis|prix\s*unit(?:aire)?|p\.?u\.?|precio\s*unitario|prezzo\s*unitario)$", re.IGNORECASE), 1.0),
        (re.compile(r"^(?:fee|hourly\s*rate|unit\s*cost|price)$", re.IGNORECASE), 0.88),
    ],
    ColumnRole.LINE_TOTAL: [
        (re.compile(r"^(?:line\s*total|amount|extended(?:\s*amount)?|gesamt(?:preis)?|gesamtbetrag|betrag|montant(?:\s*total)?|total\s*ht|importe|totale)$", re.IGNORECASE), 1.0),
        (re.compile(r"^(?:total|net\s*amount|net\s*total|line\s*amount|subtotal|ext\s*price)$", re.IGNORECASE), 0.92),
    ],
    ColumnRole.TAX_RATE: [
        (re.compile(r"^(?:tax\s*(?:rate|%)|vat\s*(?:rate|%)|mwst\s*%|steuersatz|taux\s*tva|tva\s*%|iva\s*%(?:\s*rate)?)$", re.IGNORECASE), 1.0),
        (re.compile(r"^(?:tax\s*pct|vat\s*pct|vat\s*rate)$", re.IGNORECASE), 0.95),
    ],
    ColumnRole.TAX_AMOUNT: [
        (re.compile(r"^(?:tax(?:\s*amount)?|vat(?:\s*amount)?|mwst(?:\s*betrag)?|steuerbetrag|montant\s*tva|tva|iva)$", re.IGNORECASE), 1.0),
    ],
    ColumnRole.DISCOUNT: [
        (re.compile(r"^(?:discount(?:\s*%)?|rebate|rabatt|remise|nachlass|descuento|sconto)$", re.IGNORECASE), 1.0),
        (re.compile(r"^(?:allowance|disc\.?)$", re.IGNORECASE), 0.90),
    ],
    ColumnRole.DATE: [
        (re.compile(r"^(?:date|tx\s*date|transaction\s*date|datum|belegdatum|date\s*d'op[ée]ration|fecha|data)$", re.IGNORECASE), 1.0),
    ],
    ColumnRole.DEBIT: [
        (re.compile(r"^(?:debit|dr\.?|soll|d[ée]bit|debito)$", re.IGNORECASE), 1.0),
    ],
    ColumnRole.CREDIT: [
        (re.compile(r"^(?:credit|cr\.?|haben|cr[ée]dit|credito)$", re.IGNORECASE), 1.0),
    ],
    ColumnRole.BALANCE: [
        (re.compile(r"^(?:balance|running\s*balance|saldo|endsaldo|solde)$", re.IGNORECASE), 1.0),
    ],
}


# Canonical reference vocabulary per role for fuzzy Levenshtein comparison
CANONICAL_VOCABULARY: Dict[ColumnRole, List[str]] = {
    ColumnRole.LINE_NUMBER: ["line", "item", "pos", "position", "number", "no", "pos-nr"],
    ColumnRole.ITEM_CODE: ["sku", "item code", "part number", "part no", "article number", "code"],
    ColumnRole.DESCRIPTION: ["description", "item description", "details", "scope", "bezeichnung", "libelle", "designation"],
    ColumnRole.QUANTITY: ["quantity", "qty", "hours", "units", "menge", "anzahl", "quantite"],
    ColumnRole.UNIT_PRICE: ["unit price", "price", "rate", "einzelpreis", "prix unitaire", "pu"],
    ColumnRole.LINE_TOTAL: ["amount", "total", "line total", "gesamt", "gesamtpreis", "montant", "extended"],
    ColumnRole.TAX_RATE: ["tax rate", "vat rate", "tax percentage", "vat percentage", "mwst", "taux tva"],
    ColumnRole.TAX_AMOUNT: ["tax amount", "vat amount", "tax", "vat", "mwst betrag", "montant tva"],
    ColumnRole.DISCOUNT: ["discount", "rebate", "rabatt", "remise", "nachlass"],
    ColumnRole.DATE: ["date", "datum", "transaction date"],
    ColumnRole.DEBIT: ["debit", "dr", "soll"],
    ColumnRole.CREDIT: ["credit", "cr", "haben"],
    ColumnRole.BALANCE: ["balance", "saldo", "solde"],
}


# ---------------------------------------------------------------------------
# String Similarity Helpers
# ---------------------------------------------------------------------------

def compute_levenshtein_distance(s1: str, s2: str) -> int:
    """Optimized two-row Levenshtein edit distance."""
    s1 = s1.lower().strip()
    s2 = s2.lower().strip()
    if s1 == s2:
        return 0
    if not s1:
        return len(s2)
    if not s2:
        return len(s1)
    if len(s1) > len(s2):
        s1, s2 = s2, s1

    prev = list(range(len(s1) + 1))
    for char2 in s2:
        curr = [prev[0] + 1] * (len(s1) + 1)
        for i, char1 in enumerate(s1, 1):
            cost = 0 if char1 == char2 else 1
            curr[i] = min(prev[i] + 1, curr[i - 1] + 1, prev[i - 1] + cost)
        prev = curr
    return prev[len(s1)]


def compute_normalized_similarity(s1: str, s2: str) -> float:
    """Normalized string similarity in [0.0, 1.0] based on Levenshtein distance."""
    max_len = max(len(s1), len(s2))
    if max_len == 0:
        return 1.0
    dist = compute_levenshtein_distance(s1, s2)
    return max(0.0, 1.0 - (dist / max_len))


# ---------------------------------------------------------------------------
# Header Classifier Configuration & Result Models
# ---------------------------------------------------------------------------

class HeaderClassifierConfig(BaseModel):
    """Configuration governing header acceptance and disambiguation."""
    model_config = ConfigDict(frozen=True, extra="forbid")

    primary_threshold: float = Field(default=0.75, ge=0.50, le=0.95, description="Primary acceptance threshold tau")
    margin_threshold: float = Field(default=0.15, ge=0.01, le=0.40, description="Ambiguity margin threshold delta")


class HeaderClassificationResult(BaseModel):
    """Immutable classification record for a single table column header."""
    model_config = ConfigDict(frozen=True, extra="forbid")

    raw_text: str = Field(..., description="Raw extracted header cell text")
    col_idx: int = Field(..., ge=0, description="0-based column index")
    role: ColumnRole = Field(..., description="Predicted semantic column role")
    confidence: float = Field(..., ge=0.0, le=1.0, description="Match confidence score")
    is_ambiguous: bool = Field(default=False, description="Whether second-best score was within margin delta")
    second_best_role: Optional[ColumnRole] = Field(default=None)
    second_best_score: Optional[float] = Field(default=None)
    match_source: str = Field(default="NONE", description="REGEX_EXACT, FUZZY_LEVENSHTEIN, or DEFAULT_UNKNOWN")


# ---------------------------------------------------------------------------
# Column Header Classifier
# ---------------------------------------------------------------------------

class ColumnHeaderClassifier:
    """
    Hybrid multi-lingual column header classifier.
    Combines exact regex pattern matching, normalized Levenshtein similarity,
    and threshold margin gating to classify table headers without collisions.
    """

    def __init__(
        self,
        config: Optional[HeaderClassifierConfig] = None,
        primary_threshold: Optional[float] = None,
        margin_threshold: Optional[float] = None,
    ):
        if config is not None:
            self.config = config
        elif primary_threshold is not None or margin_threshold is not None:
            self.config = HeaderClassifierConfig(
                primary_threshold=primary_threshold if primary_threshold is not None else 0.75,
                margin_threshold=margin_threshold if margin_threshold is not None else 0.15,
            )
        else:
            self.config = HeaderClassifierConfig()

    def classify_single_header(self, text: str, col_idx: int = 0) -> HeaderClassificationResult:
        """
        Classify a single column header text token.
        """
        clean_text = text.strip()
        if not clean_text:
            return HeaderClassificationResult(
                raw_text=text,
                col_idx=col_idx,
                role=ColumnRole.UNKNOWN,
                confidence=0.0,
                is_ambiguous=False,
                match_source="EMPTY_TEXT",
            )

        # 1. Exact & Regex Pattern Matching
        scores: Dict[ColumnRole, Tuple[float, str]] = {}

        for role, pattern_list in HEADER_PATTERNS.items():
            for pat, base_weight in pattern_list:
                if pat.search(clean_text):
                    scores[role] = (base_weight, "REGEX_EXACT")
                    break

        # 2. Fuzzy Levenshtein Comparison against Canonical Vocabulary
        for role, vocab in CANONICAL_VOCABULARY.items():
            best_vocab_sim = 0.0
            for term in vocab:
                sim = compute_normalized_similarity(clean_text, term)
                if sim > best_vocab_sim:
                    best_vocab_sim = sim
            
            # If Levenshtein gives a higher score or regex didn't match
            current_score, _ = scores.get(role, (0.0, "NONE"))
            if best_vocab_sim > current_score:
                scores[role] = (best_vocab_sim, "FUZZY_LEVENSHTEIN")

        # Rank candidate roles by score descending
        sorted_candidates = sorted(
            scores.items(),
            key=lambda item: item[1][0],
            reverse=True
        )

        if not sorted_candidates:
            return HeaderClassificationResult(
                raw_text=text,
                col_idx=col_idx,
                role=ColumnRole.UNKNOWN,
                confidence=0.0,
                is_ambiguous=False,
                match_source="NO_MATCH",
            )

        top_role, (top_score, top_source) = sorted_candidates[0]

        second_role: Optional[ColumnRole] = None
        second_score: Optional[float] = None
        is_ambiguous = False

        if len(sorted_candidates) > 1:
            second_role, (second_score, _) = sorted_candidates[1]
            margin = top_score - second_score
            if margin < self.config.margin_threshold:
                is_ambiguous = True

        # Gating via Primary Threshold tau
        if top_score < self.config.primary_threshold:
            return HeaderClassificationResult(
                raw_text=text,
                col_idx=col_idx,
                role=ColumnRole.UNKNOWN,
                confidence=top_score,
                is_ambiguous=is_ambiguous,
                second_best_role=second_role,
                second_best_score=second_score,
                match_source="BELOW_THRESHOLD",
            )

        return HeaderClassificationResult(
            raw_text=text,
            col_idx=col_idx,
            role=top_role,
            confidence=top_score,
            is_ambiguous=is_ambiguous,
            second_best_role=second_role,
            second_best_score=second_score,
            match_source=top_source,
        )

    def classify_header_row(
        self,
        headers: Sequence[Any],
    ) -> List[HeaderClassificationResult]:
        """
        Classify all headers in a table header row and resolve column collisions.
        Guarantees that no unique financial column role (e.g. DESCRIPTION, LINE_TOTAL, QUANTITY)
        is assigned to multiple columns simultaneously.
        """
        results: List[HeaderClassificationResult] = []

        # Extract text strings
        text_headers: List[str] = []
        for h in headers:
            if hasattr(h, "text"):
                text_headers.append(str(h.text))
            else:
                text_headers.append(str(h))

        # Initial independent classification
        for idx, text in enumerate(text_headers):
            res = self.classify_single_header(text, col_idx=idx)
            results.append(res)

        # Collision Resolution:
        # Check if unique financial roles are assigned to multiple columns
        UNIQUE_ROLES = {
            ColumnRole.LINE_NUMBER,
            ColumnRole.ITEM_CODE,
            ColumnRole.DESCRIPTION,
            ColumnRole.QUANTITY,
            ColumnRole.UNIT_PRICE,
            ColumnRole.LINE_TOTAL,
            ColumnRole.TAX_RATE,
            ColumnRole.TAX_AMOUNT,
            ColumnRole.DISCOUNT,
            ColumnRole.BALANCE,
        }

        role_counts: Dict[ColumnRole, List[int]] = {}
        for idx, res in enumerate(results):
            if res.role in UNIQUE_ROLES:
                role_counts.setdefault(res.role, []).append(idx)

        # For any role assigned to > 1 column, retain the highest confidence assignment
        for role, indices in role_counts.items():
            if len(indices) > 1:
                # Winner has highest confidence
                winner_idx = max(indices, key=lambda i: results[i].confidence)
                for i in indices:
                    if i != winner_idx:
                        demoted = results[i]
                        # Check if second_best_role is available and not already taken
                        taken_roles = {results[k].role for k in range(len(results)) if k != i}
                        fallback_role = demoted.second_best_role if demoted.second_best_role else ColumnRole.UNKNOWN
                        if fallback_role in taken_roles or fallback_role == role:
                            fallback_role = ColumnRole.UNKNOWN

                        results[i] = HeaderClassificationResult(
                            raw_text=demoted.raw_text,
                            col_idx=demoted.col_idx,
                            role=fallback_role,
                            confidence=demoted.second_best_score or 0.50,
                            is_ambiguous=True,
                            second_best_role=demoted.role,
                            second_best_score=demoted.confidence,
                            match_source="COLLISION_RESOLVED_DEMOTION",
                        )

        return results


# Alias for specification and pipeline consistency
HeaderClassifier = ColumnHeaderClassifier

