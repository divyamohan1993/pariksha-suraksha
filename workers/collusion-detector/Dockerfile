FROM python:3.12-slim

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    libfreetype6-dev \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY src/ ./src/

ENV PYTHONUNBUFFERED=1
ENV GOOGLE_CLOUD_PROJECT=""
ENV PUBSUB_SUBSCRIPTION="collusion-detection-trigger-sub"
ENV GCS_REPORT_BUCKET="pariksha-reports"

CMD ["python", "-m", "src.main"]
