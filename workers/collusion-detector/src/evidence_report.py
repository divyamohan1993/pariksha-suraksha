"""
PDF Evidence Report generation for flagged collusion pairs.

Uses reportlab to create structured PDF reports with:
- Candidate identification and seating positions
- Question-by-question matching analysis table
- Distractor profile visualization
- Statistical significance (p-value)
- Log-likelihood ratio vs threshold comparison
"""

import io
import logging
import math
from datetime import datetime, timezone
from typing import Dict, List, Optional

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import cm, mm
from reportlab.platypus import (
    SimpleDocTemplate,
    Table,
    TableStyle,
    Paragraph,
    Spacer,
    PageBreak,
    HRFlowable,
)
from reportlab.graphics.shapes import Drawing, Rect, String
from reportlab.graphics.charts.barcharts import VerticalBarChart
from google.cloud import storage

from .detector import CollusionResult

logger = logging.getLogger(__name__)

PAGE_WIDTH, PAGE_HEIGHT = A4
MARGIN = 2 * cm


def _create_styles():
    """Create report paragraph styles."""
    styles = getSampleStyleSheet()

    styles.add(ParagraphStyle(
        name="ReportTitle",
        parent=styles["Title"],
        fontSize=18,
        spaceAfter=12,
        textColor=colors.HexColor("#1a237e"),
    ))

    styles.add(ParagraphStyle(
        name="SectionHeader",
        parent=styles["Heading2"],
        fontSize=14,
        spaceBefore=16,
        spaceAfter=8,
        textColor=colors.HexColor("#283593"),
    ))

    styles.add(ParagraphStyle(
        name="SubHeader",
        parent=styles["Heading3"],
        fontSize=11,
        spaceBefore=10,
        spaceAfter=4,
        textColor=colors.HexColor("#3949ab"),
    ))

    styles.add(ParagraphStyle(
        name="BodyText",
        parent=styles["Normal"],
        fontSize=10,
        spaceAfter=6,
        leading=14,
    ))

    styles.add(ParagraphStyle(
        name="CautionText",
        parent=styles["Normal"],
        fontSize=9,
        spaceAfter=4,
        textColor=colors.HexColor("#b71c1c"),
    ))

    return styles


def _create_distractor_chart(
    question_idx: int,
    profile: Dict[int, float],
    correct_answer: int,
    answer_u: int,
    answer_v: int,
) -> Drawing:
    """Create a bar chart showing distractor profile for a question.

    Args:
        question_idx: Question number for labeling.
        profile: Dict mapping option (0-3) -> probability.
        correct_answer: Correct option index.
        answer_u: Candidate U's answer.
        answer_v: Candidate V's answer.

    Returns:
        A Drawing object containing the bar chart.
    """
    drawing = Drawing(280, 140)

    chart = VerticalBarChart()
    chart.x = 40
    chart.y = 30
    chart.width = 200
    chart.height = 90

    option_labels = ["A", "B", "C", "D"]
    data = [[profile.get(i, 0.0) for i in range(4)]]
    chart.data = data
    chart.categoryAxis.categoryNames = option_labels

    chart.valueAxis.valueMin = 0
    chart.valueAxis.valueMax = 1.0
    chart.valueAxis.valueStep = 0.2
    chart.valueAxis.labelTextFormat = "%.1f"

    # Color bars: green for correct, red for matched wrong, gray for others
    bar_colors = []
    for i in range(4):
        if i == correct_answer:
            bar_colors.append(colors.HexColor("#4caf50"))
        elif i == answer_u and answer_u == answer_v:
            bar_colors.append(colors.HexColor("#f44336"))
        elif i == answer_u or i == answer_v:
            bar_colors.append(colors.HexColor("#ff9800"))
        else:
            bar_colors.append(colors.HexColor("#bdbdbd"))

    for i, color in enumerate(bar_colors):
        chart.bars[0].fillColor = colors.HexColor("#90a4ae")

    chart.bars[0].fillColor = colors.HexColor("#5c6bc0")

    drawing.add(chart)

    title = String(140, 128, f"Q{question_idx + 1} Distractor Profile", fontSize=9, textAnchor="middle")
    drawing.add(title)

    return drawing


def generate_pdf_report(
    pair_result: CollusionResult,
    distractor_profiles: Dict[int, Dict[int, float]],
    correct_answers: Dict[int, int],
    candidate_seats: Optional[Dict[str, str]] = None,
    exam_id: str = "",
    center_id: str = "",
    null_distribution_percentile: float = 0.0,
) -> bytes:
    """Generate a PDF evidence report for a flagged collusion pair.

    Args:
        pair_result: The CollusionResult for the flagged pair.
        distractor_profiles: Dict mapping question -> option -> probability.
        correct_answers: Dict mapping question -> correct option.
        candidate_seats: Optional mapping candidate_id -> seat_id.
        exam_id: Exam identifier.
        center_id: Center identifier.
        null_distribution_percentile: Percentile of this score in null distribution.

    Returns:
        PDF file contents as bytes.
    """
    buffer = io.BytesIO()
    doc = SimpleDocTemplate(
        buffer,
        pagesize=A4,
        leftMargin=MARGIN,
        rightMargin=MARGIN,
        topMargin=MARGIN,
        bottomMargin=MARGIN,
    )

    styles = _create_styles()
    elements = []

    # Title
    elements.append(Paragraph(
        "ParikshaSuraksha — Collusion Evidence Report",
        styles["ReportTitle"],
    ))
    elements.append(HRFlowable(width="100%", color=colors.HexColor("#1a237e")))
    elements.append(Spacer(1, 8))

    # Report metadata
    now = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC")
    meta_data = [
        ["Report Generated:", now],
        ["Exam ID:", exam_id],
        ["Center ID:", center_id],
        ["Candidate U:", pair_result.candidate_u],
        ["Candidate V:", pair_result.candidate_v],
    ]

    if candidate_seats:
        seat_u = candidate_seats.get(pair_result.candidate_u, "N/A")
        seat_v = candidate_seats.get(pair_result.candidate_v, "N/A")
        meta_data.append(["Seat U:", seat_u])
        meta_data.append(["Seat V:", seat_v])

    meta_table = Table(meta_data, colWidths=[4 * cm, 10 * cm])
    meta_table.setStyle(TableStyle([
        ("FONTNAME", (0, 0), (0, -1), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, -1), 10),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
        ("TOPPADDING", (0, 0), (-1, -1), 2),
    ]))
    elements.append(meta_table)
    elements.append(Spacer(1, 12))

    # Statistical Summary
    elements.append(Paragraph("1. Statistical Summary", styles["SectionHeader"]))

    # Compute p-value from percentile
    p_value = 1.0 - null_distribution_percentile if null_distribution_percentile > 0 else 0.0

    summary_data = [
        ["Metric", "Value", "Interpretation"],
        ["Log-Likelihood Ratio (log-lambda)", f"{pair_result.log_lambda:.4f}",
         "Higher = more evidence of collusion"],
        ["Detection Threshold (tau)", f"{pair_result.threshold:.4f}",
         "Calibrated for FPR < 0.01%"],
        ["Ratio to Threshold", f"{pair_result.log_lambda / max(pair_result.threshold, 0.001):.2f}x",
         "How far above threshold"],
        ["Shared Questions Analyzed", str(pair_result.num_shared_questions), ""],
        ["Same Wrong Answer Matches", str(pair_result.num_same_wrong),
         "Evidence FOR collusion"],
        ["Different Wrong Answers", str(pair_result.num_diff_wrong),
         "Evidence AGAINST collusion"],
        ["Estimated p-value", f"< {max(p_value, 0.0001):.4f}",
         "Probability under independence"],
    ]

    summary_table = Table(summary_data, colWidths=[5.5 * cm, 3.5 * cm, 6.5 * cm])
    summary_table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#e8eaf6")),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, -1), 9),
        ("GRID", (0, 0), (-1, -1), 0.5, colors.grey),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
        ("TOPPADDING", (0, 0), (-1, -1), 4),
        ("LEFTPADDING", (0, 0), (-1, -1), 4),
    ]))
    elements.append(summary_table)
    elements.append(Spacer(1, 12))

    # Question-by-question analysis
    elements.append(Paragraph("2. Question-by-Question Analysis", styles["SectionHeader"]))

    q_header = ["Q#", "Type", "U Answer", "V Answer", "Correct", "Contribution"]
    q_data = [q_header]

    for detail in pair_result.evidence_details:
        q_num = detail["question"] + 1
        option_labels = {0: "A", 1: "B", 2: "C", 3: "D"}

        if detail["type"] == "same_wrong":
            q_data.append([
                str(q_num),
                "Same Wrong",
                option_labels.get(detail["answer"], "?"),
                option_labels.get(detail["answer"], "?"),
                option_labels.get(correct_answers.get(detail["question"], -1), "?"),
                f"+{detail['contribution']:.3f}",
            ])
        else:
            q_data.append([
                str(q_num),
                "Diff Wrong",
                option_labels.get(detail.get("answer_u", -1), "?"),
                option_labels.get(detail.get("answer_v", -1), "?"),
                option_labels.get(correct_answers.get(detail["question"], -1), "?"),
                f"{detail['contribution']:.3f}",
            ])

    col_widths = [1.5 * cm, 2.5 * cm, 2.5 * cm, 2.5 * cm, 2.5 * cm, 3 * cm]
    q_table = Table(q_data, colWidths=col_widths)

    q_table_style = [
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#e8eaf6")),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, -1), 8),
        ("GRID", (0, 0), (-1, -1), 0.5, colors.grey),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
        ("TOPPADDING", (0, 0), (-1, -1), 3),
        ("ALIGN", (0, 0), (-1, -1), "CENTER"),
    ]

    # Highlight same-wrong rows in light red
    for row_idx in range(1, len(q_data)):
        if q_data[row_idx][1] == "Same Wrong":
            q_table_style.append(
                ("BACKGROUND", (0, row_idx), (-1, row_idx), colors.HexColor("#ffebee"))
            )

    q_table.setStyle(TableStyle(q_table_style))
    elements.append(q_table)
    elements.append(Spacer(1, 12))

    # Distractor profile visualization (for first few same-wrong questions)
    same_wrong_details = [d for d in pair_result.evidence_details if d["type"] == "same_wrong"]

    if same_wrong_details:
        elements.append(Paragraph(
            "3. Distractor Profile Analysis (Same-Wrong Questions)",
            styles["SectionHeader"],
        ))

        elements.append(Paragraph(
            "The following charts show the selection probability for each option. "
            "The matched wrong answer was chosen by both candidates despite being "
            "a relatively unpopular distractor.",
            styles["BodyText"],
        ))

        # Show charts for up to 6 most suspicious questions
        sorted_details = sorted(same_wrong_details, key=lambda d: d["contribution"], reverse=True)
        for detail in sorted_details[:6]:
            q_idx = detail["question"]
            profile = distractor_profiles.get(q_idx, {})
            correct = correct_answers.get(q_idx, 0)
            answer = detail["answer"]

            chart = _create_distractor_chart(q_idx, profile, correct, answer, answer)
            elements.append(chart)
            elements.append(Spacer(1, 4))

            p_k = detail.get("p_k", 0)
            elements.append(Paragraph(
                f"Q{q_idx + 1}: Both selected option {chr(65 + answer)} "
                f"(p={p_k:.3f}). Contribution to log-lambda: +{detail['contribution']:.3f}",
                styles["BodyText"],
            ))
            elements.append(Spacer(1, 8))

    # Conclusion / Disclaimer
    elements.append(Paragraph("4. Interpretation Guidelines", styles["SectionHeader"]))
    elements.append(Paragraph(
        "This report presents statistical evidence of answer pattern similarity "
        "between the two candidates. A log-likelihood ratio exceeding the threshold "
        "indicates that the observed pattern of matching wrong answers is highly "
        "unlikely under the assumption of independent test-taking.",
        styles["BodyText"],
    ))
    elements.append(Paragraph(
        "IMPORTANT: Statistical evidence alone does not prove collusion. "
        "This report should be considered alongside seating arrangements, "
        "CCTV footage, and other circumstantial evidence before any "
        "administrative action is taken. Due process must be followed.",
        styles["CautionText"],
    ))

    # Build PDF
    doc.build(elements)
    pdf_bytes = buffer.getvalue()
    buffer.close()

    logger.info(
        "Generated PDF report for pair (%s, %s): %d bytes",
        pair_result.candidate_u,
        pair_result.candidate_v,
        len(pdf_bytes),
    )

    return pdf_bytes


def upload_report_to_gcs(
    gcs_client: storage.Client,
    bucket_name: str,
    exam_id: str,
    pair_id: str,
    pdf_bytes: bytes,
) -> str:
    """Upload a PDF evidence report to Google Cloud Storage.

    Args:
        gcs_client: GCS client instance.
        bucket_name: GCS bucket name (e.g., 'pariksha-reports').
        exam_id: Exam identifier.
        pair_id: Pair identifier (e.g., 'candidateU_candidateV').
        pdf_bytes: PDF file contents.

    Returns:
        GCS URI of the uploaded report.
    """
    blob_path = f"{exam_id}/{pair_id}.pdf"
    bucket = gcs_client.bucket(bucket_name)
    blob = bucket.blob(blob_path)

    blob.upload_from_string(pdf_bytes, content_type="application/pdf")

    gcs_uri = f"gs://{bucket_name}/{blob_path}"
    logger.info("Uploaded evidence report to %s", gcs_uri)

    return gcs_uri
