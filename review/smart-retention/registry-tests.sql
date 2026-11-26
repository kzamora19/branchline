-- Synthetic fixture assertions. Never execute on real stored objects.
INSERT INTO storage.buckets VALUES('branchline-retained-imports');
DO $$
DECLARE i int;f uuid;h text;p text;a uuid:='00000000-0000-0000-0000-000000000001';other uuid:='00000000-0000-0000-0000-000000000002';v jsonb;old_id uuid:='00000000-0000-0000-0000-000000000101';token uuid;
BEGIN
 FOR i IN 1..3 LOOP
  f:=('00000000-0000-0000-0000-00000000010'||i)::uuid;h:=repeat(i::text,64);p:='originals/'||h||'/'||f::text||'.xlsx';
  INSERT INTO storage.objects(bucket_id,name,metadata) VALUES('branchline-retained-imports',p,'{"size":100}');
  INSERT INTO private.branchline_retained_sources(id,kind,scope,source_name,source_date,imported_at,sha256,object_path,byte_size,processing_reference,validated,data_preserved,dependencies_verified)
  VALUES(f,'product-master','global','fixture-'||i||'.xlsx',(now()-make_interval(days=>120-i*10))::date,now()-make_interval(days=>120-i*10),h,p,100,'synthetic',true,true,true);
 END LOOP;
 IF (SELECT reason FROM private.branchline_retention_decisions(now()) WHERE file_id=old_id)<>'eligible' THEN RAISE EXCEPTION 'Old file not eligible';END IF;
 IF (SELECT count(*) FROM private.branchline_retention_decisions(now()) WHERE reason='latest two valid versions / no replacement')<>2 THEN RAISE EXCEPTION 'Latest two not protected';END IF;
 IF public.branchline_retention_claim(a,old_id) IS NOT NULL THEN RAISE EXCEPTION 'Disabled cleanup allowed';END IF;
 BEGIN PERFORM public.branchline_retention_configure(NULL,60,false);RAISE EXCEPTION 'Missing verified actor configured retention';EXCEPTION WHEN insufficient_privilege THEN NULL;END;
 BEGIN PERFORM public.branchline_retention_configure(a,60,true);RAISE EXCEPTION 'Unapproved release enabled';EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'Deletion release has not been authorized' THEN RAISE;END IF;END;
 PERFORM public.branchline_retention_hold(a,old_id,true);
 IF (SELECT reason FROM private.branchline_retention_decisions(now()) WHERE file_id=old_id)<>'protected' THEN RAISE EXCEPTION 'Hold ignored';END IF;
 PERFORM public.branchline_retention_hold(a,old_id,false);
 PERFORM public.branchline_retention_dependency(old_id,'saved-project',true);
 IF (SELECT reason FROM private.branchline_retention_decisions(now()) WHERE file_id=old_id)<>'active dependency' THEN RAISE EXCEPTION 'Dependency ignored';END IF;
 PERFORM public.branchline_retention_dependency(old_id,'saved-project',false);
 UPDATE private.branchline_retention_policy SET release_authorized=true;
 PERFORM public.branchline_retention_configure(a,60,true);
 v:=public.branchline_retention_claim(a,old_id);token:=(v->>'token')::uuid;
 IF token IS NULL OR NOT public.branchline_retention_revalidate(token) OR public.branchline_retention_claim(a,old_id) IS NOT NULL THEN RAISE EXCEPTION 'Claim invariant failed';END IF;
 BEGIN PERFORM public.branchline_retention_dependency(old_id,'new-project',true);RAISE EXCEPTION 'New dependency on claim allowed';EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'File unavailable for dependency changes' THEN RAISE;END IF;END;
 BEGIN PERFORM public.branchline_retention_finish(token,'deleted');RAISE EXCEPTION 'False deletion confirmation';EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'Object absence not confirmed' THEN RAISE;END IF;END;
 -- This is synthetic metadata in a disposable test schema, NOT actual Supabase Storage.
 DELETE FROM storage.objects WHERE bucket_id='branchline-retained-imports' AND name=v->>'path';
 PERFORM public.branchline_retention_finish(token,'deleted');
 IF (SELECT state FROM private.branchline_retained_sources WHERE id=old_id)<>'deleted' THEN RAISE EXCEPTION 'Cleanup affected business records';END IF;
 IF jsonb_array_length(public.branchline_retention_notices(a))<>1 THEN RAISE EXCEPTION 'Missing deletion notice';END IF;
 BEGIN PERFORM public.branchline_retention_notices(NULL);RAISE EXCEPTION 'Notice without verified actor';EXCEPTION WHEN insufficient_privilege THEN NULL;END;
 IF EXISTS(SELECT 1 FROM private.branchline_retention_decisions(now()) WHERE reason='eligible') THEN RAISE EXCEPTION 'Remaining versions eligible';END IF;
 IF has_function_privilege('authenticated','public.branchline_retention_claim(uuid,uuid)','EXECUTE') THEN RAISE EXCEPTION 'Browser may claim files';END IF;
 IF (SELECT count(*) FROM storage.objects WHERE bucket_id='protected-system-assets')<>1 THEN RAISE EXCEPTION 'Protected asset touched';END IF;
 v:=public.branchline_storage_review(a);
 IF (v->>'eligible')::int<>0 OR (v->>'reclaimedBytes')::int<>100 OR (v->>'total')::int<>3 THEN RAISE EXCEPTION 'Incorrect storage overview';END IF;
 RAISE NOTICE 'PASS remote registry claims, dependencies, protected assets and service grants';
END $$;
