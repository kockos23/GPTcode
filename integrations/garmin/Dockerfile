FROM python:3.12-slim
WORKDIR /app
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt
COPY bridge.py normalize.py bootstrap.py scheduler.py ./
RUN useradd --system --uid 10001 garmin && mkdir -p /tokens && chown -R garmin:garmin /tokens /app
USER garmin
ENV GARMIN_TOKEN_STORE=/tokens
VOLUME ["/tokens"]
CMD ["python", "/app/scheduler.py"]
