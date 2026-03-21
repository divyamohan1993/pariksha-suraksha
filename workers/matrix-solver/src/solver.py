"""
Assignment Matrix Solver using Constraint Satisfaction + Simulated Annealing.

Generates a unique paper for each (center, seat) by assigning questions from
the calibrated question bank such that:
  1. Each paper satisfies the topic coverage blueprint
  2. Adjacent seats share < 10% questions
  3. Different centers share < 15% questions
  4. Difficulty (IRT b-param mean) is balanced across all papers

Uses simulated annealing to optimize a weighted energy function.
"""

import logging
import math
import random
from dataclasses import dataclass, field
from typing import Dict, List, Optional, Set, Tuple

import numpy as np
from google.cloud import firestore

from .constraints import (
    check_difficulty_balance,
    check_neighbor_dissimilarity,
    check_cross_center_dissimilarity,
    check_topic_coverage,
)
from .progress import ProgressReporter

logger = logging.getLogger(__name__)

# Simulated annealing parameters
INITIAL_TEMPERATURE = 100.0
COOLING_RATE = 0.9995
MIN_TEMPERATURE = 0.01
MAX_ITERATIONS = 1_000_000

# Energy function weights
WEIGHT_DIFFICULTY_VARIANCE = 10.0
WEIGHT_TOPIC_COVERAGE = 5.0
WEIGHT_NEIGHBOR_OVERLAP = 3.0
WEIGHT_CROSS_CENTER_OVERLAP = 2.0

# Constraint thresholds
MAX_NEIGHBOR_OVERLAP = 0.10
MAX_CROSS_CENTER_OVERLAP = 0.15
DIFFICULTY_EPSILON = 0.15


@dataclass
class ExamBlueprint:
    """Specification for exam paper composition."""
    questions_per_paper: int
    topic_distribution: Dict[str, int]  # topic -> required count
    difficulty_target: float = 0.0  # target mean difficulty (b-param)


@dataclass
class CalibratedQuestion:
    """A question with its IRT parameters and metadata."""
    question_id: str
    template_id: str
    instantiation_id: str
    topic: str
    difficulty_b: float
    discrimination_a: float
    guessing_c: float


@dataclass
class CenterLayout:
    """Layout of a testing center with seat adjacency."""
    center_id: str
    seat_ids: List[str]
    adjacency_pairs: List[Tuple[str, str]]  # pairs of adjacent seat IDs


@dataclass
class AssignmentMatrix:
    """The output: mapping from (center, seat) to question assignments."""
    assignments: Dict[str, List[str]]  # paper_key -> [question_ids]
    center_papers: Dict[str, List[str]]  # center_id -> [paper_keys]
    energy: float = 0.0
    iterations: int = 0
    converged: bool = False


def _paper_key(center_id: str, seat_id: str) -> str:
    """Create a unique key for a paper assignment."""
    return f"{center_id}_{seat_id}"


def _compute_energy(
    assignments: Dict[str, List[str]],
    questions_by_id: Dict[str, CalibratedQuestion],
    blueprint: ExamBlueprint,
    adjacency_pairs: List[Tuple[str, str]],
    center_papers: Dict[str, List[str]],
) -> Tuple[float, int, int]:
    """Compute the energy function and count satisfied constraints.

    Returns:
        Tuple of (energy, constraints_satisfied, total_constraints).
    """
    energy = 0.0
    constraints_satisfied = 0
    total_constraints = 4

    # 1. Difficulty variance across papers
    paper_difficulties = []
    for paper_key, qids in assignments.items():
        if not qids:
            continue
        bs = [questions_by_id[qid].difficulty_b for qid in qids if qid in questions_by_id]
        if bs:
            paper_difficulties.append(np.mean(bs))

    if len(paper_difficulties) >= 2:
        difficulty_var = np.var(paper_difficulties)
        energy += WEIGHT_DIFFICULTY_VARIANCE * difficulty_var
        global_mean = np.mean(paper_difficulties)
        max_dev = max(abs(d - global_mean) for d in paper_difficulties)
        if max_dev <= DIFFICULTY_EPSILON:
            constraints_satisfied += 1
    else:
        constraints_satisfied += 1

    # 2. Topic coverage deviation from blueprint
    topic_penalty = 0.0
    all_topics_ok = True
    for paper_key, qids in assignments.items():
        topic_counts: Dict[str, int] = {}
        for qid in qids:
            if qid in questions_by_id:
                t = questions_by_id[qid].topic
                topic_counts[t] = topic_counts.get(t, 0) + 1

        for topic, required in blueprint.topic_distribution.items():
            actual = topic_counts.get(topic, 0)
            deviation = abs(actual - required)
            if deviation > 0:
                topic_penalty += deviation
                all_topics_ok = False

    energy += WEIGHT_TOPIC_COVERAGE * topic_penalty
    if all_topics_ok:
        constraints_satisfied += 1

    # 3. Neighbor question overlap
    max_neighbor_overlap = 0.0
    for key_a, key_b in adjacency_pairs:
        if key_a not in assignments or key_b not in assignments:
            continue
        set_a = set(assignments[key_a])
        set_b = set(assignments[key_b])
        if set_a and set_b:
            overlap = len(set_a & set_b) / max(len(set_a), len(set_b))
            max_neighbor_overlap = max(max_neighbor_overlap, overlap)

    energy += WEIGHT_NEIGHBOR_OVERLAP * max(0, max_neighbor_overlap - MAX_NEIGHBOR_OVERLAP) * 100
    if max_neighbor_overlap <= MAX_NEIGHBOR_OVERLAP:
        constraints_satisfied += 1

    # 4. Cross-center overlap
    center_ids = list(center_papers.keys())
    max_cross_overlap = 0.0
    for i in range(len(center_ids)):
        for j in range(i + 1, len(center_ids)):
            # Sample a few papers from each center for efficiency
            papers_i = center_papers[center_ids[i]]
            papers_j = center_papers[center_ids[j]]
            sample_i = papers_i[:min(5, len(papers_i))]
            sample_j = papers_j[:min(5, len(papers_j))]

            for ki in sample_i:
                for kj in sample_j:
                    if ki not in assignments or kj not in assignments:
                        continue
                    set_i = set(assignments[ki])
                    set_j = set(assignments[kj])
                    if set_i and set_j:
                        overlap = len(set_i & set_j) / max(len(set_i), len(set_j))
                        max_cross_overlap = max(max_cross_overlap, overlap)

    energy += WEIGHT_CROSS_CENTER_OVERLAP * max(0, max_cross_overlap - MAX_CROSS_CENTER_OVERLAP) * 100
    if max_cross_overlap <= MAX_CROSS_CENTER_OVERLAP:
        constraints_satisfied += 1

    return energy, constraints_satisfied, total_constraints


def _initialize_assignments(
    blueprint: ExamBlueprint,
    questions: List[CalibratedQuestion],
    centers: List[CenterLayout],
) -> Tuple[Dict[str, List[str]], Dict[str, List[str]], List[Tuple[str, str]]]:
    """Create initial random valid assignments respecting topic coverage.

    Returns:
        Tuple of (assignments, center_papers, all_adjacency_pairs).
    """
    # Group questions by topic
    questions_by_topic: Dict[str, List[CalibratedQuestion]] = {}
    for q in questions:
        if q.topic not in questions_by_topic:
            questions_by_topic[q.topic] = []
        questions_by_topic[q.topic].append(q)

    assignments: Dict[str, List[str]] = {}
    center_papers: Dict[str, List[str]] = {}
    all_adjacency: List[Tuple[str, str]] = []

    for center in centers:
        center_keys = []
        for seat_id in center.seat_ids:
            key = _paper_key(center.center_id, seat_id)
            center_keys.append(key)

            # Build paper respecting topic blueprint
            paper_questions: List[str] = []
            for topic, count in blueprint.topic_distribution.items():
                available = questions_by_topic.get(topic, [])
                if len(available) < count:
                    logger.warning(
                        "Not enough questions for topic '%s': need %d, have %d",
                        topic,
                        count,
                        len(available),
                    )
                    sampled = random.choices(available, k=count) if available else []
                else:
                    sampled = random.sample(available, count)
                paper_questions.extend([q.question_id for q in sampled])

            assignments[key] = paper_questions

        center_papers[center.center_id] = center_keys

        # Convert seat adjacency to paper_key adjacency
        for s1, s2 in center.adjacency_pairs:
            k1 = _paper_key(center.center_id, s1)
            k2 = _paper_key(center.center_id, s2)
            all_adjacency.append((k1, k2))

    return assignments, center_papers, all_adjacency


def solve_assignment_matrix(
    exam_blueprint: ExamBlueprint,
    questions: List[CalibratedQuestion],
    centers: List[CenterLayout],
    fs_client: Optional[firestore.Client] = None,
    exam_id: str = "",
) -> AssignmentMatrix:
    """Solve the assignment matrix using constraint satisfaction + simulated annealing.

    Args:
        exam_blueprint: The exam paper blueprint specification.
        questions: List of calibrated questions with IRT params.
        centers: List of center layouts with seat adjacency.
        fs_client: Firestore client for progress reporting (optional).
        exam_id: Exam ID for progress reporting.

    Returns:
        AssignmentMatrix with the optimized assignments.
    """
    logger.info(
        "Starting matrix solver: %d questions, %d centers, %d questions/paper",
        len(questions),
        len(centers),
        exam_blueprint.questions_per_paper,
    )

    # Build lookup structures
    questions_by_id = {q.question_id: q for q in questions}
    questions_by_topic: Dict[str, List[str]] = {}
    for q in questions:
        if q.topic not in questions_by_topic:
            questions_by_topic[q.topic] = []
        questions_by_topic[q.topic].append(q.question_id)

    # Initialize progress reporter
    progress: Optional[ProgressReporter] = None
    if fs_client and exam_id:
        progress = ProgressReporter(fs_client, exam_id)

    # Step 1: Generate initial valid assignments
    assignments, center_papers, adjacency_pairs = _initialize_assignments(
        exam_blueprint, questions, centers
    )

    # Compute initial energy
    energy, satisfied, total = _compute_energy(
        assignments, questions_by_id, exam_blueprint, adjacency_pairs, center_papers
    )
    best_energy = energy
    best_assignments = {k: list(v) for k, v in assignments.items()}

    logger.info("Initial energy: %.4f, constraints: %d/%d", energy, satisfied, total)

    # Step 2: Simulated annealing
    temperature = INITIAL_TEMPERATURE
    all_paper_keys = list(assignments.keys())
    num_papers = len(all_paper_keys)

    if num_papers < 2:
        logger.warning("Only %d papers, no swapping possible", num_papers)
        return AssignmentMatrix(
            assignments=assignments,
            center_papers=center_papers,
            energy=energy,
            iterations=0,
            converged=satisfied == total,
        )

    all_topic_lists = list(questions_by_topic.values())
    iteration = 0

    for iteration in range(MAX_ITERATIONS):
        # Cooling schedule
        temperature = INITIAL_TEMPERATURE * (COOLING_RATE ** iteration)
        if temperature < MIN_TEMPERATURE:
            temperature = MIN_TEMPERATURE

        # Check convergence: all constraints satisfied
        if satisfied == total and energy < 0.01:
            logger.info("Converged at iteration %d: all constraints satisfied", iteration)
            break

        # Generate move: swap one question between two papers
        paper_a_idx = random.randint(0, num_papers - 1)
        paper_b_idx = random.randint(0, num_papers - 1)
        while paper_b_idx == paper_a_idx:
            paper_b_idx = random.randint(0, num_papers - 1)

        key_a = all_paper_keys[paper_a_idx]
        key_b = all_paper_keys[paper_b_idx]

        qs_a = assignments[key_a]
        qs_b = assignments[key_b]

        if not qs_a or not qs_b:
            continue

        idx_a = random.randint(0, len(qs_a) - 1)
        idx_b = random.randint(0, len(qs_b) - 1)

        # Only swap if both questions exist and are different
        q_a = qs_a[idx_a]
        q_b = qs_b[idx_b]
        if q_a == q_b:
            continue

        # Perform swap
        qs_a[idx_a] = q_b
        qs_b[idx_b] = q_a

        # Compute new energy
        new_energy, new_satisfied, new_total = _compute_energy(
            assignments, questions_by_id, exam_blueprint, adjacency_pairs, center_papers
        )

        delta_e = new_energy - energy

        # Accept or reject move
        if delta_e < 0 or random.random() < math.exp(-delta_e / max(temperature, 1e-10)):
            # Accept move
            energy = new_energy
            satisfied = new_satisfied
            total = new_total

            if energy < best_energy:
                best_energy = energy
                best_assignments = {k: list(v) for k, v in assignments.items()}
        else:
            # Reject move — undo swap
            qs_a[idx_a] = q_a
            qs_b[idx_b] = q_b

        # Report progress
        if progress:
            progress.report(
                iteration=iteration,
                max_iterations=MAX_ITERATIONS,
                temperature=temperature,
                energy=energy,
                constraints_satisfied=satisfied,
                total_constraints=total,
                best_energy=best_energy,
            )

    # Use best solution found
    final_energy, final_satisfied, final_total = _compute_energy(
        best_assignments, questions_by_id, exam_blueprint, adjacency_pairs, center_papers
    )

    if progress:
        progress.report_complete(
            energy=final_energy,
            constraints_satisfied=final_satisfied,
            total_constraints=final_total,
            total_iterations=iteration + 1,
        )

    logger.info(
        "Solver finished: iterations=%d, energy=%.4f, constraints=%d/%d",
        iteration + 1,
        final_energy,
        final_satisfied,
        final_total,
    )

    return AssignmentMatrix(
        assignments=best_assignments,
        center_papers=center_papers,
        energy=final_energy,
        iterations=iteration + 1,
        converged=final_satisfied == final_total,
    )


def write_assignment_to_firestore(
    fs_client: firestore.Client,
    exam_id: str,
    result: AssignmentMatrix,
    questions_by_id: Dict[str, CalibratedQuestion],
) -> None:
    """Write the solved assignment matrix to Firestore.

    Writes to: exams/{examId}/centers/{centerId}/seats/{seatNum}/assignment

    Args:
        fs_client: Firestore client.
        exam_id: The exam ID.
        result: The solved assignment matrix.
        questions_by_id: Lookup dict for question metadata.
    """
    batch = fs_client.batch()
    write_count = 0
    MAX_BATCH_SIZE = 450  # Firestore batch limit is 500

    for paper_key, question_ids in result.assignments.items():
        parts = paper_key.split("_", 1)
        if len(parts) != 2:
            logger.warning("Invalid paper key format: %s", paper_key)
            continue

        center_id, seat_id = parts

        # Build the question assignments list
        question_assignments = []
        for position, qid in enumerate(question_ids):
            q = questions_by_id.get(qid)
            if q:
                question_assignments.append({
                    "position": position,
                    "templateId": q.template_id,
                    "paramInstantiationId": q.instantiation_id,
                    "encryptedBlobUri": "",  # Set during encryption phase
                    "encryptedAnswerKey": "",  # Set during encryption phase
                })

        difficulty_sum = sum(
            questions_by_id[qid].difficulty_b
            for qid in question_ids
            if qid in questions_by_id
        )

        doc_ref = (
            fs_client.collection("exams")
            .document(exam_id)
            .collection("centers")
            .document(center_id)
            .collection("seats")
            .document(seat_id)
        )

        batch.set(
            doc_ref,
            {
                "assignment": {
                    "questionAssignments": question_assignments,
                    "difficultySum": round(difficulty_sum, 4),
                    "topicCoverageHash": "",  # Computed after assignment
                }
            },
            merge=True,
        )

        write_count += 1

        # Commit batch if approaching limit
        if write_count >= MAX_BATCH_SIZE:
            batch.commit()
            batch = fs_client.batch()
            write_count = 0

    # Commit remaining writes
    if write_count > 0:
        batch.commit()

    logger.info(
        "Wrote assignment matrix to Firestore for exam %s (%d papers)",
        exam_id,
        len(result.assignments),
    )
