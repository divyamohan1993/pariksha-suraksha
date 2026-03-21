"""
Constraint checkers for the assignment matrix.

Each function validates one aspect of the assignment matrix against
exam blueprint requirements.
"""

import numpy as np
from typing import Dict, List, Tuple


def check_difficulty_balance(
    matrix: Dict[str, List[str]],
    irt_params: Dict[str, Dict[str, float]],
    epsilon_b: float = 0.15,
) -> Tuple[bool, float]:
    """Check that difficulty variance across papers is within tolerance.

    The mean difficulty (b parameter) of each paper should be within epsilon_b
    of the global mean difficulty.

    Args:
        matrix: Dict mapping paper_key (center_seat) -> list of question IDs.
        irt_params: Dict mapping question_id -> {"a": ..., "b": ..., "c": ...}.
        epsilon_b: Maximum allowed deviation from global mean difficulty.

    Returns:
        Tuple of (passes, max_deviation).
    """
    if not matrix:
        return True, 0.0

    paper_difficulties = []
    for paper_key, question_ids in matrix.items():
        if not question_ids:
            continue
        difficulties = [
            irt_params[qid]["b"]
            for qid in question_ids
            if qid in irt_params
        ]
        if difficulties:
            paper_difficulties.append(np.mean(difficulties))

    if len(paper_difficulties) < 2:
        return True, 0.0

    global_mean = np.mean(paper_difficulties)
    max_deviation = max(abs(d - global_mean) for d in paper_difficulties)

    return max_deviation <= epsilon_b, float(max_deviation)


def check_topic_coverage(
    matrix: Dict[str, List[str]],
    blueprint: Dict[str, int],
    question_topics: Dict[str, str],
) -> Tuple[bool, Dict[str, Dict[str, int]]]:
    """Check that each paper's topic distribution matches the blueprint.

    Args:
        matrix: Dict mapping paper_key -> list of question IDs.
        blueprint: Dict mapping topic -> required count of questions.
        question_topics: Dict mapping question_id -> topic.

    Returns:
        Tuple of (all_papers_pass, coverage_by_paper).
    """
    all_pass = True
    coverage_by_paper = {}

    for paper_key, question_ids in matrix.items():
        topic_counts: Dict[str, int] = {}
        for qid in question_ids:
            topic = question_topics.get(qid, "unknown")
            topic_counts[topic] = topic_counts.get(topic, 0) + 1

        paper_passes = True
        for topic, required in blueprint.items():
            actual = topic_counts.get(topic, 0)
            if actual != required:
                paper_passes = False
                break

        if not paper_passes:
            all_pass = False

        coverage_by_paper[paper_key] = topic_counts

    return all_pass, coverage_by_paper


def check_neighbor_dissimilarity(
    matrix: Dict[str, List[str]],
    adjacency: List[Tuple[str, str]],
    max_overlap: float = 0.1,
) -> Tuple[bool, float]:
    """Check that adjacent seats have < max_overlap question overlap.

    Args:
        matrix: Dict mapping paper_key -> list of question IDs.
        adjacency: List of (paper_key_1, paper_key_2) pairs for adjacent seats.
        max_overlap: Maximum allowed fraction of overlapping questions.

    Returns:
        Tuple of (passes, max_observed_overlap).
    """
    if not adjacency:
        return True, 0.0

    max_observed = 0.0

    for key_a, key_b in adjacency:
        if key_a not in matrix or key_b not in matrix:
            continue

        set_a = set(matrix[key_a])
        set_b = set(matrix[key_b])

        if not set_a or not set_b:
            continue

        overlap_count = len(set_a & set_b)
        overlap_fraction = overlap_count / max(len(set_a), len(set_b))
        max_observed = max(max_observed, overlap_fraction)

    return max_observed <= max_overlap, float(max_observed)


def check_cross_center_dissimilarity(
    matrix: Dict[str, List[str]],
    center_papers: Dict[str, List[str]],
    max_overlap: float = 0.15,
) -> Tuple[bool, float]:
    """Check that papers across different centers have < max_overlap overlap.

    Args:
        matrix: Dict mapping paper_key -> list of question IDs.
        center_papers: Dict mapping center_id -> list of paper_keys in that center.
        max_overlap: Maximum allowed fraction of overlap between any two
                     papers from different centers.

    Returns:
        Tuple of (passes, max_observed_overlap).
    """
    center_ids = list(center_papers.keys())
    if len(center_ids) < 2:
        return True, 0.0

    max_observed = 0.0

    for i in range(len(center_ids)):
        for j in range(i + 1, len(center_ids)):
            papers_i = center_papers[center_ids[i]]
            papers_j = center_papers[center_ids[j]]

            for key_i in papers_i:
                for key_j in papers_j:
                    if key_i not in matrix or key_j not in matrix:
                        continue

                    set_i = set(matrix[key_i])
                    set_j = set(matrix[key_j])

                    if not set_i or not set_j:
                        continue

                    overlap_count = len(set_i & set_j)
                    overlap_fraction = overlap_count / max(len(set_i), len(set_j))
                    max_observed = max(max_observed, overlap_fraction)

    return max_observed <= max_overlap, float(max_observed)
