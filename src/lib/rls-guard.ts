export type FilaRolPg = {
  rolbypassrls: unknown
  rolsuper: unknown
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

  if (typeof fila.rolbypassrls !== "boolean" || typeof fila.rolsuper !== "boolean") {
    throw new Error(
      "No se pudo verificar el rol de conexión a la base: la consulta a pg_roles devolvió " +
        `una fila sin los atributos booleanos esperados (${JSON.stringify(fila)}). Una ` +
        "verificación de seguridad que no pudo confirmar nada no puede dejar pasar la " +
        "conexión. Revisá la consulta de client.ts contra pg_roles.",
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
