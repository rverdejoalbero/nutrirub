-- NutriRub — esquema de sincronización
-- Pegar entero en el SQL Editor de Supabase y ejecutar. Se puede volver a
-- ejecutar sin miedo: no borra datos.
--
-- ---------------------------------------------------------------------------
-- Por qué una sola tabla y no una por cosa
--
-- La app es local-first: lee y escribe siempre en el móvil, y el servidor solo
-- guarda y reparte. Aquí nunca se consulta por nutriente ni se calcula nada,
-- así que no hace falta una columna por campo. Cada fila viaja entera dentro de
-- `contenido`, lo que tiene una ventaja concreta: añadir un campo nuevo a la
-- app no obliga a migrar el servidor ni deja a los móviles viejos rotos.
--
-- Lo que sí sale del JSON son las tres cosas que la sincronización necesita
-- mirar sin abrirlo: de quién es, cuándo cambió y si está borrado.
-- ---------------------------------------------------------------------------

create table if not exists public.datos (
  usuario_id     uuid   not null references auth.users (id) on delete cascade,
  id             uuid   not null,
  tipo           text   not null check (tipo in ('alimento', 'registro', 'objetivo')),
  -- Milisegundos desde 1970, igual que Date.now() en la app.
  actualizado_en bigint not null,
  -- Puesto = borrado. La fila sobrevive para que el borrado llegue a los demás
  -- dispositivos; si desapareciera, el otro móvil la volvería a subir creyendo
  -- que es nueva y reaparecería sola.
  borrado_en     bigint,
  contenido      jsonb  not null,

  -- Por usuario y no solo por id: si alguien importa la copia de otro, los ids
  -- coincidirían y una clave primaria global los haría chocar.
  primary key (usuario_id, id)
);

-- La única consulta que hace la app: "dame lo mío que cambió después de X".
create index if not exists datos_por_usuario_y_cambio
  on public.datos (usuario_id, actualizado_en);

-- ---------------------------------------------------------------------------
-- Seguridad
--
-- Esto es lo que de verdad impide que otra persona lea tu comida. No es una
-- comprobación en el navegador —esas se salta cualquiera abriendo las
-- herramientas de desarrollo—: la aplica PostgreSQL en cada consulta, aunque
-- quien pregunte tenga la clave pública de la app.
-- ---------------------------------------------------------------------------

alter table public.datos enable row level security;

drop policy if exists "cada uno lee lo suyo"     on public.datos;
drop policy if exists "cada uno inserta lo suyo" on public.datos;
drop policy if exists "cada uno cambia lo suyo"  on public.datos;
drop policy if exists "cada uno borra lo suyo"   on public.datos;

create policy "cada uno lee lo suyo"
  on public.datos for select
  using (auth.uid() = usuario_id);

create policy "cada uno inserta lo suyo"
  on public.datos for insert
  with check (auth.uid() = usuario_id);

create policy "cada uno cambia lo suyo"
  on public.datos for update
  using (auth.uid() = usuario_id)
  with check (auth.uid() = usuario_id);

create policy "cada uno borra lo suyo"
  on public.datos for delete
  using (auth.uid() = usuario_id);

-- ---------------------------------------------------------------------------
-- La hora del servidor
--
-- `actualizado_en` viene del móvil y sirve para decidir quién gana cuando algo
-- se toca en dos sitios. Pero NO sirve para preguntar "¿qué ha cambiado desde
-- mi última sincronización?": dos móviles con el reloj desajustado se saltarían
-- cambios sin enterarse, y un móvil atrasado subiría filas que el otro nunca
-- pediría.
--
-- Para eso está `subido_en`, que la pone PostgreSQL. Es la misma para todos los
-- dispositivos y siempre avanza.
-- ---------------------------------------------------------------------------

alter table public.datos
  add column if not exists subido_en timestamptz not null default now();

create index if not exists datos_por_usuario_y_subida
  on public.datos (usuario_id, subido_en);

-- Sin esto, subido_en solo se pondría al insertar y una fila modificada
-- pasaría desapercibida para los demás dispositivos.
create or replace function public.marcar_subida()
returns trigger
language plpgsql
as $$
begin
  new.subido_en := now();
  return new;
end;
$$;

drop trigger if exists datos_marcar_subida on public.datos;
create trigger datos_marcar_subida
  before insert or update on public.datos
  for each row execute function public.marcar_subida();
