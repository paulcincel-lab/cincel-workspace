-- Sprint 11.2 - Grants mínimos para Data API en schema core
-- Mantiene "sin acceso anon" y habilita acceso para usuarios autenticados.

grant usage on schema core to authenticated, service_role;

grant select, insert, update, delete on all tables in schema core to authenticated, service_role;
grant usage, select on all sequences in schema core to authenticated, service_role;

grant execute on all functions in schema core to authenticated, service_role;

alter default privileges in schema core
  grant select, insert, update, delete on tables to authenticated, service_role;

alter default privileges in schema core
  grant usage, select on sequences to authenticated, service_role;

alter default privileges in schema core
  grant execute on functions to authenticated, service_role;
