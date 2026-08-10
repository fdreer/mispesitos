/**
 * Verificación pura del rol de conexión: dado lo que devolvió (o no devolvió)
 * la consulta a pg_roles, decide si el rol de conexión saltea RLS y por qué.
 *
 * Vive en src/lib y no en src/db, aunque es un control de la base, por dos
 * razones que van juntas:
 *
 * 1. src/db/client.ts importa "server-only", que tira un error a propósito
 *    apenas se lo importa fuera del bundler de Next (ver su propio
 *    comentario). Un módulo que necesite `db` para armar el ejecutor real no
 *    se puede cargar desde un test unitario común.
 * 2. vitest.config.ts excluye src/db/** de la suite unitaria (`pnpm test`):
 *    esos tests pegan contra la base real y van por `pnpm test:db`. Los tests
 *    de esta verificación NO tocan la base —son un doble que devuelve datos
 *    fijos—, así que tienen que poder correr con `pnpm test`, y por lo tanto
 *    el archivo de test no puede vivir bajo src/db/.
 *
 * La consulta a pg_roles en sí (con `db.execute`) se queda en client.ts, que
 * es quien tiene acceso a `db`. Acá sólo vive la decisión: qué hacer con lo
 * que esa consulta devuelve.
 */
export type FilaRolPg = {
  rolbypassrls: boolean
  rolsuper: boolean
}

export type EjecutorConsultaRol = () => Promise<FilaRolPg[]>

export async function verificarRolNoSalteaRls(
  ejecutarConsulta: EjecutorConsultaRol,
): Promise<void> {
  const [fila] = await ejecutarConsulta()

  if (!fila) {
    throw new Error(
      "No se pudo verificar el rol de conexión a la base: la consulta a pg_roles no " +
        "devolvió ninguna fila para el rol actual (current_user). Una verificación de " +
        "seguridad que no pudo confirmar nada no puede dejar pasar la conexión. Revisá " +
        "que el rol de DATABASE_URL exista en pg_roles.",
    )
  }

  if (fila.rolbypassrls || fila.rolsuper) {
    const razon = fila.rolsuper
      ? "es superusuario (rolsuper = true)"
      : "tiene el atributo BYPASSRLS"

    throw new Error(
      `El rol con el que la app conecta a la base ${razon}: las policies de RLS no se ` +
        "evalúan, así que cualquier consulta que se olvide de filtrar por usuario " +
        "devuelve datos de todos los usuarios y nada falla a la vista. DATABASE_URL " +
        "tiene que ser la cadena del rol de aplicación (`app_user`), sin BYPASSRLS y sin " +
        "ser superusuario. La del dueño (`postgres`, que sí tiene ambos) va únicamente " +
        "en MIGRATION_DATABASE_URL, que es la que usan las migraciones.",
    )
  }
}
