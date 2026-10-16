from fastapi import FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

from app.api.routes_chunks import internal_router as internal_chunks_router
from app.api.routes_chunks import router as chunks_router
from app.api.routes_dedup import router as dedup_router
from app.api.routes_integrity import router as integrity_router
from app.api.routes_metrics import router as metrics_router
from app.api.routes_index import router as index_router
from app.middleware import TeamBContractMiddleware


from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(
    title="Team B Deduplication & Integrity Engine",
    version="1.0.0",
    description="Deduplication and integrity verification service.",
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.add_middleware(TeamBContractMiddleware)


@app.exception_handler(HTTPException)
async def http_exception_handler(request: Request, exc: HTTPException):
    return JSONResponse(
        status_code=exc.status_code,
        content={
            "error": {
                "code": f"HTTP_{exc.status_code}",
                "message": str(exc.detail),
                "details": [],
            },
            "meta": {
                "correlation_id": getattr(
                    request.state,
                    "correlation_id",
                    None,
                ),
            },
        },
    )


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(
    request: Request,
    exc: RequestValidationError,
):
    return JSONResponse(
        status_code=422,
        content={
            "error": {
                "code": "VALIDATION_ERROR",
                "message": "Request validation failed",
                "details": exc.errors(),
            },
            "meta": {
                "correlation_id": getattr(
                    request.state,
                    "correlation_id",
                    None,
                ),
            },
        },
    )


@app.get("/", tags=["Health"])
def root():
    return {
        "message": "Team B Deduplication & Integrity Engine is running"
    }


@app.get("/health", tags=["Health"])
def health():
    return {
        "status": "HEALTHY",
        "service": "team-b-dedup-integrity",
        "version": "1.0.0",
    }


@app.get("/ready", tags=["Health"])
def ready():
    return {
        "status": "READY",
        "service": "team-b-dedup-integrity",
        "version": "1.0.0",
    }


# Register all API routes
app.include_router(chunks_router)
app.include_router(internal_chunks_router)
app.include_router(dedup_router)
app.include_router(integrity_router)
app.include_router(metrics_router)
app.include_router(index_router)