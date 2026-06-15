"""
Admin API routes — Management panel endpoints.

Provides database inspection, container management, and system health
endpoints for the LinguaLearn admin dashboard.
"""
import subprocess
from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import JSONResponse
from sqlalchemy import text, inspect

from app.api.deps import get_current_user, get_db
from app.config import settings
from app.models.user import User
from sqlalchemy.ext.asyncio import AsyncSession

router = APIRouter(prefix="/admin", tags=["admin"])


# ── Auth check ────────────────────────────────────────────────────────
# Simple admin check: must be authenticated (MVP — later add role check)

async def admin_required(current_user: User = Depends(get_current_user)) -> User:
    """Require authenticated user for admin access."""
    return current_user


# ═══════════════════════════════════════════════════════════════════════
# Database Explorer
# ═══════════════════════════════════════════════════════════════════════

@router.get("/db/tables")
async def list_tables(
    db: AsyncSession = Depends(get_db),
    _: User = Depends(admin_required),
) -> dict[str, Any]:
    """List all tables in the database with row counts."""
    try:
        # Get table names from PostgreSQL information_schema
        result = await db.execute(
            text(
                "SELECT table_name FROM information_schema.tables "
                "WHERE table_schema = 'public' ORDER BY table_name"
            )
        )
        tables = result.scalars().all()

        table_info = []
        for table_name in tables:
            count_result = await db.execute(
                text(f'SELECT COUNT(*) FROM "{table_name}"')
            )
            row_count = count_result.scalar()
            table_info.append({
                "name": table_name,
                "row_count": row_count,
            })

        return {"code": 200, "data": {"tables": table_info}}
    except Exception as e:
        return {"code": 500, "message": str(e)}


@router.get("/db/tables/{table_name}")
async def get_table_data(
    table_name: str,
    limit: int = Query(default=50, le=500),
    offset: int = Query(default=0, ge=0),
    db: AsyncSession = Depends(get_db),
    _: User = Depends(admin_required),
) -> dict[str, Any]:
    """Get rows from a specific table."""
    try:
        # Get schema / columns
        col_result = await db.execute(
            text(
                "SELECT column_name, data_type, is_nullable "
                "FROM information_schema.columns "
                "WHERE table_schema = 'public' AND table_name = :tbl "
                "ORDER BY ordinal_position"
            ),
            {"tbl": table_name},
        )
        columns = [
            {"name": r[0], "type": r[1], "nullable": r[2] == "YES"}
            for r in col_result.fetchall()
        ]
        if not columns:
            raise HTTPException(status_code=404, detail=f"Table '{table_name}' not found")

        # Get data
        data_result = await db.execute(
            text(f'SELECT * FROM "{table_name}" ORDER BY 1 DESC LIMIT :lim OFFSET :off'),
            {"lim": limit, "off": offset},
        )
        rows = [dict(row._mapping) for row in data_result.fetchall()]

        # Convert non-serializable types
        for row in rows:
            for k, v in row.items():
                if hasattr(v, "isoformat"):
                    row[k] = v.isoformat()
                elif isinstance(v, bytes):
                    row[k] = v.decode(errors="replace")

        # Total count
        total_result = await db.execute(
            text(f'SELECT COUNT(*) FROM "{table_name}"')
        )
        total = total_result.scalar()

        return {
            "code": 200,
            "data": {
                "table": table_name,
                "columns": columns,
                "rows": rows,
                "total": total,
                "limit": limit,
                "offset": offset,
            },
        }
    except HTTPException:
        raise
    except Exception as e:
        return {"code": 500, "message": str(e)}


@router.get("/db/tables/{table_name}/schema")
async def get_table_schema(
    table_name: str,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(admin_required),
) -> dict[str, Any]:
    """Get table schema with indexes and constraints."""
    try:
        # Columns
        col_result = await db.execute(
            text(
                "SELECT column_name, data_type, character_maximum_length, "
                "is_nullable, column_default "
                "FROM information_schema.columns "
                "WHERE table_schema = 'public' AND table_name = :tbl "
                "ORDER BY ordinal_position"
            ),
            {"tbl": table_name},
        )
        columns = [
            {
                "name": r[0], "type": r[1], "max_length": r[2],
                "nullable": r[3] == "YES", "default": r[4],
            }
            for r in col_result.fetchall()
        ]

        # Primary keys
        pk_result = await db.execute(
            text(
                "SELECT kcu.column_name "
                "FROM information_schema.table_constraints tc "
                "JOIN information_schema.key_column_usage kcu "
                "ON tc.constraint_name = kcu.constraint_name "
                "WHERE tc.table_schema = 'public' AND tc.table_name = :tbl "
                "AND tc.constraint_type = 'PRIMARY KEY'"
            ),
            {"tbl": table_name},
        )
        primary_keys = [r[0] for r in pk_result.fetchall()]

        # Indexes
        idx_result = await db.execute(
            text(
                "SELECT indexname, indexdef FROM pg_indexes "
                "WHERE schemaname = 'public' AND tablename = :tbl"
            ),
            {"tbl": table_name},
        )
        indexes = [{"name": r[0], "definition": r[1]} for r in idx_result.fetchall()]

        return {
            "code": 200,
            "data": {
                "table": table_name,
                "columns": columns,
                "primary_keys": primary_keys,
                "indexes": indexes,
            },
        }
    except Exception as e:
        return {"code": 500, "message": str(e)}


# ═══════════════════════════════════════════════════════════════════════
# Container / Service Management
# ═══════════════════════════════════════════════════════════════════════

@router.get("/containers")
async def list_containers(
    _: User = Depends(admin_required),
) -> dict[str, Any]:
    """List all Docker containers and their status."""
    try:
        result = subprocess.run(
            [
                "docker", "ps", "-a",
                "--format", "{{.Names}}|{{.Image}}|{{.Status}}|{{.Ports}}|{{.RunningFor}}",
            ],
            capture_output=True, text=True, timeout=10,
        )
        if result.returncode != 0:
            return {"code": 500, "message": result.stderr.strip()}

        containers = []
        for line in result.stdout.strip().split("\n"):
            if not line:
                continue
            parts = line.split("|")
            if len(parts) >= 5:
                status_str = parts[2]
                is_running = "Up" in status_str
                containers.append({
                    "name": parts[0],
                    "image": parts[1],
                    "status": status_str,
                    "ports": parts[3],
                    "running_for": parts[4],
                    "is_running": is_running,
                })

        return {"code": 200, "data": {"containers": containers}}
    except Exception as e:
        return {"code": 500, "message": str(e)}


@router.post("/containers/{container_name}/{action}")
async def manage_container(
    container_name: str,
    action: str,
    _: User = Depends(admin_required),
) -> dict[str, Any]:
    """Start / stop / restart a Docker container."""
    if action not in ("start", "stop", "restart"):
        raise HTTPException(status_code=400, detail=f"Invalid action: {action}")

    # Safety: prevent managing critical system containers
    allowed_prefixes = ("lingualearn-", "1Panel-")
    if not any(container_name.startswith(p) for p in allowed_prefixes):
        raise HTTPException(status_code=403, detail=f"Cannot manage container: {container_name}")

    try:
        subprocess.run(
            ["docker", action, container_name],
            capture_output=True, text=True, timeout=30, check=True,
        )
        return {"code": 200, "message": f"Container '{container_name}' {action}ed successfully"}
    except subprocess.CalledProcessError as e:
        return {"code": 500, "message": e.stderr.strip()}


# ═══════════════════════════════════════════════════════════════════════
# System Health
# ═══════════════════════════════════════════════════════════════════════

@router.get("/health")
async def admin_health(
    _: User = Depends(admin_required),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    """Comprehensive system health check."""
    health = {"overall": "ok", "components": {}}

    # Database
    try:
        await db.execute(text("SELECT 1"))
        health["components"]["database"] = {"status": "ok"}
    except Exception as e:
        health["components"]["database"] = {"status": "error", "message": str(e)}
        health["overall"] = "degraded"

    # Redis
    try:
        from app.db.redis import redis_pool
        await redis_pool.ping()
        health["components"]["redis"] = {"status": "ok"}
    except Exception as e:
        health["components"]["redis"] = {"status": "error", "message": str(e)}
        health["overall"] = "degraded"

    # DeepSeek
    try:
        import httpx
        async with httpx.AsyncClient(timeout=5) as client:
            resp = await client.get(
                f"{settings.deepseek_base_url}/models",
                headers={"Authorization": f"Bearer {settings.deepseek_api_key}"},
            )
            if resp.status_code == 200:
                health["components"]["deepseek"] = {"status": "ok"}
            else:
                health["components"]["deepseek"] = {"status": "error", "message": f"HTTP {resp.status_code}"}
    except Exception as e:
        health["components"]["deepseek"] = {"status": "error", "message": str(e)}

    # Disk usage
    try:
        result = subprocess.run(
            ["df", "-h", "/"], capture_output=True, text=True, timeout=5,
        )
        lines = result.stdout.strip().split("\n")
        if len(lines) > 1:
            parts = lines[1].split()
            if len(parts) >= 5:
                health["components"]["disk"] = {
                    "status": "ok",
                    "total": parts[1],
                    "used": parts[2],
                    "available": parts[3],
                    "use_percent": parts[4],
                }
    except Exception:
        health["components"]["disk"] = {"status": "unknown"}

    # Memory
    try:
        result = subprocess.run(
            ["free", "-h"], capture_output=True, text=True, timeout=5,
        )
        health["components"]["memory"] = {"status": "ok", "raw": result.stdout.strip()}
    except Exception:
        health["components"]["memory"] = {"status": "unknown"}

    return {"code": 200, "data": health}
