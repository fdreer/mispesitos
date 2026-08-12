// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"

import { SettingsForm } from "@/components/settings-form"

/**
 * Las dos fronteras de siempre (ver `movement-form.test.tsx`): la Server
 * Action, que importa `@/db/client` y abre una conexión apenas se la importa,
 * y el router de Next.
 */
const saveSettings = vi.fn()
const push = vi.fn()
const refresh = vi.fn()

vi.mock("@/server/actions/settings", () => ({
  saveSettings: (...args: unknown[]) => saveSettings(...args),
}))

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, refresh }),
}))

/** Dos APIs de puntero que jsdom no implementa y Radix usa. */
Element.prototype.hasPointerCapture ??= () => false
Element.prototype.scrollIntoView ??= () => {}

const DEFAULTS = {
  initialBalanceArs: "1000",
  initialBalanceUsd: "0",
  initialBalanceUsdRate: "0",
  initialBalanceDate: "2026-08-10",
  preferredRate: "blue",
}

function montar(redirectTo?: string) {
  return render(
    <SettingsForm defaults={DEFAULTS} redirectTo={redirectTo} submitLabel="Guardar" />,
  )
}

async function guardar() {
  await act(async () => {
    fireEvent.submit(screen.getByRole("button", { name: "Guardar" }).closest("form")!)
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  saveSettings.mockResolvedValue({ ok: true })
})

afterEach(cleanup)

describe("SettingsForm", () => {
  it("guardar deja el cartel de éxito", async () => {
    montar()
    await guardar()

    expect(screen.getByRole("status").textContent).toBe("Guardado.")
  })

  /*
   * El motivo por el que `saved` existe aparte de `state.ok`: el estado de
   * `useActionState` sobrevive hasta el próximo submit, así que sin esto el
   * cartel verde se quedaba al lado de un valor ya editado y sin guardar.
   * Los tres caminos que lo apagan son distintos y por eso van los tres.
   */
  it("editar un campo de texto lo apaga", async () => {
    montar()
    await guardar()

    fireEvent.change(screen.getByLabelText("¿Cuántos pesos tenés hoy?"), {
      target: { value: "2000" },
    })

    expect(screen.queryByRole("status")).toBeNull()
  })

  it("elegir otra fecha en el calendario lo apaga", async () => {
    montar()
    await guardar()

    fireEvent.click(screen.getByRole("button", { name: /^Desde qué fecha:/ }))
    fireEvent.click(screen.getByRole("button", { name: "jueves, 20 de agosto de 2026" }))

    expect(screen.queryByRole("status")).toBeNull()
    // Y el valor que viaja al servidor es el nuevo, no el default.
    expect(
      document.querySelector<HTMLInputElement>('input[name="initialBalanceDate"]')?.value,
    ).toBe("2026-08-20")
  })

  it("elegir otro dólar de referencia lo apaga", async () => {
    montar()
    await guardar()

    fireEvent.click(screen.getByLabelText("¿Qué dólar usás de referencia?"))
    await act(async () => {
      fireEvent.click(screen.getByRole("option", { name: "MEP" }))
    })

    expect(screen.queryByRole("status")).toBeNull()
  })

  it("un error se muestra y no deja el cartel de éxito", async () => {
    saveSettings.mockResolvedValue({ ok: false, message: "No pudimos guardar los ajustes." })
    montar()
    await guardar()

    expect(screen.getByText("No pudimos guardar los ajustes.")).toBeTruthy()
    expect(screen.queryByRole("status")).toBeNull()
  })

  /**
   * En /onboarding el éxito se ve porque la pantalla se va a /dashboard: ahí
   * el cartel sobra y no tiene que salir.
   */
  it("con redirectTo navega y no muestra el cartel", async () => {
    montar("/dashboard")
    await guardar()

    expect(push).toHaveBeenCalledWith("/dashboard")
    expect(screen.queryByRole("status")).toBeNull()
  })
})
