<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.

Use TDD for every feature in this app: write or update the tests first, confirm the expected failure when possible, then implement the minimal code needed to pass. API and business behavior use Vitest, components use React Testing Library, and critical user journeys use Playwright.

The POS must support common cash-register peripherals: ESC/POS receipt printer, USB/HID barcode scanner in keyboard mode, and cash drawer opened through printer pulse or configured direct interface. Hardware failures after a sale is committed must not roll back the sale.
<!-- END:nextjs-agent-rules -->
