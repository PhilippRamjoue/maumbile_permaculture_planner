import pytest

from app.core.capacity import Capacity, CapacityExceeded


async def test_capacity_rejects_excess_work_and_releases_after_failure() -> None:
    capacity = Capacity(1)
    with pytest.raises(ValueError):
        async with capacity.acquire():
            with pytest.raises(CapacityExceeded):
                async with capacity.acquire():
                    pytest.fail("Excess work was admitted")
            raise ValueError("work failed")
    async with capacity.acquire():
        pass
