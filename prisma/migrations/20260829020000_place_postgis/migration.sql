DO $migration$
BEGIN
  BEGIN
    CREATE EXTENSION IF NOT EXISTS postgis;
  EXCEPTION
    WHEN feature_not_supported OR undefined_file OR insufficient_privilege THEN
      RAISE NOTICE 'PostGIS is unavailable; proximity will use the application fallback.';
  END;

  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'postgis') THEN
    EXECUTE '
      ALTER TABLE "places"
      ADD COLUMN IF NOT EXISTS "location" geography(Point, 4326)
      GENERATED ALWAYS AS (
        ST_SetSRID(ST_MakePoint("longitude", "latitude"), 4326)::geography
      ) STORED
    ';
    EXECUTE '
      CREATE INDEX IF NOT EXISTS "places_location_gist_idx"
      ON "places" USING GIST ("location")
    ';
  END IF;
END
$migration$;
