-- WI-106: the pattern coach adds two kinds of "Rumi noticed" answers.
ALTER TABLE "NoticedAnswer" DROP CONSTRAINT "NoticedAnswer_kind_known";
ALTER TABLE "NoticedAnswer" ADD CONSTRAINT "NoticedAnswer_kind_known" CHECK ("kind" IN ('interview', 'idle', 'routine', 'heavy', 'stuck', 'cold'));
