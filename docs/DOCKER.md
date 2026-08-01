# Docker Compose

The production-style local stack runs the application behind Nginx. Only
Nginx publishes a host port; the Node.js application stays on the private
Compose network.

## Start

Copy `.env.example` to `.env`, set `GEMINI_API_KEY` when AI recommendations
should be enabled, and run:

```bash
docker compose up -d --build
```

The site is available at `http://localhost`. To use another host port, set
`HTTP_PORT` in `.env`, for example `HTTP_PORT=8080`.

## Check and operate

```bash
docker compose ps
docker compose logs -f
curl http://localhost/healthz
curl http://localhost/api/health
docker compose down
```

`/healthz` checks Nginx itself. `/api/health` is proxied to the application and
is also used by the Compose application healthcheck.

The public tactical recommendation endpoint is limited per client IP at the
Nginx layer. TLS is intentionally not configured here because certificate
configuration depends on the production domain and AWS ingress design.
