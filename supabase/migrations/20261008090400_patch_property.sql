-- Migratie 5: atomische, gedeeltelijke woningupdates voor autosave.
-- Alleen expliciet genoemde kolommen kunnen wijzigen (whitelist); JSON-velden
-- worden per sleutel samengevoegd binnen één UPDATE, zodat gelijktijdige
-- wijzigingen in verschillende velden elkaar niet overschrijven.

create or replace function private.jsonb_merge_patch(p_base jsonb, p_patch jsonb)
returns jsonb
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_result jsonb := coalesce(p_base, '{}'::jsonb);
  v_key text;
  v_value jsonb;
begin
  if p_patch is null or jsonb_typeof(p_patch) <> 'object' then
    return v_result;
  end if;
  for v_key, v_value in select key, value from jsonb_each(p_patch) loop
    if v_value is null or jsonb_typeof(v_value) = 'null' then
      v_result := v_result - v_key;
    elsif jsonb_typeof(v_value) = 'object' and jsonb_typeof(v_result -> v_key) = 'object' then
      v_result := jsonb_set(v_result, array[v_key], private.jsonb_merge_patch(v_result -> v_key, v_value));
    elsif jsonb_typeof(v_value) = 'object' then
      v_result := jsonb_set(v_result, array[v_key], private.jsonb_merge_patch('{}'::jsonb, v_value));
    else
      v_result := jsonb_set(v_result, array[v_key], v_value);
    end if;
  end loop;
  return v_result;
end;
$$;
grant execute on function private.jsonb_merge_patch(jsonb, jsonb) to authenticated;

create or replace function public.patch_property(
  p_property_id uuid,
  p_columns jsonb,
  p_facts jsonb default null,
  p_positioning jsonb default null,
  p_publication jsonb default null
) returns timestamptz
language plpgsql
security invoker
set search_path = ''
as $$
declare
  c jsonb := coalesce(p_columns, '{}'::jsonb);
  v_updated timestamptz;
begin
  update public.properties p set
    address = case when c ? 'address' then c ->> 'address' else p.address end,
    house_number = case when c ? 'house_number' then c ->> 'house_number' else p.house_number end,
    addition = case when c ? 'addition' then c ->> 'addition' else p.addition end,
    postcode = case when c ? 'postcode' then c ->> 'postcode' else p.postcode end,
    city = case when c ? 'city' then c ->> 'city' else p.city end,
    neighbourhood = case when c ? 'neighbourhood' then c ->> 'neighbourhood' else p.neighbourhood end,
    property_type = case when c ? 'property_type' then c ->> 'property_type' else p.property_type end,
    listing_status = case when c ? 'listing_status' then coalesce((c ->> 'listing_status')::public.listing_status, 'in_voorbereiding') else p.listing_status end,
    asking_price = case when c ? 'asking_price' then (c ->> 'asking_price')::integer else p.asking_price end,
    sale_condition = case when c ? 'sale_condition' then (c ->> 'sale_condition')::public.sale_condition else p.sale_condition end,
    living_area = case when c ? 'living_area' then (c ->> 'living_area')::integer else p.living_area end,
    plot_area = case when c ? 'plot_area' then (c ->> 'plot_area')::integer else p.plot_area end,
    year_built = case when c ? 'year_built' then (c ->> 'year_built')::integer else p.year_built end,
    energy_label = case when c ? 'energy_label' then c ->> 'energy_label' else p.energy_label end,
    rooms = case when c ? 'rooms' then (c ->> 'rooms')::smallint else p.rooms end,
    bedrooms = case when c ? 'bedrooms' then (c ->> 'bedrooms')::smallint else p.bedrooms end,
    bathrooms = case when c ? 'bathrooms' then (c ->> 'bathrooms')::smallint else p.bathrooms end,
    toilets = case when c ? 'toilets' then (c ->> 'toilets')::smallint else p.toilets end,
    floors = case when c ? 'floors' then (c ->> 'floors')::smallint else p.floors end,
    floor_position = case when c ? 'floor_position' then c ->> 'floor_position' else p.floor_position end,
    assigned_to = case when c ? 'assigned_to' then (c ->> 'assigned_to')::uuid else p.assigned_to end,
    facts_json = case when p_facts is null then p.facts_json else private.jsonb_merge_patch(p.facts_json, p_facts) end,
    positioning_json = case when p_positioning is null then p.positioning_json else private.jsonb_merge_patch(p.positioning_json, p_positioning) end,
    publication_json = case when p_publication is null then p.publication_json else private.jsonb_merge_patch(p.publication_json, p_publication) end,
    -- Elke inhoudelijke wijziging vraagt om een nieuwe controle vóór generatie
    data_checked_at = null
  where p.id = p_property_id and p.deleted_at is null
  returning p.updated_at into v_updated;
  if v_updated is null then
    raise exception 'Woning niet gevonden of geen rechten' using errcode = '42501';
  end if;
  return v_updated;
end;
$$;

revoke execute on function public.patch_property(uuid, jsonb, jsonb, jsonb, jsonb) from public, anon;
grant execute on function public.patch_property(uuid, jsonb, jsonb, jsonb, jsonb) to authenticated;

-- Markeren dat de gegevens door een mens zijn gecontroleerd (voorwaarde voor generatie)
create or replace function public.mark_property_checked(p_property_id uuid, p_checked boolean)
returns timestamptz
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_at timestamptz;
begin
  update public.properties set data_checked_at = case when p_checked then now() else null end
  where id = p_property_id and deleted_at is null
  returning data_checked_at into v_at;
  if not found then
    raise exception 'Woning niet gevonden of geen rechten' using errcode = '42501';
  end if;
  return v_at;
end;
$$;
revoke execute on function public.mark_property_checked(uuid, boolean) from public, anon;
grant execute on function public.mark_property_checked(uuid, boolean) to authenticated;
