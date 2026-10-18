-- Only the authenticated server endpoint may upload after validating image content.

drop policy if exists "ticket owners can upload their own images"
on storage.objects;
