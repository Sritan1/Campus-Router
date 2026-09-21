# two stages, so the shipped image has no compiler in it

FROM gcc:14 AS engine-build
WORKDIR /src
COPY engine/ ./engine/
RUN make -C engine

FROM python:3.12-slim
WORKDIR /app

COPY api/requirements.txt ./api/requirements.txt
RUN pip install --no-cache-dir -r api/requirements.txt

COPY api/ ./api/
COPY --from=engine-build /src/engine/build/campus_engine ./engine/build/campus_engine

ENV PYTHONUNBUFFERED=1
ENV ENGINE_BINARY=/app/engine/build/campus_engine
ENV ENGINE_BIND_HOST=127.0.0.1
ENV ENGINE_PORT=8081

# TRUST_PROXY_HEADERS is set on railway, not here, since whether a trusted proxy
# is in front is a fact about the deployment

# nothing needs root, and running as root turns any app bug into a root problem
RUN useradd --create-home --shell /usr/sbin/nologin campus \
    && chown -R campus:campus /app
USER campus

EXPOSE 8000

# railway passes the port in PORT. no proxy headers flag, since uvicorn would take
# the first x forwarded for entry, the one the caller writes
CMD ["sh", "-c", "uvicorn api.main:app --host 0.0.0.0 --port ${PORT:-8000}"]
