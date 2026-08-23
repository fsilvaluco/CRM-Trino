-- Eventos con plata "no rastreada" en la app: pasaron antes de que se
-- empezara a llevar el detalle de costos acá (todo eso vive en Excel
-- aparte). Para esos, fee/ticket_income/expenses quedan en 0 -- mostrar
-- "Utilidad" calculada ahi da un numero falso (ingresos sin sus costos
-- reales), asi que se marca con este flag para que la UI muestre
-- "Sin información" en vez de un numero enganoso.
alter table shows
  add column if not exists financials_untracked boolean not null default false;
