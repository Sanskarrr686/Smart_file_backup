"""Application package initialization."""

# The runtime environment is explicitly loaded by the serving process or shell.
# Avoid importing .env automatically here so local tests and in-memory flows
# remain deterministic while real deployments can still use a .env file.
