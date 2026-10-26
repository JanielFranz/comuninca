-- Event categories are now: workshop, webinar, masterclass, networking,
-- expoferia, voluntariado, convivencia (see CATEGORY_ORDER in lib/constants.ts).
-- Rewrites rows that still carry a retired key so they don't fall back to the
-- default category. `workshop` and `networking` keep their keys.
UPDATE "Event" SET "category" = 'convivencia' WHERE "category" IN ('social', 'music', 'sports');
UPDATE "Event" SET "category" = 'expoferia' WHERE "category" = 'food';
