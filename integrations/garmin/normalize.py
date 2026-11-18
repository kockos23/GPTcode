"""Pure normalization helpers for the read-only Garmin Connect bridge."""

from __future__ import annotations

from typing import Any


def _number(value: Any, minimum: float, maximum: float) -> float | int | None:
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        return None
    if value < minimum or value > maximum:
        return None
    return value


def _first(source: dict[str, Any], *keys: str) -> Any:
    for key in keys:
        if key in source and source[key] is not None:
            return source[key]
    return None


def normalize_day(date: str, stats: dict[str, Any], sleep: dict[str, Any], stress: dict[str, Any], body_battery: Any, activities: list[Any]) -> dict[str, Any]:
    sleep_dto = sleep.get("dailySleepDTO", sleep) if isinstance(sleep, dict) else {}
    stress_row = stress if isinstance(stress, dict) else {}
    battery_rows = body_battery if isinstance(body_battery, list) else []
    battery_values = [row.get("charged") if isinstance(row, dict) else None for row in battery_rows]
    battery_values += [row.get("drained") if isinstance(row, dict) else None for row in battery_rows]
    battery_values = [value for value in battery_values if isinstance(value, (int, float)) and not isinstance(value, bool)]
    metrics = {
        "steps": _number(_first(stats, "totalSteps", "steps"), 0, 200_000),
        "sleepMinutes": _number(_first(sleep_dto, "sleepTimeSeconds", "sleepSeconds"), 0, 86_400),
        "restingHeartRate": _number(_first(stats, "restingHeartRate", "restingHR"), 20, 250),
        "averageStress": _number(_first(stress_row, "avgStressLevel", "averageStressLevel"), 0, 100),
        "intensityMinutes": _number(_first(stats, "moderateIntensityMinutes", "intensityMinutes"), 0, 1_440),
        "activeCalories": _number(_first(stats, "activeKilocalories", "activeCalories"), 0, 20_000),
        "bodyBatteryLow": _number(min(battery_values), 0, 100) if battery_values else None,
        "bodyBatteryHigh": _number(max(battery_values), 0, 100) if battery_values else None,
        "activities": _number(len(activities), 0, 100),
    }
    if metrics["sleepMinutes"] is not None:
        metrics["sleepMinutes"] = round(float(metrics["sleepMinutes"]) / 60)
    return {
        "date": date,
        "quality": "COMPLETE" if sum(value is not None for value in metrics.values()) >= 6 else "PARTIAL",
        **{key: value for key, value in metrics.items() if value is not None},
    }
