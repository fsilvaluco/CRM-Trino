# Configuración de Supabase Storage para Finanzas

## Error: "new row violates row-level security policy"

Este error ocurre cuando intentas subir un comprobante pero el bucket de storage no tiene las políticas RLS configuradas.

## Solución: Configurar bucket y políticas RLS

### Paso 1: Crear el bucket 'finances' (si no existe)

1. Ve a **Supabase Dashboard** → **Storage**
2. Clic en **New Bucket** o **Create Bucket**
3. Configuración:
   - **Name:** `finances`
   - **Public:** ❌ **NO** (debe ser privado)
   - **File size limit:** `10 MB`
   - **Allowed MIME types:** `application/pdf, image/jpeg, image/png, image/webp` (opcional)
4. Clic en **Create Bucket**

### Paso 2: Ejecutar migración de políticas RLS

1. Ve a **Supabase Dashboard** → **SQL Editor**
2. Copia y pega el contenido de:
   ```
   scripts/migrations/002_finances_storage_setup.sql
   ```
3. Ejecuta el script (clic en **Run**)

### ¿Qué hace la migración?

La migración crea 4 políticas de seguridad para el bucket `finances`:

1. **Upload** - Los usuarios pueden subir archivos a su carpeta personal:
   - Ruta permitida: `receipts/{user_id}/*`
   - Solo archivos en su propia carpeta

2. **View** - Los miembros de la organización pueden ver todos los archivos del bucket
   - Cualquier usuario con membership en `organization_members`

3. **Delete** - Los usuarios pueden eliminar solo sus propios archivos
   - Solo archivos en `receipts/{user_id}/*`

4. **Update** - Los usuarios pueden actualizar/reemplazar sus propios archivos
   - Solo archivos en `receipts/{user_id}/*`

## Verificación

Después de ejecutar la migración, verifica que las políticas existen:

```sql
-- Ver políticas de storage
SELECT * FROM pg_policies 
WHERE schemaname = 'storage' 
  AND tablename = 'objects' 
  AND (policyname LIKE '%finances%' OR policyname LIKE '%Users can%');

-- Ver configuración del bucket
SELECT * FROM storage.buckets WHERE name = 'finances';
```

Deberías ver 4 políticas creadas.

## Probar el upload

1. Ve a **Finanzas** en el CRM
2. Clic en **Nuevo Comprobante**
3. Rellena formulario y **sube un archivo** (PDF, JPG, PNG)
4. Si las políticas están bien configuradas, el archivo se subirá exitosamente

## Notas

- **Encargado del gasto:** Puede ser cualquier usuario del proyecto (selector) o un nombre externo (campo de texto)
- **Archivos privados:** Los archivos NO son públicos - solo visibles para miembros de la org
- **URLs firmadas:** La app genera URLs temporales (1 hora) para visualizar los comprobantes
- **Ruta de archivos:** `receipts/{user_id}/{timestamp}.{ext}`

## Troubleshooting

### Error: "Bucket 'finances' does not exist"
→ Crear el bucket primero (Paso 1)

### Error: "policy already exists"
→ Normal si re-ejecutas el script (usa `DROP POLICY IF EXISTS`)

### No puedo ver archivos de otros usuarios
→ Verifica que la política "Organization members can view files" existe y que el usuario tiene membership en `organization_members`

### Archivos muy pesados
→ El límite es 10 MB por archivo (configurado en el bucket)
