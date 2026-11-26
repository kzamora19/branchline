-- Read-only local storage inventory. Service gateway only.
BEGIN;
CREATE FUNCTION public.branchline_storage_review(p_actor_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE v_buckets jsonb;v_files jsonb;v_policy jsonb;v_eligible bigint;v_expiring bigint;v_total bigint;v_reclaimed bigint;v_events jsonb;v_event_count bigint;
BEGIN
 PERFORM private.branchline_retention_require_actor(p_actor_id);
 SELECT coalesce(jsonb_agg(to_jsonb(q) ORDER BY q.id),'[]'::jsonb) INTO v_buckets FROM (
 SELECT b.id,count(o.id) AS objects,coalesce(sum(CASE WHEN o.metadata->>'size'~'^[0-9]{1,18}$' THEN (o.metadata->>'size')::bigint ELSE 0 END),0) AS bytes,
 count(o.id) FILTER(WHERE coalesce(o.metadata->>'size','')!~'^[0-9]{1,18}$') AS "unknownSizes"
 FROM storage.buckets b LEFT JOIN storage.objects o ON b.id=o.bucket_id GROUP BY b.id
 ) q;
 SELECT jsonb_build_object('retentionDays',retention_days,'enabled',enabled,'releaseAuthorized',release_authorized) INTO v_policy FROM private.branchline_retention_policy WHERE singleton;
 SELECT count(*) FILTER(WHERE f.state='registered' AND d.reason='eligible'),count(*) FILTER(WHERE f.state='registered' AND d.reason='expiring'),count(*),coalesce(sum(f.removed_bytes),0)
 INTO v_eligible,v_expiring,v_total,v_reclaimed FROM private.branchline_retained_sources f JOIN private.branchline_retention_decisions(now()) d ON d.file_id=f.id;
 SELECT coalesce(jsonb_agg(to_jsonb(q) ORDER BY q.imported_at DESC,q.id),'[]'::jsonb) INTO v_files FROM(
 SELECT f.id,f.source_name AS name,f.kind,f.scope,f.imported_at,f.source_date,f.byte_size AS bytes,f.hold,f.state,d.reason,d.expires_at AS "expiresAt"
 FROM private.branchline_retained_sources f JOIN private.branchline_retention_decisions(now()) d ON d.file_id=f.id ORDER BY f.imported_at DESC,f.id LIMIT 250
 ) q;
 SELECT count(*) INTO v_event_count FROM private.branchline_retention_events;
 SELECT coalesce(jsonb_agg(to_jsonb(q) ORDER BY q.created_at DESC,q.id DESC),'[]'::jsonb) INTO v_events FROM(
 SELECT e.id,e.created_at,e.actor_id,e.action,f.source_name AS source,e.details
 FROM private.branchline_retention_events e LEFT JOIN private.branchline_retained_sources f ON f.id=e.file_id
 ORDER BY e.created_at DESC,e.id DESC LIMIT 100
 ) q;
 RETURN jsonb_build_object('policy',v_policy,'buckets',v_buckets,'legacySources','[]'::jsonb,'eligible',v_eligible,'expiring',v_expiring,'total',v_total,'reclaimedBytes',v_reclaimed,'files',v_files,'auditEvents',v_events,'auditCount',v_event_count,'registryReady',true);
END $$;
REVOKE ALL ON FUNCTION public.branchline_storage_review(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.branchline_storage_review(uuid) TO service_role;
COMMIT;
