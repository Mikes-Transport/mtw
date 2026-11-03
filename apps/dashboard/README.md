# Dashboard: simple maintenance guide

The dashboard page layout is managed in Webflow. Its behavior and shared styling live in this folder.

## Change the look

Edit `styles/admin-dashboard.css`.

- The color variables at the top control the shared dashboard palette.
- Tool data and actions live in the tool's JavaScript, not in this stylesheet.
- The shared top navigation and updates timeline are styled here; changing colors or spacing does not change saved data.

## Manage navigation (Developers)

Open **Developer Tools** in the dashboard to edit existing navigation names, descriptions, role access, and visibility, or add a new navigation item. Changes are saved in the Firestore `dashboard-tools` collection. Disabling an item hides it without deleting its settings or data.

A new item creates a safe placeholder page; it does not create working business logic. To make it functional, a developer still needs to add a panel and connect the JavaScript. Keep the ID lowercase with hyphens and never change an existing tool's ID, because it connects the menu to the tool panel.

The manager only changes dashboard navigation configuration. Existing tool data and business actions remain in their current modules. If saved settings cannot load, the built-in tools remain available and an error is logged; saving requires the dashboard database connection.

## Remove the retired Custom Elements tool

The AI Custom Elements editor is disabled in the dashboard. Its old script file is a small compatibility shim that hides any old Webflow menu item or panel. Existing saved or published custom-element data is not deleted.
