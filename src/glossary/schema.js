/**
 * Shared glossary entry shape for built-in and future imported courses.
 * Runtime data for OM 300 lives in `./om300Data.js`.
 *
 * @typedef {Object} GlossaryEntry
 * @property {string} id Stable key for links and `GlossaryTerm`.
 * @property {string} term Display title in the side panel.
 * @property {string} sectionId Anchor id for scroll (e.g. final-sec-ch1) or chapter marker.
 * @property {string} hover Short text for hover tooltip (maps to roadmap “shortDef”).
 * @property {string[]} detail Paragraphs for expanded panel (maps to roadmap “longDef”).
 */

export {};
