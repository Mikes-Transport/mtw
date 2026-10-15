'use strict';

console.log("ABVABA22");

(function () {

const {
db,
$,
$$,
collection,
getDocs,
addDoc
} = window.MTW;

const LABEL = '.barcode-text-input-wrapper';

const TEMPLATES = {
standard: {
name: 'x2 Label Template',
panel: '.standard-barcode',
grid: '.barcode-standard-grid',
capacity: 2
},

medium: {
name: 'x8 Label Template',
panel: '.medium-barcode',
grid: '.barcode-medium-grid',
capacity: 8
},

large: {
name: 'x10 Label Template',
panel: '.large-barcode',
grid: '.barcode-large-grid',
capacity: 10
},

xlarge: {
name: 'x30 Label Template',
panel: '.xlarge-barcode',
grid: '.barcode-xlarge-grid',
capacity: 30
}
};

const barcodeScriptUrl = document.currentScript && document.currentScript.src;
const localFontUrl = barcodeScriptUrl
? new URL('../../assets/fonts/IDAutomationHC39M%20Free%20Version.ttf', barcodeScriptUrl).href
: null;
const FONT_URLS = [
localFontUrl,
'https://raw.githack.com/Mikes-Transport/mtw/main/apps/dashboard/assets/fonts/IDAutomationHC39M%20Free%20Version.ttf',
'https://rawcdn.githack.com/Mikes-Transport/mtw/main/apps/dashboard/assets/fonts/IDAutomationHC39M%20Free%20Version.ttf',
'https://raw.githubusercontent.com/Mikes-Transport/mtw/main/apps/dashboard/assets/fonts/IDAutomationHC39M%20Free%20Version.ttf'
].filter(Boolean);

const DROPDOWN_OPEN_CLASS = 'barcode-dropdown-open';

const TEMPLATE_DEFAULTS = {

standard: {
partNumberSize: 115,
subtextSize: 43,
barcodeSize: 50
},

medium: {
partNumberSize: 50,
subtextSize: 20,
barcodeSize: 25
},

large: {
partNumberSize: 50,
subtextSize: 20,
barcodeSize: 20
},

xlarge: {
partNumberSize: 18,
subtextSize: 8,
barcodeSize: 13
}

};

const DEFAULTS = {
template: 'standard',
partNumber: '',
subtext: '',

showDate: false,
date: '',
dateHeadingSize: 40,
dateSubtextSize: 18,

showQty: false,
manualQty: 0,
qtyHeadingSize: 40,
qtySubtextSize: 18,

...TEMPLATE_DEFAULTS.standard
};

const state = {
current: null,
cards: []
};

let counter = 0;
let editing = null;
let ready = false;
let quickImportModal = null;
let csvModal = null;
let clearConfirmModal = null;

let barcodeHistory = [];
let selectedHistoryId = null;

let labelTemplates = [];
let saveTemplateModal = null;

const els = {};
const sources = {};

function getUserRole() {

try {

return String(
sessionStorage.getItem(
'mtw_admin_name'
) || ''
).trim();

} catch (error) {

return '';

}

}

function isKeyAccounts() {

return getUserRole() === 'KeyAccounts';

}

const ROLE_HIDE = {

Stores: [
'.barcode-import-card-wrapper',
'.label-save-template-wrapper',
'.label-select-template-wrapper'
],

Counter: [
'.barcode-import-card-wrapper',
'.label-save-template-wrapper',
'.label-select-template-wrapper'
],

Admin: [
'.label-save-template-wrapper',
'.label-select-template-wrapper'
],

KeyAccounts: [
'.barcode-import-card-wrapper'
],

Developer: []

};

function applyRoleVisibility() {

const role =
getUserRole();

const toHide =
ROLE_HIDE[role] ||
[
'.label-save-template-wrapper',
'.label-select-template-wrapper'
];

const allWrappers = [
'.barcode-import-card-wrapper',
'.barcode-quickimp-card-wrapper',
'.label-save-template-wrapper',
'.label-select-template-wrapper'
];

allWrappers.forEach(
selector => {

document
.querySelectorAll(
selector
)
.forEach(
el => {

if (
toHide.includes(
selector
)
) {

el.style.display =
'none';

} else {

el.style.removeProperty(
'display'
);

}

}
);

}
);

const hideImport =
toHide.includes(
'.barcode-import-card-wrapper'
);

const hideQuickImport =
toHide.includes(
'.barcode-quickimp-card-wrapper'
);

if (
els.importCSV
) {

if (hideImport) {

els.importCSV.style.display =
'none';

} else {

els.importCSV.style.removeProperty(
'display'
);

}

}

if (
els.quickImport
) {

if (hideQuickImport) {

els.quickImport.style.display =
'none';

} else {

els.quickImport.style.removeProperty(
'display'
);

}

}

}

function normalizeParts(data) {

const rawParts =
Array.isArray(
data.parts
) &&
data.parts.length
? data.parts
: [
{
partNumber:
data.partNumber ??
DEFAULTS.partNumber,
subtext:
data.subtext ??
DEFAULTS.subtext,
showBarcode:
typeof data.showBarcode === 'boolean'
? data.showBarcode
: !isKeyAccounts()
}
];

return rawParts.map(
part => ({
partNumber:
part.partNumber ??
'',
subtext:
part.subtext ??
'',
showBarcode:
typeof part.showBarcode === 'boolean'
? part.showBarcode
: !isKeyAccounts()
})
);

}

function syncTopLevelFromParts(card) {

const first =
(card.parts &&
card.parts[0]) ||
null;

card.partNumber =
first
? (first.partNumber ?? '')
: (card.partNumber ?? '');

card.subtext =
first
? (first.subtext ?? '')
: (card.subtext ?? '');

}

function getCardParts(card) {

if (
card &&
Array.isArray(
card.parts
) &&
card.parts.length
) {

return card.parts;

}

return [
{
partNumber:
(card &&
card.partNumber) ||
'',
subtext:
(card &&
card.subtext) ||
'',
showBarcode:
true
}
];

}

function getTemplateDefaults(template) {

return (
TEMPLATE_DEFAULTS[template] ||
TEMPLATE_DEFAULTS.standard
);

}

function getSystemDate() {

const date =
new Date();

const year =
date.getFullYear();

const month =
String(
date.getMonth() + 1
).padStart(
2,
'0'
);

const day =
String(
date.getDate()
).padStart(
2,
'0'
);

return (
year +
'-' +
month +
'-' +
day
);

}

function formatBarcodeDate(value) {

const raw =
String(
value || ''
).trim();

if (!raw) {
return '';
}

const match =
raw.match(
/^(\d{4})-(\d{2})-(\d{2})$/
);

if (match) {

return (
match[3] +
'/' +
match[2] +
'/' +
match[1]
);

}

const parsed =
new Date(raw);

if (
!Number.isNaN(
parsed.getTime()
)
) {

return parsed.toLocaleDateString(
'en-NZ',
{
day: '2-digit',
month: '2-digit',
year: 'numeric'
}
);

}

return raw;

}

function getSource(templateId) {

const config =
TEMPLATES[templateId] ||
TEMPLATES.standard;

if (sources[config.panel]) {
return sources[config.panel];
}

const panel =
document.querySelector(config.panel);

if (!panel) {
return null;
}

const page =
panel.querySelector(
'.barcode-page:not([data-generated])'
);

if (!page) {
return null;
}

const label =
page.querySelector(
LABEL + ':not(.barcode-card)'
);

if (!label) {
return null;
}

const pageCopy =
page.cloneNode(true);

const labelCopy =
label.cloneNode(true);

pageCopy.removeAttribute('id');
labelCopy.removeAttribute('id');

pageCopy
.querySelectorAll('[id]')
.forEach(
e => e.removeAttribute('id')
);

labelCopy
.querySelectorAll('[id]')
.forEach(
e => e.removeAttribute('id')
);

sources[config.panel] = {
page: pageCopy,
label: labelCopy
};

return sources[config.panel];

}

function cacheSources() {

Object.keys(TEMPLATES).forEach(
id => getSource(id)
);

}

function describe(el) {

const cs =
getComputedStyle(el);

const cls =
typeof el.className === 'string' &&
el.className.trim()
? '.' +
el.className.trim()
.split(/\s+/)
.join('.')
: '';

return (
el.tagName.toLowerCase() +
cls +
' [display:' +
cs.display +
' visibility:' +
cs.visibility +
' opacity:' +
cs.opacity +
' height:' +
Math.round(
el.getBoundingClientRect().height
) +
'px]'
);

}

function diagnose() {

console.group('[barcode] diagnose');

console.log(
'current template:',
state.current
);

console.log(
'barcode font faces:',
document.fonts
? [...document.fonts]
.filter(
f =>
f.family.replace(
/["']/g,
''
) === 'IDAutomationHC39M'
)
.map(f => f.status)
: 'document.fonts unavailable'
);

console.log(
'elements found:',
{
panel: !!els.panel,
pages: !!els.pages,
left: !!els.left,
menu: !!els.menu,
dropdown: !!els.dropdown,
importCSV: !!els.importCSV,
quickImport: !!els.quickImport,
clearWrapper: !!els.clearWrapper,
clear: !!els.clear,
historyPanel:
!!document.querySelector(
'.barcode-history-panel'
)
}
);

Object.entries(TEMPLATES).forEach(
([id, t]) => {

const panel =
document.querySelector(
t.panel
);

console.log(
id + ' ' + t.panel,
'| panel elements:',
document.querySelectorAll(
t.panel
).length,
'| page+label cached:',
!!sources[t.panel],
'| cards:',
state.cards.filter(
c => c.template === id
).length,
'| generated pages:',
panel
? panel.querySelectorAll(
'.barcode-page[data-generated]'
).length
: 0,
'| panel display:',
panel
? getComputedStyle(
panel
).display
: 'n/a'
);

}
);

const labels =
els.panel
? els.panel.querySelectorAll(
'.barcode-card'
)
: [];

console.log(
'labels rendered (.barcode-card):',
labels.length
);

const probe =
labels[0] || els.panel;

if (probe) {

console.log(
'chain from first label up to <html>:'
);

for (
let n = probe;
n && n !== document.documentElement;
n = n.parentElement
) {

console.log(
'   ' + describe(n)
);

}

}

console.groupEnd();

}

function unhide(el, display) {

if (!el) return;

if (
getComputedStyle(el).display ===
'none'
) {

el.style.setProperty(
'display',
display,
'important'
);

}

}

function findDropdown() {

const drop =
$('#barcode-drop');

if (!drop) {

return $(
'.db-list-dropdown-wrapper'
);

}

return (
drop.querySelector(
'.db-list-dropdown-wrapper'
) ||
drop.closest(
'.db-list-dropdown-wrapper'
) ||
(
drop.nextElementSibling &&
drop.nextElementSibling.matches(
'.db-list-dropdown-wrapper'
)
? drop.nextElementSibling
: null
) ||
$('.db-list-dropdown-wrapper')
);

}

function cache() {

els.panel =
$('.barcode-label-panels');

els.add =
$('.barcode-add-card-button');

els.print =
$('.barcode-print-card-button');

els.importCSV =
$('.barcode-import-card-button');

els.quickImport =
$('.barcode-quickimp-card-button');

els.clearWrapper =
$('.barcode-clear-card-wrapper');

els.clear =
$('.barcode-clear-card-button');

els.dropdown =
findDropdown();

els.pages =
$('.barcode-page-wrapper');

els.left =
$('.db-left-content');

els.menu =
$('.db-menu-list');

els.importWrapper =
$('.barcode-import-card-wrapper');

els.quickImportWrapper =
$('.barcode-quickimp-card-wrapper');

els.saveWrapper =
$('.label-save-template-wrapper');

els.saveButton =
$('.label-save-template-button') ||
(
els.saveWrapper
? els.saveWrapper.querySelector(
'button'
)
: null
) ||
els.saveWrapper;

els.templateWrapper =
$('.label-select-template-wrapper');

els.templateSelect =
getTemplateSelect();

applyRoleVisibility();

}

function openBarcodePanel() {

if (!els.panel) return;

els.panel.classList.add('open');

els.panel.style.removeProperty(
'display'
);

if (
getComputedStyle(
els.panel
).display === 'none'
) {

els.panel.style.setProperty(
'display',
'block',
'important'
);

}

}

function closeBarcodePanel() {

if (!els.panel) return;

els.panel.classList.remove('open');

els.panel.style.removeProperty(
'display'
);

}

function loadBarcodeFont(index = 0) {

if (
typeof FontFace === 'undefined' ||
!document.fonts
) {

return;

}

if (
index >= FONT_URLS.length
) {

console.error(
'[barcode] barcode font FAILED to load from every URL:',
FONT_URLS
);

return;

}

const url =
FONT_URLS[index];

const face =
new FontFace(
'IDAutomationHC39M',
'url("' +
url +
'") format("truetype")',
{
display: 'block'
}
);

face
.load()
.then(
loaded => {

document.fonts.add(
loaded
);

console.log(
'[barcode] barcode font loaded from ' +
url
);

}
)
.catch(
err => {

console.warn(
'[barcode] barcode font failed from ' +
url +
' - trying next source.',
err
);

loadBarcodeFont(
index + 1
);

}
);

}

function injectStyles() {

if ($('#barcode-tool-styles')) {
return;
}

const style =
document.createElement('style');

style.id =
'barcode-tool-styles';

style.textContent = `

.db-list-dropdown-wrapper:not(.${DROPDOWN_OPEN_CLASS})
.db-list-dropdown-card[data-barcode-template],
.db-list-dropdown-wrapper:not(.${DROPDOWN_OPEN_CLASS})
.db-list-dropdown-card[data-barcode-history] {
display: none !important;
}

.db-list-dropdown-card[data-barcode-template],
.db-list-dropdown-card[data-barcode-history] {
cursor: pointer;
}

.barcode-clear-card-wrapper {
transition: opacity .2s ease;
}

.barcode-clear-card-wrapper.barcode-clearing {
opacity: .65;
}

.barcode-clear-card-button {
cursor: pointer;
}

.barcode-card {
position: relative;
}

.barcode-card-overlay {
position: absolute;
inset: 0;
z-index: 5;
display: block;
cursor: pointer;
background: transparent;
}

.barcode-card-overlay:hover {
background: rgba(0,0,0,.08);
}

.barcode-multi-parts {
width: 100%;
display: flex;
flex-direction: column;
align-items: stretch;
justify-content: center;
gap: 8px;
box-sizing: border-box;
}

.barcode-card[data-barcode-template="standard"] .barcode-multi-parts {
gap: 12px;
}

.barcode-card[data-barcode-template="medium"] .barcode-multi-parts,
.barcode-card[data-barcode-template="large"] .barcode-multi-parts,
.barcode-card[data-barcode-template="xlarge"] .barcode-multi-parts {
gap: 1px;
}

.barcode-card[data-barcode-template="xlarge"] .barcode-multi-row {
gap: 6px;
}

.barcode-ka .barcode-extra-fields {
flex-direction: row;
gap: 10px;
}

.barcode-ka .barcode-output-row {
justify-content: flex-end;
}

.barcode-multi-row {
width: 100%;
display: flex;
flex-direction: row;
align-items: center;
justify-content: space-between;
gap: 12px;
box-sizing: border-box;
}

.barcode-multi-text {
flex: 1 1 auto;
min-width: 0;
display: flex;
flex-direction: column;
align-items: flex-start;
justify-content: center;
text-align: left;
box-sizing: border-box;
}

.barcode-multi-row .barcode-populate {
flex: 0 0 auto;
margin-left: auto;
}

.barcode-multi-part {
width: 100%;
display: flex;
flex-direction: column;
align-items: center;
justify-content: center;
text-align: center;
min-width: 0;
box-sizing: border-box;
}

.barcode-multi-part-number {
font-weight: 700;
line-height: 1.1;
white-space: normal;
overflow-wrap: anywhere;
}

.barcode-multi-part-description {
font-weight: 400;
line-height: 1.2;
white-space: normal;
overflow-wrap: anywhere;
margin-top: 2px;
}

.barcode-multi-barcodes {
width: 100%;
display: flex;
flex-direction: column;
align-items: center;
justify-content: center;
gap: 6px;
box-sizing: border-box;
}

.barcode-part-editor {
border: 1px solid #d5d5d5;
border-radius: 10px;
padding: 10px;
margin-bottom: 10px;
background: rgba(127,127,127,.08);
}

.barcode-part-editor-header {
display: flex;
align-items: center;
justify-content: space-between;
gap: 8px;
margin-bottom: 8px;
}

.barcode-part-editor-title {
font-size: 11px;
font-weight: 800;
text-transform: uppercase;
letter-spacing: .06em;
opacity: .75;
}

.barcode-part-remove {
border: 1px solid #ccc;
background: #fff;
color: #111;
border-radius: 999px;
padding: 5px 12px;
cursor: pointer;
font-size: 11px;
font-weight: 700;
}

.barcode-part-remove:hover {
background: #f5f5f5;
}

.label-template-selector {
min-width: 160px;
padding: 6px;
border: 1px solid #ccc;
border-radius: 5px;
background: #fff;
font: inherit;
font-size: 12px;
}

.barcode-template-name-input {
width: 100%;
box-sizing: border-box;
padding: 9px 10px;
border: 1px solid #ccc;
border-radius: 5px;
font: inherit;
font-size: 13px;
}

.barcode-template-name-input:focus {
outline: none;
border-color: #111;
}

.barcode-template-error {
margin-top: 10px;
font-size: 12px;
color: #b00020;
}

.barcode-output-row {
width: 100%;
display: flex;
align-items: center;
justify-content: center;
gap: 12px;
box-sizing: border-box;
}

.barcode-output-row.has-extras {
display: flex;
align-items: center;
justify-content: center;
gap: 12px;
}

.barcode-output-row.has-extras .barcode-populate {
flex-shrink: 0;
}

.barcode-extra-fields {
display: flex;
flex-direction: column;
align-items: center;
justify-content: center;
gap: 4px;
min-width: 0;
}

.barcode-extra-field {
display: flex;
flex-direction: column;
align-items: center;
justify-content: center;
text-align: center;
min-width: 40px;
box-sizing: border-box;
}

.barcode-extra-heading {
font-size: 10px;
font-weight: 700;
line-height: 1.1;
white-space: nowrap;
}

.barcode-extra-subtext {
font-size: 9px;
font-weight: 400;
line-height: 1.2;
white-space: nowrap;
margin-top: 2px;
}

.barcode-populate {
display: block !important;
width: auto !important;
max-width: none !important;
box-sizing: content-box !important;
font-family: 'IDAutomationHC39M', monospace !important;
white-space: nowrap;
text-align: center;
overflow: visible !important;
flex-shrink: 0;
position: relative;
z-index: 1;
margin-top: 4px;
margin-bottom: 0;
}

.barcode-populate-auto {
text-align: center;
}

.barcode-card .barcode-populate {
align-self: center;
}

.db-left-content.editing{
width:100%!important;
height: 100% !important;
min-height:0!important;
max-height: 100% !important;
overflow:hidden!important;
display:flex!important;
flex-direction:column!important;
overscroll-behavior:contain!important;
overscroll-behavior-y:contain!important;
}

.db-left-content.editing .barcode-edit-panel {
flex: 1 1 auto !important;
width: 100% !important;
height: 50% !important;
min-height: 0 !important;
max-height: 50% !important;
overflow-y: auto !important;
overflow-x: hidden !important;
box-sizing: border-box !important;
padding-right: 10px !important;
overscroll-behavior: contain !important;
-webkit-overflow-scrolling: touch !important;
scrollbar-width: thin;
touch-action: pan-y;
}

.barcode-edit-panel::-webkit-scrollbar {
width: 6px;
}

.barcode-edit-panel::-webkit-scrollbar-track {
background: transparent;
}

.barcode-edit-panel::-webkit-scrollbar-thumb {
background: #ccc;
border-radius: 10px;
}

.barcode-edit-panel::-webkit-scrollbar-thumb:hover {
background: #aaa;
}

.barcode-edit-panel-header {
display: flex;
justify-content: space-between;
align-items: center;
flex: 0 0 auto;
margin-bottom: 14px;
padding-bottom: 12px;
border-bottom: 1px solid #e2e2e2;
}

.barcode-edit-panel-title {
font-weight: 800;
font-size: 18px;
letter-spacing: .01em;
}

.barcode-edit-panel-close {
border: 0;
background: transparent;
font-size: 24px;
cursor: pointer;
line-height: 1;
width: 32px;
height: 32px;
border-radius: 8px;
color: inherit;
}

.barcode-edit-panel-close:hover {
background: rgba(127,127,127,.18);
}

.barcode-edit-section {
border-top: 1px solid #e2e2e2;
padding-top: 14px;
margin-top: 14px;
}

.barcode-edit-section-title {
font-size: 11px;
font-weight: 700;
text-transform: uppercase;
letter-spacing: .06em;
margin-bottom: 10px;
opacity: .7;
}

.barcode-field-group {
margin-bottom: 10px;
}

.barcode-field-label,
.barcode-control-label {
display: block;
font-size: 11px;
font-weight: 600;
margin-bottom: 5px;
opacity: .85;
}

.barcode-field-input {
width: 100%;
box-sizing: border-box;
padding: 8px 10px;
border: 1px solid #ccc;
border-radius: 8px;
font: inherit;
font-size: 12px;
background: #fff;
color: #111;
}

.barcode-field-input:focus {
outline: none;
border-color: #111;
}

.barcode-control-row {
display: flex;
align-items: center;
justify-content: space-between;
gap: 10px;
margin-bottom: 8px;
}

.barcode-control {
min-width: 120px;
padding: 7px 8px;
border: 1px solid #ccc;
border-radius: 8px;
background: #fff;
color: #111;
font: inherit;
font-size: 12px;
}

.barcode-control:focus {
outline: none;
border-color: #111;
}

.barcode-control:disabled {
background: #f3f3f3;
color: #999;
cursor: not-allowed;
}

.barcode-number {
width: 80px;
min-width: 80px;
}

.barcode-checkbox-row {
display: flex;
align-items: center;
justify-content: space-between;
gap: 10px;
margin-bottom: 8px;
padding: 5px 0;
}

.barcode-checkbox-label {
display: flex;
align-items: center;
gap: 8px;
font-size: 13px;
font-weight: 600;
cursor: pointer;
}

.barcode-checkbox {
width: 18px;
height: 18px;
margin: 0;
cursor: pointer;
accent-color: #111;
}

.barcode-edit-panel-footer {
display: flex;
justify-content: flex-end;
align-items: center;
gap: 8px;
margin-top: 18px;
padding-top: 14px;
border-top: 1px solid #e2e2e2;
}

.barcode-edit-button {
border: 1px solid #ccc;
background: #fff;
color: #111;
border-radius: 8px;
padding: 9px 14px;
cursor: pointer;
font-size: 12px;
font-weight: 700;
}

.barcode-edit-button:hover {
background: #f5f5f5;
}

.barcode-edit-button.primary {
background: #111;
color: #fff;
border-color: #111;
}

.barcode-edit-button.primary:hover {
background: #333;
}

.barcode-history-panel {
display: none;
width: 100%;
box-sizing: border-box;
}

.barcode-history-inner {
width: 100%;
box-sizing: border-box;
}

.barcode-history-header {
display: flex;
align-items: center;
justify-content: space-between;
gap: 12px;
margin-bottom: 16px;
}

.barcode-history-title {
font-size: 18px;
font-weight: 700;
margin: 0;
}

.barcode-history-close {
width: 32px;
height: 32px;
border: 0;
background: transparent;
font-size: 24px;
line-height: 1;
cursor: pointer;
border-radius: 5px;
}

.barcode-history-close:hover {
background: #f2f2f2;
}

.barcode-history-controls {
display: flex;
align-items: center;
gap: 8px;
margin-bottom: 16px;
}

.barcode-history-select {
flex: 1;
min-width: 0;
padding: 9px 10px;
border: 1px solid #ccc;
border-radius: 5px;
background: #fff;
font: inherit;
font-size: 12px;
}

.barcode-history-load {
border: 1px solid #111;
background: #111;
color: #fff;
border-radius: 5px;
padding: 9px 14px;
cursor: pointer;
font-size: 12px;
font-weight: 600;
white-space: nowrap;
}

.barcode-history-load:hover {
background: #333;
}

.barcode-history-list {
border: 1px solid #eee;
border-radius: 6px;
overflow: hidden;
}

.barcode-history-table {
width: 100%;
border-collapse: collapse;
font-size: 12px;
}

.barcode-history-table th {
background: #f5f5f5;
border-bottom: 1px solid #ddd;
padding: 9px 10px;
text-align: left;
font-weight: 700;
}

.barcode-history-table td {
padding: 8px 10px;
border-bottom: 1px solid #eee;
vertical-align: middle;
}

.barcode-history-table tr:last-child td {
border-bottom: 0;
}

.barcode-history-table tr:hover td {
background: #fafafa;
}

.barcode-history-part {
font-weight: 700;
white-space: nowrap;
}

.barcode-history-description {
color: #555;
}

.barcode-history-qty {
text-align: center;
font-weight: 700;
width: 60px;
}

.barcode-history-empty {
padding: 28px 16px;
text-align: center;
font-size: 12px;
color: #888;
}

.barcode-history-status {
font-size: 11px;
color: #666;
margin-bottom: 10px;
}

.barcode-clear-confirm-modal {
position: fixed;
inset: 0;
z-index: 100000;
display: flex;
align-items: center;
justify-content: center;
padding: 24px;
box-sizing: border-box;
background: rgba(0,0,0,.45);
opacity: 0;
transition: opacity .18s ease;
}

.barcode-clear-confirm-modal.is-visible {
opacity: 1;
}

.barcode-clear-confirm-box {
width: min(420px, 100%);
background: #fff;
border-radius: 10px;
box-shadow: 0 20px 60px rgba(0,0,0,.25);
display: flex;
flex-direction: column;
overflow: hidden;
font-family: inherit;
transform: translateY(8px) scale(.98);
transition: transform .18s ease;
}

.barcode-clear-confirm-modal.is-visible
.barcode-clear-confirm-box {
transform: translateY(0) scale(1);
}

.barcode-clear-confirm-header {
display: flex;
align-items: center;
justify-content: space-between;
padding: 18px 22px;
border-bottom: 1px solid #eee;
}

.barcode-clear-confirm-title {
font-size: 18px;
font-weight: 700;
margin: 0;
}

.barcode-clear-confirm-close {
width: 32px;
height: 32px;
border: 0;
background: transparent;
font-size: 24px;
line-height: 1;
cursor: pointer;
border-radius: 5px;
}

.barcode-clear-confirm-close:hover {
background: #f2f2f2;
}

.barcode-clear-confirm-body {
padding: 22px;
}

.barcode-clear-confirm-message {
margin: 0;
font-size: 13px;
line-height: 1.5;
color: #555;
}

.barcode-clear-confirm-count {
font-weight: 700;
color: #222;
}

.barcode-clear-confirm-footer {
display: flex;
align-items: center;
justify-content: flex-end;
gap: 8px;
padding: 14px 22px;
border-top: 1px solid #eee;
}

.barcode-clear-confirm-button {
border: 1px solid #ccc;
background: #fff;
border-radius: 5px;
padding: 9px 14px;
cursor: pointer;
font-size: 12px;
font-weight: 600;
}

.barcode-clear-confirm-button:hover {
background: #f5f5f5;
}

.barcode-clear-confirm-button.danger {
background: #111;
color: #fff;
border-color: #111;
}

.barcode-clear-confirm-button.danger:hover {
background: #333;
}

.barcode-quickimp-modal {
position: fixed;
inset: 0;
z-index: 99999;
display: flex;
align-items: center;
justify-content: center;
padding: 24px;
box-sizing: border-box;
background: rgba(0,0,0,.45);
}

.barcode-quickimp-modal-box {
width: min(950px, 100%);
max-height: min(850px, 92vh);
background: #fff;
border-radius: 10px;
box-shadow: 0 20px 60px rgba(0,0,0,.25);
display: flex;
flex-direction: column;
overflow: hidden;
font-family: inherit;
}

.barcode-quickimp-modal-header {
display: flex;
align-items: center;
justify-content: space-between;
padding: 18px 22px;
border-bottom: 1px solid #eee;
flex: 0 0 auto;
}

.barcode-quickimp-modal-title {
font-size: 18px;
font-weight: 700;
margin: 0;
}

.barcode-quickimp-modal-close {
width: 32px;
height: 32px;
border: 0;
background: transparent;
font-size: 24px;
line-height: 1;
cursor: pointer;
border-radius: 5px;
}

.barcode-quickimp-modal-close:hover {
background: #f2f2f2;
}

.barcode-quickimp-modal-body {
padding: 20px 22px;
overflow-y: auto;
min-height: 0;
}

.barcode-quickimp-description {
margin: 0 0 12px;
font-size: 12px;
line-height: 1.5;
color: #666;
}

.barcode-quickimp-textarea {
display: block;
width: 100%;
min-height: 240px;
box-sizing: border-box;
resize: vertical;
padding: 12px;
border: 1px solid #ccc;
border-radius: 6px;
background: #fff;
color: #222;
font: inherit;
font-size: 12px;
line-height: 1.5;
outline: none;
}

.barcode-quickimp-textarea:focus {
border-color: #111;
}

.barcode-quickimp-options {
display: flex;
align-items: center;
justify-content: space-between;
gap: 12px;
margin-top: 14px;
padding: 12px;
border: 1px solid #eee;
border-radius: 6px;
background: #fafafa;
}

.barcode-quickimp-checkbox-label {
display: flex;
align-items: center;
gap: 8px;
font-size: 13px;
font-weight: 600;
cursor: pointer;
}

.barcode-quickimp-checkbox {
width: 16px;
height: 16px;
margin: 0;
cursor: pointer;
}

.barcode-quickimp-summary {
font-size: 12px;
color: #666;
}

.barcode-quickimp-preview-title {
margin: 18px 0 8px;
font-size: 12px;
font-weight: 700;
}

.barcode-quickimp-preview-wrap {
border: 1px solid #eee;
border-radius: 6px;
overflow: auto;
max-height: 280px;
}

.barcode-quickimp-preview {
width: 100%;
border-collapse: collapse;
font-size: 12px;
}

.barcode-quickimp-preview th {
position: sticky;
top: 0;
z-index: 2;
background: #f5f5f5;
border-bottom: 1px solid #ddd;
padding: 9px 10px;
text-align: left;
font-weight: 700;
white-space: nowrap;
}

.barcode-quickimp-preview td {
padding: 7px 10px;
border-bottom: 1px solid #eee;
vertical-align: middle;
}

.barcode-quickimp-preview tr:last-child td {
border-bottom: 0;
}

.barcode-quickimp-preview tr:hover td {
background: #fafafa;
}

.barcode-quickimp-preview-part {
font-weight: 700;
white-space: nowrap;
}

.barcode-quickimp-preview-description {
color: #555;
min-width: 300px;
}

.barcode-quickimp-preview-qty {
width: 65px;
padding: 6px 7px;
border: 1px solid #ccc;
border-radius: 5px;
font-size: 12px;
box-sizing: border-box;
text-align: center;
}

.barcode-quickimp-preview-qty:focus {
outline: none;
border-color: #111;
}

.barcode-quickimp-preview-stockqty {
width: 65px;
padding: 6px 7px;
border: 1px solid #ccc;
border-radius: 5px;
font-size: 12px;
box-sizing: border-box;
text-align: center;
}

.barcode-quickimp-preview-stockqty:focus {
outline: none;
border-color: #111;
}

.barcode-quickimp-preview-stockqty:disabled {
background: #f3f3f3;
color: #999;
cursor: not-allowed;
}

.barcode-quickimp-options {
flex-wrap: wrap;
}

.barcode-quickimp-empty {
padding: 24px 12px;
text-align: center;
font-size: 12px;
color: #888;
}

.barcode-quickimp-error {
margin-top: 10px;
font-size: 12px;
color: #b00020;
}

.barcode-quickimp-modal-footer {
display: flex;
align-items: center;
justify-content: flex-end;
gap: 8px;
padding: 14px 22px;
border-top: 1px solid #eee;
flex: 0 0 auto;
}

.barcode-quickimp-button {
border: 1px solid #ccc;
background: #fff;
border-radius: 5px;
padding: 9px 14px;
cursor: pointer;
font-size: 12px;
font-weight: 600;
}

.barcode-quickimp-button:hover {
background: #f5f5f5;
}

.barcode-quickimp-button.primary {
background: #111;
color: #fff;
border-color: #111;
}

.barcode-quickimp-button.primary:hover {
background: #333;
}

.barcode-csv-modal {
position: fixed;
inset: 0;
z-index: 99999;
display: flex;
align-items: center;
justify-content: center;
padding: 24px;
box-sizing: border-box;
background: rgba(0,0,0,.45);
}

.barcode-csv-modal-box {
width: min(900px, 100%);
max-height: min(760px, 90vh);
background: #fff;
border-radius: 10px;
box-shadow: 0 20px 60px rgba(0,0,0,.25);
display: flex;
flex-direction: column;
overflow: hidden;
font-family: inherit;
}

.barcode-csv-modal-header {
display: flex;
align-items: center;
justify-content: space-between;
padding: 18px 22px;
border-bottom: 1px solid #eee;
flex: 0 0 auto;
}

.barcode-csv-modal-title {
font-size: 18px;
font-weight: 700;
margin: 0;
}

.barcode-csv-modal-close {
width: 32px;
height: 32px;
border: 0;
background: transparent;
font-size: 24px;
line-height: 1;
cursor: pointer;
border-radius: 5px;
}

.barcode-csv-modal-close:hover {
background: #f2f2f2;
}

.barcode-csv-modal-options {
display: flex;
align-items: center;
gap: 18px;
padding: 14px 22px;
border-bottom: 1px solid #eee;
background: #fafafa;
flex: 0 0 auto;
}

.barcode-csv-checkbox-label {
display: flex;
align-items: center;
gap: 8px;
font-size: 13px;
font-weight: 600;
cursor: pointer;
}

.barcode-csv-checkbox {
width: 16px;
height: 16px;
margin: 0;
cursor: pointer;
}

.barcode-csv-summary {
margin-left: auto;
font-size: 12px;
color: #666;
}

.barcode-csv-table-wrap {
overflow: auto;
flex: 1 1 auto;
min-height: 0;
}

.barcode-csv-table {
width: 100%;
border-collapse: collapse;
font-size: 12px;
}

.barcode-csv-table th {
position: sticky;
top: 0;
z-index: 2;
background: #f5f5f5;
border-bottom: 1px solid #ddd;
padding: 10px 12px;
text-align: left;
font-weight: 700;
white-space: nowrap;
}

.barcode-csv-table td {
padding: 8px 12px;
border-bottom: 1px solid #eee;
vertical-align: middle;
}

.barcode-csv-table tr:hover td {
background: #fafafa;
}

.barcode-csv-part {
font-weight: 700;
white-space: nowrap;
}

.barcode-csv-description {
color: #555;
max-width: 480px;
}

.barcode-csv-qty {
width: 70px;
padding: 7px 8px;
border: 1px solid #ccc;
border-radius: 5px;
font-size: 12px;
box-sizing: border-box;
text-align: center;
}

.barcode-csv-qty:focus {
outline: none;
border-color: #111;
}

.barcode-csv-stockqty {
width: 70px;
padding: 7px 8px;
border: 1px solid #ccc;
border-radius: 5px;
font-size: 12px;
box-sizing: border-box;
text-align: center;
}

.barcode-csv-stockqty:focus {
outline: none;
border-color: #111;
}

.barcode-csv-stockqty:disabled {
background: #f3f3f3;
color: #999;
cursor: not-allowed;
}

.barcode-csv-modal-options {
flex-wrap: wrap;
}

.barcode-csv-modal-footer {
display: flex;
align-items: center;
justify-content: flex-end;
gap: 8px;
padding: 14px 22px;
border-top: 1px solid #eee;
flex: 0 0 auto;
}

.barcode-csv-button {
border: 1px solid #ccc;
background: #fff;
border-radius: 5px;
padding: 9px 14px;
cursor: pointer;
font-size: 12px;
font-weight: 600;
}

.barcode-csv-button:hover {
background: #f5f5f5;
}

.barcode-csv-button.primary {
background: #111;
color: #fff;
border-color: #111;
}

.barcode-csv-button.primary:hover {
background: #333;
}

.barcode-csv-success-message {
padding: 24px 22px;
font-size: 13px;
line-height: 1.5;
}

.barcode-csv-success-count {
font-weight: 700;
color: #222;
}

#barcode-print-root {
display: none;
}

@media (max-width: 700px) {

.barcode-quickimp-modal {
padding: 10px;
}

.barcode-quickimp-modal-box {
max-height: 94vh;
}

.barcode-quickimp-modal-body {
padding: 16px;
}

.barcode-quickimp-textarea {
min-height: 220px;
}

.barcode-quickimp-options {
align-items: flex-start;
flex-direction: column;
}

.barcode-quickimp-summary {
width: 100%;
}

.barcode-quickimp-preview-description {
min-width: 200px;
}

.barcode-csv-modal {
padding: 10px;
}

.barcode-csv-modal-box {
max-height: 94vh;
}

.barcode-csv-modal-options {
flex-wrap: wrap;
gap: 10px;
}

.barcode-csv-summary {
width: 100%;
margin-left: 0;
}

.barcode-csv-description {
max-width: 250px;
}

.barcode-clear-confirm-modal {
padding: 10px;
}

.barcode-history-controls {
align-items: stretch;
flex-direction: column;
}

.barcode-history-load {
width: 100%;
}

.barcode-history-table {
font-size: 11px;
}

.barcode-extra-fields {
gap: 4px;
}

.barcode-extra-field {
min-width: 32px;
}

.barcode-extra-heading {
font-size: 8px;
}

.barcode-extra-subtext {
font-size: 7px;
}

}

@media print {

html,
body {
margin: 0 !important;
padding: 0 !important;
width: 100% !important;
height: auto !important;
}

body:has(#barcode-print-root) > *:not(#barcode-print-root) {
display: none !important;
}

#barcode-print-root {
display: block !important;
position: static !important;
width: 100% !important;
height: auto !important;
margin: 0 !important;
padding: 0 !important;
overflow: visible !important;
}

#barcode-print-root .barcode-page {
display: block !important;
position: relative !important;
width: 210mm !important;
height: 297mm !important;
margin: 0 !important;
padding: 0 !important;
overflow: hidden !important;
break-after: page;
page-break-after: always;
box-sizing: border-box !important;
}

#barcode-print-root .barcode-page:last-child {
break-after: auto;
page-break-after: auto;
}

#barcode-print-root .barcode-page * {
visibility: visible !important;
}

#barcode-print-root .barcode-card-overlay,
#barcode-print-root .barcode-edit-panel {
display: none !important;
}

}

`;

document.head.appendChild(
style
);

}

function cardData(data = {}) {

counter++;

const template =
data.template ||
state.current ||
DEFAULTS.template;

const defaults =
getTemplateDefaults(
template
);

const manualQtyValue =
Number(
data.manualQty
);

const manualQty =
Number.isFinite(
manualQtyValue
) &&
manualQtyValue >= 0
? Math.floor(
manualQtyValue
)
: 0;

const parts =
normalizeParts(data);

const firstPart =
parts[0] || {};

return {

id:
data.id ||
'barcode-' + counter,

template,

partNumber:
firstPart.partNumber ??
data.partNumber ??
DEFAULTS.partNumber,

subtext:
firstPart.subtext ??
data.subtext ??
DEFAULTS.subtext,

parts,

showDate:
Boolean(
data.showDate
),

date:
String(
data.date ||
getSystemDate()
),

dateHeadingSize:
Number(
data.dateHeadingSize
) ||
DEFAULTS.dateHeadingSize,

dateSubtextSize:
Number(
data.dateSubtextSize
) ||
DEFAULTS.dateSubtextSize,

showQty:
Boolean(
data.showQty
),

manualQty,

qtyHeadingSize:
Number(
data.qtyHeadingSize
) ||
DEFAULTS.qtyHeadingSize,

qtySubtextSize:
Number(
data.qtySubtextSize
) ||
DEFAULTS.qtySubtextSize,

partNumberSize:
Number(
data.partNumberSize
) ||
defaults.partNumberSize,

subtextSize:
Number(
data.subtextSize
) ||
defaults.subtextSize,

barcodeSize:
Number(
data.barcodeSize
) ||
defaults.barcodeSize

};

}

function get(id) {

return state.cards.find(
card =>
card.id === id
);

}

function add(data = {}) {

const card =
cardData(data);

state.cards.push(
card
);

state.current =
card.template;

render();

return card;

}

function remove(id) {

const deleted =
get(id);

if (!deleted) {
return;
}

const templateCards =
state.cards.filter(
card =>
card.template ===
deleted.template
);

const deletedIndex =
templateCards.findIndex(
card =>
card.id === id
);

const previousCard =
templateCards[
deletedIndex - 1
];

const nextCard =
templateCards[
deletedIndex + 1
];

const replacement =
previousCard ||
nextCard ||
null;

state.cards =
state.cards.filter(
card =>
card.id !== id
);

if (
editing === id &&
replacement
) {

state.current =
replacement.template;

render();

const remaining =
get(
replacement.id
);

if (remaining) {
openEdit(
remaining
);
}

return;

}

if (editing === id) {
hideEdit();
}

render();

}

function clearAllCards() {

if (!state.cards.length) {
return;
}

openClearConfirm();

}

function performClearAll() {

if (!state.cards.length) {
return;
}

const cards =
els.panel
? els.panel.querySelectorAll(
'.barcode-card'
)
: [];

if (els.clearWrapper) {

els.clearWrapper.classList.add(
'barcode-clearing'
);

}

cards.forEach(
(card, index) => {

card.style.transition =
'opacity .18s ease, transform .18s ease';

card.style.opacity =
'0';

card.style.transform =
'scale(.96)';

card.style.transitionDelay =
Math.min(
index * 15,
120
) +
'ms';

}
);

setTimeout(
() => {

state.cards = [];

hideEdit();

render();

if (els.clearWrapper) {

els.clearWrapper.classList.remove(
'barcode-clearing'
);

}

},
220
);

}

function closeClearConfirm() {

if (!clearConfirmModal) {
return;
}

const modal =
clearConfirmModal;

modal.classList.remove(
'is-visible'
);

setTimeout(
() => {

if (
modal === clearConfirmModal
) {

modal.remove();

clearConfirmModal =
null;

}

},
180
);

}

function openClearConfirm() {

if (!state.cards.length) {
return;
}

closeClearConfirm();

const modal =
document.createElement(
'div'
);

modal.className =
'barcode-clear-confirm-modal';

modal.setAttribute(
'role',
'dialog'
);

modal.setAttribute(
'aria-modal',
'true'
);

const box =
document.createElement(
'div'
);

box.className =
'barcode-clear-confirm-box';

const header =
document.createElement(
'div'
);

header.className =
'barcode-clear-confirm-header';

const title =
document.createElement(
'h2'
);

title.className =
'barcode-clear-confirm-title';

title.textContent =
'Clear All Barcodes';

const closeButton =
document.createElement(
'button'
);

closeButton.type =
'button';

closeButton.className =
'barcode-clear-confirm-close';

closeButton.textContent =
'×';

closeButton.setAttribute(
'aria-label',
'Close'
);

closeButton.addEventListener(
'click',
closeClearConfirm
);

header.append(
title,
closeButton
);

const body =
document.createElement(
'div'
);

body.className =
'barcode-clear-confirm-body';

const message =
document.createElement(
'p'
);

message.className =
'barcode-clear-confirm-message';

message.innerHTML =
'Are you sure you want to remove all ' +
'<span class="barcode-clear-confirm-count">' +
state.cards.length +
'</span> barcode' +
(
state.cards.length === 1
? ''
: 's'
) +
'? This cannot be undone.';

body.appendChild(
message
);

const footer =
document.createElement(
'div'
);

footer.className =
'barcode-clear-confirm-footer';

const cancel =
document.createElement(
'button'
);

cancel.type =
'button';

cancel.className =
'barcode-clear-confirm-button';

cancel.textContent =
'Cancel';

cancel.addEventListener(
'click',
closeClearConfirm
);

const confirm =
document.createElement(
'button'
);

confirm.type =
'button';

confirm.className =
'barcode-clear-confirm-button danger';

confirm.textContent =
'Clear All';

confirm.addEventListener(
'click',
function () {

closeClearConfirm();

performClearAll();

}
);

footer.append(
cancel,
confirm
);

box.append(
header,
body,
footer
);

modal.appendChild(
box
);

modal.addEventListener(
'click',
function (e) {

if (
e.target === modal
) {

closeClearConfirm();

}

}
);

modal.addEventListener(
'keydown',
function (e) {

if (
e.key === 'Escape'
) {

closeClearConfirm();

}

}
);

document.body.appendChild(
modal
);

clearConfirmModal =
modal;

requestAnimationFrame(
() => {

modal.classList.add(
'is-visible'
);

}
);

setTimeout(
() => confirm.focus(),
50
);

}

function cleanPartNumber(value) {

return String(value || '')
.trim()
.replace(/^#/, '')
.trim();

}

/* ADDED: used only for CSV / Quick Import */
function importedPartNumber(value) {

const clean =
cleanPartNumber(
value
);

if (!clean) {
return '';
}

return '#' + clean;

}

function barcodeValue(value) {

const clean =
cleanPartNumber(value);

if (!clean) {
return '';
}

return `*${clean}*`;

}

function simplifyDescription(
value,
template
) {

let text =
String(value ?? '')
.replace(
/[\r\n\t]+/g,
' '
)
.replace(
/\s+/g,
' '
)
.replace(
/\s+([,.;:])/g,
'$1'
)
.trim();

if (
template === 'xlarge' &&
text.length > 83
) {

text =
text
.slice(0, 83)
.trimEnd() +
'...';

}

return text;

}

function renderBarcodeExtraFields(
card,
outputRow
) {

let extras =
outputRow.querySelector(
'.barcode-extra-fields'
);

if (!extras) {

extras =
document.createElement(
'div'
);

extras.className =
'barcode-extra-fields';

outputRow.appendChild(
extras
);

}

extras.innerHTML = '';

let hasExtras =
false;

if (
card.showDate
) {

hasExtras =
true;

const field =
document.createElement(
'div'
);

field.className =
'barcode-extra-field';

const heading =
document.createElement(
'div'
);

heading.className =
'barcode-extra-heading';

heading.textContent =
'Date';

heading.style.fontSize =
(
Number(
card.dateHeadingSize
) ||
DEFAULTS.dateHeadingSize
) +
'px';

const subtext =
document.createElement(
'div'
);

subtext.className =
'barcode-extra-subtext';

subtext.textContent =
formatBarcodeDate(
card.date
);

subtext.style.fontSize =
(
Number(
card.dateSubtextSize
) ||
DEFAULTS.dateSubtextSize
) +
'px';

field.append(
heading,
subtext
);

extras.appendChild(
field
);

}

if (
card.showQty
) {

hasExtras =
true;

const field =
document.createElement(
'div'
);

field.className =
'barcode-extra-field';

const heading =
document.createElement(
'div'
);

heading.className =
'barcode-extra-heading';

heading.textContent =
'QTY';

heading.style.fontSize =
(
Number(
card.qtyHeadingSize
) ||
DEFAULTS.qtyHeadingSize
) +
'px';

const subtext =
document.createElement(
'div'
);

subtext.className =
'barcode-extra-subtext';

subtext.textContent =
String(
Number(
card.manualQty
) >= 0
? Math.floor(
Number(
card.manualQty
)
)
: 0
);

subtext.style.fontSize =
(
Number(
card.qtySubtextSize
) ||
DEFAULTS.qtySubtextSize
) +
'px';

field.append(
heading,
subtext
);

extras.appendChild(
field
);

}

extras.style.display =
hasExtras
? 'flex'
: 'none';

outputRow.classList.toggle(
'has-extras',
hasExtras
);

}

function ensureBarcodeOutputRow(
card,
barcode
) {

let outputRow =
card.querySelector(
'.barcode-output-row'
);

if (!outputRow) {

outputRow =
document.createElement(
'div'
);

outputRow.className =
'barcode-output-row';

if (
barcode.parentElement === card
) {

card.insertBefore(
outputRow,
barcode
);

} else {

barcode.parentElement.insertBefore(
outputRow,
barcode
);

}

outputRow.appendChild(
barcode
);

} else if (
barcode.parentElement !== outputRow
) {

outputRow.appendChild(
barcode
);

}

return outputRow;

}

function renderMultiParts(
card,
data
) {

let container =
card.querySelector(
'.barcode-multi-parts'
);

const outputRow =
card.querySelector(
'.barcode-output-row'
);

if (!container) {

container =
document.createElement(
'div'
);

container.className =
'barcode-multi-parts';

if (
outputRow &&
outputRow.parentElement === card
) {

card.insertBefore(
container,
outputRow
);

} else {

card.appendChild(
container
);

}

}

container.innerHTML = '';

const parts =
getCardParts(data);

/*
Two or more part rows share one label, so shrink
text sizes slightly to keep everything fitting.
Single-part cards render at full size.
*/
const fit =
parts.length > 1
? 0.85
: 1;

const barcodeSize =
Math.max(
1,
Math.round(
(
Number(
data.barcodeSize
) ||
getTemplateDefaults(
data.template
).barcodeSize
) * fit
)
);

const barcodeIds = new Set();

parts
.filter(
part =>
part.showBarcode &&
cleanPartNumber(
part.partNumber
)
)
.slice(0, 2)
.forEach(
part =>
barcodeIds.add(part)
);

parts.forEach(
part => {

const row =
document.createElement(
'div'
);

row.className =
'barcode-multi-row';

const text =
document.createElement(
'div'
);

text.className =
'barcode-multi-text';

const number =
document.createElement(
'div'
);

number.className =
'barcode-multi-part-number';

number.textContent =
part.partNumber || '';

number.style.fontSize =
Math.max(
1,
Math.round(
data.partNumberSize * fit
)
) +
'px';

number.style.lineHeight =
Math.max(
1,
Math.round(
data.partNumberSize * fit
)
) +
'px';

const description =
document.createElement(
'div'
);

description.className =
'barcode-multi-part-description';

description.textContent =
part.subtext || '';

description.style.fontSize =
Math.max(
1,
Math.round(
data.subtextSize * fit
)
) +
'px';

description.style.lineHeight =
Math.max(
1,
Math.round(
data.subtextSize * fit
)
) +
'px';

text.append(
number,
description
);

row.appendChild(
text
);

if (
barcodeIds.has(part)
) {

const code =
document.createElement(
'div'
);

code.className =
'barcode-populate';

code.textContent =
barcodeValue(
part.partNumber
);

code.dataset.barcodeSize =
barcodeSize;

code.style.fontSize =
barcodeSize +
'px';

code.style.lineHeight =
'normal';

row.appendChild(
code
);

}

container.appendChild(
row
);

}
);

container.style.display =
'flex';

}

function populateCard(
card,
data
) {

if (!data.date) {

data.date =
getSystemDate();

}

if (
!Array.isArray(
data.parts
) ||
!data.parts.length
) {

data.parts =
normalizeParts(data);

}

syncTopLevelFromParts(
data
);

let outputRow =
card.querySelector(
'.barcode-output-row'
);

let barcode =
outputRow
? outputRow.querySelector(
'.barcode-populate'
)
: card.querySelector(
'.barcode-populate'
);

if (!barcode) {

barcode =
document.createElement(
'div'
);

barcode.className =
'barcode-populate barcode-populate-auto';

card.appendChild(
barcode
);

}

outputRow =
ensureBarcodeOutputRow(
card,
barcode
);

const header =
card.querySelector(
'.text-input-header > *'
) ||
card.querySelector(
'.text-input-header'
);

const subtext =
card.querySelector(
'.text-input-subtext > *'
) ||
card.querySelector(
'.text-input-subtext'
);

if (
isKeyAccounts()
) {

card.classList.add(
'barcode-ka'
);

if (header) {

header.style.display =
'none';

}

if (subtext) {

subtext.style.display =
'none';

}

if (barcode) {

barcode.textContent =
'';

barcode.style.display =
'none';

}

renderMultiParts(
card,
data
);

renderBarcodeExtraFields(
data,
outputRow
);

return;

}

const multi =
card.querySelector(
'.barcode-multi-parts'
);

card.classList.remove(
'barcode-ka'
);

if (multi) {

multi.style.display =
'none';

}

if (header) {

header.style.display =
'';

header.textContent =
data.partNumber || '';

header.style.fontSize =
data.partNumberSize +
'px';

header.style.lineHeight =
data.partNumberSize +
'px';

}

if (subtext) {

subtext.style.display =
'';

subtext.textContent =
data.subtext || '';

subtext.style.fontSize =
data.subtextSize +
'px';

subtext.style.lineHeight =
data.subtextSize +
'px';

}

if (barcode) {

barcode.style.display =
'';

const barcodeSize =
Number(
data.barcodeSize
) ||
getTemplateDefaults(
data.template
).barcodeSize;

barcode.textContent =
barcodeValue(
data.partNumber
);

barcode.dataset.barcodeSize =
barcodeSize;

barcode.style.fontSize =
barcodeSize +
'px';

barcode.style.lineHeight =
'normal';

barcode.style.height =
'';

barcode.style.overflow =
'';

barcode.style.boxSizing =
'';

}

renderBarcodeExtraFields(
data,
outputRow
);

}

function createCard(data) {

const src =
getSource(
data.template
);

if (!src) {

console.warn(
'[barcode] template not found for:',
data.template
);

return null;

}

const card =
src.label.cloneNode(
true
);

card.classList.add(
'barcode-card'
);

card.dataset.cardId =
data.id;

card.dataset.barcodeTemplate =
data.template;

populateCard(
card,
data
);

const overlay =
document.createElement(
'div'
);

overlay.className =
'barcode-card-overlay';

overlay.addEventListener(
'click',
function (e) {

e.preventDefault();
e.stopPropagation();

/*
Resolve the card from state again using its ID from the DOM.
This keeps manually added AND imported cards editable, even if
the original data object reference is stale.
*/
const hostCard =
e.currentTarget.closest(
'.barcode-card'
);

const cardId =
(hostCard &&
hostCard.dataset &&
hostCard.dataset.cardId) ||
card.dataset.cardId ||
data.id;

const liveCard =
get(
cardId
);

openEdit(
liveCard || data
);

}
);

card.appendChild(
overlay
);

return card;

}

function chunk(
cards,
size
) {

const pages = [];

for (
let i = 0;
i < cards.length;
i += size
) {

pages.push(
cards.slice(
i,
i + size
)
);

}

return pages;

}

function renderTemplate(id) {

const config =
TEMPLATES[id];

const panel =
document.querySelector(
config.panel
);

if (!panel) {
return;
}

const wrapper =
panel.querySelector(
'.barcode-page-wrapper'
) ||
panel;

if (
id !== state.current
) {

wrapper
.querySelectorAll(
'.barcode-page[data-generated]'
)
.forEach(
p => p.remove()
);

panel.style.removeProperty(
'display'
);

return;

}

const src =
getSource(id);

if (!src) {

console.warn(
'[barcode] cannot render template:',
config.panel
);

return;

}

const cards =
state.cards.filter(
c =>
c.template === id
);

wrapper.innerHTML = '';

const groups =
cards.length
? chunk(
cards,
config.capacity
)
: [[]];

groups.forEach(
group => {

const page =
src.page.cloneNode(
true
);

page.dataset.generated =
'true';

const grid =
page.querySelector(
config.grid
) ||
page.querySelector(
'[class*="-grid"]'
);

if (!grid) {

console.warn(
'[barcode] grid not found:',
config.grid
);

return;

}

grid.innerHTML = '';

group.forEach(
data => {

const card =
createCard(
data
);

if (card) {
grid.appendChild(
card
);
}

}
);

wrapper.appendChild(
page
);

unhide(
wrapper,
'block'
);

unhide(
page,
'block'
);

unhide(
grid,
'grid'
);

grid
.querySelectorAll(
'.barcode-card'
)
.forEach(
c =>
unhide(
c,
'block'
)
);

}
);

panel.style.setProperty(
'display',
'block',
'important'
);

}

function render() {

if (
!els.panel ||
!els.panel.isConnected
) {

cache();

}

if (!els.panel) {
return;
}

Object.keys(
TEMPLATES
).forEach(
renderTemplate
);

if (!state.current) {
closeBarcodePanel();
}

}

function live(data) {

if (!els.panel) {
return;
}

els.panel
.querySelectorAll(
`[data-card-id="${data.id}"]`
)
.forEach(
card => {

populateCard(
card,
data
);

}
);

}

function textField(
label,
value,
callback
) {

const wrap =
document.createElement(
'div'
);

wrap.className =
'barcode-field-group';

const l =
document.createElement(
'label'
);

l.className =
'barcode-field-label';

l.textContent =
label;

const input =
document.createElement(
'input'
);

input.className =
'barcode-field-input';

input.type =
'text';

input.value =
value ?? '';

input.addEventListener(
'input',
() =>
callback(
input.value
)
);

wrap.append(
l,
input
);

return wrap;

}

function numberField(
label,
value,
callback,
min = 1
) {

const wrap =
document.createElement(
'div'
);

wrap.className =
'barcode-control-row';

const l =
document.createElement(
'label'
);

l.className =
'barcode-control-label';

l.textContent =
label;

const input =
document.createElement(
'input'
);

input.className =
'barcode-control barcode-number';

input.type =
'number';

input.min =
String(
min
);

input.step =
'1';

input.value =
value ?? '';

input.addEventListener(
'input',
() =>
callback(
input.value
)
);

wrap.append(
l,
input
);

return wrap;

}

function checkboxField(
label,
checked,
callback
) {

const wrap =
document.createElement(
'div'
);

wrap.className =
'barcode-checkbox-row';

const labelWrap =
document.createElement(
'label'
);

labelWrap.className =
'barcode-checkbox-label';

const input =
document.createElement(
'input'
);

input.type =
'checkbox';

input.className =
'barcode-checkbox';

input.checked =
Boolean(
checked
);

const text =
document.createElement(
'span'
);

text.textContent =
label;

labelWrap.append(
input,
text
);

wrap.appendChild(
labelWrap
);

input.addEventListener(
'change',
function () {

callback(
input.checked
);

}
);

return wrap;

}

function section(
title,
children
) {

const s =
document.createElement(
'div'
);

s.className =
'barcode-edit-section';

const h =
document.createElement(
'div'
);

h.className =
'barcode-edit-section-title';

h.textContent =
title;

s.appendChild(
h
);

children.forEach(
x =>
s.appendChild(x)
);

return s;

}

function button(
label,
className,
onClick
) {

const b =
document.createElement(
'button'
);

b.type =
'button';

b.className =
className;

b.textContent =
label;

b.onclick =
onClick;

return b;

}

function buildPartEditor(
card,
part,
index
) {

const wrap =
document.createElement(
'div'
);

wrap.className =
'barcode-part-editor';

const head =
document.createElement(
'div'
);

head.className =
'barcode-part-editor-header';

const title =
document.createElement(
'div'
);

title.className =
'barcode-part-editor-title';

title.textContent =
'Part ' +
(index + 1);

head.appendChild(
title
);

if (
card.parts.length > 1
) {

const remove =
button(
'Remove',
'barcode-part-remove',
() => {

card.parts.splice(
index,
1
);

if (!card.parts.length) {

card.parts.push({
partNumber: '',
subtext: '',
showBarcode: false
});

}

syncTopLevelFromParts(
card
);

render();

openEdit(
card
);

}
);

head.appendChild(
remove
);

}

wrap.appendChild(
head
);

wrap.appendChild(
textField(
'Part Number',
part.partNumber,
value => {

part.partNumber =
value;

syncTopLevelFromParts(
card
);

live(card);

}
)
);

wrap.appendChild(
textField(
'Description',
part.subtext,
value => {

part.subtext =
value;

syncTopLevelFromParts(
card
);

live(card);

}
)
);

wrap.appendChild(
checkboxField(
'Barcode',
Boolean(
part.showBarcode
),
checked => {

part.showBarcode =
checked;

live(card);

}
)
);

return wrap;

}

function buildEditPanel(
card
) {

const panel =
document.createElement(
'div'
);

panel.className =
'barcode-edit-panel';

panel.dataset.cardId =
card.id;

const header =
document.createElement(
'div'
);

header.className =
'barcode-edit-panel-header';

const title =
document.createElement(
'div'
);

title.className =
'barcode-edit-panel-title';

title.textContent =
'Edit Barcode';

header.append(
title,
button(
'×',
'barcode-edit-panel-close',
hideEdit
)
);

panel.appendChild(
header
);

if (
isKeyAccounts()
) {

if (
!Array.isArray(
card.parts
) ||
!card.parts.length
) {

card.parts =
normalizeParts(
card
);

}

const partEditors =
card.parts.map(
(part, index) =>
buildPartEditor(
card,
part,
index
)
);

const addPart =
button(
'Add Part Number & Description',
'barcode-edit-button',
() => {

if (!Array.isArray(card.parts)) {

card.parts = [];

}

card.parts.push({
partNumber: '',
subtext: '',
showBarcode: false
});

syncTopLevelFromParts(
card
);

render();

openEdit(
card
);

}
);

panel.appendChild(
section(
'Content',
[
...partEditors,
addPart
]
)
);

} else {

panel.appendChild(
section(
'Content',
[

textField(
'Part Number',
card.partNumber,
value => {

card.partNumber =
value;

if (
Array.isArray(
card.parts
) &&
card.parts[0]
) {

card.parts[0].partNumber =
value;

}

live(card);

}
),

textField(
'Description',
card.subtext,
value => {

card.subtext =
value;

if (
Array.isArray(
card.parts
) &&
card.parts[0]
) {

card.parts[0].subtext =
value;

}

live(card);

}
)

]
)
);

}

const dateToggle =
checkboxField(
'Date',
card.showDate,
checked => {

card.showDate =
checked;

if (
checked &&
!card.date
) {

card.date =
getSystemDate();

}

live(card);

}
);

const qtyToggle =
checkboxField(
'QTY',
card.showQty,
checked => {

card.showQty =
checked;

live(card);

const input =
manualQtyField.querySelector(
'input'
);

if (input) {

input.disabled =
!checked;

}

}
);

const manualQtyField =
numberField(
'Manual QTY',
card.manualQty,
value => {

let qty =
parseInt(
value,
10
);

if (
!Number.isFinite(qty) ||
qty < 0
) {

qty = 0;

}

card.manualQty =
qty;

live(card);

},
0
);

const manualQtyInput =
manualQtyField.querySelector(
'input'
);

if (manualQtyInput) {

manualQtyInput.disabled =
!card.showQty;

}

panel.appendChild(
section(
'Optional Fields',
[
dateToggle,

numberField(
'Date Heading Size',
card.dateHeadingSize,
value => {

card.dateHeadingSize =
Number(value) ||
DEFAULTS.dateHeadingSize;

live(card);

}
),

numberField(
'Date Subtext Size',
card.dateSubtextSize,
value => {

card.dateSubtextSize =
Number(value) ||
DEFAULTS.dateSubtextSize;

live(card);

}
),

qtyToggle,
manualQtyField,

numberField(
'QTY Heading Size',
card.qtyHeadingSize,
value => {

card.qtyHeadingSize =
Number(value) ||
DEFAULTS.qtyHeadingSize;

live(card);

}
),

numberField(
'QTY Subtext Size',
card.qtySubtextSize,
value => {

card.qtySubtextSize =
Number(value) ||
DEFAULTS.qtySubtextSize;

live(card);

}
)

]
)
);

panel.appendChild(
section(
'Size',
[

numberField(
'Part Number Font Size',
card.partNumberSize,
value => {

const defaults =
getTemplateDefaults(
card.template
);

card.partNumberSize =
Number(value) ||
defaults.partNumberSize;

live(card);

}
),

numberField(
'Description Font Size',
card.subtextSize,
value => {

const defaults =
getTemplateDefaults(
card.template
);

card.subtextSize =
Number(value) ||
defaults.subtextSize;

live(card);

}
),

numberField(
'Barcode Size',
card.barcodeSize,
value => {

const defaults =
getTemplateDefaults(
card.template
);

card.barcodeSize =
Number(value) ||
defaults.barcodeSize;

live(card);

}
)

]
)
);

const footer =
document.createElement(
'div'
);

footer.className =
'barcode-edit-panel-footer';

footer.append(

button(
'Reset',
'barcode-edit-button',
() => {

card.partNumber =
DEFAULTS.partNumber;

card.subtext =
DEFAULTS.subtext;

card.parts =
[
{
partNumber:
DEFAULTS.partNumber,
subtext:
DEFAULTS.subtext,
showBarcode:
!isKeyAccounts()
}
];

card.showDate =
DEFAULTS.showDate;

card.date =
getSystemDate();

card.dateHeadingSize =
DEFAULTS.dateHeadingSize;

card.dateSubtextSize =
DEFAULTS.dateSubtextSize;

card.showQty =
DEFAULTS.showQty;

card.manualQty =
DEFAULTS.manualQty;

card.qtyHeadingSize =
DEFAULTS.qtyHeadingSize;

card.qtySubtextSize =
DEFAULTS.qtySubtextSize;

const defaults =
getTemplateDefaults(
card.template
);

card.partNumberSize =
defaults.partNumberSize;

card.subtextSize =
defaults.subtextSize;

card.barcodeSize =
defaults.barcodeSize;

render();

openEdit(
card
);

}
),

button(
'Copy',
'barcode-edit-button',
() => {

const duplicate =
add({
template:
card.template,

partNumber:
card.partNumber,

subtext:
card.subtext,

parts:
getCardParts(
card
).map(
part => ({
partNumber:
part.partNumber || '',
subtext:
part.subtext || '',
showBarcode:
Boolean(
part.showBarcode
)
})
),

showDate:
card.showDate,

date:
card.date,

dateHeadingSize:
card.dateHeadingSize,

dateSubtextSize:
card.dateSubtextSize,

showQty:
card.showQty,

manualQty:
card.manualQty,

qtyHeadingSize:
card.qtyHeadingSize,

qtySubtextSize:
card.qtySubtextSize,

partNumberSize:
card.partNumberSize,

subtextSize:
card.subtextSize,

barcodeSize:
card.barcodeSize
});

openEdit(
duplicate
);

}
),

button(
'Delete',
'barcode-edit-button',
() =>
remove(
card.id
)
),

button(
'Save',
'barcode-edit-button primary',
() => {

render();

hideEdit();

}
)

);

panel.appendChild(
footer
);

return panel;

}

function openEdit(card) {

if (!card) {
return;
}

const host =
els.left ||
els.panel;

if (!host) {
return;
}

closeHistoryPanel();

openBarcodePanel();

const old =
host.querySelector(
'.barcode-edit-panel'
);

if (old) {
old.remove();
}

editing =
card.id;

if (els.left) {

if (els.menu) {

els.menu.style.display =
'none';

}

els.left.classList.add(
'editing'
);

}

const panel =
buildEditPanel(
card
);

host.appendChild(
panel
);

requestAnimationFrame(
() => {

panel.scrollTop =
0;

}
);

}

function hideEdit() {

editing = null;

[
els.left,
els.panel
].forEach(
host => {

if (!host) return;

const panel =
host.querySelector(
'.barcode-edit-panel'
);

if (panel) {
panel.remove();
}

}
);

if (els.left) {

els.left.classList.remove(
'editing'
);

}

if (els.menu) {

els.menu.style.display =
'';

}

}

function selectTemplate(id) {

if (!TEMPLATES[id]) {
return;
}

closeHistoryPanel();

state.current =
id;

if (editing) {

const c =
get(editing);

if (
!c ||
c.template !== id
) {

hideEdit();

}

}

render();

openBarcodePanel();

refreshTemplateSelector();

}

function keepDropdownOpen() {

if (!els.dropdown) {
return;
}

els.dropdown.classList.add(
DROPDOWN_OPEN_CLASS
);

const cards =
els.dropdown.querySelectorAll(
'.db-list-dropdown-card[data-barcode-template], .db-list-dropdown-card[data-barcode-history]'
);

cards.forEach(
item => {

item.style.removeProperty(
'display'
);

}
);

}

function createDropdown(
wrapper
) {

if (!wrapper) {
return;
}

if (
wrapper.dataset.loaded ===
'true'
) {

return;

}

Object.entries(
TEMPLATES
).forEach(
([id, template]) => {

const item =
document.createElement(
'div'
);

item.className =
'db-list-dropdown-card';

item.dataset.barcodeTemplate =
id;

const heading =
document.createElement(
'div'
);

heading.className =
'db-headingd-list';

heading.textContent =
template.name;

item.appendChild(
heading
);

wrapper.appendChild(
item
);

}
);

const historyItem =
document.createElement(
'div'
);

historyItem.className =
'db-list-dropdown-card';

historyItem.dataset.barcodeHistory =
'true';

const historyHeading =
document.createElement(
'div'
);

historyHeading.className =
'db-headingd-list';

historyHeading.textContent =
'Barcode History';

historyItem.appendChild(
historyHeading
);

wrapper.appendChild(
historyItem
);

wrapper.addEventListener(
'click',
function (e) {

const history =
e.target.closest(
'.db-list-dropdown-card[data-barcode-history]'
);

if (history) {

e.preventDefault();
e.stopPropagation();
e.stopImmediatePropagation();

openHistoryPanel();

closeDropdown();

return;

}

const item =
e.target.closest(
'.db-list-dropdown-card[data-barcode-template]'
);

if (!item) {
return;
}

e.preventDefault();
e.stopPropagation();
e.stopImmediatePropagation();

const selectedTemplate =
item.dataset.barcodeTemplate;

console.log(
'[barcode] template picked:',
selectedTemplate
);

selectTemplate(
selectedTemplate
);

keepDropdownOpen();

setTimeout(
keepDropdownOpen,
0
);

setTimeout(
keepDropdownOpen,
50
);

},
true
);

wrapper.dataset.loaded =
'true';

}

function closeDropdown() {

if (!els.dropdown) {
return;
}

els.dropdown.classList.remove(
DROPDOWN_OPEN_CLASS
);

}

function toggleDropdown() {

if (!els.dropdown) {
return;
}

const isOpen =
els.dropdown.classList.contains(
DROPDOWN_OPEN_CLASS
);

if (isOpen) {

closeDropdown();

} else {

keepDropdownOpen();

}

}

/* ----------------------------------------
   BARCODE HISTORY
---------------------------------------- */

async function createCommitHash(
payload
) {

const raw =
JSON.stringify(
payload
);

const data =
new TextEncoder().encode(
raw
);

const hashBuffer =
await crypto.subtle.digest(
'SHA-256',
data
);

return Array
.from(
new Uint8Array(
hashBuffer
)
)
.map(
b =>
b.toString(16).padStart(2, '0')
)
.join('')
.slice(0, 8)
.toUpperCase();

}

function getHistorySnapshot() {

return {

template:
state.current,

templateName:
TEMPLATES[state.current]
? TEMPLATES[state.current].name
: '',

cards:
state.cards.map(
card => ({

template:
card.template,

partNumber:
card.partNumber || '',

subtext:
card.subtext || '',

parts:
getCardParts(
card
).map(
part => ({
partNumber:
part.partNumber || '',
subtext:
part.subtext || '',
showBarcode:
Boolean(
part.showBarcode
)
})
),

showDate:
Boolean(
card.showDate
),

date:
card.date ||
getSystemDate(),

dateHeadingSize:
Number(
card.dateHeadingSize
) ||
DEFAULTS.dateHeadingSize,

dateSubtextSize:
Number(
card.dateSubtextSize
) ||
DEFAULTS.dateSubtextSize,

showQty:
Boolean(
card.showQty
),

manualQty:
Number(
card.manualQty
) >= 0
? Math.floor(
Number(
card.manualQty
)
)
: 0,

qtyHeadingSize:
Number(
card.qtyHeadingSize
) ||
DEFAULTS.qtyHeadingSize,

qtySubtextSize:
Number(
card.qtySubtextSize
) ||
DEFAULTS.qtySubtextSize,

partNumberSize:
Number(
card.partNumberSize
) ||
getTemplateDefaults(
card.template
).partNumberSize,

subtextSize:
Number(
card.subtextSize
) ||
getTemplateDefaults(
card.template
).subtextSize,

barcodeSize:
Number(
card.barcodeSize
) ||
getTemplateDefaults(
card.template
).barcodeSize

})
)

};

}

async function saveBarcodeCommit() {

if (!db) {

console.error(
'[barcode] Firebase db is not available.'
);

return null;

}

if (
!state.current ||
!state.cards.length
) {

console.warn(
'[barcode] Nothing to save to history.'
);

return null;

}

const date =
Date.now();

const snapshot =
getHistorySnapshot();

const hashPayload = {

date,

template:
snapshot.template,

cards:
snapshot.cards

};

let commitHash;

try {

commitHash =
await createCommitHash(
hashPayload
);

} catch (error) {

console.error(
'[barcode] Could not create commit hash:',
error
);

return null;

}

const commit = {

date,

commitHash,

template:
snapshot.template,

templateName:
snapshot.templateName,

cards:
snapshot.cards,

cardCount:
snapshot.cards.length

};

try {

const ref =
await addDoc(
collection(
db,
'barcode-commits'
),
commit
);

console.log(
'[barcode] barcode commit saved:',
commitHash,
ref.id
);

return {

id:
ref.id,

...commit

};

} catch (error) {

console.error(
'[barcode] Failed to save barcode commit:',
error
);

return null;

}

}

function formatHistoryDate(
timestamp
) {

const date =
new Date(
Number(timestamp)
);

if (
Number.isNaN(
date.getTime()
)
) {

return '-';

}

return date.toLocaleString(
'en-NZ',
{
day: '2-digit',
month: 'short',
year: 'numeric',
hour: 'numeric',
minute: '2-digit'
}
);

}

function getHistoryGroups(
cards
) {

const groups = [];

const map =
new Map();

(cards || []).forEach(
card => {

const partNumber =
cleanPartNumber(
card.partNumber
);

const description =
String(
card.subtext || ''
).trim();

const key =
partNumber +
'|' +
description;

if (!map.has(key)) {

const group = {

partNumber,

description,

qty: 0

};

map.set(
key,
group
);

groups.push(
group
);

}

map.get(key).qty++;

}
);

return groups;

}

function buildHistoryPanel() {

const panel =
document.querySelector(
'.barcode-history-panel'
);

if (!panel) {

console.warn(
'[barcode] History panel not found:',
'.barcode-history-panel'
);

return null;

}

panel.innerHTML = '';

const inner =
document.createElement(
'div'
);

inner.className =
'barcode-history-inner';

const header =
document.createElement(
'div'
);

header.className =
'barcode-history-header';

const title =
document.createElement(
'div'
);

title.className =
'barcode-history-title';

title.textContent =
'Barcode History';

const close =
document.createElement(
'button'
);

close.type =
'button';

close.className =
'barcode-history-close';

close.textContent =
'×';

close.setAttribute(
'aria-label',
'Close'
);

close.addEventListener(
'click',
closeHistoryPanel
);

header.append(
title,
close
);

const controls =
document.createElement(
'div'
);

controls.className =
'barcode-history-controls';

const select =
document.createElement(
'select'
);

select.className =
'barcode-history-select';

select.innerHTML =
'<option value="">Select a barcode commit...</option>';

select.addEventListener(
'change',
function () {

selectedHistoryId =
select.value ||
null;

renderHistoryPreview(
selectedHistoryId
);

}
);

const load =
document.createElement(
'button'
);

load.type =
'button';

load.className =
'barcode-history-load';

load.textContent =
'Load';

load.addEventListener(
'click',
loadSelectedHistory
);

controls.append(
select,
load
);

const status =
document.createElement(
'div'
);

status.className =
'barcode-history-status';

status.textContent =
'Loading barcode history...';

const list =
document.createElement(
'div'
);

list.className =
'barcode-history-list';

inner.append(
header,
controls,
status,
list
);

panel.appendChild(
inner
);

return {

panel,

select,

load,

status,

list

};

}

function openHistoryPanel() {

hideEdit();

closeBarcodePanel();

Object.keys(
TEMPLATES
).forEach(
id => {

const config =
TEMPLATES[id];

const templatePanel =
document.querySelector(
config.panel
);

if (
templatePanel
) {

templatePanel.style.setProperty(
'display',
'none',
'important'
);

}

}
);

const panel =
document.querySelector(
'.barcode-history-panel'
);

if (!panel) {

console.warn(
'[barcode] History panel not found:',
'.barcode-history-panel'
);

return;

}

panel.style.setProperty(
'display',
'block',
'important'
);

const ui =
buildHistoryPanel();

if (!ui) {
return;
}

selectedHistoryId =
null;

loadBarcodeHistory(
ui
);

}

function closeHistoryPanel() {

const panel =
document.querySelector(
'.barcode-history-panel'
);

if (panel) {

panel.style.removeProperty(
'display'
);

}

selectedHistoryId =
null;

}

async function loadBarcodeHistory(
ui
) {

if (!db) {

ui.status.textContent =
'Firebase database is unavailable.';

return;

}

try {

const snapshot =
await getDocs(
collection(
db,
'barcode-commits'
)
);

barcodeHistory =
snapshot.docs
.map(
doc => ({

id:
doc.id,

...doc.data()

})
)
.sort(
(a, b) =>
Number(
b.date || 0
) -
Number(
a.date || 0
)
);

ui.select.innerHTML =
'<option value="">Select a barcode commit...</option>';

barcodeHistory.forEach(
commit => {

const option =
document.createElement(
'option'
);

option.value =
commit.id;

option.textContent =
formatHistoryDate(
commit.date
) +
' — ' +
(
commit.commitHash ||
'-'
);

ui.select.appendChild(
option
);

}
);

ui.status.textContent =
barcodeHistory.length +
' saved commit' +
(
barcodeHistory.length === 1
? ''
: 's'
);

if (!barcodeHistory.length) {

ui.list.innerHTML =
'<div class="barcode-history-empty">' +
'No barcode history has been saved yet.' +
'</div>';

return;

}

ui.list.innerHTML =
'<div class="barcode-history-empty">' +
'Select a commit above to view its saved labels.' +
'</div>';

} catch (error) {

console.error(
'[barcode] Failed to load barcode history:',
error
);

ui.status.textContent =
'Unable to load barcode history.';

ui.list.innerHTML =
'<div class="barcode-history-empty">' +
'There was a problem loading barcode history.' +
'</div>';

}

}

function renderHistoryPreview(
historyId
) {

const panel =
document.querySelector(
'.barcode-history-panel'
);

if (!panel) {
return;
}

const list =
panel.querySelector(
'.barcode-history-list'
);

if (!list) {
return;
}

const commit =
barcodeHistory.find(
item =>
item.id === historyId
);

if (!commit) {

list.innerHTML =
'<div class="barcode-history-empty">' +
'Select a commit above to view its saved labels.' +
'</div>';

return;

}

const groups =
getHistoryGroups(
commit.cards
);

if (!groups.length) {

list.innerHTML =
'<div class="barcode-history-empty">' +
'This commit contains no barcode labels.' +
'</div>';

return;

}

const table =
document.createElement(
'table'
);

table.className =
'barcode-history-table';

const thead =
document.createElement(
'thead'
);

const headerRow =
document.createElement(
'tr'
);

[
'Part Number',
'Description',
'Qty',
'Stock QTY'
].forEach(
text => {

const th =
document.createElement(
'th'
);

th.textContent =
text;

headerRow.appendChild(
th
);

}
);

thead.appendChild(
headerRow
);

const tbody =
document.createElement(
'tbody'
);

groups.forEach(
group => {

const tr =
document.createElement(
'tr'
);

const part =
document.createElement(
'td'
);

part.className =
'barcode-history-part';

part.textContent =
group.partNumber;

const description =
document.createElement(
'td'
);

description.className =
'barcode-history-description';

description.textContent =
group.description;

const qty =
document.createElement(
'td'
);

qty.className =
'barcode-history-qty';

qty.textContent =
String(
group.qty
);

tr.append(
part,
description,
qty
);

tbody.appendChild(
tr
);

}
);

table.append(
thead,
tbody
);

list.innerHTML = '';

list.appendChild(
table
);

}

function loadSelectedHistory() {

if (!selectedHistoryId) {

console.warn(
'[barcode] No history commit selected.'
);

return;

}

const commit =
barcodeHistory.find(
item =>
item.id === selectedHistoryId
);

if (!commit) {

console.warn(
'[barcode] Selected history commit not found:',
selectedHistoryId
);

return;

}

if (
!TEMPLATES[
commit.template
]
) {

console.warn(
'[barcode] Saved template no longer exists:',
commit.template
);

return;

}

state.cards =
(commit.cards || []).map(
card =>
cardData({

template:
card.template ||
commit.template,

partNumber:
card.partNumber || '',

subtext:
card.subtext || '',

parts:
Array.isArray(
card.parts
) &&
card.parts.length
? card.parts.map(
part => ({
partNumber:
part.partNumber || '',
subtext:
part.subtext || '',
showBarcode:
typeof part.showBarcode === 'boolean'
? part.showBarcode
: true
})
)
: [
{
partNumber:
card.partNumber || '',
subtext:
card.subtext || '',
showBarcode:
true
}
],

showDate:
card.showDate,

date:
card.date,

dateHeadingSize:
card.dateHeadingSize,

dateSubtextSize:
card.dateSubtextSize,

showQty:
card.showQty,

manualQty:
card.manualQty,

qtyHeadingSize:
card.qtyHeadingSize,

qtySubtextSize:
card.qtySubtextSize,

partNumberSize:
card.partNumberSize,

subtextSize:
card.subtextSize,

barcodeSize:
card.barcodeSize

})
);

state.current =
commit.template;

selectedHistoryId =
null;

closeHistoryPanel();

render();

openBarcodePanel();

console.log(
'[barcode] Loaded barcode commit:',
commit.commitHash
);

}

/* ----------------------------------------
   LABEL TEMPLATES (KeyAccounts saved layouts)
---------------------------------------- */

function getTemplateSelect() {

const host =
$('.label-template-selector');

if (
host &&
host.tagName === 'SELECT'
) {

return host;

}

if (host) {

const inner =
host.querySelector(
'select'
);

if (inner) {
return inner;
}

}

if (
els.templateWrapper
) {

const inner =
els.templateWrapper.querySelector(
'select'
);

if (inner) {
return inner;
}

}

return (
els.templateSelect ||
null
);

}

function getLabelTemplateSnapshot() {

const snapshot =
getHistorySnapshot();

return {
template:
snapshot.template,
cards:
snapshot.cards
};

}

function closeSaveTemplateModal() {

if (!saveTemplateModal) {
return;
}

saveTemplateModal.remove();

saveTemplateModal = null;

}

function openSaveTemplateModal() {

const role =
getUserRole();

if (
role !== 'KeyAccounts' &&
role !== 'Developer'
) {

return;

}

if (
!state.current
) {

alert(
'Select a label template first.'
);

return;

}

const currentCards =
state.cards.filter(
card =>
card.template ===
state.current
);

if (!currentCards.length) {

alert(
'Add at least one label before saving a template.'
);

return;

}

closeSaveTemplateModal();

const modal =
document.createElement(
'div'
);

modal.className =
'barcode-quickimp-modal';

modal.setAttribute(
'role',
'dialog'
);

modal.setAttribute(
'aria-modal',
'true'
);

const box =
document.createElement(
'div'
);

box.className =
'barcode-quickimp-modal-box';

box.style.maxWidth =
'480px';

const header =
document.createElement(
'div'
);

header.className =
'barcode-quickimp-modal-header';

const title =
document.createElement(
'h2'
);

title.className =
'barcode-quickimp-modal-title';

title.textContent =
'Save Label Template';

const closeButton =
document.createElement(
'button'
);

closeButton.type =
'button';

closeButton.className =
'barcode-quickimp-modal-close';

closeButton.textContent =
'×';

closeButton.setAttribute(
'aria-label',
'Close'
);

closeButton.addEventListener(
'click',
closeSaveTemplateModal
);

header.append(
title,
closeButton
);

const body =
document.createElement(
'div'
);

body.className =
'barcode-quickimp-modal-body';

const description =
document.createElement(
'p'
);

description.className =
'barcode-quickimp-description';

description.textContent =
'Name this layout. It will be saved for the current template type (' +
(
TEMPLATES[state.current]
? TEMPLATES[state.current].name
: state.current
) +
') with all card settings and text.';

const input =
document.createElement(
'input'
);

input.className =
'barcode-template-name-input';

input.type =
'text';

input.placeholder =
'Template name...';

input.maxLength =
80;

const error =
document.createElement(
'div'
);

error.className =
'barcode-template-error';

body.append(
description,
input,
error
);

const footer =
document.createElement(
'div'
);

footer.className =
'barcode-quickimp-modal-footer';

const cancel =
document.createElement(
'button'
);

cancel.type =
'button';

cancel.className =
'barcode-quickimp-button';

cancel.textContent =
'Cancel';

cancel.addEventListener(
'click',
closeSaveTemplateModal
);

const save =
document.createElement(
'button'
);

save.type =
'button';

save.className =
'barcode-quickimp-button primary';

save.textContent =
'Save Template';

save.addEventListener(
'click',
async function () {

const name =
String(
input.value || ''
).trim();

if (!name) {

error.textContent =
'Enter a template name.';

input.focus();

return;

}

error.textContent =
'';

if (!db) {

error.textContent =
'Database unavailable.';

return;

}

save.disabled =
true;

try {

const snapshot =
getLabelTemplateSnapshot();

const docData = {

name,

template:
snapshot.template,

cards:
snapshot.cards.filter(
card =>
card.template ===
snapshot.template
),

date:
Date.now()

};

if (!docData.cards.length) {

error.textContent =
'No labels for this template type to save.';

save.disabled =
false;

return;

}

const ref =
await addDoc(
collection(
db,
'label-templates'
),
docData
);

console.log(
'[barcode] label template saved:',
name,
ref.id
);

closeSaveTemplateModal();

refreshTemplateSelector();

} catch (err) {

console.error(
'[barcode] Failed to save label template:',
err
);

error.textContent =
'Could not save. Try again.';

save.disabled =
false;

}

}
);

footer.append(
cancel,
save
);

box.append(
header,
body,
footer
);

modal.appendChild(
box
);

modal.addEventListener(
'click',
function (e) {

if (
e.target === modal
) {

closeSaveTemplateModal();

}

}
);

document.body.appendChild(
modal
);

saveTemplateModal =
modal;

setTimeout(
() => input.focus(),
50
);

}

async function refreshTemplateSelector() {

const list =
getTemplateSelect();

if (list) {

els.templateSelect =
list;

}

if (!list) {
return;
}

const templateType =
state.current;

list.innerHTML =
'<option value="">Select a saved template...</option>';

list.disabled =
false;

if (!templateType) {

list.innerHTML =
'<option value="">Select a label template first</option>';

list.disabled =
true;

return;

}

if (!db) {

list.innerHTML =
'<option value="">Database unavailable</option>';

list.disabled =
true;

return;

}

try {

const snapshot =
await getDocs(
collection(
db,
'label-templates'
)
);

labelTemplates =
snapshot.docs
.map(
doc => ({

id:
doc.id,

...doc.data()

})
)
.filter(
item =>
item.template ===
templateType
)
.sort(
(a, b) =>
Number(
b.date || 0
) -
Number(
a.date || 0
)
);

if (!labelTemplates.length) {

list.innerHTML =
'<option value="">No saved templates for this label type</option>';

list.disabled =
true;

return;

}

list.disabled =
false;

labelTemplates.forEach(
item => {

const option =
document.createElement(
'option'
);

option.value =
item.id;

option.textContent =
String(
item.name ||
'Untitled'
);

list.appendChild(
option
);

}
);

} catch (error) {

console.error(
'[barcode] Failed to load label templates:',
error
);

list.innerHTML =
'<option value="">Could not load templates</option>';

list.disabled =
true;

}

}

function applyLabelTemplateById(
templateId
) {

const item =
labelTemplates.find(
entry =>
entry.id ===
templateId
);

if (!item) {
return;
}

if (
!TEMPLATES[
item.template
]
) {

console.warn(
'[barcode] Saved template type no longer exists:',
item.template
);

return;

}

const existingCount =
state.cards.filter(
card =>
card.template ===
item.template
).length;

const doApply = () => {

state.cards =
state.cards.filter(
card =>
card.template !==
item.template
);

(item.cards || []).forEach(
saved => {

const fresh =
cardData({
...saved,
template:
saved.template ||
item.template
});

state.cards.push(
fresh
);

}
);

state.current =
item.template;

if (
els.templateSelect
) {

els.templateSelect.value =
'';

}

hideEdit();

render();

openBarcodePanel();

refreshTemplateSelector();

console.log(
'[barcode] Applied label template:',
item.name
);

};

if (existingCount > 0) {

openTemplateOverwriteConfirm(
item,
existingCount,
doApply
);

return;

}

doApply();

}

function openTemplateOverwriteConfirm(
item,
existingCount,
onConfirm
) {

const modal =
document.createElement(
'div'
);

modal.className =
'barcode-clear-confirm-modal';

modal.setAttribute(
'role',
'dialog'
);

modal.setAttribute(
'aria-modal',
'true'
);

const box =
document.createElement(
'div'
);

box.className =
'barcode-clear-confirm-box';

const header =
document.createElement(
'div'
);

header.className =
'barcode-clear-confirm-header';

const title =
document.createElement(
'h2'
);

title.className =
'barcode-clear-confirm-title';

title.textContent =
'Load Template';

const closeButton =
document.createElement(
'button'
);

closeButton.type =
'button';

closeButton.className =
'barcode-clear-confirm-close';

closeButton.textContent =
'×';

closeButton.setAttribute(
'aria-label',
'Close'
);

const close = () => {

modal.classList.remove(
'is-visible'
);

setTimeout(
() => modal.remove(),
180
);

};

closeButton.addEventListener(
'click',
close
);

header.append(
title,
closeButton
);

const body =
document.createElement(
'div'
);

body.className =
'barcode-clear-confirm-body';

const message =
document.createElement(
'p'
);

message.className =
'barcode-clear-confirm-message';

message.innerHTML =
'Load template "' +
String(
item.name ||
''
).replace(
/</g,
'&lt;'
) +
'"? This will replace ' +
'<span class="barcode-clear-confirm-count">' +
existingCount +
'</span> current label' +
(
existingCount === 1
? ''
: 's'
) +
' for this template type.';

body.appendChild(
message
);

const footer =
document.createElement(
'div'
);

footer.className =
'barcode-clear-confirm-footer';

const cancel =
document.createElement(
'button'
);

cancel.type =
'button';

cancel.className =
'barcode-clear-confirm-button';

cancel.textContent =
'Cancel';

cancel.addEventListener(
'click',
close
);

const confirm =
document.createElement(
'button'
);

confirm.type =
'button';

confirm.className =
'barcode-clear-confirm-button danger';

confirm.textContent =
'Load Template';

confirm.addEventListener(
'click',
function () {

close();

onConfirm();

}
);

footer.append(
cancel,
confirm
);

box.append(
header,
body,
footer
);

modal.appendChild(
box
);

modal.addEventListener(
'click',
function (e) {

if (
e.target === modal
) {

close();

}

}
);

document.body.appendChild(
modal
);

requestAnimationFrame(
() => {

modal.classList.add(
'is-visible'
);

}
);

setTimeout(
() => confirm.focus(),
50
);

}

function setupSaveTemplate() {

const target =
els.saveButton ||
$('.label-save-template-button') ||
(
els.saveWrapper
? els.saveWrapper.querySelector(
'button'
)
: null
) ||
els.saveWrapper;

if (
els.saveWrapper &&
!els.saveButton &&
target
) {

els.saveButton =
target;

}

if (!target) {
return;
}

if (
target.dataset.templateReady ===
'true'
) {

return;

}

target.dataset.templateReady =
'true';

target.addEventListener(
'click',
function (e) {

e.preventDefault();
e.stopPropagation();

openSaveTemplateModal();

}
);

}

function setupTemplateSelector() {

const list =
getTemplateSelect();

if (list) {

els.templateSelect =
list;

}

if (!list) {
return;
}

if (
list.dataset.templateReady ===
'true'
) {

refreshTemplateSelector();

return;

}

list.dataset.templateReady =
'true';

list.addEventListener(
'change',
function () {

const value =
list.value ||
'';

if (!value) {
return;
}

applyLabelTemplateById(
value
);

}
);

refreshTemplateSelector();

}

/* ----------------------------------------
   PRINT
---------------------------------------- */

function preparePrint() {

const old =
document.getElementById(
'barcode-print-root'
);

if (old) {
old.remove();
}

const stray =
document.getElementById(
'np-print-root'
);

if (stray) {
stray.remove();
}

const config =
TEMPLATES[
state.current
];

if (!config) {

console.warn(
'[barcode] No template selected to print.'
);

return null;

}

const panel =
document.querySelector(
config.panel
);

if (!panel) {

console.warn(
'[barcode] Selected template panel not found:',
state.current
);

return null;

}

const pages =
panel.querySelectorAll(
'.barcode-page'
);

if (!pages.length) {

console.warn(
'[barcode] No .barcode-page elements found in selected template:',
state.current
);

return null;

}

const printRoot =
document.createElement(
'div'
);

printRoot.id =
'barcode-print-root';

printRoot.style.setProperty(
'display',
'block',
'important'
);

printRoot.style.setProperty(
'visibility',
'visible',
'important'
);

printRoot.style.setProperty(
'opacity',
'1',
'important'
);

pages.forEach(
page => {

const clone =
page.cloneNode(
true
);

clone.style.setProperty(
'display',
'block',
'important'
);

clone.style.setProperty(
'visibility',
'visible',
'important'
);

clone.style.setProperty(
'opacity',
'1',
'important'
);

clone
.querySelectorAll(
'.barcode-card-overlay, .barcode-edit-panel'
)
.forEach(
el => el.remove()
);

printRoot.appendChild(
clone
);

}
);

document.body.appendChild(
printRoot
);

return printRoot;

}

function parseCSV(text) {

const rows = [];

let row = [];
let cell = '';
let quoted = false;

for (
let i = 0;
i < text.length;
i++
) {

const char =
text[i];

const next =
text[i + 1];

if (
char === '"' &&
quoted &&
next === '"'
) {

cell += '"';

i++;

continue;

}

if (char === '"') {

quoted =
!quoted;

continue;

}

if (
char === ',' &&
!quoted
) {

row.push(
cell
);

cell = '';

continue;

}

if (
(
char === '\n' ||
char === '\r'
) &&
!quoted
) {

if (
char === '\r' &&
next === '\n'
) {

i++;

}

row.push(
cell
);

cell = '';

if (
row.some(
value =>
String(
value
).trim() !== ''
)
) {

rows.push(
row
);

}

row = [];

continue;

}

cell += char;

}

row.push(
cell
);

if (
row.some(
value =>
String(
value
).trim() !== ''
)
) {

rows.push(
row
);

}

if (!rows.length) {
return [];
}

const headers =
rows
.shift()
.map(
header =>
String(header)
.replace(
/^\uFEFF/,
''
)
.trim()
);

return rows.map(
row => {

const item = {};

headers.forEach(
(
header,
index
) => {

item[header] =
String(
row[index] ?? ''
).trim();

}
);

return item;

}
);

}

/* ----------------------------------------
   QUICK IMPORT
---------------------------------------- */

function closeQuickImportModal() {

if (!quickImportModal) {
return;
}

quickImportModal.remove();

quickImportModal = null;

}

function parseQuickDelimitedLine(
line,
delimiter
) {

const cells = [];

let cell = '';
let quoted = false;

for (
let i = 0;
i < line.length;
i++
) {

const char =
line[i];

const next =
line[i + 1];

if (
char === '"' &&
quoted &&
next === '"'
) {

cell += '"';

i++;

continue;

}

if (char === '"') {

quoted =
!quoted;

continue;

}

if (
char === delimiter &&
!quoted
) {

cells.push(
cell
);

cell = '';

continue;

}

cell += char;

}

cells.push(
cell
);

return cells;

}

function normaliseQuickHeader(
value
) {

return String(
value ?? ''
)
.replace(
/^\uFEFF/,
''
)
.replace(
/^"|"$/g,
''
)
.trim()
.toLowerCase()
.replace(
/\s+/g,
' '
);

}

function parseQuickImport(
text
) {

const lines =
String(
text || ''
)
.replace(
/\r\n/g,
'\n'
)
.replace(
/\r/g,
'\n'
)
.split('\n')
.filter(
line =>
line.trim() !== ''
);

if (!lines.length) {
return [];
}

let headerIndex =
-1;

let delimiter =
'\t';

for (
let i = 0;
i < lines.length;
i++
) {

const testDelimiter =
lines[i].includes('\t')
? '\t'
: ',';

const cells =
parseQuickDelimitedLine(
lines[i],
testDelimiter
);

const headers =
cells.map(
normaliseQuickHeader
);

const hasStockCode =
headers.includes(
'stock code'
);

const hasDescription =
headers.includes(
'description'
);

const hasQty =
headers.includes(
'qty'
);

if (
hasStockCode &&
hasDescription &&
hasQty
) {

headerIndex =
i;

delimiter =
testDelimiter;

break;

}

}

if (headerIndex === -1) {
return [];
}

const headers =
parseQuickDelimitedLine(
lines[headerIndex],
delimiter
)
.map(
normaliseQuickHeader
);

const stockCodeIndex =
headers.indexOf(
'stock code'
);

const descriptionIndex =
headers.indexOf(
'description'
);

const qtyIndex =
headers.indexOf(
'qty'
);

if (
stockCodeIndex === -1 ||
descriptionIndex === -1 ||
qtyIndex === -1
) {

return [];

}

const rows = [];

for (
let i = headerIndex + 1;
i < lines.length;
i++
) {

const cells =
parseQuickDelimitedLine(
lines[i],
delimiter
);

/* CHANGED: imported part number now gets # */
const partNumber =
importedPartNumber(
cells[stockCodeIndex] || ''
);

if (!partNumber) {
continue;
}

const description =
String(
cells[descriptionIndex] || ''
)
.trim();

let qty =
parseInt(
String(
cells[qtyIndex] || ''
)
.trim(),
10
);

if (
!Number.isFinite(qty) ||
qty < 1
) {

qty = 1;

}

rows.push({
partNumber,
description,
qty,
stockQty: 0
});

}

return rows;

}

function renderQuickImportPreview(
rows,
tbody,
summary,
empty,
error,
qtyInputs,
stockQtyInputs,
isStockEnabled
) {

tbody.innerHTML = '';

qtyInputs.length = 0;

if (stockQtyInputs) {

stockQtyInputs.length = 0;

}

if (!rows.length) {

empty.style.display =
'block';

summary.textContent =
'No valid rows found';

return;

}

empty.style.display =
'none';

let total = 0;

rows.forEach(
row => {

const tr =
document.createElement(
'tr'
);

const partCell =
document.createElement(
'td'
);

partCell.className =
'barcode-quickimp-preview-part';

partCell.textContent =
row.partNumber;

const descriptionCell =
document.createElement(
'td'
);

descriptionCell.className =
'barcode-quickimp-preview-description';

descriptionCell.textContent =
row.description || '';

const qtyCell =
document.createElement(
'td'
);

const qty =
document.createElement(
'input'
);

qty.type =
'number';

qty.min =
'1';

qty.step =
'1';

qty.className =
'barcode-quickimp-preview-qty';

qty.value =
String(
Math.max(
1,
parseInt(
row.qty,
10
) || 1
)
);

qty.addEventListener(
'input',
function () {

let value =
parseInt(
qty.value,
10
);

if (
!Number.isFinite(value) ||
value < 1
) {

value = 1;

}

qty.value =
value;

row.qty =
value;

updateQuickImportSummary(
summary,
rows,
qtyInputs
);

}
);

qtyInputs.push(
qty
);

qtyCell.appendChild(
qty
);

const stockQtyCell =
document.createElement(
'td'
);

const stockQty =
document.createElement(
'input'
);

stockQty.type =
'number';

stockQty.min =
'0';

stockQty.step =
'1';

stockQty.className =
'barcode-quickimp-preview-stockqty';

stockQty.title =
'Stock QTY shown on the label (separate from Qty labels to create)';

stockQty.value =
String(
Math.max(
0,
parseInt(
row.stockQty,
10
) || 0
)
);

stockQty.disabled =
!isStockEnabled;

stockQty.addEventListener(
'input',
function () {

let value =
parseInt(
stockQty.value,
10
);

if (
!Number.isFinite(value) ||
value < 0
) {

value = 0;

}

stockQty.value =
value;

row.stockQty =
value;

}
);

if (stockQtyInputs) {

stockQtyInputs.push(
stockQty
);

}

stockQtyCell.appendChild(
stockQty
);

tr.append(
partCell,
descriptionCell,
qtyCell,
stockQtyCell
);

tbody.appendChild(
tr
);

total +=
Math.max(
1,
parseInt(
row.qty,
10
) || 1
);

}
);

summary.textContent =
total +
' label' +
(
total === 1
? ''
: 's'
) +
' ready to import';

if (error) {

error.textContent =
'';

}

}

function updateQuickImportSummary(
summary,
rows,
qtyInputs
) {

let total = 0;

qtyInputs.forEach(
input => {

let value =
parseInt(
input.value,
10
);

if (
!Number.isFinite(value) ||
value < 1
) {

value = 1;

}

total +=
value;

}
);

summary.textContent =
total +
' label' +
(
total === 1
? ''
: 's'
) +
' ready to import';

}

function openQuickImportModal() {

closeQuickImportModal();

const modal =
document.createElement(
'div'
);

modal.className =
'barcode-quickimp-modal';

modal.setAttribute(
'role',
'dialog'
);

modal.setAttribute(
'aria-modal',
'true'
);

const box =
document.createElement(
'div'
);

box.className =
'barcode-quickimp-modal-box';

const header =
document.createElement(
'div'
);

header.className =
'barcode-quickimp-modal-header';

const title =
document.createElement(
'h2'
);

title.className =
'barcode-quickimp-modal-title';

title.textContent =
'Quick Import';

const closeButton =
document.createElement(
'button'
);

closeButton.type =
'button';

closeButton.className =
'barcode-quickimp-modal-close';

closeButton.textContent =
'×';

closeButton.setAttribute(
'aria-label',
'Close'
);

closeButton.addEventListener(
'click',
closeQuickImportModal
);

header.append(
title,
closeButton
);

const body =
document.createElement(
'div'
);

body.className =
'barcode-quickimp-modal-body';

const description =
document.createElement(
'p'
);

description.className =
'barcode-quickimp-description';

description.textContent =
'Paste your order data below. Quick Import only uses Stock Code, Description and Qty.';

const textarea =
document.createElement(
'textarea'
);

textarea.className =
'barcode-quickimp-textarea';

textarea.placeholder =
'Paste order data here...';

textarea.spellcheck =
false;

const options =
document.createElement(
'div'
);

options.className =
'barcode-quickimp-options';

const label =
document.createElement(
'label'
);

label.className =
'barcode-quickimp-checkbox-label';

const checkbox =
document.createElement(
'input'
);

checkbox.type =
'checkbox';

checkbox.className =
'barcode-quickimp-checkbox';

checkbox.checked =
true;

const labelText =
document.createElement(
'span'
);

labelText.textContent =
'Part Number + Description';

label.append(
checkbox,
labelText
);

const dateLabel =
document.createElement(
'label'
);

dateLabel.className =
'barcode-quickimp-checkbox-label';

const dateCheckbox =
document.createElement(
'input'
);

dateCheckbox.type =
'checkbox';

dateCheckbox.className =
'barcode-quickimp-checkbox';

dateCheckbox.checked =
false;

const dateLabelText =
document.createElement(
'span'
);

dateLabelText.textContent =
'Date';

dateLabelText.title =
'Uses system date on the label';

dateLabel.append(
dateCheckbox,
dateLabelText
);

const stockLabel =
document.createElement(
'label'
);

stockLabel.className =
'barcode-quickimp-checkbox-label';

const stockCheckbox =
document.createElement(
'input'
);

stockCheckbox.type =
'checkbox';

stockCheckbox.className =
'barcode-quickimp-checkbox';

stockCheckbox.checked =
false;

const stockLabelText =
document.createElement(
'span'
);

stockLabelText.textContent =
'Stock QTY';

stockLabelText.title =
'Stock amount shown on the label (separate from Qty labels to create)';

stockLabel.append(
stockCheckbox,
stockLabelText
);

const summary =
document.createElement(
'div'
);

summary.className =
'barcode-quickimp-summary';

summary.textContent =
'No data pasted';

options.append(
label,
dateLabel,
stockLabel,
summary
);

const previewTitle =
document.createElement(
'div'
);

previewTitle.className =
'barcode-quickimp-preview-title';

previewTitle.textContent =
'Preview';

const previewWrap =
document.createElement(
'div'
);

previewWrap.className =
'barcode-quickimp-preview-wrap';

const table =
document.createElement(
'table'
);

table.className =
'barcode-quickimp-preview';

const thead =
document.createElement(
'thead'
);

const headerRow =
document.createElement(
'tr'
);

[
'Part Number',
'Description',
'Qty',
'Stock QTY'
].forEach(
text => {

const th =
document.createElement(
'th'
);

th.textContent =
text;

headerRow.appendChild(
th
);

}
);

thead.appendChild(
headerRow
);

const tbody =
document.createElement(
'tbody'
);

const empty =
document.createElement(
'div'
);

empty.className =
'barcode-quickimp-empty';

empty.textContent =
'Paste order data above to preview the labels.';

const error =
document.createElement(
'div'
);

error.className =
'barcode-quickimp-error';

previewWrap.appendChild(
table
);

table.append(
thead,
tbody
);

const qtyInputs = [];

const stockQtyInputs = [];

let parsedRows = [];

function refreshPreview() {

parsedRows =
parseQuickImport(
textarea.value
);

renderQuickImportPreview(
parsedRows,
tbody,
summary,
empty,
error,
qtyInputs,
stockQtyInputs,
stockCheckbox.checked
);

}

textarea.addEventListener(
'input',
refreshPreview
);

checkbox.addEventListener(
'change',
function () {

const template =
state.current ||
DEFAULTS.template;

if (!parsedRows.length) {
return;
}

parsedRows.forEach(
row => {

if (checkbox.checked) {

row.description =
simplifyDescription(
row.description,
template
);

}

}
);

renderQuickImportPreview(
parsedRows,
tbody,
summary,
empty,
error,
qtyInputs,
stockQtyInputs,
stockCheckbox.checked
);

}
);

stockCheckbox.addEventListener(
'change',
function () {

if (!parsedRows.length) {
return;
}

renderQuickImportPreview(
parsedRows,
tbody,
summary,
empty,
error,
qtyInputs,
stockQtyInputs,
stockCheckbox.checked
);

}
);

const previewContainer =
document.createElement(
'div'
);

previewContainer.append(
previewTitle,
previewWrap,
empty,
error
);

body.append(
description,
textarea,
options,
previewContainer
);

const footer =
document.createElement(
'div'
);

footer.className =
'barcode-quickimp-modal-footer';

const cancel =
document.createElement(
'button'
);

cancel.type =
'button';

cancel.className =
'barcode-quickimp-button';

cancel.textContent =
'Cancel';

cancel.addEventListener(
'click',
closeQuickImportModal
);

const importButton =
document.createElement(
'button'
);

importButton.type =
'button';

importButton.className =
'barcode-quickimp-button primary';

importButton.textContent =
'Import Labels';

importButton.addEventListener(
'click',
function () {

if (!parsedRows.length) {

error.textContent =
'No valid Stock Code, Description and Qty data was found.';

return;

}

const template =
state.current ||
DEFAULTS.template;

const useDescription =
checkbox.checked;

const useDate =
dateCheckbox.checked;

const useStockQty =
stockCheckbox.checked;

let imported =
0;

parsedRows.forEach(
(row, index) => {

let qtyValue =
parseInt(
qtyInputs[index]?.value ??
row.qty,
10
);

if (
!Number.isFinite(qtyValue) ||
qtyValue < 1
) {

qtyValue = 1;

}

let stockQtyValue =
parseInt(
stockQtyInputs[index]?.value ??
row.stockQty ??
0,
10
);

if (
!Number.isFinite(stockQtyValue) ||
stockQtyValue < 0
) {

stockQtyValue = 0;

}

const description =
useDescription
? simplifyDescription(
row.description,
template
)
: '';

for (
let i = 0;
i < qtyValue;
i++
) {

const card =
cardData({
template,
partNumber:
row.partNumber,
subtext:
description,
parts:
isKeyAccounts()
? [
{
partNumber:
row.partNumber,
subtext:
description,
showBarcode:
false
}
]
: undefined,
showDate:
useDate,
date:
getSystemDate(),
showQty:
useStockQty,
manualQty:
useStockQty
? stockQtyValue
: 0
});

state.cards.push(
card
);

imported++;

}

}
);

state.current =
template;

closeQuickImportModal();

render();

showCSVSuccess(
imported
);

}
);

footer.append(
cancel,
importButton
);

box.append(
header,
body,
footer
);

modal.appendChild(
box
);

modal.addEventListener(
'click',
function (e) {

if (
e.target === modal
) {

closeQuickImportModal();

}

}
);

document.body.appendChild(
modal
);

quickImportModal =
modal;

setTimeout(
() => textarea.focus(),
50
);

}

/* ----------------------------------------
   CSV IMPORT POPUP
---------------------------------------- */

function closeCSVModal() {

if (!csvModal) {
return;
}

csvModal.remove();
csvModal = null;

}

function updateCSVModalSummary(
rows,
qtyInputs
) {

if (!csvModal) {
return;
}

const total =
qtyInputs.reduce(
(sum, input) =>
sum +
Math.max(
1,
parseInt(
input.value,
10
) || 1
),
0
);

const summary =
csvModal.querySelector(
'.barcode-csv-summary'
);

if (summary) {

summary.textContent =
total +
' label' +
(
total === 1
? ''
: 's'
) +
' will be created';

}

}

function showCSVSuccess(count) {

const modal =
document.createElement(
'div'
);

modal.className =
'barcode-csv-modal';

modal.setAttribute(
'role',
'dialog'
);

modal.setAttribute(
'aria-modal',
'true'
);

const box =
document.createElement(
'div'
);

box.className =
'barcode-csv-modal-box';

box.style.maxWidth =
'420px';

const header =
document.createElement(
'div'
);

header.className =
'barcode-csv-modal-header';

const title =
document.createElement(
'h2'
);

title.className =
'barcode-csv-modal-title';

title.textContent =
'Import Complete';

const closeButton =
document.createElement(
'button'
);

closeButton.type =
'button';

closeButton.className =
'barcode-csv-modal-close';

closeButton.textContent =
'×';

closeButton.setAttribute(
'aria-label',
'Close'
);

header.append(
title,
closeButton
);

const message =
document.createElement(
'div'
);

message.className =
'barcode-csv-success-message';

message.innerHTML =
'<span class="barcode-csv-success-count">' +
count +
'</span> label' +
(
count === 1
? ''
: 's'
) +
' imported successfully.';

const footer =
document.createElement(
'div'
);

footer.className =
'barcode-csv-modal-footer';

const doneButton =
document.createElement(
'button'
);

doneButton.type =
'button';

doneButton.className =
'barcode-csv-button primary';

doneButton.textContent =
'Done';

function closeSuccess() {

modal.remove();

}

closeButton.addEventListener(
'click',
closeSuccess
);

doneButton.addEventListener(
'click',
closeSuccess
);

footer.appendChild(
doneButton
);

box.append(
header,
message,
footer
);

modal.appendChild(
box
);

modal.addEventListener(
'click',
function (e) {

if (e.target === modal) {
closeSuccess();
}

}
);

document.body.appendChild(
modal
);

setTimeout(
() => doneButton.focus(),
50
);

}

function openCSVModal(
rows,
titleText = 'Import CSV'
) {

closeCSVModal();

const modal =
document.createElement(
'div'
);

modal.className =
'barcode-csv-modal';

modal.setAttribute(
'role',
'dialog'
);

modal.setAttribute(
'aria-modal',
'true'
);

const box =
document.createElement(
'div'
);

box.className =
'barcode-csv-modal-box';

const header =
document.createElement(
'div'
);

header.className =
'barcode-csv-modal-header';

const title =
document.createElement(
'h2'
);

title.className =
'barcode-csv-modal-title';

title.textContent =
titleText;

const closeButton =
document.createElement(
'button'
);

closeButton.type =
'button';

closeButton.className =
'barcode-csv-modal-close';

closeButton.textContent =
'×';

closeButton.setAttribute(
'aria-label',
'Close'
);

closeButton.addEventListener(
'click',
closeCSVModal
);

header.append(
title,
closeButton
);

const options =
document.createElement(
'div'
);

options.className =
'barcode-csv-modal-options';

const label =
document.createElement(
'label'
);

label.className =
'barcode-csv-checkbox-label';

const checkbox =
document.createElement(
'input'
);

checkbox.type =
'checkbox';

checkbox.className =
'barcode-csv-checkbox';

checkbox.checked =
true;

const labelText =
document.createElement(
'span'
);

labelText.textContent =
'Part Number + Description';

label.append(
checkbox,
labelText
);

const dateLabel =
document.createElement(
'label'
);

dateLabel.className =
'barcode-csv-checkbox-label';

const dateCheckbox =
document.createElement(
'input'
);

dateCheckbox.type =
'checkbox';

dateCheckbox.className =
'barcode-csv-checkbox';

dateCheckbox.checked =
false;

const dateLabelText =
document.createElement(
'span'
);

dateLabelText.textContent =
'Date';

dateLabelText.title =
'Uses system date on the label';

dateLabel.append(
dateCheckbox,
dateLabelText
);

const stockLabel =
document.createElement(
'label'
);

stockLabel.className =
'barcode-csv-checkbox-label';

const stockCheckbox =
document.createElement(
'input'
);

stockCheckbox.type =
'checkbox';

stockCheckbox.className =
'barcode-csv-checkbox';

stockCheckbox.checked =
false;

const stockLabelText =
document.createElement(
'span'
);

stockLabelText.textContent =
'Stock QTY';

stockLabelText.title =
'Stock amount shown on the label (separate from Qty labels to create)';

stockLabel.append(
stockCheckbox,
stockLabelText
);

const summary =
document.createElement(
'div'
);

summary.className =
'barcode-csv-summary';

options.append(
label,
dateLabel,
stockLabel,
summary
);

const tableWrap =
document.createElement(
'div'
);

tableWrap.className =
'barcode-csv-table-wrap';

const table =
document.createElement(
'table'
);

table.className =
'barcode-csv-table';

const thead =
document.createElement(
'thead'
);

const headerRow =
document.createElement(
'tr'
);

[
'Part Number',
'Description',
'Qty',
'Stock QTY'
].forEach(
text => {

const th =
document.createElement(
'th'
);

th.textContent =
text;

headerRow.appendChild(
th
);

}
);

thead.appendChild(
headerRow
);

const tbody =
document.createElement(
'tbody'
);

const qtyInputs = [];

const stockQtyInputs = [];

rows.forEach(
row => {

const tr =
document.createElement(
'tr'
);

const partCell =
document.createElement(
'td'
);

partCell.className =
'barcode-csv-part';

partCell.textContent =
row.partNumber;

const descriptionCell =
document.createElement(
'td'
);

descriptionCell.className =
'barcode-csv-description';

descriptionCell.textContent =
row.description || '';

const qtyCell =
document.createElement(
'td'
);

const qty =
document.createElement(
'input'
);

qty.type =
'number';

qty.className =
'barcode-csv-qty';

qty.min =
'1';

qty.step =
'1';

qty.value =
String(
Math.max(
1,
parseInt(
row.qty,
10
) || 1
)
);

qtyInputs.push(
qty
);

qty.addEventListener(
'input',
function () {

let value =
parseInt(
qty.value,
10
);

if (
!Number.isFinite(value) ||
value < 1
) {

value = 1;

}

qty.value =
value;

updateCSVModalSummary(
rows,
qtyInputs
);

}
);

qtyCell.appendChild(
qty
);

const stockQtyCell =
document.createElement(
'td'
);

const stockQty =
document.createElement(
'input'
);

stockQty.type =
'number';

stockQty.className =
'barcode-csv-stockqty';

stockQty.min =
'0';

stockQty.step =
'1';

stockQty.title =
'Stock QTY shown on the label (separate from Qty labels to create)';

stockQty.value =
String(
Math.max(
0,
parseInt(
row.stockQty,
10
) || 0
)
);

stockQty.disabled =
!stockCheckbox.checked;

stockQty.addEventListener(
'input',
function () {

let value =
parseInt(
stockQty.value,
10
);

if (
!Number.isFinite(value) ||
value < 0
) {

value = 0;

}

stockQty.value =
value;

row.stockQty =
value;

}
);

stockQtyInputs.push(
stockQty
);

stockQtyCell.appendChild(
stockQty
);

tr.append(
partCell,
descriptionCell,
qtyCell,
stockQtyCell
);

tbody.appendChild(
tr
);

}
);

table.append(
thead,
tbody
);

tableWrap.appendChild(
table
);

stockCheckbox.addEventListener(
'change',
function () {

stockQtyInputs.forEach(
input => {

input.disabled =
!stockCheckbox.checked;

}
);

}
);

const footer =
document.createElement(
'div'
);

footer.className =
'barcode-csv-modal-footer';

const cancel =
document.createElement(
'button'
);

cancel.type =
'button';

cancel.className =
'barcode-csv-button';

cancel.textContent =
'Cancel';

cancel.addEventListener(
'click',
closeCSVModal
);

const importButton =
document.createElement(
'button'
);

importButton.type =
'button';

importButton.className =
'barcode-csv-button primary';

importButton.textContent =
'Import Labels';

importButton.addEventListener(
'click',
function () {

const template =
state.current ||
DEFAULTS.template;

const useDescription =
checkbox.checked;

const useDate =
dateCheckbox.checked;

const useStockQty =
stockCheckbox.checked;

let imported =
0;

rows.forEach(
(row, index) => {

let qtyValue =
parseInt(
qtyInputs[index].value,
10
);

if (
!Number.isFinite(qtyValue) ||
qtyValue < 1
) {

qtyValue = 1;

}

let stockQtyValue =
parseInt(
stockQtyInputs[index]?.value ??
row.stockQty ??
0,
10
);

if (
!Number.isFinite(stockQtyValue) ||
stockQtyValue < 0
) {

stockQtyValue = 0;

}

const description =
useDescription
? simplifyDescription(
row.description,
template
)
: '';

for (
let i = 0;
i < qtyValue;
i++
) {

const card =
cardData({
template,
partNumber:
row.partNumber,
subtext:
description,
parts:
isKeyAccounts()
? [
{
partNumber:
row.partNumber,
subtext:
description,
showBarcode:
false
}
]
: undefined,
showDate:
useDate,
date:
getSystemDate(),
showQty:
useStockQty,
manualQty:
useStockQty
? stockQtyValue
: 0
});

state.cards.push(
card
);

imported++;

}

}
);

state.current =
template;

closeCSVModal();

render();

showCSVSuccess(
imported
);

}
);

footer.append(
cancel,
importButton
);

box.append(
header,
options,
tableWrap,
footer
);

modal.appendChild(
box
);

modal.addEventListener(
'click',
function (e) {

if (e.target === modal) {
closeCSVModal();
}

}
);

document.body.appendChild(
modal
);

csvModal =
modal;

updateCSVModalSummary(
rows,
qtyInputs
);

if (qtyInputs.length) {

setTimeout(
() => qtyInputs[0].focus(),
50
);

}

}

/* ----------------------------------------
   CSV IMPORT
---------------------------------------- */

function importCSV() {

const input =
document.createElement(
'input'
);

input.type =
'file';

input.accept =
'.csv,text/csv';

input.style.position =
'fixed';

input.style.left =
'-9999px';

input.style.top =
'0';

input.style.width =
'1px';

input.style.height =
'1px';

input.style.opacity =
'0';

input.setAttribute(
'aria-hidden',
'true'
);

document.body.appendChild(
input
);

input.addEventListener(
'change',
function () {

const file =
input.files &&
input.files[0];

if (!file) {

input.remove();

return;

}

const reader =
new FileReader();

reader.onload =
function () {

try {

const rows =
parseCSV(
String(
reader.result ||
''
)
);

if (!rows.length) {

alert(
'The CSV appears to be empty.'
);

input.remove();

return;

}

const first =
rows[0];

const stockCodeKey =
Object.keys(first).find(
key =>
String(key)
.trim()
.toLowerCase() ===
'stock code'
);

if (!stockCodeKey) {

alert(
'The CSV must contain a "Stock Code" column.'
);

input.remove();

return;

}

const descriptionKey =
Object.keys(first).find(
key =>
String(key)
.trim()
.toLowerCase() ===
'description'
);

const preparedRows =
rows
.map(
row => {

/* CHANGED: imported part number now gets # */
const partNumber =
importedPartNumber(
row[stockCodeKey]
);

if (!partNumber) {
return null;
}

return {
partNumber,
description:
descriptionKey
? String(
row[descriptionKey] ??
''
).trim()
: '',
qty: 1,
stockQty: 0
};

}
)
.filter(Boolean);

if (!preparedRows.length) {

alert(
'No rows with a Stock Code were found.'
);

input.remove();

return;

}

openCSVModal(
preparedRows
);

} catch (error) {

console.error(
'[barcode] CSV import failed:',
error
);

alert(
'There was a problem reading the CSV.'
);

}

input.remove();

};

reader.onerror =
function () {

alert(
'The CSV could not be read.'
);

input.remove();

};

reader.readAsText(
file
);

},
{
once: true
}
);

input.click();

}

function setupCSVImport() {

const button =
$('.barcode-import-card-button');

if (!button) {

console.warn(
'[barcode] CSV import button not found:',
'.barcode-import-card-button'
);

return;

}

if (
button.dataset.csvReady ===
'true'
) {

return;

}

button.dataset.csvReady =
'true';

button.addEventListener(
'click',
function (e) {

e.preventDefault();
e.stopPropagation();

console.log(
'[barcode] opening CSV file picker'
);

importCSV();

}
);

console.log(
'[barcode] CSV import button connected:',
'.barcode-import-card-button'
);

}

/* ----------------------------------------
   QUICK IMPORT SETUP
---------------------------------------- */

function setupQuickImport() {

const button =
$('.barcode-quickimp-card-button');

if (!button) {

console.warn(
'[barcode] Quick Import button not found:',
'.barcode-quickimp-card-button'
);

return;

}

if (
button.dataset.quickImportReady ===
'true'
) {

return;

}

button.dataset.quickImportReady =
'true';

button.addEventListener(
'click',
function (e) {

e.preventDefault();
e.stopPropagation();

console.log(
'[barcode] opening Quick Import'
);

openQuickImportModal();

}
);

console.log(
'[barcode] Quick Import button connected:',
'.barcode-quickimp-card-button'
);

}

function setupClearAll() {

const button =
els.clear;

if (!button) {

console.warn(
'[barcode] Clear All button not found:',
'.barcode-clear-card-button'
);

return;

}

if (
button.dataset.clearReady ===
'true'
) {

return;

}

button.dataset.clearReady =
'true';

button.addEventListener(
'click',
function (e) {

e.preventDefault();
e.stopPropagation();

console.log(
'[barcode] Clear All requested'
);

clearAllCards();

}
);

console.log(
'[barcode] Clear All button connected:',
'.barcode-clear-card-button'
);

}

function init() {

cache();

if (
!els.panel ||
!els.pages
) {

setTimeout(
init,
100
);

return;

}

if (!ready) {

ready = true;

cacheSources();

injectStyles();

loadBarcodeFont();

if (els.add) {

els.add.addEventListener(
'click',
function (e) {

e.preventDefault();
e.stopPropagation();

const card =
add({
template:
state.current ||
DEFAULTS.template
});

openEdit(
card
);

}
);

}

setupCSVImport();

setupQuickImport();

setupClearAll();

setupSaveTemplate();

setupTemplateSelector();

if (els.print) {

els.print.addEventListener(
'click',
async function (e) {

e.preventDefault();
e.stopPropagation();

const printRoot =
preparePrint();

if (!printRoot) {

console.warn(
'[barcode] nothing available to print'
);

return;

}

await saveBarcodeCommit();

requestAnimationFrame(
() => {

requestAnimationFrame(
() => {

window.print();

}
);

}
);

}
);

}

const drop =
$('#barcode-drop');

if (drop) {

drop.style.cursor =
'pointer';

drop.addEventListener(
'click',
function (e) {

if (
e.target.closest(
'.db-list-dropdown-card[data-barcode-template], .db-list-dropdown-card[data-barcode-history]'
)
) {

return;

}

e.preventDefault();
e.stopPropagation();

toggleDropdown();

}
);

}

window.addEventListener(
'afterprint',
function () {

const printRoot =
document.getElementById(
'barcode-print-root'
);

if (printRoot) {
printRoot.remove();
}

}
);

}

createDropdown(
els.dropdown
);

applyRoleVisibility();

setupSaveTemplate();

setupTemplateSelector();

render();

refreshTemplateSelector();

}

document.addEventListener(
'db-tool-open',
function (e) {

if (
e.detail?.id !== 'barcodes'
) {

return;

}

init();

}
);

if (
document.readyState ===
'loading'
) {

document.addEventListener(
'DOMContentLoaded',
init,
{ once: true }
);

} else {

init();

}

window.MTWBarcodeTool = {

state,

addCard:
add,

getCard:
get,

deleteCard:
remove,

clearAllCards:
clearAllCards,

render,

openEdit,

hideEdit,

selectTemplate,

importCSV,

openQuickImport:
openQuickImportModal,

openHistory:
openHistoryPanel,

loadHistory:
loadBarcodeHistory,

diagnose

};

})();
