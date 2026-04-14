# Importar Contactos desde CSV

Ayuda al usuario a importar contactos desde un archivo CSV o spreadsheet.

## Proceso

1. Pregunta al usuario la ruta del archivo CSV que quiere importar.

2. Lee el archivo:
```bash
head -20 <ruta_del_archivo>
```

3. Analiza las columnas y mapea a los campos del CRM:
   - name (requerido)
   - email
   - phone
   - company
   - source
   - temperature (cold/warm/hot)
   - notes

4. Obtén el `projectId` del proyecto activo del usuario:
```bash
curl -s http://localhost:3000/api/projects | jq '.[0].id'
```
Si hay varios proyectos, muéstralos al usuario y pide que elija.

5. Muestra al usuario el mapeo propuesto y pide confirmacion.

6. Para cada fila, crea el contacto via API:
```bash
curl -s -X POST http://localhost:3000/api/contacts \
  -H "Content-Type: application/json" \
  -d '{"name":"...","email":"...","phone":"...","company":"...","source":"...","temperature":"cold","notes":"...","projectId":"<PROJECT_ID>"}'
```

Alternativamente, usa el endpoint de importacion masiva (requiere `projectId`):
```bash
curl -s -X POST http://localhost:3000/api/import \
  -H "Content-Type: application/json" \
  -d '{"projectId": "<PROJECT_ID>", "contacts": [...]}'
```

6. Reporta resultados:
   - Total de contactos importados exitosamente
   - Contactos que fallaron (duplicados, datos invalidos)
   - Sugerencias para los que fallaron

## Notas
- Soporta CSV con separadores: coma, punto y coma, tab
- Detecta encoding automaticamente
- Si no hay columna de temperatura, clasifica todos como "cold"
- Si no hay columna de source, usa "import" como fuente
