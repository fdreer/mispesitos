// @vitest-environment jsdom

import { afterEach, describe, expect, it } from "vitest"
import { cleanup, render } from "@testing-library/react"

import Loading from "@/app/(app)/loading"

afterEach(cleanup)

describe("Loading", () => {
  it("renderiza esqueletos con forma de tarjeta para móvil y bloque de escritorio", () => {
    const { container } = render(<Loading />)
    const root = container.firstElementChild as HTMLElement

    expect(root.getAttribute("aria-busy")).toBe("true")
    const mobileCards = container.querySelector(".sm\\:hidden")
    const desktopBlock = container.querySelector(".sm\\:block")
    expect(mobileCards).toBeTruthy()
    expect(mobileCards?.children.length).toBe(4)
    expect(desktopBlock).toBeTruthy()
  })
})
