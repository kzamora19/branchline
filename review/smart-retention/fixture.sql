CREATE ROLE anon NOLOGIN;CREATE ROLE authenticated NOLOGIN;CREATE ROLE service_role NOLOGIN BYPASSRLS;
CREATE SCHEMA storage;CREATE TABLE storage.buckets(id text PRIMARY KEY);
CREATE TABLE storage.objects(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),bucket_id text REFERENCES storage.buckets(id),name text,metadata jsonb);
GRANT USAGE ON SCHEMA storage TO service_role;GRANT SELECT ON ALL TABLES IN SCHEMA storage TO service_role;
INSERT INTO storage.buckets VALUES('protected-system-assets');INSERT INTO storage.objects(bucket_id,name,metadata) VALUES('protected-system-assets','official-logo.png','{"size":100}');
