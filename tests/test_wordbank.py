"""Tests for wordbank API endpoints.

Covers:
- GET /api/v1/wordbank/presets — returns 4 presets
- GET /api/v1/wordbank/presets/{id} — valid preset, invalid preset, pagination
"""

import pytest
from httpx import AsyncClient


class TestListPresets:
    """Tests for GET /api/v1/wordbank/presets."""

    async def test_list_presets_returns_4(
        self, client: AsyncClient
    ) -> None:
        """The endpoint returns 4 preset word banks."""
        response = await client.get("/api/v1/wordbank/presets")

        assert response.status_code == 200, f"Presets failed: {response.text}"
        data = response.json()
        assert isinstance(data, list)
        assert len(data) == 4, f"Expected 4 presets, got {len(data)}"

    async def test_preset_structure(
        self, client: AsyncClient
    ) -> None:
        """Each preset has the required summary fields."""
        response = await client.get("/api/v1/wordbank/presets")
        data = response.json()

        for preset in data:
            assert "id" in preset
            assert "name" in preset
            assert "description" in preset
            assert "target_level" in preset
            assert "word_count" in preset
            assert "category" in preset
            # Word data should NOT be in the summary
            assert "words" not in preset

    async def test_preset_ids_match_expected(
        self, client: AsyncClient
    ) -> None:
        """All expected preset IDs are present."""
        response = await client.get("/api/v1/wordbank/presets")
        data = response.json()

        preset_ids = {p["id"] for p in data}
        expected = {"junior_high", "senior_high", "cet4", "cet6"}
        assert preset_ids == expected, (
            f"Expected {expected}, got {preset_ids}"
        )


class TestGetPresetWords:
    """Tests for GET /api/v1/wordbank/presets/{preset_id}."""

    async def test_get_valid_preset(
        self, client: AsyncClient
    ) -> None:
        """Fetching a valid preset returns paginated word data."""
        response = await client.get("/api/v1/wordbank/presets/cet4")

        assert response.status_code == 200, f"Preset fetch failed: {response.text}"
        data = response.json()
        assert "items" in data
        assert "total" in data
        assert "page" in data
        assert "page_size" in data
        assert "total_pages" in data

        assert data["page"] == 1
        assert data["total"] == 20  # CET4 has 20 words
        assert len(data["items"]) == 20

    async def test_preset_word_structure(
        self, client: AsyncClient
    ) -> None:
        """Each word in a preset has the required fields."""
        response = await client.get("/api/v1/wordbank/presets/junior_high")
        data = response.json()

        for word in data["items"]:
            assert "lemma" in word
            assert "part_of_speech" in word
            assert "basic_definition" in word

    async def test_get_invalid_preset_returns_404(
        self, client: AsyncClient
    ) -> None:
        """Fetching a non-existent preset returns 404."""
        response = await client.get("/api/v1/wordbank/presets/nonexistent")

        assert response.status_code == 404, (
            f"Expected 404, got {response.status_code}"
        )
        error = response.json()
        assert "not found" in error["detail"].lower()

    async def test_pagination_default_values(
        self, client: AsyncClient
    ) -> None:
        """Default pagination uses page=1 and page_size=500."""
        response = await client.get("/api/v1/wordbank/presets/cet6")

        assert response.status_code == 200
        data = response.json()
        assert data["page"] == 1
        assert data["page_size"] == 500

    async def test_pagination_custom_page_size(
        self, client: AsyncClient
    ) -> None:
        """Custom page_size limits the items returned."""
        response = await client.get(
            "/api/v1/wordbank/presets/cet4?page=1&page_size=5"
        )

        assert response.status_code == 200
        data = response.json()
        assert data["page_size"] == 5
        assert len(data["items"]) == 5
        assert data["total"] == 20
        assert data["total_pages"] == 4  # 20 items / 5 per page

    async def test_pagination_page_out_of_range(
        self, client: AsyncClient
    ) -> None:
        """Page beyond total pages returns empty items list."""
        response = await client.get(
            "/api/v1/wordbank/presets/junior_high?page=99&page_size=500"
        )

        assert response.status_code == 200
        data = response.json()
        assert len(data["items"]) == 0
        assert data["page"] == 99

    async def test_page_size_exceeds_max(
        self, client: AsyncClient
    ) -> None:
        """Page size exceeding max (500) returns 422."""
        response = await client.get(
            "/api/v1/wordbank/presets/cet4?page_size=1000"
        )

        assert response.status_code == 422, (
            f"Expected 422 for excessive page_size, got {response.status_code}"
        )

    async def test_page_number_less_than_1(
        self, client: AsyncClient
    ) -> None:
        """Page number less than 1 returns 422."""
        response = await client.get(
            "/api/v1/wordbank/presets/cet4?page=0"
        )

        assert response.status_code == 422, (
            f"Expected 422 for page=0, got {response.status_code}"
        )
