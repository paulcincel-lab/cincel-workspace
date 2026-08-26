-- Alpha M1 – CHECK constraints for date integrity on core.activities
--
-- Business rule (AGENTS.md): every task has a commitmentDate and reviewDate.
-- These are stored as nullable date columns (legacy seed data may omit them),
-- but when both are present the following ordering invariants must hold:
--
--   review_date  >= commitment_date   (review cannot precede commitment)
--   delivery_date >= commitment_date  (actual delivery cannot precede commitment)
--
-- NULL handling: a CHECK constraint with NULLs evaluates to NULL (not FALSE),
-- so the constraints are only enforced when both sides are non-null, which is
-- the correct behaviour for optional fields.

alter table core.activities
  add constraint activities_review_after_commitment
    check (review_date is null or commitment_date is null or review_date >= commitment_date);

alter table core.activities
  add constraint activities_delivery_after_commitment
    check (delivery_date is null or commitment_date is null or delivery_date >= commitment_date);
