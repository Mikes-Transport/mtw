# Dashboard: simple maintenance guide

The Webflow page provides the existing tool panels. `js/navigation/dashboard-navigation.js` loads `js/navigation/dashboard-shell.js`, which assembles those panels and the existing tool navigation into the dashboard interface. Tool behavior and data remain in their current modules.

## Change the dashboard interface

The shell is created by `js/navigation/dashboard-shell.js`; update its structure there. Shared layout and responsive styles are in `styles/admin-dashboard.css`.

- The color variables at the top control the dashboard palette.
- The shell reuses the existing Webflow tool panels and navigation hooks; it does not replace tool data or actions.
- Keep A4 paper and barcode label dimensions in `js/inventory/barcodes.js` unchanged when editing the dashboard shell.

## Manage navigation (Developers)

Open **Developer Tools** in the dashboard to edit existing navigation names, descriptions, role access, and visibility, or add a new navigation item. Changes are saved in the Firestore `dashboard-tools` collection. Disabling an item hides it without deleting its settings or data.

A new item creates a safe placeholder page; it does not create working business logic. To make it functional, a developer still needs to add a panel and connect the JavaScript. Keep the ID lowercase with hyphens and never change an existing tool's ID, because it connects the menu to the tool panel.

The manager only changes dashboard navigation configuration. Existing tool data and business actions remain in their current modules. If saved settings cannot load, the built-in tools remain available and an error is logged; saving requires the dashboard database connection.

## Remove the retired Custom Elements tool

The AI Custom Elements editor is disabled in the dashboard. Its old script file is a small compatibility shim that hides any old Webflow menu item or panel. Existing saved or published custom-element data is not deleted.
