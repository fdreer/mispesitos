// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"

import { AuthForm } from "@/components/auth-form"

/**
 * Las dos fronteras del framework, como en `movement-form.test.tsx`: el
 * cliente de better-auth (que pega contra `/api/auth` apenas se lo llama) y el
 * router de Next. Lo que se prueba acá es lo que hace este componente con lo
 * que esas dos devuelven.
 */
const signIn = { email: vi.fn(), social: vi.fn() }
const signUp = { email: vi.fn() }
const push = vi.fn()
const refresh = vi.fn()

vi.mock("@/auth-client", () => ({
  signIn: { email: (...args: unknown[]) => signIn.email(...args), social: (...args: unknown[]) => signIn.social(...args) },
  signUp: { email: (...args: unknown[]) => signUp.email(...args) },
}))

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, refresh }),
}))

beforeEach(() => {
  vi.clearAllMocks()
})

afterEach(cleanup)

/** Completa correo y contraseña y manda el formulario. */
async function enviar(email = "franco@ejemplo.com", password = "12345678") {
  fireEvent.change(screen.getByLabelText("Correo"), { target: { value: email } })
  fireEvent.change(screen.getByLabelText("Contraseña"), { target: { value: password } })
  await act(async () => {
    fireEvent.submit(screen.getByRole("button", { name: /Entrar|Crear cuenta/ }).closest("form")!)
  })
}

describe("AuthForm", () => {
  it("en modo login manda correo y contraseña, y navega al dashboard", async () => {
    signIn.email.mockResolvedValue({ error: null })
    render(<AuthForm mode="login" googleEnabled={false} />)

    await enviar()

    expect(signIn.email).toHaveBeenCalledWith({
      email: "franco@ejemplo.com",
      password: "12345678",
    })
    expect(push).toHaveBeenCalledWith("/dashboard")
    expect(refresh).toHaveBeenCalled()
  })

  it("en modo registro manda también el nombre, por signUp", async () => {
    signUp.email.mockResolvedValue({ error: null })
    render(<AuthForm mode="registro" googleEnabled={false} />)

    fireEvent.change(screen.getByLabelText("Nombre"), { target: { value: "Franco" } })
    await enviar()

    expect(signUp.email).toHaveBeenCalledWith({
      name: "Franco",
      email: "franco@ejemplo.com",
      password: "12345678",
    })
    expect(signIn.email).not.toHaveBeenCalled()
  })

  it("muestra el mensaje del error y no navega", async () => {
    signIn.email.mockResolvedValue({ error: { message: "Credenciales inválidas." } })
    render(<AuthForm mode="login" googleEnabled={false} />)

    await enviar()

    expect(screen.getByText("Credenciales inválidas.")).toBeTruthy()
    expect(push).not.toHaveBeenCalled()
  })

  it("un error sin mensaje igual dice algo: nunca un formulario mudo", async () => {
    signIn.email.mockResolvedValue({ error: {} })
    render(<AuthForm mode="login" googleEnabled={false} />)

    await enviar()

    expect(screen.getByText("No pudimos completar la operación.")).toBeTruthy()
  })

  it("el error del intento anterior no sobrevive al siguiente", async () => {
    signIn.email.mockResolvedValue({ error: { message: "Credenciales inválidas." } })
    render(<AuthForm mode="login" googleEnabled={false} />)
    await enviar()
    expect(screen.getByText("Credenciales inválidas.")).toBeTruthy()

    signIn.email.mockResolvedValue({ error: null })
    await enviar()

    expect(screen.queryByText("Credenciales inválidas.")).toBeNull()
  })

  /**
   * El camino de Google no está verificado contra el proveedor real (falta de
   * credenciales, ver docs/PENDIENTES.md), así que lo que sí se puede fijar es
   * que el resultado se mira: era el único `onClick` de la app que lo
   * descartaba, y con Google caído el botón no hacía nada visible.
   */
  it("con Google fallando muestra el error en vez de quedarse mudo", async () => {
    signIn.social.mockResolvedValue({ error: { message: "Google dijo que no." } })
    render(<AuthForm mode="login" googleEnabled />)

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Continuar con Google" }))
    })

    expect(signIn.social).toHaveBeenCalledWith({ provider: "google", callbackURL: "/dashboard" })
    expect(screen.getByText("Google dijo que no.")).toBeTruthy()
  })

  it("sin Google configurado, el botón no está", () => {
    render(<AuthForm mode="login" googleEnabled={false} />)
    expect(screen.queryByRole("button", { name: "Continuar con Google" })).toBeNull()
  })
})
