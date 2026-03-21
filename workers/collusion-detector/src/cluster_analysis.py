"""
Cluster analysis for collusion detection.

Builds a graph of flagged pairs and finds connected components
(cheating rings) using BFS. Enriches clusters with seating proximity data.
"""

import logging
from collections import deque
from dataclasses import dataclass, field
from typing import Dict, List, Optional, Set, Tuple

from .detector import CollusionResult

logger = logging.getLogger(__name__)


@dataclass
class CollusionCluster:
    """A connected component of flagged candidate pairs (potential cheating ring)."""
    cluster_id: int
    members: List[str]
    pairs: List[Tuple[str, str]]
    max_log_lambda: float
    mean_log_lambda: float
    total_pairs: int
    has_seating_adjacency: bool
    evidence_strength: str  # "strong", "moderate", "weak"
    seating_info: Dict[str, Optional[str]]  # candidate_id -> seat_id


def _build_adjacency_graph(
    flagged_results: List[CollusionResult],
) -> Dict[str, Set[str]]:
    """Build an undirected adjacency graph from flagged pairs.

    Args:
        flagged_results: List of CollusionResult objects (all flagged=True).

    Returns:
        Dict mapping candidate_id -> set of connected candidate_ids.
    """
    graph: Dict[str, Set[str]] = {}

    for result in flagged_results:
        u = result.candidate_u
        v = result.candidate_v

        if u not in graph:
            graph[u] = set()
        if v not in graph:
            graph[v] = set()

        graph[u].add(v)
        graph[v].add(u)

    return graph


def _bfs_connected_components(graph: Dict[str, Set[str]]) -> List[Set[str]]:
    """Find all connected components in an undirected graph using BFS.

    Args:
        graph: Adjacency graph (node -> set of neighbors).

    Returns:
        List of sets, each set is a connected component.
    """
    visited: Set[str] = set()
    components: List[Set[str]] = []

    for node in graph:
        if node in visited:
            continue

        # BFS from this node
        component: Set[str] = set()
        queue = deque([node])

        while queue:
            current = queue.popleft()
            if current in visited:
                continue
            visited.add(current)
            component.add(current)

            for neighbor in graph.get(current, set()):
                if neighbor not in visited:
                    queue.append(neighbor)

        if component:
            components.append(component)

    return components


def _classify_evidence_strength(
    mean_log_lambda: float, max_log_lambda: float, cluster_size: int
) -> str:
    """Classify the evidence strength of a collusion cluster.

    Args:
        mean_log_lambda: Mean log-lambda across all pairs in cluster.
        max_log_lambda: Maximum log-lambda in the cluster.
        cluster_size: Number of members in the cluster.

    Returns:
        "strong", "moderate", or "weak".
    """
    # Strong: high scores and multiple connected candidates
    if max_log_lambda > 50.0 and cluster_size >= 3:
        return "strong"
    if max_log_lambda > 30.0 and mean_log_lambda > 20.0:
        return "strong"

    # Moderate: clear signal but smaller cluster
    if max_log_lambda > 20.0:
        return "moderate"
    if mean_log_lambda > 10.0 and cluster_size >= 2:
        return "moderate"

    return "weak"


def find_cheating_rings(
    flagged_results: List[CollusionResult],
    seating_map: Optional[Dict[str, str]] = None,
    adjacency_seats: Optional[List[Tuple[str, str]]] = None,
) -> List[CollusionCluster]:
    """Find connected components of flagged pairs (potential cheating rings).

    Args:
        flagged_results: List of CollusionResult for flagged pairs.
        seating_map: Optional dict mapping candidate_id -> seat_id.
        adjacency_seats: Optional list of (seat_id, seat_id) pairs that are
                         physically adjacent.

    Returns:
        List of CollusionCluster objects sorted by evidence strength.
    """
    if not flagged_results:
        return []

    # Build graph and find connected components
    graph = _build_adjacency_graph(flagged_results)
    components = _bfs_connected_components(graph)

    # Index flagged pairs by candidate pair for quick lookup
    pair_scores: Dict[Tuple[str, str], float] = {}
    for r in flagged_results:
        key = (min(r.candidate_u, r.candidate_v), max(r.candidate_u, r.candidate_v))
        pair_scores[key] = r.log_lambda

    # Build adjacency set for seating
    adjacent_seat_set: Set[Tuple[str, str]] = set()
    if adjacency_seats:
        for s1, s2 in adjacency_seats:
            adjacent_seat_set.add((min(s1, s2), max(s1, s2)))

    clusters: List[CollusionCluster] = []

    for cluster_idx, component in enumerate(components):
        members = sorted(component)

        # Find all flagged pairs within this cluster
        cluster_pairs: List[Tuple[str, str]] = []
        cluster_scores: List[float] = []

        for i in range(len(members)):
            for j in range(i + 1, len(members)):
                key = (min(members[i], members[j]), max(members[i], members[j]))
                if key in pair_scores:
                    cluster_pairs.append(key)
                    cluster_scores.append(pair_scores[key])

        if not cluster_scores:
            continue

        max_score = max(cluster_scores)
        mean_score = sum(cluster_scores) / len(cluster_scores)

        # Check seating adjacency
        has_adjacency = False
        seating_info: Dict[str, Optional[str]] = {}

        if seating_map:
            for m in members:
                seating_info[m] = seating_map.get(m)

            # Check if any flagged pair has adjacent seating
            for m_u, m_v in cluster_pairs:
                seat_u = seating_map.get(m_u)
                seat_v = seating_map.get(m_v)
                if seat_u and seat_v:
                    seat_key = (min(seat_u, seat_v), max(seat_u, seat_v))
                    if seat_key in adjacent_seat_set:
                        has_adjacency = True
                        break

        evidence = _classify_evidence_strength(mean_score, max_score, len(members))

        cluster = CollusionCluster(
            cluster_id=cluster_idx,
            members=members,
            pairs=cluster_pairs,
            max_log_lambda=max_score,
            mean_log_lambda=mean_score,
            total_pairs=len(cluster_pairs),
            has_seating_adjacency=has_adjacency,
            evidence_strength=evidence,
            seating_info=seating_info,
        )
        clusters.append(cluster)

    # Sort by evidence strength (strong first) then by max score
    strength_order = {"strong": 0, "moderate": 1, "weak": 2}
    clusters.sort(key=lambda c: (strength_order.get(c.evidence_strength, 3), -c.max_log_lambda))

    logger.info(
        "Found %d cheating rings from %d flagged pairs: %d strong, %d moderate, %d weak",
        len(clusters),
        len(flagged_results),
        sum(1 for c in clusters if c.evidence_strength == "strong"),
        sum(1 for c in clusters if c.evidence_strength == "moderate"),
        sum(1 for c in clusters if c.evidence_strength == "weak"),
    )

    return clusters
