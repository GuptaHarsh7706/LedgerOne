import subprocess
import sys


def test_ruff_linting():
    """Verify code adheres to ruff linting standards."""
    res = subprocess.run(
        [sys.executable, "-m", "ruff", "check", "tests/"],
        capture_output=True,
        text=True,
        check=False,
    )
    assert res.returncode == 0, f"Ruff linting failed:\n{res.stdout}\n{res.stderr}"
    print("\n[PASS] Ruff linting check passed with zero violations")


def test_mypy_type_checking():
    """Verify static type annotations using mypy."""
    res = subprocess.run(
        [
            sys.executable,
            "-m",
            "mypy",
            "tests/test_env_validation.py",
            "--ignore-missing-imports",
        ],
        capture_output=True,
        text=True,
        check=False,
    )
    assert res.returncode == 0, f"Mypy type check failed:\n{res.stdout}\n{res.stderr}"
    print("\n[PASS] Mypy static type checking passed with zero errors")


def test_bandit_security_scan():
    """Verify static security analysis with Bandit."""
    res = subprocess.run(
        [sys.executable, "-m", "bandit", "-r", "tests/", "-ll", "-q"],
        capture_output=True,
        text=True,
        check=False,
    )
    assert res.returncode == 0, f"Bandit security scan detected issues:\n{res.stdout}"
    print("\n[PASS] Bandit static security scan passed (zero medium/high issues)")
