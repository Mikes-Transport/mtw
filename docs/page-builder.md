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

- **Table**: **Rows come from** either *Rows I type in here* (column cards with a heading
  each, **+ Add column**, and row cards with a box per column, **+ Add row**; drag by the
  handle to reorder) or *A data table*, which works like a Records list (columns to show,
  editable columns, search, delete, add rows, colours). Settings for lists, tables and
  card lists are folded into **Data**, **How it looks**, **What people can do** and
  **Colours** (click a heading to open it); every block's spacing / border is under **Box
  style**.
- **Input**: short/long text, number, date, dropdown or yes/no. **Save into** points it
  at a data table field (its type, choices and required come from the field).
- **Records list**: a data table's records, live, with search and an optional Delete
  button (nobody / Managers / everyone). **Columns people can change right here** turns
  columns into dropdowns / boxes that save in place (everyone or Managers only).
  **People can add rows here** (everyone who can see the tool, or Managers only) adds a
  **+ Add row** button that adds a blank row straight into the table (like Manage data);
  its cells are boxes / dropdowns to fill in, each saved as it's changed.
- **Colours** (Table, Records list, Card list from a table, Number tile): each rule reads
  *If [column] is [equal to] [value]* → **Colour it** Red / Amber / Green / Blue / Grey
  (or **Pick my own colours**), for the whole row or just that cell. Number tiles colour
  by their number. The top rule that matches wins. To colour by time, use a Timer field:
  *If Waiting time is more than 30* → Red.
- **Number tile**: a typed value, a live count of a table's records (optionally
  only where a field equals a value), or **a timer** that **Counts from**:
  - *When the page opens*: a stopwatch (or only with a **Start a timer** step; **Pause** /
    **Reset** steps too).
  - *When something last happened in a data table*: time since the newest record was
    added, or, with *Only records where Status is Done*, since the last record became Done.
  - *A date / time* (`2026-12-24 17:00`, `17:00` for today, or `{element}`), counting up
    from it or down to it.

  Shown as `2h 5m` or `02:05:00`. Steps and colour rules see a timer as whole minutes.

## Element names

Every block has an **Element name** (e.g. `order_number`), set automatically and
renameable. Steps choose elements from a list by name, and any step text can show a
value with `{order_number}` (the **Insert value** picker adds it). Also `{user}`,
`{today}`, `{now}`. Renaming an element updates the steps that use it.

## Automations

Steps that start on their own. With nothing selected on the page, the right panel's
**Automations** section has **When the page opens** plus **+ Add an automation**:
**Every few seconds** (5+), **When a data table changes** (added / changed / deleted /
any; the record is `{record.field}`), **When a popup opens**, **When a popup closes**,
**When a record has been a value for a while** (e.g. Status is Waiting for 30 minutes;
runs once per record each time it gets that value, for each person who has the tool open
when it crosses the time) and **When a countdown ends**.
A popup's settings also have **Steps when it opens / closes**. Inputs can run their steps
**while typing** (after a short pause) instead of when changed. Automations run in the
builder's Preview too (without writing).

## Hidden at start

Tick **Hidden at start** under an element's name to hide it when the page opens (it
shows faded with a tag in the builder). A **Show an element** step reveals it.

## When -> Do steps

The right panel shows a short outline of an element's steps; **Edit steps** opens the
full-width Steps panel (step types on the left, grouped, each with a one-line
description; the list on the right). **Done** or Esc goes back to the page.

- **When**: any block is clicked (headings, text, lists, notices, cards, number tiles,
  images, tables, dividers, spacers, embeds' frames), a button is clicked, an input
  changes, a records row or card is clicked, or the page opens (select nothing on the
  page to edit that list). A block with no steps isn't clickable.
- **Do** (in order; drag steps in from the chips, drag cards to reorder or into an If's
  Then/Else): Save inputs to a table, Show a message, Ask to confirm, Clear inputs, Set an
  input, Set an element's text, Show/Hide an element, If / then / else (equal to, not
  equal to, containing, empty, not empty, more than, less than; numbers compare as
  numbers, text ignores case), Stop, Open a dashboard tool, Open a web address.
- Save checks required fields first and stops with a message if any are empty.

## Popups

Popups are built like pages. **Popups** tab -> **+ New popup** (or **+ Create a new popup**
in any popup dropdown), then click a popup to open it on the canvas ("Editing popup ...").
Drag in sections (1-4 columns) and blocks exactly as on the page; **Back to the page**
(or Esc) returns. With nothing selected, the right panel has the popup's name, title,
width (small / medium / large / full), which buttons open it, and Delete popup.

Every button has an **Opens a popup** dropdown (runs after its steps). On the page a popup
is hidden until opened; it closes with its X, Esc, clicking outside, or a **Close a popup**
step. Pages saved with the older "section shown as a popup" convert automatically.

## Card lists, row and card clicks

**Card list** "Cards come from":
- **Cards I type in here**: add, edit, reorder and delete cards (title, text, small note)
  in the right panel. No data table needed.
- **Cards people add (saved to Firebase)**: the builder makes the list its own table, an
  Add card popup (an input per field + Save card) and a **+ Add card** button. Edit
  **Card fields** in the list's settings; the popup keeps in step. Pick a different
  **Add card popup** to move the form there. Each card list has its own table and popup.
- **An existing data table**: show any table's records.

Lists from Firebase show live (title field, text field, extra fields, 1-4 per row,
search, delete permissions). Card lists and Records lists have
**When a card/row is clicked, do** steps: those steps can use the clicked record as
`{record.field}` in text and `record.field` in If, and add **Delete this record**.

## Card designs

**Design cards** on a card list opens the card designer: drag in parts (Field value, Text
with `{record.field}`, Badge, Image, Button, Added by / when, Divider, Spacer), reorder them, and set each
part's size, weight, colour, alignment, field name label, and "Next to the previous part"
(same line). **Card look** sets background, accent strip, border, corners, spacing and
shadow. The preview uses a real record when there is one.

- **Image**: a web address typed in, or a field holding one (http/https only). Uploading
  pictures isn't built yet.
- **Field value** can be **People can change it on the card**: a dropdown / box that
  saves in place (the list's "Who can change editable card fields" decides who).
- **Button**: **Edit this card** (fills its popup; Save then updates that record instead of
  adding; closing without saving cancels the edit), **Delete this card** (asks first), or
  **Run my steps** (with the card's values). **Who sees it**: everyone or Managers only.
- Steps also have **Edit this record** and Save's "Saves as" (update the record being
  edited, or always add new). Each card list has its own
design; **Use the standard look** removes it.

## Export and import

- **Export a table**: downloads the table as CSV (opens in Excel), with Added/Added by.
  Cells starting with = + - @ get a leading ' so Excel won't treat them as formulas.
- **Import into a table**: pick a CSV (up to 5 MB, 2000 rows). Columns match fields by
  name or key (any case); a preview shows the matches, the first rows, and rows that will
  be skipped (missing required values, bad numbers). Then it adds the rows.

**Add a card board for this table** (Data tab) builds a heading, + Add / Export / Import
buttons, a card list, and an Add popup form (save, message, clear, close).

The builder's **Preview** runs everything: saved, edited, imported and deleted records show straight away in the preview only; nothing is written to Firebase, and they disappear when you go back to editing.

## Manage data

Managers can type data straight into a tool's tables: **Manage data** on the live tool
(next to Edit page), or **Open records** on a table in the builder's Data tab. A tab per
table, a row per record, a column per field; click a cell to edit (saved when you leave
it, checked like a form), **+ Add row**, Delete (asks first), search, Import and Export.
Records added by people using the tool appear live.

## Data tables

**Data** tab → **+ New data table**. Fields have a name, type (short/long text, number, image web address,
date, dropdown, yes/no), required, and choices. A field's saved key (shown under it)
never changes, so renaming is safe. **Add a form and list for this table** builds inputs
for every field, a Save button (save → message → clear) and a records list.

A **Timer** field is filled in by nobody: it ticks by itself wherever the table shows
(lists, tables, cards, Manage data). It **Counts from** when the row was added, or from
another field: either the date / time in it (e.g. time since Pickup; a future date shows
`in 2h 5m`) or when someone last changed it. It stays blank until that field has a value,
and can count **only while** that field has a value (e.g. a
*Waiting time* that counts while Status is Waiting and goes blank once Served). Steps and
colour rules see it as minutes. It isn't saved, exported as its current time, and skipped
by forms and imports.

Records live in Firestore `dashboard-data-<tool id>-<table id>` with the field keys plus
`_createdAt` and `_createdBy`, plus `_since_<field>` (when that field last changed; used
by timers and timed colour rules; older records fall back to when they were added).
Deleting a table in the builder doesn't delete them.

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
