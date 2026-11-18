# Health & Performance assistant

This assistant combines training and recovery data with lightweight self-reporting. It is a decision-support layer, not a medical device and not a diagnostic service.

## Sources

- Garmin Connect: Fenix 3 and CIRQA daily metrics and activities through the read-only bridge.
- Manual/NORA check-in: mood, energy, soreness, perceived stress, sleep quality, and context notes (all optional).
- Habits: user-defined daily targets and completion logs.
- Supplements: name, dose, unit, time, and note. No causal claim is inferred from a single observation.
- Future adapters: Freeletics workout completion and Strava activity metadata. Apple Health is intentionally deferred because it is not a primary source for this user.

## Evaluation rules

1. Keep raw observations separate from recommendations.
2. Compare against the user's rolling baseline, not population targets, when sufficient data exists.
3. Do not infer causality from correlation. Show sample size and date range for every relationship.
4. Require repeated observations before surfacing a possible relationship between a habit/supplement and sleep, recovery, or training.
5. Never recommend starting, stopping, or changing medication. Health-changing actions require owner approval.
6. Escalate urgent symptoms to appropriate professional or emergency care rather than attempting diagnosis.

## Initial cadence

- Daily: Garmin import, optional 30-second check-in, habit completion.
- Weekly: trend summary with missing-data warning and no causal language.
- Monthly: baseline recalculation and review of which habits are worth continuing to track.

## Data minimisation

Only metrics useful for the stated tracking goals are retained. Garmin credentials and MFA tokens stay on the private VPS volume and are never stored in Convex, Git, n8n workflow JSON, or chat.
