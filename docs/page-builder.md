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

Heading, Text, List, Notice, Button, Input, Card, Number tile, Divider, Spacer,
Table, Records list, Image, Embed (https pages). Sections have one to four columns;
columns stack on narrow screens.

- **Table**: column cards (a heading each, **+ Add column**) and row cards (a box per
  column, **+ Add row**). Drag cards by their handle to reorder.
- **Input**: short/long text, number, date, dropdown or yes/no. **Save into** points it
  at a data table field (its type, choices and required come from the field).
- **Records list**: a data table's records, live, with search and an optional Delete
  button (nobody / Managers / everyone).
- **Number tile**: a typed value, or a live count of a table's records (optionally
  only where a field equals a value).

## Element names

Every block has an **Element name** (e.g. `order_number`), set automatically and
renameable. Steps choose elements from a list by name, and any step text can show a
value with `{order_number}` (the **Insert value** picker adds it). Also `{user}`,
`{today}`, `{now}`. Renaming an element updates the steps that use it.

## Hidden at start

Tick **Hidden at start** under an element's name to hide it when the page opens (it
shows faded with a tag in the builder). A **Show an element** step reveals it.

## When -> Do steps

The right panel shows a short outline of an element's steps; **Edit steps** opens the
full-width Steps panel (step types on the left, grouped, each with a one-line
description; the list on the right). **Done** or Esc goes back to the page.

- **When**: a button is clicked, an input changes, or the page opens (select nothing on
  the page to edit that list).
- **Do** (in order; drag steps in from the chips, drag cards to reorder or into an If's
  Then/Else): Save inputs to a table, Show a message, Ask to confirm, Clear inputs, Set an
  input, Set an element's text, Show/Hide an element, If / then / else (equal to, not
  equal to, containing, empty, not empty, more than, less than; numbers compare as
  numbers, text ignores case), Stop, Open a dashboard tool, Open a web address.
- Save checks required fields first and stops with a message if any are empty.

## Data tables

**Data** tab → **+ New data table**. Fields have a name, type (short/long text, number,
date, dropdown, yes/no), required, and choices. A field's saved key (shown under it)
never changes, so renaming is safe. **Add a form and list for this table** builds inputs
for every field, a Save button (save → message → clear) and a records list.

Records live in Firestore `dashboard-data-<tool id>-<table id>` with the field keys plus
`_createdAt` and `_createdBy`. Deleting a table in the builder doesn't delete them.

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
- `js/builder/page-render.js`: renders pages with the global CSS; mounts published pages
  (and runs their When the page opens steps).
- `js/builder/page-builder.js`: the editor (loaded only when a manager opens it).
- `styles/page-builder.css`: page and editor styles (uses the `--mtw-*` theme variables).

## Files (stage 2)

- `js/builder/page-runtime.js`: input values, live table subscriptions, the step runner.

## Next

- Editing existing records, filters on lists, more triggers (row clicked), templates,
  sharing a custom tool through share links.
