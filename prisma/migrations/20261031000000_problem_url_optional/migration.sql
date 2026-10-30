-- WI-091: a problem from a book or a whiteboard has no link. The URL may be empty; when it is
-- set it is still an http(s) link without spaces, as before.
ALTER TABLE "DsaProblem" DROP CONSTRAINT "problem_url_http";
ALTER TABLE "DsaProblem" ADD CONSTRAINT "problem_url_http"
  CHECK ("problemUrl" = '' OR "problemUrl" ~* '^https?://[^[:space:]]+$');
