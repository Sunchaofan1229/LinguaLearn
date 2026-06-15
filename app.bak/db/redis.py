"""Async Redis connection pool.

Provides a shared connection pool and a FastAPI dependency that yields
Redis client instances.
"""

from typing import AsyncGenerator

from redis.asyncio import ConnectionPool, Redis

from app.config import settings

# ── Connection pool (shared across requests) ──────────────────────────

redis_pool = ConnectionPool.from_url(
    settings.redis_url,
    max_connections=20,
    decode_responses=True,
)


async def get_redis() -> AsyncGenerator[Redis, None]:
    """FastAPI dependency that provides an async Redis client.

    The client is returned to the connection pool when the request
    finishes.

    Yields:
        An active Redis client instance.

    Example:
        @app.get("/cache/{key}")
        async def get_cache(key: str, redis: Redis = Depends(get_redis)):
            return await redis.get(key)
    """
    client = Redis(connection_pool=redis_pool)
    try:
        yield client
    finally:
        await client.aclose()
