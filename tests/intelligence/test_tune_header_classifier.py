"""
Tests for Header Classifier Tuning and ML Hygiene Guardrails (Phase 4 Step 4 Wave 3).
Validates data leakage quarantine barriers and frozen configuration generation.
"""
import pytest

from src.intelligence.tune_header_classifier import (
    DataLeakagePreconditionError,
    tune_header_classifier,
    verify_split_quarantine,
)


def test_data_leakage_quarantine_barrier():
    """
    ML Hygiene Enforcement:
    Tuning must strictly raise DataLeakagePreconditionError if any held-out split is accessed.
    """
    # Allowed: development
    verify_split_quarantine(["development"])

    # Forbidden: synthetic_held_out
    with pytest.raises(DataLeakagePreconditionError) as exc:
        verify_split_quarantine(["synthetic_held_out"])
    assert "DATA LEAKAGE VIOLATION" in str(exc.value)

    # Forbidden: external_held_out
    with pytest.raises(DataLeakagePreconditionError) as exc:
        verify_split_quarantine(["development", "external_held_out"])
    assert "DATA LEAKAGE VIOLATION" in str(exc.value)


def test_tuning_execution_and_config_sha256():
    """Tuning on development split generates valid parameters with zero collisions and SHA-256."""
    report = tune_header_classifier()

    assert report.zero_collisions is True
    assert report.dev_document_count == 10
    assert 0.60 <= report.optimal_tau <= 0.90
    assert 0.05 <= report.optimal_delta <= 0.25
    assert report.best_macro_f1 > 0.70
    assert len(report.config_sha256) == 64  # Valid SHA-256 hex string
