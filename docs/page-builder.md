# Page builder (custom navigation tools)

Managers build the page for any custom navigation item with drag and drop.

## Use it

1. **Manager Tools → Add navigation item**: give it an ID, name and roles, then save.
2. Press **Open page builder** (or open the item and press **Edit page**).
3. Drag blocks and section layouts from the left onto the page, or click one to add it
   after the selected block. Drag a block (or a section by its handle) to move it.
4. Click a block or section to edit it on the right: **Content** and **Look** (alignment,
   colours, text size, spacing, corners, border, shadow, and extra global CSS classes).
5. **Save draft** keeps your work without changing what people see. **Publish** shows the
   page in the tool straight away (open copies update live).

Undo/redo, Preview, and Desktop/Tablet/Phone widths are in the top bar. Shortcuts: Ctrl+Z,
Ctrl+Shift+Z, Ctrl+D duplicate, Delete, Alt+Up/Down, Esc, Ctrl+S (save draft).

## Blocks

Heading, Text, List, Notice, Button (open a web address or a dashboard tool), Card,
Number tile, Divider, Spacer, Table (rows of `a | b | c`), Image, Embed (https pages).
Sections have one to four columns; columns stack on narrow screens.

## Storage and safety

- Firestore `dashboard-tool-pages/{toolId}`: `{ draft, published, updatedAt, updatedBy,
  publishedAt, publishedBy }`.
- Everything loaded is checked by `sanitizePage` (`js/builder/page-core.js`): known block
  types only, length limits, http(s)/site-relative URLs only, whitelisted style values.
- Text is inserted as text (never HTML). Embeds are sandboxed iframes; pages from this
  site can't run scripts with access to the dashboard.
- Only Managers can open the builder. Like the rest of the dashboard this is a browser
  check; Firestore rules are what protect the data.

## Files

- `js/builder/page-core.js`: page model, edits, undo history, validation (Node-tested).
- `js/builder/page-render.js`: renders pages with the global CSS; mounts published pages.
- `js/builder/page-builder.js`: the editor (loaded only when a manager opens it).
- `styles/page-builder.css`: page and editor styles (uses the `--mtw-*` theme variables).

## Next stages

2. **When → Do actions and data**: form inputs, buttons that run action lists (save to a
   table, show a message, open a tool), and each tool's own data tables with lists/tables
   bound to them.
3. Extras: more templates, sharing a custom tool through share links.
