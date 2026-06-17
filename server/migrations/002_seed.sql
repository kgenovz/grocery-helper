-- Create the single shared household list if none exists yet.
insert into lists (name)
select 'Household'
where not exists (select 1 from lists);
