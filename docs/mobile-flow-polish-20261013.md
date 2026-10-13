# Narrow-screen navigation and checkout

This release follows the mobile hero fix. It allows long translated navigation labels to wrap without compressing icons, makes the shared header brand shrink within the available width, and uses one-column drawer links below 421px.

Checkout payment options and review details use one column below 421px. Large item totals can wrap. Dark-mode review labels, inactive steps and the add-address button use theme tokens. Portal headers can grow when their links wrap; title actions and support-message metadata no longer force one unbroken line.

Validation: existing shared-navigation and purchase-flow tests, production build with TypeScript, and diff whitespace check. The currently installed public drawer was opened and visually inspected before editing. No actual phone viewport or authenticated checkout was visually tested in this session. No payment, message, order, authentication rule or club calculation changes.
