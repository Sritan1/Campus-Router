# two stages. we build the engine with gcc then drop it into a small
# python image so the shipped container has no compiler in it.

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

# there is a proxy in front of us here, so the rate limiter should count
# the real caller rather than counting everybody as the proxy
ENV TRUST_PROXY_HEADERS=true

# nothing here needs root, and a container that runs as root turns any
# problem in the app into a root problem inside the container
RUN useradd --create-home --shell /usr/sbin/nologin campus \
    && chown -R campus:campus /app
USER campus

EXPOSE 8000

# railway hands us the port through PORT so we expand it at runtime.
# proxy-headers lets uvicorn work out the real client address too.
CMD ["sh", "-c", "uvicorn api.main:app --host 0.0.0.0 --port ${PORT:-8000} --proxy-headers --forwarded-allow-ips='*'"]
