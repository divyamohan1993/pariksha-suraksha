"""
Progress reporting for the matrix solver.

Reports progress to Firestore every N iterations so the Admin Dashboard
can display real-time progress of the matrix generation.
"""

import logging
import time
from typing import Optional

from google.cloud import firestore

logger = logging.getLogger(__name__)

REPORT_INTERVAL = 10_000  # Report every 10,000 iterations


class ProgressReporter:
    """Reports matrix solver progress to Firestore."""

    def __init__(
        self,
        fs_client: firestore.Client,
        exam_id: str,
        report_interval: int = REPORT_INTERVAL,
    ):
        self.fs_client = fs_client
        self.exam_id = exam_id
        self.report_interval = report_interval
        self._doc_ref = fs_client.collection("exams").document(exam_id)
        self._start_time = time.time()
        self._last_report_time = 0.0

    def report(
        self,
        iteration: int,
        max_iterations: int,
        temperature: float,
        energy: float,
        constraints_satisfied: int,
        total_constraints: int,
        best_energy: float,
    ) -> None:
        """Report current solver progress to Firestore.

        Only actually writes to Firestore every report_interval iterations
        to avoid excessive writes.
        """
        if iteration % self.report_interval != 0 and iteration != max_iterations:
            return

        now = time.time()
        elapsed = now - self._start_time
        progress_pct = (iteration / max_iterations * 100) if max_iterations > 0 else 0

        # Estimate remaining time
        if iteration > 0:
            rate = iteration / elapsed
            remaining_iters = max_iterations - iteration
            eta_seconds = remaining_iters / rate if rate > 0 else 0
        else:
            eta_seconds = 0

        status_data = {
            "matrixSolver": {
                "status": "running",
                "iteration": iteration,
                "maxIterations": max_iterations,
                "progressPercent": round(progress_pct, 2),
                "temperature": round(temperature, 6),
                "currentEnergy": round(energy, 4),
                "bestEnergy": round(best_energy, 4),
                "constraintsSatisfied": constraints_satisfied,
                "totalConstraints": total_constraints,
                "elapsedSeconds": round(elapsed, 1),
                "etaSeconds": round(eta_seconds, 1),
                "updatedAt": firestore.SERVER_TIMESTAMP,
            }
        }

        try:
            self._doc_ref.set(status_data, merge=True)
            self._last_report_time = now
            logger.debug(
                "Progress: iter=%d/%d (%.1f%%), T=%.4f, E=%.4f, best=%.4f, constraints=%d/%d",
                iteration,
                max_iterations,
                progress_pct,
                temperature,
                energy,
                best_energy,
                constraints_satisfied,
                total_constraints,
            )
        except Exception as e:
            logger.warning("Failed to report progress: %s", str(e))

    def report_complete(
        self,
        energy: float,
        constraints_satisfied: int,
        total_constraints: int,
        total_iterations: int,
    ) -> None:
        """Report that the solver has completed."""
        elapsed = time.time() - self._start_time
        status_data = {
            "matrixSolver": {
                "status": "completed",
                "iteration": total_iterations,
                "maxIterations": total_iterations,
                "progressPercent": 100.0,
                "finalEnergy": round(energy, 4),
                "constraintsSatisfied": constraints_satisfied,
                "totalConstraints": total_constraints,
                "elapsedSeconds": round(elapsed, 1),
                "completedAt": firestore.SERVER_TIMESTAMP,
            }
        }

        try:
            self._doc_ref.set(status_data, merge=True)
            logger.info(
                "Solver completed: E=%.4f, constraints=%d/%d, elapsed=%.1fs",
                energy,
                constraints_satisfied,
                total_constraints,
                elapsed,
            )
        except Exception as e:
            logger.error("Failed to report completion: %s", str(e))

    def report_failed(self, error_message: str) -> None:
        """Report that the solver has failed."""
        elapsed = time.time() - self._start_time
        status_data = {
            "matrixSolver": {
                "status": "failed",
                "error": error_message,
                "elapsedSeconds": round(elapsed, 1),
                "failedAt": firestore.SERVER_TIMESTAMP,
            }
        }

        try:
            self._doc_ref.set(status_data, merge=True)
        except Exception as e:
            logger.error("Failed to report failure: %s", str(e))
