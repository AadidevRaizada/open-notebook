"""
Unit tests for per-organization row-level isolation in the base ObjectModel.

These exercise the contextvar-driven behavior added to ObjectModel without a
live database: repo_query/repo_create are mocked, so we verify exactly which
SQL/params are produced and which records are accepted or rejected.

Isolation rules under test:
- save() stamps org_id from the active-org contextvar on new records.
- get() fails closed (NotFoundError) when a record belongs to another org.
- get_all() appends a WHERE org_id filter only when an org is active.
- With no active org (password/none mode) nothing is stamped or filtered.
"""

from unittest.mock import AsyncMock, patch

import pytest

from open_notebook.domain.notebook import Notebook
from open_notebook.exceptions import NotFoundError
from open_notebook.org_context import (
    current_org_id,
    reset_current_org_id,
    set_current_org_id,
)


def test_contextvar_set_and_reset():
    assert current_org_id() is None
    token = set_current_org_id("org_A")
    try:
        assert current_org_id() == "org_A"
    finally:
        reset_current_org_id(token)
    assert current_org_id() is None


@pytest.mark.asyncio
async def test_get_rejects_other_org_record():
    token = set_current_org_id("org_A")
    try:
        with patch(
            "open_notebook.domain.base.repo_query", new_callable=AsyncMock
        ) as mq:
            mq.return_value = [
                {"id": "notebook:1", "name": "n", "description": "d", "org_id": "org_B"}
            ]
            with pytest.raises(NotFoundError):
                await Notebook.get("notebook:1")
    finally:
        reset_current_org_id(token)


@pytest.mark.asyncio
async def test_get_allows_same_org_record():
    token = set_current_org_id("org_A")
    try:
        with patch(
            "open_notebook.domain.base.repo_query", new_callable=AsyncMock
        ) as mq:
            mq.return_value = [
                {"id": "notebook:1", "name": "n", "description": "d", "org_id": "org_A"}
            ]
            nb = await Notebook.get("notebook:1")
            assert nb.org_id == "org_A"
    finally:
        reset_current_org_id(token)


@pytest.mark.asyncio
async def test_get_allows_legacy_null_org_record():
    # Un-backfilled legacy rows (org_id=None) are not rejected — fail open only
    # for the absence of an org, never for a mismatch.
    token = set_current_org_id("org_A")
    try:
        with patch(
            "open_notebook.domain.base.repo_query", new_callable=AsyncMock
        ) as mq:
            mq.return_value = [
                {"id": "notebook:1", "name": "n", "description": "d", "org_id": None}
            ]
            nb = await Notebook.get("notebook:1")
            assert nb.id is not None
    finally:
        reset_current_org_id(token)


@pytest.mark.asyncio
async def test_get_no_context_does_not_enforce():
    # password/none mode: no active org -> no enforcement (regression-safe).
    with patch("open_notebook.domain.base.repo_query", new_callable=AsyncMock) as mq:
        mq.return_value = [
            {"id": "notebook:1", "name": "n", "description": "d", "org_id": "org_B"}
        ]
        nb = await Notebook.get("notebook:1")
        assert nb.org_id == "org_B"


@pytest.mark.asyncio
async def test_save_stamps_active_org():
    token = set_current_org_id("org_A")
    try:
        with patch(
            "open_notebook.domain.base.repo_create", new_callable=AsyncMock
        ) as mc:
            mc.return_value = [
                {
                    "id": "notebook:1",
                    "name": "n",
                    "description": "d",
                    "org_id": "org_A",
                    "created": "2024-01-01 00:00:00",
                    "updated": "2024-01-01 00:00:00",
                }
            ]
            nb = Notebook(name="n", description="d")
            await nb.save()
            assert nb.org_id == "org_A"
            # repo_create(table_name, data) — the persisted data carries org_id.
            _, data = mc.call_args[0]
            assert data.get("org_id") == "org_A"
    finally:
        reset_current_org_id(token)


@pytest.mark.asyncio
async def test_save_without_context_does_not_stamp():
    with patch("open_notebook.domain.base.repo_create", new_callable=AsyncMock) as mc:
        mc.return_value = [
            {
                "id": "notebook:1",
                "name": "n",
                "description": "d",
                "created": "2024-01-01 00:00:00",
                "updated": "2024-01-01 00:00:00",
            }
        ]
        nb = Notebook(name="n", description="d")
        await nb.save()
        assert nb.org_id is None
        _, data = mc.call_args[0]
        # None values are stripped by _prepare_save_data, so org_id is absent.
        assert "org_id" not in data


@pytest.mark.asyncio
async def test_get_all_filters_by_active_org():
    token = set_current_org_id("org_A")
    try:
        with patch(
            "open_notebook.domain.base.repo_query", new_callable=AsyncMock
        ) as mq:
            mq.return_value = []
            await Notebook.get_all()
            query, params = mq.call_args[0]
            assert "org_id = $org" in query
            assert params == {"org": "org_A"}
    finally:
        reset_current_org_id(token)


@pytest.mark.asyncio
async def test_get_all_no_filter_without_context():
    with patch("open_notebook.domain.base.repo_query", new_callable=AsyncMock) as mq:
        mq.return_value = []
        await Notebook.get_all()
        query, params = mq.call_args[0]
        assert "org_id" not in query
        assert params == {}
