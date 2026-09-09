FROM python:3.12-slim

WORKDIR /app

COPY requirements.txt .
RUN python -m pip install --no-cache-dir -r requirements.txt

COPY src/ src/

RUN useradd --create-home appuser && chown -R appuser:appuser /app
USER appuser

ENV PORT=8080
ENV QUOTE_CSV_PATH=/app/output/quotes.csv

EXPOSE 8080

CMD ["python", "-m", "src.app"]
